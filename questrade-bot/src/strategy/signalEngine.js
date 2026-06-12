import { closes, ema, rsi, macd, atr, vwap, supportResistance } from "./indicators.js";

/**
 * Rule-based technical signal generator.
 *
 * Combines trend (EMA50/EMA200), momentum (RSI, MACD), and mean-reversion
 * context (VWAP, support/resistance) into a single directional signal with
 * a confidence score and human-readable reasons. This is the "first pass"
 * filter - candidate signals are then sent to Claude for a secondary review
 * before any order is placed.
 */
export function generateTechnicalSignal(candles) {
  if (candles.length < 60) {
    return { action: "HOLD", confidence: 0, reasons: ["Not enough candle history"], indicators: null };
  }

  const c = closes(candles);
  const ema50 = ema(c, 50);
  const ema200 = ema(c, Math.min(200, c.length - 1));
  const rsiSeries = rsi(c, 14);
  const { macdLine, signalLine, histogram } = macd(c);
  const atrSeries = atr(candles, 14);
  const vwapSeries = vwap(candles);
  const { support, resistance } = supportResistance(candles);

  const i = c.length - 1;
  const price = c[i];
  const reasons = [];
  let score = 0;

  // --- Trend: EMA50 vs EMA200 ---
  if (ema50[i] != null && ema200[i] != null) {
    if (ema50[i] > ema200[i]) {
      score += 1;
      reasons.push("EMA50 above EMA200 (uptrend)");
    } else {
      score -= 1;
      reasons.push("EMA50 below EMA200 (downtrend)");
    }
  }

  // --- Momentum: RSI ---
  const rsiVal = rsiSeries[i];
  if (rsiVal != null) {
    if (rsiVal < 30) {
      score += 1;
      reasons.push(`RSI ${rsiVal.toFixed(1)} oversold`);
    } else if (rsiVal > 70) {
      score -= 1;
      reasons.push(`RSI ${rsiVal.toFixed(1)} overbought`);
    } else if (rsiVal > 50) {
      score += 0.5;
      reasons.push(`RSI ${rsiVal.toFixed(1)} bullish bias`);
    } else {
      score -= 0.5;
      reasons.push(`RSI ${rsiVal.toFixed(1)} bearish bias`);
    }
  }

  // --- Momentum: MACD crossover ---
  if (histogram[i] != null && histogram[i - 1] != null) {
    if (histogram[i - 1] <= 0 && histogram[i] > 0) {
      score += 1.5;
      reasons.push("MACD bullish crossover");
    } else if (histogram[i - 1] >= 0 && histogram[i] < 0) {
      score -= 1.5;
      reasons.push("MACD bearish crossover");
    } else if (histogram[i] > 0) {
      score += 0.5;
      reasons.push("MACD histogram positive");
    } else {
      score -= 0.5;
      reasons.push("MACD histogram negative");
    }
  }

  // --- VWAP context ---
  if (vwapSeries[i] != null) {
    if (price > vwapSeries[i]) {
      score += 0.5;
      reasons.push("Price above VWAP");
    } else {
      score -= 0.5;
      reasons.push("Price below VWAP");
    }
  }

  // --- Support/Resistance proximity ---
  if (resistance != null && (resistance - price) / price < 0.003) {
    score -= 0.5;
    reasons.push(`Near resistance ${resistance.toFixed(2)}`);
  }
  if (support != null && (price - support) / price < 0.003) {
    score += 0.5;
    reasons.push(`Near support ${support.toFixed(2)}`);
  }

  // Map score to action. Threshold chosen to require multi-factor agreement.
  let action = "HOLD";
  if (score >= 2.5) action = "BUY";
  else if (score <= -2.5) action = "SELL";

  // Confidence normalized to 0-1 based on max possible score (~5.5)
  const confidence = Math.min(1, Math.abs(score) / 5.5);

  return {
    action,
    confidence,
    score,
    reasons,
    indicators: {
      price,
      ema50: ema50[i],
      ema200: ema200[i],
      rsi: rsiVal,
      macd: macdLine[i],
      macdSignal: signalLine[i],
      macdHistogram: histogram[i],
      atr: atrSeries[i],
      vwap: vwapSeries[i],
      support,
      resistance,
    },
  };
}
