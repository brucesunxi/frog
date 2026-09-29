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
PUBLIC_APP_URL=https://frog-omega-rose.vercel.app
ANDROID_APP_LINK_FINGERPRINTS=<Play App Signing SHA-256 fingerprint>
```

The backend endpoint is:

```text
POST /api/purchases/google-play/verify
```

The Android app receives `purchaseToken` from Google Play Billing, sends it to this endpoint, and the backend verifies the token with Google Play Developer API before crediting coins.

## Friend Challenge Setup

Apply the idempotent database schema before deploying the challenge API:

```bash
npm run db:init
```

`ANDROID_APP_LINK_FINGERPRINTS` accepts comma-separated SHA-256 certificate fingerprints. Use the App signing key certificate fingerprint from Play Console, not only a local upload/debug certificate. After deployment, verify that `/.well-known/assetlinks.json` returns the production fingerprint and that both `/c/{token}` and `/r/{token}` are routed to the API.

The Android build uses the Play Install Referrer library to restore `challenge_token` for asynchronous score challenges and `room_token` for live friend rooms after installation. Test both a clean Play install and an already-installed App Link before rollout. Live rooms poll the backend while waiting, let only the host start, and use a server-issued start time for the shared countdown.

After deployment, run the production gate with the Play App Signing fingerprint:

```bash
ANDROID_APP_LINK_FINGERPRINT="AA:BB:..." npm run verify:share-deployment
```

The command fails unless the verified package and fingerprint are present and the live friend-room API returns its expected JSON contract.

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
