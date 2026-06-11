/**
 * Pure technical-indicator functions operating on arrays of candles.
 * Each candle is expected to look like Questrade's candle format:
 *   { start, end, open, high, low, close, volume }
 */

export function closes(candles) {
  return candles.map((c) => c.close);
}

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      // seed with SMA of the first `period` values
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[i] = seed;
      prev = seed;
    } else if (i >= period) {
      out[i] = values[i] * k + prev * (1 - k);
      prev = out[i];
    }
  }
  return out;
}

export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (i <= period) {
      gainSum += gain;
      lossSum += loss;
      if (i === period) {
        const avgGain = gainSum / period;
        const avgLoss = lossSum / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        out._avgGain = avgGain;
        out._avgLoss = avgLoss;
      }
      continue;
    }

    const prevAvgGain = out._avgGain;
    const prevAvgLoss = out._avgLoss;
    const avgGain = (prevAvgGain * (period - 1) + gain) / period;
    const avgLoss = (prevAvgLoss * (period - 1) + loss) / period;
    out._avgGain = avgGain;
    out._avgLoss = avgLoss;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  delete out._avgGain;
  delete out._avgLoss;
  return out;
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );

  // signal line = EMA of macdLine, computed only over the non-null tail
  const firstValid = macdLine.findIndex((v) => v != null);
  const signalLine = new Array(values.length).fill(null);
  if (firstValid !== -1) {
    const tail = macdLine.slice(firstValid).map((v) => v ?? 0);
    const signalEma = ema(tail, signalPeriod);
    signalEma.forEach((v, i) => {
      if (v != null) signalLine[firstValid + i] = v;
    });
  }

  const histogram = macdLine.map((v, i) =>
    v != null && signalLine[i] != null ? v - signalLine[i] : null
  );

  return { macdLine, signalLine, histogram };
}

/** Average True Range - used for volatility-based stop loss / take profit sizing. */
export function atr(candles, period = 14) {
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  // Wilder's smoothing, same shape as RSI
  const out = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      sum += trs[i];
      if (i === period - 1) out[i] = sum / period;
      continue;
    }
    out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
  }
  return out;
}

/** Session VWAP, reset at the start of the candle array (intraday data assumed). */
export function vwap(candles) {
  const out = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += typicalPrice * candles[i].volume;
    cumVol += candles[i].volume;
    out[i] = cumVol > 0 ? cumPV / cumVol : null;
  }
  return out;
}

/**
 * Simple swing-based support/resistance: looks for local highs/lows over a
 * lookback window and returns the nearest levels above and below the
 * current price.
 */
export function supportResistance(candles, window = 5) {
  const highs = [];
  const lows = [];
  for (let i = window; i < candles.length - window; i++) {
    const slice = candles.slice(i - window, i + window + 1);
    const high = candles[i].high;
    const low = candles[i].low;
    if (high === Math.max(...slice.map((c) => c.high))) highs.push(high);
    if (low === Math.min(...slice.map((c) => c.low))) lows.push(low);
  }
  const price = candles[candles.length - 1].close;
  const resistance = highs.filter((h) => h > price).sort((a, b) => a - b)[0] ?? null;
  const support = lows.filter((l) => l < price).sort((a, b) => b - a)[0] ?? null;
  return { support, resistance };
}
