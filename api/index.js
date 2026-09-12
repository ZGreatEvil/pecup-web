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
const customerSession = require('../src/customerSession');
const customerAuth = require('../src/customerAuth');
const settings = require('../src/settings');
const loyalty = require('../src/loyalty');
const vouchers = require('../src/vouchers');
const { parseBody } = require('../src/body');
const adminAuth = require('../src/adminAuth');
const { logAdminAction, queryAdminLogs, listLogFilters } = require('../src/adminLog');
const queries = require('../src/queries');
const {
  toDateKey,
  toDateOnly,
  csvEscape,
  formatRupiah,
  normalizeWhatsapp,
  formatWhatsapp,
  ORDER_STATUSES,
} = require('../src/utils');
const { buildDailyOrdersCsv } = require('../src/csvExport');
const { sendOrderNotification } = require('../src/orderEmail');
const { saveProductImage, saveProofFile, signedProofUrl } = require('../src/uploads');
const { productPhotos } = require('../src/views/productIcon');

const shopViews = require('../src/views/shop');
const adminViews = require('../src/views/admin');
const accountViews = require('../src/views/account');

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
// crawlers
// ---------------------------------------------------------------------

// Works out the public origin from the request, so this is correct on the
// Vercel domain, a custom domain, and localhost without configuration.
function originFor(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

router.get('/robots.txt', (req, res) => {
  // The admin panel and anything tied to a personal session must stay out of
  // search results entirely.
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /akun
Disallow: /keranjang
Disallow: /checkout
Disallow: /masuk
Disallow: /daftar
Disallow: /pesanan-berhasil

Sitemap: ${originFor(req)}/sitemap.xml
`;
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  res.end(body);
});

router.get('/sitemap.xml', async (req, res) => {
  const origin = originFor(req);
  const products = await queries.listProducts({ onlyActive: true });
  const urls = [
    { loc: `${origin}/`, priority: '1.0', freq: 'daily' },
    ...products.map((p) => ({
      loc: `${origin}/produk/${p.id}`,
      priority: '0.8',
      freq: 'weekly',
      lastmod: p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : null,
    })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(xml);
});

// ---------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------

router.get('/', async (req, res, { query }) => {
  const category = query.get('kategori');
  const search = (query.get('cari') || '').trim();
  const sort = query.get('urut') || '';

  const [all, categories, shop] = await Promise.all([
    queries.listProducts({ onlyActive: true }),
    queries.listCategories(),
    settings.shopConfig(),
  ]);

  let products = all;
  if (category && category !== 'Semua') products = products.filter((p) => p.category === category);
  if (search) {
    // Matches name, description or category, so "manis" and "salad" both work.
    const needle = search.toLowerCase();
    products = products.filter((p) =>
      [p.name, p.description, p.category].some((field) => String(field || '').toLowerCase().includes(needle))
    );
  }

  const sorters = {
    murah: (a, b) => Number(a.price) - Number(b.price),
    mahal: (a, b) => Number(b.price) - Number(a.price),
    nama: (a, b) => String(a.name).localeCompare(String(b.name), 'id'),
  };
  if (sorters[sort]) products = [...products].sort(sorters[sort]);

  sendHtml(
    res,
    shopViews.renderBeranda({
      products,
      cartCount: cartLib.cartCount(req.cart),
      category,
      categories,
      cart: req.cart,
      customer: req.customer,
      shop,
      search,
      sort,
      totalProducts: all.length,
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
    shopViews.renderProdukDetail({
      product,
      related,
      cartCount: cartLib.cartCount(req.cart),
      singleFruits,
      customer: req.customer,
    })
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
  sendHtml(
    res,
    shopViews.renderKeranjang({ items, subtotal, cartCount: cartLib.cartCount(req.cart), customer: req.customer })
  );
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

  // One batched query covers the product being changed *and* every other
  // line already in the cart, so this whole request is a single round-trip
  // to the database instead of one per cart line.
  const products = await queries.getProductsByIds([...cartLib.cartProductIds(req.cart), productId]);
  const product = products.get(productId);
  if (!product) return sendJson(res, { ok: false, error: 'Produk tidak ditemukan.' }, 404);

  const qty = Math.min(requestedQty, Math.max(Number(product.stock) || 0, 0));
  if (qty <= 0) cartLib.removeFromCart(req.cart, key);
  else if (req.cart[key]) cartLib.setCartQty(req.cart, key, qty);
  else cartLib.addToCart(req.cart, productId, qty);
  saveCartCookie(res, req.cart);

  const { items, subtotal } = await cartLib.buildCartItems(req.cart, { products });
  const line = items.find((it) => it.key === key);
  sendJson(res, {
    ok: true,
    key,
    qty,
    // Only whether the cap was hit — never the stock level itself.
    atMax: qty > 0 && qty >= Math.max(Number(product.stock) || 0, 0),
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

// ---------------------------------------------------------------------
// customer accounts (WhatsApp number is the username)
// ---------------------------------------------------------------------

function saveCustomerCookie(res, customer) {
  setCookie(res, customerSession.COOKIE_NAME, customerSession.issueToken(customer), {
    maxAge: customerSession.MAX_AGE_SECONDS,
    httpOnly: true,
  });
}

// Only ever redirect to a path on this site — never to whatever an attacker
// managed to get into the ?next= parameter.
function safeNext(value) {
  const next = String(value || '');
  return /^\/[^/\\]/.test(next) ? next : '/akun';
}

router.get('/masuk', async (req, res, { query }) => {
  if (req.customer) return redirect(res, '/akun');
  sendHtml(
    res,
    accountViews.renderMasuk({ cartCount: cartLib.cartCount(req.cart), next: query.get('next') || '' })
  );
});

router.post('/masuk', async (req, res) => {
  const { fields } = await parseBody(req);
  const whatsapp = (fields.whatsapp || '').trim();
  const password = fields.password || '';

  const customer = await customerAuth.checkCredentials(whatsapp, password);
  if (!customer) {
    return sendHtml(
      res,
      accountViews.renderMasuk({
        cartCount: cartLib.cartCount(req.cart),
        customer: req.customer,
        errors: ['Nomor WhatsApp atau password salah.'],
        values: { whatsapp },
        next: fields.next || '',
      })
    );
  }

  saveCustomerCookie(res, customer);
  redirect(res, safeNext(fields.next));
});

router.get('/daftar', async (req, res) => {
  if (req.customer) return redirect(res, '/akun');
  sendHtml(res, accountViews.renderDaftar({ cartCount: cartLib.cartCount(req.cart) }));
});

router.post('/daftar', async (req, res) => {
  const { fields } = await parseBody(req);
  const name = (fields.name || '').trim();
  const whatsapp = (fields.whatsapp || '').trim();
  const address = (fields.address || '').trim();
  const password = fields.password || '';

  const errors = [];
  if (!name) errors.push('Nama lengkap wajib diisi.');
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) errors.push('Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx.');
  if (password.length < 6) errors.push('Password minimal 6 karakter.');
  if (normalized && (await customerAuth.findByWhatsapp(normalized))) {
    errors.push('Nomor WhatsApp ini sudah terdaftar. Silakan masuk.');
  }

  if (errors.length) {
    return sendHtml(
      res,
      accountViews.renderDaftar({
        cartCount: cartLib.cartCount(req.cart),
        customer: req.customer,
        errors,
        values: { name, whatsapp, address },
      })
    );
  }

  const customer = await customerAuth.createCustomer({ whatsapp: normalized, name, password, address });
  saveCustomerCookie(res, customer);
  redirect(res, '/akun');
});

router.post('/keluar', async (req, res) => {
  clearCookie(res, customerSession.COOKIE_NAME);
  redirect(res, '/');
});

function requireCustomer(handler) {
  return async (req, res, extra) => {
    if (!req.customer) return redirect(res, '/masuk');
    const customer = await customerAuth.findById(req.customer.customerId);
    if (!customer) {
      clearCookie(res, customerSession.COOKIE_NAME);
      return redirect(res, '/masuk');
    }
    return handler(req, res, { ...extra, customer });
  };
}

router.get('/akun', requireCustomer(async (req, res, { customer, query }) => {
  // Only the latest few here — the full list lives at /akun/pesanan so the
  // profile stays short for a long-standing customer.
  const [loyaltyStatus, recent, stampHistory] = await Promise.all([
    loyalty.statusFor(customer.id),
    queries.queryOrders({ customerId: customer.id, page: 1, perPage: 5 }),
    loyalty.listStamps(customer.id),
  ]);
  sendHtml(
    res,
    accountViews.renderAkun({
      customer,
      loyalty: loyaltyStatus,
      orders: recent.orders,
      totalOrders: recent.total,
      stampHistory,
      cartCount: cartLib.cartCount(req.cart),
      flash: query && query.get('ok') ? 'Perubahan tersimpan.' : '',
    })
  );
}));

router.get('/akun/pesanan', requireCustomer(async (req, res, { customer, query }) => {
  const view = {
    dari: query.get('dari') || '',
    sampai: query.get('sampai') || '',
    halaman: Number(query.get('halaman')) || 1,
  };
  const result = await queries.queryOrders({
    customerId: customer.id,
    from: view.dari,
    to: view.sampai,
    page: view.halaman,
    perPage: 15,
  });
  sendHtml(
    res,
    accountViews.renderRiwayatPesanan({
      customer,
      orders: result.orders,
      pagination: result,
      cartCount: cartLib.cartCount(req.cart),
      view,
    })
  );
}));

router.post('/akun', requireCustomer(async (req, res, { customer }) => {
  const { fields } = await parseBody(req);
  const name = (fields.name || '').trim();
  if (!name) return redirect(res, '/akun');

  const updated = await customerAuth.updateCustomer(customer.id, {
    name,
    address: (fields.address || '').trim(),
  });
  // Re-issue the cookie so the header greeting reflects a renamed account.
  saveCustomerCookie(res, updated);
  redirect(res, '/akun?ok=1');
}));

router.post('/akun/password', requireCustomer(async (req, res, { customer }) => {
  const { fields } = await parseBody(req);
  const valid = await customerAuth.checkCredentials(customer.whatsapp, fields.currentPassword || '');
  const newPassword = fields.newPassword || '';

  const errors = [];
  if (!valid) errors.push('Password lama salah.');
  if (newPassword.length < 6) errors.push('Password baru minimal 6 karakter.');

  if (errors.length) {
    const [loyaltyStatus, recent, stampHistory] = await Promise.all([
      loyalty.statusFor(customer.id),
      queries.queryOrders({ customerId: customer.id, page: 1, perPage: 5 }),
      loyalty.listStamps(customer.id),
    ]);
    return sendHtml(
      res,
      accountViews.renderAkun({
        customer,
        loyalty: loyaltyStatus,
        orders: recent.orders,
        totalOrders: recent.total,
        stampHistory,
        cartCount: cartLib.cartCount(req.cart),
        errors,
      })
    );
  }

  await customerAuth.updatePassword(customer.id, newPassword);
  redirect(res, '/akun?ok=1');
}));

router.get('/checkout', async (req, res, { query }) => {
  const { items, subtotal } = await cartLib.buildCartItems(req.cart);
  if (items.length === 0) return redirect(res, '/keranjang');

  // Signed-in shoppers get the form pre-filled from their saved profile —
  // that's the whole point of having an account.
  const [saved, reward, shop] = await Promise.all([
    req.customer ? customerAuth.findById(req.customer.customerId) : null,
    rewardPreview(req.customer, items),
    settings.shopConfig(),
  ]);
  const code = query.get('voucher') || '';
  const deliveryFee = settings.deliveryFeeFor(shop, subtotal);
  const totals = await checkoutTotals({ code, subtotal, reward, deliveryFee });

  sendHtml(
    res,
    shopViews.renderCheckout({
      items,
      subtotal,
      cartCount: cartLib.cartCount(req.cart),
      customer: saved,
      reward,
      shop,
      voucher: totals.voucherWithoutReward,
      totals,
      deliveryFee,
      formValues: saved
        ? {
            customerName: saved.name,
            whatsapp: formatWhatsapp(saved.whatsapp),
            address: saved.address,
            voucherCode: code,
          }
        : { voucherCode: code },
    })
  );
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
        customer: req.customer,
        errors: ['Berkas terlalu besar atau gagal diunggah. Coba lagi dengan file yang lebih kecil (maks. 4MB).'],
      }),
      413
    );
  }

  // Re-derived here, never taken from the request: the form can only ask to
  // use a reward, and the database re-checks eligibility again at insert time.
  const reward = await rewardPreview(req.customer, items);
  const useReward = Boolean(fields.useReward) && reward.available > 0;
  const rewardDiscount = useReward ? reward.discount : 0;

  const shop = await settings.shopConfig();
  const voucherCode = vouchers.normalizeCode(fields.voucherCode || '');
  const deliveryFee = settings.deliveryFeeFor(shop, subtotal);
  const totals = await checkoutTotals({ code: voucherCode, subtotal, reward, deliveryFee });
  // Match the voucher preview to whether the free cup is actually being used.
  const voucher = useReward && totals.voucherWithReward ? totals.voucherWithReward : totals.voucherWithoutReward;
  const payable = useReward ? totals.withReward : totals.withoutReward;

  const errors = [];
  const customerName = (fields.customerName || '').trim();
  const whatsapp = (fields.whatsapp || '').trim();
  const notes = (fields.notes || '').trim();
  const address = (fields.address || '').trim();
  const deliveryDate = (fields.deliveryDate || '').trim();

  // Shop-level gates first — no point validating a form for an order that
  // can't be accepted at all.
  if (!shop.open) {
    errors.push(shop.notice || 'Maaf, Pecup sedang tutup dan belum menerima pesanan.');
  }
  if (shop.minOrder > 0 && subtotal < shop.minOrder) {
    errors.push(`Minimal belanja ${formatRupiah(shop.minOrder)}. Tambah beberapa cup lagi ya.`);
  }
  if (voucherCode && voucher.error) errors.push(voucher.error);

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
  } else if (deliveryDate === toDateKey(new Date()) && pastSameDayCutoff(shop.sameDayCutoff)) {
    errors.push(
      `Pesanan untuk hari ini sudah ditutup pukul ${shop.sameDayCutoff} WIB. Pilih tanggal besok atau setelahnya.`
    );
  }
  // A fully-waived order has nothing to transfer, so don't demand a proof.
  if (payable > 0 && !files.proof) errors.push('Bukti transfer wajib diunggah.');
  else if (files.proof && !['image/jpeg', 'image/png', 'application/pdf'].includes(files.proof.mimetype)) {
    errors.push('Format bukti transfer harus JPG, PNG, atau PDF.');
  }

  for (const it of items) {
    if (it.qty > it.product.stock) {
      // Deliberately no number: shoppers don't get to see stock levels.
      errors.push(`Stok ${it.product.name} tidak mencukupi. Kurangi jumlahnya lalu coba lagi.`);
    }
  }

  if (errors.length) {
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        customer: req.customer,
        reward,
        useReward,
        shop,
        voucher,
        totals,
        deliveryFee,
        errors,
        formValues: { customerName, whatsapp, notes, address, deliveryDate, voucherCode },
      })
    );
  }

  let proofFilename;
  let order;
  try {
    proofFilename = files.proof ? await saveProofFile(files.proof) : null;
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
      customerId: req.customer ? req.customer.customerId : null,
      useReward,
      // Only the code text is sent; create_order works out what it's worth
      // and consumes it under a row lock.
      voucherCode: voucher.applied ? voucher.code : null,
      deliveryFee,
    });
  } catch (err) {
    console.error(err);
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        customer: req.customer,
        reward,
        useReward,
        shop,
        voucher,
        totals,
        deliveryFee,
        errors: [extractPgErrorMessage(err) || 'Gagal memproses pesanan. Coba lagi.'],
        formValues: { customerName, whatsapp, notes, address, deliveryDate, voucherCode },
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
  // An order placed by a signed-in customer is only theirs to see (admins
  // included). Guest orders stay open — there's no session to check them
  // against, and the buyer is redirected straight here after checkout.
  if (order.customer_id) {
    const isOwner = req.customer && Number(req.customer.customerId) === Number(order.customer_id);
    if (!isOwner && !req.isAdmin) return notFound(res);
  }
  const items = await queries.getOrderItems(order.id);
  sendHtml(res, shopViews.renderSukses({ order, items, emailOk: Boolean(order.email_sent), customer: req.customer }));
});

// ---------------------------------------------------------------------
// admin: auth
// ---------------------------------------------------------------------

router.get('/admin', requireAdmin(async (req, res) => {
  const todayKey = toDateKey(new Date());
  const [data, shop] = await Promise.all([
    queries.dashboardData({ todayKey, monthStart: `${todayKey.slice(0, 7)}-01` }),
    settings.shopConfig(),
  ]);
  sendHtml(res, adminViews.renderDashboard({ admin: req.admin, shop, ...data }));
}));

router.get('/admin/login', (req, res) => {
  if (req.isAdmin) return redirect(res, '/admin/produk');
  sendHtml(res, adminViews.renderLogin({ error: null }));
});

router.post('/admin/login', async (req, res) => {
  const { fields } = await parseBody(req);
  const admin = await adminAuth.checkCredentials(fields.username, fields.password);
  if (admin && admin.lockedOut) {
    return sendHtml(
      res,
      adminViews.renderLogin({
        error: 'Terlalu banyak percobaan gagal. Tunggu 15 menit lalu coba lagi.',
      }),
      429
    );
  }
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
  const [allProducts, stats, categories] = await Promise.all([
    queries.listProducts(),
    queries.productStats(),
    queries.listCategories(),
  ]);

  const view = {
    kategori: query.get('kategori') || '',
    status: query.get('status') || 'semua',
    urut: query.get('urut') || '',
    arah: query.get('arah') === 'desc' ? 'desc' : 'asc',
  };

  const statusMatches = {
    semua: () => true,
    aktif: (p) => Boolean(p.active),
    nonaktif: (p) => !p.active,
    habis: (p) => Number(p.stock) <= 0,
    menipis: (p) => Number(p.stock) > 0 && Number(p.stock) <= 5,
  };
  const matchesStatus = statusMatches[view.status] || statusMatches.semua;

  let products = allProducts.filter(
    (p) => matchesStatus(p) && (!view.kategori || p.category === view.kategori)
  );

  // Sorting is done here rather than in SQL: the catalogue is small enough
  // that one fetch + sort beats a query per sort option, and it keeps
  // localeCompare's Indonesian collation for names.
  const sorters = {
    nama: (a, b) => String(a.name).localeCompare(String(b.name), 'id'),
    kategori: (a, b) =>
      String(a.category).localeCompare(String(b.category), 'id') ||
      String(a.name).localeCompare(String(b.name), 'id'),
    harga: (a, b) => Number(a.price) - Number(b.price),
    stok: (a, b) => Number(a.stock) - Number(b.stock),
  };
  if (sorters[view.urut]) {
    products.sort(sorters[view.urut]);
    if (view.arah === 'desc') products.reverse();
  }

  sendHtml(
    res,
    adminViews.renderProdukList({
      products,
      stats,
      categories,
      view,
      totalCount: allProducts.length,
      flash: query.get('flash'),
      admin: req.admin,
    })
  );
}));

router.get('/admin/produk/tambah', requireAdmin(async (req, res) => {
  const categories = await queries.listCategories();
  sendHtml(res, adminViews.renderProdukForm({ product: null, error: null, categories, admin: req.admin }));
}));

router.post('/admin/produk/tambah', requireAdmin(async (req, res) => {
  const { fields, fileLists } = await parseBody(req);
  const error = validateProductFields(fields);
  if (error) {
    const categories = await queries.listCategories();
    return sendHtml(res, adminViews.renderProdukForm({ product: fields, error, categories, admin: req.admin }));
  }

  const images = await uploadGalleryFiles(fileLists.image);
  await queries.createProduct({
    name: fields.name.trim(),
    description: (fields.description || '').trim(),
    category: fields.category || 'Buah Tunggal',
    weight: fields.weight.trim(),
    price: Number(fields.price),
    stock: Number(fields.stock),
    image: images[0] || null,
    images,
    active: fields.active ? 1 : 0,
    isBestseller: fields.is_bestseller ? 1 : 0,
    isRecommended: fields.is_recommended ? 1 : 0,
    ...wholesaleFields(fields),
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

  const { fields, fieldLists, fileLists } = await parseBody(req);
  const error = validateProductFields(fields);
  if (error) {
    const categories = await queries.listCategories();
    return sendHtml(
      res,
      adminViews.renderProdukForm({
        product: { ...fields, id, image: existing.image, images: existing.images },
        error,
        categories,
        admin: req.admin,
      })
    );
  }

  // Gallery = (existing photos the admin didn't tick "Hapus" on, in whatever
  // order the tiles ended up in) + new uploads appended. `fotoUrutan` carries
  // that order; it's filtered against the photos actually on the product so a
  // forged or stale value can't inject a URL.
  const removed = new Set(fieldLists.hapusFoto || []);
  const onProduct = productPhotos(existing);
  const requested = (fieldLists.fotoUrutan || []).filter((url) => onProduct.includes(url));
  // Anything the form didn't mention (older tab, JS off) keeps its old spot
  // at the end rather than silently disappearing.
  const ordered = [...requested, ...onProduct.filter((url) => !requested.includes(url))];
  const kept = Array.from(new Set(ordered)).filter((url) => !removed.has(url));
  const uploaded = await uploadGalleryFiles(fileLists.image);
  const images = [...kept, ...uploaded];

  await queries.updateProduct(id, {
    name: fields.name.trim(),
    description: (fields.description || '').trim(),
    category: fields.category || 'Buah Tunggal',
    weight: fields.weight.trim(),
    price: Number(fields.price),
    stock: Number(fields.stock),
    images,
    active: fields.active ? 1 : 0,
    isBestseller: fields.is_bestseller ? 1 : 0,
    isRecommended: fields.is_recommended ? 1 : 0,
    ...wholesaleFields(fields),
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
  const todayKey = toDateKey(new Date());

  // Presets are shorthand for a filter combination. Picking one replaces the
  // whole view, which is why they're read before the individual fields.
  const presets = {
    'hari-ini': { jenisTanggal: 'dipesan', dari: todayKey, sampai: todayKey, urut: 'dipesan', arah: 'desc' },
    '7-hari': { jenisTanggal: 'dipesan', dari: shiftDateKey(todayKey, -6), sampai: todayKey, urut: 'dipesan', arah: 'desc' },
    '30-hari': { jenisTanggal: 'dipesan', dari: shiftDateKey(todayKey, -29), sampai: todayKey, urut: 'dipesan', arah: 'desc' },
    'kirim-hari-ini': { jenisTanggal: 'dikirim', dari: todayKey, sampai: todayKey, urut: 'dikirim', arah: 'asc' },
    'kirim-mendatang': { jenisTanggal: 'dikirim', dari: todayKey, sampai: '', urut: 'dikirim', arah: 'asc' },
    semua: { jenisTanggal: 'dipesan', dari: '', sampai: '', urut: 'dipesan', arah: 'desc' },
  };

  const requested = query.get('tampilan') || '';
  // ?tanggal= is the old single-day link; keep it working.
  const legacyDate = query.get('tanggal') || '';
  // With no parameters at all, open on today rather than dumping everything.
  const hasExplicitView = ['jenisTanggal', 'dari', 'sampai', 'status', 'q', 'urut'].some((k) => query.get(k) !== null);
  const preset = presets[requested] || (!hasExplicitView && !legacyDate ? presets['hari-ini'] : null);
  const activePreset = presets[requested] ? requested : !hasExplicitView && !legacyDate ? 'hari-ini' : '';

  // A preset supplies the date window and sort; status and search always come
  // from the query, so combining a preset chip with a status filter narrows
  // rather than silently dropping the status.
  const view = {
    ...(preset || {
      jenisTanggal: query.get('jenisTanggal') === 'dikirim' ? 'dikirim' : 'dipesan',
      dari: legacyDate || query.get('dari') || '',
      sampai: legacyDate || query.get('sampai') || '',
      urut: query.get('urut') || 'dipesan',
      arah: query.get('arah') === 'asc' ? 'asc' : 'desc',
    }),
    status: query.get('status') || '',
    q: (query.get('q') || '').trim(),
  };

  view.halaman = Number(query.get('halaman')) || 1;

  const filters = {
    from: view.dari,
    to: view.sampai,
    status: view.status,
    search: view.q,
    dateField: view.jenisTanggal,
    sort: view.urut,
    dir: view.arah,
  };

  // The page of rows to show, plus a summary over the *whole* filtered set —
  // the stat cards would be misleading if they only counted one page.
  const [result, allMatching] = await Promise.all([
    queries.queryOrders({ ...filters, page: view.halaman, perPage: 25 }),
    queries.queryAllOrders(filters),
  ]);

  sendHtml(
    res,
    adminViews.renderPesananList({
      orders: result.orders,
      stats: queries.summarizeOrders(allMatching),
      admin: req.admin,
      view: { ...view, halaman: result.page },
      todayKey,
      activePreset,
      pagination: result,
    })
  );
}));

// Export honours the same filters as the on-screen table, so what finance
// downloads matches what the admin was looking at. Empty dates mean "all
// time" rather than defaulting to today — that's what makes a yearly export
// possible.
router.get('/admin/pesanan/unduh', requireAdmin(async (req, res, { query }) => {
  let dari = query.get('dari') || query.get('tanggal') || '';
  let sampai = query.get('sampai') || query.get('tanggal') || '';
  if (dari && sampai && dari > sampai) [dari, sampai] = [sampai, dari]; // tolerate a reversed range

  const orders = await queries.queryAllOrders({
    from: dari,
    to: sampai,
    status: query.get('status') || '',
    search: (query.get('q') || '').trim(),
    dateField: query.get('jenisTanggal') === 'dikirim' ? 'dikirim' : 'dipesan',
    sort: 'dipesan',
    dir: 'asc',
  });
  const csv = await buildDailyOrdersCsv(orders);
  const label = dari || sampai ? `${dari || 'awal'}_sampai_${sampai || 'sekarang'}` : 'semua';
  const filename = `pesanan-pecup-${label}.csv`;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end(csv);
}));

router.get('/admin/pesanan/:id', requireAdmin(async (req, res, { query }) => {
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
  // Signed-in customers have a stamp card; guest orders don't.
  const loyaltyStatus = order.customer_id ? await loyalty.statusFor(Number(order.customer_id)) : null;
  sendHtml(
    res,
    adminViews.renderPesananDetail({
      order,
      items,
      proofUrl,
      admin: req.admin,
      loyalty: loyaltyStatus,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/pesanan/:id/tukar-stempel', requireAdmin(async (req, res) => {
  const order = await queries.getOrder(Number(req.params.id));
  if (!order) return notFound(res);
  if (!order.customer_id) return redirect(res, `/admin/pesanan/${req.params.id}`);

  const result = await loyalty.claimReward(Number(order.customer_id), {
    note: `Ditukar admin pada ${order.order_number}`,
  });
  if (result.ok) {
    await logAdminAction(req.admin, 'loyalty.redeem', `${order.customer_name} (${order.order_number})`);
  }
  redirect(res, `/admin/pesanan/${req.params.id}`);
}));

router.post('/admin/pesanan/:id/status', requireAdmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  // Only accept one of the three known states — an unexpected value would
  // otherwise silently break the stamp rules, which key off 'selesai'.
  const status = ORDER_STATUSES.some((s) => s.value === fields.status) ? fields.status : 'menunggu';

  const order = await queries.getOrder(id);
  if (!order) return notFound(res, req);

  // Cancelling gives the reserved cups back to stock; un-cancelling takes
  // them again. setOrderCancelled() owns both the status change and the stock
  // movement so they can't get out of step.
  const wasCancelled = order.status === 'dibatalkan';
  const nowCancelled = status === 'dibatalkan';

  if (nowCancelled !== wasCancelled) {
    const result = await queries.setOrderCancelled(id, nowCancelled);
    if (!result.ok) {
      return redirect(res, `/admin/pesanan/${id}?error=` + encodeURIComponent('Status sudah diubah orang lain. Muat ulang halaman ini.'));
    }
    // Un-cancelling lands on 'menunggu'; if the admin picked something else,
    // apply that on top now the stock is settled.
    if (!nowCancelled && status !== 'menunggu') await queries.updateOrderStatus(id, status);
  } else {
    await queries.updateOrderStatus(id, status);
  }

  // Completing an order earns a stamp; moving it back out takes an unspent
  // one away again. A cancelled order must not hold a stamp either.
  if (order.customer_id) {
    if (status === 'selesai') await loyalty.grantForOrder(Number(order.customer_id), id);
    else if (order.status === 'selesai' || nowCancelled) await loyalty.revokeForOrder(id);
  }

  await logAdminAction(
    req.admin,
    'order.status_update',
    `${order.order_number} -> ${status}${nowCancelled !== wasCancelled ? (nowCancelled ? ' (stok dikembalikan)' : ' (stok dipotong lagi)') : ''}`
  );
  redirect(res, `/admin/pesanan/${id}`);
}));

// ---------------------------------------------------------------------
// admin: shop settings & promo codes (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/pengaturan', requireSuperadmin(async (req, res, { query }) => {
  sendHtml(
    res,
    adminViews.renderPengaturan({
      admin: req.admin,
      shop: await settings.shopConfig(),
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/pengaturan/toko', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const num = (value) => Math.max(0, Math.round(Number(value) || 0));
  const cutoff = (fields.sameDayCutoff || '').trim();
  if (cutoff && !/^\d{2}:\d{2}$/.test(cutoff)) {
    return redirect(res, '/admin/pengaturan?error=' + encodeURIComponent('Format jam tutup tidak valid.'));
  }

  await Promise.all([
    settings.setValue('shop_open', fields.shopOpen ? '1' : '0'),
    settings.setValue('shop_notice', (fields.shopNotice || '').trim().slice(0, 200)),
    settings.setValue('min_order', num(fields.minOrder)),
    settings.setValue('delivery_fee', num(fields.deliveryFee)),
    settings.setValue('free_delivery_over', num(fields.freeDeliveryOver)),
    settings.setValue('same_day_cutoff', cutoff),
  ]);
  await logAdminAction(req.admin, 'settings.update', `toko ${fields.shopOpen ? 'buka' : 'tutup'}`);
  redirect(res, '/admin/pengaturan?flash=' + encodeURIComponent('Pengaturan toko disimpan.'));
}));

router.get('/admin/voucher', requireSuperadmin(async (req, res, { query }) => {
  sendHtml(
    res,
    adminViews.renderVoucher({
      admin: req.admin,
      vouchers: await vouchers.list(),
      kinds: vouchers.KINDS,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/voucher/tambah', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const result = await vouchers.create({
    code: fields.code,
    kind: fields.kind,
    amount: fields.amount,
    minSpend: fields.minSpend,
    maxDiscount: fields.maxDiscount,
    usageLimit: fields.usageLimit,
    expiresAt: (fields.expiresAt || '').trim() || null,
  });
  if (!result.ok) return redirect(res, '/admin/voucher?error=' + encodeURIComponent(result.error));

  await logAdminAction(req.admin, 'voucher.create', result.code);
  redirect(res, '/admin/voucher?flash=' + encodeURIComponent(`Kode ${result.code} dibuat.`));
}));

router.post('/admin/voucher/:id/toggle', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const all = await vouchers.list();
  const target = all.find((v) => Number(v.id) === id);
  if (!target) return notFound(res, req);

  await vouchers.setActive(id, !target.active);
  await logAdminAction(req.admin, 'voucher.update', `${target.code} -> ${target.active ? 'nonaktif' : 'aktif'}`);
  redirect(res, '/admin/voucher?flash=' + encodeURIComponent(`Kode ${target.code} diperbarui.`));
}));

router.post('/admin/voucher/:id/hapus', requireSuperadmin(async (req, res) => {
  const id = Number(req.params.id);
  const all = await vouchers.list();
  const target = all.find((v) => Number(v.id) === id);
  if (!target) return notFound(res, req);

  await vouchers.remove(id);
  await logAdminAction(req.admin, 'voucher.delete', target.code);
  redirect(res, '/admin/voucher?flash=' + encodeURIComponent(`Kode ${target.code} dihapus.`));
}));

// ---------------------------------------------------------------------
// admin: sales report
// ---------------------------------------------------------------------

// Open to every admin: they already see each order's total on the Pesanan
// page, so this exposes no new information — it just adds them up.
router.get('/admin/laporan', requireAdmin(async (req, res, { query }) => {
  const todayKey = toDateKey(new Date());
  const requested = query.get('rentang') || '';
  const hasExplicitDates = query.get('dari') !== null || query.get('sampai') !== null;
  const preset = resolveRange(requested, todayKey) || (!hasExplicitDates ? resolveRange('30-hari', todayKey) : null);
  const activePreset = resolveRange(requested, todayKey) ? requested : !hasExplicitDates ? '30-hari' : '';

  const view = {
    dari: preset ? preset.dari : query.get('dari') || '',
    sampai: preset ? preset.sampai : query.get('sampai') || '',
    kelompok: query.get('kelompok') === 'bulan' ? 'bulan' : 'hari',
    includeAll: query.get('semuaStatus') === '1',
  };

  const report = await queries.revenueReport({
    from: view.dari,
    to: view.sampai,
    // Revenue means money actually collected, so only completed orders count
    // unless the admin explicitly asks to see everything.
    statuses: view.includeAll ? ORDER_STATUSES.map((s) => s.value) : ['selesai'],
    groupBy: view.kelompok,
  });

  sendHtml(res, adminViews.renderLaporan({ admin: req.admin, report, view, activePreset, todayKey }));
}));

// ---------------------------------------------------------------------
// admin: accounts (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/akun', requireSuperadmin(async (req, res, { query }) => {
  const admins = await adminAuth.listAdmins();
  sendHtml(
    res,
    adminViews.renderAdminList({
      admins,
      admin: req.admin,
      error: query.get('error'),
      flash: query.get('flash') || '',
    })
  );
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

// Superadmin resetting another admin's password. The plaintext is hashed by
// adminAuth and never stored or logged — the log records only who changed
// whose password.
router.post('/admin/akun/:id/password', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const password = fields.password || '';

  const target = await adminAuth.findAdminById(id);
  if (!target) return notFound(res);
  if (password.length < 6) {
    return redirect(res, '/admin/akun?error=' + encodeURIComponent('Password minimal 6 karakter.'));
  }

  await adminAuth.updateAdminPassword(id, password);
  await logAdminAction(req.admin, 'admin.password', target.username);
  redirect(res, '/admin/akun?flash=' + encodeURIComponent(`Password ${target.username} berhasil diganti.`));
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
// admin: customers, stamps & shop settings (superadmin only)
// ---------------------------------------------------------------------

// Looking a customer up is day-to-day work, so every admin can search and
// read. Changing stamps (below) stays superadmin-only.
router.get('/admin/pelanggan', requireAdmin(async (req, res, { query }) => {
  const search = (query.get('q') || '').trim();
  const view = {
    urut: query.get('urut') || 'baru',
    tier: query.get('tier') || '',
    hanya: query.get('hanya') || '',
  };
  const [customers, totalCustomers, tierConfig] = await Promise.all([
    loyalty.listCustomersWithLoyalty({ search, sort: view.urut, tier: view.tier, only: view.hanya }),
    loyalty.countCustomers(),
    loyalty.getTierConfig(),
  ]);
  sendHtml(
    res,
    adminViews.renderPelangganList({
      customers,
      search,
      totalCustomers,
      tiersEnabled: tierConfig.enabled,
      tierNames: tierConfig.tiers.map((t) => t.name),
      view,
      admin: req.admin,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

// Registered with /:id below it, so this literal path has to be declared
// first or "unduh" would be read as a customer id.
router.get('/admin/pelanggan/unduh', requireSuperadmin(async (req, res) => {
  const customers = await loyalty.listCustomersWithLoyalty({ limit: 500 });
  const header = [
    'Nama',
    'WhatsApp',
    'Bergabung',
    'Ulang Tahun',
    'Stempel Aktif',
    'Klaim Cup Gratis',
    'Tier',
    'Stempel Hangus',
  ];
  const lines = [header.map(csvEscape).join(',')];
  for (const c of customers) {
    lines.push(
      [
        c.name,
        formatWhatsapp(c.whatsapp),
        toDateOnly(c.created_at),
        c.birthday ? toDateOnly(c.birthday) : '',
        String(c.stamps),
        String(c.claims),
        c.tiersEnabled ? c.tier.name : '',
        c.expiresLabel || '',
      ].map(csvEscape).join(',')
    );
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pelanggan-pecup-${toDateKey(new Date())}.csv"`,
  });
  res.end('﻿' + lines.join('\r\n'));
}));

