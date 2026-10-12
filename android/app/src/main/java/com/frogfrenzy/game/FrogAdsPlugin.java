package com.frogfrenzy.game;

import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FrogAds")
public class FrogAdsPlugin extends Plugin {
    private FrogBannerController banner;
    private FrogRewardedController rewarded;

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            rewarded = new FrogRewardedController(getActivity(), () -> banner != null && banner.canRequestAds());
            banner = new FrogBannerController(getActivity(), () ->
                notifyListeners("privacyOptionsChanged", privacyState(), true), () -> rewarded.preload());
            banner.start();
        });
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (rewarded == null) {
                call.reject("Advertising is not ready yet. Please try again shortly.");
                return;
            }
            rewarded.show((earned, error) -> {
                if (error != null) call.reject(error);
                else {
                    JSObject result = new JSObject();
                    result.put("earned", earned);
                    call.resolve(result);
                }
            });
        });
    }

    private JSObject privacyState() {
        JSObject result = new JSObject();
        result.put("required", banner != null && banner.isPrivacyOptionsRequired());
        return result;
    }

    @PluginMethod
    public void getPrivacyOptions(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(privacyState()));
    }

    @PluginMethod
    public void showPrivacyOptions(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (banner == null) {
                call.reject("Advertising is not ready yet");
                return;
            }
            if (rewarded != null && rewarded.isShowing()) {
                call.reject("Please close the reward ad first.");
                return;
            }
            if (rewarded != null) rewarded.invalidate();
            banner.showPrivacyOptions(error -> {
                if (error == null) call.resolve(privacyState());
                else call.reject(error);
            });
        });
    }

    @Override
    protected void handleOnResume() {
        if (banner != null) banner.resume();
        if (rewarded != null) rewarded.resume();
    }

    @Override
    protected void handleOnPause() {
        if (banner != null) banner.pause();
        if (rewarded != null) rewarded.pause();
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration config) {
        if (banner != null) banner.configurationChanged();
    }

    @Override
    protected void handleOnDestroy() {
        if (banner != null) banner.destroy();
        if (rewarded != null) rewarded.destroy();
    }
}
