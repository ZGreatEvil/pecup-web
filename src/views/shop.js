const { page, customerHeader, customerFooter } = require('./layout');
const { productThumb } = require('./productIcon');
const { formatRupiah, escapeHtml, escapeAttr } = require('../utils');

// Best Seller takes priority if a product is somehow flagged as both.
function productBadge(p) {
  if (p.is_bestseller) return { text: 'Best Seller', bg: 'var(--orange)' };
  if (p.is_recommended) return { text: 'Direkomendasikan', bg: 'var(--green)' };
  return null;
}

function badgeHtml(p, { top = 8, left = 8 } = {}) {
  const badge = productBadge(p);
  if (!badge) return '';
  return `<span style="position:absolute;top:${top}px;left:${left}px;z-index:2;background:${badge.bg};color:#fff;font-size:10.5px;font-weight:700;padding:4px 10px;border-radius:99px;white-space:nowrap;">${badge.text}</span>`;
}

function renderBeranda({ products, cartCount, category }) {
  const categories = ['Semua', 'Buah Tunggal', 'Mix Buah', 'Salad Buah', 'Rujak', 'Paket Spesial'];
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
          const action = isMix
            ? `<a href="/produk/${p.id}" class="add-btn" style="height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 14px;font-size:12.5px;font-weight:700;white-space:nowrap;">Pilih Buah</a>`
            : `<form method="post" action="/keranjang/tambah">
            <input type="hidden" name="productId" value="${p.id}">
            <input type="hidden" name="qty" value="1">
            <button class="add-btn" type="submit" style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;" title="Tambah ke keranjang">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </form>`;
          return `
      <div class="p-card" style="position:relative;border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:14px;">
        <a href="/produk/${p.id}" style="position:absolute;inset:0;z-index:1;" aria-label="${escapeAttr(p.name)}"></a>
        <div style="aspect-ratio:1;position:relative;">${badgeHtml(p)}${productThumb(p)}</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-size:15.5px;font-weight:700;color:var(--text);">${escapeHtml(p.name)}</span>
          <span style="font-size:12.5px;color:var(--text-muted);">Cup ${escapeHtml(p.weight)}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;gap:10px;">
          <span style="font-size:16.5px;font-weight:800;color:var(--green-dark);">${formatRupiah(p.price)}</span>
          <div style="position:relative;z-index:2;">${action}</div>
        </div>
      </div>`;
        })
        .join('')
    : `<p style="color:var(--text-muted);font-size:14px;">Belum ada produk pada kategori ini.</p>`;

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount)}

  <section class="hero px-page" style="padding-top:88px;padding-bottom:72px;">
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

  <section id="menu" class="px-page" style="display:flex;gap:12px;flex-wrap:wrap;">${chips}</section>

  <section class="px-page" style="padding-top:40px;padding-bottom:100px;">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:8px;">
      <div>
        <h2 style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">Menu Hari Ini</h2>
        <p style="color:var(--text-muted);font-size:14.5px;margin-top:6px;">${products.length} produk tersedia</p>
      </div>
    </div>
    <div class="grid-4">${cards}</div>
  </section>

  <section id="cara-pesan" class="px-page" style="background:var(--surface-2);padding-top:72px;padding-bottom:72px;">
    <h2 style="text-align:center;font-size:26px;font-weight:800;margin-bottom:48px;">Cara Pesan di Pecup</h2>
    <div class="grid-3" style="max-width:1100px;margin:0 auto;">
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;">1</div>
        <h4 style="font-size:16px;font-weight:700;">Pilih &amp; Tambah ke Keranjang</h4>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;max-width:260px;">Pilih buah potong favoritmu dan atur jumlahnya.</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;">2</div>
        <h4 style="font-size:16px;font-weight:700;">Checkout &amp; Transfer</h4>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;max-width:260px;">Isi data pemesan, tambahkan catatan bila perlu, lalu transfer.</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;">3</div>
        <h4 style="font-size:16px;font-weight:700;">Upload Bukti &amp; Tunggu Konfirmasi</h4>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;max-width:260px;">Kami verifikasi dan konfirmasi via WhatsApp.</p>
      </div>
    </div>
  </section>

  ${customerFooter()}
