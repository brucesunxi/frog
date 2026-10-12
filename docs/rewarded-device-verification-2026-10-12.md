# Rewarded video verification — October 12, 2026

## Outcome

Rewarded video loaded and played on the Samsung SM-G9860 (Android 13). Three real SDK playback sessions produced one earned callback and one rewarded dismissal each. The app revived exactly once per session. The first session was watched through both videos to the SDK's reward-complete screen before closing.

The failing Google demo unit remains a separate failing case. Its selected video/audio URLs on `asset.gvt1-cn.com` returned HTTP 200 without `Access-Control-Allow-Origin` even with an Origin header and the WebView cache disabled. The SDK rejected these materials and reported error 0 / Internal error. This establishes the immediate failure; it does not establish whether the upstream CDN or the network route caused the missing header.

Using the publisher's rewarded unit with this device explicitly registered for test ads loaded a different test creative successfully on the same phone and network. No video URL rewriting, CORS bypass, simulated Android reward, or production ad clicking was used.

## Reproducible test configuration

The debug build can use a publisher rewarded unit only together with a valid test-device hash. Configure both in the ignored, local `android/ads-test.properties` file:

```properties
frogAdsTestDeviceId=YOUR_32_CHARACTER_TEST_DEVICE_HASH
frogRewardedTestUnitId=ca-app-pub-9711589934416529/9365863824
```

The hash comes from the Mobile Ads SDK's test-device diagnostic in device logs. It is not committed. Gradle properties with the same names override the local file. Without local settings, debug builds continue to use Google's demo IDs. An incomplete pair fails the build. SDK test-device registration happens before initialization and ad requests; the rewarded controller also checks `AdRequest.isTestDevice()` before requesting the override unit.

This uses Google's documented [own ad unit plus registered test device](https://developers.google.com/admob/android/test-ads) workflow. Device logs confirmed “This request is sent from a test device” and both video screenshots show the test-ad label.

Release resources retain the publisher app/banner/rewarded IDs and an empty test-device value, regardless of these local debug settings. No release ad behavior was changed.

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
android/gradlew -p android assembleDebug
```

## Physical-device observations

The failed-run fixture used lives = 0, time = 0 and Shield = 0. Only saving/synchronization was temporarily disabled in the app WebView to preserve the user's progress. The native SDK request, full-screen presentation, earned callback, bridge promise, and application revive function were unchanged.

| Check | Observed result |
| --- | --- |
| Rewarded unit | `ca-app-pub-9711589934416529/9365863824`, registered test device |
| Loaded | SDK `Rewarded ad loaded`; test video visibly playing |
| Earned before dismissal | Game remained in AD state, lives/Shield/time/reward count still zero |
| First earned callback | 10:14:11.854 local time |
| First dismissal | 10:14:37.616, `earned=true` |
| After dismissal | PLAYING state; lives 1, Shield 1, time 30; failure overlay hidden |
| Reward count | 0 → 1; subsequent sessions 1 → 2 → 3 |
| Gameplay after revive | Real direction-pad touch moved frog row 14 → 13; timer continued 30 → 20 |
| Next request | Loaded again after each dismissal |
| Early exit | The supplied creative did not expose a usable exit before its reward condition. This is not counted as a physical-device pass for the unearned branch. Automated tests cover unearned, load/show failures and duplicate taps. |

Evidence:

- [Video playing](rewarded-device-verification-2026-10-12/video-playing.png)
- [SDK reward-complete screen](rewarded-device-verification-2026-10-12/reward-earned.png)
- [Revived gameplay](rewarded-device-verification-2026-10-12/revived-gameplay.png)
- [SDK event timestamps](rewarded-device-verification-2026-10-12/sdk-events.log)
- [First revive values](rewarded-device-verification-2026-10-12/earned-result.json), [movement](rewarded-device-verification-2026-10-12/movement-result.json), [third revive values](rewarded-device-verification-2026-10-12/repeat-result.json)

## Checks and limits

Thirty JavaScript tests and three Android unit tests passed. Debug assembly, Android Lint and Release resource processing passed. The packaged debug APK contains the intended publisher rewarded unit and test registration. Generated Release values contain no registered test device. An incomplete debug override was verified to fail the build.

This verifies test-ad playback and local revive delivery, not revenue-generating fill, server-side reward verification or regional consent flows. UMP logged that the publisher app has no configured message; applicable messages still need configuration in AdMob Privacy & messaging as noted in the release guide. The existing consent gate was preserved.

The final debug APK was installed and restarted to remove temporary fixtures. Original stored progress and 300-coin balance were checked after restart. The temporary screen timeout and ADB forwarding were restored/removed after testing.
