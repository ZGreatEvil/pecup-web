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
async function createOrder({
  customerName,
  whatsapp,
  notes,
  items,
  proofFilename,
  address,
  deliveryDate,
  customerId,
  useReward,
  voucherCode,
  deliveryFee,
  tier = {},
}) {
  const rows = await db.query(
    `select create_order($1, $2, $3, $4::jsonb, $5, $6, $7, $8::date, $9::bigint, $10::boolean, $11, $12::integer,
                         $13, $14::integer, $15::boolean, $16::boolean) as result`,
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
      voucherCode || null,
      Math.max(0, Math.round(Number(deliveryFee) || 0)),
      // Which tier the customer holds is decided by the app (the ladder lives
      // in settings); whether each perk is still unspent is decided inside
      // create_order, under the customer row lock.
      tier.name || null,
      Math.max(0, Math.min(100, Math.round(Number(tier.discountPercent) || 0))),
      Boolean(tier.weeklyFreeCup),
      Boolean(tier.birthdayFreeCup),
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
    voucherCode: result.voucherCode || null,
    voucherDiscount: Number(result.voucherDiscount) || 0,
    deliveryFee: Number(result.deliveryFee) || 0,
    tierName: result.tierName || null,
    tierPercent: Number(result.tierPercent) || 0,
    tierDiscount: Number(result.tierDiscount) || 0,
    perkDiscount: Number(result.perkDiscount) || 0,
    perkNote: result.perkNote || null,
  };
}

async function getOrder(id) {
  const rows = await db.query('select * from orders where id = $1', [id]);
  return rows[0] || null;
}

async function getOrderItems(orderId) {
  return db.query('select * from order_items where order_id = $1', [orderId]);
}

