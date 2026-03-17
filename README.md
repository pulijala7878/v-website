# APEX — AI Trading Intelligence

## The Fix
This version uses a **Vercel serverless proxy** (`/api/chat.js`) to call the Anthropic API server-side,
solving the CORS "Failed to fetch" error that happens when calling APIs directly from the browser.

## Project Structure
```
apex-trader/
├── api/
│   └── chat.js        ← Vercel serverless function (the CORS fix)
├── src/
│   ├── main.jsx
│   └── App.jsx        ← Frontend (calls /api/chat, NOT Anthropic directly)
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```

---

## Deploy Steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/apex-trader.git
git push -u origin main
```

### 2. Import to Vercel
1. Go to https://vercel.com/new
2. Click **"Import Git Repository"**
3. Select your `apex-trader` repo
4. Click **Deploy** (Vercel auto-detects Vite)

### 3. Add API Key as Environment Variable ⚠️
This is the critical step — do NOT hardcode your key in the code.

1. In Vercel dashboard → your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-...` (your actual key)
   - **Environment:** Production, Preview, Development ✓
3. Click **Save**
4. Go to **Deployments** → click **Redeploy** (so it picks up the new env var)

### 4. Done! 🎉
Your app is live at `https://apex-trader.vercel.app` (or similar URL).

---

## Why this fixes the error
- ❌ **Before:** Browser → `api.anthropic.com` (blocked by CORS)
- ✅ **After:** Browser → `/api/chat` (your Vercel function) → `api.anthropic.com` (server-to-server, no CORS)

---

## Local Development
```bash
npm install
# Create .env.local with: ANTHROPIC_API_KEY=sk-ant-...
npx vercel dev   # runs both frontend + serverless functions locally
```