router.get('/admin/pelanggan/:id', requireAdmin(async (req, res, { query }) => {
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  const todayKey = toDateKey(new Date());
  const requested = query.get('rentang') || '';
  const range = resolveRange(requested, todayKey);
  const orderView = {
    dari: range ? range.dari : query.get('dari') || '',
    sampai: range ? range.sampai : query.get('sampai') || '',
    rentang: range ? requested : '',
    halaman: Number(query.get('halaman')) || 1,
  };

  const orderFilters = { customerId: id, from: orderView.dari, to: orderView.sampai, sort: 'dipesan', dir: 'desc' };

  const [loyaltyStatus, result, stamps, tierConfig, lifetimeOrders] = await Promise.all([
    loyalty.statusFor(id),
    queries.queryOrders({ ...orderFilters, page: orderView.halaman, perPage: 10 }),
    loyalty.listStamps(id),
    loyalty.getTierConfig(),
    // Lifetime figures ignore the date filter — they describe the customer,
    // not the window being browsed.
    queries.queryAllOrders({ customerId: id, status: 'selesai' }),
  ]);

  sendHtml(
    res,
    adminViews.renderPelangganDetail({
      customer,
      loyalty: loyaltyStatus,
      orders: result.orders,
      stamps,
      admin: req.admin,
      canEdit: req.isSuperadmin,
      tiersEnabled: tierConfig.enabled,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
      pagination: result,
      orderView: { ...orderView, halaman: result.page },
      activePreset: range ? requested : '',
      lifetime: {
        orders: lifetimeOrders.length,
        spent: lifetimeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
      },
    })
  );
}));

