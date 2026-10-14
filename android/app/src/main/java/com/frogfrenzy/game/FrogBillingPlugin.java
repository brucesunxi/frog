package com.frogfrenzy.game;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
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
    private String activeProductId;

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build())
            .enableAutoServiceReconnection()
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
        activeProductId = productId;
        ensureReady(call, () -> queryProductForPurchase(productId, call));
    }

    @PluginMethod
    public void getPendingPurchases(PluginCall call) {
        ensureReady(call, () -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Purchase recovery unavailable: " + result.getDebugMessage());
                    return;
                }
                JSArray values = new JSArray();
                for (Purchase purchase : purchases) values.put(serializePurchase(purchase));
                JSObject response = new JSObject(); response.put("purchases", values); call.resolve(response);
            }));
    }

    @Override
    protected void handleOnResume() {
        JSObject event = new JSObject();
        notifyListeners("purchasesUpdated", event);
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
        billingClient.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject("Product query failed: " + billingResult.getDebugMessage());
                return;
            }
            JSArray result = new JSArray();
            for (ProductDetails details : queryProductDetailsResult.getProductDetailsList()) {
                JSObject item = new JSObject();
                item.put("productId", details.getProductId());
                item.put("title", details.getTitle());
                item.put("description", details.getDescription());
                ProductDetails.OneTimePurchaseOfferDetails offer = getFirstOneTimeOffer(details);
                if (offer != null) {
                    item.put("price", offer.getFormattedPrice());
                    item.put("priceMicros", offer.getPriceAmountMicros());
                    item.put("currencyCode", offer.getPriceCurrencyCode());
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
        billingClient.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || queryProductDetailsResult.getProductDetailsList().isEmpty()) {
                clearActive(call);
                call.reject("Product unavailable: " + billingResult.getDebugMessage());
                return;
            }
            ProductDetails details = queryProductDetailsResult.getProductDetailsList().get(0);
            ProductDetails.OneTimePurchaseOfferDetails offer = getFirstOneTimeOffer(details);
            BillingFlowParams.ProductDetailsParams.Builder productDetailsParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details);
            if (offer != null) {
                productDetailsParamsBuilder.setOfferToken(offer.getOfferToken());
            }
            BillingFlowParams.ProductDetailsParams productDetailsParams = productDetailsParamsBuilder.build();
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
        String expectedProduct = activeProductId;
        activePurchaseCall = null;
        activeProductId = null;
        if (call == null) {
            notifyListeners("purchasesUpdated", new JSObject());
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
        Purchase purchase = null;
        for (Purchase candidate : purchases) {
            if (candidate.getProducts().contains(expectedProduct)) { purchase = candidate; break; }
        }
        if (purchase == null) {
            call.reject("The purchase did not match the requested product");
            notifyListeners("purchasesUpdated", new JSObject());
            return;
        }
        call.resolve(serializePurchase(purchase));
    }

    private JSObject serializePurchase(Purchase purchase) {
        JSObject result = new JSObject();
        result.put("productId", purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0));
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("orderId", purchase.getOrderId());
        result.put("purchaseState", purchase.getPurchaseState());
        result.put("quantity", purchase.getQuantity());
        return result;
    }

    private void clearActive(PluginCall call) {
        if (activePurchaseCall == call) {
            activePurchaseCall = null;
            activeProductId = null;
        }
    }

    private ProductDetails.OneTimePurchaseOfferDetails getFirstOneTimeOffer(ProductDetails details) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
        if (offers != null && !offers.isEmpty()) {
            return offers.get(0);
        }
        return details.getOneTimePurchaseOfferDetails();
    }
}
