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
- Android SDK Platform 36
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

## AdMob banner (1.0.8 / versionCode 9)

- Release app ID: `ca-app-pub-9711589934416529~1311124306`.
- Release banner unit: `ca-app-pub-9711589934416529/3925834886`.
- Debug builds substitute Google's demo app and banner IDs automatically. Use a debug APK for testing; register physical devices as test devices in AdMob before testing a release build.
- A standard anchored adaptive banner occupies its own native row below the WebView, separated from controls by 12 dp. System bars and display cutouts are excluded. Rotation and window resizing recalculate the size; failed requests collapse the row and retry after 60 seconds while foregrounded.
- Mobile Ads 25.4.0 preserves the existing minSdk 23. Version 25.5.0 requires minSdk 24.
- Android Gradle Plugin 8.13.2 and Gradle 8.14.3 support the project's SDK 36 target and the advertising SDK's Kotlin 2.3 metadata.
- UMP 4.0.0 requests consent information on each launch and gates SDK initialization and ad requests with `canRequestAds()`. Configure and publish the applicable messages for this app in AdMob **Privacy & messaging**. An **Ad privacy settings** button appears in the main menu when UMP requires an options entry point.
- Before releasing, update Play Console's **Contains ads**, **Advertising ID**, and **Data safety** declarations to reflect Google Mobile Ads SDK data handling and the app's actual audience. The updated `privacy.html` must be published to the existing policy URL.
- Verify on a device: test banner loads, menus and direction pad remain usable, portrait/landscape and narrow windows fit, background/resume works, offline mode leaves gameplay usable, and applicable UMP forms/options work. An SDK build passing does not prove live ad fill or consent configuration.
- Verified on October 12, 2026: all 19 JavaScript tests and 3 Android unit tests passed; debug assembly and Lint passed. On a Samsung SM-G9860 (Android 13), Google demo banners loaded below the menu, briefing, gameplay, and pause screens; direction/pause controls and background/resume worked. This device did not require a consent form. Live ad fill, EEA/UK consent forms, rotation, and other screen sizes still need their own checks.

## AdMob rewarded revive (1.0.9 / versionCode 10)

- Release rewarded unit: `ca-app-pub-9711589934416529/9365863824`; console reward: `1 Revive`. Debug builds use Google's demo rewarded unit `ca-app-pub-3940256099942544/5224354917`.
- The optional **Free Reward Revive** button appears after a campaign failure. The existing nearby revive and Shield are granted only after the SDK's earned-reward callback and ad dismissal. A timed-out run receives 30 seconds so the revive is playable. Friend challenges do not offer rewards.
- A rewarded ad is preloaded after the shared UMP consent gate and SDK initialization. Cached ads expire after 55 minutes, each ad is shown once, foreground load failures retry after 60 seconds, and changing privacy choices invalidates the cache.
- No fill, show failure, and dismissal without earning preserve the failed run and show feedback. Repeated taps are blocked; Retry/Menu controls unlock when the flow finishes. Android never falls back to the browser's simulated ad.
- Test builds use demo ads; real-unit fill and region-specific consent configuration require separate verification. This revive is applied locally; no server-side reward validation is configured.
- Verification on October 12, 2026: 26 JavaScript tests and 3 Android unit tests passed; debug assembly, Lint, and signed release bundle passed. The Samsung test phone showed the real reward entry and handled unavailable ads without reviving or disabling Retry/Menu. Google demo rewarded requests returned SDK error 0 (Internal error); device logs showed CORS rejection for video/audio requests to asset.gvt1-cn.com from googleads.g.doubleclick.net. The same load error persisted after the user switched networks and after an app restart. Full video playback, early dismissal, and SDK reward delivery remain unverified on this device; investigate network/proxy routing before changing the integration. The phone's temporary screen-timeout change was restored to its original 30 seconds after testing.

## Notes

- Browser builds keep the preview coin card for testing.
- Android builds call the native `FrogBilling` plugin.
- Purchases are consumable coin packs. The backend records purchase tokens in `google_play_purchases` to prevent duplicate credits.

## Physical-device page improvements (1.0.10 / versionCode 11)

- Twelve overlay pages were inspected in portrait and landscape on the Samsung SM-G9860 with the native demo banner visible. Fixed headers/footers and independently scrolling content keep primary actions reachable; coin packs use a compact list; menu instructions collapse; clear/failure actions and pause sound labels are clearer.
- Scoped `/api` CORS permits the bundled Android `https://localhost` origin, including Authorization/Content-Type preflight, without wildcard access. Actual wallet session and live-room creation recovered after production deployment. Room errors offer retry, creation is single-flight, and stale responses after leaving are ignored.
- Thirty JavaScript tests pass, along with Android unit tests, Debug assembly and Lint. Physical WebView touch events verified start/movement/pause, shop → packs → return to gameplay, and menu scrolling with a stationary footer. All 24 overlay/orientation checks had visible, hittable footer buttons at least 44 CSS px high with no footer overflow. Outcome screens used temporary unsaved fixtures, rather than a full campaign playthrough. Native share chooser was opened and cancelled; no invitation was sent or payment completed.
- Signed release AAB assets match the final source; production app/banner/rewarded IDs are present and demo resource IDs absent. Real payment, two-device live challenge completion, regional consent forms, and rewarded video playback still require separate verification.
- Detailed scope, limitations and device screenshots: [mobile UI audit](mobile-ui-audit-2026-10-12.md).

