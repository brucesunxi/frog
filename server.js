import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import {
  CHALLENGE_RULES_VERSION,
  buildPlayStoreUrl,
  buildRoomPlayStoreUrl,
  compareChallengeResults,
  createChallengeSeed,
  createChallengeToken,
  escapeHtml,
  normalizeChallengeResult,
  normalizeChallengeToken
} from './lib/challenge-core.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = fileURLToPath(new URL('.', import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const sql = databaseUrl ? neon(databaseUrl) : null;
const googlePlayPackageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.frogfrenzy.game';
const publicAppUrl = String(process.env.PUBLIC_APP_URL || 'https://frog-omega-rose.vercel.app').replace(/\/$/, '');
const roomCountdownSeconds = Math.max(1, Math.min(10, Number.parseInt(process.env.ROOM_COUNTDOWN_SECONDS || '5', 10) || 5));
let androidPublisherPromise = null;

const STARTER_COINS = 300;
const MAX_LEVELS = 40;
const MAX_CHALLENGES_PER_HOUR = 20;
const MAX_CHALLENGE_ATTEMPTS_PER_HOUR = 60;
const MAX_CHALLENGE_ROOMS_PER_HOUR = 10;

const STORE_PRODUCTS = [
  { id: 'coins_starter', kind: 'coins', coins: 300, bonus: 0, label: 'Starter Coin Pack', googlePlayProductId: 'coins_starter' },
  { id: 'coins_1000', kind: 'coins', coins: 1000, bonus: 0, label: 'Small Coin Pouch', googlePlayProductId: 'coins_1000' },
  { id: 'coins_5500', kind: 'coins', coins: 5500, bonus: 500, label: 'Adventure Coin Pack', googlePlayProductId: 'coins_5500' },
  { id: 'coins_12000', kind: 'coins', coins: 12000, bonus: 2000, label: 'Challenge Coin Chest', googlePlayProductId: 'coins_12000' },
  { id: 'coins_26000', kind: 'coins', coins: 26000, bonus: 6000, label: 'Master Coin Vault', googlePlayProductId: 'coins_26000' }
];

const STORE_PRODUCTS_BY_PLAY_ID = Object.fromEntries(
  STORE_PRODUCTS.map((product) => [product.googlePlayProductId, product])
);

const ITEM_CATALOG = {
  shield: { id: 'shield', name: 'Shield', cost: 60, description: 'Blocks one lethal collision' },
  slowmo: { id: 'slowmo', name: 'Slow Motion', cost: 80, description: 'Slows hazards for 10 seconds' },
  superJump: { id: 'superJump', name: 'Super Jump', cost: 70, description: 'Grants 3 two-tile jumps' },
  secondChance: { id: 'secondChance', name: 'Second Chance', cost: 120, description: 'Revives nearby after one mistake' },
  extraLife: { id: 'extraLife', name: 'Extra Life', cost: 90, description: 'Adds one life for this run' },
  revive: { id: 'revive', name: 'Continue Run', cost: 100, description: 'Revives nearby with Shield' }
};

app.use(express.json({ limit: '128kb' }));
app.use(express.static(rootDir, { extensions: ['html'] }));
app.set('trust proxy', 1);

app.get('/', (req, res) => {
  res.sendFile('game.html', { root: rootDir });
});

app.get('/.well-known/assetlinks.json', (req, res) => {
  const fingerprints = String(process.env.ANDROID_APP_LINK_FINGERPRINTS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  res.type('application/json').send(JSON.stringify(fingerprints.length ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: googlePlayPackageName,
      sha256_cert_fingerprints: fingerprints
    }
  }] : []));
});

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function hashStableId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeInstallId(value) {
  const text = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{16,80}$/.test(text) ? text : '';
}

function getGooglePlayCredentials() {
  const inlineJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const base64Json = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64;
  if (inlineJson) return JSON.parse(inlineJson);
  if (base64Json) return JSON.parse(Buffer.from(base64Json, 'base64').toString('utf8'));
  return null;
}

function getAndroidPublisher() {
  if (!androidPublisherPromise) {
    androidPublisherPromise = (async () => {
      const credentials = getGooglePlayCredentials();
      if (!credentials) return null;
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/androidpublisher']
      });
      return google.androidpublisher({ version: 'v3', auth });
    })();
  }
  return androidPublisherPromise;
}

function signSession(playerId) {
  return jwt.sign({ sub: playerId, typ: 'player' }, jwtSecret, { expiresIn: '365d' });
}

function requireServerConfig(req, res, next) {
  if (!sql || !jwtSecret) return res.status(503).json({ error: 'server_not_configured' });
  next();
}

async function requirePlayer(req, res, next) {
  try {
    if (!jwtSecret) return res.status(503).json({ error: 'server_not_configured' });
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'missing_token' });
    const payload = jwt.verify(token, jwtSecret);
    if (payload?.typ !== 'player') return res.status(401).json({ error: 'invalid_token' });
    req.playerId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

function normalizeLevelStars(value) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  for (const [key, raw] of Object.entries(value)) {
    const lvl = clampInt(key, 1, MAX_LEVELS);
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
    levelsBeaten: clampInt(progress.levelsBeaten, 0, MAX_LEVELS),
    levelStars,
    maxCombo: clampInt(progress.maxCombo, 0, 999)
  };
}

