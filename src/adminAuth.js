// Admin accounts, backed by the `admins` table (see schema.sql) — no
// external auth dependency, just Node's built-in crypto.scrypt for password
// hashing (the same pattern Node's own docs recommend for this exact case).
const crypto = require('crypto');
const db = require('./db');

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, 'hex');
  const candidateBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  if (hashBuf.length !== candidateBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, candidateBuf);
}

// Fresh installs have an empty `admins` table — auto-create the first
// superadmin from ADMIN_USERNAME/ADMIN_PASSWORD so a brand new deploy isn't
// locked out. Once at least one admin row exists this is a no-op forever;
// from then on, admin accounts are entirely DB-managed.
async function ensureBootstrapAdmin() {
  const rows = await db.query('select count(*) as count from admins');
  if (Number(rows[0].count) > 0) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;

  await db.query('insert into admins (username, password_hash, role) values ($1, $2, $3) on conflict (username) do nothing', [
    username,
    hashPassword(password),
    'superadmin',
  ]);
}

// Simple in-memory brute-force brake. A serverless instance is short-lived so
// this isn't airtight across the fleet, but it does stop the common case: a
// script hammering one warm instance with a password list. Deliberately keyed
// on username, not IP, so one targeted account can't be ground down.
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map();

function failureState(username) {
  const key = String(username || '').toLowerCase();
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) return { key, count: 0 };
  return { key, count: entry.count };
}

function recordFailure(key) {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) {
    failures.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
  // Keep the map from growing without bound on a long-lived instance.
  if (failures.size > 500) {
    for (const [k, v] of failures) {
      if (Date.now() - v.first > FAILURE_WINDOW_MS) failures.delete(k);
    }
  }
}

async function checkCredentials(username, password) {
  if (!username || !password) return null;
  await ensureBootstrapAdmin();

  const state = failureState(username);
  if (state.count >= MAX_FAILURES) return { lockedOut: true };

  const rows = await db.query('select * from admins where username = $1', [username]);
  const admin = rows[0];
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    recordFailure(state.key);
    return null;
  }

  failures.delete(state.key);
  return { id: Number(admin.id), username: admin.username, role: admin.role };
}

async function listAdmins() {
  const rows = await db.query('select id, username, role, created_at from admins order by created_at asc');
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

async function countSuperadmins() {
  const rows = await db.query("select count(*) as count from admins where role = 'superadmin'");
  return Number(rows[0].count);
}

async function findAdminById(id) {
  const rows = await db.query('select id, username, role, created_at from admins where id = $1', [id]);
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

async function createAdmin({ username, password, role }) {
  const rows = await db.query(
    'insert into admins (username, password_hash, role) values ($1, $2, $3) returning id',
    [username, hashPassword(password), role === 'superadmin' ? 'superadmin' : 'admin']
  );
  return Number(rows[0].id);
}

async function deleteAdmin(id) {
  await db.query('delete from admins where id = $1', [id]);
}

// Superadmin resetting someone else's password. Goes through the same
// hashPassword() as account creation — the plaintext is never stored, never
// logged, and isn't kept anywhere after this call returns.
async function updateAdminPassword(id, password) {
  await db.query('update admins set password_hash = $1 where id = $2', [hashPassword(password), id]);
}

module.exports = {
  checkCredentials,
  listAdmins,
  countSuperadmins,
  findAdminById,
  createAdmin,
  deleteAdmin,
  updateAdminPassword,
};
