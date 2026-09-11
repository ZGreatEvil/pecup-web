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
const adminAuth = require('../src/adminAuth');
const { logAdminAction, listAdminLogs } = require('../src/adminLog');
const queries = require('../src/queries');
const { toDateKey, formatRupiah, normalizeWhatsapp } = require('../src/utils');
const { buildDailyOrdersCsv } = require('../src/csvExport');
const { sendOrderNotification } = require('../src/orderEmail');
const { saveProductImage, saveProofFile, signedProofUrl } = require('../src/uploads');

const shopViews = require('../src/views/shop');
const adminViews = require('../src/views/admin');

const router = new Router();

// Read once at cold start (literal path so Vercel's build-time file tracer
// bundles it) and keep in memory — these are small, unchanging static assets.
const qrisPaymentImage = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'qris-payment.jpg'));
const pecupLogoImage = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'pecup-logo.png'));

router.get('/assets/qris-payment.jpg', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.end(qrisPaymentImage);
});

router.get('/assets/pecup-logo.png', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.end(pecupLogoImage);
});

// ---------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------

router.get('/', async (req, res, { query }) => {
  const category = query.get('kategori');
  let [products, categories] = await Promise.all([
    queries.listProducts({ onlyActive: true }),
    queries.listCategories(),
  ]);
  if (category && category !== 'Semua') {
    products = products.filter((p) => p.category === category);
  }
  sendHtml(
    res,
    shopViews.renderBeranda({
      products,
      cartCount: cartLib.cartCount(req.cart),
      category,
      categories,
      cart: req.cart,
    })
  );
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
  // The add-to-cart forms are progressively enhanced client-side (see the
  // inline script in layout.js) to fetch() with this header instead of doing
  // a full-page POST+redirect — avoids a whole extra page render per click.
  const wantsJson = (req.headers.accept || '').includes('application/json');
  const fallbackRedirect = () =>
    redirect(res, req.headers.referer && req.headers.referer.includes('/produk/') ? `/produk/${productId}` : '/');

  const product = await queries.getProduct(productId);
  if (!product) {
    if (wantsJson) return sendJson(res, { ok: false, error: 'Produk tidak ditemukan.' }, 404);
    return fallbackRedirect();
  }

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
      if (wantsJson) return sendJson(res, { ok: false, error: 'Pilih 2 atau 3 buah.' }, 400);
      redirect(res, `/produk/${productId}`);
      return;
    }
  }

  cartLib.addToCart(req.cart, productId, qty, fruits);
  saveCartCookie(res, req.cart);

  if (wantsJson) return sendJson(res, { ok: true, cartCount: cartLib.cartCount(req.cart) });
  fallbackRedirect();
});

router.get('/keranjang', async (req, res) => {
  const { items, subtotal } = await cartLib.buildCartItems(req.cart);
  sendHtml(res, shopViews.renderKeranjang({ items, subtotal, cartCount: cartLib.cartCount(req.cart) }));
});

// Backs the quantity stepper on the product cards and the cart page. Takes
// the *target* quantity rather than a delta so a double-tap can't compound
// into the wrong number, clamps it to what's actually in stock, and returns
// the recalculated totals so the page can update without a reload.
router.post('/keranjang/set-qty', async (req, res) => {
  const { fields } = await parseBody(req);
  const requestedQty = Math.max(0, Number(fields.qty) || 0);
  const key = fields.key || String(Number(fields.productId));
  const productId = Number(fields.productId) || Number((req.cart[key] || {}).productId);

  const product = await queries.getProduct(productId);
  if (!product) return sendJson(res, { ok: false, error: 'Produk tidak ditemukan.' }, 404);

  const qty = Math.min(requestedQty, Math.max(Number(product.stock) || 0, 0));
  if (qty <= 0) cartLib.removeFromCart(req.cart, key);
  else if (req.cart[key]) cartLib.setCartQty(req.cart, key, qty);
  else cartLib.addToCart(req.cart, productId, qty);
  saveCartCookie(res, req.cart);

  const { items, subtotal } = await cartLib.buildCartItems(req.cart);
  const line = items.find((it) => it.key === key);
  sendJson(res, {
    ok: true,
    key,
    qty,
    cartCount: cartLib.cartCount(req.cart),
    lineSubtotal: formatRupiah(line ? line.subtotal : 0),
    subtotal: formatRupiah(subtotal),
    itemCount: items.length,
  });
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
  const address = (fields.address || '').trim();
  const deliveryDate = (fields.deliveryDate || '').trim();

  if (!customerName) errors.push('Nama lengkap wajib diisi.');
  const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
  if (!whatsapp) errors.push('Nomor WhatsApp wajib diisi.');
  else if (!normalizedWhatsapp) {
    errors.push('Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx.');
  }
  if (!address) errors.push('Lokasi/alamat pengantaran wajib diisi.');
  if (!deliveryDate) errors.push('Tanggal pengantaran wajib diisi.');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(Date.parse(deliveryDate))) {
    errors.push('Tanggal pengantaran tidak valid.');
  } else if (deliveryDate < toDateKey(new Date())) {
    errors.push('Tanggal pengantaran tidak boleh di masa lalu.');
  }
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
        formValues: { customerName, whatsapp, notes, address, deliveryDate },
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
    order = await queries.createOrder({
      customerName,
      whatsapp: normalizedWhatsapp,
      notes,
      items: orderItems,
      proofFilename,
      address,
      deliveryDate,
    });
  } catch (err) {
    console.error(err);
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        errors: [extractPgErrorMessage(err) || 'Gagal memproses pesanan. Coba lagi.'],
        formValues: { customerName, whatsapp, notes, address, deliveryDate },
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
  const admin = await adminAuth.checkCredentials(fields.username, fields.password);
  if (admin) {
    setCookie(res, adminSession.COOKIE_NAME, adminSession.issueToken(admin), { maxAge: adminSession.MAX_AGE_SECONDS });
    await logAdminAction(admin, 'login', null);
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
  sendHtml(res, adminViews.renderProdukList({ products, stats, flash: query.get('flash'), admin: req.admin }));
}));