// The programme rulebook — separate tab, superadmin only.
router.get('/admin/loyalitas', requireSuperadmin(async (req, res, { query }) => {
  const [perReward, all, tierConfig, stats] = await Promise.all([
    settings.stampsPerReward(),
    settings.getAll(),
    loyalty.getTierConfig(),
    loyalty.programStats(),
  ]);
  sendHtml(
    res,
    adminViews.renderLoyalitas({
      admin: req.admin,
      perReward,
      expiryMonths: Number(all.stamp_expiry_months) || 2,
      tierConfig,
      stats,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/pelanggan/:id/stempel', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  const target = Number(fields.stamps);
  if (!Number.isFinite(target) || target < 0) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent('Jumlah stempel tidak valid.'));
  }

  const updated = await loyalty.setStampCount(id, target, { by: req.admin.username });
  await logAdminAction(req.admin, 'loyalty.stamps', `${customer.name} -> ${updated.stamps} stempel`);
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent(`Stempel ${customer.name} diperbarui.`));
}));

router.post('/admin/pelanggan/:id/ubah', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  const name = (fields.name || '').trim();
  if (!name) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent('Nama wajib diisi.'));
  }

  const birthday = (fields.birthday || '').trim();
  if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(Date.parse(birthday)))) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent('Tanggal ulang tahun tidak valid.'));
  }

  const result = await customerAuth.adminUpdateCustomer(id, {
    name,
    whatsapp: fields.whatsapp || '',
    address: (fields.address || '').trim(),
    birthday: birthday || null,
  });
  if (!result.ok) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent(result.error));
  }

  const renamed = customer.name !== name ? ` (dulu ${customer.name})` : '';
  await logAdminAction(req.admin, 'customer.update', `${name}${renamed}`);
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent('Data pelanggan diperbarui.'));
}));

