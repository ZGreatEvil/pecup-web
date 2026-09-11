// Stateless, signed admin-session token (no server-side session store —
// serverless functions don't share memory between invocations).
const crypto = require('crypto');

const COOKIE_NAME = 'pecup_admin';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 3; // 3 days

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) {
    throw new Error(
      'ADMIN_SESSION_SECRET belum diatur di environment variables (isi dengan teks acak yang panjang).'
    );
  }
  return s;
}

function sign(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
  } catch {
    return null;
  }
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueToken() {
  return sign({ isAdmin: true, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
}

module.exports = { COOKIE_NAME, MAX_AGE_SECONDS, issueToken, verify };
