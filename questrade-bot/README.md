# Questrade Trading Bot (Hybrid Technical + Claude Review)

A semi-automated trading assistant for **Questrade** that combines a
rule-based technical strategy with a Claude-powered secondary review, then
alerts you to act on the trade manually.

## ⚠️ Read this first

- **No trading strategy can guarantee a specific win rate.** Anything
  promising 80-85% profitability is overfit, lying, or both. This bot is
  built for sound risk management (small per-trade risk, daily loss
  circuit breaker, position limits) - not a guaranteed edge.
- **This bot cannot place orders on Questrade.** Questrade's API restricts
  order placement to Partner Developer apps - personal apps are read-only
  (account balances, positions, quotes, candles). This bot analyzes the
  market, runs the Claude review and risk sizing, and then sends you an
  alert telling you exactly what to trade. You place the order yourself in
  Questrade/IQ Edge/TradingView.
- **Defaults to PAPER mode.** The bot runs its full analysis loop and logs
  every decision it *would* have made, without sending any alerts. Test
  thoroughly in paper mode before switching to alert mode.
- **You are responsible for all trades placed under your account.** Start
  small, monitor closely, and treat this as a tool that assists your
  trading - not a "set and forget" income machine.

## How it works

```
Questrade market data (candles, read-only)
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
Alert sent (Telegram + log) - "alert" mode, or simulated fill logged - "paper" mode
        │
        ▼
Position tracker + exit manager (every loop tick: monitors tracked positions
against stop-loss/take-profit using live quotes, sends an exit alert when a
level is hit)
        │
        ▼
Reconciliation against your real Questrade positions (confirms whether you
acted on an entry/exit alert, and stops tracking once you have)
```

Every decision (HOLD, rejected signals, alerts sent, simulated trades) is
logged to `data/bot.log`, and every trade decision is appended as a JSON
record to `data/trades.jsonl` for later review/backtesting.

## 1. Set up Questrade API access

1. Log in to **Questrade IQ Edge** (or the web platform).
2. Go to **Settings → API Access → App Registration** (or *Personal Apps*).
3. Register a new app and generate a **refresh token**.
   - For testing, generate the token from a Questrade **practice account**
     (login at `https://practicelogin.questrade.com`) so you can run the
     full loop against fake balances/positions first.
4. Copy the refresh token - it can only be used **once**. The bot will
   exchange it for an access token + a *new* refresh token automatically
   and persist the rotated token to `data/questrade_tokens.json`.

## 2. (Optional) Set up Telegram alerts

Alert mode sends entry/exit alerts via Telegram so you can act on them from
your phone:

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`,
   and copy the bot token it gives you.
2. Send any message to your new bot.
3. Open `https://api.telegram.org/bot<your-token>/getUpdates` in a browser
   and find your `chat.id` in the JSON response.
4. Put both values in `.env` as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

If these aren't configured, alerts are still written to `data/bot.log`, just
not pushed to Telegram.

## 3. Configure

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
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` - from step 2, if using alert mode.
- `SUGGESTION_EXPIRY_MINUTES` - how long an entry alert can go unconfirmed
  (not yet appearing in your broker positions) before the bot drops it and
  allows a fresh signal for that symbol.
- Risk parameters (`MAX_RISK_PER_TRADE_PCT`, `MAX_DAILY_LOSS_PCT`,
  `MAX_OPEN_POSITIONS`, `MAX_TRADES_PER_DAY`) - tune to your risk tolerance.
  The defaults are conservative (1% risk per trade, 3% daily loss limit).

## 4. Install & run (paper mode)

```bash
npm install
npm start
```

With `TRADING_MODE=paper` (the default), the bot:
- Connects to Questrade and reads your real account balance/positions
  (read-only).
- Runs the full strategy + Claude review loop on your watchlist.
- Logs what it *would* trade to `data/trades.jsonl` with `status:
  "SIMULATED (paper mode)"` and simulates the position as immediately
  filled for exit tracking.
- Never sends any alerts.

Review `data/trades.jsonl` and `data/bot.log` over several days/weeks
before switching to alert mode.

## 5. Alert mode

Set:

```env
TRADING_MODE=alert
```

In this mode:
- When the strategy + Claude review approve a trade, the bot sends an
  alert (Telegram + log) with the symbol, side, quantity, entry price,
  stop-loss, take-profit, and the reasoning behind the trade.
- **You place the trade manually** in Questrade, IQ Edge, or TradingView.
- On the next loop tick, the bot checks your real Questrade positions. Once
  the symbol appears there, it marks the suggestion as confirmed and starts
  tracking it for exits. If you never act on it within
  `SUGGESTION_EXPIRY_MINUTES`, the suggestion is dropped.
- For tracked positions, every loop tick the bot checks the latest quote
  against the stop-loss/take-profit. If either is hit, it sends an exit
  alert telling you to close the position manually. Once the symbol
  disappears from your real Questrade positions, the bot confirms the exit
  and stops tracking it.

## Exit management (stop-loss / take-profit)

Questrade's API has no native bracket/OCO order type and the bot cannot
place orders, so exit levels are tracked by the bot itself, persisted in
`data/positions.json`:

- **Every loop tick:** for each tracked position with status `OPEN`, the
  bot fetches the latest quote and checks it against the stop-loss and
  take-profit levels *before* evaluating any new entries (so exits are
  managed even if the daily loss circuit breaker has halted new trades).
- If either level is hit, the bot sends an exit alert (alert mode) and
  marks the position `EXIT_SUGGESTED`, or logs a simulated exit and removes
  it immediately (paper mode).
- `EXIT_SUGGESTED` positions are removed once they disappear from your real
  Questrade positions (confirming you closed it).

Because exit checks are polling-based (`POLL_INTERVAL_MS`), there can be
some delay between a level being hit and the alert arriving - shorter poll
intervals reduce this.

## Notes / limitations

- The market-hours check is calendar-based only (Mon-Fri, configured
  hours) and does not account for market holidays.
- Questrade access tokens expire roughly every 30 minutes and refresh
  tokens are single-use; `src/questrade/auth.js` handles this
  automatically and persists rotated tokens to `data/`.
- This bot only ever reads from the Questrade API (balances, positions,
  quotes, candles) - it never writes/places orders.
