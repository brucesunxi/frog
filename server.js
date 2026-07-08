import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = fileURLToPath(new URL('.', import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const sql = databaseUrl ? neon(databaseUrl) : null;

const STARTER_COINS = 300;
const MAX_LEVELS = 40;

const STORE_PRODUCTS = [
  { id: 'coins_starter', kind: 'coins', coins: 300, bonus: 0, label: 'Starter Coin Pack', googlePlayProductId: 'coins_starter' },
  { id: 'coins_1000', kind: 'coins', coins: 1000, bonus: 0, label: 'Small Coin Pouch', googlePlayProductId: 'coins_1000' },
  { id: 'coins_5500', kind: 'coins', coins: 5500, bonus: 500, label: 'Adventure Coin Pack', googlePlayProductId: 'coins_5500' },
  { id: 'coins_12000', kind: 'coins', coins: 12000, bonus: 2000, label: 'Challenge Coin Chest', googlePlayProductId: 'coins_12000' },
  { id: 'coins_26000', kind: 'coins', coins: 26000, bonus: 6000, label: 'Master Coin Vault', googlePlayProductId: 'coins_26000' }
];

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

app.get('/', (req, res) => {
  res.sendFile('game.html', { root: rootDir });
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
  res.json({ token: signSession(player.id), player: { id: player.id }, state });
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
  res.status(501).json({
    error: 'google_play_billing_not_connected',
    message: 'After Play Billing is integrated, send productId and purchaseToken here. The backend will verify the purchase with the Google Play Developer API before crediting coins.'
  });
});

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(port, () => {
    console.log(`Frog Frenzy server listening on http://127.0.0.1:${port}`);
  });
}
