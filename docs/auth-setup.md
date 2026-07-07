# Legacy auth note

The browser Google Sign-In flow has been removed.

Frog Frenzy is now planned as a no-visible-login Google Play app:

- Web preview uses a generated install ID.
- Android should use Google Play Games Services identity.
- Wallet, inventory, purchases, and level progress are stored through the backend.
- Google Play Billing will be used for coin packs.

See `docs/google-play-app-plan.md` for the current product and technical plan.
