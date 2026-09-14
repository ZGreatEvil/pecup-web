// Single catch-all Vercel Serverless Function — every request (storefront,
// admin, everything) is routed here by vercel.json's rewrite rule. There is
// no server-side memory between invocations, so the cart lives in a cookie
// and the admin session is a signed, stateless token (see src/cart.js and
// src/adminSession.js).
const { URL } = require('url');
const crypto = require('crypto');
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
const permissions = require('../src/permissions');
const inventory = require('../src/inventory');
const inventoryViews = require('../src/views/inventory');
const passwordReset = require('../src/passwordReset');
const retention = require('../src/retention');
const {
  logAdminAction,
  changeSummary,
  queryAdminLogs,
  queryAllAdminLogs,
  listLogFilters,
} = require('../src/adminLog');
const queries = require('../src/queries');
const {
  toDateKey,
  toDateOnly,
  formatTimeID,
  csvEscape,
  formatRupiah,
  formatDateID,
  normalizeWhatsapp,
  formatWhatsapp,
  ORDER_STATUSES,
  SHOP_WHATSAPP_FALLBACK,
  comboRange,
  comboRangeText,
} = require('../src/utils');
const { buildDailyOrdersCsv } = require('../src/csvExport');
const { sendOrderNotification } = require('../src/orderEmail');
const {
  saveProductImage,
  saveProofFile,
  deleteProofFile,
  signedProofUrl,
  presignProductVideoUpload,
  productBlobInfo,
} = require('../src/uploads');
const { productMedia } = require('../src/views/productIcon');
const media = require('../src/media');

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

// Works out the public origin. SITE_ORIGIN wins when it's set, because the
// Host header is attacker-controlled: without a fixed value, a request with a
// forged Host would put someone else's domain into our canonical tags, the
// sitemap and robots.txt. Falling back to the request keeps localhost and
// preview deployments working with no configuration.
function originFor(req) {
  const configured = String(process.env.SITE_ORIGIN || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/\s]+$/.test(configured)) return configured;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const raw = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const host = String(raw).split(',')[0].trim();
  // Only ever a hostname[:port] — never a path, scheme or anything smuggled in.
  const safeHost = /^[A-Za-z0-9.\-]+(:\d+)?$/.test(host) ? host : 'localhost';
  const safeProto = proto === 'http' || proto === 'https' ? proto : 'https';
  return `${safeProto}://${safeHost}`;
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
Disallow: /lupa-sandi
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
  // A product switched off is gone from the shop, not merely hidden from the
  // menu: its page would otherwise stay reachable by old link or search result,
  // with a working add-to-cart button on it.
  if (!product || !product.active) return notFound(res);
  const all = await queries.listProducts({ onlyActive: true });
  const related = all.filter((p) => p.id !== product.id).slice(0, 4);
  // Only a product whose contents are chosen needs the choice list, so the
  // extra query is paid only on those pages.
  // This product's own ticked list when it has one, the shop-wide pool when it
  // doesn't — and either way only what is actually on sale right now.
  const comboOptions = product.combo_enabled
    ? await queries.listComboOptions({ forProductId: product.id })
    : [];
  sendHtml(
    res,
    shopViews.renderProdukDetail({
      product,
      related,
      cartCount: cartLib.cartCount(req.cart),
      comboOptions,
      customer: req.customer,
      loyaltyOn: req.loyaltyOn,
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
  // Switched off between the page being opened and the button being pressed.
  if (!product.active) {
    if (wantsJson) return sendJson(res, { ok: false, error: 'Produk ini sedang tidak dijual.' }, 409);
    return fallbackRedirect();
  }

  let fruits;
  // A product whose contents are chosen can only go into the cart WITH a
  // choice — an empty composition is refused rather than quietly added, so a
  // hand-made request can't slip an unbuildable cup past the picker.
  if (product.combo_enabled) {
    const requestedIds = String(fields.fruitIds || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    // Product ids come back from the Neon driver as strings (bigint
    // columns), so normalize to Number before comparing against the
    // parsed request ids — otherwise the Set lookup never matches.
    const validIds = new Set(
      (await queries.listComboOptions({ forProductId: product.id })).map((p) => Number(p.id))
    );
    const uniqueValid = Array.from(new Set(requestedIds)).filter((id) => validIds.has(id));
    const { min, max } = comboRange(product);
    if (uniqueValid.length >= min && uniqueValid.length <= max) fruits = uniqueValid;
    else {
      if (wantsJson) return sendJson(res, { ok: false, error: `Pilih ${comboRangeText(product)}.` }, 400);
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
    shopViews.renderKeranjang({
      items,
      subtotal,
      cartCount: cartLib.cartCount(req.cart),
      customer: req.customer,
      shop: await settings.shopConfig(),
    })
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

  const qty = product.unlimited_stock
    ? requestedQty
    : Math.min(requestedQty, Math.max(Number(product.stock) || 0, 0));
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
    atMax: !product.unlimited_stock && qty > 0 && qty >= Math.max(Number(product.stock) || 0, 0),
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
    accountViews.renderMasuk({
      cartCount: cartLib.cartCount(req.cart),
      next: query.get('next') || '',
      loyaltyOn: req.loyaltyOn,
    })
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
        loyaltyOn: req.loyaltyOn,
      })
    );
  }

  saveCustomerCookie(res, customer);
  redirect(res, safeNext(fields.next));
});

// ---------------------------------------------------------------------
// customer: forgotten password
// ---------------------------------------------------------------------
// There is no email on file (the WhatsApp number is the username), so the
// reset runs through an admin over WhatsApp — see src/passwordReset.js.

// "Hubungi admin" must always have something to tap. The shop's own setting
// wins; with nothing set it falls back to the number the storefront footer has
// always shown, so the password-reset page can never be a dead end.
function resetWaLink(shop, message) {
  const number = shop.whatsapp || SHOP_WHATSAPP_FALLBACK;
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

router.get('/lupa-sandi', async (req, res) => {
  if (req.customer) return redirect(res, '/akun');
  // The shop's number is fetched here as well as after submitting: telling
  // someone to "contact the admin" without giving them the way to do it is
  // where this page used to leave them stuck.
  const shop = await settings.shopConfig();
  sendHtml(
    res,
    accountViews.renderLupaSandi({
      cartCount: cartLib.cartCount(req.cart),
      waLink: resetWaLink(shop, 'Halo admin Pecup, saya lupa password akun saya. Mohon dibantu reset ya.'),
      shopWhatsapp: shop.whatsapp || '',
      loyaltyOn: req.loyaltyOn,
    })
  );
});

router.post('/lupa-sandi', async (req, res) => {
  const { fields } = await parseBody(req);
  const whatsapp = (fields.whatsapp || '').trim();
  const result = await passwordReset.request(whatsapp);

  if (!result.ok) {
    return sendHtml(
      res,
      accountViews.renderLupaSandi({
        cartCount: cartLib.cartCount(req.cart),
        errors: [result.error],
        values: { whatsapp },
        shopWhatsapp: (await settings.shopConfig()).whatsapp || '',
        loyaltyOn: req.loyaltyOn,
      })
    );
  }

  // Same page whether or not that number has an account: this form must not
  // become a way to find out who has one.
  const shop = await settings.shopConfig();
  sendHtml(
    res,
    accountViews.renderLupaSandi({
      cartCount: cartLib.cartCount(req.cart),
      sent: true,
      loyaltyOn: req.loyaltyOn,
      waLink: resetWaLink(
        shop,
        `Halo admin Pecup, saya lupa password akun saya (nomor ${whatsapp}). Mohon dibantu reset ya.`
      ),
      shopWhatsapp: shop.whatsapp || '',
    })
  );
});

router.get('/lupa-sandi/kode', async (req, res) => {
  if (req.customer) return redirect(res, '/akun');
  const shop = await settings.shopConfig();
  sendHtml(
    res,
    accountViews.renderResetSandi({
      cartCount: cartLib.cartCount(req.cart),
      waLink: resetWaLink(shop, 'Halo admin Pecup, saya sudah minta reset password tapi belum menerima kodenya.'),
      shopWhatsapp: shop.whatsapp || '',
      loyaltyOn: req.loyaltyOn,
    })
  );
});

router.post('/lupa-sandi/kode', async (req, res) => {
  const { fields } = await parseBody(req);
  const whatsapp = (fields.whatsapp || '').trim();
  const code = (fields.code || '').trim();
  const password = fields.password || '';
  const values = { whatsapp, code };

  if (password.length < 6) {
    return sendHtml(
      res,
      accountViews.renderResetSandi({
        cartCount: cartLib.cartCount(req.cart),
        errors: ['Password baru minimal 6 karakter.'],
        values,
        loyaltyOn: req.loyaltyOn,
      })
    );
  }

  // Hashed here, never stored or logged in plain form — the same rule as
  // every other password in this app.
  const result = await passwordReset.redeem({
    whatsapp,
    code,
    passwordHash: customerAuth.hashPassword(password),
  });
  if (!result.ok) {
    return sendHtml(
      res,
      accountViews.renderResetSandi({
        cartCount: cartLib.cartCount(req.cart),
        errors: [result.error],
        values,
        loyaltyOn: req.loyaltyOn,
      })
    );
  }
  sendHtml(
    res,
    accountViews.renderResetSandi({ cartCount: cartLib.cartCount(req.cart), done: true, loyaltyOn: req.loyaltyOn })
  );
});

router.get('/daftar', async (req, res) => {
  if (req.customer) return redirect(res, '/akun');
  sendHtml(res, accountViews.renderDaftar({ cartCount: cartLib.cartCount(req.cart), loyaltyOn: req.loyaltyOn }));
});

// What every tier is worth, for a shopper deciding whether to come back.
// Deliberately open to visitors who aren't signed in — they're the ones it has
// to convince — and personalised with "you are here" for those who are.
router.get('/keanggotaan', async (req, res) => {
  // The page exists only while the programme does. Left reachable with the
  // programme off it would advertise perks nothing can deliver — so it goes,
  // along with the footer link that points at it.
  if (!(await settings.loyaltyEnabled())) return notFound(res);
  const [config, perReward, loyaltyStatus] = await Promise.all([
    loyalty.getTierConfig(),
    settings.stampsPerReward(),
    req.customer ? loyalty.statusFor(req.customer.customerId) : null,
  ]);
  sendHtml(
    res,
    accountViews.renderKeanggotaan({
      cartCount: cartLib.cartCount(req.cart),
      customer: req.customer,
      loyalty: loyaltyStatus,
      tiers: config.tiers,
      enabled: config.enabled,
      perReward,
    })
  );
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
  // Optional — only a filled-in but impossible date is an error.
  const birthday = parseBirthday(fields.birthday);
  if (birthday === null) errors.push('Tanggal lahir tidak valid.');
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
        values: { name, whatsapp, address, birthday: (fields.birthday || '').trim() },
        loyaltyOn: req.loyaltyOn,
      })
    );
  }

  const customer = await customerAuth.createCustomer({
    whatsapp: normalized,
    name,
    password,
    address,
    birthday: birthday || null,
  });
  saveCustomerCookie(res, customer);
  redirect(res, '/akun');
});

// Optional everywhere it appears. Returns '' for "not given" and null for
// "given but unusable", so callers can tell the two apart.
function parseBirthday(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return null;
  if (value > toDateKey(new Date())) return null;
  return value;
}

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
      loyaltyOn: req.loyaltyOn,
    })
  );
}));

