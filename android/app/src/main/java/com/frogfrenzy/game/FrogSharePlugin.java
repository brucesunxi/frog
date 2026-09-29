package com.frogfrenzy.game;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "FrogShare")
public class FrogSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        String title = call.getString("title", "Frog Frenzy challenge");
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String imageDataUrl = call.getString("imageDataUrl", "");
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.putExtra(Intent.EXTRA_SUBJECT, title);
        intent.putExtra(Intent.EXTRA_TEXT, url.isEmpty() ? text : text + "\n" + url);
        try {
            if (!imageDataUrl.isEmpty() && imageDataUrl.contains(",")) {
                String encoded = imageDataUrl.substring(imageDataUrl.indexOf(',') + 1);
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                File shareDir = new File(getContext().getCacheDir(), "share");
                if (!shareDir.exists() && !shareDir.mkdirs()) throw new IllegalStateException("Cannot create share cache");
                File image = new File(shareDir, "frog-challenge.png");
                try (FileOutputStream output = new FileOutputStream(image)) {
                    output.write(bytes);
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", image);
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.setType("image/png");
            } else {
                intent.setType("text/plain");
            }
            getActivity().startActivity(Intent.createChooser(intent, title));
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to share challenge", error);
        }
    }

    @PluginMethod
    public void getPendingChallenge(PluginCall call) {
        String launchToken = tokenFromIntent(getActivity().getIntent());
        if (!launchToken.isEmpty()) {
            String launchKind = kindFromIntent(getActivity().getIntent());
            getActivity().getIntent().setData(null);
            resolveToken(call, launchToken, "app_link", launchKind);
            return;
        }
        boolean checked = getContext().getSharedPreferences("frog_growth", 0).getBoolean("install_referrer_checked", false);
        if (checked) {
            resolveToken(call, "", "none", "");
            return;
        }
        InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                String token = "";
                String kind = "";
                try {
                    if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                        ReferrerDetails details = client.getInstallReferrer();
                        token = FrogChallengeParser.tokenFromReferrer(details.getInstallReferrer());
                        kind = FrogChallengeParser.kindFromReferrer(details.getInstallReferrer());
                    }
                } catch (Exception ignored) {
                } finally {
                    getContext().getSharedPreferences("frog_growth", 0).edit().putBoolean("install_referrer_checked", true).apply();
                    client.endConnection();
                }
                resolveToken(call, token, token.isEmpty() ? "none" : "install_referrer", kind);
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
            }
        });
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        String token = tokenFromIntent(intent);
        if (!token.isEmpty()) {
            JSObject payload = new JSObject();
            payload.put("token", token);
            payload.put("source", "app_link");
            payload.put("kind", kindFromIntent(intent));
            notifyListeners("challengeOpen", payload, true);
        }
    }

    private String tokenFromIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return "";
        return FrogChallengeParser.tokenFromPath(intent.getData().getPath());
    }

    private String kindFromIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return "";
        return FrogChallengeParser.kindFromPath(intent.getData().getPath());
    }

    private void resolveToken(PluginCall call, String token, String source, String kind) {
        JSObject result = new JSObject();
        result.put("token", token);
        result.put("source", source);
        result.put("kind", kind);
        call.resolve(result);
    }
}
