import { config, isLiveTradingEnabled } from "../config.js";
import { QuestradeClient } from "../questrade/client.js";
import { generateTechnicalSignal } from "../strategy/signalEngine.js";
import { reviewSignal } from "../strategy/claudeReview.js";
import { RiskManager } from "../risk/riskManager.js";
import { PositionTracker } from "../risk/positionTracker.js";
import { logger } from "./logger.js";
import { isMarketOpen } from "./marketHours.js";
import { ExitManager } from "./exitManager.js";

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
    logger.info(
      "engine",
      `Trading mode: ${config.trading.mode.toUpperCase()}${
        config.trading.mode === "live" && !isLiveTradingEnabled()
          ? " (LIVE requested but LIVE_TRADING_CONFIRM not set - running as paper)"
          : ""
      }`
    );
  }

  async runOnce() {
    if (!isMarketOpen(new Date())) {
      logger.info("engine", "Market closed - idling");
      return;
    }

    const balances = await this.client.getBalances(this.account.number);
    const combined = balances.combinedBalances?.[0] || balances.perCurrencyBalances?.[0];
    const equity = combined?.totalEquity ?? combined?.cash ?? 0;

    const positions = await this.client.getPositions(this.account.number);

    // Manage exits for existing positions even if new entries get halted below.
    await this.exitManager.checkExits(this.account.number, positions);

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

    // Don't open a new position if we already hold one or are tracking one
    // (paper-mode trades won't show up in broker positions).
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

    await this.executeTrade(symbol, symbolId, technical, sizing);
  }

  async executeTrade(symbol, symbolId, technical, sizing) {
    const order = {
      accountId: this.account.number,
      symbolId,
      quantity: sizing.quantity,
      icebergQuantity: 0,
      limitPrice: null,
      isAllOrNone: false,
      isAnonymous: false,
      orderType: "Market",
      timeInForce: "Day",
      action: technical.action === "BUY" ? "Buy" : "Sell",
      primaryRoute: "AUTO",
      secondaryRoute: "AUTO",
      orderClass: "Primary",
      stopPrice: null,
    };

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
      stopOrderId: null,
      openedAt: new Date().toISOString(),
    };

    if (!isLiveTradingEnabled()) {
      logger.trade({ ...tradeRecord, status: "SIMULATED (paper mode)" });
      this.risk.recordTrade();
      this.tracker.add(symbol, positionRecord);
      return;
    }

    try {
      const result = await this.client.placeOrder(this.account.number, order);
      logger.trade({ ...tradeRecord, status: "SUBMITTED", orderResponse: result });
      this.risk.recordTrade();

      // Place a protective stop order at the broker as a failsafe in case
      // the bot goes offline. Take-profit exits are managed by ExitManager
      // via polling, since Questrade has no native bracket/OCO order type.
      try {
        const stopOrder = {
          accountId: this.account.number,
          symbolId,
          quantity: sizing.quantity,
          icebergQuantity: 0,
          limitPrice: null,
          isAllOrNone: false,
          isAnonymous: false,
          orderType: "Stop",
          timeInForce: "GoodTillCanceled",
          action: technical.action === "BUY" ? "Sell" : "Buy",
          primaryRoute: "AUTO",
          secondaryRoute: "AUTO",
          orderClass: "Primary",
          stopPrice: sizing.stopLoss,
        };
        const stopResult = await this.client.placeOrder(this.account.number, stopOrder);
        positionRecord.stopOrderId = stopResult.orders?.[0]?.id ?? null;
        logger.info("engine", `${symbol}: protective stop order placed`, {
          stopOrderId: positionRecord.stopOrderId,
          stopPrice: sizing.stopLoss,
        });
      } catch (err) {
        logger.error("engine", `${symbol}: failed to place protective stop order - position is UNPROTECTED`, {
          error: err.message,
        });
      }

      this.tracker.add(symbol, positionRecord);
    } catch (err) {
      logger.error("engine", `${symbol}: order placement failed`, { error: err.message });
    }
  }
}
