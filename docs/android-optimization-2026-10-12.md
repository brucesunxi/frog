# Android Play recommendations — October 12, 2026

## Result

Release **1.0.13 / versionCode 14** addresses the useful parts of the three Play Console recommendations. It retains minSdk 24, target/compile SDK 36, the existing upload key and production advertising IDs.

## Window and layout changes

- Updated AndroidX Core from 1.12.0 to 1.17.0 and use the [recommended `WindowCompat.enableEdgeToEdge` API](https://developer.android.com/develop/ui/views/layout/edge-to-edge).
- MainActivity configures the window and its insets before Capacitor starts plugins. Layout protection no longer depends on the advertising controller starting successfully. The dark background extends behind transparent system bars; controls and the native banner stay within system-bar/display-cutout insets. System bars include desktop caption bars.
- White system icons suit the dark background. Keyboard insets and `adjustResize` keep content above the IME; the greater of keyboard/navigation inset is applied once.
- The screenshot did not expand the deprecated-API recommendation, so its exact reported callers are unknown. The recommended AndroidX compatibility helper itself still contains platform color/decor APIs for older Android versions, and the advertising SDK owns a separate full-screen window. This change does **not** prove the static deprecated-API warning will disappear. Upload the new AAB and inspect any remaining named callers before changing third-party compatibility code.

## R8 and measured package size

Enabled code minification/optimization, resource shrinking, `proguard-android-optimize.txt`, and AGP 8.13's optimized resource shrinking. Capacitor's consumer rules preserve plugin subclasses and annotated methods; app rules preserve JavaScript-interface methods, annotation metadata and useful stack-trace information. No blanket keep-all or ignore-all-warning rules were added. See [official R8 configuration guidance](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization).

| Measurement | 1.0.12 | 1.0.13 | Reduction |
| --- | ---: | ---: | ---: |
| Signed AAB | 17,783,803 bytes (16.96 MiB) | 16,298,672 bytes (15.54 MiB) | 8.4% |
| Uncompressed DEX | 16,054,524 bytes | 5,101,748 bytes | 68.2% |
| Compressed DEX in AAB | 6,191,428 bytes | 2,452,714 bytes | 60.4% |
| Android resources, uncompressed | 1,935,258 bytes | 1,207,586 bytes | 37.6% |

The new AAB additionally contains a 2.81 MiB compressed ProGuard mapping under `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`; it matches the generated release mapping. The AAB comparison includes this extra diagnostic metadata. These are package measurements, not claims about measured RAM, FPS or startup speed. [Raw metrics](android-optimization-2026-10-12/build-metrics.json).

## Verification

- Thirty JavaScript tests and three Android unit tests passed. Final `lintRelease` passed with existing warnings and no errors; signed bundle construction passed. The manifest decoded from the final AAB reports versionCode 14, versionName 1.0.13, minSdk 24 and targetSdk 36. JAR signature verification passed.
- Bundled HTML/CSS match the source. All three production advertising resources are present; demo publisher IDs and the local test-device hash are absent. The Release MainActivity bytecode contains no QA WebView debugging call.
- A separate **QA** build inherits Release's R8/resource settings and is non-debuggable, but uses the debug signing certificate, test ads and a QA-only WebView diagnostic switch. The same signature allowed an in-place update on Samsung SM-G9860 / Android 13 without deleting data. Use `npm run android:prepare`, then `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleQa`. Local paired test-device/ad-unit overrides apply to Debug and QA only.
- All 12 overlay pages passed portrait and landscape checks (24 combinations). Footer actions were visible/hittable, at least approximately 44 CSS px high, with no footer overflow. Outcome/invite/error pages used unsaved fixtures, rather than full campaign or two-player completion. [Page metrics](android-optimization-2026-10-12/page-metrics.json), [portrait](android-optimization-2026-10-12/portrait-menu.png), [landscape](android-optimization-2026-10-12/landscape-menu.png).
- Actual WebView touch input verified Start → briefing → gameplay, movement (column 9 → 8), pause, Shop → Coin Packs → gameplay, and scrolling with a stationary menu footer. [Touch results](android-optimization-2026-10-12/touch-results.log).
- Native privacy and pending-invite queries resolved; Billing reached the SDK and returned `Billing Unavailable` on the sideloaded test app. The native PNG share chooser opened and was cancelled. No purchase or invitation was sent. [Bridge results](android-optimization-2026-10-12/bridge-results.json).
- The demo banner loaded. A publisher rewarded unit with explicit registered-device **test mode** played through both ads and reached the SDK's reward-complete screen. One earned callback and one earned dismissal restored exactly **1 life, 1 Shield, 30 seconds**, and increased reward count from 0 to 1. The observer only read the result and paused gameplay; SDK/revive functions were not replaced. [Reward result](android-optimization-2026-10-12/reward-after.json), [SDK events](android-optimization-2026-10-12/sdk-events.log), [reward-complete screen](android-optimization-2026-10-12/reward-earned.png).
- A temporary input triggered the actual keyboard: WebView height changed from 707 to 434 CSS px, footer bottom stayed at 427.78 px, and height returned to 707 after dismissal. The temporary input was removed.
- Test fixtures disabled progress saving/synchronization. Restart restored the exact original saved state (300 coins, zero completed levels/reward count). Automatic rotation and the original 30-second timeout were restored; temporary ADB forwarding was removed.

## Remaining verification and delivery

Android 15/16 enforcement, gesture navigation, desktop/multi-window mode and other devices were not physically tested. The insets implementation covers their system-bar/cutout sources, but that is not a substitute for device validation. Google Play must rescan the new artifact to determine which recommendations remain. The test device did not require a UMP form; AdMob still reports no configured forms for the publisher app, so applicable consent messages and production ad fill remain separate account/region checks.

Upload: `android/app/build/outputs/bundle/release/frog-frenzy-1.0.13.aab`.

SHA-256: `021b796765004e73b1c90ba5e8862f0b084549ecd1fa75839177a9a36dbc0198`.