async function attributeReferral(playerId, rawToken, source = 'web') {
  const token = normalizeChallengeToken(rawToken);
  const cleanSource = ['app_link', 'install_referrer', 'manual', 'web'].includes(source) ? source : 'web';
  if (!token) return false;
  const challenge = await sql`
    select 1 from challenges where public_token = ${token} and owner_player_id <> ${playerId}
    union all
    select 1 from challenge_rooms where public_token = ${token} and host_player_id <> ${playerId}
    limit 1
  `;
  if (!challenge.length) return false;
  const inserted = await sql`
    insert into referral_attributions (player_id, share_token, source)
    values (${playerId}, ${token}, ${cleanSource})
    on conflict (player_id) do nothing
    returning player_id
  `;
  return inserted.length > 0;
}

function publicChallenge(row) {
  return {
    token: row.public_token,
    ownerName: row.display_name || `Frog ${row.public_token.slice(0, 4)}`,
    seed: row.seed,
    rulesVersion: row.rules_version,
    mapId: row.map_id,
    target: {
      rescues: row.target_rescues,
      elapsedMs: row.target_elapsed_ms,
      deaths: row.target_deaths
    },
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: new Date(row.expires_at).getTime() <= Date.now()
  };
}

async function findChallenge(token) {
  const rows = await sql`
    select c.*, p.display_name
    from challenges c
    join players p on p.id = c.owner_player_id
    where c.public_token = ${token}
  `;
  return rows[0] || null;
}

async function findChallengeRoom(token) {
  const rows = await sql`
    select r.*,
      hp.display_name as host_display_name,
      gp.display_name as guest_display_name,
      hr.status as host_member_status,
      hr.rescues as host_rescues,
      hr.elapsed_ms as host_elapsed_ms,
      hr.deaths as host_deaths,
      hr.last_seen_at as host_last_seen_at,
      gr.status as guest_member_status,
      gr.rescues as guest_rescues,
      gr.elapsed_ms as guest_elapsed_ms,
      gr.deaths as guest_deaths,
      gr.last_seen_at as guest_last_seen_at
    from challenge_rooms r
    join players hp on hp.id = r.host_player_id
    left join players gp on gp.id = r.guest_player_id
    left join challenge_room_players hr on hr.room_id = r.id and hr.role = 'host'
    left join challenge_room_players gr on gr.room_id = r.id and gr.role = 'guest'
    where r.public_token = ${token}
  `;
  return rows[0] || null;
}

function roomResult(row, role) {
  const rescues = row[`${role}_rescues`];
  if (row[`${role}_member_status`] !== 'finished' || rescues === null || rescues === undefined) return null;
  return {
    rescues: Number(rescues),
    elapsedMs: Number(row[`${role}_elapsed_ms`]),
    deaths: Number(row[`${role}_deaths`])
  };
}

function rowMemberFinished(row, role) {
  return row[`${role}_member_status`] === 'finished';
}

function publicChallengeRoom(row, viewerId = null) {
  const hostResult = roomResult(row, 'host');
  const guestResult = roomResult(row, 'guest');
  let winnerRole = null;
  if (hostResult && guestResult) {
    const hostOutcome = compareChallengeResults(hostResult, guestResult);
    winnerRole = hostOutcome === 'tie' ? 'tie' : (hostOutcome === 'win' ? 'host' : 'guest');
  }
  const viewerRole = viewerId && viewerId === row.host_player_id
    ? 'host'
    : (viewerId && viewerId === row.guest_player_id ? 'guest' : null);
  const viewerOutcome = !viewerRole || !winnerRole
    ? null
    : (winnerRole === 'tie' ? 'tie' : (winnerRole === viewerRole ? 'win' : 'loss'));
  return {
    token: row.public_token,
    seed: row.seed,
    rulesVersion: row.rules_version,
    mapId: row.map_id,
    status: row.status,
    startsAt: row.starts_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    expired: new Date(row.expires_at).getTime() <= Date.now(),
    serverNow: new Date().toISOString(),
    viewerRole,
    viewerOutcome,
    winnerRole,
    participants: {
      host: {
        name: row.host_display_name || `Frog ${row.public_token.slice(0, 4)}`,
        result: hostResult
      },
      guest: row.guest_player_id ? {
        name: row.guest_display_name || 'Friend Frog',
        result: guestResult
      } : null
    }
  };
}

function renderInstallGuide(storeUrl, intentUrl, cta) {
  return `<a class="cta" href="${escapeHtml(storeUrl)}">${escapeHtml(cta)}</a><a class="secondary" href="${escapeHtml(intentUrl)}">Already installed? Open in Frog Frenzy</a><section class="guide"><strong>How to join</strong><ol><li>Install Frog Frenzy from Google Play.</li><li>Open the game after installation.</li><li>This invite returns automatically so you can join.</li></ol></section>`;
}

