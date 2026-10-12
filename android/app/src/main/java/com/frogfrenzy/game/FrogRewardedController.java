package com.frogfrenzy.game;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/** Main-thread owner of one-use, consent-gated rewarded ads. */
final class FrogRewardedController {
    interface AdsAllowed { boolean get(); }
    interface Completion { void complete(boolean earned, String error); }
    private static final String TAG = "FrogRewarded";
    private static final long MAX_AGE_MS = 55 * 60_000L;
    private final Activity activity;
    private final AdsAllowed adsAllowed;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable retry = this::preload;
    private RewardedAd ad;
    private Completion completion;
    private boolean loading, showing, earned, resumed, destroyed;
    private int generation;
    private long loadedAt;

    FrogRewardedController(Activity activity, AdsAllowed adsAllowed) {
        this.activity = activity;
        this.adsAllowed = adsAllowed;
    }

    void preload() {
        if (destroyed || !resumed || showing || !adsAllowed.get() || loading) return;
        if (ad != null && SystemClock.elapsedRealtime() - loadedAt < MAX_AGE_MS) return;
        ad = null;
        AdRequest adRequest = new AdRequest.Builder().build();
        if (!activity.getString(R.string.admob_test_device_id).isEmpty() && !adRequest.isTestDevice(activity)) {
            Log.e(TAG, "Rewarded diagnostics blocked: device is not in test mode");
            return;
        }
        loading = true;
        handler.removeCallbacks(retry);
        int request = ++generation;
        RewardedAd.load(activity, activity.getString(R.string.admob_rewarded_id),
            adRequest, new RewardedAdLoadCallback() {
                @Override
                public void onAdLoaded(RewardedAd loaded) {
                    if (destroyed || request != generation) return;
                    loading = false;
                    if (!adsAllowed.get()) return;
                    ad = loaded;
                    loadedAt = SystemClock.elapsedRealtime();
                    Log.i(TAG, "Rewarded ad loaded");
                }

                @Override
                public void onAdFailedToLoad(LoadAdError error) {
                    if (destroyed || request != generation) return;
                    loading = false;
                    Log.w(TAG, "Rewarded load failed: " + error);
                    if (resumed) handler.postDelayed(retry, 60_000);
                }
            });
    }

    void show(Completion callback) {
        if (destroyed || !resumed || showing || activity.isFinishing() || !adsAllowed.get()) {
            callback.complete(false, "Reward ads are unavailable right now. Please try again shortly.");
            return;
        }
        if (ad == null || SystemClock.elapsedRealtime() - loadedAt >= MAX_AGE_MS) {
            ad = null;
            preload();
            callback.complete(false, "No reward ad is ready. Please try again shortly.");
            return;
        }
        RewardedAd selected = ad;
        ad = null; // A full-screen ad can only be shown once.
        showing = true;
        earned = false;
        completion = callback;
        selected.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                finish(null);
            }

            @Override
            public void onAdFailedToShowFullScreenContent(AdError error) {
                Log.w(TAG, "Rewarded show failed: " + error);
                finish("The reward ad could not be shown. Please try again.");
            }
        });
        try {
            selected.show(activity, reward -> {
                if (!showing || destroyed) return;
                earned = true; // Never infer a reward from elapsed time or dismissal.
                Log.i(TAG, "Reward earned");
            });
        } catch (RuntimeException error) {
            Log.w(TAG, "Rewarded show failed", error);
            finish("The reward ad could not be shown. Please try again.");
        }
    }

    private void finish(String error) {
        if (!showing) return;
        showing = false;
        Completion callback = completion;
        completion = null;
        boolean rewardEarned = earned;
        earned = false;
        Log.i(TAG, "Rewarded dismissed; earned=" + rewardEarned);
        if (callback != null) callback.complete(error == null && rewardEarned, error);
        preload();
    }

    boolean isShowing() { return showing; }

    void invalidate() {
        generation++;
        loading = false;
        ad = null;
        handler.removeCallbacks(retry);
    }

    void resume() {
        resumed = true;
        if (!adsAllowed.get()) invalidate();
        preload();
    }

    void pause() {
        resumed = false;
        handler.removeCallbacks(retry);
    }

    void destroy() {
        destroyed = true;
        invalidate();
        finish("The game was closed before the reward could be applied.");
    }
}
