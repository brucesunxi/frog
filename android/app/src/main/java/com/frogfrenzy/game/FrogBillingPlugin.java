package com.frogfrenzy.game;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "FrogBilling")
public class FrogBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private PluginCall activePurchaseCall;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .enablePendingPurchases()
            .setListener(this)
            .build();
    }

    @PluginMethod
    public void getCoinProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds", new JSArray());
        ensureReady(call, () -> queryProducts(ids, call));
    }

    @PluginMethod
    public void buyCoins(PluginCall call) {
        String productId = call.getString("productId", "");
        if (productId.isEmpty()) {
            call.reject("Missing productId");
            return;
        }
        if (activePurchaseCall != null) {
            call.reject("Another purchase is already in progress");
            return;
        }
        activePurchaseCall = call;
        ensureReady(call, () -> queryProductForPurchase(productId, call));
    }

    private void ensureReady(PluginCall call, Runnable action) {
        if (billingClient == null) {
            load();
        }
        if (billingClient.isReady()) {
            action.run();
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    action.run();
                } else {
                    clearActive(call);
                    call.reject("Billing unavailable: " + billingResult.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
            }
        });
    }

    private void queryProducts(JSArray ids, PluginCall call) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.optString(i, "");
            if (!id.isEmpty()) {
                products.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build());
            }
        }
        if (products.isEmpty()) {
            call.reject("No product ids supplied");
            return;
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();
        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("Product query failed: " + billingResult.getDebugMessage());
                return;
            }
            JSArray result = new JSArray();
            for (ProductDetails details : productDetailsList) {
                JSObject item = new JSObject();
                item.put("productId", details.getProductId());
                item.put("title", details.getTitle());
                item.put("description", details.getDescription());
                if (details.getOneTimePurchaseOfferDetails() != null) {
                    item.put("price", details.getOneTimePurchaseOfferDetails().getFormattedPrice());
                    item.put("priceMicros", details.getOneTimePurchaseOfferDetails().getPriceAmountMicros());
                    item.put("currencyCode", details.getOneTimePurchaseOfferDetails().getPriceCurrencyCode());
                }
                result.put(item);
            }
            JSObject response = new JSObject();
            response.put("products", result);
            call.resolve(response);
        });
    }

    private void queryProductForPurchase(String productId, PluginCall call) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            ))
            .build();
        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList.isEmpty()) {
                clearActive(call);
                call.reject("Product unavailable: " + billingResult.getDebugMessage());
                return;
            }
            ProductDetails details = productDetailsList.get(0);
            BillingFlowParams.ProductDetailsParams productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .build();
            BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productDetailsParams))
                .build();
            Activity activity = getActivity();
            BillingResult launchResult = billingClient.launchBillingFlow(activity, flowParams);
            if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                clearActive(call);
                call.reject("Could not launch purchase: " + launchResult.getDebugMessage());
            }
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call = activePurchaseCall;
        activePurchaseCall = null;
        if (call == null) {
            return;
        }
        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("Purchase canceled");
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("Purchase failed: " + billingResult.getDebugMessage());
            return;
        }
        Purchase purchase = purchases.get(0);
        JSObject result = new JSObject();
        result.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("orderId", purchase.getOrderId());
        result.put("purchaseState", purchase.getPurchaseState());
        result.put("quantity", purchase.getQuantity());
        call.resolve(result);
    }

    private void clearActive(PluginCall call) {
        if (activePurchaseCall == call) {
            activePurchaseCall = null;
        }
    }
}