function renderChallengeLanding(challenge) {
  const token = challenge.public_token;
  const owner = escapeHtml(challenge.display_name || `Frog ${token.slice(0, 4)}`);
  const rescues = Number(challenge.target_rescues) || 0;
  const title = `${owner} rescued ${rescues} frog${rescues === 1 ? '' : 's'}. Can you beat it?`;
  const shareUrl = `${publicAppUrl}/c/${token}`;
  const storeUrl = buildPlayStoreUrl(token, googlePlayPackageName);
  const intentUrl = `intent://${new URL(publicAppUrl).host}/c/${token}#Intent;scheme=https;package=${googlePlayPackageName};end`;
  const expired = new Date(challenge.expires_at).getTime() <= Date.now();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="60 seconds. Same map. No boosts."><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="60 seconds. Same map. No boosts."><meta property="og:url" content="${escapeHtml(shareUrl)}"><meta property="og:image" content="${publicAppUrl}/store-assets/frog-frenzy-feature-graphic-1024x500.png"><meta name="twitter:card" content="summary_large_image"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#050814;color:#dfe6e9;font-family:Inter,system-ui,sans-serif}.panel{width:min(520px,100%);padding:30px;border-radius:24px;background:#16213e;text-align:center;box-shadow:0 24px 70px #0009}.frog{font-size:70px}.eyebrow{color:#00d38f;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{color:#ffd700;font-size:clamp(30px,8vw,48px);margin:10px 0}.score{font-size:64px;font-weight:900;color:white}.rules{color:#b8c2cc;margin:10px 0 24px}.cta{display:block;padding:16px 22px;border-radius:15px;background:linear-gradient(135deg,#ffd700,#f39c12);color:#172033;text-decoration:none;font-weight:900;font-size:19px}.secondary{display:block;margin-top:16px;color:#b8c2cc}.guide{margin-top:24px;padding:16px;border-radius:14px;background:#0b1226;text-align:left}.guide ol{margin:10px 0 0;padding-left:22px;color:#b8c2cc;line-height:1.7}.expired{color:#ff7675;margin:12px 0}</style></head><body><main class="panel"><div class="frog">🐸</div><div class="eyebrow">Frog Frenzy challenge</div><h1>${owner} challenges you</h1><div class="score">${rescues}</div><div>frogs rescued</div><p class="rules">60 seconds · Same map · No boosts</p>${expired ? '<p class="expired">This challenge has expired. Start a fresh one in the game.</p>' : renderInstallGuide(storeUrl, intentUrl, `Get the game & beat ${rescues}`)}</main></body></html>`;
}

function renderRoomLanding(room) {
  const token = room.public_token;
  const owner = escapeHtml(room.host_display_name || `Frog ${token.slice(0, 4)}`);
  const title = `${owner} is waiting to play Frog Frenzy with you`;
  const shareUrl = `${publicAppUrl}/r/${token}`;
  const storeUrl = buildRoomPlayStoreUrl(token, googlePlayPackageName);
  const intentUrl = `intent://${new URL(publicAppUrl).host}/r/${token}#Intent;scheme=https;package=${googlePlayPackageName};end`;
  const expired = new Date(room.expires_at).getTime() <= Date.now();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="Join a live 60-second friend challenge."><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="Join the room, then start together. Same map. No boosts."><meta property="og:url" content="${escapeHtml(shareUrl)}"><meta property="og:image" content="${publicAppUrl}/store-assets/frog-frenzy-feature-graphic-1024x500.png"><meta name="twitter:card" content="summary_large_image"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#050814;color:#dfe6e9;font-family:Inter,system-ui,sans-serif}.panel{width:min(520px,100%);padding:30px;border-radius:24px;background:#16213e;text-align:center;box-shadow:0 24px 70px #0009}.frog{font-size:70px}.eyebrow{color:#00d38f;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h1{color:#ffd700;font-size:clamp(29px,8vw,46px);margin:10px 0}.waiting{margin:18px auto;padding:14px;border-radius:14px;background:#0b3b37;color:#55efc4;font-weight:800}.rules{color:#b8c2cc;margin:10px 0 24px}.cta{display:block;padding:16px 22px;border-radius:15px;background:linear-gradient(135deg,#ffd700,#f39c12);color:#172033;text-decoration:none;font-weight:900;font-size:19px}.secondary{display:block;margin-top:16px;color:#b8c2cc}.guide{margin-top:24px;padding:16px;border-radius:14px;background:#0b1226;text-align:left}.guide ol{margin:10px 0 0;padding-left:22px;color:#b8c2cc;line-height:1.7}.expired{color:#ff7675;margin:12px 0}</style></head><body><main class="panel"><div class="frog">🐸</div><div class="eyebrow">Live friend room</div><h1>${owner} is waiting for you</h1><div class="waiting">Join the room · Start together · Compare live results</div><p class="rules">60 seconds · Same map · 3 lives · No boosts</p>${expired ? '<p class="expired">This room has expired. Ask your friend for a new link.</p>' : renderInstallGuide(storeUrl, intentUrl, `Join ${owner}'s room`)}</main></body></html>`;
}

app.get('/c/:token', requireServerConfig, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).send('Challenge not found');
  const challenge = await findChallenge(token);
  if (!challenge) return res.status(404).send('Challenge not found');
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.type('html').send(renderChallengeLanding(challenge));
});

app.get('/r/:token', requireServerConfig, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).send('Room not found');
  const room = await findChallengeRoom(token);
  if (!room) return res.status(404).send('Room not found');
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  res.type('html').send(renderRoomLanding(room));
});

async function getWallet(playerId) {
  const rows = await sql`
    insert into wallets (player_id)
    values (${playerId})
    on conflict (player_id) do nothing
    returning coin_balance, lifetime_purchased_coins, lifetime_granted_coins, lifetime_spent_coins
  `;
  if (rows.length) return rows[0];
  const existing = await sql`
    select coin_balance, lifetime_purchased_coins, lifetime_granted_coins, lifetime_spent_coins
    from wallets
    where player_id = ${playerId}
  `;
  return existing[0];
}