// Same rule as the admin reset above: hashed on write, plaintext never kept.
router.post('/admin/pelanggan/:id/password', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  if ((fields.password || '').length < 6) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent('Password minimal 6 karakter.'));
  }

  await customerAuth.updatePassword(id, fields.password);
  await logAdminAction(req.admin, 'customer.password', customer.name);
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent(`Password ${customer.name} berhasil diganti.`));
}));

router.post('/admin/pelanggan/:id/hapus', requireSuperadmin(async (req, res) => {
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  await customerAuth.deleteCustomer(id);
  await logAdminAction(req.admin, 'customer.delete', `${customer.name} (${customer.whatsapp})`);
  redirect(res, '/admin/pelanggan?flash=' + encodeURIComponent(`Akun ${customer.name} dihapus.`));
}));

router.post('/admin/pelanggan/:id/klaim', requireSuperadmin(async (req, res) => {
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  const result = await loyalty.claimReward(id, { note: `Ditukar admin ${req.admin.username}` });
  if (!result.ok) return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent(result.error));

  await logAdminAction(req.admin, 'loyalty.redeem', customer.name);
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent(`Cup gratis ${customer.name} ditukar.`));
}));

router.post('/admin/pengaturan/stempel', requireSuperadmin(async (req, res) => {
  const { fields } = await parseBody(req);
  const perReward = Number(fields.perReward);
  const expiryMonths = Number(fields.expiryMonths);

  if (!Number.isFinite(perReward) || perReward < 1 || perReward > 100) {
    return redirect(res, '/admin/loyalitas?error=' + encodeURIComponent('Jumlah stempel harus antara 1 dan 100.'));
  }
  if (!Number.isFinite(expiryMonths) || expiryMonths < 1 || expiryMonths > 60) {
    return redirect(res, '/admin/loyalitas?error=' + encodeURIComponent('Masa berlaku harus antara 1 dan 60 bulan.'));
  }

  await settings.setValue('stamps_per_reward', Math.round(perReward));
  await settings.setValue('stamp_expiry_months', Math.round(expiryMonths));
  await logAdminAction(
    req.admin,
    'settings.update',
    `stempel/gratis ${Math.round(perReward)}, kedaluwarsa ${Math.round(expiryMonths)} bulan`
  );
  redirect(res, '/admin/loyalitas?flash=' + encodeURIComponent('Aturan stempel disimpan.'));
}));

