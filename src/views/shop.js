const { page, customerHeader, customerFooter, backButton } = require('./layout');
const { productThumb, productPhotos } = require('./productIcon');
const { formatRupiah, escapeHtml, escapeAttr, toDateKey, formatDateID } = require('../utils');
const { discountLines, freeCupValue } = require('../orderMoney');

const DEFAULT_PRODUCT_DESCRIPTION = 'Buah potong segar, dipotong higienis dan dikemas rapi dalam cup.';

// Best Seller takes priority if a product is somehow flagged as both.
function productBadge(p) {
  if (p.is_bestseller) return { text: 'Best Seller', bg: 'var(--orange)' };
  if (p.is_recommended) return { text: 'Direkomendasikan', bg: 'var(--green)' };
  return null;
}

function badgeHtml(p, { top = 12, left = 12, scale = 1 } = {}) {
  const badge = productBadge(p);
  if (!badge) return '';
  const fontSize = (12.5 * scale).toFixed(1);
  const padY = (7 * scale).toFixed(0);
  const padX = (15 * scale).toFixed(0);
  return `<span style="position:absolute;top:${top}px;left:${left}px;z-index:2;background:${badge.bg};color:#fff;font-size:${fontSize}px;font-weight:800;letter-spacing:0.2px;padding:${padY}px ${padX}px;border-radius:99px;white-space:nowrap;box-shadow:0 4px 12px -3px rgba(0,0,0,0.3);text-shadow:0 1px 2px rgba(0,0,0,0.15);">${badge.text}</span>`;
}

// Nudge shown on a cart line that has a wholesale tier but hasn't reached it.
function wholesaleHint(product, qty) {
  const minQty = Number(product.wholesale_min_qty) || 0;
  const price = product.wholesale_price;
  if (!minQty || price === null || price === undefined || qty >= minQty) return '';
  return `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">Tambah ${minQty - qty} cup lagi → harga grosir ${formatRupiah(price)}/cup</div>`;
}

// Badge for the product card / detail page when a wholesale tier exists.
function wholesaleBadge(product) {
  const minQty = Number(product.wholesale_min_qty) || 0;
  const price = product.wholesale_price;
  if (!minQty || price === null || price === undefined) return '';
  return `<span style="display:inline-block;font-size:11.5px;font-weight:700;color:#7a4a1f;background:var(--orange-soft);padding:4px 10px;border-radius:99px;">Grosir ≥${minQty}: ${formatRupiah(price)}/cup</span>`;
}

const MINUS_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const PLUS_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

// Mirrors stepperMarkup() in layout.js. The exact stock level is deliberately
// NOT sent to the browser — it's competitive information, and shoppers don't
// need it. The server clamps every quantity change and reports back only
// whether the cap has been reached, so the "+" still greys out at the limit.
function qtyControl({ key, productId, stock, qty }) {
  const atMax = qty > 0 && qty >= stock;
  const inner =
    qty > 0
      ? `<span class="qty-stepper">
          <button class="qty-step" data-delta="-1" type="button" aria-label="Kurangi">${MINUS_ICON}</button>
          <span class="qty-value">${qty}</span>
          <button class="qty-step" data-delta="1" type="button" aria-label="Tambah"${
            atMax ? ' disabled title="Stok tidak mencukupi"' : ''
          }>${PLUS_ICON}</button>
        </span>`
      : `<button class="add-btn qty-step" data-delta="1" type="button" title="Tambah ke keranjang" style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;">${PLUS_ICON}</button>`;
  return `<div class="qty-control" data-key="${escapeAttr(key)}" data-product-id="${productId}" data-atmax="${
    atMax ? '1' : ''
  }" data-qty="${qty}">${inner}</div>`;
}

// Site-wide banner: "closed today", a holiday note, or a minimum-order
// reminder. Rendered above everything so it can't be missed.
function shopBanner(shop) {
  if (!shop) return '';
  if (!shop.open) {
    return `<div style="background:#f6dcdc;color:#a13f3f;padding:14px 20px;text-align:center;font-size:13.5px;font-weight:700;line-height:1.6;">
      ${escapeHtml(shop.notice || 'Pecup sedang tutup dan belum menerima pesanan. Sampai jumpa lagi nanti!')}
    </div>`;
  }
  if (shop.notice) {
    return `<div style="background:var(--orange-soft);color:#7a4a1f;padding:13px 20px;text-align:center;font-size:13.5px;font-weight:600;line-height:1.6;">
      ${escapeHtml(shop.notice)}
    </div>`;
  }
  return '';
}

function sortOptions(active) {
  const opts = [
    { value: '', label: 'Paling baru' },
    { value: 'murah', label: 'Harga termurah' },
    { value: 'mahal', label: 'Harga tertinggi' },
    { value: 'nama', label: 'Nama A–Z' },
  ];
  return opts
    .map((o) => `<option value="${o.value}" ${active === o.value ? 'selected' : ''}>${o.label}</option>`)
    .join('');
}

