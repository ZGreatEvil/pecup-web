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

// Batched lookup keyed by id. Every cart render needs several products at
// once, and each Neon call is its own HTTPS round-trip — fetching them one
// at a time is what made add-to-cart feel slow.
async function getProductsByIds(ids) {
  const unique = Array.from(new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)));
  const byId = new Map();
  if (!unique.length) return byId;
  const rows = await db.query('select * from products where id = any($1::bigint[])', [unique]);
  for (const row of rows) byId.set(Number(row.id), row);
  return byId;
}

// Categories aren't a separate table — `products.category` is free text, so
// "adding a category" just means typing a new value on a product. This
// derives the live list of categories in use, for the storefront filter
// chips and the admin datalist autocomplete.
async function listCategories() {
  const rows = await db.query('select distinct category from products order by category');
  return rows.map((r) => r.category);
}

async function createProduct(data) {
  const rows = await db.query(
    `insert into products (name, description, category, weight, price, stock, image, active, is_bestseller, is_recommended, images, wholesale_min_qty, wholesale_price)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13)
     returning id`,
    [
      data.name,
      data.description,
      data.category,
      data.weight,
      data.price,
      data.stock,
      data.image,
      Boolean(data.active),
      Boolean(data.isBestseller),
      Boolean(data.isRecommended),
      data.images || [],
      Number(data.wholesaleMinQty) || 0,
      data.wholesalePrice === null || data.wholesalePrice === undefined ? null : Number(data.wholesalePrice),
    ]
  );
  return Number(rows[0].id);
}

async function updateProduct(id, data) {
  // The gallery is always rewritten wholesale from `data.images` (the caller
  // has already merged keeps + removals + new uploads). `image` stays in sync
  // as the first photo so the rest of the app's single-photo paths still work.
  const images = data.images || [];
  const primary = images[0] || null;
  await db.query(
    `update products set name = $1, description = $2, category = $3, weight = $4,
            price = $5, stock = $6, active = $7, is_bestseller = $8, is_recommended = $9,
            images = $10::text[], image = $11, wholesale_min_qty = $12, wholesale_price = $13
     where id = $14`,
    [
      data.name,
      data.description,
      data.category,
      data.weight,
      data.price,
      data.stock,
      Boolean(data.active),
      Boolean(data.isBestseller),
      Boolean(data.isRecommended),
      images,
      primary,
      Number(data.wholesaleMinQty) || 0,
      data.wholesalePrice === null || data.wholesalePrice === undefined ? null : Number(data.wholesalePrice),
      id,
    ]
  );
}

async function setProductStock(id, stock) {
  const safeStock = Math.max(0, Math.round(Number(stock) || 0));
  await db.query('update products set stock = $1 where id = $2', [safeStock, id]);
  return safeStock;
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
  return {
    total: all.length,
    active: all.filter((p) => p.active).length,
    inactive: all.filter((p) => !p.active).length,
    // Sold out is its own bucket: "low" means running down but still sellable.
    soldOut: all.filter((p) => Number(p.stock) <= 0).length,
    lowStock: all.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 5).length,
  };
}

// ---------------- orders ----------------

// Stock check + order + order_items + stock decrement all happen atomically
// inside the `create_order` Postgres function (see schema.sql), which locks
// the involved product rows with SELECT ... FOR UPDATE. That's what keeps
// this safe even if two customers check out the last unit at the same time
// across two different serverless invocations.
async function createOrder({ customerName, whatsapp, notes, items, proofFilename, address, deliveryDate, customerId, useReward }) {
  const rows = await db.query(
    'select create_order($1, $2, $3, $4::jsonb, $5, $6, $7, $8::date, $9::bigint, $10::boolean) as result',
    [
      customerName,
      whatsapp,
      notes || '',
      JSON.stringify(items.map((it) => ({ productId: it.productId, qty: it.qty, label: it.label || null }))),
      proofFilename || null,
      toDateKey(new Date()),
      address || '',
      deliveryDate || null,
      customerId || null,
      Boolean(useReward),
    ]
  );
  const raw = rows[0].result;
  const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    id: Number(result.id),
    orderNumber: result.orderNumber,
    subtotal: result.subtotal,
    total: result.total,
    rewardDiscount: Number(result.rewardDiscount) || 0,
    rewardItem: result.rewardItem || null,
  };
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

async function listOrdersByDateRange(startKey, endKey) {
  return db.query('select * from orders where date_key >= $1 and date_key <= $2 order by created_at asc', [
    startKey,
    endKey,
  ]);
}

async function orderDayStats(dateKey) {
  const orders = await listOrdersByDate(dateKey);
  const total = orders.length;
  const pending = orders.filter((o) => o.status === 'menunggu').length;
  const processing = orders.filter((o) => o.status === 'diproses').length;
  const done = orders.filter((o) => o.status === 'selesai').length;
  return { total, pending, processing, done, orders };
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
  getProductsByIds,
  listCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductStock,
  toggleProductActive,
  productStats,
  createOrder,
  getOrder,
  getOrderItems,
  listOrdersByDate,
  listOrdersByDateRange,
  orderDayStats,
  updateOrderStatus,
  markEmailSent,
};