async function addCoins(playerId, amount, type, reason, refType = null, refId = null, metadata = {}) {
  const n = clampInt(amount, 0, 2_000_000_000);
  const rows = await sql`
    update wallets
    set coin_balance = coin_balance + ${n},
      lifetime_purchased_coins = lifetime_purchased_coins + ${type === 'purchase' ? n : 0},
      lifetime_granted_coins = lifetime_granted_coins + ${type === 'grant' ? n : 0},
      updated_at = now()
    where player_id = ${playerId}
    returning coin_balance
  `;
  const balance = rows[0].coin_balance;
  await sql`
    insert into coin_ledger (player_id, type, amount, balance_after, reason, ref_type, ref_id, metadata)
    values (${playerId}, ${type}, ${n}, ${balance}, ${reason}, ${refType}, ${refId}, ${JSON.stringify(metadata)})
  `;
  return balance;
}

async function spendCoins(playerId, amount, reason, refType = null, refId = null, metadata = {}) {
  const n = clampInt(amount, 0, 2_000_000_000);
  const rows = await sql`
    update wallets
    set coin_balance = coin_balance - ${n},
      lifetime_spent_coins = lifetime_spent_coins + ${n},
      updated_at = now()
    where player_id = ${playerId} and coin_balance >= ${n}
    returning coin_balance
  `;
  if (!rows.length) return null;
  const balance = rows[0].coin_balance;
  await sql`
    insert into coin_ledger (player_id, type, amount, balance_after, reason, ref_type, ref_id, metadata)
    values (${playerId}, 'spend', ${-n}, ${balance}, ${reason}, ${refType}, ${refId}, ${JSON.stringify(metadata)})
  `;
  return balance;
}

async function getInventory(playerId) {
  const rows = await sql`
    select item_id, quantity
    from inventory
    where player_id = ${playerId}
  `;
  return Object.fromEntries(rows.map((row) => [row.item_id, row.quantity]));
}

async function getPlayerState(playerId) {
  const wallet = await getWallet(playerId);
  const inventory = await getInventory(playerId);
  const progressRows = await sql`
    select level_id, stars, best_time, best_score, attempts, deaths, completed_at
    from level_progress
    where player_id = ${playerId}
    order by level_id asc
  `;
  const levelStars = {};
  let levelsBeaten = 0;
  let highScore = 0;
  for (const row of progressRows) {
    if (row.stars > 0) levelStars[row.level_id] = row.stars;
    if (row.completed_at) levelsBeaten = Math.max(levelsBeaten, row.level_id);
    highScore = Math.max(highScore, row.best_score || 0);
  }
  const totalStars = Object.values(levelStars).reduce((sum, stars) => sum + stars, 0);
  return {
    wallet,
    inventory,
    progress: { highScore, totalStars, levelsBeaten, levelStars },
    catalog: { products: STORE_PRODUCTS, items: Object.values(ITEM_CATALOG) }
  };
}

async function upsertProgress(playerId, progress) {
  const clean = normalizeProgress(progress);
  const scoreLevelId = clampInt(clean.levelsBeaten || Object.keys(clean.levelStars).length || 1, 1, MAX_LEVELS);
  for (const [levelKey, stars] of Object.entries(clean.levelStars)) {
    const levelId = clampInt(levelKey, 1, MAX_LEVELS);
    await sql`
      insert into level_progress (player_id, level_id, status, stars, completed_at, updated_at)
      values (${playerId}, ${levelId}, 'completed', ${stars}, now(), now())
      on conflict (player_id, level_id) do update set
        status = 'completed',
        stars = greatest(level_progress.stars, excluded.stars),
        completed_at = coalesce(level_progress.completed_at, now()),
        updated_at = now()
    `;
  }
  if (clean.highScore > 0) {
    await sql`
      insert into level_progress (player_id, level_id, status, best_score, updated_at)
      values (${playerId}, ${scoreLevelId}, 'unlocked', ${clean.highScore}, now())
      on conflict (player_id, level_id) do update set
        best_score = greatest(level_progress.best_score, excluded.best_score),
        updated_at = now()
    `;
  }
  return getPlayerState(playerId);
}

app.get('/api/config', (req, res) => {
  res.json({
    authMode: 'play_games_or_install',
    starterCoins: STARTER_COINS,
    storeProducts: STORE_PRODUCTS,
    itemCatalog: Object.values(ITEM_CATALOG)
  });
});

app.post('/api/play/session', requireServerConfig, async (req, res) => {
  const body = req.body || {};
  const installId = normalizeInstallId(body.installId);
  const playGamesPlayerId = String(body.playGamesPlayerId || '').trim();
  const playHash = playGamesPlayerId ? hashStableId(playGamesPlayerId) : null;
  if (!installId && !playHash) return res.status(400).json({ error: 'missing_player_identity' });

  const rows = await sql`
    insert into players (install_id, play_games_player_id_hash, display_name, app_platform, app_version, last_seen_at, updated_at)
    values (${installId || null}, ${playHash}, ${body.displayName || null}, ${body.platform || 'web'}, ${body.appVersion || null}, now(), now())
    on conflict (install_id) do update set
      play_games_player_id_hash = coalesce(players.play_games_player_id_hash, excluded.play_games_player_id_hash),
      display_name = coalesce(excluded.display_name, players.display_name),
      app_platform = excluded.app_platform,
      app_version = excluded.app_version,
      last_seen_at = now(),
      updated_at = now()
    returning id, created_at
  `;
  const player = rows[0];
  const wallet = await getWallet(player.id);
  if (wallet.coin_balance === 0 && wallet.lifetime_granted_coins === 0 && wallet.lifetime_purchased_coins === 0 && wallet.lifetime_spent_coins === 0) {
    await addCoins(player.id, STARTER_COINS, 'grant', 'starter_bonus', 'system', 'starter_bonus');
  }
  const state = await getPlayerState(player.id);
  const referralAttributed = await attributeReferral(player.id, body.referralToken, body.referralSource);
  res.json({ token: signSession(player.id), player: { id: player.id }, state, referralAttributed });
});

