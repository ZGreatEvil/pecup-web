// Same interface as the local (SQLite) and old Supabase versions of
// queries.js, but backed by direct SQL over Neon Postgres (see src/db.js).
// Every function here is async.
const db = require('./db');
const { toDateKey } = require('./utils');

// ---------------- products ----------------

async function listProducts({ onlyActive = false } = {}) {
  const text = onlyActive
    ? 'select * from products where active = true order by created_at desc'
    : 'select * from products order by created_at desc';
  return db.query(text);
}

async function getProduct(id) {
  const rows = await db.query('select * from products where id = $1', [id]);
  return rows[0] || null;
}

async function createProduct(data) {
  const rows = await db.query(
    `insert into products (name, description, category, weight, price, stock, image, active)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [data.name, data.description, data.category, data.weight, data.price, data.stock, data.image, Boolean(data.active)]
  );
  return Number(rows[0].id);
}

async function updateProduct(id, data) {
  // Only overwrite the image when a new one was actually uploaded (mirrors
  // the local version's `COALESCE(@image, image)`).
  if (data.image) {
    await db.query(
      `update products set name = $1, description = $2, category = $3, weight = $4,
              price = $5, stock = $6, active = $7, image = $8
       where id = $9`,
      [data.name, data.description, data.category, data.weight, data.price, data.stock, Boolean(data.active), data.image, id]
    );
  } else {
    await db.query(
      `update products set name = $1, description = $2, category = $3, weight = $4,
              price = $5, stock = $6, active = $7
       where id = $8`,
      [data.name, data.description, data.category, data.weight, data.price, data.stock, Boolean(data.active), id]
    );
  }
}

async function deleteProduct(id) {
  await db.query('delete from products where id = $1', [id]);
}

async function toggleProductActive(id) {
  const product = await getProduct(id);
  if (!product) return;
  await db.query('update products set active = $1 where id = $2', [!product.active, id]);
}

async function productStats() {
  const all = await db.query('select id, active, stock from products');
  const total = all.length;
  const active = all.filter((p) => p.active).length;
  const lowStock = all.filter((p) => p.stock <= 5).length;
  return { total, active, lowStock };
}

// ---------------- orders ----------------

// Stock check + order + order_items + stock decrement all happen atomically
// inside the `create_order` Postgres function (see schema.sql), which locks
// the involved product rows with SELECT ... FOR UPDATE. That's what keeps
// this safe even if two customers check out the last unit at the same time
// across two different serverless invocations.
async function createOrder({ customerName, whatsapp, notes, items, proofFilename }) {
  const rows = await db.query('select create_order($1, $2, $3, $4::jsonb, $5, $6) as result', [
    customerName,
    whatsapp,
    notes || '',
    JSON.stringify(items.map((it) => ({ productId: it.productId, qty: it.qty, label: it.label || null }))),
    proofFilename || null,
    toDateKey(new Date()),
  ]);
  const raw = rows[0].result;
  const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { id: Number(result.id), orderNumber: result.orderNumber, subtotal: result.subtotal, total: result.total };
}

async function getOrder(id) {
  const rows = await db.query('select * from orders where id = $1', [id]);
  return rows[0] || null;
}

async function getOrderItems(orderId) {
  return db.query('select * from order_items where order_id = $1', [orderId]);
}

async function listOrdersByDate(dateKey) {
  return db.query('select * from orders where date_key = $1 order by created_at asc', [dateKey]);
}

async function orderDayStats(dateKey) {
  const orders = await listOrdersByDate(dateKey);
  const total = orders.length;
  const pending = orders.filter((o) => o.status === 'menunggu').length;
  const confirmed = orders.filter((o) => o.status === 'terkonfirmasi').length;
  return { total, pending, confirmed, orders };
}

async function updateOrderStatus(id, status) {
  await db.query('update orders set status = $1 where id = $2', [status, id]);
}

async function markEmailSent(id, ok, errorMessage) {
  await db.query('update orders set email_sent = $1, email_error = $2 where id = $3', [
    Boolean(ok),
    errorMessage || null,
    id,
  ]);
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductActive,
  productStats,
  createOrder,
  getOrder,
  getOrderItems,
  listOrdersByDate,
  orderDayStats,
  updateOrderStatus,
  markEmailSent,
};
