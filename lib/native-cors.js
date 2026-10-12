// Capacitor Android serves its bundled UI from this origin. JWTs, rather than
// cookies, authorize the API; no credentialed or arbitrary-origin access is used.
export function nativeCors(req, res, next) {
  res.vary('Origin');
  if (req.get('Origin') === 'https://localhost') {
    res.set('Access-Control-Allow-Origin', 'https://localhost');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
}
