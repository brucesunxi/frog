import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayStoreUrl,
  buildRoomPlayStoreUrl,
  compareChallengeResults,
  createChallengeToken,
  escapeHtml,
  normalizeChallengeResult,
  normalizeChallengeToken
} from '../lib/challenge-core.js';

test('tokens are opaque, URL-safe, and accepted by the normalizer', () => {
  const token = createChallengeToken();
  assert.match(token, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(normalizeChallengeToken(token), token);
  assert.equal(normalizeChallengeToken('../bad'), '');
});

test('challenge results enforce duration, lives, and a loose physical maximum', () => {
  assert.deepEqual(normalizeChallengeResult({ rescues: 7, elapsedMs: 60_000, deaths: 2 }), {
    ok: true,
    result: { rescues: 7, elapsedMs: 60_000, deaths: 2 }
  });
  assert.equal(normalizeChallengeResult({ rescues: 2, elapsedMs: 1_000, deaths: 0 }).error, 'implausible_result');
  assert.equal(normalizeChallengeResult({ rescues: 31, elapsedMs: 60_000, deaths: 0 }).error, 'invalid_rescues');
  assert.equal(normalizeChallengeResult({ rescues: 1, elapsedMs: 62_000, deaths: 0 }).error, 'invalid_elapsed_ms');
});

test('more rescues wins, then lower time breaks non-zero ties', () => {
  assert.equal(compareChallengeResults({ rescues: 8, elapsedMs: 60_000 }, { rescues: 7, elapsedMs: 50_000 }), 'win');
  assert.equal(compareChallengeResults({ rescues: 7, elapsedMs: 45_000 }, { rescues: 7, elapsedMs: 48_000 }), 'win');
  assert.equal(compareChallengeResults({ rescues: 0, elapsedMs: 30_000 }, { rescues: 0, elapsedMs: 20_000 }), 'tie');
});

test('store URL preserves the challenge through Play referrer', () => {
  const token = createChallengeToken();
  const url = new URL(buildPlayStoreUrl(token));
  assert.equal(url.searchParams.get('id'), 'com.frogfrenzy.game');
  assert.equal(url.searchParams.get('referrer'), `challenge_token=${token}`);
});

test('room store URL restores a waiting-room invite after install', () => {
  const token = createChallengeToken();
  const url = new URL(buildRoomPlayStoreUrl(token));
  assert.equal(url.searchParams.get('referrer'), `room_token=${token}`);
});

test('landing-page values are HTML escaped', () => {
  assert.equal(escapeHtml('<frog "wins">'), '&lt;frog &quot;wins&quot;&gt;');
});
