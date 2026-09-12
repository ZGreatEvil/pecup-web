// Returning-customer accounts (see the `customers` table in schema.sql).
// The WhatsApp number is the username — there is no separate customer ID to
// remember — so every lookup goes through normalizeWhatsapp first and the
// canonical 62xxxxxxxxx form is what's stored.
const crypto = require('crypto');
const db = require('./db');
const { normalizeWhatsapp } = require('./utils');
const settings = require('./settings');

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

function publicShape(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    whatsapp: row.whatsapp,
    name: row.name,
    address: row.address || '',
    birthday: row.birthday || null,
    created_at: row.created_at,
  };
}

async function findByWhatsapp(rawWhatsapp) {
  const whatsapp = normalizeWhatsapp(rawWhatsapp);
  if (!whatsapp) return null;
  const rows = await db.query('select * from customers where whatsapp = $1', [whatsapp]);
  return rows[0] || null;
}

async function findById(id) {
  const rows = await db.query('select * from customers where id = $1', [id]);
  return publicShape(rows[0]);
}

async function createCustomer({ whatsapp, name, password, address }) {
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) throw new Error('Nomor WhatsApp tidak valid.');
  const rows = await db.query(
    'insert into customers (whatsapp, name, password_hash, address) values ($1, $2, $3, $4) returning *',
    [normalized, name, hashPassword(password), address || '']
  );
  return publicShape(rows[0]);
}

async function checkCredentials(whatsapp, password) {
  if (!whatsapp || !password) return null;
  const row = await findByWhatsapp(whatsapp);
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return publicShape(row);
}

async function updateCustomer(id, { name, address }) {
  const rows = await db.query(
    'update customers set name = $1, address = $2 where id = $3 returning *',
    [name, address || '', id]
  );
  return publicShape(rows[0]);
}

async function updatePassword(id, password) {
  await db.query('update customers set password_hash = $1 where id = $2', [hashPassword(password), id]);
}

// Superadmin editing a customer's details. Separate from updateCustomer()
// because the customer's own form must never be able to change their
// WhatsApp number — that's their username, and moving it is an account
// takeover if it isn't a deliberate admin action.
// Returns { ok: false, error } rather than throwing on a duplicate number,
// since "that number belongs to someone else" is a normal thing to hit.
async function adminUpdateCustomer(id, { name, whatsapp, address, birthday }) {
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) return { ok: false, error: 'Nomor WhatsApp tidak valid.' };

  const clash = await db.query('select id from customers where whatsapp = $1 and id <> $2', [normalized, id]);
  if (clash.length) return { ok: false, error: 'Nomor WhatsApp itu sudah dipakai pelanggan lain.' };

  const rows = await db.query(
    `update customers set name = $1, whatsapp = $2, address = $3, birthday = $4
     where id = $5 returning *`,
    [name, normalized, address || '', birthday || null, id]
  );
  if (!rows[0]) return { ok: false, error: 'Pelanggan tidak ditemukan.' };
  return { ok: true, customer: publicShape(rows[0]) };
}

async function deleteCustomer(id) {
  // Orders are kept — they're the shop's own sales record. Detaching them
  // just means the order no longer points at a deleted account.
  await db.query('update orders set customer_id = null where customer_id = $1', [id]);
  await db.query('delete from stamps where customer_id = $1', [id]);
  await db.query('delete from customers where id = $1', [id]);
}

async function listCustomerOrders(customerId, limit = 50) {
  return db.query('select * from orders where customer_id = $1 order by created_at desc limit $2', [
    customerId,
    limit,
  ]);
}

module.exports = {
  hashPassword,
  findByWhatsapp,
  findById,
  createCustomer,
  checkCredentials,
  updateCustomer,
  adminUpdateCustomer,
  deleteCustomer,
  updatePassword,
  listCustomerOrders,
};