router.get('/admin/produk/tambah', requireAdmin(async (req, res) => {
  const categories = await queries.listCategories();
  sendHtml(res, adminViews.renderProdukForm({ product: null, error: null, categories, admin: req.admin }));
}));

router.post('/admin/produk/tambah', requireAdmin(async (req, res) => {
  const { fields, files } = await parseBody(req);
  const error = validateProductFields(fields);
  if (error) {
    const categories = await queries.listCategories();
    return sendHtml(res, adminViews.renderProdukForm({ product: fields, error, categories, admin: req.admin }));
  }

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
    isBestseller: fields.is_bestseller ? 1 : 0,
    isRecommended: fields.is_recommended ? 1 : 0,
  });
  await logAdminAction(req.admin, 'product.create', fields.name.trim());
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk baru berhasil ditambahkan.'));
}));

router.get('/admin/produk/:id/edit', requireAdmin(async (req, res) => {
  const product = await queries.getProduct(Number(req.params.id));
  if (!product) return notFound(res);
  const categories = await queries.listCategories();
  sendHtml(res, adminViews.renderProdukForm({ product, error: null, categories, admin: req.admin }));
}));

router.post('/admin/produk/:id/edit', requireAdmin(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await queries.getProduct(id);
  if (!existing) return notFound(res);

  const { fields, files } = await parseBody(req);
  const error = validateProductFields(fields);
  if (error) {
    const categories = await queries.listCategories();
    return sendHtml(res, adminViews.renderProdukForm({ product: { ...fields, id, image: existing.image }, error, categories, admin: req.admin }));
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
    isBestseller: fields.is_bestseller ? 1 : 0,
    isRecommended: fields.is_recommended ? 1 : 0,
  });
  await logAdminAction(req.admin, 'product.update', fields.name.trim());
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk berhasil diperbarui.'));
}));

router.post('/admin/produk/:id/hapus', requireAdmin(async (req, res) => {
  const existing = await queries.getProduct(Number(req.params.id));
  await queries.deleteProduct(Number(req.params.id));
  await logAdminAction(req.admin, 'product.delete', existing ? existing.name : `#${req.params.id}`);
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk telah dihapus.'));
}));

router.post('/admin/produk/:id/toggle', requireAdmin(async (req, res) => {
  await queries.toggleProductActive(Number(req.params.id));
  await logAdminAction(req.admin, 'product.toggle', `#${req.params.id}`);
  redirect(res, '/admin/produk');
}));

// Quick stock edit straight from the product list — takes either an absolute
// qty or a +/- delta, so restocking doesn't mean opening the full edit form.
router.post('/admin/produk/:id/stok', requireAdmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const product = await queries.getProduct(id);
  if (!product) return notFound(res);

  const delta = Number(fields.delta);
  const target = Number.isFinite(delta) && fields.delta !== undefined && fields.delta !== ''
    ? Number(product.stock) + delta
    : Number(fields.stock);
  const stock = await queries.setProductStock(id, target);
  await logAdminAction(req.admin, 'product.stock', `${product.name}: ${product.stock} → ${stock}`);

  if ((req.headers.accept || '').includes('application/json')) {
    return sendJson(res, { ok: true, stock });
  }
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
      admin: req.admin,
    })
  );
}));

