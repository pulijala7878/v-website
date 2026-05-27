# APEX Trading — Play Store Submission Guide

## What's been built

| Layer | Technology |
|-------|-----------|
| Web app | React + Vite (existing) |
| Android wrapper | Capacitor 7 |
| Native billing | Google Play Billing v7 (BillingManager.java) |
| Usage gating | 5 free queries/day → paywall |
| Subscriptions | Monthly $4.99 · Yearly $29.99 |
| Preferences | @capacitor/preferences (cross-device) |

---

## Step 1 — Install Android Studio

Download from https://developer.android.com/studio  
Install with the **Android SDK** (API level 35 recommended).

Set the `ANDROID_HOME` env var:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

---

## Step 2 — Open the project in Android Studio

```bash
npx cap open android
```

This opens `android/` as a Gradle project.

---

## Step 3 — Create a signing keystore (one-time)

```bash
keytool -genkey -v \
  -keystore apex-release-key.jks \
  -alias apex-key \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

**Keep this file safe — losing it means you can never update the app.**

---

## Step 4 — Configure signing in Android Studio

In Android Studio:  
`Build → Generate Signed Bundle / APK → Android App Bundle → New key store`  
Point it at `apex-release-key.jks`.

Or add to `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file('../apex-release-key.jks')
            storePassword System.getenv('KEYSTORE_PASS')
            keyAlias 'apex-key'
            keyPassword System.getenv('KEY_PASS')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

---

## Step 5 — Build the release AAB

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## Step 6 — Create a Google Play Developer account

- Go to https://play.google.com/console
- One-time $25 registration fee
- Fill in your developer profile

---

## Step 7 — Create the app listing

In Play Console → **Create app**:

| Field | Value |
|-------|-------|
| App name | APEX Trading Intelligence |
| Default language | English (US) |
| App or game | App |
| Free or paid | Free (monetize via subscription) |
| Category | Finance |

**Store listing copy:**
> APEX is your AI-powered day trading analyst. Get real-time technical analysis, trade setups, support/resistance levels, and momentum signals for any stock, crypto, or ETF — powered by advanced AI.
>
> ✅ Instant trade setups with entry, stop loss & targets  
> ✅ RSI, MACD, EMA, volume analysis  
> ✅ VWAP & candlestick pattern recognition  
> ✅ Works with stocks, crypto, forex & ETFs  
>
> *Not financial advice. Trading involves risk.*

---

## Step 8 — Set up In-App Products in Play Console

Go to **Monetize → Subscriptions → Create subscription**

| Product | Product ID | Price |
|---------|-----------|-------|
| APEX Pro Monthly | `apex_pro_monthly` | $4.99/month |
| APEX Pro Yearly  | `apex_pro_yearly`  | $29.99/year |

**Important:** These IDs must match exactly what's in `App.jsx` `PRODUCTS` config.

---

## Step 9 — Add the app to the Play Store

1. Upload `app-release.aab` to **Production track** (or **Internal testing** first)
2. Complete the **Content rating questionnaire** (Finance → no violence/adult content)
3. Add a **Privacy Policy URL** (required — see below)
4. Fill out the **Data safety form** (declare: no personal data collected beyond purchase receipts)

---

## Step 10 — Privacy Policy (required)

Host a simple privacy policy page. Minimum content:

> APEX Trading collects no personal data beyond what Google Play requires for subscription management. We do not sell or share user data. AI queries are sent to our secure API and not stored. Contact: your@email.com

You can host it free on GitHub Pages or Vercel.

---

## Monetization revenue estimate

| Users/month | Conversion (2%) | Monthly revenue |
|------------|----------------|----------------|
| 1,000 | 20 Pro | ~$100 |
| 5,000 | 100 Pro | ~$500 |
| 20,000 | 400 Pro | ~$2,000 |

Google Play takes **15% fee** for the first $1M/year (reduced from 30%).

---

## Updating the app

After any code change:

```bash
npm run build        # rebuild web assets
npx cap sync android # sync to Android
cd android && ./gradlew bundleRelease
```

Then upload new AAB to Play Console → increment `versionCode` in `app/build.gradle`.

---

## Quick daily workflow

```bash
# Make changes to src/
npm run build
npx cap sync android
# Test in Android Studio emulator or device
```