// Items for many orders in one round-trip, keyed by order id. The CSV export
// used to issue one query per order, which is fine for a day's orders and
// very much not fine for a year's.
async function getOrderItemsForOrders(orderIds) {
  const unique = Array.from(new Set(orderIds.map(Number).filter((n) => Number.isFinite(n))));
  const byOrder = new Map();
  if (!unique.length) return byOrder;
  const rows = await db.query('select * from order_items where order_id = any($1::bigint[]) order by id asc', [
    unique,
  ]);
  for (const row of rows) {
    const key = Number(row.order_id);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(row);
  }
  return byOrder;
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

// Flexible order listing for the admin Pesanan page: filter by a date range
// on either the order date or the delivery date, by status, or by a free-text
// match on the customer; sort by any of those. Everything is optional, so
// "show all orders" is simply passing nothing.
const ORDER_SORTS = {
  dipesan: 'o.created_at',
  dikirim: 'o.delivery_date',
  nama: 'o.customer_name',
  total: 'o.total',
  status: 'o.status',
};

// Shared WHERE builder for every order listing and report, so the admin
// table, the customer's own history, the CSV and the revenue report all
// filter by exactly the same rules.
function orderFilterSql({ from = '', to = '', status = '', search = '', customerId = null, dateField = 'dipesan' }) {
  // Which column a date range applies to. Delivery date is a real date
  // column; the order date uses date_key, already stored in WIB.
  const rangeColumn = dateField === 'dikirim' ? 'o.delivery_date' : 'o.date_key';
  const cast = dateField === 'dikirim' ? '::date' : '';
  const clauses = [];
  const params = [];

  if (from) {
    params.push(from);
    clauses.push(`${rangeColumn} >= $${params.length}${cast}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`${rangeColumn} <= $${params.length}${cast}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`o.status = $${params.length}`);
  }
  if (customerId) {
    params.push(customerId);
    clauses.push(`o.customer_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(
      `(o.customer_name ilike $${params.length} or o.whatsapp ilike $${params.length} or o.order_number ilike $${params.length})`
    );
  }

  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

// Paginated order listing. Returns the page plus enough metadata to render
// a pager, so no caller has to count rows itself.
async function queryOrders(filters = {}) {
  const { sort = 'dipesan', dir = 'desc', page = 1, perPage = 50 } = filters;
  const { where, params } = orderFilterSql(filters);

  // Column and direction come from fixed maps, never from the raw query
  // string — these are interpolated into SQL, not bound.
  const orderBy = ORDER_SORTS[sort] || ORDER_SORTS.dipesan;
  const direction = dir === 'asc' ? 'asc' : 'desc';

  const safePerPage = Math.min(Math.max(Number(perPage) || 50, 1), 200);
  const countRows = await db.query(`select count(*)::int as n from orders o ${where}`, params);
  const total = Number(countRows[0].n) || 0;
  const totalPages = Math.max(1, Math.ceil(total / safePerPage));
  const current = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const offset = (current - 1) * safePerPage;

  // NULLS LAST so orders with no delivery date don't crowd the top.
  const orders = await db.query(
    `select o.* from orders o ${where} order by ${orderBy} ${direction} nulls last, o.id desc
     limit ${safePerPage} offset ${offset}`,
    params
  );

  return { orders, total, page: current, totalPages, perPage: safePerPage };
}

// Every order matching the filters, unpaginated — for CSV export and the
// revenue report, which must cover the whole range, not one page of it.
async function queryAllOrders(filters = {}) {
  const { sort = 'dipesan', dir = 'desc' } = filters;
  const { where, params } = orderFilterSql(filters);
  const orderBy = ORDER_SORTS[sort] || ORDER_SORTS.dipesan;
  const direction = dir === 'asc' ? 'asc' : 'desc';
  return db.query(`select o.* from orders o ${where} order by ${orderBy} ${direction} nulls last, o.id desc`, params);
}

// Everything the admin landing page shows, in one place. Kept to a handful of
// aggregate queries rather than pulling rows and counting in JS, so it stays
// cheap as the order table grows.
async function dashboardData({ todayKey, monthStart }) {
  const [todayRows, monthRows, lowStock, pending, upcoming] = await Promise.all([
    db.query(
      `select count(*)::int as total,
              count(*) filter (where status = 'menunggu')::int as pending,
              coalesce(sum(total) filter (where status = 'selesai'), 0)::bigint as revenue
       from orders where date_key = $1`,
      [todayKey]
    ),
    db.query(
      `select count(*) filter (where status = 'selesai')::int as orders,
              coalesce(sum(total) filter (where status = 'selesai'), 0)::bigint as revenue
       from orders where date_key >= $1 and date_key <= $2`,
      [monthStart, todayKey]
    ),
    db.query('select id, name, stock from products where stock <= 5 order by stock asc, name asc limit 8'),
    db.query(
      `select * from orders where status in ('menunggu', 'diproses')
       order by created_at desc limit 8`
    ),
    // What has to be prepared over the next week.
    db.query(
      `select o.delivery_date as day, count(distinct o.id)::int as orders,
              coalesce(sum(oi.qty), 0)::int as cups
       from orders o left join order_items oi on oi.order_id = o.id
       where o.delivery_date >= $1::date and o.delivery_date <= ($1::date + 7)
         and o.status in ('menunggu', 'diproses')
       group by o.delivery_date order by o.delivery_date asc limit 7`,
      [todayKey]
    ),
  ]);

  const t = todayRows[0] || {};
  const m = monthRows[0] || {};
  return {
    today: {
      total: Number(t.total) || 0,
      pending: Number(t.pending) || 0,
      revenue: Number(t.revenue) || 0,
    },
    revenue: { month: Number(m.revenue) || 0, monthOrders: Number(m.orders) || 0 },
    lowStock,
    pendingOrders: pending,
    upcoming: upcoming.map((r) => ({ day: r.day, orders: Number(r.orders) || 0, cups: Number(r.cups) || 0 })),
  };
}

// ---------------- revenue reporting ----------------

// Every way money comes off an order. Summed as one expression so the books
// balance: gross − discount + delivery = net, exactly. Leaving any of these
// out (as an earlier version did, counting only the free cup) makes the
// report look like money went missing.
const DISCOUNT_SUM =
  'coalesce(sum(o.reward_discount + o.perk_discount + o.tier_discount + o.voucher_discount), 0)::bigint';

// Revenue is counted from completed orders only by default — a pending order
// isn't money. `subtotal` is what the cups were worth, the discount columns
// are the promo given away, `total` is what actually came in.
async function revenueReport({ from = '', to = '', statuses = ['selesai'], groupBy = 'hari' } = {}) {
  const clauses = [];
  const params = [];

  if (from) {
    params.push(from);
    clauses.push(`o.date_key >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`o.date_key <= $${params.length}`);
  }
  if (statuses && statuses.length) {
    params.push(statuses);
    clauses.push(`o.status = any($${params.length}::text[])`);
  }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

  // Grouping expressions are chosen from a fixed map — never interpolated
  // from user input.
  const groupings = {
    hari: { expr: 'o.date_key', label: 'o.date_key' },
    bulan: { expr: "to_char(o.created_at at time zone 'Asia/Jakarta', 'YYYY-MM')", label: 'periode' },
  };
  const grouping = groupings[groupBy] || groupings.hari;

  const [totals, cups, series, byProduct, byStatus] = await Promise.all([
    db.query(
      `select count(*)::int as orders,
              coalesce(sum(o.subtotal), 0)::bigint as gross,
              ${DISCOUNT_SUM} as discount,
              coalesce(sum(o.reward_discount + o.perk_discount), 0)::bigint as free_cups,
              coalesce(sum(o.tier_discount), 0)::bigint as tier,
              coalesce(sum(o.voucher_discount), 0)::bigint as voucher,
              coalesce(sum(o.delivery_fee), 0)::bigint as delivery,
              coalesce(sum(o.total), 0)::bigint as net
       from orders o ${where}`,
      params
    ),
    db.query(
      `select coalesce(sum(oi.qty), 0)::int as cups
       from order_items oi join orders o on o.id = oi.order_id ${where}`,
      params
    ),
    db.query(
      `select ${grouping.expr} as periode,
              count(*)::int as orders,
              coalesce(sum(o.subtotal), 0)::bigint as gross,
              ${DISCOUNT_SUM} as discount,
              coalesce(sum(o.delivery_fee), 0)::bigint as delivery,
              coalesce(sum(o.total), 0)::bigint as net
       from orders o ${where}
       group by ${grouping.expr} order by ${grouping.expr} desc limit 400`,
      params
    ),
    db.query(
      `select oi.product_name,
              coalesce(sum(oi.qty), 0)::int as cups,
              coalesce(sum(oi.subtotal), 0)::bigint as gross
       from order_items oi join orders o on o.id = oi.order_id ${where}
       group by oi.product_name order by gross desc limit 100`,
      params
    ),
    db.query(
      `select o.status, count(*)::int as orders, coalesce(sum(o.total), 0)::bigint as net
       from orders o ${where} group by o.status`,
      params
    ),
  ]);

  const t = totals[0] || {};
  const orders = Number(t.orders) || 0;
  const net = Number(t.net) || 0;

  return {
    orders,
    gross: Number(t.gross) || 0,
    discount: Number(t.discount) || 0,
    freeCups: Number(t.free_cups) || 0,
    tierDiscount: Number(t.tier) || 0,
    voucherDiscount: Number(t.voucher) || 0,
    delivery: Number(t.delivery) || 0,
    net,
    cups: Number((cups[0] || {}).cups) || 0,
    averageOrder: orders ? Math.round(net / orders) : 0,
    series: series.map((r) => ({
      periode: r.periode,
      orders: Number(r.orders) || 0,
      gross: Number(r.gross) || 0,
      discount: Number(r.discount) || 0,
      delivery: Number(r.delivery) || 0,
      net: Number(r.net) || 0,
    })),
    byProduct: byProduct.map((r) => ({
      name: r.product_name,
      cups: Number(r.cups) || 0,
      gross: Number(r.gross) || 0,
    })),
    byStatus: byStatus.map((r) => ({ status: r.status, orders: Number(r.orders) || 0, net: Number(r.net) || 0 })),
  };
}

// Counts for the stat cards, over the same filtered set the table shows.
function summarizeOrders(orders) {
  return {
    total: orders.length,
    pending: orders.filter((o) => o.status === 'menunggu').length,
    processing: orders.filter((o) => o.status === 'diproses').length,
    done: orders.filter((o) => o.status === 'selesai').length,
    revenue: orders.filter((o) => o.status === 'selesai').reduce((sum, o) => sum + Number(o.total || 0), 0),
  };
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

// Moving an order in or out of 'dibatalkan' has to move stock with it, and
// exactly once. `stock_restored` is the guard: the UPDATE only fires when the
// flag is currently in the opposite state, so a double-submit or two admins
// clicking at the same moment can't return the same cups twice.
async function setOrderCancelled(id, cancelled) {
  const rows = await db.query(
    `update orders set status = $2, stock_restored = $3
     where id = $1 and coalesce(stock_restored, false) = $4
     returning id`,
    [id, cancelled ? 'dibatalkan' : 'menunggu', cancelled, !cancelled]
  );
  // Someone already did it — nothing further to do, and crucially no second
  // stock movement.
  if (!rows.length) return { ok: false, alreadyDone: true };

  const direction = cancelled ? '+' : '-';
  await db.query(
    `update products p set stock = greatest(0, p.stock ${direction} oi.qty)
     from order_items oi
     where oi.order_id = $1 and oi.product_id = p.id`,
    [id]
  );
  return { ok: true };
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
  getOrderItemsForOrders,
  listOrdersByDate,
  listOrdersByDateRange,
  queryOrders,
  queryAllOrders,
  revenueReport,
  dashboardData,
  summarizeOrders,
  orderDayStats,
  updateOrderStatus,
  setOrderCancelled,
  markEmailSent,
};
