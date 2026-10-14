# Release Validation: 2026-10-13

Status: ANDROID 16 AND APPLE 38 SUBMITTED FOR STORE REVIEW.

The user subsequently reported testing complete and explicitly requested formal
publication. Automated tests are not a substitute for store-installed billing
checks; agent-verified real Google Play checkout remains unconfirmed.

## Publication Follow-Up: 2026-10-14 Morning

- User authorized formal release and specifically authorized withdrawing Apple
  Build 36 and resubmitting Build 38. Withdrawal completed; Build 38 is processed,
  available in the existing internal TestFlight group, and selected for version 1.0.
- Enabled the five EXISTING Android products. Each now has one active,
  backward-compatible standard purchase option; no duplicate products, Cloud
  projects, service accounts, keys, permissions, or database migrations were made.
  Product IDs and granted totals remain: coins_starter=300, coins_1000=1000,
  coins_5500=6000, coins_12000=14000, coins_26000=32000. Existing approved USD prices
  remain $0.99/$1.99/$4.99/$9.99/$19.99. Evidence:
  `test/artifacts/release-20261014/coin-products-active.jpg`.
- Promoted existing internal Android 16 (1.0.15) into a production release named
  `16 (1.0.15) - 100-Level Adventure`, with 100% rollout to existing target regions.
  Updated the default English listing from 8 levels to 100 levels/10 chapters and
  disclosed Android ads/optional coins. Replaced outdated illustrative screenshots
  with three actual shared-game UI captures (web renderer, 432x768); these are not
  represented as physical Android-device captures. Retained icon/feature artwork.
- Submitted exactly four Play changes: production 16, short description, full
  description, phone screenshots. Publishing overview confirms changes in review;
  managed publishing remains OFF. This is a review submission, not proof the new
  version is already publicly downloadable. Evidence:
  `test/artifacts/release-20261014/android16-submitted.jpg`.
- Updated Apple English promotion, description, and reviewer instructions: no
  login/demo account, bundled offline single-player, 100 levels, earned coins,
  iOS paid once/no ads/no IAP. Login-required and Game Center remain unchecked.
  Read-only privacy inspection found user ID/device ID/product interaction labels,
  consistent with backend installation identity and progress services; unchanged.
- Read-only pricing verification confirms US $0.99, 144 available regions/31
  excluded, with Mac and Vision Pro distribution unchecked. User subsequently
  explicitly authorized automatic post-review publication. Changed the selected
  release mode to automatic and saved successfully after submission. Evidence:
  `test/artifacts/release-20261014/apple38-auto-release.jpg`.
- Captured current native simulator UI for iPhone (1320x2868) and iPad
  (2064x2752), three images each, in `store-assets/screenshots/appstore-build38/`.
  Uploaded all six to Apple, replacing old 8-level image associations. App UI,
  iPad system date, and all new filenames are English. Old images remain in the
  Apple asset library; no permanent library deletion was performed.
- Debug simulator build succeeded. Low disk space (225 MiB) temporarily disrupted
  simulator loading; removed only reproducible Frog Android intermediates and iOS
  module/index caches. Preserved signed AAB/APK/archive/IPA and screenshots. Used
  dedicated Frog simulators, not the Pottery devices, for image capture. The Frog
  iPad language was changed to English for screenshots.
- No real paid purchase or refund was performed. User-reported gameplay testing
  does not establish that the newly activated coin products passed checkout,
  pending purchase, cancellation, fulfillment, or recovery on Google Play.
- Apple final validation accepted the screenshot sets and metadata. Submitted
  version 1.0 / binary 1.0.0 (38) successfully at about 08:23 Asia/Shanghai. The
  confirmation displays "Submitted 1 item"; new review submission ID:
  `57889853-61b6-4e3d-b5be-40c7df42973c`. No second withdrawal was required to change
  release mode. Reload verification confirms automatic release remains selected;
  submission details explicitly show 1.0.0 (38), Waiting for Review, submitted
  2026-10-14 08:23. Evidence:
  `test/artifacts/release-20261014/apple38-submitted.jpg`. Both platforms now await
  their store review outcomes. Closed only Frog's own simulator devices afterward.
