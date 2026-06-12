import { config, isAlertMode } from "../config.js";
import { QuestradeClient } from "../questrade/client.js";
import { generateTechnicalSignal } from "../strategy/signalEngine.js";
import { reviewSignal } from "../strategy/claudeReview.js";
import { RiskManager } from "../risk/riskManager.js";
import { PositionTracker } from "../risk/positionTracker.js";
import { logger } from "./logger.js";
import { isMarketOpen } from "./marketHours.js";
import { ExitManager } from "./exitManager.js";
import { sendAlert, formatEntryAlert } from "../notify/notifier.js";

const INTERVAL_MS_LOOKUP = {
  OneMinute: 60_000,
  TwoMinutes: 120_000,
  ThreeMinutes: 180_000,
  FourMinutes: 240_000,
  FiveMinutes: 300_000,
  TenMinutes: 600_000,
  FifteenMinutes: 900_000,
  TwentyMinutes: 1_200_000,
  HalfHour: 1_800_000,
  OneHour: 3_600_000,
};

export class TradingEngine {
  constructor() {
    this.client = new QuestradeClient();
    this.risk = new RiskManager();
    this.tracker = new PositionTracker();
    this.exitManager = new ExitManager(this.client, this.tracker);
    this.account = null;
  }

  async init() {
    this.account = await this.client.getActiveAccount(config.questrade.accountNumber || undefined);
    logger.info("engine", `Using Questrade account ${this.account.number} (${this.account.type})`);
    logger.info("engine", `Trading mode: ${config.trading.mode.toUpperCase()}`);
  }

  async runOnce() {
    if (!isMarketOpen(new Date())) {
      logger.info("engine", "Market closed - idling");
      return;
    }

    const balances = await this.client.getBalances(this.account.number);
    const combined = balances.combinedBalances?.[0] || balances.perCurrencyBalances?.[0];
    const equity = combined?.totalEquity ?? combined?.cash ?? 0;

    if (!(equity > 0)) {
      logger.warn("engine", "Account equity is 0 or unavailable - skipping this cycle", { balances });
      return;
    }

    const positions = await this.client.getPositions(this.account.number);

    // Reconcile suggested entries/exits against the trader's actual broker
    // positions before managing exits or evaluating new signals.
    this.reconcileTracker(positions);

    // Manage exits for existing positions even if new entries get halted below.
    await this.exitManager.checkExits();

    const breaker = this.risk.checkCircuitBreakers(equity);
    if (breaker.halted) {
      logger.warn("engine", `New entries halted: ${breaker.reason}`);
      return;
    }

    for (const symbol of config.strategy.watchlist) {
      try {
        await this.evaluateSymbol(symbol, { equity, positions });
      } catch (err) {
        logger.error("engine", `Error evaluating ${symbol}`, { error: err.message });
      }
    }
  }

  /**
   * Confirms SUGGESTED entries / EXIT_SUGGESTED exits against the broker's
   * actual position list, since the bot can't place orders itself - the
   * trader acts on alerts manually.
   */
  reconcileTracker(brokerPositions) {
    const brokerSymbols = new Map(brokerPositions.map((p) => [p.symbol, p]));
    const expiryMs = config.notify.suggestionExpiryMinutes * 60_000;

    for (const tracked of this.tracker.list()) {
      const broker = brokerSymbols.get(tracked.symbol);

      if (tracked.status === "SUGGESTED") {
        if (broker) {
          this.tracker.update(tracked.symbol, {
            status: "OPEN",
            entryPrice: broker.averageEntryPrice ?? tracked.entryPrice,
            quantity: broker.openQuantity ?? tracked.quantity,
          });
          logger.info("engine", `${tracked.symbol}: entry confirmed from broker positions`);
        } else if (Date.now() - new Date(tracked.suggestedAt).getTime() > expiryMs) {
          logger.info("engine", `${tracked.symbol}: entry suggestion expired unconfirmed, removing`);
          this.tracker.remove(tracked.symbol);
        }
        continue;
      }

      if (tracked.status === "EXIT_SUGGESTED" && !broker) {
        logger.trade({
          action: "EXIT_CONFIRMED",
          symbol: tracked.symbol,
          reason: tracked.exitReason,
          entryPrice: tracked.entryPrice,
          quantity: tracked.quantity,
        });
        this.tracker.remove(tracked.symbol);
      }
    }
  }