function renderBeranda({
  products,
  cartCount,
  category,
  categories: dbCategories = [],
  cart = {},
  customer = null,
  shop = null,
  search = '',
  sort = '',
  totalProducts = 0,
}) {
  const categories = ['Semua', ...dbCategories];
  const chips = categories
    .map((c) => {
      const isActive = (category || 'Semua') === c;
      const href = c === 'Semua' ? '/' : `/?kategori=${encodeURIComponent(c)}`;
      return `<a class="chip ${isActive ? 'chip-active' : ''}" href="${href}" style="padding:11px 22px;border-radius:99px;font-size:14px;font-weight:600;display:inline-block;${
        isActive ? '' : 'color:var(--text);'
      }">${escapeHtml(c)}</a>`;
    })
    .join('');

  const cards = products.length
    ? products
        .map((p) => {
          const isMix = p.category === 'Mix Buah';
          const inStock = p.stock > 0;
          // A mix is configured on its own page (which 2-3 fruits), so it
          // can't be stepped up and down from the card.
          const action = !inStock
            ? `<button class="add-btn" type="button" disabled style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;opacity:0.5;cursor:not-allowed;" title="Stok habis">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>`
            : isMix
            ? `<a href="/produk/${p.id}" class="add-btn" style="height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 14px;font-size:12.5px;font-weight:700;white-space:nowrap;">Pilih Buah</a>`
            : qtyControl({
                key: String(p.id),
                productId: p.id,
                stock: Number(p.stock) || 0,
                qty: Number((cart[String(p.id)] || {}).qty) || 0,
              });
          // The photo box and the name block are fixed-height, and the price
          // row is pushed down with .p-card-foot, so every card in the grid
          // lines up regardless of name length or whether it has a badge.
          return `
      <div class="p-card" style="position:relative;border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:14px;">
        <a href="/produk/${p.id}" style="position:absolute;inset:0;z-index:1;" aria-label="${escapeAttr(p.name)}"></a>
        <div style="aspect-ratio:1;position:relative;flex-shrink:0;">${badgeHtml(p)}${productThumb(p)}</div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start;">
          <span class="p-card-name">${escapeHtml(p.name)}</span>
          <span style="font-size:12.5px;color:var(--text-muted);">Cup ${escapeHtml(p.weight)}</span>
          ${wholesaleBadge(p)}
        </div>
        <div class="p-card-foot" style="display:flex;align-items:center;justify-content:space-between;padding-top:4px;gap:10px;">
          <span class="tnum" style="font-size:16.5px;font-weight:800;color:var(--green-dark);">${formatRupiah(p.price)}</span>
          <div style="position:relative;z-index:2;">${action}</div>
        </div>
      </div>`;
        })
        .join('')
    : `<p style="color:var(--text-muted);font-size:14px;">Belum ada produk pada kategori ini.</p>`;

  const body = `
<div class="frame-scroll"><div class="frame">
  ${shopBanner(shop)}
  ${customerHeader(cartCount, null, customer)}

  <section class="hero px-page" id="konten" style="padding-top:88px;padding-bottom:72px;">
    <div class="hero-copy">
      <div style="display:inline-flex;align-items:center;gap:8px;background:var(--green-soft);color:var(--green-dark);padding:8px 16px;border-radius:99px;font-size:13px;font-weight:600;width:fit-content;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        100% Buah Segar Pilihan Hari Ini
      </div>
      <h1 class="hero-title">Buah Potong Segar, Siap Santap Tanpa Ribet</h1>
      <p style="font-size:17px;line-height:1.7;color:var(--text-muted);max-width:480px;">Dipotong higienis dan dikemas rapi dalam cup, langsung dari Pecup ke meja kamu. Pesan sekarang, transfer, tinggal tunggu paket buah segar sampai.</p>
      <div style="display:flex;gap:14px;margin-top:6px;">
        <a href="#menu" class="btn-primary" style="padding:16px 30px;border-radius:14px;font-size:15px;font-weight:700;display:inline-block;">Lihat Menu Buah</a>
      </div>
    </div>
    <div class="hero-art">
      <svg viewBox="0 0 120 120">
        <ellipse cx="60" cy="40" rx="34" ry="9" fill="#ffffff" stroke="#00000018" stroke-width="2"/>
        <path d="M28 41 L92 41 L82 104 L38 104 Z" fill="#ffffff" fill-opacity="0.95" stroke="#00000018" stroke-width="2"/>
        <circle cx="48" cy="58" r="8" fill="#e88a3a"/><rect x="62" y="52" width="13" height="13" rx="3" fill="#c94f4f"/>
        <circle cx="70" cy="75" r="7" fill="#58a05c"/><rect x="44" y="76" width="11" height="11" rx="3" fill="#e0b23c"/>
        <path d="M88 36 L100 12" stroke="#3a3a3f" stroke-width="3.4" stroke-linecap="round"/>
        <ellipse cx="102" cy="9" rx="5.5" ry="7.5" fill="#3a3a3f" transform="rotate(22 102 9)"/>
      </svg>
    </div>
  </section>

  <section id="menu" class="px-page chip-bar">
    <span class="chip-bar-label">Kategori</span>
    <div class="chip-bar-list">${chips}</div>
  </section>

  <section class="px-page" style="padding-top:40px;padding-bottom:100px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px;">
      <div>
        <span class="eyebrow">Segar hari ini</span>
        <h2 class="section-title" style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">Menu Hari Ini</h2>
        <p style="color:var(--text-muted);font-size:14.5px;margin-top:8px;">
          ${
            search
              ? `${products.length} hasil untuk &ldquo;<strong>${escapeHtml(search)}</strong>&rdquo;`
              : `${products.length} produk tersedia${category && category !== 'Semua' ? ` di kategori ${escapeHtml(category)}` : ''}`
          }
        </p>
      </div>
      <form method="get" action="/" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        ${category && category !== 'Semua' ? `<input type="hidden" name="kategori" value="${escapeAttr(category)}">` : ''}
        <div style="position:relative;display:flex;align-items:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" style="position:absolute;left:13px;pointer-events:none;"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="search" name="cari" value="${escapeAttr(search)}" placeholder="Cari buah…"
                 style="width:200px;padding:11px 14px 11px 38px;font-size:14px;border-radius:99px;">
        </div>
        <select name="urut" onchange="this.form.submit()" style="width:auto;padding:11px 14px;font-size:14px;border-radius:99px;">
          ${sortOptions(sort)}
        </select>
        <button type="submit" class="btn-outline" style="padding:11px 20px;border-radius:99px;font-size:14px;font-weight:700;">Cari</button>
        ${
          search || sort
            ? `<a href="${category && category !== 'Semua' ? `/?kategori=${encodeURIComponent(category)}` : '/'}#menu" style="font-size:13px;font-weight:600;">Reset</a>`
            : ''
        }
      </form>
    </div>
    ${
      products.length === 0 && search
        ? `<div style="text-align:center;padding:56px 20px;background:var(--surface);border:1px solid var(--border);border-radius:20px;">
            <div style="font-size:38px;margin-bottom:10px;">🍉</div>
            <h3 style="font-size:18px;font-weight:800;margin-bottom:8px;">Tidak ketemu</h3>
            <p style="font-size:14px;color:var(--text-muted);line-height:1.7;max-width:340px;margin:0 auto;">Tidak ada produk yang cocok dengan &ldquo;${escapeHtml(search)}&rdquo;. Coba kata lain, atau lihat semua ${totalProducts} produk kami.</p>
            <a href="/#menu" class="btn-primary" style="display:inline-block;margin-top:18px;padding:13px 26px;border-radius:12px;font-size:14px;font-weight:700;">Lihat Semua Produk</a>
          </div>`
        : `<div class="grid-4">${cards}</div>`
    }
    ${
      shop && shop.minOrder > 0
        ? `<p style="margin-top:26px;font-size:13px;color:var(--text-muted);text-align:center;">Minimal belanja ${formatRupiah(shop.minOrder)} per pesanan.${
            shop.freeDeliveryOver > 0 ? ` Gratis ongkir untuk belanja di atas ${formatRupiah(shop.freeDeliveryOver)}.` : ''
          }</p>`
        : shop && shop.freeDeliveryOver > 0
        ? `<p style="margin-top:26px;font-size:13px;color:var(--text-muted);text-align:center;">Gratis ongkir untuk belanja di atas ${formatRupiah(shop.freeDeliveryOver)}.</p>`
        : ''
    }
  </section>

  <section id="cara-pesan" class="px-page" style="background:var(--surface-2);padding-top:72px;padding-bottom:72px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">
    <div style="text-align:center;margin-bottom:48px;">
      <span class="eyebrow" style="justify-content:center;">Gampang banget</span>
      <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.4px;">Cara Pesan di Pecup</h2>
    </div>
    <div class="grid-3" style="max-width:1100px;margin:0 auto;">
      ${[
        ['Pilih &amp; Tambah ke Keranjang', 'Pilih buah potong favoritmu dan atur jumlahnya.'],
        ['Checkout &amp; Transfer', 'Isi data pemesan, tambahkan catatan bila perlu, lalu transfer.'],
        ['Upload Bukti &amp; Tunggu Konfirmasi', 'Kami verifikasi dan konfirmasi via WhatsApp.'],
      ]
        .map(
          ([title, text], i) => `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;">
        <div class="step-num">${i + 1}</div>
        <h4 style="font-size:16px;font-weight:700;">${title}</h4>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;max-width:260px;">${text}</p>
      </div>`
        )
        .join('')}
    </div>
  </section>

  ${customerFooter()}
</div></div>`;

  return page({ title: 'Pecup — Buah Potong Segar', bodyHtml: body });
}

