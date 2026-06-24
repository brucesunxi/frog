# User login and progress sync

This project uses Google Sign-In plus a small Node/Express API.

The browser never connects to Neon directly. It receives a Google ID token, sends it to the server, and the server verifies it before creating a local session token.

## Environment

Copy `.env.example` to `.env` and fill:

```bash
DATABASE_URL=...
GOOGLE_CLIENT_IDS=web-client-id.apps.googleusercontent.com,android-client-id.apps.googleusercontent.com
JWT_SECRET=long-random-secret
PORT=3000
```

Do not commit `.env`.

## Database

Install dependencies and initialize Neon:

```bash
npm install
npm run db:init
```

The schema creates:

- `users`: one row per Google account
- `user_progress`: high score, levels beaten, per-level stars, combo, ad count

## Google OAuth

In Google Cloud Console:

1. Create an OAuth consent screen.
2. Create a Web OAuth client for the web version.
3. Add the Web client ID to `GOOGLE_CLIENT_IDS`.
4. For an Android app / Google Play release, create an Android OAuth client with your package name and signing certificate SHA-1.
5. Add the Android client ID to `GOOGLE_CLIENT_IDS` too.

The same `/api/auth/google` endpoint can accept ID tokens from the web version and the future Android app, as long as the client ID is in `GOOGLE_CLIENT_IDS`.

## Run

```bash
npm start
```

Open `http://127.0.0.1:3000/game.html`.

Without Google configuration, the game still works locally. With Google configuration, login appears on the home screen and progress syncs after login, level completion, game over, and ad count updates.

## Deploy to Vercel

The app is Vercel-ready:

- `/` and `/game.html` serve the static game page
- `/assets/*` serves static game assets
- `/api/*` routes to the Express handler in `api/index.js`
- Static assets are served from the repository root

Set these Vercel environment variables in Production:

```bash
DATABASE_URL=...
JWT_SECRET=long-random-secret
GOOGLE_CLIENT_IDS=web-client-id.apps.googleusercontent.com,android-client-id.apps.googleusercontent.com
```

Then deploy:

```bash
vercel --prod
```

If `GOOGLE_CLIENT_IDS` is not set yet, the game still loads, but Google login will stay disabled until the OAuth client ID is configured.
