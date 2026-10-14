package com.frogfrenzy.game;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FrogBillingPlugin.class);
        registerPlugin(FrogSharePlugin.class);
        registerPlugin(FrogAdsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        // BridgeActivity has inflated the root, but has not started any plugins yet.
        // Insets must work even when advertising is unavailable or still initializing.
        WindowCompat.enableEdgeToEdge(getWindow());
        View root = findViewById(R.id.frog_ads_root);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), root);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(root);
        super.load();
        // Capacitor configures this while creating the bridge; QA overrides it last.
        if (BuildConfig.FROG_QA) WebView.setWebContentsDebuggingEnabled(true);
    }
}