- Remaining: await store review outcomes. Sources remain dirty/uncommitted:
  reconcile before future Git
  auto-deployments so old sources cannot replace the verified live backend.

## Follow-Up: 2026-10-14

- Android 16 (1.0.15), SHA256
  `708f897171b12101da99e12a0d7e5ca46f38e64878f8ec794d1819f1219b05a4`,
  was uploaded through the native file picker, saved, validated without an AD_ID
  error, and released to the existing internal track at 00:14 Asia/Shanghai.
  The page confirms "Released to internal testers" and latest version 16. No
  production app rollout was performed. Evidence:
  `test/artifacts/release-20261014/android16-internal-published.png`.
- Existing license testing uses the already-selected `jr-novel-tester-list` and
  RESPOND_NORMALLY. Read-only inspection confirms `sunxi0302@gmail.com` is in the
  list. No additional list, tester permission or Cloud account was created.
- The user has no physical Android device available and requested an emulator.
  No AVD or emulator package exists locally, and available disk space was about
  4.8 GiB. Android's documented startup minimum is 5 GB before installing images.
  The user then chose to defer installation and download the test app later.
  No emulator was installed and no device billing tests were claimed as passed.
- Candidate Vercel runtime logs showed 200 responses for configuration, session
  creation and progress sync. Promoted the previously authorized inventory-fix
  deployment `dpl_AYBjErBFHA3VnKFk92Z2SaEMY5Yo` to the game domain.
- Ran an actual HTTPS wallet round trip against the live game domain using only
  a new Release QA identity (`release_qa_20261014_e7fca751-d699-4bb0-a232-5c54fd998b8b`).
  All eight checks passed: catalog, starter grant 300, Shield purchase 60, replay
  without another debit, Shield use, use replay, ignoring stale progress financial
  data, and session recreation preserving coins 240/inventory 0. Existing users
  were not modified by the smoke test. This is not a Google Play cash purchase.
- Read the actual Play app-signing certificate association (not the upload key):
  `CC:62:F9:75:72:7A:AB:51:D9:96:BF:B4:6F:8B:E8:56:85:24:B0:E3:CC:C1:BF:F2:6F:A2:CB:86:6F:61:FF:D2`.
  Added the public `ANDROID_APP_LINK_FINGERPRINTS` Production variable to the same
  Frog project and redeployed the exact existing inventory-fix source. Current
  production deployment is `dpl_HKrFm1c4R71LKnd3yi9iejJ1RJsH`, URL
  `https://frog-hp5bg5ttd-brucesunxis-projects.vercel.app`. Dashboard confirms the
  live domain points to it. `verify-share-deployment.js` passes with that exact
  fingerprint and the friend-room JSON contract. Evidence:
  `test/artifacts/release-20261014/production-inventory-backend.png`.
- Live game SHA256 remains
  `4e45b1364234d1c7f8a9e446829cd0d6acab9f7b1a09f0a89d87529a9610996a`, matching
  the tested Android and iOS game resources. No database migration was repeated,
  no environment secrets were pulled and no protection bypass was created.
- Apple public submission still uses Build 36, waiting for review with manual
  release selected. The older `/private/tmp` Build 38 export was absent, so rebuilt
  the signed archive with Xcode 26.6 into ignored `.release-artifacts/` and exported
  an IPA. Actual IPA version is 38, and bundled HTML matches the game hash above.
  New IPA SHA256:
  `9a2de7dae0640a0385be3a172aa83aac01a3e4bfad21e4c9a91a5bff44bf187a`.
  Xcode upload completed successfully. App Store Connect's upload table confirms
  1.0.0 (38) is Processing, created October 14 at 00:29 Asia/Shanghai. Evidence:
  `test/artifacts/release-20261014/apple38-processing.png`. Processing completion
  and group availability remain pending. Archive and IPA:
  `.release-artifacts/FrogReleaseSigned38.xcarchive`,
  `.release-artifacts/FrogExport38/FrogRiverPortal.ipa`.
