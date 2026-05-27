# APEX Trading — Cost Guide

## Who pays for what

| Cost | Who pays | Notes |
|------|----------|-------|
| Claude API (Anthropic) | **You** | Per-token, billed to your Anthropic account |
| Vercel hosting | **You** | Free up to 100k requests/month |
| Google Play cut | Deducted from revenue | 15% first $1M/year |
| Google Play one-time signup | **You** | $25, once ever |

Users pay **nothing** at the infrastructure level — all API costs are yours.

---

## Cost per query

Both free and Pro use **claude-haiku-4-5** (fast, cheap, very capable for structured analysis).

| Model | Input cost | Output cost | Per query (est.) |
|-------|-----------|------------|-----------------|
| claude-haiku-4-5 | $0.80/M | $4/M | **~$0.002** |

Assumptions: ~630 input tokens, ~550 output tokens per query.  
With **prompt caching** (enabled), the system prompt costs 90% less on repeat hits → effective cost drops to **~$0.0015/query**.

---

## Break-even analysis

### Free users (capped at 5/day server-side)
- 5 queries/day × $0.0015 = **$0.0075/day per free user**
- 1,000 free users = **~$7.50/day = ~$225/month**

### Pro users ($4.99/month → you keep $4.24 after Google's 15%)
- Capped at **50 queries/day** server-side
- Typical user (15 queries/day): 450/month × $0.0015 = **$0.68/month API cost**
- Revenue: $4.24 → **net profit of $3.56/month per Pro user**
- Heavy user (50 queries/day): 1,500/month × $0.0015 = **$2.25/month**
- Revenue: $4.24 → **net profit of $1.99/month** — still solidly profitable

### Yearly plan ($29.99/yr → $2.12/month)
- Typical user: $0.68 API cost → **profit $1.44/month**
- Heavy user: $2.25 API cost → **profit -$0.13/month** (edge case, acceptable)

**Bottom line: Haiku makes the economics work at any realistic usage level.**

---

## Setting up the Pro token (Vercel env vars)

1. Generate a random token: `openssl rand -hex 32`
2. In Vercel dashboard → Settings → Environment Variables, add all three:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `APEX_PRO_SECRET` | Your random token (server-side, never shown to users) |
| `VITE_APEX_PRO_TOKEN` | **Same value** as APEX_PRO_SECRET |

3. Redeploy Vercel after adding env vars

> **Note:** `VITE_APEX_PRO_TOKEN` is bundled into the client JS. A determined user could find it
> and make direct API calls bypassing the app paywall. At Haiku pricing ($0.0015/query),
> the financial risk is low — even 1,000 extra queries/day costs only $1.50/day.
> For v2, replace with Google Play receipt validation + server-issued JWT.

---

## Vercel KV (for robust server-side rate limiting)

The current rate limiter uses in-memory state that resets on cold starts.
For reliable enforcement at scale:

1. Enable Vercel KV (Redis) in your Vercel project — **free up to 30k requests/day**
2. Replace the in-memory map in `api/chat.js` with:
```js
import { kv } from '@vercel/kv';
const count = await kv.incr(`usage:${ip}:${date}`);
await kv.expire(`usage:${ip}:${date}`, 86400);
if (count > FREE_DAILY_LIMIT) return res.status(429)...
```

---

## Monthly P&L snapshot (realistic 6-month scenario, all Haiku)

| Month | Free users | Pro users | API cost | Revenue | Net |
|-------|-----------|-----------|---------|---------|-----|
| 1 | 100 | 5 | ~$10 | $21 | **+$11** |
| 3 | 500 | 25 | ~$45 | $106 | **+$61** |
| 6 | 2,000 | 80 | ~$165 | $339 | **+$174** |

Profitable from day one. API cost is the smallest line item — growth spend (ads, ASO) will matter far more.
