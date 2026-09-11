// Single catch-all Vercel Serverless Function — every request (storefront,
// admin, everything) is routed here by vercel.json's rewrite rule. There is
// no server-side memory between invocations, so the cart lives in a cookie
// and the admin session is a signed, stateless token (see src/cart.js and
// src/adminSession.js).
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const { loadEnv } = require('../src/env');
loadEnv(); // no-op on Vercel (env vars are injected directly); useful for `vercel dev` with a local .env

const Router = require('../src/router');
const { parseCookies, setCookie, clearCookie } = require('../src/cookies');
const cartLib = require('../src/cart');
const adminSession = require('../src/adminSession');
const { parseBody } = require('../src/body');
const { checkCredentials } = require('../src/adminAuth');
const queries = require('../src/queries');
const { toDateKey } = require('../src/utils');
const { buildDailyOrdersCsv } = require('../src/csvExport');
const { sendOrderNotification } = require('../src/orderEmail');
const { saveProductImage, saveProofFile, signedProofUrl } = require('../src/uploads');

const shopViews = require('../src/views/shop');
const adminViews = require('../src/views/admin');

const router = new Router();

// Read once at cold start (literal path so Vercel's build-time file tracer
// bundles it) and keep in memory — it's a small, unchanging static asset.
const qrisPaymentImage = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'qris-payment.jpg'));

router.get('/assets/qris-payment.jpg', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.end(qrisPaymentImage);
});

// ---------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------

router.get('/', async (req, res, { query }) => {
  const category = query.get('kategori');
  let products = await queries.listProducts({ onlyActive: true });
  if (category && category !== 'Semua') {
    products = products.filter((p) => p.category === category);
  }
  sendHtml(res, shopViews.renderBeranda({ products, cartCount: cartLib.cartCount(req.cart), category }));
});

router.get('/produk/:id', async (req, res) => {
  const product = await queries.getProduct(Number(req.params.id));
  if (!product) return notFound(res);
  const all = await queries.listProducts({ onlyActive: true });
  const related = all.filter((p) => p.id !== product.id).slice(0, 4);
  const singleFruits = all.filter((p) => p.category === 'Buah Tunggal');
  sendHtml(
    res,
    shopViews.renderProdukDetail({ product, related, cartCount: cartLib.cartCount(req.cart), singleFruits })
  );
});

router.post('/keranjang/tambah', async (req, res) => {
  const { fields } = await parseBody(req);
  const productId = Number(fields.productId);
  const qty = Math.max(1, Number(fields.qty) || 1);
  const product = await queries.getProduct(productId);
  if (product) {
    let fruits;
    if (product.category === 'Mix Buah' && fields.fruitIds) {
      const requestedIds = fields.fruitIds
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const singles = await queries.listProducts({ onlyActive: true });
      // Product ids come back from the Neon driver as strings (bigint
      // columns), so normalize to Number before comparing against the
      // parsed request ids — otherwise the Set lookup never matches.
      const validIds = new Set(singles.filter((p) => p.category === 'Buah Tunggal').map((p) => Number(p.id)));
      const uniqueValid = Array.from(new Set(requestedIds)).filter((id) => validIds.has(id));
      // Only accept a proper 2-or-3-fruit selection; otherwise skip the mix
      // composition rather than silently adding an ill-formed cart line.
      if (uniqueValid.length === 2 || uniqueValid.length === 3) fruits = uniqueValid;
      else {
        redirect(res, `/produk/${productId}`);
        return;
      }
    }
    cartLib.addToCart(req.cart, productId, qty, fruits);
    saveCartCookie(res, req.cart);
  }
  redirect(res, req.headers.referer && req.headers.referer.includes('/produk/') ? `/produk/${productId}` : '/');
});

router.get('/keranjang', async (req, res) => {
  const { items, subtotal } = await cartLib.buildCartItems(req.cart);
  sendHtml(res, shopViews.renderKeranjang({ items, subtotal, cartCount: cartLib.cartCount(req.cart) }));
});

