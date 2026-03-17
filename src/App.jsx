import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are APEX — an elite AI day trading analyst with deep expertise in technical analysis, market microstructure, and price action. You help day traders make informed decisions with sharp, direct analysis.

When a user asks about a stock, crypto, or asset, provide:

📊 TECHNICAL ANALYSIS
- Key support & resistance levels (specific prices)
- Trend direction (intraday, short-term)
- Key indicators: RSI, MACD, moving averages (50/200 EMA), volume patterns
- Candlestick patterns if relevant

🎯 TRADE SETUP
- Bias: BULLISH / BEARISH / NEUTRAL
- Entry zone (specific price range)
- Stop loss level
- Price targets (T1, T2, T3)
- Risk/Reward ratio

⚠️ RISK FACTORS
- Key risks to the trade
- Important levels to watch
- Upcoming catalysts (earnings, news, data)

📈 MOMENTUM SIGNALS
- Short-term momentum reading
- Volume confirmation
- Any divergences

Keep responses sharp, specific, and actionable. Use exact prices when possible. Be direct like a professional desk analyst. Always note that markets are probabilistic, not certain.`;

const SUGGESTED = [
  "Analyze NVDA for a day trade today",
  "TSLA support & resistance levels",
  "BTC setup for the next 4 hours",
  "Best scalping strategy for SPY",
  "AMD breakout or breakdown?",
  "How to use VWAP in day trading",
];

const TypingIndicator = () => (
  <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "12px 0" }}>
    {[0, 1, 2].map(i => (
      <div key={i} style={{
        width: 8, height: 8, borderRadius: "50%",
        background: "#00ff88",
        animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
      }} />
    ))}
  </div>
);

function formatMessage(text) {
  return text.split("\n").map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: "8px" }} />;
    if (/^[📊🎯⚠️📈💡]/.test(line)) {
      return <div key={i} style={{ fontFamily: "monospace", fontSize: "12px", color: "#00ff88", letterSpacing: "0.1em", marginTop: "16px", marginBottom: "4px", textTransform: "uppercase" }}>{line.replace(/\*\*/g, "")}</div>;
    }
    if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
      const content = line.trim().slice(2).replace(/\*\*(.*?)\*\*/g, (_, m) => `<strong style="color:#fff">${m}</strong>`);
      return (
        <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "3px" }}>
          <span style={{ color: "#00ff88", flexShrink: 0 }}>›</span>
          <span dangerouslySetInnerHTML={{ __html: content }} style={{ color: "#b0bec5", fontSize: "14px", lineHeight: 1.6 }} />
        </div>
      );
    }
    const formatted = line.replace(/\*\*(.*?)\*\*/g, (_, m) => `<strong style="color:#e0e0e0">${m}</strong>`);
    return <div key={i} style={{ color: "#b0bec5", fontSize: "14px", lineHeight: 1.7, marginBottom: "2px" }} dangerouslySetInnerHTML={{ __html: formatted }} />;
  });
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    setShowWelcome(false);
    setError(null);
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Calls our Vercel serverless proxy at /api/chat — no CORS issues!
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.error || `API error ${response.status}`);
      }

      const reply = data.content?.map(b => b.text || "").join("\n") || "No response received.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message);
      setMessages([...newMessages, { role: "assistant", content: `⚠️ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', sans-serif", position: "relative" }}>
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.4);opacity:1} }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:.3} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080c10; }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,136,.2); border-radius: 4px }
        .chip:hover { background: rgba(0,255,136,.07) !important; border-color: rgba(0,255,136,.3) !important; color: #e0e0e0 !important; }
        .send-btn:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 0 20px rgba(0,255,136,.3); }
        input:focus { outline: none; }
      `}</style>

      {/* Grid background */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(0,255,136,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,136,.03) 1px,transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(8,12,16,.97)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,255,136,.15)", padding: "0 20px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#00ff88,#00b4ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📈</div>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 700, color: "#fff", letterSpacing: "0.15em" }}>APEX</div>
            <div style={{ fontFamily: "monospace", fontSize: "9px", color: "#00ff88", letterSpacing: "0.2em" }}>TRADING INTELLIGENCE</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 8px #00ff88", animation: "blink 1.5s ease-in-out infinite" }} />
          <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#00ff88", letterSpacing: "0.15em" }}>LIVE</span>
        </div>
      </header>

      {/* Body */}
      {showWelcome ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", position: "relative", zIndex: 2 }}>
          <div style={{ fontFamily: "monospace", fontSize: "clamp(28px,8vw,48px)", fontWeight: 700, color: "#fff", textAlign: "center", marginBottom: 8 }}>
            Meet <span style={{ background: "linear-gradient(90deg,#00ff88,#00b4ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>APEX</span>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "clamp(12px,3vw,16px)", color: "#546e7a", textAlign: "center", marginBottom: 8 }}>Your AI Day Trading Analyst</div>
          <p style={{ color: "#546e7a", textAlign: "center", fontSize: 14, maxWidth: 380, lineHeight: 1.6, marginBottom: 36 }}>
            Technical analysis, trade setups, support/resistance levels and market insights — powered by AI.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, width: "100%", maxWidth: 680 }}>
            {SUGGESTED.map((q, i) => (
              <button key={i} className="chip" onClick={() => sendMessage(q)} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "13px 16px", color: "#78909c", fontSize: 13, cursor: "pointer", textAlign: "left", lineHeight: 1.4, transition: "all .2s" }}>{q}</button>
            ))}
          </div>
          <p style={{ color: "#263238", fontSize: 11, marginTop: 32, textAlign: "center", maxWidth: 360 }}>⚠️ Not financial advice. Day trading involves substantial risk of loss.</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 2, maxWidth: 860, width: "100%", margin: "0 auto" }}>
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} style={{ alignSelf: "flex-end", background: "rgba(0,255,136,.1)", border: "1px solid rgba(0,255,136,.2)", borderRadius: "16px 16px 4px 16px", padding: "12px 18px", maxWidth: "75%", color: "#e0e0e0", fontSize: 14, lineHeight: 1.6 }}>{msg.content}</div>
            ) : (
              <div key={i} style={{ alignSelf: "flex-start", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: "4px 16px 16px 16px", padding: "16px 20px", maxWidth: "90%", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(0,255,136,.1)" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88", background: "rgba(0,255,136,.08)", border: "1px solid rgba(0,255,136,.2)", padding: "2px 8px", borderRadius: 4, letterSpacing: 1 }}>APEX ANALYSIS</span>
                </div>
                {formatMessage(msg.content)}
              </div>
            )
          )}
          {loading && (
            <div style={{ alignSelf: "flex-start", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: "4px 16px 16px 16px", padding: "16px 20px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88", background: "rgba(0,255,136,.08)", border: "1px solid rgba(0,255,136,.2)", padding: "2px 8px", borderRadius: 4, letterSpacing: 1, display: "inline-block", marginBottom: 8 }}>APEX ANALYSIS</div>
              <TypingIndicator />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div style={{ position: "sticky", bottom: 0, background: "rgba(8,12,16,.97)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,.06)", padding: "14px 20px", zIndex: 10 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, display: "flex", alignItems: "center", padding: "0 16px" }}>
            <input
              style={{ flex: 1, background: "transparent", border: "none", color: "#e0e0e0", fontSize: 14, padding: "14px 0", fontFamily: "inherit" }}
              placeholder="Ask about any stock or trading setup..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              disabled={loading}
            />
          </div>
          <button
            className="send-btn"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{ width: 48, height: 48, borderRadius: 12, background: loading || !input.trim() ? "rgba(0,255,136,.15)" : "linear-gradient(135deg,#00ff88,#00c97a)", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: 20, color: "#080c10", fontWeight: 700, transition: "all .2s" }}
          >→</button>
        </div>
        {!showWelcome && <div style={{ textAlign: "center", marginTop: 6, color: "#1c313a", fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>NOT FINANCIAL ADVICE · INFORMATIONAL USE ONLY</div>}
      </div>
    </div>
  );
}
