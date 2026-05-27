// In-memory rate limiter — resets per Vercel instance cold-start.
// For production at scale, replace with Vercel KV (see COST_GUIDE.md).
const ipUsage = new Map(); // ip+date -> count

function getRateLimitKey(ip) {
  const date = new Date().toISOString().slice(0, 10);
  return `${ip}|${date}`;
}

function checkRateLimit(ip, limit) {
  const key = getRateLimitKey(ip);
  const count = ipUsage.get(key) || 0;
  if (count >= limit) return false;
  ipUsage.set(key, count + 1);
  return true;
}

// Clean up old entries every ~200 requests to prevent memory bloat
let callCount = 0;
function pruneOldEntries() {
  if (++callCount % 200 !== 0) return;
  const today = new Date().toISOString().slice(0, 10);
  for (const key of ipUsage.keys()) {
    if (!key.includes(today)) ipUsage.delete(key);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  if (!body?.messages) return res.status(400).json({ error: 'Missing messages field' });

  // ── Tier-based model selection ─────────────────────────────────────────────
  // Pro token is a simple shared secret stored in APEX_PRO_SECRET env var.
  // A real implementation would use signed JWTs verified against Google Play receipts.
  const isPro = body.proToken && body.proToken === process.env.APEX_PRO_SECRET;

  // ── Server-side rate limiting (free tier only) ─────────────────────────────
  const FREE_DAILY_LIMIT = 5;
  if (!isPro) {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    pruneOldEntries();
    if (!checkRateLimit(clientIp, FREE_DAILY_LIMIT)) {
      return res.status(429).json({ error: 'Daily free limit reached. Upgrade to APEX Pro for unlimited access.' });
    }
  }

  // ── Model + token config by tier ───────────────────────────────────────────
  const model = isPro ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';
  const maxTokens = isPro ? 900 : 600;

  // ── Prompt caching on system prompt (saves ~90% on repeated tokens) ────────
  const systemBlock = body.system
    ? [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }]
    : undefined;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemBlock,
        messages: body.messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API error:', JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    // Return cache usage stats so client can log savings (optional)
    const usage = data.usage || {};
    return res.status(200).json({
      ...data,
      _tier: isPro ? 'pro' : 'free',
      _model: model,
      _cacheHit: (usage.cache_read_input_tokens || 0) > 0,
    });
  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
};
