import { isAlertMode } from "../config.js";
import { logger } from "./logger.js";
import { sendAlert, formatExitAlert } from "../notify/notifier.js";

/**
 * Manages exits for positions the bot is tracking.
 *
 * The bot cannot place orders on Questrade (order placement is restricted
 * to partner apps), so exits are "synthetic": on every loop tick, OPEN
 * positions are checked against their stop-loss/take-profit using the
 * latest quote. If either level is reached:
 *  - "alert" mode: sends an exit alert and marks the position
 *    EXIT_SUGGESTED. TradingEngine.reconcileTracker removes it once it
 *    disappears from the broker's actual positions (i.e. the trader acted
 *    on the alert).
 *  - "paper" mode: logs a simulated exit and removes it immediately.
 */
export class ExitManager {
  constructor(client, tracker) {
    this.client = client;
    this.tracker = tracker;
  }

  async checkExits() {
    for (const tracked of this.tracker.list()) {
      if (tracked.status !== "OPEN") continue;

      let price;
      try {
        const quote = await this.client.getQuote(tracked.symbolId);
        price = quote?.lastTradePrice ?? quote?.lastTradePriceTrHrs ?? null;
      } catch (err) {
        logger.error("exitManager", `${tracked.symbol}: failed to fetch quote for exit check`, { error: err.message });
        continue;
      }
      if (!price) continue; // null, undefined, or 0 (bad/missing quote)

      const isLong = tracked.action === "BUY";
      const hitTakeProfit = isLong ? price >= tracked.takeProfit : price <= tracked.takeProfit;
      const hitStopLoss = isLong ? price <= tracked.stopLoss : price >= tracked.stopLoss;

      if (hitTakeProfit || hitStopLoss) {
        await this.closePosition(tracked, {
          reason: hitTakeProfit ? "TAKE_PROFIT" : "STOP_LOSS",
          exitPrice: price,
        });
      }
    }
  }

  async closePosition(tracked, { reason, exitPrice }) {
    const baseRecord = {
      action: "EXIT",
      symbol: tracked.symbol,
      reason,
      exitPrice,
      entryPrice: tracked.entryPrice,
      quantity: tracked.quantity,
    };

    if (!isAlertMode()) {
      logger.trade({ ...baseRecord, status: "SIMULATED (paper mode)" });
      this.tracker.remove(tracked.symbol);
      return;
    }

    await sendAlert(formatExitAlert(tracked, reason, exitPrice));
    logger.trade({ ...baseRecord, status: "ALERT_SENT" });
    this.tracker.update(tracked.symbol, {
      status: "EXIT_SUGGESTED",
      exitReason: reason,
      exitAlertAt: new Date().toISOString(),
    });
  }
}