router.post('/keranjang/update', async (req, res) => {
  const { fields } = await parseBody(req);
  const qty = Math.max(0, Number(fields.qty) || 0);
  cartLib.setCartQty(req.cart, fields.key, qty);
  saveCartCookie(res, req.cart);
  redirect(res, '/keranjang');
});

router.post('/keranjang/hapus', async (req, res) => {
  const { fields } = await parseBody(req);
  cartLib.removeFromCart(req.cart, fields.key);
  saveCartCookie(res, req.cart);
  redirect(res, '/keranjang');
});

router.get('/checkout', async (req, res) => {
  const { items, subtotal } = await cartLib.buildCartItems(req.cart);
  if (items.length === 0) return redirect(res, '/keranjang');
  sendHtml(res, shopViews.renderCheckout({ items, subtotal, cartCount: cartLib.cartCount(req.cart) }));
});

router.post('/checkout', async (req, res) => {
  const { items, subtotal } = await cartLib.buildCartItems(req.cart);
  if (items.length === 0) return redirect(res, '/keranjang');

  let fields, files;
  try {
    ({ fields, files } = await parseBody(req));
  } catch (err) {
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        errors: ['Berkas terlalu besar atau gagal diunggah. Coba lagi dengan file yang lebih kecil (maks. 4MB).'],
      }),
      413
    );
  }

  const errors = [];
  const customerName = (fields.customerName || '').trim();
  const whatsapp = (fields.whatsapp || '').trim();
  const notes = (fields.notes || '').trim();

  if (!customerName) errors.push('Nama lengkap wajib diisi.');
  if (!whatsapp) errors.push('Nomor WhatsApp wajib diisi.');
  if (!files.proof) errors.push('Bukti transfer wajib diunggah.');
  else if (!['image/jpeg', 'image/png', 'application/pdf'].includes(files.proof.mimetype)) {
    errors.push('Format bukti transfer harus JPG, PNG, atau PDF.');
  }

  for (const it of items) {
    if (it.qty > it.product.stock) {
      errors.push(`Stok ${it.product.name} tidak mencukupi (tersisa ${it.product.stock}).`);
    }
  }

  if (errors.length) {
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        errors,
        formValues: { customerName, whatsapp, notes },
      })
    );
  }

  let proofFilename;
  let order;
  try {
    proofFilename = await saveProofFile(files.proof);
    const orderItems = items.map((it) => ({
      productId: it.product.id,
      name: it.product.name,
      price: it.product.price,
      qty: it.qty,
      label: it.fruits && it.fruits.length ? `${it.product.name} (${it.fruits.map((f) => f.name).join(', ')})` : undefined,
    }));
    // The real stock check happens atomically inside this call (see
    // schema.sql's create_order function) — the loop above is just a fast
    // pre-check so we don't upload a proof file for an obviously-doomed order.
    order = await queries.createOrder({ customerName, whatsapp, notes, items: orderItems, proofFilename });
  } catch (err) {
    console.error(err);
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        errors: [extractPgErrorMessage(err) || 'Gagal memproses pesanan. Coba lagi.'],
        formValues: { customerName, whatsapp, notes },
      })
    );
  }

  req.cart = cartLib.clearCart();
  saveCartCookie(res, req.cart);

  // IMPORTANT (serverless-specific): a Vercel function can be frozen right
  // after the response is sent, so — unlike the local version, which fires
  // this off in the background — the email must be sent (and awaited)
  // BEFORE responding to the customer.
  const dbOrder = await queries.getOrder(order.id);
  const dbItems = await queries.getOrderItems(order.id);
  const emailResult = await sendOrderNotification({
    order: { ...dbOrder, orderNumber: order.orderNumber },
    items: dbItems,
    proofFile: { filename: proofFilename, mimetype: files.proof.mimetype, buffer: files.proof.buffer },
  });
  await queries.markEmailSent(order.id, emailResult.ok, emailResult.error);

  redirect(res, `/pesanan-berhasil/${order.id}`);
});

