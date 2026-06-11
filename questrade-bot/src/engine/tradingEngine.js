import { config, isLiveTradingEnabled } from "../config.js";
import { QuestradeClient } from "../questrade/client.js";
import { generateTechnicalSignal } from "../strategy/signalEngine.js";
import { reviewSignal } from "../strategy/claudeReview.js";
import { RiskManager } from "../risk/riskManager.js";
import { logger } from "./logger.js";
import { isMarketOpen } from "./marketHours.js";

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

    const breaker = this.risk.checkCircuitBreakers(equity);
    if (breaker.halted) {
      logger.warn("engine", `Trading halted: ${breaker.reason}`);
      return;
    }

    const positions = await this.client.getPositions(this.account.number);

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

    // Don't open a new position in the same direction we're already in.
    if (existingPosition) {
      logger.info("engine", `${symbol}: already have a position, skipping new entry`, {
        openQty: existingPosition.openQuantity,
      });
      return;
    }

    if (!this.risk.canOpenNewPosition(positions.length)) {
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

    if (!isLiveTradingEnabled()) {
      logger.trade({ ...tradeRecord, status: "SIMULATED (paper mode)" });
      this.risk.recordTrade();
      return;
    }

    try {
      const result = await this.client.placeOrder(this.account.number, order);
      logger.trade({ ...tradeRecord, status: "SUBMITTED", orderResponse: result });
      this.risk.recordTrade();
      // NOTE: stop loss / take profit are not bracket orders here - they are
      // tracked targets the engine should monitor and act on in subsequent
      // loop iterations (e.g. by placing a closing order when price crosses
      // sizing.stopLoss / sizing.takeProfit).
    } catch (err) {
      logger.error("engine", `${symbol}: order placement failed`, { error: err.message });
    }
  }
}
