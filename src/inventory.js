// The shop's own stockroom and its books: what gets bought in (cups, lids,
// spoons, fruit), what each cup sold consumes, and what the shop pays out.
//
// None of this is ever rendered to a shopper — every route that reads it is
// behind an admin permission (see src/permissions.js). It exists so the owner
// can answer two questions the order list alone can't: what is actually left
// in the stockroom, and what was actually earned after paying for everything.
//
// Quantities move in exactly one place per reason, and every move is written
// to `inventory_moves`, so a number on hand can always be explained.
const db = require('./db');
const { toDateKey } = require('./utils');

const EXPENSE_CATEGORIES = [
  'Bahan baku',
  'Kemasan',
  'Gaji & upah',
  'Sewa & listrik',
  'Transport & kirim',
  'Peralatan',
  'Pemasaran',
  'Lain-lain',
];

const UNITS = ['pcs', 'pack', 'box', 'kg', 'gram', 'liter', 'ml', 'lusin'];

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

// ---------------- items ----------------

async function listItems({ includeInactive = true } = {}) {
  const rows = await db.query(
    includeInactive
      ? 'select * from inventory_items order by active desc, name asc'
      : 'select * from inventory_items where active order by name asc'
  );
  return rows.map(shapeItem);
}

function shapeItem(row) {
  const stock = Number(row.stock) || 0;
  const unitCost = Number(row.unit_cost) || 0;
  const threshold = Number(row.low_threshold) || 0;
  return {
    ...row,
    id: Number(row.id),
    stock,
    unitCost,
    lowThreshold: threshold,
    // What the quantity on hand is worth — the number the owner actually wants
    // when asking "how much money is sitting in the stockroom?".
    value: stock * unitCost,
    isLow: threshold > 0 && stock <= threshold,
    isNegative: stock < 0,
  };
}

async function getItem(id) {
  const rows = await db.query('select * from inventory_items where id = $1', [Number(id) || 0]);
  return rows[0] ? shapeItem(rows[0]) : null;
}

