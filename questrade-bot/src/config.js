import "dotenv/config";

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  questrade: {
    refreshToken: process.env.QUESTRADE_REFRESH_TOKEN || "",
    authUrl: process.env.QUESTRADE_AUTH_URL || "https://login.questrade.com/oauth2/token",
    accountNumber: process.env.QUESTRADE_ACCOUNT_NUMBER || "",
  },

  trading: {
    mode: (process.env.TRADING_MODE || "paper").toLowerCase(), // "paper" | "live"
    liveConfirm: process.env.LIVE_TRADING_CONFIRM || "",
  },

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
  },

  strategy: {
    watchlist: (process.env.WATCHLIST || "AAPL,MSFT,TSLA")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    candleInterval: process.env.CANDLE_INTERVAL || "FifteenMinutes",
    lookbackCandles: num(process.env.LOOKBACK_CANDLES, 200),
    pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 60000),
  },

  risk: {
    maxRiskPerTradePct: num(process.env.MAX_RISK_PER_TRADE_PCT, 1),
    maxDailyLossPct: num(process.env.MAX_DAILY_LOSS_PCT, 3),
    maxOpenPositions: num(process.env.MAX_OPEN_POSITIONS, 3),
    maxTradesPerDay: num(process.env.MAX_TRADES_PER_DAY, 6),
    atrStopMultiplier: num(process.env.ATR_STOP_MULTIPLIER, 1.5),
    atrTargetMultiplier: num(process.env.ATR_TARGET_MULTIPLIER, 3),
  },

  market: {
    timezone: process.env.MARKET_TIMEZONE || "America/New_York",
    open: process.env.MARKET_OPEN || "09:30",
    close: process.env.MARKET_CLOSE || "16:00",
  },
};

export function isLiveTradingEnabled() {
  return (
    config.trading.mode === "live" &&
    config.trading.liveConfirm === "I_UNDERSTAND_THE_RISK"
  );
}