router.post('/akun', requireCustomer(async (req, res, { customer }) => {
  const { fields } = await parseBody(req);
  const name = (fields.name || '').trim();
  if (!name) return redirect(res, '/akun');

  const birthday = parseBirthday(fields.birthday);
  const updated = await customerAuth.updateCustomer(customer.id, {
    name,
    address: (fields.address || '').trim(),
    // A bad date leaves the stored one alone rather than wiping it.
    birthday: birthday === null ? customer.birthday || null : birthday || null,
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
  // The birthday cup is keyed to the delivery date, so the date already in
  // the form (if any) decides whether it shows up in the preview.
  const deliveryDateKey = (query.get('deliveryDate') || '').trim();
  const [saved, benefits, shop] = await Promise.all([
    req.customer ? customerAuth.findById(req.customer.customerId) : null,
    customerBenefits(req.customer, items, deliveryDateKey),
    settings.shopConfig(),
  ]);
  const { reward, membership } = benefits;
  const code = query.get('voucher') || '';
  const deliveryFee = settings.deliveryFeeFor(shop, subtotal);
  const taxPercent = settings.taxRateFor(shop);
  const totals = await checkoutTotals({ code, subtotal, reward, membership, deliveryFee, taxPercent });

  sendHtml(
    res,
    shopViews.renderCheckout({
      items,
      subtotal,
      cartCount: cartLib.cartCount(req.cart),
      customer: saved,
      reward,
      membership,
      shop,
      voucher: totals.voucherWithoutReward,
      loyaltyOn: req.loyaltyOn,
      totals,
      deliveryFee,
      taxPercent,
      deliveryMode: shop.deliveryMode,
      openDates: settings.openDeliveryDates(shop),
      closedNote: closedDatesNote(shop),
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
        loyaltyOn: req.loyaltyOn,
      }),
      413
    );
  }

  // Re-derived here, never taken from the request: the form can only ask to
  // use a reward, and the database re-checks eligibility again at insert time.
  const requestedDate = (fields.deliveryDate || '').trim();
  const { reward, membership } = await customerBenefits(req.customer, items, requestedDate);
  const useReward = Boolean(fields.useReward) && reward.available > 0;

  const shop = await settings.shopConfig();
  const voucherCode = vouchers.normalizeCode(fields.voucherCode || '');
  const deliveryFee = settings.deliveryFeeFor(shop, subtotal);
  const taxPercent = settings.taxRateFor(shop);
  const totals = await checkoutTotals({ code: voucherCode, subtotal, reward, membership, deliveryFee, taxPercent });
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
  } else if (!settings.isDeliveryDateOpen(shop, deliveryDate)) {
    // Checked whichever way the date was picked: the list only offers open
    // days, but a hand-posted form must be refused just the same.
    const next = settings.openDeliveryDates(shop).slice(0, 3);
    errors.push(
      'Pecup tidak mengantar di tanggal itu.' +
        (next.length ? ` Tanggal terdekat yang bisa: ${next.map((d) => formatDateID(d)).join(', ')}.` : '')
    );
  }
  // A fully-waived order has nothing to transfer, so don't demand a proof.
  if (payable > 0 && !files.proof) errors.push('Bukti transfer wajib diunggah.');
  else if (files.proof && !['image/jpeg', 'image/png', 'application/pdf'].includes(files.proof.mimetype)) {
    errors.push('Format bukti transfer harus JPG, PNG, atau PDF.');
  }

  for (const it of items) {
    if (!it.product.unlimited_stock && it.qty > it.product.stock) {
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
        membership,
        useReward,
        shop,
        voucher,
        totals,
        deliveryFee,
        taxPercent,
        deliveryMode: shop.deliveryMode,
        openDates: settings.openDeliveryDates(shop),
        closedNote: closedDatesNote(shop),
        errors,
        loyaltyOn: req.loyaltyOn,
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
      // The ladder lives in settings, so the app resolves which tier the
      // customer holds; create_order decides what the perks are still worth.
      tier: membership.tier || {},
      // Read from the shop settings a moment ago, not from the form.
      taxPercent,
    });
  } catch (err) {
    console.error(err);
    // The proof was uploaded before the insert was attempted, so a failed
    // insert leaves a file nothing points at. Take it back out: the shopper is
    // about to be shown the form again and will upload afresh if they retry.
    if (proofFilename) await deleteProofFile(proofFilename);
    return sendHtml(
      res,
      shopViews.renderCheckout({
        items,
        subtotal,
        cartCount: cartLib.cartCount(req.cart),
        customer: req.customer,
        reward,
        membership,
        useReward,
        shop,
        voucher,
        totals,
        deliveryFee,
        taxPercent,
        deliveryMode: shop.deliveryMode,
        openDates: settings.openDeliveryDates(shop),
        closedNote: closedDatesNote(shop),
        errors: [extractPgErrorMessage(err) || 'Gagal memproses pesanan. Coba lagi.'],
        loyaltyOn: req.loyaltyOn,
        formValues: { customerName, whatsapp, notes, address, deliveryDate, voucherCode },
      })
    );
  }

  // A website order can only get here with a transfer proof attached (or
  // nothing to pay at all), so it is paid by definition. Manual orders are the
  // ones where that's a question, and they ask it on the form.
  await queries.setOrderPaid(order.id, true);

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
  sendHtml(
    res,
    shopViews.renderSukses({
      order,
      items,
      emailOk: Boolean(order.email_sent),
      customer: req.customer,
      loyaltyOn: req.loyaltyOn,
    })
  );
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

  // Self-healing fallback for the nightly cron below. If the cron is running,
  // last_prune_at is never two days old and this does nothing but read one
  // settings row. If the cron isn't available on this plan — or silently
  // stopped — the sweep still happens whenever an admin opens the dashboard.
  // Deliberately after the response: the admin waits for nothing.
  try {
    const all = await settings.getAll({ fresh: true });
    const last = all.last_prune_at ? Date.parse(all.last_prune_at) : 0;
    if (!last || Date.now() - last > 48 * 60 * 60 * 1000) {
      const result = await retention.runRetention({ force: true });
      console.log('retention (fallback):', JSON.stringify(result));
    }
  } catch (err) {
    // Housekeeping must never take the dashboard down with it.
    console.error('retention fallback failed:', err.message);
  }
}));

// Nightly housekeeping, invoked by Vercel Cron (see vercel.json). Vercel sends
// CRON_SECRET as a bearer token when that env var is set; an admin session
// works too, so it can be triggered by hand from the settings page.
router.get('/tugas/pembersihan', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers.authorization || '';
  const allowed = req.isAdmin || (secret && auth === `Bearer ${secret}`);
  if (!allowed) {
    return sendJson(res, { ok: false, error: 'Tidak diizinkan.' }, 401);
  }
  try {
    const result = await retention.runRetention({ force: true });
    console.log('retention (cron):', JSON.stringify(result));
    return sendJson(res, { ok: true, ...result });
  } catch (err) {
    console.error('retention cron failed:', err.message);
    return sendJson(res, { ok: false, error: err.message }, 500);
  }
});

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

