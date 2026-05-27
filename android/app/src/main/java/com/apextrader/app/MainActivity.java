package com.apextrader.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity implements BillingManager.BillingCallback {

    private BillingManager billingManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        billingManager = new BillingManager(this, this);

        // Expose a JS interface so React can call native billing
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new ApexBillingBridge(), "ApexBilling");
    }

    // ── JS → Native bridge ──────────────────────────────────────────────────
    private class ApexBillingBridge {
        @JavascriptInterface
        public void subscribe(String productId) {
            billingManager.launchSubscriptionFlow(productId);
        }

        @JavascriptInterface
        public void restorePurchases() {
            billingManager.restorePurchases();
        }
    }

    // ── Native → JS callbacks ───────────────────────────────────────────────
    private void callJS(String js) {
        runOnUiThread(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }

    @Override
    public void onPurchaseSuccess(String productId) {
        callJS("window.onApexBillingSuccess && window.onApexBillingSuccess('" + productId + "')");
    }

    @Override
    public void onPurchasePending(String productId) {
        callJS("window.onApexBillingPending && window.onApexBillingPending('" + productId + "')");
    }

    @Override
    public void onPurchaseFailed(int code, String message) {
        callJS("window.onApexBillingFailed && window.onApexBillingFailed(" + code + ", '" + message.replace("'", "\\'") + "')");
    }

    @Override
    public void onProStatusRestored(boolean hasPro) {
        callJS("window.onApexProRestored && window.onApexProRestored(" + hasPro + ")");
    }
}
