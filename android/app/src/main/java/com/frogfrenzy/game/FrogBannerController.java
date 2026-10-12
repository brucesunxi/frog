package com.frogfrenzy.game;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import java.util.Collections;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

/** Owns a native banner below, rather than on top of, the game. All view work is on the UI thread. */
final class FrogBannerController {
    interface PrivacyCompletion {
        void complete(String error);
    }
    private static final String TAG = "FrogAds";
    private final Activity activity;
    private final LinearLayout root;
    private final FrameLayout container;
    private final ConsentInformation consent;
    private final Runnable privacyChanged;
    private final Runnable adsReady;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable retry = this::loadBanner;
    private AdView adView;
    private boolean initializing, initialized, loading, loaded, destroyed, resumed;
    private boolean privacyFormOpen;
    private int bannerWidth;

    FrogBannerController(Activity activity, Runnable privacyChanged, Runnable adsReady) {
        this.activity = activity;
        this.privacyChanged = privacyChanged;
        this.adsReady = adsReady;
        root = activity.findViewById(R.id.frog_ads_root);
        container = activity.findViewById(R.id.frog_banner_container);
        consent = UserMessagingPlatform.getConsentInformation(activity);
    }

    void start() {
        WindowCompat.setDecorFitsSystemWindows(activity.getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(root);
        root.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (availableWidth() != bannerWidth) loadBanner();
        });
        consent.requestConsentInfoUpdate(activity, new ConsentRequestParameters.Builder().build(), () -> {
            if (destroyed) return;
            privacyChanged.run();
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, error -> {
                if (destroyed) return;
                if (error != null) Log.w(TAG, "Consent form: " + error.getMessage());
                privacyChanged.run();
                initializeIfAllowed();
            });
        }, error -> {
            if (destroyed) return;
            Log.w(TAG, "Consent update: " + error.getMessage());
            privacyChanged.run();
            // UMP can allow requests using valid consent from an earlier session.
            initializeIfAllowed();
        });
        initializeIfAllowed();
    }

    private void initializeIfAllowed() {
        if (destroyed || !consent.canRequestAds() || initialized || initializing) return;
        initializing = true;
        String testDevice = activity.getString(R.string.admob_test_device_id);
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0 && !testDevice.isEmpty()) {
            MobileAds.setRequestConfiguration(new RequestConfiguration.Builder()
                .setTestDeviceIds(Collections.singletonList(testDevice)).build());
        }
        new Thread(() -> MobileAds.initialize(activity.getApplicationContext(), status ->
            activity.runOnUiThread(() -> {
                if (destroyed) return;
                initialized = true;
                initializing = false;
                loadBanner();
                adsReady.run();
            })), "frog-mobile-ads").start();
    }

    private int availableWidth() {
        int pixels = root.getWidth() - root.getPaddingLeft() - root.getPaddingRight();
        return Math.max(0, (int) (pixels / root.getResources().getDisplayMetrics().density));
    }

    @SuppressWarnings("deprecation") // Standard adaptive height preserves the game's controls on short screens.
    private void loadBanner() {
        if (destroyed || !resumed || !initialized || !consent.canRequestAds() || privacyFormOpen) return;
        int width = availableWidth();
        if (width < 1) return;
        if (adView == null || width != bannerWidth) {
            destroyAd();
            bannerWidth = width;
            AdView banner = new AdView(activity);
            adView = banner;
            banner.setAdUnitId(activity.getString(R.string.admob_banner_id));
            banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, width));
            banner.setAdListener(new AdListener() {
                @Override
                public void onAdLoaded() {
                    if (destroyed || adView != banner) return;
                    loading = false;
                    loaded = true;
                    container.setVisibility(View.VISIBLE);
                    Log.i(TAG, "Banner loaded");
                }

                @Override
                public void onAdFailedToLoad(LoadAdError error) {
                    if (destroyed || adView != banner) return;
                    loading = false;
                    loaded = false;
                    container.setVisibility(View.GONE);
                    Log.w(TAG, "Banner load failed: " + error);
                    handler.removeCallbacks(retry);
                    if (resumed) handler.postDelayed(retry, 60_000);
                }
            });
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL);
            container.addView(banner, params);
        }
        if (loading || loaded) return;
        handler.removeCallbacks(retry);
        loading = true;
        adView.loadAd(new AdRequest.Builder().build());
    }

    boolean isPrivacyOptionsRequired() {
        return consent.getPrivacyOptionsRequirementStatus()
            == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    boolean canRequestAds() {
        return initialized && !destroyed && !privacyFormOpen && consent.canRequestAds();
    }

    void showPrivacyOptions(PrivacyCompletion completion) {
        if (destroyed || privacyFormOpen || !isPrivacyOptionsRequired()) {
            completion.complete("Advertising privacy options are not available right now");
            return;
        }
        privacyFormOpen = true;
        destroyAd();
        UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {
            if (destroyed) return;
            privacyFormOpen = false;
            privacyChanged.run();
            initializeIfAllowed();
            loadBanner();
            adsReady.run();
            completion.complete(error == null ? null : error.getMessage());
        });
    }

    void resume() {
        resumed = true;
        if (adView != null) adView.resume();
        loadBanner();
    }

    void pause() {
        resumed = false;
        handler.removeCallbacks(retry);
        if (adView != null) adView.pause();
    }

    void configurationChanged() {
        bannerWidth = 0;
        root.post(this::loadBanner);
    }

    private void destroyAd() {
        handler.removeCallbacks(retry);
        if (adView != null) {
            container.removeView(adView);
            adView.destroy();
            adView = null;
        }
        container.setVisibility(View.GONE);
        loading = loaded = false;
    }

    void destroy() {
        destroyed = true;
        destroyAd();
    }
}
