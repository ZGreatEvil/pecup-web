function parseCookies(req) {
  const header = req.headers['cookie'];
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

// Multiple Set-Cookie headers can be sent on the same response; this keeps
// track of what has already been queued this request so callers can just
// call setCookie() as many times as needed.
function setCookie(res, name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  // Vercel/Node.js runtimes run behind HTTPS in production; only mark the
  // cookie Secure when we can tell we're not on plain-http localhost.
  if (process.env.VERCEL) parts.push('Secure');

  const existing = res.getHeader('Set-Cookie');
  const cookieStr = parts.join('; ');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookieStr]);
  }
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

module.exports = { parseCookies, setCookie, clearCookie };
