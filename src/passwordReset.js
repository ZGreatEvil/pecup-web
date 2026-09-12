// Customer password resets.
//
// A customer account has no email address on file — the WhatsApp number *is*
// the username — so there is no link to mail out. The flow instead mirrors how
// this shop already talks to its customers:
//
//   1. Customer asks for a reset on /lupa-sandi (they only type their number).
//   2. An admin sees the request, confirms over WhatsApp that it really is
//      them, and clicks Setujui. That generates a 6-digit code, shown to the
//      admin ONCE, which they send in the chat.
//   3. The customer enters the code and picks a new password themselves.
//
// The admin never sees or types the new password, and only the *hash* of the
// code is stored — the same rule as passwords, so a leaked database dump
// can't be replayed into an account takeover.
const crypto = require('crypto');
const db = require('./db');
const { normalizeWhatsapp } = require('./utils');

const SCRYPT_KEYLEN = 64;
const CODE_TTL_MINUTES = 30;
const MAX_ATTEMPTS = 5;
// A second request while one is still open reuses it, so a customer tapping
// the button repeatedly can't bury the admin in duplicates.
const REQUEST_COOLDOWN_MINUTES = 15;

function hashCode(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(code, salt, SCRYPT_KEYLEN).toString('hex')}`;
}

function verifyCode(code, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(String(code), salt, SCRYPT_KEYLEN);
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(expected, candidate);
}

// Six digits, uniformly drawn — readable over a chat message and enough
// entropy given the 30-minute window and the five-attempt cap.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Creates a request, or returns the one already open. Deliberately returns the
// same shape whether or not the number belongs to an account: the caller must
// not reveal which numbers are registered.
async function request(rawWhatsapp) {
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) return { ok: false, error: 'Nomor WhatsApp tidak valid.' };

  const rows = await db.query('select id from customers where whatsapp = $1', [whatsapp]);
  if (!rows.length) return { ok: true, created: false };

  const customerId = Number(rows[0].id);
  const open = await db.query(
    `select id from password_resets
     where customer_id = $1 and status in ('menunggu', 'disetujui')
       and created_at > now() - ($2 || ' minutes')::interval
     order by created_at desc limit 1`,
    [customerId, String(REQUEST_COOLDOWN_MINUTES)]
  );
  if (open.length) return { ok: true, created: false, pending: true };

  await db.query('insert into password_resets (customer_id) values ($1)', [customerId]);
  return { ok: true, created: true };
}

async function listRequests(limit = 50) {
  return db.query(
    `select r.*, c.name, c.whatsapp
     from password_resets r join customers c on c.id = r.customer_id
     order by case when r.status = 'menunggu' then 0 else 1 end, r.created_at desc
     limit $1`,
    [limit]
  );
}

async function countPending() {
  const rows = await db.query("select count(*)::int as n from password_resets where status = 'menunggu'");
  return Number(rows[0].n) || 0;
}

// Approving mints the code. It's returned in plaintext exactly once, for the
// admin to read out over WhatsApp — it is never stored in that form.
async function approve(id, adminUsername) {
  const code = generateCode();
  const rows = await db.query(
    `update password_resets
     set status = 'disetujui', code_hash = $2, approved_by = $3,
         expires_at = now() + ($4 || ' minutes')::interval, attempts = 0
     where id = $1 and status = 'menunggu'
     returning id, customer_id`,
    [id, hashCode(code), adminUsername || '', String(CODE_TTL_MINUTES)]
  );
  if (!rows.length) return { ok: false, error: 'Permintaan itu sudah diproses.' };
  return { ok: true, code, expiresInMinutes: CODE_TTL_MINUTES, customerId: Number(rows[0].customer_id) };
}

async function reject(id, adminUsername) {
  const rows = await db.query(
    `update password_resets set status = 'ditolak', approved_by = $2, settled_at = now()
     where id = $1 and status in ('menunggu', 'disetujui') returning id`,
    [id, adminUsername || '']
  );
  return { ok: rows.length > 0 };
}

// Spends the code and sets the new password, both in one call so a valid code
// can never be left usable after a successful reset.
async function redeem({ whatsapp: rawWhatsapp, code, passwordHash }) {
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) return { ok: false, error: 'Nomor WhatsApp tidak valid.' };

  const rows = await db.query(
    `select r.id, r.code_hash, r.attempts, r.expires_at, r.customer_id
     from password_resets r join customers c on c.id = r.customer_id
     where c.whatsapp = $1 and r.status = 'disetujui'
     order by r.created_at desc limit 1`,
    [whatsapp]
  );
  const reset = rows[0];
  if (!reset) {
    return { ok: false, error: 'Belum ada kode aktif untuk nomor ini. Minta reset dulu, lalu tunggu admin mengirim kodenya.' };
  }
  if (reset.expires_at && new Date(reset.expires_at) < new Date()) {
    await db.query("update password_resets set status = 'ditolak', settled_at = now() where id = $1", [reset.id]);
    return { ok: false, error: 'Kodenya sudah kedaluwarsa. Minta kode baru ke admin ya.' };
  }
  if (Number(reset.attempts) >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Kode salah terlalu sering. Minta kode baru ke admin ya.' };
  }
  if (!verifyCode(code, reset.code_hash)) {
    await db.query('update password_resets set attempts = attempts + 1 where id = $1', [reset.id]);
    const left = MAX_ATTEMPTS - Number(reset.attempts) - 1;
    return {
      ok: false,
      error: `Kode salah. Sisa percobaan: ${Math.max(0, left)}.`,
    };
  }

  await db.query('update customers set password_hash = $1 where id = $2', [passwordHash, reset.customer_id]);
  await db.query(
    "update password_resets set status = 'selesai', settled_at = now(), code_hash = null where id = $1",
    [reset.id]
  );
  return { ok: true, customerId: Number(reset.customer_id) };
}

module.exports = {
  request,
  listRequests,
  countPending,
  approve,
  reject,
  redeem,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
};