app.get('/api/challenge-rooms/:token', requireServerConfig, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'room_not_found' });
  const room = await findChallengeRoom(token);
  if (!room) return res.status(404).json({ error: 'room_not_found' });
  res.json({ room: publicChallengeRoom(room) });
});

app.post('/api/challenge-rooms', requireServerConfig, requirePlayer, async (req, res) => {
  const recentRooms = await sql`
    select count(*)::integer as count
    from challenge_rooms
    where host_player_id = ${req.playerId} and created_at > now() - interval '1 hour'
  `;
  if (recentRooms[0].count >= MAX_CHALLENGE_ROOMS_PER_HOUR) {
    return res.status(429).json({ error: 'challenge_room_rate_limited' });
  }
  const token = createChallengeToken();
  const requestedSeed = Number.parseInt(req.body?.seed, 10);
  const seed = Number.isFinite(requestedSeed) && requestedSeed > 0 && requestedSeed < 0x80000000
    ? requestedSeed
    : createChallengeSeed();
  const created = await sql`
    insert into challenge_rooms (public_token, host_player_id, seed, rules_version)
    values (${token}, ${req.playerId}, ${seed}, ${CHALLENGE_RULES_VERSION})
    returning id
  `;
  await sql`
    insert into challenge_room_players (room_id, player_id, role)
    values (${created[0].id}, ${req.playerId}, 'host')
  `;
  const room = await findChallengeRoom(token);
  res.status(201).json({
    room: publicChallengeRoom(room, req.playerId),
    shareUrl: `${publicAppUrl}/r/${token}`
  });
});

app.post('/api/challenge-rooms/:token/join', requireServerConfig, requirePlayer, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'room_not_found' });
  let room = await findChallengeRoom(token);
  if (!room) return res.status(404).json({ error: 'room_not_found' });
  if (new Date(room.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: 'room_expired' });
  if (room.host_player_id === req.playerId) return res.status(409).json({ error: 'host_already_joined' });
  if (room.guest_player_id && room.guest_player_id !== req.playerId) return res.status(409).json({ error: 'room_full' });
  if (!room.guest_player_id) {
    const joined = await sql`
      update challenge_rooms
      set guest_player_id = ${req.playerId}, status = 'ready'
      where id = ${room.id} and guest_player_id is null and status = 'waiting'
      returning id
    `;
    if (!joined.length) {
      room = await findChallengeRoom(token);
      if (!room || room.guest_player_id !== req.playerId) return res.status(409).json({ error: 'room_full' });
    }
  }
  await sql`
    insert into challenge_room_players (room_id, player_id, role, last_seen_at)
    values (${room.id}, ${req.playerId}, 'guest', now())
    on conflict (room_id, player_id) do update set last_seen_at = now()
  `;
  await attributeReferral(req.playerId, token, req.body?.source || 'app_link');
  room = await findChallengeRoom(token);
  res.json({ room: publicChallengeRoom(room, req.playerId) });
});

app.get('/api/challenge-rooms/:token/status', requireServerConfig, requirePlayer, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'room_not_found' });
  let room = await findChallengeRoom(token);
  if (!room) return res.status(404).json({ error: 'room_not_found' });
  if (room.host_player_id !== req.playerId && room.guest_player_id !== req.playerId) {
    return res.status(403).json({ error: 'not_room_member' });
  }
  await sql`
    update challenge_room_players set last_seen_at = now()
    where room_id = ${room.id} and player_id = ${req.playerId}
  `;
  room = await findChallengeRoom(token);
  res.json({ room: publicChallengeRoom(room, req.playerId) });
});

app.post('/api/challenge-rooms/:token/start', requireServerConfig, requirePlayer, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'room_not_found' });
  let room = await findChallengeRoom(token);
  if (!room) return res.status(404).json({ error: 'room_not_found' });
  if (room.host_player_id !== req.playerId) return res.status(403).json({ error: 'host_only' });
  if (new Date(room.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: 'room_expired' });
  if (room.status === 'waiting') return res.status(409).json({ error: 'waiting_for_guest' });
  if (room.status === 'ready') {
    await sql`
      update challenge_rooms
      set status = 'playing', starts_at = now() + (${roomCountdownSeconds} * interval '1 second')
      where id = ${room.id} and status = 'ready'
    `;
    room = await findChallengeRoom(token);
  }
  if (!['playing', 'finished'].includes(room.status)) return res.status(409).json({ error: 'room_not_startable' });
  res.json({ room: publicChallengeRoom(room, req.playerId) });
});

