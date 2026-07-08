package com.frogfrenzy.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FrogBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