  async evaluateSymbol(symbol, { equity, positions }) {
    const symbolId = await this.client.getSymbolId(symbol);

    const intervalMs = INTERVAL_MS_LOOKUP[config.strategy.candleInterval] ?? 900_000;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - intervalMs * config.strategy.lookbackCandles);
    const candles = await this.client.getCandles(symbolId, startTime, endTime, config.strategy.candleInterval);

    if (candles.length < 60) {
      logger.warn("engine", `${symbol}: insufficient candle data (${candles.length})`);
      return;
    }

    const technical = generateTechnicalSignal(candles);

    if (technical.action === "HOLD") {
      logger.info("engine", `${symbol}: HOLD`, { score: technical.score, reasons: technical.reasons });
      return;
    }

    const existingPosition = positions.find((p) => p.symbol === symbol);

    // Don't suggest a new entry if we already hold one or have a pending
    // suggestion for this symbol.
    if (existingPosition || this.tracker.has(symbol)) {
      logger.info("engine", `${symbol}: already have a position, skipping new entry`, {
        openQty: existingPosition?.openQuantity,
      });
      return;
    }

    const openCount = new Set([...positions.map((p) => p.symbol), ...this.tracker.list().map((p) => p.symbol)]).size;
    if (!this.risk.canOpenNewPosition(openCount)) {
      logger.info("engine", `${symbol}: max open positions reached, skipping`);
      return;
    }

    logger.info("engine", `${symbol}: candidate ${technical.action} signal`, {
      score: technical.score,
      confidence: technical.confidence,
      reasons: technical.reasons,
    });

    const review = await reviewSignal({
      symbol,
      technicalSignal: technical,
      account: { equity },
      openPositions: positions,
    });

    logger.info("engine", `${symbol}: Claude review`, review);

    if (!review.approved) {
      return;
    }

    const sizing = this.risk.sizePosition({
      action: technical.action,
      price: technical.indicators.price,
      atr: technical.indicators.atr,
      equity,
      sizeAdjustment: review.sizeAdjustment,
    });

    if (sizing.quantity <= 0) {
      logger.info("engine", `${symbol}: position size computed to 0, skipping`, sizing);
      return;
    }

    await this.suggestEntry(symbol, symbolId, technical, sizing, review);
  }

  /**
   * Records a candidate entry. In "alert" mode, sends a notification for the
   * trader to act on manually (the bot cannot place orders on Questrade).
   * In "paper" mode, simulates the entry as immediately filled.
   */
  async suggestEntry(symbol, symbolId, technical, sizing, review) {
    const tradeRecord = {
      action: technical.action,
      symbol,
      quantity: sizing.quantity,
      price: technical.indicators.price,
      stopLoss: sizing.stopLoss,
      takeProfit: sizing.takeProfit,
      reasons: technical.reasons,
      mode: config.trading.mode,
    };

    const positionRecord = {
      symbolId,
      action: technical.action,
      entryPrice: technical.indicators.price,
      quantity: sizing.quantity,
      stopLoss: sizing.stopLoss,
      takeProfit: sizing.takeProfit,
      openedAt: new Date().toISOString(),
    };

    if (isAlertMode()) {
      await sendAlert(formatEntryAlert({ symbol, technical, sizing, review }));
      logger.trade({ ...tradeRecord, status: "ALERT_SENT" });
      this.tracker.add(symbol, { ...positionRecord, status: "SUGGESTED", suggestedAt: new Date().toISOString() });
    } else {
      logger.trade({ ...tradeRecord, status: "SIMULATED (paper mode)" });
      this.tracker.add(symbol, { ...positionRecord, status: "OPEN" });
    }

    this.risk.recordTrade();
  }
}