function renderProdukDetail({ product, related, cartCount, singleFruits = [], customer = null }) {
  const relatedCards = related
    .map(
      (p) => `
      <a href="/produk/${p.id}" class="mini-card" style="border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:10px;text-decoration:none;">
        <div style="aspect-ratio:1;">${productThumb(p, { size: 64 })}</div>
        <span style="font-size:14.5px;font-weight:700;color:var(--text);">${escapeHtml(p.name)}</span>
        <span style="font-size:15px;font-weight:800;color:var(--green-dark);">${formatRupiah(p.price)}</span>
      </a>`
    )
    .join('');

  const inStock = product.stock > 0;
  const isMix = product.category === 'Mix Buah' && singleFruits.length > 0;

  const mixPicker = isMix
    ? `
      <div class="card" style="padding:20px;">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:4px;">Pilih Buahmu</h3>
        <p id="mixCounter" style="font-size:12.5px;color:var(--text-muted);margin-bottom:14px;">Pilih 2 atau 3 buah — 0 dipilih</p>
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:10px;">
          ${singleFruits
            .map(
              (f) => `
          <label style="display:flex;align-items:center;gap:8px;border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font-size:13.5px;font-weight:600;cursor:pointer;">
            <input type="checkbox" class="mix-fruit-box" value="${f.id}" style="width:16px;height:16px;flex-shrink:0;">
            ${escapeHtml(f.name)}
          </label>`
            )
            .join('')}
        </div>
      </div>`
    : '';

  const addForm = `
      <form method="post" action="/keranjang/tambah" id="addToCartForm" style="display:flex;flex-direction:column;gap:16px;margin-top:8px;">
        ${mixPicker}
        <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
          <input type="hidden" name="productId" value="${product.id}">
          ${isMix ? '<input type="hidden" name="fruitIds" id="fruitIdsInput" value="">' : ''}
          <select name="qty" style="width:90px;padding:12px 10px;">
            ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n}</option>`).join('')}
          </select>
          <button class="btn-primary" type="submit" id="addToCartBtn" ${inStock ? '' : 'disabled'} style="flex:1;padding:16px 24px;border-radius:12px;font-size:15px;font-weight:700;max-width:280px;">
            ${inStock ? 'Tambah ke Keranjang' : 'Stok Habis'}
          </button>
        </div>
      </form>
      ${
        isMix
          ? `<script>
      (function(){
        var boxes = Array.prototype.slice.call(document.querySelectorAll('.mix-fruit-box'));
        var counter = document.getElementById('mixCounter');
        var hidden = document.getElementById('fruitIdsInput');
        var btn = document.getElementById('addToCartBtn');
        function update(){
          var checked = boxes.filter(function(b){ return b.checked; });
          boxes.forEach(function(b){ b.disabled = !b.checked && checked.length >= 3; });
          counter.textContent = 'Pilih 2 atau 3 buah — ' + checked.length + ' dipilih';
          hidden.value = checked.map(function(b){ return b.value; }).join(',');
          btn.disabled = checked.length < 2 || checked.length > 3;
        }
        boxes.forEach(function(b){ b.addEventListener('change', update); });
        update();
      })();
      </script>`
          : ''
      }`;

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, null, customer)}
  <div class="px-page" style="padding-top:24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
    ${backButton('/#menu', 'Kembali ke Menu')}
    <div style="font-size:13.5px;color:var(--text-muted);">
      <a href="/">Beranda</a> &nbsp;/&nbsp; <a href="/#menu">Menu</a> &nbsp;/&nbsp; <span style="color:var(--text);">${escapeHtml(product.name)}</span>
    </div>
  </div>

  <section class="detail-layout px-page" id="konten" style="padding-top:32px;padding-bottom:72px;">
    <div class="detail-img" style="position:relative;">${badgeHtml(product, { top: 12, left: 12 })}${productThumb(product, { size: 200, radius: 28, autoplay: true })}</div>

    <div class="detail-info">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:700;color:var(--green-dark);background:var(--green-soft);padding:5px 12px;border-radius:99px;width:fit-content;">${escapeHtml(product.category)}</span>
        ${
          productBadge(product)
            ? `<span style="font-size:13px;font-weight:700;color:#fff;background:${productBadge(product).bg};padding:5px 12px;border-radius:99px;width:fit-content;">${productBadge(product).text}</span>`
            : ''
        }
      </div>
      <h1 style="font-size:clamp(24px, 4vw, 34px);font-weight:800;letter-spacing:-0.5px;">${escapeHtml(product.name)} Cup</h1>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <span style="font-size:26px;font-weight:800;color:var(--green-dark);">${formatRupiah(product.price)}</span>
        <span style="font-size:13.5px;color:var(--text-muted);">/ cup ${escapeHtml(product.weight)}</span>
        ${wholesaleBadge(product)}
        <span style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:${inStock ? '#58a05c' : '#a13f3f'};background:${inStock ? 'var(--green-soft)' : '#f6dcdc'};padding:5px 12px;border-radius:99px;">
          <svg width="9" height="9" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${inStock ? '#58a05c' : '#a13f3f'}"/></svg>
          ${inStock ? (product.stock <= 5 ? 'Tinggal Sedikit' : 'Stok Tersedia') : 'Stok Habis'}
        </span>
      </div>
      <p style="font-size:15px;line-height:1.8;color:var(--text-muted);max-width:480px;">${escapeHtml(product.description)}</p>

      ${addForm}

      <div style="display:flex;align-items:center;gap:10px;margin-top:10px;background:var(--surface-2);padding:14px 18px;border-radius:12px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/></svg>
        <span style="font-size:13px;color:var(--text-muted);">Dikemas dingin pagi hari — paling enak dikonsumsi dalam 24 jam.</span>
      </div>
    </div>
  </section>

  ${
    related.length
      ? `<section class="px-page" style="padding-bottom:96px;">
    <h3 style="font-size:20px;font-weight:800;margin-bottom:24px;">Produk Lainnya</h3>
    <div class="grid-4">${relatedCards}</div>
  </section>`
      : ''
  }
  ${customerFooter()}
</div></div>`;

  // Structured data so a search result can show the price and whether it's in
  // stock. JSON.stringify handles the escaping; the closing-tag guard stops a
  // product name containing "</script>" from breaking out of the block.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${product.name} Cup`,
    description: product.description || DEFAULT_PRODUCT_DESCRIPTION,
    category: product.category,
    image: productPhotos(product),
    brand: { '@type': 'Brand', name: 'Pecup' },
    offers: {
      '@type': 'Offer',
      price: Number(product.price) || 0,
      priceCurrency: 'IDR',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  }).replace(/</g, '\\u003c');

  return page({
    title: `${product.name} Cup — Pecup`,
    bodyHtml: body,
    description: product.description
      ? `${product.name} — ${product.description}`
      : `${product.name} cup ${product.weight}, buah potong segar dari Pecup.`,
    image: productPhotos(product)[0] || '/assets/pecup-logo.png',
    extraHead: `<script type="application/ld+json">${jsonLd}</script>`,
  });
}