- Remaining: final device tests and Google Play zero-charge billing/recovery;
  five existing coin products are still drafts pending a ready billing test;
  real publisher authentication remains unverified. Apple final device testing,
  current screenshots/review metadata/privacy labels and replacing Build 36 are
  still release gates. Working sources also remain uncommitted; reconcile them
  before a future Git-triggered deployment so it cannot restore old code.

## Store Follow-Up After Inventory Fix

- Browser access was granted, then the user asked to wait again while another
  task uses it. Do not resume browser operations until it is available.
- Started replacing Android 15 in internal draft 12: removed it from the in-page
  draft (the artifact remains in the library), but did not save/publish this edit.
  Uploading Android 16 through the extension failed because file-URL access is
  not enabled. No extension permissions were changed. The native fallback was
  blocked because the foreground Chrome window belonged to an unrelated Google
  verification flow. No action was taken on that flow. Recheck the draft state
  before continuing; Android 16 is NOT confirmed uploaded.
- A fresh inventory-fix backend candidate was deployed successfully from
  `/private/tmp/frog-release-20261013-inventory-fix` using `--prod --skip-domain`:
  `dpl_AYBjErBFHA3VnKFk92Z2SaEMY5Yo`,
  `https://frog-wjt3pw13n-brucesunxis-projects.vercel.app`.
  CLI inspection reports Ready and no aliases on the candidate. It also confirms
  all three existing aliases (`frog-omega-rose`, `frog-brucesunxis-projects`,
  `frog-git-main-brucesunxis-projects`) still point to old deployment
  `dpl_sHid8s21cAWaigRqjBqhpfTYyqFq`. No promotion or database migration was done.
- An unauthenticated request to the candidate `/api/config` returned HTTP 302
  with Vercel Authentication protection. This is not an application/API test pass.
  No protection bypass was created and no secrets were downloaded. The logged-in
  browser is still needed for candidate UI verification and Play license testing.

## Inventory Fix Follow-Up

- No browser was accessed during the local inventory-fix work. See the later
  store follow-up above for the current browser and deployment status.
- Diagnosis: the earlier backend candidate deliberately included the old 8-level
  webpage, whose loadout only decremented local inventory. Both old and new servers
  return authoritative inventory during sync, so this is not evidence of a new
  backend regression. Already-installed old native clients require an app update;
  a server deployment cannot replace their bundled JavaScript. Do not trust old
  progress payloads as a way to rewrite wallet balances or inventory.
- The current client uses server inventory operations on Android and a separate
  local wallet on iOS/web preview. Fixed two additional recovery cases: retrying a
  committed purchase after a lost reply when sync now shows insufficient funds,
  and confirming a committed tool use after sync now shows zero stock. Both reuse
  the persisted operation ID. Pending tool confirmations remain selectable and
  cannot trigger a second purchase.
- Added real HTTP round-trip tests using the shipped client functions, actual
  session/progress/inventory routes and isolated local PostgreSQL. Buy/use/reload,
  stale legacy progress, lost replies and platform wallet isolation all pass.
- Final complete Node suite: **96 passed, 0 failed, 0 skipped**. Log:
  `/private/tmp/frog-full-tests-inventory.log`. All 100 campaign engine bot runs
  remain included. The QA database container was stopped after testing.
- Android Release native tests: 3 passed. Release lint: 0 errors, 31 warnings
  (manifest/style, unused resources, icons and tool-version suggestions). Signed
  AAB 16 (1.0.15) and optimized test-ad QA APK built successfully. Signing verification
  passes with the same self-signed/no-timestamp and JAR streaming-order warnings;
  final Google upload validation is still required. Build log:
  `/private/tmp/frog-android16-qa.log`.
- iOS signed Release archive and App Store export succeeded locally for 1.0.0 (38):
  `/private/tmp/FrogReleaseSigned38.xcarchive`, `/private/tmp/FrogExport38/FrogRiverPortal.ipa`.
  The exported IPA reports build 38 and contains the current bundled game, with no
  private configuration/key files detected by the filename audit.