router.get('/pesanan-berhasil/:id', async (req, res) => {
  const order = await queries.getOrder(Number(req.params.id));
  if (!order) return notFound(res);
  const items = await queries.getOrderItems(order.id);
  sendHtml(res, shopViews.renderSukses({ order, items, emailOk: Boolean(order.email_sent) }));
});

// ---------------------------------------------------------------------
// admin: auth
// ---------------------------------------------------------------------

router.get('/admin', (req, res) => redirect(res, '/admin/produk'));

router.get('/admin/login', (req, res) => {
  if (req.isAdmin) return redirect(res, '/admin/produk');
  sendHtml(res, adminViews.renderLogin({ error: null }));
});

router.post('/admin/login', async (req, res) => {
  const { fields } = await parseBody(req);
  if (checkCredentials(fields.username, fields.password)) {
    setCookie(res, adminSession.COOKIE_NAME, adminSession.issueToken(), { maxAge: adminSession.MAX_AGE_SECONDS });
    redirect(res, '/admin/produk');
  } else {
    sendHtml(res, adminViews.renderLogin({ error: 'Username atau password salah.' }), 401);
  }
});

router.post('/admin/logout', (req, res) => {
  clearCookie(res, adminSession.COOKIE_NAME);
  redirect(res, '/admin/login');
});

// ---------------------------------------------------------------------
// admin: products
// ---------------------------------------------------------------------

router.get('/admin/produk', requireAdmin(async (req, res, { query }) => {
  const products = await queries.listProducts();
  const stats = await queries.productStats();
  sendHtml(res, adminViews.renderProdukList({ products, stats, flash: query.get('flash') }));
}));

router.get('/admin/produk/tambah', requireAdmin((req, res) => {
  sendHtml(res, adminViews.renderProdukForm({ product: null, error: null }));
}));

router.post('/admin/produk/tambah', requireAdmin(async (req, res) => {
  const { fields, files } = await parseBody(req);
  const error = validateProductFields(fields);
  if (error) return sendHtml(res, adminViews.renderProdukForm({ product: fields, error }));

  const image = files.image && files.image.buffer.length ? await saveProductImage(files.image) : null;
  await queries.createProduct({
    name: fields.name.trim(),
    description: (fields.description || '').trim(),
    category: fields.category || 'Buah Tunggal',
    weight: fields.weight.trim(),
    price: Number(fields.price),
    stock: Number(fields.stock),
    image,
    active: fields.active ? 1 : 0,
  });
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk baru berhasil ditambahkan.'));
}));

router.get('/admin/produk/:id/edit', requireAdmin(async (req, res) => {
  const product = await queries.getProduct(Number(req.params.id));
  if (!product) return notFound(res);
  sendHtml(res, adminViews.renderProdukForm({ product, error: null }));
}));

router.post('/admin/produk/:id/edit', requireAdmin(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await queries.getProduct(id);
  if (!existing) return notFound(res);

  const { fields, files } = await parseBody(req);
  const error = validateProductFields(fields);
  if (error) {
    return sendHtml(res, adminViews.renderProdukForm({ product: { ...fields, id, image: existing.image }, error }));
  }
  const image = files.image && files.image.buffer.length ? await saveProductImage(files.image) : null;
  await queries.updateProduct(id, {
    name: fields.name.trim(),
    description: (fields.description || '').trim(),
    category: fields.category || 'Buah Tunggal',
    weight: fields.weight.trim(),
    price: Number(fields.price),
    stock: Number(fields.stock),
    image,
    active: fields.active ? 1 : 0,
  });
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk berhasil diperbarui.'));
}));

router.post('/admin/produk/:id/hapus', requireAdmin(async (req, res) => {
  await queries.deleteProduct(Number(req.params.id));
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk telah dihapus.'));
}));

router.post('/admin/produk/:id/toggle', requireAdmin(async (req, res) => {
  await queries.toggleProductActive(Number(req.params.id));
  redirect(res, '/admin/produk');
}));