app.post('/api/challenge-rooms/:token/finish', requireServerConfig, requirePlayer, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'room_not_found' });
  let room = await findChallengeRoom(token);
  if (!room) return res.status(404).json({ error: 'room_not_found' });
  const role = room.host_player_id === req.playerId ? 'host' : (room.guest_player_id === req.playerId ? 'guest' : null);
  if (!role) return res.status(403).json({ error: 'not_room_member' });
  if (rowMemberFinished(room, role)) {
    return res.json({ duplicate: true, room: publicChallengeRoom(room, req.playerId) });
  }
  if (!room.starts_at || !['playing', 'finished'].includes(room.status)) {
    return res.status(409).json({ error: 'room_not_playing' });
  }
  const startTime = new Date(room.starts_at).getTime();
  if ((!req.body?.forfeit && Date.now() < startTime - 500) || Date.now() > startTime + 10 * 60_000) {
    return res.status(400).json({ error: 'invalid_room_window' });
  }
  const normalized = req.body?.forfeit
    ? { ok: true, result: { rescues: 0, elapsedMs: 60_000, deaths: 3 } }
    : normalizeChallengeResult(req.body);
  if (!normalized.ok) {
    await sql`
      update challenge_room_players
      set status = 'rejected', validation_error = ${normalized.error}, finished_at = now(), last_seen_at = now()
      where room_id = ${room.id} and player_id = ${req.playerId}
    `;
    return res.status(400).json({ error: normalized.error });
  }
  await sql`
    update challenge_room_players
    set status = 'finished', rescues = ${normalized.result.rescues}, elapsed_ms = ${normalized.result.elapsedMs},
      deaths = ${normalized.result.deaths}, finished_at = now(), last_seen_at = now()
    where room_id = ${room.id} and player_id = ${req.playerId} and status = 'joined'
  `;
  const finished = await sql`
    select count(*)::integer as count from challenge_room_players
    where room_id = ${room.id} and status = 'finished'
  `;
  if (finished[0].count >= 2) {
    await sql`update challenge_rooms set status = 'finished' where id = ${room.id} and status = 'playing'`;
  }
  room = await findChallengeRoom(token);
  res.json({ room: publicChallengeRoom(room, req.playerId) });
});

app.get('/api/challenges/:token', requireServerConfig, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'challenge_not_found' });
  const challenge = await findChallenge(token);
  if (!challenge) return res.status(404).json({ error: 'challenge_not_found' });
  res.json({ challenge: publicChallenge(challenge) });
});

app.post('/api/challenges', requireServerConfig, requirePlayer, async (req, res) => {
  const normalized = normalizeChallengeResult(req.body);
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });
  const recentChallenges = await sql`
    select count(*)::integer as count
    from challenges
    where owner_player_id = ${req.playerId} and created_at > now() - interval '1 hour'
  `;
  if (recentChallenges[0].count >= MAX_CHALLENGES_PER_HOUR) {
    return res.status(429).json({ error: 'challenge_rate_limited' });
  }
  const requestedSeed = Number.parseInt(req.body?.seed, 10);
  const seed = Number.isFinite(requestedSeed) && requestedSeed > 0 && requestedSeed < 0x80000000
    ? requestedSeed
    : createChallengeSeed();
  const parentToken = normalizeChallengeToken(req.body?.parentToken) || null;
  const token = createChallengeToken();
  const { rescues, elapsedMs, deaths } = normalized.result;
  const rows = await sql`
    insert into challenges (public_token, owner_player_id, parent_public_token, seed, rules_version, target_rescues, target_elapsed_ms, target_deaths)
    values (${token}, ${req.playerId}, ${parentToken}, ${seed}, ${CHALLENGE_RULES_VERSION}, ${rescues}, ${elapsedMs}, ${deaths})
    returning *
  `;
  const owner = await sql`select display_name from players where id = ${req.playerId}`;
  res.status(201).json({
    challenge: publicChallenge({ ...rows[0], display_name: owner[0]?.display_name }),
    shareUrl: `${publicAppUrl}/c/${token}`
  });
});

app.post('/api/challenges/:token/attempts', requireServerConfig, requirePlayer, async (req, res) => {
  const token = normalizeChallengeToken(req.params.token);
  if (!token) return res.status(404).json({ error: 'challenge_not_found' });
  const challenge = await findChallenge(token);
  if (!challenge) return res.status(404).json({ error: 'challenge_not_found' });
  if (new Date(challenge.expires_at).getTime() <= Date.now()) return res.status(410).json({ error: 'challenge_expired' });
  const recentAttempts = await sql`
    select count(*)::integer as count
    from challenge_attempts
    where player_id = ${req.playerId} and started_at > now() - interval '1 hour'
  `;
  if (recentAttempts[0].count >= MAX_CHALLENGE_ATTEMPTS_PER_HOUR) {
    return res.status(429).json({ error: 'challenge_attempt_rate_limited' });
  }
  const attempts = await sql`
    insert into challenge_attempts (challenge_id, player_id)
    values (${challenge.id}, ${req.playerId})
    returning id, started_at
  `;
  res.status(201).json({ attempt: attempts[0], challenge: publicChallenge(challenge) });
});

