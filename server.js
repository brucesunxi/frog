import 'dotenv/config';
import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = fileURLToPath(new URL('.', import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const sql = databaseUrl ? neon(databaseUrl) : null;
const googleClient = new OAuth2Client();

app.use(express.json({ limit: '128kb' }));
app.use(express.static(rootDir, { extensions: ['html'] }));

app.get('/', (req, res) => {
  res.sendFile('game.html', { root: rootDir });
});

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeLevelStars(value) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  for (const [key, raw] of Object.entries(value)) {
    const lvl = clampInt(key, 1, 99);
    const stars = clampInt(raw, 0, 3);
    if (stars > 0) result[lvl] = stars;
  }
  return result;
}

function normalizeProgress(progress = {}) {
  const levelStars = normalizeLevelStars(progress.levelStars);
  const totalStars = Object.values(levelStars).reduce((sum, stars) => sum + stars, 0);
  return {
    highScore: clampInt(progress.highScore, 0, 2_000_000_000),
    totalStars,
    levelsBeaten: clampInt(progress.levelsBeaten, 0, 99),
    levelStars,
    maxCombo: clampInt(progress.maxCombo, 0, 999),
    totalAdsWatched: clampInt(progress.totalAdsWatched, 0, 2_000_000_000)
  };
}

function toClientUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    pictureUrl: row.picture_url
  };
}

function signSession(userId) {
  return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: '30d' });
}

function requireServerConfig(req, res, next) {
  if (!sql || !jwtSecret) return res.status(503).json({ error: 'server_not_configured' });
  next();
}

async function requireAuth(req, res, next) {
  try {
    if (!jwtSecret) return res.status(503).json({ error: 'server_not_configured' });
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'missing_token' });
    const payload = jwt.verify(token, jwtSecret);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: googleClientIds[0] || '' });
});

app.post('/api/auth/google', requireServerConfig, async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'missing_credential' });
    if (!googleClientIds.length) return res.status(503).json({ error: 'google_not_configured' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientIds
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email || !payload.email_verified) return res.status(401).json({ error: 'invalid_google_token' });

    const rows = await sql`
      insert into users (google_sub, email, name, picture_url, last_login_at, updated_at)
      values (${payload.sub}, ${payload.email}, ${payload.name || null}, ${payload.picture || null}, now(), now())
      on conflict (google_sub) do update set
        email = excluded.email,
        name = excluded.name,
        picture_url = excluded.picture_url,
        last_login_at = now(),
        updated_at = now()
      returning id, email, name, picture_url
    `;
    const user = rows[0];
    await sql`
      insert into user_progress (user_id)
      values (${user.id})
      on conflict (user_id) do nothing
    `;

    res.json({ token: signSession(user.id), user: toClientUser(user) });
  } catch (error) {
    console.error('Google auth failed:', error);
    res.status(401).json({ error: 'google_auth_failed' });
  }
});

app.get('/api/me', requireServerConfig, requireAuth, async (req, res) => {
  const rows = await sql`
    select id, email, name, picture_url
    from users
    where id = ${req.userId}
  `;
  if (!rows.length) return res.status(404).json({ error: 'user_not_found' });
  res.json({ user: toClientUser(rows[0]) });
});

app.get('/api/progress', requireServerConfig, requireAuth, async (req, res) => {
  const rows = await sql`
    select high_score, total_stars, levels_beaten, level_stars, max_combo, total_ads_watched
    from user_progress
    where user_id = ${req.userId}
  `;
  if (!rows.length) return res.json({ progress: normalizeProgress() });
  const row = rows[0];
  res.json({
    progress: {
      highScore: row.high_score,
      totalStars: row.total_stars,
      levelsBeaten: row.levels_beaten,
      levelStars: row.level_stars || {},
      maxCombo: row.max_combo,
      totalAdsWatched: row.total_ads_watched
    }
  });
});

app.put('/api/progress', requireServerConfig, requireAuth, async (req, res) => {
  const incoming = normalizeProgress(req.body?.progress);
  const rows = await sql`
    insert into user_progress (user_id, high_score, total_stars, levels_beaten, level_stars, max_combo, total_ads_watched, updated_at)
    values (${req.userId}, ${incoming.highScore}, ${incoming.totalStars}, ${incoming.levelsBeaten}, ${JSON.stringify(incoming.levelStars)}, ${incoming.maxCombo}, ${incoming.totalAdsWatched}, now())
    on conflict (user_id) do update set
      high_score = greatest(user_progress.high_score, excluded.high_score),
      levels_beaten = greatest(user_progress.levels_beaten, excluded.levels_beaten),
      max_combo = greatest(user_progress.max_combo, excluded.max_combo),
      total_ads_watched = greatest(user_progress.total_ads_watched, excluded.total_ads_watched),
      level_stars = coalesce((
        select jsonb_object_agg(key, greatest(coalesce((user_progress.level_stars ->> key)::int, 0), coalesce((excluded.level_stars ->> key)::int, 0)))
        from (
          select jsonb_object_keys(user_progress.level_stars || excluded.level_stars) as key
        ) keys
      ), '{}'::jsonb),
      updated_at = now()
    returning high_score, levels_beaten, level_stars, max_combo, total_ads_watched
  `;
  const row = rows[0];
  const mergedStars = normalizeLevelStars(row.level_stars);
  const totalStars = Object.values(mergedStars).reduce((sum, stars) => sum + stars, 0);
  await sql`
    update user_progress
    set total_stars = ${totalStars}
    where user_id = ${req.userId}
  `;
  res.json({
    progress: {
      highScore: row.high_score,
      totalStars,
      levelsBeaten: row.levels_beaten,
      levelStars: mergedStars,
      maxCombo: row.max_combo,
      totalAdsWatched: row.total_ads_watched
    }
  });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Frog Frenzy server listening on http://127.0.0.1:${port}`);
  });
}
