import 'dotenv/config';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error('DATABASE_URL and JWT_SECRET are required for challenge integration tests');
}

process.env.VERCEL = '1';
process.env.ROOM_COUNTDOWN_SECONDS = '1';
const { default: app } = await import('../server.js');
const installId = `test_${crypto.randomBytes(12).toString('hex')}`;
const guestInstallId = `test_guest_${crypto.randomBytes(10).toString('hex')}`;
const clientEventId = `evt_${crypto.randomBytes(12).toString('hex')}`;
const server = await new Promise((resolve, reject) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  instance.on('error', reject);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function request(path, options = {}) {
  const response = await fetch(origin + path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

try {
  const session = await request('/api/play/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installId, platform: 'integration-test', appVersion: 'test' })
  });
  assert.equal(session.response.status, 200);
  assert.ok(session.body.token);
  const auth = { authorization: `Bearer ${session.body.token}`, 'content-type': 'application/json' };

  const guestSession = await request('/api/play/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installId: guestInstallId, platform: 'integration-test', appVersion: 'test' })
  });
  assert.equal(guestSession.response.status, 200);
  const guestAuth = { authorization: `Bearer ${guestSession.body.token}`, 'content-type': 'application/json' };

  const roomCreated = await request('/api/challenge-rooms', {
    method: 'POST', headers: auth, body: JSON.stringify({ seed: 987654 })
  });
  assert.equal(roomCreated.response.status, 201);
  assert.equal(roomCreated.body.room.viewerRole, 'host');
  assert.equal(roomCreated.body.room.status, 'waiting');
  const roomToken = roomCreated.body.room.token;

  const publicRoom = await request(`/api/challenge-rooms/${roomToken}`);
  assert.equal(publicRoom.response.status, 200);
  assert.equal(publicRoom.body.room.viewerRole, null);
  assert.equal(publicRoom.body.room.participants.guest, null);

  const roomLanding = await fetch(`${origin}/r/${roomToken}`);
  const roomLandingHtml = await roomLanding.text();
  assert.equal(roomLanding.status, 200);
  assert.match(roomLandingHtml, /How to join/);
  assert.match(roomLandingHtml, new RegExp(roomToken));

  const roomJoined = await request(`/api/challenge-rooms/${roomToken}/join`, {
    method: 'POST', headers: guestAuth, body: JSON.stringify({ source: 'app_link' })
  });
  assert.equal(roomJoined.response.status, 200);
  assert.equal(roomJoined.body.room.viewerRole, 'guest');
  assert.equal(roomJoined.body.room.status, 'ready');
  const roomReferral = await pool.query('select share_token from referral_attributions where player_id = $1', [guestSession.body.player.id]);
  assert.equal(roomReferral.rows[0].share_token, roomToken);

  const guestStart = await request(`/api/challenge-rooms/${roomToken}/start`, {
    method: 'POST', headers: guestAuth, body: '{}'
  });
  assert.equal(guestStart.response.status, 403);

  const roomStarted = await request(`/api/challenge-rooms/${roomToken}/start`, {
    method: 'POST', headers: auth, body: '{}'
  });
  assert.equal(roomStarted.response.status, 200);
  assert.equal(roomStarted.body.room.status, 'playing');
  assert.ok(roomStarted.body.room.startsAt);
  const waitForStart = Math.max(0, new Date(roomStarted.body.room.startsAt).getTime() - Date.now() + 150);
  await new Promise((resolve) => setTimeout(resolve, waitForStart));

  const hostRoomFinish = await request(`/api/challenge-rooms/${roomToken}/finish`, {
    method: 'POST', headers: auth, body: JSON.stringify({ rescues: 1, elapsedMs: 2_000, deaths: 0 })
  });
  assert.equal(hostRoomFinish.response.status, 200);
  assert.equal(hostRoomFinish.body.room.status, 'playing');

  const guestRoomFinish = await request(`/api/challenge-rooms/${roomToken}/finish`, {
    method: 'POST', headers: guestAuth, body: JSON.stringify({ rescues: 0, elapsedMs: 1_000, deaths: 1 })
  });
  assert.equal(guestRoomFinish.response.status, 200);
  assert.equal(guestRoomFinish.body.room.status, 'finished');
  assert.equal(guestRoomFinish.body.room.viewerOutcome, 'loss');
  assert.equal(guestRoomFinish.body.room.winnerRole, 'host');

  const duplicateRoomFinish = await request(`/api/challenge-rooms/${roomToken}/finish`, {
    method: 'POST', headers: guestAuth, body: JSON.stringify({ rescues: 30, elapsedMs: 60_000, deaths: 0 })
  });
  assert.equal(duplicateRoomFinish.response.status, 200);
  assert.equal(duplicateRoomFinish.body.duplicate, true);

  const created = await request('/api/challenges', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ rescues: 2, elapsedMs: 60_000, deaths: 1, seed: 123456 })
  });
  assert.equal(created.response.status, 201);
  assert.match(created.body.challenge.token, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(created.body.challenge.target.rescues, 2);
  const token = created.body.challenge.token;

  const publicChallenge = await request(`/api/challenges/${token}`);
  assert.equal(publicChallenge.response.status, 200);
  assert.equal(publicChallenge.body.challenge.seed, 123456);

  const attempt = await request(`/api/challenges/${token}/attempts`, {
    method: 'POST', headers: auth, body: '{}'
  });
  assert.equal(attempt.response.status, 201);
  await new Promise((resolve) => setTimeout(resolve, 1_200));

  const finished = await request(`/api/challenge-attempts/${attempt.body.attempt.id}/finish`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ rescues: 0, elapsedMs: 1_000, deaths: 3 })
  });
  assert.equal(finished.response.status, 200);
  assert.equal(finished.body.result.outcome, 'loss');

  const duplicate = await request(`/api/challenge-attempts/${attempt.body.attempt.id}/finish`, {
    method: 'POST', headers: auth, body: JSON.stringify({ rescues: 30, elapsedMs: 1, deaths: 0 })
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.duplicate, true);

  const malformedAttempt = await request(`/api/challenge-attempts/${'z'.repeat(36)}/finish`, {
    method: 'POST', headers: auth, body: '{}'
  });
  assert.equal(malformedAttempt.response.status, 404);
  assert.equal(malformedAttempt.body.error, 'attempt_not_found');

  const attribution = await request('/api/referrals/resolve', {
    method: 'POST', headers: auth, body: JSON.stringify({ token, source: 'app_link' })
  });
  assert.equal(attribution.response.status, 200);
  assert.equal(attribution.body.attributed, false);

  const event = await request('/api/events', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ eventName: 'challenge_finish', clientEventId, challengeToken: token, properties: { outcome: 'loss' } })
  });
  assert.equal(event.response.status, 202);

  const landing = await fetch(`${origin}/c/${token}`);
  const landingHtml = await landing.text();
  assert.equal(landing.status, 200);
  assert.match(landingHtml, /60 seconds · Same map · No boosts/);
  assert.match(landingHtml, new RegExp(token));
  console.log('Challenge API integration test passed');
} finally {
  await pool.query('delete from growth_events where client_event_id = $1', [clientEventId]);
  await pool.query('delete from players where install_id = $1', [installId]);
  await pool.query('delete from players where install_id = $1', [guestInstallId]);
  await pool.end();
  await new Promise((resolve) => server.close(resolve));
}