// ---------------------------------------------------------------------
// admin: orders
// ---------------------------------------------------------------------

router.get('/admin/pesanan', requireAdmin(async (req, res, { query }) => {
  const dateKey = query.get('tanggal') || toDateKey(new Date());
  const stats = await queries.orderDayStats(dateKey);
  sendHtml(
    res,
    adminViews.renderPesananList({
      dateKey,
      prevDate: shiftDateKey(dateKey, -1),
      nextDate: shiftDateKey(dateKey, 1),
      orders: stats.orders,
      stats,
      downloadUrl: `/admin/pesanan/unduh?tanggal=${dateKey}`,
    })
  );
}));

router.get('/admin/pesanan/unduh', requireAdmin(async (req, res, { query }) => {
  const dateKey = query.get('tanggal') || toDateKey(new Date());
  const { orders } = await queries.orderDayStats(dateKey);
  const csv = await buildDailyOrdersCsv(orders);
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pesanan-pecup-${dateKey}.csv"`,
  });
  res.end(csv);
}));

router.get('/admin/pesanan/:id', requireAdmin(async (req, res) => {
  const order = await queries.getOrder(Number(req.params.id));
  if (!order) return notFound(res);
  const items = await queries.getOrderItems(order.id);
  let proofUrl = null;
  if (order.proof_filename) {
    try {
      proofUrl = await signedProofUrl(order.proof_filename);
    } catch (err) {
      console.error('Gagal membuat signed URL bukti transfer:', err.message);
    }
  }
  sendHtml(res, adminViews.renderPesananDetail({ order, items, proofUrl }));
}));

router.post('/admin/pesanan/:id/status', requireAdmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const status = fields.status === 'terkonfirmasi' ? 'terkonfirmasi' : 'menunggu';
  await queries.updateOrderStatus(Number(req.params.id), status);
  redirect(res, `/admin/pesanan/${req.params.id}`);
}));

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

function requireAdmin(handler) {
  return (req, res, extra) => {
    if (!req.isAdmin) return redirect(res, '/admin/login');
    return handler(req, res, extra);
  };
}

function saveCartCookie(res, cart) {
  setCookie(res, cartLib.COOKIE_NAME, cartLib.serializeCart(cart), { maxAge: cartLib.MAX_AGE_SECONDS });
}

function validateProductFields(fields) {
  if (!fields.name || !fields.name.trim()) return 'Nama produk wajib diisi.';
  if (!fields.weight || !fields.weight.trim()) return 'Berat/ukuran kemasan wajib diisi.';
  if (fields.price === undefined || Number.isNaN(Number(fields.price)) || Number(fields.price) < 0)
    return 'Harga tidak valid.';
  if (fields.stock === undefined || Number.isNaN(Number(fields.stock)) || Number(fields.stock) < 0)
    return 'Stok tidak valid.';
  return null;
}

function shiftDateKey(dateKey, deltaDays) {
  const d = new Date(dateKey + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return toDateKey(d);
}

// A raised plpgsql exception (e.g. "Stok ... tidak mencukupi ...") comes
// back from Neon as a plain Postgres error, with the message already
// human-readable on err.message — no JSON unwrapping needed here anymore.
function extractPgErrorMessage(err) {
  return (err && err.message) || null;
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>404</h1><p>Halaman tidak ditemukan. <a href="/">Kembali ke beranda</a></p>');
}

// ---------------------------------------------------------------------
// Vercel entry point
// ---------------------------------------------------------------------

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://placeholder');
    const pathname = decodeURIComponent(url.pathname);

    const cookies = parseCookies(req);
    req.cart = cartLib.parseCart(cookies[cartLib.COOKIE_NAME]);
    req.isAdmin = Boolean(adminSession.verify(cookies[adminSession.COOKIE_NAME]));

    const match = router.match(req.method, pathname);
    if (!match) return notFound(res);

    req.params = match.params;
    await match.handler(req, res, { query: url.searchParams });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>500</h1><p>Terjadi kesalahan pada server. Coba lagi.</p>');
    }
  }
};
