import { config } from "../config.js";
import { logger } from "../engine/logger.js";

/**
 * Tracks daily P&L and trade counts to enforce circuit breakers, and
 * computes position sizes based on ATR-derived stop distance.
 *
 * State is in-memory and resets when `startOfDayEquity` is set for a new
 * trading day (call `resetDay` at the start of each session).
 */
export class RiskManager {
  constructor() {
    this.startOfDayEquity = null;
    this.tradesToday = 0;
    this.day = null;
  }

  resetDayIfNeeded(now = new Date()) {
    const dayKey = now.toISOString().slice(0, 10);
    if (this.day !== dayKey) {
      this.day = dayKey;
      this.tradesToday = 0;
      this.startOfDayEquity = null; // set on first call to checkCircuitBreakers
      logger.info("risk", `New trading day ${dayKey} - daily counters reset`);
    }
  }

  /**
   * Returns { halted: boolean, reason?: string }.
   * Call this before evaluating any new signal.
   */
  checkCircuitBreakers(currentEquity) {
    this.resetDayIfNeeded();

    if (this.startOfDayEquity == null) {
      this.startOfDayEquity = currentEquity;
    }

    const dailyPnlPct = ((currentEquity - this.startOfDayEquity) / this.startOfDayEquity) * 100;

    if (dailyPnlPct <= -config.risk.maxDailyLossPct) {
      return {
        halted: true,
        reason: `Daily loss limit hit (${dailyPnlPct.toFixed(2)}% <= -${config.risk.maxDailyLossPct}%)`,
      };
    }

    if (this.tradesToday >= config.risk.maxTradesPerDay) {
      return {
        halted: true,
        reason: `Max trades per day reached (${this.tradesToday}/${config.risk.maxTradesPerDay})`,
      };
    }

    return { halted: false };
  }

  canOpenNewPosition(openPositionsCount) {
    return openPositionsCount < config.risk.maxOpenPositions;
  }

  recordTrade() {
    this.tradesToday += 1;
  }

  /**
   * Computes stop loss, take profit, and share quantity for a trade based on
   * ATR volatility and the configured per-trade risk percentage.
   *
   * @returns {{ quantity: number, stopLoss: number, takeProfit: number, riskAmount: number }}
   */
  sizePosition({ action, price, atr, equity, sizeAdjustment = 1 }) {
    if (!atr || atr <= 0) {
      return { quantity: 0, stopLoss: null, takeProfit: null, riskAmount: 0 };
    }

    const stopDistance = atr * config.risk.atrStopMultiplier;
    const targetDistance = atr * config.risk.atrTargetMultiplier;

    const stopLoss = action === "BUY" ? price - stopDistance : price + stopDistance;
    const takeProfit = action === "BUY" ? price + targetDistance : price - targetDistance;

    const riskAmount = equity * (config.risk.maxRiskPerTradePct / 100) * sizeAdjustment;
    const rawQuantity = riskAmount / stopDistance;
    const quantity = Math.max(0, Math.floor(rawQuantity));

    return {
      quantity,
      stopLoss: Number(stopLoss.toFixed(2)),
      takeProfit: Number(takeProfit.toFixed(2)),
      riskAmount,
    };
  }
}
