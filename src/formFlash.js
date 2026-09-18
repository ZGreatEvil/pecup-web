// Carries what someone typed (and what was wrong with it) across a redirect.
//
// A form that fails validation used to be answered by drawing the page inside
// the POST response. That works until the page is refreshed: the browser can
// only refresh a POST by sending it again, so the shopper gets a resubmission
// prompt, and whatever they had typed — and any file they attached — is gone.
//
// So: save it here, redirect, and let the ordinary GET draw the page. The
// cookie is read once and cleared, lives for a minute, and is never trusted
// beyond being JSON (it is the user's own typing coming back to them, and it
// is re-validated on the next submit like any other input).
const { setCookie, clearCookie } = require('./cookies');

const MAX_AGE_SECONDS = 60;
// Browsers drop a cookie over ~4KB silently, which would lose the very data
// this exists to keep. Anything bigger falls back to rendering in place.
const MAX_BYTES = 3500;

function cookieName(key) {
  return `pecup_form_${key}`;
}

/**
 * Stores one form's state. Returns false when it is too big to survive as a
 * cookie, so the caller can render the page directly instead.
 */
function saveFormFlash(res, key, data) {
  let encoded;
  try {
    encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  } catch {
    return false;
  }
  if (encoded.length > MAX_BYTES) return false;
  setCookie(res, cookieName(key), encoded, { maxAge: MAX_AGE_SECONDS, httpOnly: true });
  return true;
}

/** Reads and clears it. Returns null when there is nothing waiting. */
function takeFormFlash(req, res, key) {
  const raw = req.cookies ? req.cookies[cookieName(key)] : '';
  if (!raw) return null;
  clearCookie(res, cookieName(key));
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = { saveFormFlash, takeFormFlash };