## Rewarded video investigation follow-up (October 12, 2026)

- The failing fixed Google demo creative returned video/audio responses without the required CORS header. A publisher-unit request with explicit SDK test-device registration loaded and played successfully on the same phone/network.
- Local `android/ads-test.properties` can configure a paired `frogAdsTestDeviceId` and `frogRewardedTestUnitId` for Debug and R8-enabled QA. The file is ignored; incomplete overrides fail the build, and the SDK's test-device check must pass before requesting the override. Release resources always retain the real IDs and no test device.
- Three real SDK sessions earned and dismissed with one revive each. A timed-out run recovered 1 life, 1 Shield and 30 seconds; real direction-pad movement worked afterward. The failed-run fixtures did not save progress. Early unearned dismissal was not available with this creative and is covered by automated tests rather than claimed as physically verified.
- Thirty JavaScript tests, three Android unit tests, Debug assembly, Lint, Release resource isolation and the invalid-configuration guard passed. Full evidence and reproduction steps: [rewarded device verification](rewarded-device-verification-2026-10-12.md).

## Release 1.0.11 / versionCode 12

- Packages the native banner and rewarded revive integration, physical-device page improvements, wallet API CORS fix and friend-room retry recovery described above.
- Release uses the publisher app, banner and rewarded IDs. Local test-device settings are restricted to Debug/QA and excluded from Git and web deployment.
- Rewarded playback and revive delivery were verified with registered-device test ads. Revenue-generating fill and applicable AdMob consent messages require separate verification.
- Signed AAB: `android/app/build/outputs/bundle/release/frog-frenzy-1.0.11.aab` (17.00 MiB). SHA-256: `9da4c1667b5ece908cac2af0d4f58001311c4c8df5f6c5a91392eda933e258f6`.
- Release signature, version fields, bundled HTML/CSS and production advertising resources were checked; all 30 JavaScript tests passed for this package.

## Release 1.0.12 / versionCode 13

- Raises `minSdkVersion` from 23 to 24 to satisfy the enabled [Google Play automatic protection upload requirement](https://support.google.com/googleplay/android-developer/answer/10183279?hl=en). Android 7.0 or newer is now required; Android 6.0 devices are no longer supported by this release. Target/compile SDK remain 36.
- Uses the existing release signing key and production advertising IDs. The Mobile Ads SDK stays at the version already verified on the physical device.
- This supersedes the rejected 1.0.11 AAB. Upload `frog-frenzy-1.0.12.aab` instead.
- The manifest extracted from the actual AAB and decoded with AAPT2 reports minSdk 24, targetSdk 36, versionName 1.0.12 and versionCode 13. JAR signature verification passed; bundled web assets and production ad IDs match the source, with no demo publisher ID or local test-device hash.
- AAB SHA-256: `3435264a45be8e7c0ce49ff48eeefc19039e2632595a66d0b05959bcff57482a`.


## Release 1.0.13 / versionCode 14

- Centralizes edge-to-edge initialization and system-bar/cutout/keyboard insets in MainActivity before native plugins start; AndroidX Core is now 1.17.0. The native banner remains in its own protected row.
- Enables R8 code optimization and resource shrinking, preserving Capacitor's reflective plugin/JavaScript bridge entry points. The signed AAB shrank from 16.96 to 15.54 MiB; uncompressed DEX shrank 68.2%. Crash mapping is included in the AAB.
- Thirty JavaScript tests, three Android unit tests, final Release Lint and signed bundle checks passed. A non-debuggable QA APK with the same R8 settings passed 24 overlay/orientation checks, touch navigation, share-chooser opening/cancellation, banner loading and real rewarded-test playback/revive delivery on Samsung Android 13.
- Retains minSdk 24, target/compile SDK 36, existing upload signing and production ad IDs. Regional consent, real purchases, Android 15/16 device behavior and Play's remaining static warnings require their own validation; no claim is made that all three Console recommendations have disappeared.
- Signed AAB: `android/app/build/outputs/bundle/release/frog-frenzy-1.0.13.aab`. SHA-256: `021b796765004e73b1c90ba5e8862f0b084549ecd1fa75839177a9a36dbc0198`.
- Detailed measurements, scope and physical-device evidence: [Android optimization verification](android-optimization-2026-10-12.md).
