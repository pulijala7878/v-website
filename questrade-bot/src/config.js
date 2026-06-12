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
    // "paper"  -> simulate everything, log only, no alerts sent
    // "alert"  -> send real entry/exit alerts (Telegram), reconcile against
    //             broker positions since the bot cannot place orders itself
    //             (Questrade restricts order placement to partner apps)
    mode: (process.env.TRADING_MODE || "paper").toLowerCase(),
  },

  notify: {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    // How long an entry alert can remain unconfirmed (not yet seen in broker
    // positions) before the bot gives up on it and allows a fresh signal.
    suggestionExpiryMinutes: num(process.env.SUGGESTION_EXPIRY_MINUTES, 30),
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

export function isAlertMode() {
  return config.trading.mode === "alert";
}
