import { isLiveTradingEnabled } from "../config.js";
import { logger } from "./logger.js";

/**
 * Manages exits for positions opened by the bot.
 *
 * Questrade's API has no native bracket/OCO order type, so exits are
 * "synthetically" managed:
 *  - On entry (live mode), a real protective Stop order is placed at the
 *    broker as a failsafe in case the bot goes offline.
 *  - On every loop tick, tracked positions are checked against both the
 *    stop-loss and take-profit levels using the latest quote. If either
 *    level is reached, the position is closed with a market order and the
 *    protective stop order (if any) is cancelled.
 *  - If a tracked position disappears from the broker's position list
 *    (e.g. the protective stop order itself filled), it's reconciled and
 *    removed from tracking.
 */
export class ExitManager {
  constructor(client, tracker) {
    this.client = client;
    this.tracker = tracker;
  }

  async checkExits(accountNumber, brokerPositions) {
    const brokerSymbols = new Set(brokerPositions.map((p) => p.symbol));

    for (const tracked of this.tracker.list()) {
      const { symbol } = tracked;

      if (isLiveTradingEnabled() && !brokerSymbols.has(symbol)) {
        logger.trade({
          action: "EXIT",
          symbol,
          reason: "CLOSED_EXTERNALLY",
          status: "Position no longer held - protective stop likely filled",
          entryPrice: tracked.entryPrice,
          quantity: tracked.quantity,
        });
        this.tracker.remove(symbol);
        continue;
      }

      let price;
      try {
        const quote = await this.client.getQuote(tracked.symbolId);
        price = quote?.lastTradePrice ?? quote?.lastTradePriceTrHrs ?? null;
      } catch (err) {
        logger.error("exitManager", `${symbol}: failed to fetch quote for exit check`, { error: err.message });
        continue;
      }
      if (price == null) continue;

      const isLong = tracked.action === "BUY";
      const hitTakeProfit = isLong ? price >= tracked.takeProfit : price <= tracked.takeProfit;
      const hitStopLoss = isLong ? price <= tracked.stopLoss : price >= tracked.stopLoss;

      if (hitTakeProfit || hitStopLoss) {
        await this.closePosition(accountNumber, tracked, {
          reason: hitTakeProfit ? "TAKE_PROFIT" : "STOP_LOSS",
          exitPrice: price,
        });
      }
    }
  }

  async closePosition(accountNumber, tracked, { reason, exitPrice }) {
    const closingAction = tracked.action === "BUY" ? "Sell" : "Buy";

    if (!isLiveTradingEnabled()) {
      logger.trade({
        action: "EXIT",
        symbol: tracked.symbol,
        reason,
        exitPrice,
        entryPrice: tracked.entryPrice,
        quantity: tracked.quantity,
        status: "SIMULATED (paper mode)",
      });
      this.tracker.remove(tracked.symbol);
      return;
    }

    try {
      if (tracked.stopOrderId) {
        await this.client.cancelOrder(accountNumber, tracked.stopOrderId).catch((err) => {
          logger.warn("exitManager", `${tracked.symbol}: failed to cancel protective stop order ${tracked.stopOrderId}`, {
            error: err.message,
          });
        });
      }

      const order = {
        accountId: accountNumber,
        symbolId: tracked.symbolId,
        quantity: tracked.quantity,
        icebergQuantity: 0,
        limitPrice: null,
        isAllOrNone: false,
        isAnonymous: false,
        orderType: "Market",
        timeInForce: "Day",
        action: closingAction,
        primaryRoute: "AUTO",
        secondaryRoute: "AUTO",
        orderClass: "Primary",
        stopPrice: null,
      };

      const result = await this.client.placeOrder(accountNumber, order);
      logger.trade({
        action: "EXIT",
        symbol: tracked.symbol,
        reason,
        exitPrice,
        entryPrice: tracked.entryPrice,
        quantity: tracked.quantity,
        status: "SUBMITTED",
        orderResponse: result,
      });
      this.tracker.remove(tracked.symbol);
    } catch (err) {
      logger.error("exitManager", `${tracked.symbol}: failed to close position`, { error: err.message });
    }
  }
}