app.post('/api/challenge-attempts/:id/finish', requireServerConfig, requirePlayer, async (req, res) => {
  const attemptId = String(req.params.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
    return res.status(404).json({ error: 'attempt_not_found' });
  }
  const rows = await sql`
    select a.*, c.public_token, c.target_rescues, c.target_elapsed_ms, c.target_deaths
    from challenge_attempts a
    join challenges c on c.id = a.challenge_id
    where a.id = ${attemptId} and a.player_id = ${req.playerId}
  `;
  const attempt = rows[0];
  if (!attempt) return res.status(404).json({ error: 'attempt_not_found' });
  if (attempt.status === 'finished') {
    return res.json({ duplicate: true, result: { rescues: attempt.rescues, elapsedMs: attempt.elapsed_ms, deaths: attempt.deaths, outcome: attempt.outcome } });
  }
  if (attempt.status !== 'started') return res.status(409).json({ error: 'attempt_rejected' });
  const normalized = normalizeChallengeResult(req.body);
  if (!normalized.ok) {
    await sql`update challenge_attempts set status = 'rejected', validation_error = ${normalized.error}, finished_at = now() where id = ${attemptId}`;
    return res.status(400).json({ error: normalized.error });
  }
  const wallElapsed = Date.now() - new Date(attempt.started_at).getTime();
  if (wallElapsed < Math.min(normalized.result.elapsedMs, 2_000) - 500 || wallElapsed > 30 * 60_000) {
    await sql`update challenge_attempts set status = 'rejected', validation_error = 'invalid_attempt_window', finished_at = now() where id = ${attemptId}`;
    return res.status(400).json({ error: 'invalid_attempt_window' });
  }
  const target = { rescues: attempt.target_rescues, elapsedMs: attempt.target_elapsed_ms };
  const outcome = compareChallengeResults(normalized.result, target);
  const updated = await sql`
    update challenge_attempts
    set status = 'finished', rescues = ${normalized.result.rescues}, elapsed_ms = ${normalized.result.elapsedMs}, deaths = ${normalized.result.deaths}, outcome = ${outcome}, finished_at = now()
    where id = ${attemptId} and status = 'started'
    returning id
  `;
  if (!updated.length) return res.status(409).json({ error: 'attempt_already_finished' });
  res.json({ result: { ...normalized.result, outcome }, target });
});

app.post('/api/referrals/resolve', requireServerConfig, requirePlayer, async (req, res) => {
  const attributed = await attributeReferral(req.playerId, req.body?.token, req.body?.source);
  res.json({ attributed });
});

app.post('/api/events', requireServerConfig, requirePlayer, async (req, res) => {
  const eventName = String(req.body?.eventName || '').trim();
  const clientEventId = String(req.body?.clientEventId || '').trim();
  const challengeToken = normalizeChallengeToken(req.body?.challengeToken) || null;
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(eventName) || !/^[A-Za-z0-9_-]{12,80}$/.test(clientEventId)) {
    return res.status(400).json({ error: 'invalid_event' });
  }
  const properties = req.body?.properties && typeof req.body.properties === 'object' ? req.body.properties : {};
  await sql`
    insert into growth_events (player_id, event_name, challenge_token, client_event_id, properties)
    values (${req.playerId}, ${eventName}, ${challengeToken}, ${clientEventId}, ${JSON.stringify(properties)})
    on conflict (player_id, client_event_id) do nothing
  `;
  res.status(202).json({ accepted: true });
});

app.get('/api/player/state', requireServerConfig, requirePlayer, async (req, res) => {
  res.json({ state: await getPlayerState(req.playerId) });
});

app.put('/api/progress', requireServerConfig, requirePlayer, async (req, res) => {
  const state = await upsertProgress(req.playerId, req.body?.progress || {});
  res.json({ state, progress: state.progress });
});

app.post('/api/levels/attempt/finish', requireServerConfig, requirePlayer, async (req, res) => {
  const body = req.body || {};
  const levelId = clampInt(body.levelId, 1, MAX_LEVELS);
  const result = ['complete', 'fail', 'quit'].includes(body.result) ? body.result : 'fail';
  const stars = clampInt(body.stars, 0, 3);
  const score = clampInt(body.score, 0, 2_000_000_000);
  const completedAt = result === 'complete' ? new Date().toISOString() : null;
  await sql`
    insert into level_attempts (player_id, level_id, result, duration_ms, deaths, score, stars, powerups_used, coins_spent)
    values (${req.playerId}, ${levelId}, ${result}, ${clampInt(body.durationMs, 0, 86_400_000)}, ${clampInt(body.deaths, 0, 999)}, ${score}, ${stars}, ${JSON.stringify(body.powerupsUsed || {})}, ${clampInt(body.coinsSpent, 0, 2_000_000_000)})
  `;
  await sql`
    insert into level_progress (player_id, level_id, status, stars, best_time, best_score, attempts, deaths, completed_at, updated_at)
    values (${req.playerId}, ${levelId}, ${result === 'complete' ? 'completed' : 'unlocked'}, ${stars}, ${clampInt(body.timeLeft, 0, 9999)}, ${score}, 1, ${clampInt(body.deaths, 0, 999)}, ${completedAt}, now())
    on conflict (player_id, level_id) do update set
      status = case when excluded.status = 'completed' then 'completed' else level_progress.status end,
      stars = greatest(level_progress.stars, excluded.stars),
      best_time = greatest(level_progress.best_time, excluded.best_time),
      best_score = greatest(level_progress.best_score, excluded.best_score),
      attempts = level_progress.attempts + 1,
      deaths = level_progress.deaths + excluded.deaths,
      completed_at = case when excluded.status = 'completed' then coalesce(level_progress.completed_at, now()) else level_progress.completed_at end,
      updated_at = now()
  `;
  res.json({ state: await getPlayerState(req.playerId) });
});

