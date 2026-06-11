import { config, isLiveTradingEnabled } from "./config.js";
import { TradingEngine } from "./engine/tradingEngine.js";
import { logger } from "./engine/logger.js";

async function main() {
  logger.info("startup", "Questrade trading bot starting", {
    mode: config.trading.mode,
    liveEnabled: isLiveTradingEnabled(),
    watchlist: config.strategy.watchlist,
    interval: config.strategy.candleInterval,
    pollIntervalMs: config.strategy.pollIntervalMs,
  });

  if (config.trading.mode === "live" && !isLiveTradingEnabled()) {
    logger.warn(
      "startup",
      "TRADING_MODE=live but LIVE_TRADING_CONFIRM is not set to 'I_UNDERSTAND_THE_RISK'. " +
        "Running in PAPER mode (no real orders will be placed)."
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
