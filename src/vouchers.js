// Promo codes (see the `vouchers` table in schema.sql).
//
// Validation lives in two places on purpose. This module previews a code for
// the checkout screen so the shopper sees what they'll save; create_order
// re-validates and consumes it inside the same transaction as the stock
// check. The preview is advisory — the database has the final word, which is
// what stops a code being spent more times than it allows.
const db = require('./db');
const { toDateKey } = require('./utils');

// Short labels: the select sits in a narrow column on a phone and anything
// longer was cut to "Potongan persen…". Its field label is "Jenis potongan",
// so the word "Potongan" was only repeating that.
const KINDS = [
  { value: 'persen', label: 'Persen (%)' },
  { value: 'nominal', label: 'Rupiah (Rp)' },
];

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

async function list() {
  return db.query('select * from vouchers order by active desc, created_at desc');
}

async function findByCode(code) {
  const clean = normalizeCode(code);
  if (!clean) return null;
  const rows = await db.query('select * from vouchers where upper(code) = $1', [clean]);
  return rows[0] || null;
}

async function create({ code, kind, amount, minSpend, maxDiscount, usageLimit, expiresAt }) {
  const clean = normalizeCode(code);
  if (!clean) return { ok: false, error: 'Kode voucher wajib diisi.' };
  if (!/^[A-Z0-9-]{3,24}$/.test(clean)) {
    return { ok: false, error: 'Kode hanya boleh huruf, angka dan tanda minus (3–24 karakter).' };
  }
  const safeKind = kind === 'nominal' ? 'nominal' : 'persen';
  const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
  if (safeAmount <= 0) return { ok: false, error: 'Nilai potongan harus lebih dari 0.' };
  if (safeKind === 'persen' && safeAmount > 100) {
    return { ok: false, error: 'Potongan persen tidak boleh lebih dari 100%.' };
  }
  if (await findByCode(clean)) return { ok: false, error: 'Kode itu sudah dipakai voucher lain.' };

  await db.query(
    `insert into vouchers (code, kind, amount, min_spend, max_discount, usage_limit, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      clean,
      safeKind,
      safeAmount,
      Math.max(0, Math.round(Number(minSpend) || 0)),
      // Only meaningful for a percentage code.
      safeKind === 'persen' && Number(maxDiscount) > 0 ? Math.round(Number(maxDiscount)) : null,
      Number(usageLimit) > 0 ? Math.round(Number(usageLimit)) : null,
      expiresAt || null,
    ]
  );
  return { ok: true, code: clean };
}

async function setActive(id, active) {
  await db.query('update vouchers set active = $2 where id = $1', [id, Boolean(active)]);
}

async function remove(id) {
  await db.query('delete from vouchers where id = $1', [id]);
}

// Why a code can't be used right now, or null if it can. Mirrors the checks
// in create_order so the shopper is told before they submit rather than after.
function rejectionReason(voucher, subtotal) {
  if (!voucher) return 'Kode voucher tidak ditemukan.';
  if (!voucher.active) return 'Kode voucher sudah tidak aktif.';
  if (voucher.expires_at && toDateKey(voucher.expires_at) < toDateKey(new Date())) {
    return 'Kode voucher sudah kedaluwarsa.';
  }
  if (voucher.usage_limit !== null && Number(voucher.used_count) >= Number(voucher.usage_limit)) {
    return 'Kuota kode voucher sudah habis.';
  }
  if (subtotal < Number(voucher.min_spend)) {
    return `Kode ini butuh minimal belanja Rp${Number(voucher.min_spend).toLocaleString('id-ID')}.`;
  }
  return null;
}

function discountFor(voucher, discountable) {
  const base = Math.max(0, discountable);
  if (voucher.kind === 'nominal') return Math.min(Number(voucher.amount), base);
  let value = Math.floor((base * Number(voucher.amount)) / 100);
  if (voucher.max_discount !== null && voucher.max_discount !== undefined) {
    value = Math.min(value, Number(voucher.max_discount));
  }
  return Math.min(value, base);
}

// Preview for the checkout screen. `discountable` is what's left after the
// loyalty free cup, so the two discounts can't together exceed the cups.
async function preview(code, { subtotal, discountable }) {
  const clean = normalizeCode(code);
  if (!clean) return { applied: false, code: '', discount: 0, error: '' };

  const voucher = await findByCode(clean);
  const error = rejectionReason(voucher, subtotal);
  if (error) return { applied: false, code: clean, discount: 0, error };

  return {
    applied: true,
    code: voucher.code,
    discount: discountFor(voucher, discountable),
    error: '',
    label:
      voucher.kind === 'nominal'
        ? `Potongan Rp${Number(voucher.amount).toLocaleString('id-ID')}`
        : `Potongan ${voucher.amount}%`,
  };
}

module.exports = { KINDS, list, findByCode, create, setActive, remove, preview, normalizeCode, discountFor };