function stepHeader(activeIndex) {
  const steps = ['Keranjang', 'Checkout', 'Selesai'];
  const html = steps
    .map((s, i) => {
      const n = i + 1;
      const color = n === activeIndex ? 'var(--green-dark)' : n < activeIndex ? 'var(--green-dark)' : 'var(--text-muted)';
      return `<span style="color:${color};">${n}. ${s}</span>${i < steps.length - 1 ? '<span style="color:var(--border);">—</span>' : ''}`;
    })
    .join('');
  return html;
}

function renderKeranjang({ items, subtotal, cartCount, customer = null }) {
  const rows = items.length
    ? items
        .map(
          (it) => `
      <div class="cart-row" data-cart-row>
        <div class="cart-row-thumb">${productThumb(it.product, { size: 48, radius: 14 })}</div>
        <div class="cart-row-name">
          <div style="font-size:16px;font-weight:700;">${escapeHtml(it.product.name)}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">Cup ${escapeHtml(it.product.weight)}</div>
          ${
            it.fruits.length
              ? `<div style="font-size:12.5px;color:var(--green-dark);margin-top:4px;font-weight:600;">${it.fruits.map((f) => escapeHtml(f.name)).join(' + ')}</div>`
              : ''
          }
          ${
            it.isWholesale
              ? `<div style="font-size:12px;color:#7a4a1f;background:var(--orange-soft);padding:3px 9px;border-radius:99px;margin-top:6px;display:inline-block;font-weight:700;">Harga grosir ${formatRupiah(it.unitPrice)}/cup · hemat ${formatRupiah(it.savings)}</div>`
              : wholesaleHint(it.product, it.qty)
          }
        </div>
        <div class="cart-row-qty">
          ${qtyControl({
            key: it.key,
            productId: it.product.id,
            stock: Number(it.product.stock) || 0,
            qty: it.qty,
          })}
        </div>
        <div class="cart-row-total" data-line-total>${formatRupiah(it.subtotal)}</div>
        <form method="post" action="/keranjang/hapus">
          <input type="hidden" name="key" value="${escapeAttr(it.key)}">
          <button class="trash-btn" type="submit" style="padding:6px;"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9a9a9f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
        </form>
      </div>`
        )
        .join('')
    : `<p style="color:var(--text-muted);font-size:14px;padding:40px 0;">Keranjang kamu masih kosong. <a href="/">Mulai belanja →</a></p>`;

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, stepHeader(1), customer)}
  <section class="px-page" style="padding-top:48px;padding-bottom:100px;">
    ${backButton('/', 'Lanjut Belanja')}
    <h1 style="font-size:26px;font-weight:800;margin-bottom:6px;margin-top:20px;">Keranjang Belanja</h1>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:30px;"><span data-cart-itemcount>${items.length} produk</span> di keranjang</p>
    <div class="split-layout">
      <div class="split-main">
        ${rows}
      </div>
      <div class="split-side">
        <h3 style="font-size:18px;font-weight:800;margin-bottom:22px;">Ringkasan Pesanan</h3>
        <div style="display:flex;justify-content:space-between;font-size:14.5px;color:var(--text-muted);margin-bottom:12px;"><span>Subtotal</span><span style="color:var(--text);font-weight:600;" data-cart-subtotal>${formatRupiah(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;padding-top:16px;border-top:1px solid var(--border);margin-bottom:24px;"><span>Total</span><span style="color:var(--green-dark);" data-cart-total>${formatRupiah(subtotal)}</span></div>
        ${
          items.length
            ? `<a href="/checkout" class="btn-primary" style="display:block;text-align:center;width:100%;padding:16px;border-radius:12px;font-size:15px;font-weight:700;">Lanjut ke Checkout</a>`
            : `<button class="btn-primary" disabled style="width:100%;padding:16px;border-radius:12px;font-size:15px;font-weight:700;">Lanjut ke Checkout</button>`
        }
      </div>
    </div>
  </section>
  ${customerFooter()}
</div></div>`;

  return page({ title: 'Keranjang — Pecup', bodyHtml: body, noindex: true });
}

function renderCheckout({
  items,
  subtotal,
  cartCount,
  errors = [],
  formValues = {},
  customer = null,
  reward = { available: 0, discount: 0, itemName: null },
  membership = { tier: null, percent: 0, perks: { withReward: [], withoutReward: [] }, discount: { withReward: 0, withoutReward: 0 } },
  useReward = false,
  shop = { open: true, notice: '', minOrder: 0, deliveryFee: 0, freeDeliveryOver: 0, sameDayCutoff: '' },
  voucher = { applied: false, code: '', discount: 0, error: '', label: '' },
  totals = null,
  deliveryFee = 0,
}) {
  const rewardOn = Boolean(useReward) && reward.available > 0;
  const rewardCut = rewardOn ? reward.discount : 0;
  const activeVoucher =
    totals && rewardOn && totals.voucherWithReward ? totals.voucherWithReward : totals ? totals.voucherWithoutReward : voucher;
  const voucherCut = activeVoucher.applied ? activeVoucher.discount : 0;
  const payable = totals ? (rewardOn ? totals.withReward : totals.withoutReward) : Math.max(0, subtotal - rewardCut - voucherCut) + deliveryFee;
  const belowMinimum = shop.minOrder > 0 && subtotal < shop.minOrder;
  // Both totals precomputed server-side so ticking the free-cup box updates
  // the number instantly and still matches what will actually be charged.
  const totalFull = totals ? totals.withoutReward : Math.max(0, subtotal - voucherCut) + deliveryFee;
  const totalDiscounted = totals ? totals.withReward : Math.max(0, subtotal - reward.discount - voucherCut) + deliveryFee;

  // Membership perks. Which cup each free perk waives shifts depending on
  // whether the stamp-card cup is also being used (they take the cheapest
  // cups in turn), so — like the total — both versions are rendered and the
  // checkbox swaps between them without a round trip.
  const perkCount = Math.max(membership.perks.withReward.length, membership.perks.withoutReward.length);
  const perkRows = Array.from({ length: perkCount }, (unused, i) => {
    const on = membership.perks.withReward[i];
    const off = membership.perks.withoutReward[i];
    const active = rewardOn ? on : off;
    // A perk can drop out entirely in one of the two states — a one-cup order
    // has nothing left to waive once the stamp-card cup takes it.
    return `<div style="display:${active ? 'flex' : 'none'};justify-content:space-between;gap:12px;font-size:13.5px;padding:10px 0;color:var(--green-dark);font-weight:700;"
                 data-perk-row data-full-amount="${off ? off.amount : 0}" data-discounted-amount="${on ? on.amount : 0}">
      <span data-perk-label data-full="${escapeAttr(off ? off.label : '')}" data-discounted="${escapeAttr(on ? on.label : '')}">${escapeHtml(active ? active.label : '')}</span>
      <span class="tnum" style="white-space:nowrap;" data-perk-amount
            data-full="${escapeAttr(`− ${formatRupiah(off ? off.amount : 0)}`)}"
            data-discounted="${escapeAttr(`− ${formatRupiah(on ? on.amount : 0)}`)}">− ${formatRupiah(active ? active.amount : 0)}</span>
    </div>`;
  }).join('');
  const tierCutNow = totals ? (rewardOn ? totals.tierWith : totals.tierWithout) : 0;
  const tierRow =
    membership.percent > 0 && totals && (totals.tierWith > 0 || totals.tierWithout > 0)
      ? `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13.5px;padding:4px 0;color:var(--green-dark);font-weight:700;">
          <span>Diskon member ${escapeHtml((membership.tier && membership.tier.name) || '')} (${membership.percent}%)</span>
          <span class="tnum" style="white-space:nowrap;" data-tier-cut
                data-full="${escapeAttr(`− ${formatRupiah(totals.tierWithout)}`)}"
                data-discounted="${escapeAttr(`− ${formatRupiah(totals.tierWith)}`)}">− ${formatRupiah(tierCutNow)}</span>
        </div>`
      : '';
  const summaryRows = items
    .map(
      (it) => `
    <div style="display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);">${escapeHtml(it.product.name)}${it.fruits.length ? ` <span style="color:var(--green-dark);">(${it.fruits.map((f) => escapeHtml(f.name)).join(', ')})</span>` : ''} <span style="color:var(--text);font-weight:600;">×${it.qty}</span></span>
      <span style="font-weight:600;white-space:nowrap;">${formatRupiah(it.subtotal)}</span>
    </div>`
    )
    .join('');

  const errorHtml = errors.length
    ? `<div class="flash flash-error">${errors.map((e) => escapeHtml(e)).join('<br>')}</div>`
    : '';
  const todayKey = toDateKey(new Date());

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, stepHeader(2), customer)}
  <section class="px-page" style="padding-top:48px;padding-bottom:100px;">
    ${backButton('/keranjang', 'Kembali ke Keranjang')}
    <h1 style="font-size:26px;font-weight:800;margin-bottom:30px;margin-top:20px;">Checkout Pesanan</h1>
    ${errorHtml}
    <form method="post" action="/checkout" enctype="multipart/form-data">
      <div class="split-layout">
        <div class="split-main" style="gap:24px;">
          ${
            customer
              ? `<div style="display:flex;align-items:center;gap:10px;background:var(--green-soft);border-radius:12px;padding:14px 16px;font-size:13.5px;color:var(--green-dark);line-height:1.6;">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 6L9 17l-5-5"/></svg>
                  <span>Data di bawah terisi otomatis dari akunmu. Pesanan ini juga menambah stempelmu setelah selesai.</span>
                </div>`
              : `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--surface-2);border-radius:12px;padding:14px 18px;">
                  <span style="font-size:13.5px;color:var(--text-muted);line-height:1.6;">Lanjut sebagai tamu saja juga boleh — akun cuma untuk isi otomatis &amp; kumpul stempel.</span>
                  <a href="/masuk?next=/checkout" class="btn-outline" style="padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;white-space:nowrap;">Masuk / Daftar</a>
                </div>`
          }

          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:20px;">Data Pemesan</h3>
            <div class="field"><label>Nama Lengkap <span class="req">*</span></label><input type="text" name="customerName" required value="${escapeAttr(formValues.customerName || '')}" placeholder="Contoh: Alexander Dwiono"></div>
            <div class="field">
              <label>Nomor WhatsApp <span class="req">*</span></label>
              <input type="tel" name="whatsapp" required inputmode="numeric" autocomplete="tel" pattern="[0-9+][0-9 .()\\-]{8,19}" title="Masukkan nomor WhatsApp yang valid, contoh: 081234567890" value="${escapeAttr(formValues.whatsapp || '')}" placeholder="Contoh: 081234567890">
              <span style="font-size:12px;color:var(--text-muted);display:block;margin-top:6px;">Nomor aktif — kami pakai untuk konfirmasi pesanan.</span>
            </div>
            <div style="margin-bottom:0;"><label>Catatan Pesanan (opsional)</label><textarea name="notes" rows="3" placeholder="Contoh: tolong pepaya-nya diganti semangka, kurangi manis">${escapeHtml(formValues.notes || '')}</textarea></div>
          </div>

          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;">Pengantaran</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">Kapan dan ke mana pesananmu diantar.</p>
            <div class="field">
              <label>Tanggal Pengantaran <span class="req">*</span></label>
              <input type="date" name="deliveryDate" required min="${todayKey}" value="${escapeAttr(formValues.deliveryDate || '')}">
            </div>
            <div style="margin-bottom:0;">
              <label>Lokasi Pengantaran <span class="req">*</span></label>
              <input type="text" name="address" required maxlength="200" value="${escapeAttr(formValues.address || '')}" placeholder="Contoh: Kantor BCA Sudirman lt. 5, atau Kos Melati no. 12">
              <span style="font-size:12px;color:var(--text-muted);display:block;margin-top:6px;">Cukup nama kantor/tempat dan patokannya — tidak perlu alamat lengkap.</span>
            </div>
          </div>

          ${
            reward.available > 0
              ? `<label style="display:flex;align-items:flex-start;gap:12px;background:var(--green-soft);border:1.5px solid var(--green);border-radius:14px;padding:16px 18px;cursor:pointer;margin:0;">
                  <input type="checkbox" name="useReward" value="1" ${rewardOn ? 'checked' : ''} id="useRewardBox" style="width:20px;height:20px;margin-top:1px;flex-shrink:0;">
                  <span>
                    <span style="display:block;font-size:14.5px;font-weight:800;color:var(--green-dark);">Pakai 1 cup gratis</span>
                    <span style="display:block;font-size:13px;color:var(--green-dark);line-height:1.6;margin-top:4px;">
                      Kamu punya <strong>${reward.available}</strong> cup gratis. Yang digratiskan cup termurah di pesanan ini${
                        reward.itemName ? ` — <strong>${escapeHtml(reward.itemName)}</strong> (${formatRupiah(reward.discount)})` : ''
                      }.
                    </span>
                  </span>
                </label>`
              : ''
          }

          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;">Punya Kode Promo?</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Masukkan kodenya lalu klik Pakai untuk melihat potongannya.</p>
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
              <input type="text" name="voucherCode" id="voucherInput" value="${escapeAttr(formValues.voucherCode || '')}"
                     placeholder="Contoh: HEMAT10" maxlength="24" autocapitalize="characters" autocomplete="off"
                     style="flex:1 1 180px;text-transform:uppercase;">
              <button type="button" id="applyVoucherBtn" class="btn-outline"
                      style="padding:13px 22px;border-radius:11px;font-size:14px;font-weight:700;white-space:nowrap;">Pakai</button>
            </div>
            ${
              activeVoucher.applied
                ? `<div style="display:flex;align-items:center;gap:9px;margin-top:14px;background:var(--green-soft);border-radius:10px;padding:12px 14px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 6L9 17l-5-5"/></svg>
                    <span style="font-size:13px;color:var(--green-dark);font-weight:600;">Kode <strong>${escapeHtml(activeVoucher.code)}</strong> dipakai${
                      activeVoucher.label ? ` — ${escapeHtml(activeVoucher.label)}` : ''
                    }. Hemat ${formatRupiah(activeVoucher.discount)}.</span>
                  </div>`
                : activeVoucher.error
                ? `<div style="margin-top:14px;background:#f6dcdc;border-radius:10px;padding:12px 14px;font-size:13px;color:#a13f3f;font-weight:600;">${escapeHtml(activeVoucher.error)}</div>`
                : ''
            }
          </div>

          <div id="paymentSection" ${payable <= 0 ? 'hidden' : ''} style="display:flex;flex-direction:column;gap:24px;">
          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;">Info Pembayaran — QRIS</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">Scan kode QRIS di bawah dengan aplikasi e-wallet, m-banking, atau QRIS apa pun sesuai total pesanan, lalu unggah buktinya.</p>
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;background:var(--surface-2);border-radius:12px;padding:20px;">
              <img src="/assets/qris-payment.jpg" alt="QRIS Pecup, Makanan &amp; Minuman" style="width:100%;max-width:260px;border-radius:12px;border:1px solid var(--border);background:#fff;">
              <span style="font-size:12.5px;color:var(--text-muted);text-align:center;">Pecup, Makanan &amp; Minuman — QRIS Standar Pembayaran Nasional</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;background:var(--orange-soft);border-radius:12px;padding:14px 16px;margin-top:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                <span style="font-size:13px;color:#7a4a1f;font-weight:600;">Transfer tepat sejumlah</span>
                <span style="font-size:17px;font-weight:800;color:#7a4a1f;" data-total data-full="${escapeAttr(formatRupiah(totalFull))}" data-discounted="${escapeAttr(
                  formatRupiah(totalDiscounted)
                )}">${formatRupiah(payable)}</span>
              </div>
              <span style="font-size:12.5px;color:#7a4a1f;line-height:1.6;">Jangan dibulatkan — jumlah harus sama persis supaya pesananmu bisa langsung diverifikasi. Gunakan nama <strong>kamu sendiri</strong> sebagai nama pengirim/pembayar (bukan nama orang lain), sesuai Nama Lengkap di atas.</span>
            </div>
          </div>

          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;">Upload Bukti Transfer <span class="req">*</span></h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">Format JPG, PNG, atau PDF, maksimal 4MB.</p>
            <div class="dropzone" style="padding:24px;">
              <input type="file" name="proof" accept="image/jpeg,image/png,application/pdf" ${payable > 0 ? 'required' : ''} style="border:none;padding:0;background:transparent;">
            </div>
          </div>
          </div>

          <div id="freeOrderNote" ${payable > 0 ? 'hidden' : ''} class="card" style="background:var(--green-soft);border-color:var(--green);">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;color:var(--green-dark);">Pesanan Ini Gratis</h3>
            <p style="font-size:13.5px;color:var(--green-dark);line-height:1.7;margin:0;">Cup gratismu menutup seluruh pesanan ini, jadi tidak perlu transfer atau unggah bukti. Tinggal kirim pesanannya.</p>
          </div>

          <button class="btn-primary" type="submit" style="width:100%;padding:17px;border-radius:12px;font-size:15.5px;font-weight:700;">Kirim Pesanan Sekarang</button>
          <p style="font-size:12.5px;color:var(--text-muted);text-align:center;line-height:1.6;">Dengan mengirim pesanan, data di atas beserta bukti transfer akan otomatis terkirim melalui email ke tim Pecup untuk diverifikasi.</p>
        </div>

        <div class="split-side">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:20px;">Ringkasan Pesanan</h3>
          ${summaryRows}
          ${
            reward.available > 0
              ? `<div id="rewardRow" style="display:${rewardOn ? 'flex' : 'none'};justify-content:space-between;gap:12px;font-size:13.5px;padding:10px 0;color:var(--green-dark);font-weight:700;">
                  <span>Cup gratis (${escapeHtml(reward.itemName || '')})</span>
                  <span style="white-space:nowrap;">− ${formatRupiah(reward.discount)}</span>
                </div>`
              : ''
          }
          ${perkRows}
          <div style="display:flex;justify-content:space-between;gap:12px;font-size:13.5px;padding:10px 0;color:var(--text-muted);">
            <span>Subtotal</span><span class="tnum">${formatRupiah(subtotal)}</span>
          </div>
          ${tierRow}
          ${
            activeVoucher.applied
              ? `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13.5px;padding:4px 0;color:#a15a1f;font-weight:700;">
                  <span>Voucher ${escapeHtml(activeVoucher.code)}</span>
                  <span class="tnum" style="white-space:nowrap;">&minus; ${formatRupiah(activeVoucher.discount)}</span>
                </div>`
              : ''
          }
          ${
            deliveryFee > 0
              ? `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13.5px;padding:4px 0;color:var(--text-muted);">
                  <span>Ongkos antar</span><span class="tnum">${formatRupiah(deliveryFee)}</span>
                </div>`
              : shop.deliveryFee > 0
              ? `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13.5px;padding:4px 0;color:var(--green-dark);font-weight:700;">
                  <span>Ongkos antar</span><span>GRATIS</span>
                </div>`
              : ''
          }
          <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;padding-top:18px;margin-bottom:20px;border-top:1px solid var(--border);">
            <span>Total</span>
            <span class="tnum" style="color:var(--green-dark);" data-total data-full="${escapeAttr(formatRupiah(totalFull))}" data-discounted="${escapeAttr(
              formatRupiah(totalDiscounted)
            )}">${formatRupiah(payable)}</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:10px;background:var(--surface-2);padding:14px;border-radius:12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8" style="flex-shrink:0;margin-top:2px;"><path d="M4 4h16v12H8l-4 4z"/></svg>
            <span style="font-size:12.5px;color:var(--text-muted);line-height:1.6;">Pesanan otomatis terkirim ke email toko begitu kamu klik "Kirim Pesanan".</span>
          </div>
        </div>
      </div>
    </form>
  </section>
  ${customerFooter()}
</div></div>
<script>
// "Pakai" re-loads checkout with ?voucher=CODE so the server can validate the
// code and price it. Deliberately a round-trip, not a client-side guess: the
// discount rules live in one place.
(function(){
  var btn = document.getElementById('applyVoucherBtn');
  var input = document.getElementById('voucherInput');
  if(!btn || !input) return;
  function apply(){
    var code = (input.value || '').trim().toUpperCase();
    var url = new URL(window.location.href);
    if(code) url.searchParams.set('voucher', code);
    else url.searchParams.delete('voucher');
    window.location.href = url.toString();
  }
  btn.addEventListener('click', apply);
  // Enter inside the code field applies it rather than submitting the order.
  input.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); apply(); }
  });
})();
</script>
${
  reward.available > 0
    ? `<script>
(function(){
  var box = document.getElementById('useRewardBox');
  if(!box) return;
  function sync(){
    var on = box.checked;
    var row = document.getElementById('rewardRow');
    if(row) row.style.display = on ? 'flex' : 'none';
    var totals = document.querySelectorAll('[data-total], [data-perk-amount], [data-perk-label], [data-tier-cut]');
    for(var i = 0; i < totals.length; i++){
      totals[i].textContent = on ? totals[i].dataset.discounted : totals[i].dataset.full;
    }
    // Free cups take the cheapest cups in turn, so a perk can have nothing
    // left to waive once the stamp-card cup is used — hide it rather than
    // showing "− Rp 0".
    var perks = document.querySelectorAll('[data-perk-row]');
    for(var p = 0; p < perks.length; p++){
      var amount = Number(on ? perks[p].dataset.discountedAmount : perks[p].dataset.fullAmount) || 0;
      perks[p].style.display = amount > 0 ? 'flex' : 'none';
    }
    // A fully-waived order has nothing to transfer.
    var payment = document.getElementById('paymentSection');
    var free = document.getElementById('freeOrderNote');
    var isFree = on && totals.length && totals[0].dataset.discounted === 'Rp 0';
    if(payment) payment.hidden = isFree;
    if(free) free.hidden = !isFree;
    var proof = document.querySelector('input[name="proof"]');
    if(proof) proof.required = !isFree;
  }
  box.addEventListener('change', sync);
  sync();
})();
</script>`
    : ''
}`;

  return page({ title: 'Checkout — Pecup', bodyHtml: body, noindex: true });
}