router.post('/admin/pengaturan/tier', requireSuperadmin(async (req, res) => {
  const { fields, fieldLists } = await parseBody(req);

  // Each tier row posts one value per field, in display order; the perk
  // checkboxes post their row index, so unchecked rows simply don't appear.
  const names = fieldLists.tierName || [];
  const minClaims = fieldLists.tierMinClaims || [];
  const discounts = fieldLists.tierDiscount || [];
  const weekly = new Set((fieldLists.tierWeekly || []).map(Number));
  const birthday = new Set((fieldLists.tierBirthday || []).map(Number));

  const tiers = names.map((name, i) => ({
    name,
    minClaims: minClaims[i],
    discountPercent: discounts[i],
    weeklyFreeCup: weekly.has(i),
    birthdayFreeCup: birthday.has(i),
  }));

  await loyalty.saveTierConfig({ enabled: Boolean(fields.tiersEnabled), tiers });
  await logAdminAction(
    req.admin,
    'settings.update',
    `tier ${fields.tiersEnabled ? 'aktif' : 'nonaktif'}, ${tiers.length} tingkat`
  );
  redirect(res, '/admin/loyalitas?flash=' + encodeURIComponent('Pengaturan tier disimpan.'));
}));

// ---------------------------------------------------------------------
// admin: activity log (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/log-aktivitas', requireSuperadmin(async (req, res, { query }) => {
  const filters = {
    dari: query.get('dari') || '',
    sampai: query.get('sampai') || '',
    admin: query.get('admin') || '',
    aksi: query.get('aksi') || '',
    per: query.get('per') || '25',
    urut: query.get('urut') || 'desc',
  };

  const [result, options] = await Promise.all([
    queryAdminLogs({
      page: Number(query.get('halaman')) || 1,
      perPage: Number(filters.per) || 25,
      sort: filters.urut,
      username: filters.admin,
      action: filters.aksi,
      from: filters.dari,
      to: filters.sampai,
    }),
    listLogFilters(),
  ]);

  sendHtml(
    res,
    adminViews.renderAdminLog({
      logs: result.logs,
      admin: req.admin,
      filters,
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      sort: result.sort,
      options,
    })
  );
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

