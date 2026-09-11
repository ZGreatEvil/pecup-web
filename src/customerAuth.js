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

async function listCustomerOrders(customerId, limit = 50) {
  return db.query('select * from orders where customer_id = $1 order by created_at desc limit $2', [
    customerId,
    limit,
  ]);
}

module.exports = {
  findByWhatsapp,
  findById,
  createCustomer,
  checkCredentials,
  updateCustomer,
  updatePassword,
  listCustomerOrders,
};