router.get('/admin/pesanan/unduh', requireAdmin(async (req, res, { query }) => {
  const today = toDateKey(new Date());
  let dari = query.get('dari') || query.get('tanggal') || today;
  let sampai = query.get('sampai') || query.get('tanggal') || dari;
  if (dari > sampai) [dari, sampai] = [sampai, dari]; // tolerate a reversed range picked in the UI

  const orders = await queries.listOrdersByDateRange(dari, sampai);
  const csv = await buildDailyOrdersCsv(orders);
  const filename = dari === sampai ? `pesanan-pecup-${dari}.csv` : `pesanan-pecup-${dari}_sampai_${sampai}.csv`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
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
  sendHtml(res, adminViews.renderPesananDetail({ order, items, proofUrl, admin: req.admin }));
}));

router.post('/admin/pesanan/:id/status', requireAdmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const status = fields.status === 'terkonfirmasi' ? 'terkonfirmasi' : 'menunggu';
  await queries.updateOrderStatus(Number(req.params.id), status);
  await logAdminAction(req.admin, 'order.status_update', `#${req.params.id} -> ${status}`);
  redirect(res, `/admin/pesanan/${req.params.id}`);
}));

// ---------------------------------------------------------------------
// admin: accounts (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/akun', requireSuperadmin(async (req, res, { query }) => {
  const admins = await adminAuth.listAdmins();
  sendHtml(res, adminViews.renderAdminList({ admins, admin: req.admin, error: query.get('error') }));
}));

router.post('/admin/akun/tambah', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const username = (fields.username || '').trim();
  const password = fields.password || '';
  const role = fields.role === 'superadmin' ? 'superadmin' : 'admin';

  let error = null;
  if (!username) error = 'Username wajib diisi.';
  else if (password.length < 6) error = 'Password minimal 6 karakter.';

  if (error) {
    return redirect(res, '/admin/akun?error=' + encodeURIComponent(error));
  }

  try {
    await adminAuth.createAdmin({ username, password, role });
    await logAdminAction(req.admin, 'admin.create', `${username} (${role})`);
    redirect(res, '/admin/akun');
  } catch (err) {
    const message = /unique/i.test(err.message) ? 'Username sudah dipakai.' : 'Gagal menambahkan admin.';
    redirect(res, '/admin/akun?error=' + encodeURIComponent(message));
  }
}));

router.post('/admin/akun/:id/hapus', requireSuperadmin(async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.admin.adminId) {
    return redirect(res, '/admin/akun?error=' + encodeURIComponent('Tidak bisa menghapus akun sendiri.'));
  }
  const target = await adminAuth.findAdminById(id);
  if (!target) return notFound(res);
  if (target.role === 'superadmin') {
    const remaining = await adminAuth.countSuperadmins();
    if (remaining <= 1) {
      return redirect(res, '/admin/akun?error=' + encodeURIComponent('Tidak bisa menghapus superadmin terakhir.'));
    }
  }

  await adminAuth.deleteAdmin(id);
  await logAdminAction(req.admin, 'admin.delete', `${target.username} (${target.role})`);
  redirect(res, '/admin/akun');
}));

// ---------------------------------------------------------------------
// admin: activity log (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/log-aktivitas', requireSuperadmin(async (req, res) => {
  const logs = await listAdminLogs(200);
  sendHtml(res, adminViews.renderAdminLog({ logs, admin: req.admin }));
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

// Admin-account management and the activity log are superadmin-only —
// regular admins keep full access to products and orders (the day-to-day
// work) but can't manage who else has access or see the audit trail.
function requireSuperadmin(handler) {
  return (req, res, extra) => {
    if (!req.isAdmin) return redirect(res, '/admin/login');
    if (!req.isSuperadmin) {
      return sendHtml(
        res,
        '<h1>403</h1><p>Hanya superadmin yang bisa mengakses halaman ini. <a href="/admin/produk">Kembali</a></p>',
        403
      );
    }
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

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
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
    req.admin = adminSession.verify(cookies[adminSession.COOKIE_NAME]);
    if (req.admin) {
      // The session token is self-contained (no server-side session store),
      // so a removed or role-changed admin would otherwise stay "logged in"
      // with stale privileges until the cookie naturally expires. Re-check
      // against the DB — this only runs when an admin cookie is actually
      // present, so it doesn't touch the customer-facing hot path.
      const current = await adminAuth.findAdminById(req.admin.adminId);
      req.admin = current ? { ...req.admin, role: current.role, username: current.username } : null;
    }
    req.isAdmin = Boolean(req.admin);
    req.isSuperadmin = Boolean(req.admin && req.admin.role === 'superadmin');

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