// What the loyalty reward would be worth on this exact cart. The cheapest cup
// is the one waived — that's the rule create_order enforces too, so what the
// shopper is shown and what they're charged can't drift apart.
// A percentage voucher applies to what's left after the free cup, so ticking
// "use my free cup" changes what the voucher is worth. Both totals are worked
// out here so the checkbox can update the total instantly without the browser
// having to re-derive discount rules it shouldn't know about.
async function checkoutTotals({ code, subtotal, reward, deliveryFee }) {
  const rewardDiscount = reward.available > 0 ? reward.discount : 0;
  const [voucherWithoutReward, voucherWithReward] = await Promise.all([
    voucherPreview(code, subtotal, 0),
    rewardDiscount > 0 ? voucherPreview(code, subtotal, rewardDiscount) : Promise.resolve(null),
  ]);
  const withoutReward = Math.max(0, subtotal - voucherWithoutReward.discount) + deliveryFee;
  const withReward =
    rewardDiscount > 0
      ? Math.max(0, subtotal - rewardDiscount - voucherWithReward.discount) + deliveryFee
      : withoutReward;
  return { voucherWithoutReward, voucherWithReward, withoutReward, withReward };
}

// Advisory only — create_order re-validates and consumes the code under a row
// lock. This exists so the shopper sees the saving before they commit.
async function voucherPreview(code, subtotal, rewardDiscount) {
  if (!code) return { applied: false, code: '', discount: 0, error: '' };
  try {
    return await vouchers.preview(code, {
      subtotal,
      discountable: Math.max(0, subtotal - rewardDiscount),
    });
  } catch (err) {
    console.error('voucher preview failed:', err.message);
    return { applied: false, code, discount: 0, error: 'Gagal memeriksa kode voucher.' };
  }
}

