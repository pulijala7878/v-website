# APEX Trader — PWA Setup & Vercel Deployment Guide

## Step 1 — Add Your Anthropic API Key

Open `index.html` and find this line near the top of the `<script>` block:

```javascript
const API_KEY = 'YOUR_API_KEY_HERE';
```

Replace with your key from: https://console.anthropic.com/keys

---

## Step 2 — Deploy to Vercel (Free)

### Option A: Drag & Drop (No CLI needed)
1. Go to https://vercel.com and sign in with GitHub
2. Click **"Add New Project"**
3. Drag the entire `apex-trader` folder onto the upload area
4. Click **Deploy**
5. Done! You'll get a URL like `https://apex-trader-xyz.vercel.app`

### Option B: Via GitHub (Recommended for updates)
1. Create a new repo on GitHub called `apex-trader`
2. Upload all files in this folder to the repo
3. Go to https://vercel.com → "Add New Project"
4. Import your GitHub repo
5. Set:
   - **Framework Preset**: Other
   - **Root Directory**: `public`
   - **Output Directory**: `public`
6. Click **Deploy**

---

## Step 3 — Install as PWA on Android

1. Open your Vercel URL in **Chrome** on Android
2. Wait 2 seconds — an **"Install APEX"** banner will appear at the bottom
3. Tap **Install** → it's added to your home screen like a native app!

### Manual install (if banner doesn't appear):
1. Tap Chrome's **3-dot menu** (top right)
2. Tap **"Add to Home Screen"**
3. Tap **"Add"**

---

## ⚠️ Security Note

Your API key is embedded in the HTML file. This is fine for **personal use** on a private/unlisted URL.

For a public app, use Vercel Environment Variables + a serverless function:
1. In Vercel dashboard → Settings → Environment Variables
2. Add `ANTHROPIC_API_KEY = your_key`
3. Create `/api/chat.js` as a proxy endpoint

---

## File Structure

```
apex-trader/
├── public/
│   ├── index.html      ← Main app (edit API key here)
│   ├── manifest.json   ← PWA config
│   ├── sw.js           ← Service worker (offline support)
│   ├── icon-192.png    ← App icon
│   └── icon-512.png    ← App icon (large)
└── DEPLOY_GUIDE.md     ← This file
```

---

## Updating the App

If deployed via GitHub:
1. Edit `index.html`
2. Push to GitHub
3. Vercel auto-redeploys in ~30 seconds
