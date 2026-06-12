import { config } from "../config.js";
import { logger } from "../engine/logger.js";

/**
 * Sends a trade alert to the configured channel(s). Always logged locally;
 * additionally pushed to Telegram if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
 * are configured.
 *
 * This bot cannot place orders on Questrade (order placement is restricted
 * to partner apps), so in "alert" mode this is the actual notification the
 * trader acts on - it must arrive promptly and reliably.
 */
export async function sendAlert(message) {
  logger.info("alert", message.replace(/\n/g, " | "));

  if (!config.notify.telegramBotToken || !config.notify.telegramChatId) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${config.notify.telegramBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.notify.telegramChatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("alert", "Failed to send Telegram alert", { status: res.status, body });
    }
  } catch (err) {
    logger.error("alert", "Failed to send Telegram alert", { error: err.message });
  }
}

export function formatEntryAlert({ symbol, technical, sizing, review }) {
  const direction = technical.action === "BUY" ? "🟢 BUY" : "🔴 SELL";
  return [
    `*${direction} ${symbol}*`,
    `Qty: ${sizing.quantity} @ ~$${technical.indicators.price.toFixed(2)}`,
    `Stop loss: $${sizing.stopLoss}  |  Take profit: $${sizing.takeProfit}`,
    `Technical score: ${technical.score?.toFixed(2)} (confidence ${(technical.confidence * 100).toFixed(0)}%)`,
    `Reasons: ${technical.reasons.join("; ")}`,
    `Claude review (size ${review.sizeAdjustment}x): ${review.reasoning}`,
    ``,
    `Place this trade manually in Questrade/TradingView if you agree. The bot will track it once it appears in your account positions.`,
  ].join("\n");
}

export function formatExitAlert({ symbol, action, entryPrice, quantity, stopLoss, takeProfit }, reason, exitPrice) {
  const direction = action === "BUY" ? "Sell (close long)" : "Buy (close short)";
  return [
    `*⚠️ EXIT ${symbol} - ${reason}*`,
    `${direction} ${quantity} shares`,
    `Entry: $${entryPrice}  |  Current: $${exitPrice.toFixed(2)}`,
    `Stop loss: $${stopLoss}  |  Take profit: $${takeProfit}`,
    ``,
    `Close this position manually in Questrade/TradingView. The bot will stop tracking it once it disappears from your account positions.`,
  ].join("\n");
}