- `scripts/prepare-release.js` now prepares a fresh, allowlisted deployment from
  current frontend and backend sources together, with content hashes. It excludes
  local configuration/native projects and rejects symlinks and existing output
  directories. This prevents reusing the previous mixed-version staging tree.
  Fresh candidate: `/private/tmp/frog-release-20261013-inventory-fix` (83 files).
- Source HTML, staged webpage, AAB game and exported IPA game match SHA256:
  `4e45b1364234d1c7f8a9e446829cd0d6acab9f7b1a09f0a89d87529a9610996a`.
  AAB SHA256: `708f897171b12101da99e12a0d7e5ca46f38e64878f8ec794d1819f1219b05a4`.
  IPA SHA256: `b96ed1e42833c120f452080c702ea12991169f3795ac9506eee0210bfcf21d0c`.
- These new native candidates supersede Android 15 and iOS 37 for the inventory
  fix, but have NOT been confirmed uploaded, installed on the phone or publicly
  released. The new backend candidate was deployed afterwards as recorded above.
  The older candidate deployment must not be promoted. Store-installed billing,
  final UI/device regression and real publisher authentication remain unverified.

## Passed

- Initial Node test suite with an isolated localhost PostgreSQL database: 85 passed,
  zero failures, zero skips. The database is not the production database.
- Actual campaign engine bot: all 100 levels completed without tools or collisions.
- Campaign geometry checked at three turtle-cycle offsets for every level.
- Atomic starter grants, concurrent spends, insufficient funds, inventory use,
  purchase-token deduplication, pending-to-purchased transitions and rollback tests.
- Client reward retry, offline earned-coin queues, failed spends and purchase recovery.
- Monotonic financial revisions and single-snapshot wallet/inventory reads prevent
  stale replies from restoring old balances or consumed items. Duplicate operations
  do not advance the revision; concurrent snapshot tests passed.
- All five product IDs, base amounts, bonuses and delivered totals match between
  frontend and backend catalogs.
- Purchase-route integration tests cover pending/cancelled receipts, provider
  failures, quantity/bonus crediting, concurrent replay, ownership, lost responses,
  and consumption recovery against the isolated database and a simulated publisher.
- Repeated start/tool/revive taps and late asynchronous replies are guarded against
  affecting a different run. Play localized-price queries retry after failure.
- Static HTTP serving denies project sources and private configuration.
- iOS local currency independence from Android financial APIs.
- Swift-executed iOS request allowlist tests, including traversal and wrong-method denial.
- iOS Debug simulator build after the request allowlist change: exit code 0.
- Android native unit tests, Release lint and optimized QA build passed again with
  localized-price changes. The iOS simulator build also passed; source HTML hashes
  match both native asset copies. Version 15 (1.0.14) signed Android candidate
  built successfully and was uploaded to the internal release draft. Archive inventory contains no
  private configuration/key files. Jarsigner verifies its signature, while noting
  self-signed/no-timestamp and ZIP streaming-order warnings; Play validation remains
  a release gate.
- iPhone simulator menu, briefing and level-one gameplay render in English. iPad
  13-inch simulator menu renders the 100-level campaign without visible overlap.
- iPad level start, directional control, pause and item shop were exercised. One
  Shield purchase changed local coins from 300 to 240 and inventory from 0 to 1,
  without a cash checkout. Fixed an iOS shop hint that incorrectly mentioned Coin
  Packs; all 12 shop tests passed after the fix and both native packages rebuilt.
- Samsung SM-G9860 has the QA app installed. The user reports playing without a
  crash. This does not establish store billing or full physical-device regression.
- Production database backup was checksummed, restored to an isolated local
  database and checked against row counts for all 16 public tables. The additive
  migration was rehearsed twice before application.
- Authorized production wallet migration committed successfully. Wallet financial
  data signatures were unchanged. Backup and credentials remain outside Git in a
  restricted private temporary directory.

## Configuration Progress

