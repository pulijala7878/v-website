import { config } from "../config.js";

/**
 * Returns true if `date` falls within the configured market hours
 * (Mon-Fri, MARKET_OPEN to MARKET_CLOSE) in MARKET_TIMEZONE.
 * This is a simple calendar check - it does NOT account for market
 * holidays.
 */
export function isMarketOpen(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.market.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = parts.weekday; // "Mon".."Sun"

  if (weekday === "Sat" || weekday === "Sun") return false;

  const nowMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [openH, openM] = config.market.open.split(":").map(Number);
  const [closeH, closeM] = config.market.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}
