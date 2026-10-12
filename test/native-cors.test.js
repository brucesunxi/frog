import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { nativeCors } from '../lib/native-cors.js';

test('bundled Android UI can preflight and read API errors without exposing other origins', async () => {
  const app = express();
  app.use('/api', nativeCors);
  app.put('/api/progress', (req, res) => res.status(401).json({ error: 'authentication_required' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/progress`;
  try {
    const preflight = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: 'https://localhost', 'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type'
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    const error = await fetch(url, { method: 'PUT', headers: { Origin: 'https://localhost' } });
    assert.equal(error.status, 401);
    assert.equal(error.headers.get('access-control-allow-origin'), 'https://localhost');
    for (const origin of ['https://untrusted.example', 'http://localhost', 'null']) {
      const denied = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } });
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    }
    const sameOrigin = await fetch(url, { method: 'PUT' });
    assert.equal(sameOrigin.status, 401);
    assert.match(sameOrigin.headers.get('vary'), /Origin/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
