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

## Cost per query (after the optimizations in this build)

| Tier | Model | Input cost | Output cost | Per query |
|------|-------|-----------|------------|-----------|
| Free | claude-haiku-4-5 | $0.80/M | $4/M | **~$0.003** |
| Pro  | claude-sonnet-4  | $3/M    | $15/M | **~$0.011** |

Assumptions: ~630 input tokens, ~550 output tokens per query.  
With **prompt caching** (enabled), the 400-token system prompt costs 90% less on cache hits → effective free-tier cost drops to **~$0.002/query**.

---

## Break-even analysis

### Free users
- 5 queries/day × $0.002 = **$0.010/day per free user**
- 1,000 free users = **~$10/day = ~$300/month**

### Pro users ($4.99/month → you keep $4.24 after Google's 15%)
- If a Pro user runs 15 queries/day: 450/month × $0.011 = **$4.95/month in API costs**
- Revenue: $4.24 → **net loss of $0.71/month per heavy Pro user**
- If a Pro user runs 8 queries/day: 240/month × $0.011 = **$2.64/month**
- Revenue: $4.24 → **net profit of $1.60/month**

**Rule of thumb: you need Pro users to average under ~12 queries/day to stay profitable at $4.99/month.**

---

## Recommendations to stay profitable

### 1. Cap Pro daily queries (implemented via server-side rate limit)
Add a Pro daily limit (e.g. 30/day) in `api/chat.js`:
```js
const proLimit = isPro ? 30 : 5;
if (!checkRateLimit(clientIp, proLimit)) { ... }
```
At 30/day: 900 queries/month × $0.011 = $9.90 → still a loss.  
**Consider $9.99/month if you want truly unlimited Sonnet.**

### 2. Use Haiku for all tiers (simplest)
Change `api/chat.js` to always use `claude-haiku-4-5-20251001`.  
900 queries/month × $0.002 = $1.80 → profit $2.44/month per Pro user.

### 3. Yearly plan math
$29.99/year → you keep $25.49 → $2.12/month  
At 15 queries/day with Haiku: $0.002 × 450 = $0.90/month → **profit $1.22/month**

### 4. Yearly with Sonnet is risky
$29.99/year → $2.12/month revenue  
15 queries/day with Sonnet: $4.95/month → **loss $2.83/month**  
If you keep yearly + Sonnet, cap Pro at 10 queries/day max.

---

## Setting up the Pro token (Vercel env vars)

1. Generate a random secret: `openssl rand -hex 32`
2. In Vercel dashboard → Settings → Environment Variables:
   - `ANTHROPIC_API_KEY` = your Anthropic key
   - `APEX_PRO_SECRET` = your random secret
   - `VITE_PRO_SECRET` = **same** random secret (prefix VITE_ makes it available to Vite/React)
3. Redeploy Vercel

> **Security note:** `VITE_PRO_SECRET` is bundled into the client JS and visible to determined users.
> This is "soft" protection — adequate for v1. For production, implement proper receipt validation:
> when a user subscribes via Google Play, send the purchase token to your backend,
> verify it against the Google Play Developer API, and issue a signed JWT. The JWT
> is then sent with each API request and verified server-side.

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

## Monthly P&L snapshot (realistic 6-month scenario)

| Month | Free users | Pro users | API cost | Revenue | Net |
|-------|-----------|-----------|---------|---------|-----|
| 1 | 100 | 5 | $35 | $21 | -$14 |
| 3 | 500 | 25 | $165 | $106 | -$59 |
| 6 | 2,000 | 80 | $595 | $339 | -$256 |

**This assumes Sonnet for Pro.** Switching Pro to Haiku cuts API cost ~4x and flips the P&L positive around month 3.