- Created a dedicated Google Cloud project: `frog-frenzy-play-20261013`.
- Created service account `frog-play-verifier` without Cloud project roles, with
  explicit user confirmation. Generated one JSON key, downloaded outside this repo.
- Enabled Google Play Android Developer API after explicit terms confirmation.
- Play Console app-scoped permission invitation was submitted with user approval;
  the Frog service account is active. No publishing permissions were requested.
- Added sensitive `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` to Production in the exact
  Vercel `brucesunxis-projects/frog` project. No deployment was triggered, so this
  does not yet prove the running backend can authenticate with Google.
- Saved all five Play products as drafts, with US prices verified individually:
  `coins_starter`: 300 / $0.99; `coins_1000`: 1,000 / $1.99;
  `coins_5500`: 5,500 + 500 / $4.99; `coins_12000`: 12,000 + 2,000 / $9.99;
  `coins_26000`: 26,000 + 6,000 / $19.99. Final list contains exactly five rows.
- Read-only duplicate check found one service account and one key in the dedicated
  Frog Cloud project. Cross-project historical authorization overlap is not proven
  absent; do not describe this as an audit of all Cloud projects.
- Local Google OAuth connectivity timed out before authentication. API access and
  store-installed purchases remain unverified.
- No private key content is recorded here or included in game resources.
- Backend candidate `dpl_4pRCA8uhr8JG5TVA7Q2fzq5y2Qh5` was built successfully with
  `--prod --skip-domain`. Main game domain still resolves to old deployment
  `dpl_sHid8s21cAWaigRqjBqhpfTYyqFq`. CLI nevertheless moved the secondary project
  alias; restoration to the original deployment succeeded. Direct terminal HTTP
  checks still time out, but browser-based candidate checks are now possible.
  No store resubmission or public store rollout was performed.
- Apple Build 36 was already waiting for review, submitted by the user. With user
  approval, release mode was changed to manual and saved. The public submission
  still references 36. Local version is now 37; unsigned and signed Release archives
  compiled successfully with current offline assets. Initial App Store export and
  signature checks failed while the Mac was locked. After unlocking, signature
  verification and App Store IPA export both succeeded without certificate changes.
  Final IPA version is 37 and its game HTML matches current source. IPA SHA256:
  `3fedd04536726d8651204fa0429038e7fcb70aff1babba71843233339507caff`.
  Xcode upload succeeded and Apple processing completed. Build 37 is available in
  the existing internal TestFlight group; test instructions were saved. The sole
  tester remains invited with no device/session recorded. The user has not found
  the invitation email and wants to postpone this test. Physical-device testing of
  37 therefore remains unverified; do not report it as passed.
- Candidate `/api/config` responded normally in the browser. A UI smoke test also
  verified a starter balance of 300, one Shield purchase for 60 coins, and a reload
  preserving balance 240 and inventory 1. However, starting with that Shield and
  reloading afterwards restored inventory 1. The preserved old frontend decrements
  inventory locally and calls progress sync, not `/api/inventory/use`. Compatibility
  must be resolved before backend promotion; do not call item consumption passed.
  Authenticated Google Play publisher access remains unverified.
- Android internal release draft 12 now contains verified 15 (1.0.14), release name
  and English test notes. AAB SHA256 is
  `9d7f4776bc1da2b9564ff52828534188289622cbdb15ebab20a45c695c0771f5`.
  Play parsed the upload; release validation initially blocked publishing with an
  AD_ID declaration/manifest error. Local packaged manifest, AAB, and Play artifact 15
  details all contain `com.google.android.gms.permission.AD_ID`; rebuilding merely
  to add this permission is not justified.
- Old Alpha artifact 3 (1.0.2) lacks AD_ID. The user explicitly authorized submitting
  its track pause after an earlier automatic approval block. Submitted exactly that
  one change; Play publishing overview now lists Alpha track pause under changes
  in review. This confirms submission, not that the pause is already effective.
  Production 14 and internal draft 15 remain unchanged. Proof:
  `/private/tmp/frog-alpha-pause-submitted.png`.