</div></div>`;

  return page({ title: 'Pecup — Buah Potong Segar', bodyHtml: body });
}

function renderProdukDetail({ product, related, cartCount, singleFruits = [] }) {
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
  ${customerHeader(cartCount)}
  <div class="px-page" style="padding-top:24px;font-size:13.5px;color:var(--text-muted);">
    <a href="/">Beranda</a> &nbsp;/&nbsp; <a href="/#menu">Menu</a> &nbsp;/&nbsp; <span style="color:var(--text);">${escapeHtml(product.name)}</span>
  </div>

  <section class="detail-layout px-page" style="padding-top:32px;padding-bottom:72px;">
    <div class="detail-img" style="position:relative;">${badgeHtml(product, { top: 12, left: 12 })}${productThumb(product, { size: 200, radius: 28 })}</div>

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
        <span style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:${inStock ? '#58a05c' : '#a13f3f'};background:${inStock ? 'var(--green-soft)' : '#f6dcdc'};padding:5px 12px;border-radius:99px;">
          <svg width="9" height="9" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${inStock ? '#58a05c' : '#a13f3f'}"/></svg>
          ${inStock ? `Stok Tersedia (${product.stock})` : 'Stok Habis'}
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

  return page({ title: `${product.name} — Pecup`, bodyHtml: body });
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

function renderKeranjang({ items, subtotal, cartCount }) {
  const rows = items.length
    ? items
        .map(
          (it) => `
      <div class="cart-row">
        <div class="cart-row-thumb">${productThumb(it.product, { size: 48, radius: 14 })}</div>
        <div class="cart-row-name">
          <div style="font-size:16px;font-weight:700;">${escapeHtml(it.product.name)}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:3px;">Cup ${escapeHtml(it.product.weight)}</div>
          ${
            it.fruits.length
              ? `<div style="font-size:12.5px;color:var(--green-dark);margin-top:4px;font-weight:600;">${it.fruits.map((f) => escapeHtml(f.name)).join(' + ')}</div>`
              : ''
          }
        </div>
        <form method="post" action="/keranjang/update" class="cart-row-qty">
          <input type="hidden" name="key" value="${escapeAttr(it.key)}">
          <input type="number" name="qty" value="${it.qty}" min="0" max="${it.product.stock}" class="qty-auto-submit" style="width:64px;padding:8px;text-align:center;">
        </form>
        <div class="cart-row-total">${formatRupiah(it.subtotal)}</div>
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
  ${customerHeader(cartCount, stepHeader(1))}
  <section class="px-page" style="padding-top:48px;padding-bottom:100px;">
    <h1 style="font-size:26px;font-weight:800;margin-bottom:6px;">Keranjang Belanja</h1>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:30px;">${items.length} produk di keranjang</p>
    <div class="split-layout">
      <div class="split-main">
        ${rows}
        <a href="/" style="font-size:14px;font-weight:600;margin-top:24px;">← Lanjut Belanja</a>
      </div>
      <div class="split-side">
        <h3 style="font-size:18px;font-weight:800;margin-bottom:22px;">Ringkasan Pesanan</h3>
        <div style="display:flex;justify-content:space-between;font-size:14.5px;color:var(--text-muted);margin-bottom:12px;"><span>Subtotal (${items.length} produk)</span><span style="color:var(--text);font-weight:600;">${formatRupiah(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;padding-top:16px;border-top:1px solid var(--border);margin-bottom:24px;"><span>Total</span><span style="color:var(--green-dark);">${formatRupiah(subtotal)}</span></div>
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

  return page({ title: 'Keranjang — Pecup', bodyHtml: body });
}

function renderCheckout({ items, subtotal, cartCount, errors = [], formValues = {} }) {
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

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, stepHeader(2))}
  <section class="px-page" style="padding-top:48px;padding-bottom:100px;">
    <h1 style="font-size:26px;font-weight:800;margin-bottom:30px;">Checkout Pesanan</h1>
    ${errorHtml}
    <form method="post" action="/checkout" enctype="multipart/form-data">
      <div class="split-layout">
        <div class="split-main" style="gap:24px;">
          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:20px;">Data Pemesan</h3>
            <div class="field"><label>Nama Lengkap <span class="req">*</span></label><input type="text" name="customerName" required value="${escapeAttr(formValues.customerName || '')}" placeholder="Contoh: Alexander Dwiono"></div>
            <div class="field"><label>Nomor WhatsApp <span class="req">*</span></label><input type="text" name="whatsapp" required value="${escapeAttr(formValues.whatsapp || '')}" placeholder="Contoh: 0812xxxxxxx"></div>
            <div style="margin-bottom:0;"><label>Catatan Pesanan (opsional)</label><textarea name="notes" rows="3" placeholder="Contoh: tolong pepaya-nya diganti semangka, kurangi manis">${escapeHtml(formValues.notes || '')}</textarea></div>
          </div>

          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;">Info Pembayaran — QRIS</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">Scan kode QRIS di bawah dengan aplikasi e-wallet, m-banking, atau QRIS apa pun sesuai total pesanan, lalu unggah buktinya.</p>
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;background:var(--surface-2);border-radius:12px;padding:20px;">
              <img src="/assets/qris-payment.jpg" alt="QRIS Pecup, Makanan &amp; Minuman" style="width:100%;max-width:260px;border-radius:12px;border:1px solid var(--border);background:#fff;">
              <span style="font-size:12.5px;color:var(--text-muted);text-align:center;">Pecup, Makanan &amp; Minuman — QRIS Standar Pembayaran Nasional</span>
            </div>
          </div>

          <div class="card">
            <h3 style="font-size:17px;font-weight:800;margin-bottom:6px;">Upload Bukti Transfer <span class="req">*</span></h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">Format JPG, PNG, atau PDF, maksimal 4MB.</p>
            <div class="dropzone" style="padding:24px;">
              <input type="file" name="proof" accept="image/jpeg,image/png,application/pdf" required style="border:none;padding:0;background:transparent;">
            </div>
          </div>

          <button class="btn-primary" type="submit" style="width:100%;padding:17px;border-radius:12px;font-size:15.5px;font-weight:700;">Kirim Pesanan Sekarang</button>
          <p style="font-size:12.5px;color:var(--text-muted);text-align:center;line-height:1.6;">Dengan mengirim pesanan, data di atas beserta bukti transfer akan otomatis terkirim melalui email ke tim Pecup untuk diverifikasi.</p>
        </div>

        <div class="split-side">
          <h3 style="font-size:18px;font-weight:800;margin-bottom:20px;">Ringkasan Pesanan</h3>
          ${summaryRows}
          <div style="display:flex;justify-content:space-between;font-size:17px;font-weight:800;padding-top:18px;margin-bottom:20px;"><span>Total</span><span style="color:var(--green-dark);">${formatRupiah(subtotal)}</span></div>
          <div style="display:flex;align-items:flex-start;gap:10px;background:var(--surface-2);padding:14px;border-radius:12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8" style="flex-shrink:0;margin-top:2px;"><path d="M4 4h16v12H8l-4 4z"/></svg>
            <span style="font-size:12.5px;color:var(--text-muted);line-height:1.6;">Pesanan otomatis terkirim ke email toko begitu kamu klik "Kirim Pesanan".</span>
          </div>
        </div>
      </div>
    </form>
  </section>
  ${customerFooter()}
</div></div>`;

  return page({ title: 'Checkout — Pecup', bodyHtml: body });
}

function renderSukses({ order, items, emailOk }) {
  const emailNote = emailOk
    ? `Detail pesanan dan bukti transfermu sudah kami terima dan otomatis terkirim ke email tim Pecup.`
    : `Pesananmu sudah tersimpan, tapi email notifikasi ke toko belum berhasil terkirim otomatis — tim kami tetap bisa melihatnya lewat panel admin.`;

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(0)}
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
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span style="color:var(--text-muted);">Total Pembayaran</span><span style="font-weight:700;color:var(--green-dark);">${formatRupiah(order.total)}</span></div>
      </div>
      <a href="/" class="btn-primary" style="display:block;width:100%;text-align:center;padding:15px;border-radius:12px;font-size:14.5px;font-weight:700;margin-top:8px;">Kembali ke Beranda</a>
    </div>
  </div>
</div></div>`;

  return page({ title: 'Pesanan Berhasil — Pecup', bodyHtml: body });
}

module.exports = { renderBeranda, renderProdukDetail, renderKeranjang, renderCheckout, renderSukses };