async function createItem({ name, unit, stock, unitCost, lowThreshold, note, by }) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: 'Nama barang wajib diisi.' };
  const safeUnit = UNITS.includes(unit) ? unit : 'pcs';
  const startStock = Math.round(Number(stock) || 0);

  const rows = await db.query(
    `insert into inventory_items (name, unit, stock, unit_cost, low_threshold, note)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [clean, safeUnit, startStock, money(unitCost), Math.max(0, Math.round(Number(lowThreshold) || 0)), String(note || '').trim()]
  );
  const id = Number(rows[0].id);
  // An opening balance is still a movement — otherwise the history starts with
  // a number nobody can account for.
  if (startStock !== 0) {
    await db.query(
      `insert into inventory_moves (item_id, delta, reason, note, admin_username)
       values ($1, $2, 'penyesuaian', 'stok awal', $3)`,
      [id, startStock, by || null]
    );
  }
  return { ok: true, id };
}

async function updateItem(id, { name, unit, unitCost, lowThreshold, active, note }) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: 'Nama barang wajib diisi.' };
  await db.query(
    `update inventory_items set name = $2, unit = $3, unit_cost = $4, low_threshold = $5, active = $6, note = $7
     where id = $1`,
    [
      Number(id),
      clean,
      UNITS.includes(unit) ? unit : 'pcs',
      money(unitCost),
      Math.max(0, Math.round(Number(lowThreshold) || 0)),
      Boolean(active),
      String(note || '').trim(),
    ]
  );
  return { ok: true };
}

async function deleteItem(id) {
  // product_materials and inventory_moves both cascade; the expense rows keep
  // their amount and simply lose the link (on delete set null), because the
  // money was still spent.
  await db.query('delete from inventory_items where id = $1', [Number(id)]);
}

/**
 * Adds (or removes) quantity by hand, recording why.
 * `reason` is 'pembelian' for a purchase, 'penyesuaian' for a correction.
 */
async function adjustStock(id, delta, { reason = 'penyesuaian', note = '', by = null } = {}) {
  const change = Math.round(Number(delta) || 0);
  if (!change) return { ok: false, error: 'Jumlah harus lebih dari 0.' };
  const rows = await db.query(
    'update inventory_items set stock = stock + $2 where id = $1 returning stock',
    [Number(id), change]
  );
  if (!rows.length) return { ok: false, error: 'Barang tidak ditemukan.' };
  await db.query(
    `insert into inventory_moves (item_id, delta, reason, note, admin_username) values ($1, $2, $3, $4, $5)`,
    [Number(id), change, reason, String(note || '').trim(), by]
  );
  return { ok: true, stock: Number(rows[0].stock) };
}

/** Recent movements for one item, newest first. */
async function itemHistory(id, limit = 30) {
  return db.query(
    `select m.*, o.order_number
       from inventory_moves m left join orders o on o.id = m.order_id
      where m.item_id = $1 order by m.created_at desc, m.id desc limit $2`,
    [Number(id), Math.min(Math.max(Number(limit) || 30, 1), 200)]
  );
}

// ---------------- what a product consumes ----------------

async function materialsFor(productId) {
  return db.query(
    `select m.item_id, m.qty, i.name, i.unit, i.unit_cost, i.stock
       from product_materials m join inventory_items i on i.id = m.item_id
      where m.product_id = $1 order by i.name`,
    [Number(productId)]
  );
}

/** materials for many products at once, keyed by product id. */
async function materialsForProducts(productIds) {
  const ids = productIds.map(Number).filter(Boolean);
  const byProduct = new Map();
  if (!ids.length) return byProduct;
  const rows = await db.query(
    `select m.product_id, m.item_id, m.qty, i.name, i.unit, i.unit_cost
       from product_materials m join inventory_items i on i.id = m.item_id
      where m.product_id = any($1::bigint[]) order by i.name`,
    [ids]
  );
  for (const row of rows) {
    const key = Number(row.product_id);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(row);
  }
  return byProduct;
}

/** Replaces a product's material list with exactly this set. */
async function setMaterials(productId, entries) {
  const clean = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const itemId = Number(entry.itemId) || 0;
    const qty = Math.round(Number(entry.qty) || 0);
    if (!itemId || qty <= 0 || seen.has(itemId)) continue;
    seen.add(itemId);
    clean.push({ itemId, qty });
  }
  await db.query('delete from product_materials where product_id = $1', [Number(productId)]);
  for (const entry of clean) {
    await db.query(
      'insert into product_materials (product_id, item_id, qty) values ($1, $2, $3) on conflict do nothing',
      [Number(productId), entry.itemId, entry.qty]
    );
  }
  return clean.length;
}

/** What one cup of this product costs in materials, at today's prices. */
function materialCost(materials) {
  return (materials || []).reduce((sum, m) => sum + Number(m.qty) * (Number(m.unit_cost) || 0), 0);
}

// ---------------- expenses ----------------

async function listExpenses({ from = '', to = '', category = '', limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { params.push(from); where.push(`date_key >= $${params.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { params.push(to); where.push(`date_key <= $${params.length}`); }
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  params.push(Math.min(Math.max(Number(limit) || 500, 1), 5000));
  return db.query(
    `select * from expenses ${where.length ? 'where ' + where.join(' and ') : ''}
     order by date_key desc, id desc limit $${params.length}`,
    params
  );
}

async function addExpense({ dateKey, category, description, amount, itemId = null, by = null }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : toDateKey(new Date());
  const value = Math.round(Number(amount) || 0);
  if (value <= 0) return { ok: false, error: 'Nominal pengeluaran harus lebih dari 0.' };
  const rows = await db.query(
    `insert into expenses (date_key, category, description, amount, item_id, admin_username)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      day,
      EXPENSE_CATEGORIES.includes(category) ? category : 'Lain-lain',
      String(description || '').trim(),
      value,
      itemId ? Number(itemId) : null,
      by,
    ]
  );
  return { ok: true, id: Number(rows[0].id) };
}

async function getExpense(id) {
  const rows = await db.query('select * from expenses where id = $1', [Number(id) || 0]);
  return rows[0] || null;
}

async function deleteExpense(id) {
  await db.query('delete from expenses where id = $1', [Number(id)]);
}

async function expenseTotals({ from = '', to = '' } = {}) {
  const where = [];
  const params = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { params.push(from); where.push(`date_key >= $${params.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { params.push(to); where.push(`date_key <= $${params.length}`); }
  const whereSql = where.length ? 'where ' + where.join(' and ') : '';
  const [total, byCategory, byDay] = await Promise.all([
    db.query(`select coalesce(sum(amount), 0)::bigint as total, count(*)::int as n from expenses ${whereSql}`, params),
    db.query(
      `select category, coalesce(sum(amount), 0)::bigint as total, count(*)::int as n
         from expenses ${whereSql} group by category order by total desc`,
      params
    ),
    db.query(
      `select date_key, coalesce(sum(amount), 0)::bigint as total
         from expenses ${whereSql} group by date_key order by date_key desc limit 400`,
      params
    ),
  ]);
  return {
    total: Number(total[0].total) || 0,
    count: Number(total[0].n) || 0,
    byCategory: byCategory.map((r) => ({ category: r.category, total: Number(r.total) || 0, count: r.n })),
    byDay: new Map(byDay.map((r) => [r.date_key, Number(r.total) || 0])),
  };
}

/** What the stockroom is worth right now. */
async function stockValue() {
  const rows = await db.query(
    'select coalesce(sum(stock * unit_cost), 0)::bigint as value, count(*)::int as items from inventory_items where active'
  );
  return { value: Number(rows[0].value) || 0, items: Number(rows[0].items) || 0 };
}

module.exports = {
  EXPENSE_CATEGORIES,
  UNITS,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  adjustStock,
  itemHistory,
  materialsFor,
  materialsForProducts,
  setMaterials,
  materialCost,
  listExpenses,
  addExpense,
  getExpense,
  deleteExpense,
  expenseTotals,
  stockValue,
};
