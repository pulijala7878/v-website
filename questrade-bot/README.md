# Questrade Trading Bot (Hybrid Technical + Claude Review)

An automated trading bot for **Questrade** that combines a rule-based
technical strategy with a Claude-powered secondary review before placing
any order.

## ⚠️ Read this first

- **No trading strategy can guarantee a specific win rate.** Anything
  promising 80-85% profitability is overfit, lying, or both. This bot is
  built for sound risk management (small per-trade risk, daily loss
  circuit breaker, position limits) - not a guaranteed edge.
- **Defaults to PAPER mode.** The bot will run its full analysis loop and
  log every decision it *would* have made, but will not call Questrade's
  order-placement endpoint unless you explicitly enable live trading (see
  below). Test thoroughly in paper mode and/or a Questrade **practice
  account** before going live.
- **You are responsible for all trades placed under your account.** Start
  small, monitor closely, and treat this as a tool that assists your
  trading - not a "set and forget" income machine.

## How it works

```
Questrade market data (candles)
        │
        ▼
Technical signal engine (EMA50/200, RSI, MACD, VWAP, support/resistance)
        │  candidate BUY/SELL signal
        ▼
Claude review (acts as a skeptical risk supervisor - approve/reject + size adjustment)
        │  approved signal
        ▼
Risk manager (ATR-based stop/target, position sizing, daily loss & trade-count limits)
        │
        ▼
Questrade order placement (or simulated log entry in paper mode)
        │
        ▼
Position tracker + exit manager (every loop tick: monitors open positions
against stop-loss/take-profit, places protective stop order at entry,
closes positions when targets are hit)
```

Every decision (HOLD, rejected signals, executed/simulated trades) is
logged to `data/bot.log`, and every trade decision is appended as a JSON
record to `data/trades.jsonl` for later review/backtesting.

## 1. Set up Questrade API access

1. Log in to **Questrade IQ Edge** (or the web platform).
2. Go to **Settings → API Access → App Registration** (or *Personal Apps*).
3. Register a new app and generate a **refresh token**.
   - For testing, generate the token from a Questrade **practice account**
     (login at `https://practicelogin.questrade.com`) so you can run the
     full loop, including order placement, against fake money first.
4. Copy the refresh token - it can only be used **once**. The bot will
   exchange it for an access token + a *new* refresh token automatically
   and persist the rotated token to `data/questrade_tokens.json`.

## 2. Configure

```bash
cd questrade-bot
cp .env.example .env
```

Edit `.env`:
- `QUESTRADE_REFRESH_TOKEN` - the token from step 1.
- `QUESTRADE_AUTH_URL` - use `https://practicelogin.questrade.com/oauth2/token`
  for a practice account, or `https://login.questrade.com/oauth2/token` for live.
- `ANTHROPIC_API_KEY` - required for the Claude review step (the bot
  rejects all signals if this is missing, by design - it never "fails open").
- `WATCHLIST` - comma-separated tickers to monitor.
- Risk parameters (`MAX_RISK_PER_TRADE_PCT`, `MAX_DAILY_LOSS_PCT`,
  `MAX_OPEN_POSITIONS`, `MAX_TRADES_PER_DAY`) - tune to your risk tolerance.
  The defaults are conservative (1% risk per trade, 3% daily loss limit).

## 3. Install & run (paper mode)

```bash
npm install
npm start
```

With `TRADING_MODE=paper` (the default), the bot:
- Connects to Questrade and reads your real account balance/positions
  (read-only).
- Runs the full strategy + Claude review loop on your watchlist.
- Logs what it *would* trade to `data/trades.jsonl` with `status:
  "SIMULATED (paper mode)"`.
- Never calls the order-placement endpoint.

Review `data/trades.jsonl` and `data/bot.log` over several days/weeks
before considering live trading.

## 4. Going live

Live trading requires **two** explicit settings in `.env`:

```env
TRADING_MODE=live
LIVE_TRADING_CONFIRM=I_UNDERSTAND_THE_RISK
```

If `TRADING_MODE=live` but `LIVE_TRADING_CONFIRM` isn't exactly
`I_UNDERSTAND_THE_RISK`, the bot logs a warning and runs in paper mode
anyway - this is intentional, to prevent accidental live trading from a
copied/misconfigured `.env` file.

Strongly recommended before going live:
- Run against a Questrade **practice account** with `TRADING_MODE=live`
  first, so real orders are placed but with simulated money.
- Start with a small `MAX_RISK_PER_TRADE_PCT` (e.g. 0.25-0.5%).
- Monitor the bot continuously during your first live sessions.

## Exit management (stop-loss / take-profit)

Questrade's API has no native bracket/OCO order type, so exits are managed
by the bot itself, persisted in `data/positions.json`:

- **On entry (live mode):** in addition to the market entry order, the bot
  places a real **protective Stop order** (`GoodTillCanceled`) at the
  ATR-based stop-loss price. This acts as a broker-side failsafe if the bot
  goes offline.
- **Every loop tick:** for each tracked position, the bot fetches the
  latest quote and checks it against the stop-loss and take-profit levels
  *before* evaluating any new entries (so exits are managed even if the
  daily loss circuit breaker has halted new trades).
  - If **take-profit** is hit: cancels the protective stop order and sends
    a market order to close the position.
  - If **stop-loss** is hit (e.g. a gap past the stop price): closes the
    position the same way.
  - If a tracked position **disappears from the broker's position list**
    (the protective stop order itself filled), it's reconciled and removed
    from tracking automatically.
- **Paper mode:** the same logic runs against simulated positions, logging
  `EXIT` records to `data/trades.jsonl` with `status: "SIMULATED (paper mode)"`.

Because exits are polling-based (`POLL_INTERVAL_MS`), take-profit exits can
experience slippage between the target price and the actual fill price -
shorter poll intervals reduce this. The protective stop order, however, is
a real resting order at the broker and isn't subject to polling delay.

## Notes / limitations

- The market-hours check is calendar-based only (Mon-Fri, configured
  hours) and does not account for market holidays.
- Questrade access tokens expire roughly every 30 minutes and refresh
  tokens are single-use; `src/questrade/auth.js` handles this
  automatically and persists rotated tokens to `data/`.