function renderSukses({ order, items, emailOk, customer = null }) {
  const rewardDiscount = Number(order.reward_discount) || 0;
  // Same list the email and the admin page render, from src/orderMoney.js —
  // the receipt a customer keeps must itemise exactly what the shop's copy does.
  const orderDiscounts = discountLines(order);
  const freeCups = freeCupValue(order);
  const emailNote = emailOk
    ? `Detail pesanan dan bukti transfermu sudah kami terima dan otomatis terkirim ke email tim Pecup.`
    : `Pesananmu sudah tersimpan, tapi email notifikasi ke toko belum berhasil terkirim otomatis — tim kami tetap bisa melihatnya lewat panel admin.`;

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(0, null, customer)}
  <div class="px-page" style="display:flex;justify-content:center;padding-top:60px;padding-bottom:100px;">
    <div class="success-card" style="background:var(--surface);border:1px solid var(--border);border-radius:28px;max-width:560px;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;gap:20px;">
      <div style="width:80px;height:80px;border-radius:50%;background:var(--green-soft);display:flex;align-items:center;justify-content:center;">
        <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#3f7a42" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h1 style="font-size:26px;font-weight:800;letter-spacing:-0.3px;">Pesanan Berhasil Dikirim!</h1>
      <p style="font-size:15px;color:var(--text-muted);line-height:1.75;max-width:420px;">
        Terima kasih, <strong style="color:var(--text);">${escapeHtml(order.customer_name)}</strong>! ${emailNote} Kami akan konfirmasi pesananmu lewat WhatsApp.
      </p>
      <div style="width:100%;background:var(--surface-2);border-radius:14px;padding:20px 24px;display:flex;flex-direction:column;gap:10px;text-align:left;">
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:var(--text-muted);">No. Pesanan</span><span style="font-weight:700;">${escapeHtml(order.order_number)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:var(--text-muted);">Jumlah Produk</span><span style="font-weight:700;">${items.length} produk</span></div>
        ${
          order.delivery_date
            ? `<div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;"><span style="color:var(--text-muted);">Diantar</span><span style="font-weight:700;text-align:right;">${escapeHtml(formatDateID(order.delivery_date))}</span></div>`
            : ''
        }
        ${
          order.address
            ? `<div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;"><span style="color:var(--text-muted);">Lokasi</span><span style="font-weight:700;text-align:right;">${escapeHtml(order.address)}</span></div>`
            : ''
        }
        ${
          orderDiscounts.length
            ? `<div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:var(--text-muted);">Subtotal</span><span class="tnum">${formatRupiah(order.subtotal)}</span></div>
        ${orderDiscounts
          .map(
            (line) => `<div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;">
          <span style="color:#a15a1f;font-weight:700;">${escapeHtml(line.label)}</span>
          <span class="tnum" style="font-weight:700;color:#a15a1f;">&minus;${formatRupiah(line.amount)}</span>
        </div>`
          )
          .join('')}`
            : ''
        }
        ${
          Number(order.delivery_fee) > 0
            ? `<div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:var(--text-muted);">Ongkos antar</span><span class="tnum">${formatRupiah(order.delivery_fee)}</span></div>`
            : ''
        }
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:var(--text-muted);">Total Pembayaran</span><span class="tnum" style="font-weight:700;color:var(--green-dark);">${formatRupiah(order.total)}</span></div>
      </div>
      ${
        orderDiscounts.length
          ? `<div style="width:100%;background:var(--orange-soft);border-radius:14px;padding:16px 20px;text-align:left;display:flex;gap:12px;align-items:flex-start;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a15a1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M12 2l2.9 6.3 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z"/></svg>
        <div style="font-size:13px;color:#7a4a1f;line-height:1.7;">
          <strong>Potongan di pesanan ini:</strong>
          ${orderDiscounts.map((line) => `${escapeHtml(line.label)} (${formatRupiah(line.amount)})`).join('<br>')}
          ${freeCups > 0 ? `<br>Total nilai cup gratis: <strong>${formatRupiah(freeCups)}</strong>.` : ''}
          ${
            rewardDiscount > 0
              ? '<br>Stempelmu sekarang kembali ke nol — kumpulkan lagi untuk cup gratis berikutnya.'
              : ''
          }
        </div>
      </div>`
          : ''
      }
      <a href="/" class="btn-primary" style="display:block;width:100%;text-align:center;padding:15px;border-radius:12px;font-size:14.5px;font-weight:700;margin-top:8px;">Kembali ke Beranda</a>
    </div>
  </div>
