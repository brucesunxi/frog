# Frog Frenzy Google Play App Plan

This plan turns the current browser game into a Google Play-ready app with no visible login flow, a server-authoritative wallet, item spending, and expandable level progression.

## Product Direction

- Remove email/login UI from the game.
- Use Google Play Games Services identity in the Android app.
- Use a local install ID only as a web-preview fallback.
- Use Google Play Billing one-time consumable products for coin packs.
- Store wallet balance, purchase history, item spending, and level progress in Neon.
- Keep all coin grants and spends server-authoritative.

## Identity

The player should not see a login/register screen.

Web preview:

- `installId` is created in `localStorage`.
- `/api/play/session` creates a `players` row and returns a player JWT.

Google Play app:

- Android obtains the Play Games player identity.
- Android sends `playGamesPlayerId` and an install ID to `/api/play/session`.
- Backend stores only a SHA-256 hash of the Play Games player ID.
- Future hardening should verify Play Games identity server-side before trusting it for paid accounts.

## Economy

Coin packs:

- `coins_starter`: 300 coins
- `coins_1000`: 1000 coins
- `coins_5500`: 5500 coins
- `coins_12000`: 12000 coins
- `coins_26000`: 26000 coins

Items:

- `shield`: 60 coins
- `slowmo`: 80 coins
- `superJump`: 70 coins
- `extraLife`: 90 coins
- `secondChance`: 120 coins
- `revive`: 100 coins

Backend tables:

- `players`
- `wallets`
- `coin_ledger`
- `inventory`
- `item_spends`
- `google_play_purchases`
- `level_progress`
- `level_attempts`

## Google Play Billing Flow

1. Client loads product details from Google Play Billing.
2. Player buys a coin pack.
3. Client receives `productId` and `purchaseToken`.
4. Client posts them to `/api/purchases/google-play/verify`.
5. Backend verifies the purchase with Google Play Developer API.
6. Backend rejects reused purchase tokens.
7. Backend grants coins in `wallets`.
8. Backend writes a `coin_ledger` row.
9. Backend consumes or acknowledges the purchase.
10. Client refreshes `/api/player/state`.

The current `/api/purchases/google-play/verify` endpoint intentionally returns `501` until Play Billing credentials and Android product IDs are configured.

## Level Roadmap

Ship 40 designed levels in 5 chapters:

- Chapter 1: New player onboarding, wide lanes, clear rhythm.
- Chapter 2: Faster roads, alternating traffic windows.
- Chapter 3: River mastery, short logs, reverse currents.
- Chapter 4: Time pressure, denser hazards, bonus bait.
- Chapter 5: Expert challenge, tight timing, item-friendly recovery moments.

Each level should track:

- attempts
- deaths
- best score
- best remaining time
- stars
- coins spent
- items used

The game should recommend items after specific failure patterns:

- road collision: shield
- water/dead gap: super jump
- swept off-screen: slow motion
- final target failed: revive
- low time: slow motion or extra life

## Implementation Phases

1. Web economy foundation
   - Done: no-login session endpoint
   - Done: wallet and ledger schema
   - Done: item prices and spend endpoint
   - Done: ad UI replaced with coin UI

2. Progress telemetry
   - Add attempt start events.
   - Add item-used telemetry per run.
   - Add level analytics dashboards later.

3. Google Play Billing
   - Create Play Console one-time products.
   - Add Android Billing Library.
   - Implement server-side purchase verification.
   - Consume coin-pack purchases after granting.

4. Google Play Games
   - Add silent sign-in.
   - Send verified player identity to `/api/play/session`.
   - Migrate web install users only if needed for testing.

5. Full app polish
   - Expand to 40 levels.
   - Tune coin economy.
   - Add refund/reconciliation jobs.
   - Add Play Integrity checks around purchases and wallet actions.
