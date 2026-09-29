import crypto from 'node:crypto';

export const CHALLENGE_RULES_VERSION = 1;
export const CHALLENGE_DURATION_MS = 60_000;
export const CHALLENGE_MAX_RESCUES = 30;
export const CHALLENGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function createChallengeToken() {
  return crypto.randomBytes(18).toString('base64url');
}

export function createChallengeSeed() {
  return crypto.randomInt(1, 0x7fffffff);
}

export function normalizeChallengeToken(value) {
  const token = String(value || '').trim();
  return CHALLENGE_TOKEN_PATTERN.test(token) ? token : '';
}

export function normalizeChallengeResult(value = {}) {
  const rescues = Number.parseInt(value.rescues, 10);
  const elapsedMs = Number.parseInt(value.elapsedMs, 10);
  const deaths = Number.parseInt(value.deaths, 10);
  if (!Number.isFinite(rescues) || rescues < 0 || rescues > CHALLENGE_MAX_RESCUES) {
    return { ok: false, error: 'invalid_rescues' };
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > CHALLENGE_DURATION_MS + 1_000) {
    return { ok: false, error: 'invalid_elapsed_ms' };
  }
  if (!Number.isFinite(deaths) || deaths < 0 || deaths > 3) {
    return { ok: false, error: 'invalid_deaths' };
  }
  // A rescue needs fourteen forward moves. This loose bound rejects impossible
  // submissions without penalising very fast play or device timing variance.
  const plausibleMaximum = Math.min(CHALLENGE_MAX_RESCUES, Math.floor(elapsedMs / 1_200) + 1);
  if (rescues > plausibleMaximum) return { ok: false, error: 'implausible_result' };
  return { ok: true, result: { rescues, elapsedMs, deaths } };
}

export function compareChallengeResults(challenger, target) {
  if (challenger.rescues !== target.rescues) return challenger.rescues > target.rescues ? 'win' : 'loss';
  if (challenger.rescues === 0) return 'tie';
  if (challenger.elapsedMs === target.elapsedMs) return 'tie';
  return challenger.elapsedMs < target.elapsedMs ? 'win' : 'loss';
}

export function buildPlayStoreUrl(token, packageName = 'com.frogfrenzy.game') {
  const cleanToken = normalizeChallengeToken(token);
  const base = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
  if (!cleanToken) return base;
  return `${base}&referrer=${encodeURIComponent(`challenge_token=${cleanToken}`)}`;
}

export function buildRoomPlayStoreUrl(token, packageName = 'com.frogfrenzy.game') {
  const cleanToken = normalizeChallengeToken(token);
  const base = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`;
  if (!cleanToken) return base;
  return `${base}&referrer=${encodeURIComponent(`room_token=${cleanToken}`)}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
