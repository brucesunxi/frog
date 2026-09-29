const baseUrl = String(process.env.PUBLIC_APP_URL || process.argv[2] || 'https://frog-omega-rose.vercel.app').replace(/\/$/, '');
const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.frogfrenzy.game';
const expectedFingerprint = String(process.env.ANDROID_APP_LINK_FINGERPRINT || '')
  .trim()
  .toUpperCase();

function fail(message) {
  console.error(`Share deployment check failed: ${message}`);
  process.exitCode = 1;
}

async function fetchJson(path) {
  const response = await fetch(baseUrl + path, { headers: { accept: 'application/json' } });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`${path} returned ${response.status} ${contentType || 'without a content type'}`);
  }
  return { response, body: await response.json() };
}

try {
  const assetlinks = await fetchJson('/.well-known/assetlinks.json');
  if (!assetlinks.response.ok) fail(`assetlinks returned HTTP ${assetlinks.response.status}`);
  const targets = Array.isArray(assetlinks.body) ? assetlinks.body : [];
  const appTarget = targets.find((entry) => entry?.target?.package_name === packageName);
  if (!appTarget) {
    fail(`assetlinks does not contain ${packageName}`);
  } else {
    const fingerprints = appTarget.target.sha256_cert_fingerprints || [];
    if (!fingerprints.length) fail('assetlinks contains no SHA-256 certificate fingerprint');
    if (expectedFingerprint && !fingerprints.map((value) => String(value).toUpperCase()).includes(expectedFingerprint)) {
      fail('assetlinks does not contain the expected Play App Signing fingerprint');
    }
  }

  const missingRoom = await fetchJson('/api/challenge-rooms/abcdefghijklmnop');
  if (missingRoom.response.status !== 404 || missingRoom.body?.error !== 'room_not_found') {
    fail('live friend-room API is not serving the expected JSON contract');
  }

  if (!process.exitCode) {
    console.log(`Share deployment verified at ${baseUrl}`);
  }
} catch (error) {
  fail(error.message);
}