- After that submission, re-opening internal release 15 review shows ready to
  publish, no AD_ID error, and an enabled Save and publish button. No new manifest
  or advertising declaration change was needed and error checking was not disabled.
  The timing supports the old-track cause but does not independently prove Google's
  internal validation logic. Version 15 was deliberately left as a draft; no
  internal or public rollout occurred. Proof:
  `/private/tmp/frog-internal15-validation-clear.png`.
- The file-picker return to a Pottery archive was reproduced during native paste;
  direct path entry fixed it. Earlier attribution to another project operating the
  picker was not established. The correct Frog AAB was verified before upload.
- Read-only Play inspection confirms production and internal testing currently use
  version 14 (1.0.13). Existing selected tester list already includes the user's
  chosen tester email; no duplicate list or membership was created.
- Apple Business shows the paid agreement active, the bank account available and
  both submitted US tax forms in use. No financial details were changed.
- Frog US app price was verified as $0.99. The 31 excluded territories include all
  EU member states plus China mainland, Russia, Belarus and Vietnam. Mac and Vision
  Pro distribution are disabled. No territory or price edits were made.
- The dedicated local PostgreSQL QA container was stopped after the full tests.
- Vercel dashboard confirms current production deployment source is commit
  `af0c94399ebb6ba4a1c326d94b446eb46f7b9a76`, matching the preserved frontend
  in backend staging. Direct HTML retrieval timed out; no source-file tree exists.
- Vercel CLI's read request unexpectedly generated a deployment protection bypass
  token before failing on option forwarding. Token content was not printed/shared;
  the user authorized revocation and the dashboard now confirms an empty bypass
  secret list. Authentication protection remains enabled. No environment was pulled.

## Remaining Release Gates

- Recheck app-scoped Play permission details and verify API access without making
  real purchases or refunds. Reuse the existing account/key; do not recreate them.
- Activate the five existing product drafts only after the backend is ready for
  safe internal testing. Verify the license tester and internal test track.
- Confirm the submitted old Alpha pause has completed review before declaring the
  old track inactive. Version 15's advertising-ID validation blocker is now clear.
- Run Play-installed zero-charge purchase, cancellation, pending payment, recovery,
  duplicate receipt and consumption retry tests.
- Final Android QA rebuild and physical-device regression, including rewarded
  earning, early dismissal and applicable consent regions.
- Fresh iOS offline launch and iPhone/iPad interaction tests, then TestFlight device
  testing of the final candidate. Current simulator compilation alone is insufficient.
- Verify the deployed fresh inventory-fix candidate's UI/state, then promote
  only when safe for internal purchase testing. The previous mixed-version
  candidate is superseded. Old native clients need to update to the new build;
  the database migration is already done and must not be repeated unnecessarily.
- Assess remaining client-trust/abuse risks in earned-reward claims; bounded inputs
  and idempotency are not a complete anti-cheat system.
- Verify Android App Links against the actual Play app-signing certificate.
- Review final privacy declarations, review notes, support URLs and real screenshots.
- The organization still has an EU trader-compliance banner; keep current non-EU
  territory scope unless the user explicitly requests and resolves EU compliance.
- Replace the old Build 36 submission only after final release checks; Build 38
  supersedes uploaded 37 but is not yet uploaded or installed through TestFlight.
- Upload Android 16 and iOS 38 for internal verification, and recheck versions,
  bundled assets and production endpoints before either production submission.

## Reproduce Automated Tests

Set `FROG_QA_DATABASE_URL` to an isolated localhost PostgreSQL database whose name
ends with `_qa`, then run `npm test`. Without that variable, database coverage is
skipped; do not describe that run as complete database validation.

The Swift bridge test requires macOS/Xcode. Native billing and ad tests also need
the relevant store/test account and devices; they cannot be proven by this command.

## Environment Recovery

The first rerun failed because Docker was stopped and localhost PostgreSQL was
unavailable. After restoring the dedicated localhost-only container, all database
tests passed. A sandboxed Xcode invocation also failed on CoreSimulator/script
access; the authorized unsandboxed rebuild passed. Neither failure was hidden by
skipping tests.
