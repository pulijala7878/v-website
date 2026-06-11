import { QuestradeAuth } from "./auth.js";
import { logger } from "../engine/logger.js";

/**
 * Thin wrapper around the Questrade REST API.
 * Docs: https://www.questrade.com/api/documentation
 */
export class QuestradeClient {
  constructor() {
    this.auth = new QuestradeAuth();
    this._symbolIdCache = new Map();
  }

  async _request(pathSuffix, { method = "GET", body } = {}) {
    const { accessToken, apiServer } = await this.auth.getAccessToken();
    const url = `${apiServer}${pathSuffix}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Questrade API ${method} ${pathSuffix} failed (${res.status}): ${errBody}`);
    }
    return res.json();
  }

  async getAccounts() {
    const data = await this._request("v1/accounts");
    return data.accounts || [];
  }

  /** Resolve which account to trade based on config, defaulting to the first active account. */
  async getActiveAccount(preferredNumber) {
    const accounts = await this.getAccounts();
    if (preferredNumber) {
      const match = accounts.find((a) => a.number === preferredNumber);
      if (match) return match;
      throw new Error(`Account ${preferredNumber} not found among Questrade accounts`);
    }
    const active = accounts.find((a) => a.status === "Active") || accounts[0];
    if (!active) throw new Error("No Questrade accounts available");
    return active;
  }

  async getBalances(accountNumber) {
    return this._request(`v1/accounts/${accountNumber}/balances`);
  }

  async getPositions(accountNumber) {
    const data = await this._request(`v1/accounts/${accountNumber}/positions`);
    return data.positions || [];
  }

  async getOrders(accountNumber, stateFilter = "Open") {
    const data = await this._request(`v1/accounts/${accountNumber}/orders?stateFilter=${stateFilter}`);
    return data.orders || [];
  }

  /** Resolve a ticker symbol (e.g. "AAPL") to Questrade's internal numeric symbolId. */
  async getSymbolId(ticker) {
    if (this._symbolIdCache.has(ticker)) return this._symbolIdCache.get(ticker);

    const data = await this._request(`v1/symbols/search?prefix=${encodeURIComponent(ticker)}`);
    const match = (data.symbols || []).find((s) => s.symbol === ticker) || (data.symbols || [])[0];
    if (!match) throw new Error(`Symbol not found: ${ticker}`);

    this._symbolIdCache.set(ticker, match.symbolId);
    return match.symbolId;
  }

  async getQuote(symbolId) {
    const data = await this._request(`v1/markets/quotes/${symbolId}`);
    return (data.quotes || [])[0];
  }

  /**
   * Fetch historical candles.
   * interval: one of OneMinute, TwoMinutes, ThreeMinutes, FourMinutes, FiveMinutes,
   *           TenMinutes, FifteenMinutes, TwentyMinutes, HalfHour, OneHour, TwoHours,
   *           FourHours, OneDay, OneWeek, OneMonth, OneYear
   */
  async getCandles(symbolId, startTime, endTime, interval) {
    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      interval,
    });
    const data = await this._request(`v1/markets/candles/${symbolId}?${params.toString()}`);
    return data.candles || [];
  }

  /**
   * Place an order. Caller is responsible for building a valid Questrade
   * order object (accountId, symbolId, quantity, action, orderType, timeInForce, ...).
   */
  async placeOrder(accountNumber, order) {
    logger.info("questrade", "Placing order", order);
    return this._request(`v1/accounts/${accountNumber}/orders`, {
      method: "POST",
      body: order,
    });
  }
}