</div></div>`;

  return page({ title: 'Pesanan Berhasil — Pecup', bodyHtml: body, noindex: true });
}

// Friendly error page, used for 404s and 500s instead of a bare <h1>404</h1>.
function renderError({ code = 404, title, message, cartCount = 0, customer = null }) {
  const heading = title || (code === 404 ? 'Halaman tidak ditemukan' : 'Ada yang tidak beres');
  const text =
    message ||
    (code === 404
      ? 'Link-nya mungkin salah ketik, atau produknya sudah tidak tersedia lagi.'
      : 'Terjadi kesalahan di sisi kami. Coba muat ulang sebentar lagi — kalau masih bermasalah, hubungi kami lewat WhatsApp.');

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, null, customer)}
  <main id="konten" class="px-page" style="display:flex;justify-content:center;padding-top:80px;padding-bottom:120px;">
    <div style="max-width:480px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;">
      <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:78px;font-weight:800;line-height:1;
                  background:linear-gradient(140deg, var(--orange), var(--green));-webkit-background-clip:text;
                  background-clip:text;color:transparent;letter-spacing:-3px;">${code}</div>
      <h1 style="font-size:24px;font-weight:800;">${escapeHtml(heading)}</h1>
      <p style="font-size:15px;color:var(--text-muted);line-height:1.75;">${escapeHtml(text)}</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:6px;">
        <a href="/" class="btn-primary" style="padding:14px 26px;border-radius:12px;font-size:14.5px;font-weight:700;">Kembali ke Beranda</a>
        <a href="/#menu" class="btn-outline" style="padding:14px 26px;border-radius:12px;font-size:14.5px;font-weight:700;">Lihat Menu</a>
      </div>
      <a href="https://wa.me/6281245684104" target="_blank" rel="noopener" style="font-size:13.5px;margin-top:8px;">Butuh bantuan? Chat WhatsApp kami →</a>
    </div>
  </main>
  ${customerFooter()}
</div></div>`;

  return page({
    title: `${code} — ${heading} | Pecup`,
    bodyHtml: body,
    noindex: true,
    description: text,
  });
}

module.exports = { renderBeranda, renderProdukDetail, renderKeranjang, renderCheckout, renderSukses, renderError };