async function rewardPreview(sessionCustomer, items) {
  if (!sessionCustomer || !items.length) return { available: 0, discount: 0, itemName: null, perReward: 0 };
  const status = await loyalty.statusFor(sessionCustomer.customerId);
  if (!status.cardComplete) return { available: 0, discount: 0, itemName: null, perReward: status.perReward };

  const cheapest = items.reduce((min, it) => (Number(it.product.price) < Number(min.product.price) ? it : min));
  return {
    // One card, one free cup — stamps reset to zero when it's spent.
    available: 1,
    discount: Number(cheapest.product.price),
    itemName: cheapest.product.name,
    perReward: status.perReward,
  };
}

function saveCartCookie(res, cart) {
  setCookie(res, cartLib.COOKIE_NAME, cartLib.serializeCart(cart), { maxAge: cartLib.MAX_AGE_SECONDS });
}

// Uploads every photo picked in the (multiple) gallery input, in order.
async function uploadGalleryFiles(list) {
  const urls = [];
  for (const file of list || []) {
    if (!file || !file.buffer.length) continue;
    urls.push(await saveProductImage(file));
  }
  return urls;
}

// A wholesale tier only counts when both halves are filled in and the
// discounted price is actually lower — otherwise it's stored as "no tier".
function wholesaleFields(fields) {
  const minQty = Number(fields.wholesaleMinQty);
  const price = Number(fields.wholesalePrice);
  const valid =
    Number.isFinite(minQty) && minQty > 0 &&
    Number.isFinite(price) && price > 0 &&
    String(fields.wholesaleMinQty).trim() !== '' && String(fields.wholesalePrice).trim() !== '' &&
    price < Number(fields.price);
  return valid
    ? { wholesaleMinQty: Math.round(minQty), wholesalePrice: Math.round(price) }
    : { wholesaleMinQty: 0, wholesalePrice: null };
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

// Shared date-range vocabulary. Every admin page that filters by date speaks
// the same preset names, so "bulan ini" can't mean two different windows in
// two different places.
function resolveRange(key, todayKey) {
  const [y, m] = todayKey.split('-').map(Number);
  const lastMonth = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const pad = (n) => String(n).padStart(2, '0');
  const endOfMonth = (yy, mm) => `${yy}-${pad(mm)}-${new Date(yy, mm, 0).getDate()}`;

  switch (key) {
    case 'hari-ini':
      return { dari: todayKey, sampai: todayKey };
    case '7-hari':
      return { dari: shiftDateKey(todayKey, -6), sampai: todayKey };
    case '30-hari':
      return { dari: shiftDateKey(todayKey, -29), sampai: todayKey };
    case 'bulan-ini':
      return { dari: `${y}-${pad(m)}-01`, sampai: todayKey };
    case 'bulan-lalu':
      return { dari: `${lastMonth.y}-${pad(lastMonth.m)}-01`, sampai: endOfMonth(lastMonth.y, lastMonth.m) };
    case 'tahun-ini':
      return { dari: `${y}-01-01`, sampai: todayKey };
    case 'semua':
      return { dari: '', sampai: '' };
    default:
      return null;
  }
}

// Whether "today" is already past the shop's same-day cut-off. Compared in
// WIB, not the server's timezone — the function runs in Singapore and the
// shop runs on Jakarta time.
function pastSameDayCutoff(cutoff) {
  if (!cutoff) return false;
  const nowWib = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return nowWib > cutoff;
}

// XML has a different escaping set from HTML — & < > " ' all need entities,
// and a stray one makes the whole sitemap unparseable.
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function notFound(res, req) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    shopViews.renderError({
      code: 404,
      cartCount: req ? cartLib.cartCount(req.cart) : 0,
      customer: req ? req.customer : null,
    })
  );
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
    // Deliberately *not* re-checked against the DB here: the token already
    // carries everything the header needs (name), and the routes that act on
    // a customer load the row themselves. Keeps the storefront hot path at
    // zero extra queries.
    req.customer = customerSession.verify(cookies[customerSession.COOKIE_NAME]);

    const match = router.match(req.method, pathname);
    if (!match) return notFound(res, req);

    req.params = match.params;
    await match.handler(req, res, { query: url.searchParams });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      // Never leak the underlying error to the visitor — it's already logged.
      res.end(shopViews.renderError({ code: 500, cartCount: 0, customer: null }));
    }
  }
};