router.get('/admin/produk', requirePermission('produk.lihat', async (req, res, { query }) => {
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

// Mints a one-shot upload address for a product video.
//
// The clip never passes through here — a Vercel function body is capped near
// 4.5MB. The browser PUTs the file straight to the public store using this
// address, which is scoped to a single pathname, a single content type, a
// hard byte ceiling and a few minutes of life, all enforced by the store
// itself rather than trusted from the page.
router.post('/admin/media/video/presign', requirePermission('produk.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const contentType = String(fields.contentType || '').trim();
  const size = Number(fields.size);

  if (!media.PRODUCT_VIDEO_TYPES[contentType]) {
    return sendJson(res, { error: 'Format video harus MP4, WEBM atau MOV.' }, 400);
  }
  if (!Number.isFinite(size) || size <= 0) {
    return sendJson(res, { error: 'Ukuran video tidak terbaca.' }, 400);
  }
  if (size > media.MAX_VIDEO_BYTES) {
    const mb = Math.round(media.MAX_VIDEO_BYTES / 1024 / 1024);
    return sendJson(res, { error: `Video terlalu besar. Maksimal ${mb}MB.` }, 400);
  }

  const pathname = media.videoPathname(contentType);
  try {
    const uploadUrl = await presignProductVideoUpload({
      pathname,
      contentType,
      maximumSizeInBytes: media.MAX_VIDEO_BYTES,
    });
    sendJson(res, { uploadUrl, pathname });
  } catch (err) {
    sendJson(res, { error: 'Penyimpanan video sedang tidak bisa dihubungi. Coba lagi.' }, 502);
  }
}));

router.get('/admin/produk/tambah', requirePermission('produk.kelola', async (req, res) => {
  const [categories, inventoryItems, comboOptions, allProducts] = await Promise.all([
    queries.listCategories(),
    // Only fetched for an admin who may manage the stockroom — for anyone else
    // the packaging section is not drawn, and nothing they post can change it.
    req.can('inventaris.kelola') ? inventory.listItems({ includeInactive: false }) : [],
    // Everything ticked, available or not, so the summary line is honest.
    queries.listComboOptions({ includeUnavailable: true }),
    queries.listProducts(),
  ]);
  sendHtml(
    res,
    adminViews.renderProdukForm({
      product: null,
      error: null,
      categories,
      admin: req.admin,
      inventoryItems,
      comboOptions,
      allProducts,
      comboChoices: [],
    })
  );
}));

router.post('/admin/produk/tambah', requirePermission('produk.kelola', async (req, res) => {
  const { fields, fieldLists, fileLists } = await parseBody(req);
  // Clips are already uploaded by the time the form is posted, so they're
  // carried back through every failure path — bouncing the form must not cost
  // the admin the upload.
  const pendingVideos = (fieldLists.videoBaru || []).filter((url) => media.isProductVideoUrl(String(url || '').trim()));
  const bounce = async (message) =>
    sendHtml(
      res,
      adminViews.renderProdukForm({
        product: fields,
        error: message,
        categories: await queries.listCategories(),
        admin: req.admin,
        pendingVideos,
        comboOptions: await queries.listComboOptions({ includeUnavailable: true }),
        allProducts: await queries.listProducts(),
        comboChoices: (fieldLists.comboChoice || []).map(Number),
      })
    );

  const error = validateProductFields(fields);
  if (error) return bounce(error);

  let images;
  try {
    const photos = await uploadGalleryFiles(fileLists.image);
    const videos = await acceptVideoUrls(fieldLists.videoBaru);
    images = [...photos, ...videos];
  } catch (err) {
    return bounce(err.userMessage || 'Gagal mengunggah foto. Coba lagi.');
  }
  const newProductId = await queries.createProduct({
    name: fields.name.trim(),
    description: (fields.description || '').trim(),
    category: fields.category || 'Buah Tunggal',
    weight: fields.weight.trim(),
    price: Number(fields.price),
    stock: Number(fields.stock),
    // `image` is the primary *photo*, not the first item: a video can lead the
    // gallery, but og:image and structured data need a still.
    image: images.find((url) => !media.isVideoUrl(url)) || null,
    images,
    active: fields.active ? 1 : 0,
    isBestseller: fields.is_bestseller ? 1 : 0,
    isRecommended: fields.is_recommended ? 1 : 0,
    unlimitedStock: Boolean(fields.unlimitedStock),
    ...wholesaleFields(fields),
    ...comboFields(fields),
  });
  const newMaterials = materialsFromForm(req, fieldLists, fields);
  if (newMaterials) await inventory.setMaterials(newProductId, newMaterials);
  // Which products may go inside this one, if it is a combination.
  await queries.setComboChoices(newProductId, fieldLists.comboChoice || []);
  const photoCount = images.filter((url) => !media.isVideoUrl(url)).length;
  const videoCount = images.length - photoCount;
  await logAdminAction(
    req.admin,
    'product.create',
    `${fields.name.trim()} — ${formatRupiah(Number(fields.price))}, stok ${Number(fields.stock)}, ` +
      `kategori ${fields.category || 'Buah Tunggal'}, ${photoCount} foto` +
      (videoCount ? `, ${videoCount} video` : '') +
      (fields.active ? '' : ', disembunyikan')
  );
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk baru berhasil ditambahkan.'));
}));

router.get('/admin/produk/:id/edit', requirePermission('produk.kelola', async (req, res) => {
  const product = await queries.getProduct(Number(req.params.id));
  if (!product) return notFound(res);
  const [categories, inventoryItems, materials, comboOptions, allProducts, comboChoices] = await Promise.all([
    queries.listCategories(),
    req.can('inventaris.kelola') ? inventory.listItems({ includeInactive: false }) : [],
    inventory.materialsFor(product.id),
    queries.listComboOptions({ includeUnavailable: true }),
    queries.listProducts(),
    queries.comboChoicesFor(product.id),
  ]);
  sendHtml(
    res,
    adminViews.renderProdukForm({
      product,
      error: null,
      categories,
      admin: req.admin,
      inventoryItems,
      materials,
      comboOptions,
      allProducts,
      comboChoices,
    })
  );
}));

router.post('/admin/produk/:id/edit', requirePermission('produk.kelola', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await queries.getProduct(id);
  if (!existing) return notFound(res);

  const { fields, fieldLists, fileLists } = await parseBody(req);
  const pendingVideos = (fieldLists.videoBaru || []).filter((url) => media.isProductVideoUrl(String(url || '').trim()));
  const bounce = async (message) =>
    sendHtml(
      res,
      adminViews.renderProdukForm({
        product: { ...fields, id, image: existing.image, images: existing.images },
        error: message,
        categories: await queries.listCategories(),
        admin: req.admin,
        pendingVideos,
        comboOptions: await queries.listComboOptions({ includeUnavailable: true }),
        allProducts: await queries.listProducts(),
        comboChoices: (fieldLists.comboChoice || []).map(Number),
      })
    );

  const error = validateProductFields(fields);
  if (error) return bounce(error);

  // Gallery = (existing photos the admin didn't tick "Hapus" on, in whatever
  // order the tiles ended up in) + new uploads appended. `fotoUrutan` carries
  // that order; it's filtered against the photos actually on the product so a
  // forged or stale value can't inject a URL.
  const removed = new Set(fieldLists.hapusFoto || []);
  const onProduct = productMedia(existing);
  const requested = (fieldLists.fotoUrutan || []).filter((url) => onProduct.includes(url));
  // Anything the form didn't mention (older tab, JS off) keeps its old spot
  // at the end rather than silently disappearing.
  const ordered = [...requested, ...onProduct.filter((url) => !requested.includes(url))];
  const kept = Array.from(new Set(ordered)).filter((url) => !removed.has(url));
  let uploaded;
  try {
    const photos = await uploadGalleryFiles(fileLists.image);
    const videos = await acceptVideoUrls(fieldLists.videoBaru);
    // Anything already on the product is filtered out: re-posting the same
    // clip must not put it in the gallery twice.
    uploaded = [...photos, ...videos].filter((url) => !kept.includes(url));
  } catch (err) {
    return bounce(err.userMessage || 'Gagal mengunggah foto. Coba lagi.');
  }
  const images = [...kept, ...uploaded];

  const next = {
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
    unlimitedStock: Boolean(fields.unlimitedStock),
    ...wholesaleFields(fields),
    ...comboFields(fields, existing),
  };
  await queries.updateProduct(id, next);
  const wantedMaterials = materialsFromForm(req, fieldLists, fields);
  if (wantedMaterials) await inventory.setMaterials(id, wantedMaterials);
  await queries.setComboChoices(id, fieldLists.comboChoice || []);

  // The log used to say only the product's name, which left "what did they
  // actually change?" unanswerable. Now it names the fields that moved.
  const countKind = (list, video) =>
    (list || []).filter((url) => (video ? media.isVideoUrl(url) : !media.isVideoUrl(url))).length;
  const summary = changeSummary(
    existing,
    next,
    [
      { label: 'nama', get: (p) => p.name },
      { label: 'kategori', get: (p) => p.category },
      { label: 'berat', get: (p) => p.weight },
      { label: 'harga', get: (p) => Number(p.price), format: (v) => formatRupiah(v) },
      { label: 'stok', get: (p) => Number(p.stock) },
      {
        label: 'stok tanpa batas',
        get: (p) => ((p.unlimited_stock ?? p.unlimitedStock) ? 'ya' : 'tidak'),
      },
      { label: 'tampil di toko', get: (p) => (Number(p.active) ? 'ya' : 'tidak') },
      { label: 'best seller', get: (p) => (Number(p.is_bestseller ?? p.isBestseller) ? 'ya' : 'tidak') },
      { label: 'direkomendasikan', get: (p) => (Number(p.is_recommended ?? p.isRecommended) ? 'ya' : 'tidak') },
      { label: 'min. grosir', get: (p) => Number(p.wholesale_min_qty ?? p.wholesaleMinQty) || 0 },
      {
        label: 'harga grosir',
        get: (p) => (p.wholesale_price ?? p.wholesalePrice) || 0,
        format: (v) => (Number(v) > 0 ? formatRupiah(v) : '(tidak ada)'),
      },
      { label: 'isi bisa dipilih', get: (p) => (p.combo_enabled ?? p.comboEnabled ? 'ya' : 'tidak') },
      { label: 'jadi pilihan isi', get: (p) => (p.combo_option ?? p.comboOption ? 'ya' : 'tidak') },
      {
        label: 'jumlah pilihan per cup',
        get: (p) => `${Number(p.combo_min ?? p.comboMin) || 1}–${Number(p.combo_max ?? p.comboMax) || 1}`,
      },
      { label: 'jumlah foto', get: (p) => countKind(productMedia(p), false) },
      { label: 'jumlah video', get: (p) => countKind(productMedia(p), true) },
      { label: 'deskripsi', get: (p) => ((p.description || '').trim() ? 'ada' : 'kosong') },
    ],
    { nothing: 'disimpan tanpa perubahan' }
  );
  await logAdminAction(req.admin, 'product.update', `${next.name}: ${summary}`);
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk berhasil diperbarui.'));
}));

router.post('/admin/produk/:id/hapus', requirePermission('produk.kelola', async (req, res) => {
  const existing = await queries.getProduct(Number(req.params.id));
  // Asked while the product still exists: once the row is gone, the order lines
  // that contain it keep the name and price they were charged at but no longer
  // point at anything, and nobody could tell afterwards that cups of it were
  // still owed to someone.
  const openOrders = existing ? await queries.openOrdersWithProduct(Number(req.params.id)) : 0;
  await queries.deleteProduct(Number(req.params.id));
  // A deletion is the one entry nobody can go back and check against the
  // product itself, so it records what was actually lost.
  await logAdminAction(
    req.admin,
    'product.delete',
    existing
      ? `${existing.name} — ${formatRupiah(Number(existing.price))}, stok ${Number(existing.stock)}, ` +
        `kategori ${existing.category}, ${productMedia(existing).length} media` +
        (openOrders ? `, masih ada ${openOrders} pesanan berjalan yang memuat produk ini` : '')
      : `#${req.params.id} (produk tidak ditemukan)`
  );
  redirect(res, '/admin/produk?flash=' + encodeURIComponent('Produk telah dihapus.'));
}));

router.post('/admin/produk/:id/toggle', requirePermission('produk.kelola', async (req, res) => {
  const id = Number(req.params.id);
  const before = await queries.getProduct(id);
  await queries.toggleProductActive(id);
  // Was "#3", which tells a reader nothing at all: not which product, not
  // which way it went.
  await logAdminAction(
    req.admin,
    'product.toggle',
    before
      ? `${before.name} — ${before.active ? 'ditampilkan → disembunyikan' : 'disembunyikan → ditampilkan'}`
      : `#${id} (produk tidak ditemukan)`
  );
  redirect(res, '/admin/produk');
}));

// Quick stock edit straight from the product list — takes either an absolute
// qty or a +/- delta, so restocking doesn't mean opening the full edit form.
router.post('/admin/produk/:id/stok', requirePermission('produk.kelola', async (req, res) => {
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

router.get('/admin/pesanan', requirePermission('pesanan.lihat', async (req, res, { query }) => {
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
router.get('/admin/pesanan/unduh', requirePermission('pesanan.unduh', async (req, res, { query }) => {
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

// ---------------------------------------------------------------------
// admin: walk-in customers and manually recorded orders (every admin)
// ---------------------------------------------------------------------
// Most sales still arrive by word of mouth. These two pages let an admin put
// those customers and their purchases into the same system the website uses,
// so stock, stamps, tiers and the revenue report stay whole.
//
// Open to regular admins, not just superadmins: taking an order over WhatsApp
// and signing a walk-in customer up is the front-line job, and the person on
// the counter is usually not the owner. Handing out stamps by hand is still
// superadmin-only — the opening stamp balance below is ignored for a regular
// admin, so this can't become a back door to free cups.

// Readable but not guessable: no 0/O/1/I, and drawn from crypto.
function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

router.get('/admin/pelanggan/tambah', requirePermission('pelanggan.tambah', async (req, res) => {
  sendHtml(res, adminViews.renderPelangganTambah({ admin: req.admin }));
}));

router.post('/admin/pelanggan/tambah', requirePermission('pelanggan.tambah', async (req, res) => {
  const { fields } = await parseBody(req);
  const name = (fields.name || '').trim();
  const whatsapp = (fields.whatsapp || '').trim();
  const address = (fields.address || '').trim();
  // Stamps are a superadmin's to give. A regular admin sees no such field, and
  // one posted anyway is dropped here rather than trusted.
  const stamps = req.isSuperadmin
    ? Math.max(0, Math.min(100, Math.round(Number(fields.stamps) || 0)))
    : 0;
  const birthday = parseBirthday(fields.birthday);
  const values = { name, whatsapp, address, stamps: String(stamps), birthday: (fields.birthday || '').trim() };

  const errors = [];
  if (!name) errors.push('Nama lengkap wajib diisi.');
  const normalized = normalizeWhatsapp(whatsapp);
  if (!normalized) errors.push('Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx atau +628xxxxxxxxxx.');
  if (birthday === null) errors.push('Tanggal lahir tidak valid.');
  if (normalized && (await customerAuth.findByWhatsapp(normalized))) {
    errors.push('Nomor WhatsApp ini sudah terdaftar. Cari akunnya di halaman Cari Pelanggan.');
  }
  if (errors.length) {
    return sendHtml(res, adminViews.renderPelangganTambah({ admin: req.admin, errors, values }));
  }

  // The admin never chooses the password: it's generated, shown once, and
  // stored only as a hash — the same rule as every other password here.
  const password = tempPassword();
  const customer = await customerAuth.createCustomer({
    whatsapp: normalized,
    name,
    password,
    address,
    birthday: birthday || null,
  });
  if (stamps > 0) await loyalty.setStampCount(customer.id, stamps, { by: req.admin.username });

  await logAdminAction(req.admin, 'customer.create', `${name} (${formatWhatsapp(normalized)})`);
  sendHtml(
    res,
    adminViews.renderPelangganTambah({
      admin: req.admin,
      created: { id: customer.id, name, whatsapp: normalized, password },
    })
  );
}));

router.get('/admin/pesanan/tambah', requirePermission('pesanan.manual', async (req, res, { query }) => {
  // Only the one account that was linked to (from the customer page), if any.
  // The picker searches the server as you type, so the page no longer carries
  // the customer table with it — that list only ever grows.
  const wanted = Number(query.get('pelanggan')) || 0;
  const [products, picked, shop, comboOptions, comboByProduct] = await Promise.all([
    queries.listProducts({ onlyActive: true }),
    wanted ? loyalty.getCustomerBasic(wanted) : null,
    settings.shopConfig(),
    // The shop-wide fallback pool: whatever is ticked as "pilihan isi" right
    // now — add a buah potong there and it appears here immediately.
    queries.listComboOptions(),
    // And each combinable product's own ticked list, which takes precedence.
    queries.comboOptionsByProduct(),
  ]);
  sendHtml(
    res,
    adminViews.renderPesananTambah({
      admin: req.admin,
      products,
      taxPercent: settings.taxRateFor(shop),
      todayKey: toDateKey(new Date()),
      openDates: settings.openDeliveryDates(shop),
      deliveryMode: shop.deliveryMode,
      fruitOptions: comboOptions,
      fruitOptionsByProduct: comboByProduct,
      loyaltyOn: req.loyaltyOn,
      picked: picked
        ? {
            id: Number(picked.id),
            name: picked.name,
            wa: formatWhatsapp(picked.whatsapp),
            digits: String(picked.whatsapp || '').replace(/\D/g, ''),
            address: picked.address || '',
          }
        : null,
      values: picked
        ? { customerId: picked.id, customerName: picked.name, whatsapp: formatWhatsapp(picked.whatsapp) }
        : {},
    })
  );
}));

router.post('/admin/pesanan/tambah', requirePermission('pesanan.manual', async (req, res) => {
  // fieldLists as well as fields: a mix product posts one quantity and one
  // checkbox group per combination, all sharing a name.
  const { fields, fieldLists } = await parseBody(req);
  const [products, shop, comboOptions, comboByProduct] = await Promise.all([
    queries.listProducts({ onlyActive: true }),
    settings.shopConfig(),
    queries.listComboOptions(),
    queries.comboOptionsByProduct(),
  ]);
  // The same PPN the website would charge, read from the settings rather than
  // the form, so a sale typed in here and one taken online are priced alike.
  const taxPercent = settings.taxRateFor(shop);

  const qty = {};
  for (const p of products) {
    const n = Math.max(0, Math.round(Number(fields[`qty_${p.id}`]) || 0));
    if (n > 0) qty[p.id] = String(n);
  }

  // A combinable cup is built per cup, so one product can appear as several
  // lines with different fruit in each — eight cups can be eight combinations.
  // Each row posts its own quantity plus a checkbox group named with the row's
  // index, which is what keeps one combination from bleeding into the next.
  // Names come from every list there is, so a label can always be built; what a
  // given cup may CONTAIN is narrower — its own ticked list when it has one.
  const allOptions = [...comboOptions];
  for (const list of Object.values(comboByProduct)) allOptions.push(...list);
  const fruitById = new Map(allOptions.map((o) => [Number(o.id), o]));
  const allowedIdsFor = (productId) => {
    const own = comboByProduct[String(productId)];
    const list = own && own.length ? own : comboOptions;
    return new Set(list.map((o) => Number(o.id)));
  };
  const mixLines = {};
  for (const p of products) {
    if (!p.combo_enabled) continue;
    const allowed = allowedIdsFor(p.id);
    const quantities = fieldLists[`mixQty_${p.id}`] || [];
    const lines = [];
    for (let i = 0; i < quantities.length; i += 1) {
      const cups = Math.max(0, Math.round(Number(quantities[i]) || 0));
      const picked = (fieldLists[`mixBuah_${p.id}_${i}`] || [])
        .map((v) => Number(v))
        .filter((id) => allowed.has(id));
      const unique = [...new Set(picked)];
      if (cups > 0 || unique.length) lines.push({ qty: cups, fruits: unique });
    }
    if (lines.length) mixLines[p.id] = lines;
  }
  const customerId = (fields.customerId || '').trim();
  const values = {
    customerId,
    customerName: (fields.customerName || '').trim(),
    whatsapp: (fields.whatsapp || '').trim(),
    address: (fields.address || '').trim(),
    deliveryDate: (fields.deliveryDate || '').trim(),
    deliveryFee: String(Math.max(0, Math.round(Number(fields.deliveryFee) || 0))),
    status: fields.status || 'selesai',
    notes: (fields.notes || '').trim(),
    useReward: Boolean(fields.useReward),
    // When the sale actually happened. A manual order is usually typed in
    // afterwards, and dating it "today" would put yesterday's takings in
    // today's report.
    orderDate: (fields.orderDate || '').trim(),
    // Fulfilment and payment are different questions: cups can go out before
    // the money arrives, and money can arrive before the cups go out.
    paid: fields.paid === '1',
    // Turn a walk-in into a customer. Without an account the sale is recorded
    // as a guest: the name and number sit on the order but the person collects
    // no stamps and builds no history, which is usually not what the counter
    // meant to happen.
    buatAkun: fields.buatAkun !== '0',
    qty,
  };
  // The picked account, looked up rather than taken on trust. It has to be
  // fetched anyway to redraw the picker after an error, and checking that it
  // exists is what keeps a stale or hand-typed id from reaching create_order.
  const pickedCustomer = customerId ? await loyalty.getCustomerBasic(Number(customerId)) : null;
  const picked = pickedCustomer
    ? {
        id: Number(pickedCustomer.id),
        name: pickedCustomer.name,
        wa: formatWhatsapp(pickedCustomer.whatsapp),
        digits: String(pickedCustomer.whatsapp || '').replace(/\D/g, ''),
        address: pickedCustomer.address || '',
      }
    : null;
  const rerender = (errors) =>
    sendHtml(
      res,
      adminViews.renderPesananTambah({
        admin: req.admin,
        products,
        picked,
        errors,
        values,
        taxPercent,
        todayKey: toDateKey(new Date()),
        openDates: settings.openDeliveryDates(shop),
        deliveryMode: shop.deliveryMode,
        fruitOptions: comboOptions,
        fruitOptionsByProduct: comboByProduct,
        loyaltyOn: req.loyaltyOn,
        mixLines,
      })
    );

  const errors = [];
  if (customerId && !pickedCustomer) errors.push('Akun pelanggan yang dipilih tidak ditemukan.');
  if (!values.customerName) errors.push('Nama pemesan wajib diisi.');
  const normalized = normalizeWhatsapp(values.whatsapp);
  if (!normalized) errors.push('Nomor WhatsApp tidak valid.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.deliveryDate)) errors.push('Tanggal antar wajib diisi.');
  const todayKeyNow = toDateKey(new Date());
  if (values.orderDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.orderDate)) {
    errors.push('Tanggal pesanan tidak valid.');
  } else if (values.orderDate && values.orderDate > todayKeyNow) {
    errors.push('Tanggal pesanan tidak boleh di masa depan.');
  }
  const items = products
    .filter((p) => qty[p.id])
    .map((p) => ({ productId: Number(p.id), name: p.name, price: Number(p.price), qty: Number(qty[p.id]) }));

  // Each combination becomes its own line, labelled with what's in it — the
  // same shape a shopper's mix produces at checkout, so the order page, the
  // receipt and the CSV all read the same either way.
  for (const [productId, lines] of Object.entries(mixLines)) {
    const product = products.find((p) => Number(p.id) === Number(productId));
    if (!product) continue;
    lines.forEach((line, index) => {
      if (line.qty <= 0) return;
      if (!line.fruits.length) {
        errors.push(`Kombinasi ${index + 1} ${product.name}: pilih dulu buahnya.`);
        return;
      }
      const names = line.fruits.map((id) => fruitById.get(id).name);
      items.push({
        productId: Number(product.id),
        name: product.name,
        price: Number(product.price),
        qty: line.qty,
        label: `${product.name} (${names.join(', ')})`,
      });
    });
  }

  if (!items.length) errors.push('Isi jumlah untuk minimal satu produk.');
  // Totalled per product: eight separate one-cup combinations still have to
  // fit in the stock for eight cups.
  const wantedPerProduct = new Map();
  for (const it of items) {
    wantedPerProduct.set(it.productId, (wantedPerProduct.get(it.productId) || 0) + it.qty);
  }
  for (const [productId, wanted] of wantedPerProduct) {
    const product = products.find((p) => Number(p.id) === productId);
    if (product && !product.unlimited_stock && wanted > Number(product.stock)) {
      errors.push(`Stok ${product.name} tidak mencukupi (diminta ${wanted}, sisa ${product.stock}).`);
    }
  }
  const status = ORDER_STATUSES.some((o) => o.value === values.status && o.value !== 'dibatalkan')
    ? values.status
    : 'selesai';
  if (errors.length) return rerender(errors);

  // No account picked, but the admin asked for one: reuse the account that
  // number already has, or make a new one. Done before the order is created so
  // the sale is linked from the start and its stamps land on the right card.
  let linkedCustomerId = customerId ? Number(customerId) : null;
  let newAccount = null;
  if (!linkedCustomerId && values.buatAkun && normalized) {
    const existing = await customerAuth.findByWhatsapp(normalized);
    if (existing) {
      linkedCustomerId = Number(existing.id);
    } else {
      // Nobody ever sees this password — not the customer, not the admin who
      // typed the order. It exists only so the row is valid; a customer who
      // later wants to sign in goes through Lupa Password, which is already an
      // admin-verified flow. That's safer than handing out a password over the
      // counter and hoping it reaches the right person.
      const password = crypto.randomBytes(24).toString('hex');
      const created = await customerAuth.createCustomer({
        whatsapp: normalized,
        name: values.customerName,
        password,
        address: values.address,
        birthday: null,
      });
      linkedCustomerId = Number(created.id);
      newAccount = { id: linkedCustomerId, whatsapp: normalized, name: values.customerName };
      await logAdminAction(
        req.admin,
        'customer.create',
        `${values.customerName} (${formatWhatsapp(normalized)}) — dibuat otomatis dari pesanan manual`
      );
    }
  }

  // The same benefits the website would apply, so a manually entered sale and
  // a self-service one are priced identically.
  const session = linkedCustomerId ? { customerId: linkedCustomerId } : null;
  const cartItems = items.map((it) => ({
    product: products.find((p) => Number(p.id) === it.productId),
    qty: it.qty,
    unitPrice: it.price,
  }));
  const { reward, membership } = await customerBenefits(session, cartItems, values.deliveryDate);
  const useReward = values.useReward && reward.available > 0;

  let order;
  try {
    order = await queries.createOrder({
      customerName: values.customerName,
      whatsapp: normalized,
      notes: values.notes,
      items,
      proofFilename: null,
      address: values.address,
      deliveryDate: values.deliveryDate,
      customerId: linkedCustomerId,
      useReward,
      voucherCode: null,
      deliveryFee: Number(values.deliveryFee),
      tier: membership.tier || {},
      taxPercent,
      // Backdating a sale to the day it really happened, so the revenue
      // report and the daily figures line up with the shop's own books.
      dateKey: values.orderDate || undefined,
    });
  } catch (err) {
    console.error(err);
    return rerender([extractPgErrorMessage(err) || 'Gagal menyimpan pesanan. Coba lagi.']);
  }

  // created_at drives "when was this ordered" everywhere it's displayed, so a
  // backdated sale moves that too — at noon on that day, which keeps it inside
  // the same Jakarta calendar day whatever the server's clock is doing.
  if (values.orderDate && values.orderDate !== todayKeyNow) {
    await queries.setOrderPlacedAt(order.id, values.orderDate);
  }
  await queries.setOrderPaid(order.id, values.paid, { at: values.orderDate || null });

  // create_order always starts an order at 'menunggu'; apply the chosen state
  // and let the stamp rule follow from it, exactly as the status page does.
  if (status !== 'menunggu') await queries.updateOrderStatus(order.id, status);
  if (linkedCustomerId && status === 'selesai') await loyalty.grantForOrder(linkedCustomerId, order.id);

  await logAdminAction(
    req.admin,
    'order.manual_create',
    `${order.orderNumber} — ${values.customerName} (${items.reduce((n, it) => n + it.qty, 0)} cup, ${status}, ` +
      `${values.paid ? 'sudah dibayar' : 'BELUM dibayar'}` +
      `${newAccount ? ', akun pelanggan baru dibuat' : linkedCustomerId ? ', ditautkan ke akun pelanggan' : ', tanpa akun'}` +
      `${values.orderDate && values.orderDate !== todayKeyNow ? `, dicatat untuk tanggal ${values.orderDate}` : ''})`
  );
  redirect(
    res,
    `/admin/pesanan/${order.id}` +
      (newAccount
        ? '?flash=' +
          encodeURIComponent(
            `Akun pelanggan dibuat untuk ${newAccount.name} (${formatWhatsapp(newAccount.whatsapp)}) — ` +
              'stempelnya sudah masuk ke akun itu. Kalau nanti mau masuk sendiri ke website, ' +
              'pelanggan pakai menu "Lupa Password" dan kamu yang menyetujui kodenya.'
          )
        : '')
  );
}));

// Marking the money as received (or not). Its own permission-checked route
// rather than part of the status form: fulfilment and payment move
// independently, and conflating them is how "selesai but never paid" gets lost.
router.post('/admin/pesanan/:id/bayar', requirePermission('pesanan.status', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const order = await queries.getOrder(id);
  if (!order) return notFound(res, req);

  const paid = fields.paid === '1';
  if (Boolean(order.paid) === paid) return redirect(res, `/admin/pesanan/${id}`);
  await queries.setOrderPaid(id, paid);
  await logAdminAction(
    req.admin,
    'order.payment',
    `${order.order_number} (${order.customer_name}): ${order.paid ? 'sudah dibayar' : 'belum dibayar'} → ${
      paid ? 'sudah dibayar' : 'belum dibayar'
    } (${formatRupiah(order.total)})`
  );
  redirect(res, `/admin/pesanan/${id}?flash=` + encodeURIComponent(paid ? 'Ditandai sudah dibayar.' : 'Ditandai belum dibayar.'));
}));

router.get('/admin/pesanan/:id', requirePermission('pesanan.lihat', async (req, res, { query }) => {
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

router.post('/admin/pesanan/:id/tukar-stempel', requirePermission('pelanggan.stempel', async (req, res) => {
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

router.post('/admin/pesanan/:id/status', requirePermission('pesanan.status', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  // Only the known states are accepted. An unrecognised value changes nothing:
  // falling back to a default would let a stale form or a typo quietly move a
  // finished order back to "waiting", revoking its stamp and re-taking stock.
  const status = fields.status;
  if (!ORDER_STATUSES.some((s) => s.value === status)) {
    return redirect(
      res,
      `/admin/pesanan/${id}?error=` + encodeURIComponent('Status pesanan tidak dikenal, jadi tidak ada yang diubah.')
    );
  }

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

  // Completing an order earns stamps — one per cup, automatically, the moment
  // the status becomes Selesai. Moving it back out takes the unspent ones away
  // again, and a cancelled order must not hold any either.
  let stampsGranted = 0;
  if (order.customer_id) {
    if (status === 'selesai') stampsGranted = await loyalty.grantForOrder(Number(order.customer_id), id);
    else if (order.status === 'selesai' || nowCancelled) await loyalty.revokeForOrder(id);
  }

  await logAdminAction(
    req.admin,
    'order.status_update',
    // Both ends of the change, and the customer — "PC-… -> selesai" left you
    // unable to tell what it had been, which is the thing you want when
    // checking whether a stamp or a stock movement was correct.
    `${order.order_number} (${order.customer_name}): ${order.status} → ${status}` +
      (nowCancelled !== wasCancelled ? (nowCancelled ? ', stok dikembalikan' : ', stok dipotong lagi') : '') +
      (order.customer_id && status === 'selesai'
        ? stampsGranted > 0
          ? `, ${stampsGranted} stempel diberikan (1 per cup)`
          : ', stempel sudah pernah diberikan'
        : '') +
      (order.customer_id && order.status === 'selesai' && status !== 'selesai' ? ', stempel ditarik' : '')
  );
  redirect(res, `/admin/pesanan/${id}`);
}));

// ---------------------------------------------------------------------
// admin: shop settings & promo codes (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/pengaturan', requirePermission('pengaturan.kelola', async (req, res, { query }) => {
  const shopNow = await settings.shopConfig();
  sendHtml(
    res,
    adminViews.renderPengaturan({
      admin: req.admin,
      shop: shopNow,
      nextOpenDates: settings.openDeliveryDates(shopNow),
      retention: {
        ...(await retention.policy()),
        lastRun: (await settings.getAll()).last_prune_at || '',
      },
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/pengaturan/toko', requirePermission('pengaturan.kelola', async (req, res) => {
  const { fields, fieldLists } = await parseBody(req);
  const num = (value) => Math.max(0, Math.round(Number(value) || 0));
  const cutoff = (fields.sameDayCutoff || '').trim();
  const openTime = (fields.openTime || '').trim();
  const closeTime = (fields.closeTime || '').trim();
  const validTime = (value) => !value || /^\d{2}:\d{2}$/.test(value);
  if (!validTime(cutoff) || !validTime(openTime) || !validTime(closeTime)) {
    return redirect(res, '/admin/pengaturan?error=' + encodeURIComponent('Format jam tidak valid.'));
  }

  // Read first: this form writes thirteen settings at once and the log used to
  // mention only whether the shop was open, so any other change — the delivery
  // fee, the cut-off, the retention policy — left no trace of what it had been.
  const settingsBefore = await settings.getAll({ fresh: true });
  const settingsAfter = {
    shop_open: fields.shopOpen ? '1' : '0',
    shop_notice: (fields.shopNotice || '').trim().slice(0, 200),
    shop_whatsapp: normalizeWhatsapp(fields.shopWhatsapp || '') || '',
    min_order: num(fields.minOrder),
    delivery_fee: num(fields.deliveryFee),
    free_delivery_over: num(fields.freeDeliveryOver),
    same_day_cutoff: cutoff,
    open_time: openTime,
    close_time: closeTime,
    // PPN. The rate is kept even while the box is off, so switching it back on
    // doesn't silently fall back to a different number than it had before.
    tax_enabled: fields.taxEnabled ? '1' : '0',
    tax_percent: Math.min(100, num(fields.taxPercent)),
    // The loyalty programme's master switch. Turning it off changes nothing in
    // the stamps table — the cards are kept exactly as they are, and come back
    // untouched if it is switched on again.
    loyalty_enabled: fields.loyaltyEnabled ? '1' : '0',
    // Delivery days. The weekday boxes post one value each, so they come from
    // fieldLists; the two date lists are free text and are cleaned to real
    // 'YYYY-MM-DD' keys here so nothing unparseable can reach the rules.
    delivery_days: (fieldLists.deliveryDays || [])
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort()
      .join(','),
    delivery_closed_dates: cleanDateList(fields.deliveryClosedDates),
    delivery_open_dates: cleanDateList(fields.deliveryOpenDates),
    delivery_horizon_days: String(Math.min(60, Math.max(1, num(fields.deliveryHorizon) || 14))),
    delivery_date_mode: fields.deliveryDateMode === 'pilihan' ? 'pilihan' : 'kalender',
    // 0 is meaningful here (keep forever), so these are clamped rather than
    // coerced through the falsy-to-default path the money fields use.
    retention_proof_days: Math.min(3650, num(fields.retentionProofDays)),
    retention_log_months: Math.min(120, num(fields.retentionLogMonths)),
  };
  await Promise.all(
    Object.entries(settingsAfter).map(([key, value]) => settings.setValue(key, value))
  );

  const rupiah = (v) => formatRupiah(Number(v) || 0);
  const summary = changeSummary(settingsBefore, settingsAfter, [
    { key: 'shop_open', label: 'toko', format: (v) => (String(v) === '1' ? 'buka' : 'tutup') },
    { key: 'shop_notice', label: 'pengumuman' },
    { key: 'shop_whatsapp', label: 'WhatsApp toko' },
    { key: 'min_order', label: 'min. belanja', format: rupiah },
    { key: 'delivery_fee', label: 'ongkir', format: rupiah },
    { key: 'free_delivery_over', label: 'gratis ongkir di atas', format: rupiah },
    { key: 'same_day_cutoff', label: 'batas pesan hari ini' },
    {
      key: 'delivery_days',
      label: 'hari antar',
      format: (v) => {
        const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const list = String(v || '').split(',').filter(Boolean).map((d) => names[Number(d)]);
        return list.length ? list.join(', ') : 'setiap hari';
      },
    },
    { key: 'delivery_closed_dates', label: 'tanggal ditutup' },
    { key: 'delivery_open_dates', label: 'tanggal dibuka khusus' },
    { key: 'delivery_horizon_days', label: 'tampil berapa hari ke depan' },
    {
      key: 'delivery_date_mode',
      label: 'cara pilih tanggal',
      format: (v) => (String(v) === 'pilihan' ? 'daftar tanggal' : 'kalender'),
    },
    { key: 'tax_enabled', label: 'PPN', format: (v) => (String(v) === '1' ? 'aktif' : 'nonaktif') },
    {
      key: 'loyalty_enabled',
      label: 'program stempel',
      format: (v) => (String(v) === '0' ? 'dimatikan' : 'aktif'),
    },
    { key: 'tax_percent', label: 'tarif PPN', format: (v) => `${Number(v) || 0}%` },
    { key: 'open_time', label: 'jam buka' },
    { key: 'close_time', label: 'jam tutup' },
    { key: 'retention_proof_days', label: 'simpan bukti (hari)' },
    { key: 'retention_log_months', label: 'simpan log (bulan)' },
  ]);
  await logAdminAction(req.admin, 'settings.update', summary);
  redirect(res, '/admin/pengaturan?flash=' + encodeURIComponent('Pengaturan toko disimpan.'));
}));

router.get('/admin/voucher', requirePermission('voucher.kelola', async (req, res, { query }) => {
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

router.post('/admin/voucher/tambah', requirePermission('voucher.kelola', async (req, res) => {
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

  await logAdminAction(
    req.admin,
    'voucher.create',
    `${result.code} — ${vouchers.describe(result)}`
  );
  redirect(res, '/admin/voucher?flash=' + encodeURIComponent(`Kode ${result.code} dibuat.`));
}));

router.post('/admin/voucher/:id/toggle', requirePermission('voucher.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const all = await vouchers.list();
  const target = all.find((v) => Number(v.id) === id);
  if (!target) return notFound(res, req);

  await vouchers.setActive(id, !target.active);
  await logAdminAction(
    req.admin,
    'voucher.update',
    `${target.code} — ${target.active ? 'aktif → nonaktif' : 'nonaktif → aktif'} (${vouchers.describe(target)})`
  );
  redirect(res, '/admin/voucher?flash=' + encodeURIComponent(`Kode ${target.code} diperbarui.`));
}));

router.post('/admin/voucher/:id/hapus', requirePermission('voucher.kelola', async (req, res) => {
  const id = Number(req.params.id);
  const all = await vouchers.list();
  const target = all.find((v) => Number(v.id) === id);
  if (!target) return notFound(res, req);

  await vouchers.remove(id);
  await logAdminAction(req.admin, 'voucher.delete', `${target.code} — ${vouchers.describe(target)}`);
  redirect(res, '/admin/voucher?flash=' + encodeURIComponent(`Kode ${target.code} dihapus.`));
}));

// ---------------------------------------------------------------------
// admin: sales report
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
// admin: customer password resets
// ---------------------------------------------------------------------
// Open to every admin, not just superadmins: this is front-line customer
// service, and approving a reset never reveals or sets a password — the
// customer picks their own with the one-time code.

router.get('/admin/reset-sandi', requirePermission('reset_sandi.kelola', async (req, res, { query }) => {
  sendHtml(
    res,
    adminViews.renderResetSandi({
      requests: await passwordReset.listRequests(),
      admin: req.admin,
      flash: query.get('ok') ? 'Permintaan reset diperbarui.' : '',
    })
  );
}));

router.post('/admin/reset-sandi/:id/setujui', requirePermission('reset_sandi.kelola', async (req, res) => {
  const id = Number(req.params.id);
  const result = await passwordReset.approve(id, req.admin.username);
  const requests = await passwordReset.listRequests();
  if (!result.ok) {
    return sendHtml(res, adminViews.renderResetSandi({ requests, admin: req.admin, error: result.error }));
  }

  const row = requests.find((r) => Number(r.id) === id) || {};
  await logAdminAction(
    req.admin,
    'customer.password_reset_approved',
    `${row.name || 'pelanggan #' + result.customerId}${row.whatsapp ? ` (${formatWhatsapp(row.whatsapp)})` : ''} — password baru dikirim`
  );
  // The code is rendered once here and never stored in plaintext — if the
  // admin loses it, they generate a new one.
  sendHtml(
    res,
    adminViews.renderResetSandi({
      requests,
      admin: req.admin,
      issued: {
        code: result.code,
        expiresInMinutes: result.expiresInMinutes,
        name: row.name || 'pelanggan',
        whatsapp: row.whatsapp || '',
        waLink: row.whatsapp
          ? `https://wa.me/${row.whatsapp}?text=${encodeURIComponent(
              `Halo ${row.name || ''}, ini kode reset password Pecup kamu: ${result.code}. Berlaku ${result.expiresInMinutes} menit. Masukkan di halaman pecup: /lupa-sandi/kode`
            )}`
          : '',
      },
    })
  );
}));

router.post('/admin/reset-sandi/:id/tolak', requirePermission('reset_sandi.kelola', async (req, res) => {
  const rejectId = Number(req.params.id);
  // Was "Permintaan #12", which named nobody. The request is read before it is
  // rejected so the entry can say whose reset was turned down.
  const rejected = (await passwordReset.listRequests()).find((r) => Number(r.id) === rejectId);
  await passwordReset.reject(rejectId, req.admin.username);
  await logAdminAction(
    req.admin,
    'customer.password_reset_rejected',
    rejected
      ? `${rejected.name || 'pelanggan'} (${formatWhatsapp(rejected.whatsapp || '')}) — permintaan #${rejectId}`
      : `permintaan #${rejectId} (tidak ditemukan)`
  );
  redirect(res, '/admin/reset-sandi?ok=1');
}));

// Open to every admin: they already see each order's total on the Pesanan
// page, so this exposes no new information — it just adds them up.
router.get('/admin/laporan', requirePermission('laporan.lihat', async (req, res, { query }) => {
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

  // The profit half of the page is its own permission: an admin can be trusted
  // with the sales figures without being shown what the shop actually keeps.
  const showProfit = req.can('laba.lihat');
  const expenses = showProfit
    ? await inventory.expenseTotals({ from: view.dari, to: view.sampai })
    : null;

  sendHtml(
    res,
    adminViews.renderLaporan({
      admin: req.admin,
      report,
      view,
      activePreset,
      todayKey,
      showProfit,
      expenses,
    })
  );
}));

// ---------------------------------------------------------------------
// admin: stockroom & expenses (never shown to a shopper)
// ---------------------------------------------------------------------
// The cost side of the business: what the shop buys, what each cup consumes,
// and what it pays out. Both pages are behind their own permission, so a
// counter admin can be given the order screens without ever seeing margins.

router.get('/admin/inventaris', requirePermission('inventaris.kelola', async (req, res, { query }) => {
  const wanted = Number(query.get('ubah')) || 0;
  const [items, value, editing] = await Promise.all([
    inventory.listItems(),
    inventory.stockValue(),
    wanted ? inventory.getItem(wanted) : null,
  ]);
  sendHtml(
    res,
    inventoryViews.renderInventaris({
      admin: req.admin,
      items,
      units: inventory.UNITS,
      totalValue: value.value,
      editing,
      history: editing ? await inventory.itemHistory(editing.id, 12) : [],
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/inventaris/tambah', requirePermission('inventaris.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const result = await inventory.createItem({
    name: fields.nama,
    unit: fields.satuan,
    stock: fields.stok,
    unitCost: fields.harga,
    lowThreshold: fields.batas,
    by: req.admin.username,
  });
  if (!result.ok) return redirect(res, '/admin/inventaris?error=' + encodeURIComponent(result.error));
  await logAdminAction(
    req.admin,
    'inventory.create',
    `${String(fields.nama).trim()} — stok awal ${Math.round(Number(fields.stok) || 0)} ${fields.satuan || 'pcs'}, ` +
      `harga ${formatRupiah(Number(fields.harga) || 0)}/satuan`
  );
  redirect(res, '/admin/inventaris?flash=' + encodeURIComponent('Barang ditambahkan.'));
}));

router.post('/admin/inventaris/:id/ubah', requirePermission('inventaris.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const before = await inventory.getItem(id);
  if (!before) return notFound(res, req);

  const result = await inventory.updateItem(id, {
    name: fields.nama,
    unit: fields.satuan,
    unitCost: fields.harga,
    lowThreshold: fields.batas,
    active: Boolean(fields.aktif),
    note: fields.catatan,
  });
  if (!result.ok) return redirect(res, '/admin/inventaris?error=' + encodeURIComponent(result.error));

  const after = await inventory.getItem(id);
  const summary = changeSummary(before, after, [
    { label: 'nama', get: (i) => i.name },
    { label: 'satuan', get: (i) => i.unit },
    { label: 'harga/satuan', get: (i) => i.unitCost, format: (v) => formatRupiah(v) },
    { label: 'batas peringatan', get: (i) => i.lowThreshold },
    { label: 'status', get: (i) => (i.active ? 'dipakai' : 'tidak dipakai') },
    { label: 'catatan', get: (i) => i.note || '' },
  ]);
  await logAdminAction(req.admin, 'inventory.update', `${before.name}: ${summary}`);
  redirect(res, '/admin/inventaris?flash=' + encodeURIComponent(`${after.name} disimpan.`));
}));

// Adding stock. If the total paid is filled in it does two things at once:
// moves the quantity, and records the money as an expense — which is what
// keeps "laba bersih" honest without anyone having to remember to type it
// twice. It also refreshes the unit cost from what was actually just paid.
router.post('/admin/inventaris/:id/stok', requirePermission('inventaris.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const item = await inventory.getItem(id);
  if (!item) return notFound(res, req);

  const qty = Math.round(Number(fields.jumlah) || 0);
  const spent = Math.max(0, Math.round(Number(fields.totalHarga) || 0));
  if (!qty) return redirect(res, '/admin/inventaris?error=' + encodeURIComponent('Isi jumlahnya dulu.'));

  const moved = await inventory.adjustStock(id, qty, {
    reason: qty > 0 && spent > 0 ? 'pembelian' : 'penyesuaian',
    note: spent > 0 ? `beli ${qty} ${item.unit} seharga ${formatRupiah(spent)}` : '',
    by: req.admin.username,
  });
  if (!moved.ok) return redirect(res, '/admin/inventaris?error=' + encodeURIComponent(moved.error));

  let expenseNote = '';
  if (spent > 0 && qty > 0) {
    await inventory.addExpense({
      dateKey: toDateKey(new Date()),
      category: 'Kemasan',
      description: `Beli ${qty} ${item.unit} ${item.name}`,
      amount: spent,
      itemId: id,
      by: req.admin.username,
    });
    // The price of the last purchase is the honest figure for what a cup
    // costs today, so the margin follows the market rather than a number
    // typed once and forgotten.
    await inventory.updateItem(id, {
      name: item.name,
      unit: item.unit,
      unitCost: Math.round(spent / qty),
      lowThreshold: item.lowThreshold,
      active: item.active,
      note: item.note,
    });
    expenseNote = ` dan dicatat sebagai pengeluaran ${formatRupiah(spent)}`;
  }

  await logAdminAction(
    req.admin,
    'inventory.stock',
    `${item.name}: ${qty > 0 ? '+' : ''}${qty} ${item.unit} (${item.stock} → ${moved.stock})` +
      (spent > 0 ? `, dibeli ${formatRupiah(spent)} → harga/satuan jadi ${formatRupiah(Math.round(spent / qty))}` : '')
  );
  redirect(
    res,
    '/admin/inventaris?flash=' +
      encodeURIComponent(`Stok ${item.name} sekarang ${moved.stock} ${item.unit}${expenseNote}.`)
  );
}));

router.post('/admin/inventaris/:id/hapus', requirePermission('inventaris.kelola', async (req, res) => {
  const id = Number(req.params.id);
  const item = await inventory.getItem(id);
  if (!item) return notFound(res, req);
  await inventory.deleteItem(id);
  await logAdminAction(req.admin, 'inventory.delete', `${item.name} (sisa ${item.stock} ${item.unit})`);
  redirect(res, '/admin/inventaris?flash=' + encodeURIComponent(`${item.name} dihapus dari daftar bahan.`));
}));

router.get('/admin/pengeluaran', requirePermission('pengeluaran.kelola', async (req, res, { query }) => {
  const view = {
    dari: (query.get('dari') || '').trim(),
    sampai: (query.get('sampai') || '').trim(),
    kategori: (query.get('kategori') || '').trim(),
  };
  const [expenses, totals] = await Promise.all([
    inventory.listExpenses({ from: view.dari, to: view.sampai, category: view.kategori }),
    inventory.expenseTotals({ from: view.dari, to: view.sampai }),
  ]);
  sendHtml(
    res,
    inventoryViews.renderPengeluaran({
      admin: req.admin,
      expenses,
      categories: inventory.EXPENSE_CATEGORIES,
      totals,
      view,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/pengeluaran/tambah', requirePermission('pengeluaran.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const result = await inventory.addExpense({
    dateKey: (fields.tanggal || '').trim(),
    category: fields.kategori,
    description: fields.keterangan,
    amount: fields.nominal,
    by: req.admin.username,
  });
  if (!result.ok) return redirect(res, '/admin/pengeluaran?error=' + encodeURIComponent(result.error));
  await logAdminAction(
    req.admin,
    'expense.create',
    `${formatRupiah(Number(fields.nominal) || 0)} — ${fields.kategori || 'Lain-lain'}` +
      (String(fields.keterangan || '').trim() ? ` (${String(fields.keterangan).trim()})` : '') +
      ` pada ${(fields.tanggal || '').trim() || toDateKey(new Date())}`
  );
  redirect(res, '/admin/pengeluaran?flash=' + encodeURIComponent('Pengeluaran dicatat.'));
}));

router.post('/admin/pengeluaran/:id/hapus', requirePermission('pengeluaran.kelola', async (req, res) => {
  const id = Number(req.params.id);
  const row = await inventory.getExpense(id);
  if (!row) return notFound(res, req);
  await inventory.deleteExpense(id);
  await logAdminAction(
    req.admin,
    'expense.delete',
    `${formatRupiah(row.amount)} — ${row.category}${row.description ? ` (${row.description})` : ''} pada ${row.date_key}`
  );
  redirect(res, '/admin/pengeluaran?flash=' + encodeURIComponent('Pengeluaran dihapus.'));
}));

// ---------------------------------------------------------------------
// admin: accounts (superadmin only)
// ---------------------------------------------------------------------

router.get('/admin/akun', requirePermission('admin.kelola', async (req, res, { query }) => {
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

router.post('/admin/akun/tambah', requirePermission('admin.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const username = (fields.username || '').trim();
  const password = fields.password || '';
  const role = fields.role === 'superadmin' ? 'superadmin' : 'admin';

  let error = null;
  if (!username) error = 'Username wajib diisi.';
  else if (password.length < 6) error = 'Password minimal 6 karakter.';
  // Only the owner mints another owner. Without this, "kelola akun" would be a
  // one-dropdown route to giving yourself everything.
  else if (role === 'superadmin' && !req.isSuperadmin) {
    error = 'Hanya superadmin yang bisa membuat akun superadmin.';
  }

  if (error) {
    return redirect(res, '/admin/akun?error=' + encodeURIComponent(error));
  }

  try {
    // No permissions to start with: the next screen is where they're chosen,
    // so a new account can never exist with more access than was decided.
    const newId = await adminAuth.createAdmin({ username, password, role, permissions: [] });
    await logAdminAction(req.admin, 'admin.create', `${username} (${role}) — belum diberi izin apa pun`);
    return redirect(
      res,
      role === 'superadmin'
        ? '/admin/akun?flash=' + encodeURIComponent(`Superadmin ${username} dibuat.`)
        : `/admin/akun/${newId}/izin?flash=` + encodeURIComponent(`Akun ${username} dibuat. Sekarang pilih izinnya.`)
    );
  } catch (err) {
    const message = /unique/i.test(err.message) ? 'Username sudah dipakai.' : 'Gagal menambahkan admin.';
    redirect(res, '/admin/akun?error=' + encodeURIComponent(message));
  }
}));

// Superadmin resetting another admin's password. The plaintext is hashed by
// adminAuth and never stored or logged — the log records only who changed
// whose password.
router.post('/admin/akun/:id/password', requirePermission('admin.kelola', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const password = fields.password || '';

  const target = await adminAuth.findAdminById(id);
  if (!target) return notFound(res);
  // Resetting someone's password is taking their account. Only the owner may
  // do that to another owner.
  if (!permissions.canManage(req.admin, target)) {
    return redirect(
      res,
      '/admin/akun?error=' + encodeURIComponent('Hanya superadmin yang bisa mengubah akun superadmin.')
    );
  }
  if (password.length < 6) {
    return redirect(res, '/admin/akun?error=' + encodeURIComponent('Password minimal 6 karakter.'));
  }

  await adminAuth.updateAdminPassword(id, password);
  await logAdminAction(req.admin, 'admin.password', `${target.username} (${target.role})`);
  redirect(res, '/admin/akun?flash=' + encodeURIComponent(`Password ${target.username} berhasil diganti.`));
}));

// The allowance editor: one page per admin, one tick box per thing they may
// reach. Registered before /admin/akun/:id/hapus only for readability — the
// paths don't collide.
router.get('/admin/akun/:id/izin', requirePermission('admin.kelola', async (req, res, { query }) => {
  const target = await adminAuth.findAdminById(Number(req.params.id));
  if (!target) return notFound(res);
  if (!permissions.canManage(req.admin, target)) return forbidden(req, res, 'admin.kelola');

  sendHtml(
    res,
    adminViews.renderAdminIzin({
      admin: req.admin,
      target,
      catalog: permissions.CATALOG,
      presets: permissions.PRESETS,
      granted: permissions.permissionsFor(target),
      // Nobody can hand out more than they hold themselves.
      grantable: permissions.grantableBy(req.admin),
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

router.post('/admin/akun/:id/izin', requirePermission('admin.kelola', async (req, res) => {
  // fieldLists, not fields: a tick-box group posts the same name many times and
  // `fields` deliberately keeps only the last value of a repeated name.
  const { fieldLists } = await parseBody(req);
  const target = await adminAuth.findAdminById(Number(req.params.id));
  if (!target) return notFound(res);
  if (!permissions.canManage(req.admin, target)) return forbidden(req, res, 'admin.kelola');
  if (target.role === 'superadmin') {
    return redirect(
      res,
      `/admin/akun/${target.id}/izin?error=` +
        encodeURIComponent('Superadmin selalu punya semua izin. Ubah perannya dulu kalau mau dibatasi.')
    );
  }

  const wanted = fieldLists.izin || [];
  const before = permissions.permissionsFor(target);
  // limitGrant drops anything the editor doesn't hold, and keeps whatever the
  // target already had that the editor couldn't have granted — so editing
  // someone's boxes can neither escalate them nor quietly strip an allowance
  // the editor wasn't even shown.
  const after = permissions.limitGrant(req.admin, wanted, { keep: before });
  await adminAuth.setAdminPermissions(target.id, after);

  const added = after.filter((k) => !before.includes(k));
  const removed = before.filter((k) => !after.includes(k));
  const parts = [];
  if (added.length) parts.push(`+ ${permissions.describe(added)}`);
  if (removed.length) parts.push(`− ${permissions.describe(removed)}`);
  await logAdminAction(
    req.admin,
    'admin.permissions',
    parts.length
      ? `${target.username}: ${parts.join(' | ')} (total ${after.length} izin)`
      : `${target.username}: disimpan tanpa perubahan (${after.length} izin)`
  );

  redirect(
    res,
    `/admin/akun/${target.id}/izin?flash=` +
      encodeURIComponent(
        parts.length ? `Izin ${target.username} disimpan.` : `Tidak ada yang berubah untuk ${target.username}.`
      )
  );
}));

router.post('/admin/akun/:id/hapus', requirePermission('admin.kelola', async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.admin.adminId) {
    return redirect(res, '/admin/akun?error=' + encodeURIComponent('Tidak bisa menghapus akun sendiri.'));
  }
  const target = await adminAuth.findAdminById(id);
  if (!target) return notFound(res);
  if (!permissions.canManage(req.admin, target)) {
    return redirect(
      res,
      '/admin/akun?error=' + encodeURIComponent('Hanya superadmin yang bisa menghapus akun superadmin.')
    );
  }
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
router.get('/admin/pelanggan', requirePermission('pelanggan.lihat', async (req, res, { query }) => {
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
      loyaltyOn: req.loyaltyOn,
      flash: query.get('flash') || '',
      error: query.get('error') || '',
    })
  );
}));

// Registered with /:id below it, so this literal path has to be declared
// first or "unduh" would be read as a customer id.
router.get('/admin/pelanggan/unduh', requirePermission('pelanggan.unduh', async (req, res) => {
  const customers = await loyalty.listCustomersWithLoyalty({ limit: 500 });
  // With the loyalty programme off there are no stamps, claims or tiers to
  // export — the file would be four columns of zeroes pretending to mean
  // something.
  const header = req.loyaltyOn
    ? ['Nama', 'WhatsApp', 'Bergabung', 'Ulang Tahun', 'Stempel Aktif', 'Klaim Cup Gratis', 'Tier', 'Stempel Hangus']
    : ['Nama', 'WhatsApp', 'Bergabung', 'Ulang Tahun'];
  const lines = [header.map(csvEscape).join(',')];
  for (const c of customers) {
    lines.push(
      [
        c.name,
        formatWhatsapp(c.whatsapp),
        toDateOnly(c.created_at),
        c.birthday ? toDateOnly(c.birthday) : '',
        ...(req.loyaltyOn
          ? [String(c.stamps), String(c.claims), c.tiersEnabled ? c.tier.name : '', c.expiresLabel || '']
          : []),
      ].map(csvEscape).join(',')
    );
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pelanggan-pecup-${toDateKey(new Date())}.csv"`,
  });
  res.end('﻿' + lines.join('\r\n'));
}));

// Type-ahead for the manual-order account picker.
//
// Registered before /admin/pelanggan/:id — the router takes the first match,
// and "cari" would otherwise be read as a customer id.
//
// This exists so the manual-order page doesn't have to ship the whole customer
// table to the browser. It searches; it never lists everybody.
//
// Open to every admin, like the manual-order page it serves — and like the
// customer search page, which already shows the same names and numbers.
router.get('/admin/pelanggan/cari', requirePermission('pelanggan.lihat', async (req, res, { query }) => {
  const q = String(query.get('q') || '').trim().slice(0, 80);
  if (!q) return sendJson(res, { customers: [] });
  const rows = await loyalty.searchCustomersForPicker(q, 20);
  sendJson(res, {
    customers: rows.map((c) => ({
      id: Number(c.id),
      name: c.name,
      wa: formatWhatsapp(c.whatsapp),
      digits: String(c.whatsapp || '').replace(/\D/g, ''),
      address: c.address || '',
    })),
  });
}));

router.get('/admin/pelanggan/:id', requirePermission('pelanggan.lihat', async (req, res, { query }) => {
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
      loyaltyOn: req.loyaltyOn,
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
router.get('/admin/loyalitas', requirePermission('loyalitas.kelola', async (req, res, { query }) => {
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

router.post('/admin/pelanggan/:id/stempel', requirePermission('pelanggan.stempel', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  const target = Number(fields.stamps);
  if (!Number.isFinite(target) || target < 0) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent('Jumlah stempel tidak valid.'));
  }

  const stampsBefore = (await loyalty.statusFor(id)).stamps;
  const updated = await loyalty.setStampCount(id, target, { by: req.admin.username });
  await logAdminAction(
    req.admin,
    'loyalty.stamps',
    `${customer.name} (${formatWhatsapp(customer.whatsapp)}): stempel ${stampsBefore} → ${updated.stamps}`
  );
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent(`Stempel ${customer.name} diperbarui.`));
}));

router.post('/admin/pelanggan/:id/ubah', requirePermission('pelanggan.ubah', async (req, res) => {
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

  // A rename was the only change the log ever showed; a changed number or
  // address left no record of what it had been.
  const summary = changeSummary(
    customer,
    { name, whatsapp: normalizeWhatsapp(fields.whatsapp || '') || customer.whatsapp,
      address: (fields.address || '').trim(), birthday: birthday || null },
    [
      { label: 'nama', get: (c) => c.name },
      { label: 'WhatsApp', get: (c) => formatWhatsapp(c.whatsapp) },
      { label: 'alamat', get: (c) => (c.address || '').trim() },
      { label: 'ulang tahun', get: (c) => (c.birthday ? toDateKey(new Date(c.birthday)) : '') },
    ],
    { nothing: 'disimpan tanpa perubahan' }
  );
  await logAdminAction(req.admin, 'customer.update', `${name}: ${summary}`);
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent('Data pelanggan diperbarui.'));
}));

// Same rule as the admin reset above: hashed on write, plaintext never kept.
router.post('/admin/pelanggan/:id/password', requirePermission('pelanggan.ubah', async (req, res) => {
  const { fields } = await parseBody(req);
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  if ((fields.password || '').length < 6) {
    return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent('Password minimal 6 karakter.'));
  }

  await customerAuth.updatePassword(id, fields.password);
  await logAdminAction(
    req.admin,
    'customer.password',
    `${customer.name} (${formatWhatsapp(customer.whatsapp)})`
  );
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent(`Password ${customer.name} berhasil diganti.`));
}));

router.post('/admin/pelanggan/:id/hapus', requirePermission('pelanggan.ubah', async (req, res) => {
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  await customerAuth.deleteCustomer(id);
  await logAdminAction(req.admin, 'customer.delete', `${customer.name} (${customer.whatsapp})`);
  redirect(res, '/admin/pelanggan?flash=' + encodeURIComponent(`Akun ${customer.name} dihapus.`));
}));

router.post('/admin/pelanggan/:id/klaim', requirePermission('pelanggan.stempel', async (req, res) => {
  const id = Number(req.params.id);
  const customer = await customerAuth.findById(id);
  if (!customer) return notFound(res);

  const result = await loyalty.claimReward(id, { note: `Ditukar admin ${req.admin.username}` });
  if (!result.ok) return redirect(res, `/admin/pelanggan/${id}?error=` + encodeURIComponent(result.error));

  await logAdminAction(
    req.admin,
    'loyalty.redeem',
    `${customer.name} (${formatWhatsapp(customer.whatsapp)}) — 1 cup gratis ditukar`
  );
  redirect(res, `/admin/pelanggan/${id}?flash=` + encodeURIComponent(`Cup gratis ${customer.name} ditukar.`));
}));

router.post('/admin/pengaturan/stempel', requirePermission('loyalitas.kelola', async (req, res) => {
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

router.post('/admin/pengaturan/tier', requirePermission('loyalitas.kelola', async (req, res) => {
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

// CSV of the activity log, honouring whatever filters are on screen — the
// export follows the filters, not just the visible page.
router.get('/admin/log-aktivitas/export', requirePermission('log.lihat', async (req, res, { query }) => {
  const dari = query.get('dari') || '';
  const sampai = query.get('sampai') || '';
  const logs = await queryAllAdminLogs({
    sort: query.get('urut') === 'asc' ? 'asc' : 'desc',
    username: query.get('admin') || '',
    action: query.get('aksi') || '',
    from: dari,
    to: sampai,
  });

  const header = ['Tanggal (WIB)', 'Jam (WIB)', 'Admin', 'Aksi', 'Detail'];
  const lines = [header.map(csvEscape).join(',')];
  for (const row of logs) {
    lines.push(
      [
        toDateOnly(row.created_at),
        formatTimeID(row.created_at),
        row.admin_username || '',
        row.action || '',
        row.detail || '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  // UTF-8 BOM so Excel on Windows renders Indonesian text correctly.
  const csv = '﻿' + lines.join('\r\n');
  const label = dari || sampai ? `${dari || 'awal'}_sampai_${sampai || 'sekarang'}` : 'semua';
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="log-aktivitas-pecup-${label}.csv"`,
  });
  res.end(csv);
}));

router.get('/admin/log-aktivitas', requirePermission('log.lihat', async (req, res, { query }) => {
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

// Kept for the handful of things that are the owner's alone no matter what is
// ticked: creating or removing a superadmin, and the account list itself.
function requireSuperadmin(handler) {
  return (req, res, extra) => {
    if (!req.isAdmin) return redirect(res, '/admin/login');
    if (!req.isSuperadmin) return forbidden(req, res);
    return handler(req, res, extra);
  };
}

// Everything else is a named permission a superadmin ticks per account (see
// src/permissions.js). This is the only thing that decides access — the menu
// hides what you can't reach, but the menu is decoration; this is the gate.
function requirePermission(key, handler) {
  return (req, res, extra) => {
    if (!req.isAdmin) return redirect(res, '/admin/login');
    if (!permissions.has(req.admin, key)) return forbidden(req, res, key);
    return handler(req, res, extra);
  };
}

// Where to send someone who is signed in but not allowed here: the first page
// they CAN open, so a limited account never lands on a dead end.
function landingFor(admin) {
  const first = [
    ['pesanan.lihat', '/admin/pesanan'],
    ['produk.lihat', '/admin/produk'],
    ['pelanggan.lihat', '/admin/pelanggan'],
    ['laporan.lihat', '/admin/laporan'],
  ].find(([key]) => permissions.has(admin, key));
  return first ? first[1] : '/admin';
}

function forbidden(req, res, key) {
  const back = landingFor(req.admin);
  const label = key ? permissions.describe([key]) : '';
  return sendHtml(
    res,
    adminViews.renderForbidden({
      admin: req.admin,
      permissionLabel: label,
      backHref: back,
    }),
    403
  );
}

// What the loyalty reward would be worth on this exact cart. The cheapest cup
// is the one waived — that's the rule create_order enforces too, so what the
// shopper is shown and what they're charged can't drift apart.
// A percentage voucher applies to what's left after the free cup, so ticking
// "use my free cup" changes what the voucher is worth. Both totals are worked
// out here so the checkbox can update the total instantly without the browser
// having to re-derive discount rules it shouldn't know about.
// The membership tier's percentage and its free cups come off before the
// voucher, so both totals below carry the full ladder of discounts in the
// same order create_order applies them:
//   free cups → member percentage → promo code → PPN → delivery fee
// PPN (0 unless the shop has it switched on) is charged on the discounted
// cups, so ticking the free-cup box changes it too — hence two of those as
// well. create_order recomputes it from the same rate; this is only the
// preview.
async function checkoutTotals({ code, subtotal, reward, membership = EMPTY_MEMBERSHIP, deliveryFee, taxPercent = 0 }) {
  const rewardDiscount = reward.available > 0 ? reward.discount : 0;
  const percent = membership.percent || 0;

  const perkWithout = membership.discount.withoutReward;
  const perkWith = membership.discount.withReward;
  const baseWithout = Math.max(0, subtotal - perkWithout);
  const baseWith = Math.max(0, subtotal - perkWith - rewardDiscount);
  const tierWithout = percent > 0 ? Math.floor((baseWithout * percent) / 100) : 0;
  const tierWith = percent > 0 ? Math.floor((baseWith * percent) / 100) : 0;

  const [voucherWithoutReward, voucherWithReward] = await Promise.all([
    voucherPreview(code, subtotal, perkWithout + tierWithout),
    rewardDiscount > 0
      ? voucherPreview(code, subtotal, rewardDiscount + perkWith + tierWith)
      : Promise.resolve(null),
  ]);
  const cupsWithout = Math.max(0, subtotal - perkWithout - tierWithout - voucherWithoutReward.discount);
  const cupsWith =
    rewardDiscount > 0
      ? Math.max(0, subtotal - rewardDiscount - perkWith - tierWith - voucherWithReward.discount)
      : cupsWithout;
  const taxWithout = settings.taxOn(cupsWithout, taxPercent);
  const taxWith = rewardDiscount > 0 ? settings.taxOn(cupsWith, taxPercent) : taxWithout;

  const withoutReward = cupsWithout + taxWithout + deliveryFee;
  const withReward = rewardDiscount > 0 ? cupsWith + taxWith + deliveryFee : withoutReward;
  return {
    voucherWithoutReward,
    voucherWithReward,
    tierWithout,
    tierWith,
    taxPercent,
    taxWithout,
    taxWith,
    withoutReward,
    withReward,
  };
}

// Advisory only — create_order re-validates and consumes the code under a row
// lock. This exists so the shopper sees the saving before they commit.
// `priorDiscount` is everything already taken off the cups (free cups plus the
// member percentage); a promo code applies to what's left, never to the cups'
// full value.
async function voucherPreview(code, subtotal, priorDiscount) {
  if (!code) return { applied: false, code: '', discount: 0, error: '' };
  try {
    return await vouchers.preview(code, {
      subtotal,
      discountable: Math.max(0, subtotal - priorDiscount),
    });
  } catch (err) {
    console.error('voucher preview failed:', err.message);
    return { applied: false, code, discount: 0, error: 'Gagal memeriksa kode voucher.' };
  }
}

const EMPTY_REWARD = { available: 0, discount: 0, itemName: null, perReward: 0 };
const EMPTY_MEMBERSHIP = {
  tier: null,
  percent: 0,
  perks: { withReward: [], withoutReward: [] },
  discount: { withReward: 0, withoutReward: 0 },
};

// Every cup in the order as its own row, cheapest first, priced at what it
// actually costs (wholesale included). Free cups are drawn from the front of
// this list — the same rule create_order follows, so the preview and the
// charge can't disagree.
function cupUnits(items) {
  const units = [];
  for (const it of items) {
    const price = Number(it.unitPrice) || Number(it.product.price) || 0;
    for (let i = 0; i < it.qty; i += 1) units.push({ price, name: it.product.name });
  }
  return units.sort((a, b) => a.price - b.price);
}

// One read of the loyalty state, shared by the stamp card and the tier perks.
// Nothing here is trusted at insert time: create_order re-derives the card,
// re-checks both perks under the customer row lock, and only takes the tier
// percentage from the app (it depends on the saved ladder, not on the client).
async function customerBenefits(sessionCustomer, items, deliveryDateKey = '') {
  if (!sessionCustomer || !items.length) return { reward: EMPTY_REWARD, membership: EMPTY_MEMBERSHIP };

  const status = await loyalty.statusFor(sessionCustomer.customerId);
  // The programme's master switch, asked once here. With it off there is no
  // free cup to offer, no member percentage to take and no perk to spend, so
  // checkout and manual order entry both price exactly like an ordinary shop.
  if (!status.loyaltyEnabled) return { reward: EMPTY_REWARD, membership: EMPTY_MEMBERSHIP };
  const units = cupUnits(items);

  const reward = status.cardComplete && units.length
    ? {
        // One card, one free cup — stamps reset to zero when it's spent.
        available: 1,
        discount: units[0].price,
        itemName: units[0].name,
        perReward: status.perReward,
      }
    : { ...EMPTY_REWARD, perReward: status.perReward };

  if (!status.tiersEnabled) return { reward, membership: EMPTY_MEMBERSHIP };

  const available = loyalty.perkAvailability(status, deliveryDateKey);
  const tier = status.tier || {};
  // Free cups are granted in create_order's order — stamp card, then weekly,
  // then birthday — so which cup each perk waives depends on whether the
  // stamp-card cup is being used. Both variants are worked out here so the
  // "use my free cup" checkbox can flip between them without a round trip.
  const build = (startIndex) => {
    const out = [];
    let i = startIndex;
    if (available.weekly && units[i]) {
      out.push({
        key: 'weekly',
        label: `Cup gratis mingguan${tier.name ? ` (${tier.name})` : ''} — ${units[i].name}`,
        amount: units[i].price,
      });
      i += 1;
    }
    if (available.birthday && units[i]) {
      out.push({ key: 'birthday', label: `Cup gratis ulang tahun — ${units[i].name}`, amount: units[i].price });
      i += 1;
    }
    return out;
  };
  const withoutReward = build(0);
  const withReward = reward.available > 0 ? build(1) : withoutReward;
  const sum = (list) => list.reduce((total, line) => total + line.amount, 0);

  return {
    reward,
    membership: {
      tier: tier.name ? tier : null,
      percent: Number(tier.discountPercent) || 0,
      perks: { withReward, withoutReward },
      discount: { withReward: sum(withReward), withoutReward: sum(withoutReward) },
    },
  };
}

function saveCartCookie(res, cart) {
  setCookie(res, cartLib.COOKIE_NAME, cartLib.serializeCart(cart), { maxAge: cartLib.MAX_AGE_SECONDS });
}

// Product photos land in the PUBLIC blob store, so the type is checked here
// and not only by the file input's accept="" (which any client can ignore).
// Payment proofs are already checked the same way at checkout.
const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Uploads every photo picked in the (multiple) gallery input, in order.
async function uploadGalleryFiles(list) {
  const urls = [];
  for (const file of list || []) {
    if (!file || !file.buffer.length) continue;
    if (!PRODUCT_IMAGE_TYPES.includes(file.mimetype)) {
      const err = new Error('Format foto harus JPG, PNG atau WEBP.');
      err.userMessage = 'Format foto harus JPG, PNG atau WEBP.';
      throw err;
    }
    urls.push(await saveProductImage(file));
  }
  return urls;
}

// Videos arrive as URLs rather than bytes, because the browser uploaded them
// directly. A URL posted by a page is not evidence of anything, so each one
// has to earn its place in the gallery three times over:
//
//   1. it is shaped like a product video of ours (host, prefix, filename),
//   2. that pathname really exists in OUR public store — the token scopes the
//      lookup, so a blob in someone else's store can't pass,
//   3. the store's own metadata says it is a video within the size limit —
//      measured, a presigned URL enforces neither the type nor the ceiling, so
//      this is where both actually bite,
//   4. the bytes at the front of it are a real video container, whatever the
//      upload claimed the type was.
//
// Only an admin can reach these routes at all; this is the layer that stops a
// stale, forged or mistyped address from being written onto a product.
const MAX_NEW_VIDEOS = 6;

async function acceptVideoUrls(list) {
  const raw = (list || []).map((v) => String(v || '').trim()).filter(Boolean);
  if (!raw.length) return [];
  if (raw.length > MAX_NEW_VIDEOS) {
    const err = new Error('too many videos');
    err.userMessage = `Maksimal ${MAX_NEW_VIDEOS} video sekali simpan.`;
    throw err;
  }
  const out = [];
  for (const url of raw) {
    if (out.includes(url)) continue;
    const reject = (message) => {
      const err = new Error('bad video url');
      err.userMessage = message;
      throw err;
    };
    if (!media.isProductVideoUrl(url)) reject('Alamat video tidak dikenal, jadi videonya tidak disimpan.');

    const info = await productBlobInfo(media.blobPathname(url));
    if (!info.exists) reject('Video tidak ditemukan di penyimpanan. Coba unggah ulang.');
    if (info.size > media.MAX_VIDEO_BYTES) {
      const mb = Math.round(media.MAX_VIDEO_BYTES / 1024 / 1024);
      reject(`Video terlalu besar. Maksimal ${mb}MB.`);
    }
    // In practice the store types a blob from its pathname, and we mint every
    // pathname, so this is belt and braces rather than the real guard. The
    // real guard is the byte sniff on the next line.
    if (info.contentType && !media.PRODUCT_VIDEO_TYPES[info.contentType])
      reject('Berkas yang terunggah bukan video. Coba unggah ulang.');
    if (!(await media.looksLikeVideo(url)))
      reject('Berkas yang terunggah bukan video yang bisa diputar. Coba unggah ulang.');
    out.push(url);
  }
  return out;
}

// Which stockroom items a product form asked for, and how many of each per
// cup. Ignored entirely unless this admin may manage the stockroom, so saving
// a product can never silently wipe a materials list the person editing it was
// never shown.
function materialsFromForm(req, fieldLists, fields) {
  if (!req.can('inventaris.kelola')) return null;
  const chosen = fieldLists.bahan || [];
  return chosen.map((id) => ({ itemId: Number(id), qty: Number(fields[`bahanQty_${id}`]) || 1 }));
}

// Turns a typed list of dates into clean, sorted 'YYYY-MM-DD' keys. Anything
// that isn't a real date is dropped rather than stored and puzzled over later.
function cleanDateList(value) {
  const seen = new Set();
  for (const raw of String(value || '').split(/[\s,;]+/)) {
    const key = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (Number.isNaN(Date.parse(key + 'T00:00:00Z'))) continue;
    seen.add(key);
  }
  return [...seen].sort().join(',');
}

// One line telling a shopper which days the shop actually delivers on, for the
// calendar mode where the picker itself can't grey out the closed ones.
function closedDatesNote(shop) {
  const rules = shop.delivery;
  if (!rules || rules.everyDay) return '';
  const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  if (rules.days.size) {
    const open = [...rules.days].sort().map((d) => names[d]).join(', ');
    return `Pecup mengantar setiap ${open}. Tanggal lain akan ditolak saat dikirim.`;
  }
  return 'Beberapa tanggal sedang ditutup — kalau tanggalmu ditolak, pilih hari lain ya.';
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

// The two combination switches on the product form, and how many choices one
// cup of it takes. Read defensively: a combination whose maximum is below its
// minimum could never be completed, so the pair is sorted rather than trusted,
// and both ends are clamped to something a cup could plausibly hold.
function comboFields(fields, existing = null) {
  // A post that doesn't carry the range at all — an older page left open, or a
  // partial form — must not silently collapse "2 atau 3 buah" into "1 buah".
  // Absent means "unchanged", so the product keeps what it already had.
  const fallbackMin = Number(existing && existing.combo_min) || 2;
  const fallbackMax = Number(existing && existing.combo_max) || 3;
  const givenMin = String(fields.comboMin === undefined ? '' : fields.comboMin).trim() !== '';
  const givenMax = String(fields.comboMax === undefined ? '' : fields.comboMax).trim() !== '';
  const min = Math.min(Math.max(1, Math.round(givenMin ? Number(fields.comboMin) || 1 : fallbackMin)), 20);
  const max = Math.min(Math.max(min, Math.round(givenMax ? Number(fields.comboMax) || min : fallbackMax)), 20);
  return {
    comboEnabled: Boolean(fields.comboEnabled),
    comboOption: Boolean(fields.comboOption),
    comboMin: min,
    comboMax: max,
  };
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
  // Every page carries its stylesheet inline, so a cached page is a cached
  // stylesheet: after a deploy a phone can keep rendering the old layout until
  // its cache happens to turn over. These pages are cheap to generate and half
  // of them are personalised (cart, account, admin) — none should ever be
  // reused from a cache, shared or private.
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
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
      // notFound is also called from paths that never saw a request object.
      loyaltyOn: req ? req.loyaltyOn !== false : true,
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
      // Permissions come from the row, never from the token: a superadmin
      // taking an allowance away has to take effect on the very next request,
      // not whenever that person's cookie happens to expire.
      req.admin = current
        ? { ...req.admin, role: current.role, username: current.username, permissions: current.permissions }
        : null;
      // A feature switched off takes its permissions with it, so the sidebar
      // item, the pages and every POST route behind them vanish together
      // rather than each needing its own check. Settings are cached per
      // process and this only runs when an admin cookie is present, so the
      // storefront's hot path never pays for it.
      if (req.admin && !(await settings.loyaltyEnabled())) {
        req.admin = { ...req.admin, disabledKeys: permissions.LOYALTY_KEYS };
      }
    }
    req.isAdmin = Boolean(req.admin);
    req.isSuperadmin = Boolean(req.admin && req.admin.role === 'superadmin');
    req.can = (key) => permissions.has(req.admin, key);
    // One cached read, shared by every surface that has to know whether the
    // loyalty programme exists — the storefront footer, the sign-up copy, the
    // admin menu — so no two of them can disagree within the same request.
    req.loyaltyOn = await settings.loyaltyEnabled();
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
