# Android Release Checklist

Frog Frenzy now has a Capacitor Android shell, a native Google Play Billing bridge, and a backend purchase verification endpoint.

## Google Play Console Setup

Create the app with package name:

```text
com.frogfrenzy.game
```

Create these one-time consumable in-app products:

```text
coins_starter
coins_1000
coins_5500
coins_12000
coins_26000
```

Grant a Play Console service account access to Android Publisher API for this app.

## Backend Environment

Set these in Vercel Production:

```text
GOOGLE_PLAY_PACKAGE_NAME=com.frogfrenzy.game
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64=<base64 encoded service account JSON>
```

The backend endpoint is:

```text
POST /api/purchases/google-play/verify
```

The Android app receives `purchaseToken` from Google Play Billing, sends it to this endpoint, and the backend verifies the token with Google Play Developer API before crediting coins.

## Android Build Environment

Install:

- JDK 17
- Android SDK Platform 35
- Android Build Tools

Set release signing variables:

```text
ANDROID_KEYSTORE_PATH=/absolute/path/to/release.keystore
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_ALIAS=...
ANDROID_KEY_PASSWORD=...
```

## Build AAB

```bash
npm run android:bundle
```

Expected output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Notes

- Browser builds keep the preview coin card for testing.
- Android builds call the native `FrogBilling` plugin.
- Purchases are consumable coin packs. The backend records purchase tokens in `google_play_purchases` to prevent duplicate credits.