app.get('/api/store/products', (req, res) => {
  res.json({ products: STORE_PRODUCTS, items: Object.values(ITEM_CATALOG) });
});

app.post('/api/wallet/spend', requireServerConfig, requirePlayer, async (req, res) => {
  const item = ITEM_CATALOG[String(req.body?.itemId || '')];
  const quantity = clampInt(req.body?.quantity || 1, 1, 99);
  if (!item) return res.status(400).json({ error: 'unknown_item' });
  const cost = item.cost * quantity;
  const balance = await spendCoins(req.playerId, cost, `buy_${item.id}`, 'item', item.id, { quantity });
  if (balance === null) return res.status(409).json({ error: 'not_enough_coins', item, cost });
  await sql`
    insert into inventory (player_id, item_id, quantity, updated_at)
    values (${req.playerId}, ${item.id}, ${quantity}, now())
    on conflict (player_id, item_id) do update set
      quantity = inventory.quantity + excluded.quantity,
      updated_at = now()
  `;
  await sql`
    insert into item_spends (player_id, item_id, coin_cost, quantity, level_id)
    values (${req.playerId}, ${item.id}, ${cost}, ${quantity}, ${req.body?.levelId || null})
  `;
  res.json({ state: await getPlayerState(req.playerId), purchased: { itemId: item.id, quantity, cost } });
});

app.post('/api/inventory/use', requireServerConfig, requirePlayer, async (req, res) => {
  const item = ITEM_CATALOG[String(req.body?.itemId || '')];
  if (!item) return res.status(400).json({ error: 'unknown_item' });
  const rows = await sql`
    update inventory
    set quantity = quantity - 1,
      updated_at = now()
    where player_id = ${req.playerId} and item_id = ${item.id} and quantity > 0
    returning quantity
  `;
  if (!rows.length) return res.status(409).json({ error: 'item_not_owned', item });
  res.json({ state: await getPlayerState(req.playerId), used: { itemId: item.id } });
});

app.post('/api/purchases/google-play/verify', requireServerConfig, requirePlayer, async (req, res) => {
  const productId = String(req.body?.productId || '').trim();
  const purchaseToken = String(req.body?.purchaseToken || '').trim();
  const product = STORE_PRODUCTS_BY_PLAY_ID[productId];
  if (!product || product.kind !== 'coins') return res.status(400).json({ error: 'unknown_product' });
  if (!purchaseToken) return res.status(400).json({ error: 'missing_purchase_token' });

  const existingRows = await sql`
    select player_id, product_id, purchase_state, coins_granted
    from google_play_purchases
    where purchase_token = ${purchaseToken}
  `;
  if (existingRows.length) {
    const existing = existingRows[0];
    if (existing.player_id !== req.playerId) return res.status(409).json({ error: 'purchase_token_already_bound' });
    return res.json({ state: await getPlayerState(req.playerId), purchase: existing, duplicate: true });
  }

  const androidPublisher = await getAndroidPublisher();
  if (!androidPublisher) {
    return res.status(503).json({
      error: 'google_play_credentials_missing',
      message: 'Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 in production.'
    });
  }

  let verification;
  try {
    verification = await androidPublisher.purchases.products.get({
      packageName: googlePlayPackageName,
      productId,
      token: purchaseToken
    });
  } catch (error) {
    return res.status(502).json({
      error: 'google_play_verification_failed',
      message: error?.message || 'Google Play verification failed'
    });
  }

  const purchase = verification.data || {};
  if (purchase.purchaseState !== 0) {
    await sql`
      insert into google_play_purchases (purchase_token, player_id, product_id, order_id, purchase_state, quantity, coins_granted, raw_response)
      values (${purchaseToken}, ${req.playerId}, ${productId}, ${purchase.orderId || null}, ${String(purchase.purchaseState ?? 'unknown')}, ${clampInt(purchase.quantity || 1, 1, 99)}, 0, ${JSON.stringify(purchase)})
      on conflict (purchase_token) do nothing
    `;
    return res.status(409).json({ error: 'purchase_not_completed', purchaseState: purchase.purchaseState });
  }

  const quantity = clampInt(purchase.quantity || 1, 1, 99);
  const coinsToGrant = (product.coins + product.bonus) * quantity;
  await sql`
    insert into google_play_purchases (purchase_token, player_id, product_id, order_id, purchase_state, quantity, coins_granted, raw_response)
    values (${purchaseToken}, ${req.playerId}, ${productId}, ${purchase.orderId || null}, 'purchased', ${quantity}, ${coinsToGrant}, ${JSON.stringify(purchase)})
  `;
  await addCoins(req.playerId, coinsToGrant, 'purchase', `google_play_${productId}`, 'google_play_purchase', purchase.orderId || purchaseToken, {
    productId,
    purchaseToken,
    quantity
  });

  try {
    await androidPublisher.purchases.products.consume({
      packageName: googlePlayPackageName,
      productId,
      token: purchaseToken
    });
    await sql`
      update google_play_purchases
      set consumed_at = now(), purchase_state = 'consumed'
      where purchase_token = ${purchaseToken}
    `;
  } catch (error) {
    await sql`
      update google_play_purchases
      set purchase_state = 'credited_not_consumed'
      where purchase_token = ${purchaseToken}
    `;
  }

  res.json({
    state: await getPlayerState(req.playerId),
    purchase: { productId, quantity, coinsGranted: coinsToGrant }
  });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Frog Frenzy server listening on http://127.0.0.1:${port}`);
  });
}
