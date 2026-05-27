package com.apextrader.app;

import android.app.Activity;
import android.util.Log;
import androidx.annotation.NonNull;
import com.android.billingclient.api.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Wraps Google Play Billing. MainActivity calls this to initiate purchases.
 * The WebView receives results via JavaScript callbacks injected into the bridge.
 */
public class BillingManager implements PurchasesUpdatedListener {
    private static final String TAG = "ApexBilling";

    public static final String SKU_MONTHLY = "apex_pro_monthly";
    public static final String SKU_YEARLY  = "apex_pro_yearly";

    private final Activity activity;
    private BillingClient billingClient;
    private BillingCallback callback;

    public interface BillingCallback {
        void onPurchaseSuccess(String productId);
        void onPurchasePending(String productId);
        void onPurchaseFailed(int responseCode, String message);
        void onProStatusRestored(boolean hasPro);
    }

    public BillingManager(Activity activity, BillingCallback callback) {
        this.activity = activity;
        this.callback = callback;
        connect();
    }

    private void connect() {
        billingClient = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "Billing client connected");
                }
            }
            @Override
            public void onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected – reconnecting");
                connect();
            }
        });
    }

    public void launchSubscriptionFlow(String productId) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build());

        billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                (billingResult, productDetailsList) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                            || productDetailsList.isEmpty()) {
                        callback.onPurchaseFailed(billingResult.getResponseCode(),
                                "Product not found: " + billingResult.getDebugMessage());
                        return;
                    }
                    ProductDetails details = productDetailsList.get(0);
                    List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                    if (offers == null || offers.isEmpty()) {
                        callback.onPurchaseFailed(-1, "No subscription offers available");
                        return;
                    }
                    List<BillingFlowParams.ProductDetailsParams> params = new ArrayList<>();
                    params.add(BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offers.get(0).getOfferToken())
                            .build());
                    BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(params)
                            .build();
                    activity.runOnUiThread(() ->
                            billingClient.launchBillingFlow(activity, flowParams));
                });
    }

    public void restorePurchases() {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                (billingResult, purchases) -> {
                    boolean hasPro = false;
                    for (Purchase p : purchases) {
                        if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            hasPro = true;
                            acknowledgePurchase(p);
                        }
                    }
                    callback.onProStatusRestored(hasPro);
                });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result,
                                   @NonNull List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
            for (Purchase p : purchases) {
                handlePurchase(p);
            }
        } else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.d(TAG, "User cancelled purchase");
        } else {
            callback.onPurchaseFailed(result.getResponseCode(), result.getDebugMessage());
        }
    }

    private void handlePurchase(Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            acknowledgePurchase(purchase);
            for (String sku : purchase.getProducts()) {
                callback.onPurchaseSuccess(sku);
            }
        } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            for (String sku : purchase.getProducts()) {
                callback.onPurchasePending(sku);
            }
        }
    }

    private void acknowledgePurchase(Purchase purchase) {
        if (purchase.isAcknowledged()) return;
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();
        billingClient.acknowledgePurchase(params, r ->
                Log.d(TAG, "Ack result: " + r.getResponseCode()));
    }
}
