import { config, isAlertMode } from "./config.js";
import { TradingEngine } from "./engine/tradingEngine.js";
import { logger } from "./engine/logger.js";

async function main() {
  logger.info("startup", "Questrade trading bot starting", {
    mode: config.trading.mode,
    watchlist: config.strategy.watchlist,
    interval: config.strategy.candleInterval,
    pollIntervalMs: config.strategy.pollIntervalMs,
  });

  if (isAlertMode() && (!config.notify.telegramBotToken || !config.notify.telegramChatId)) {
    logger.warn(
      "startup",
      "TRADING_MODE=alert but TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are not set. " +
        "Alerts will only be written to the log."
    );
  }

  const engine = new TradingEngine();
  await engine.init();

  const tick = async () => {
    try {
      await engine.runOnce();
    } catch (err) {
      logger.error("startup", "Unhandled error in trading loop", { error: err.message, stack: err.stack });
    }
  };

  await tick();
  setInterval(tick, config.strategy.pollIntervalMs);
}

main().catch((err) => {
  logger.error("startup", "Fatal error", { error: err.message, stack: err.stack });
  process.exit(1);
});
