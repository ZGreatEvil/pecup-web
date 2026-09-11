const { page, adminSidebar, logoMark, backButton } = require('./layout');
const { productThumb, productPhotos } = require('./productIcon');
const {
  formatRupiah,
  escapeHtml,
  escapeAttr,
  formatDateID,
  formatTimeID,
  formatDateTimeID,
  formatShortDateID,
  normalizeWhatsapp,
  formatWhatsapp,
  orderStatus,
  ORDER_STATUSES,
} = require('../utils');

function renderLogin({ error }) {
  const body = `
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);">
  <div class="card" style="width:100%;max-width:380px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;justify-content:center;">
      ${logoMark(34)}
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:20px;">Pecup Admin</span>
    </div>
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/admin/login">
      <div class="field"><label>Username</label><input type="text" name="username" required autofocus></div>
      <div class="field" style="margin-bottom:8px;"><label>Password</label><input type="password" name="password" required></div>
      <button class="btn-primary" type="submit" style="width:100%;padding:14px;border-radius:11px;font-size:14.5px;font-weight:700;margin-top:14px;">Masuk</button>
    </form>
  </div>
</div>`;
  return page({ title: 'Masuk Admin — Pecup', bodyHtml: body });
}

function statCard(label, value, bg, iconPath, stroke = '#3f7a42') {
  return `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 22px;display:flex;align-items:center;gap:16px;">
    <div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8">${iconPath}</svg>
    </div>
    <div><div style="font-size:22px;font-weight:800;">${value}</div><div style="font-size:12.5px;color:var(--text-muted);">${label}</div></div>
  </div>`;
}

const STATUS_LABELS = {
  semua: 'Semua produk',
  aktif: 'Produk aktif',
  nonaktif: 'Produk nonaktif',
  menipis: 'Stok menipis',
  habis: 'Stok habis',
};

// Builds a /admin/produk URL preserving the current filter+sort, changing
// only what's passed in.
function produkUrl(view, overrides = {}) {
  const merged = { ...view, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== '' && value !== null && value !== undefined && value !== 'semua') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `/admin/produk${qs ? `?${qs}` : ''}`;
}

// Column header that toggles asc/desc on click and shows which way it's sorted.
function sortHeader(label, key, view) {
  const isActive = view.urut === key;
  const nextDir = isActive && view.arah === 'asc' ? 'desc' : 'asc';
  const arrow = isActive
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${view.arah === 'asc' ? 180 : 0}deg);"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/></svg>`;
  return `<a href="${produkUrl(view, { urut: key, arah: nextDir })}" style="display:inline-flex;align-items:center;gap:5px;color:${
    isActive ? 'var(--text)' : 'var(--text-muted)'
  };font-weight:${isActive ? 800 : 700};">${label}${arrow}</a>`;
}

function stockCell(p) {
  const stock = Number(p.stock);
  const soldOut = stock <= 0;
  const low = stock > 0 && stock <= 5;
  const inputStyle = soldOut
    ? 'color:#a13f3f;border-color:#c94f4f;background:#fdf2f2;'
    : low
    ? 'color:#a15a1f;border-color:#e0a765;background:oklch(97% 0.04 55);'
    : '';
  const warning = soldOut
    ? `<span style="font-size:10.5px;font-weight:800;color:#a13f3f;background:#f6dcdc;padding:3px 8px;border-radius:99px;white-space:nowrap;">HABIS</span>`
    : low
    ? `<span style="font-size:10.5px;font-weight:800;color:#a15a1f;background:var(--orange-soft);padding:3px 8px;border-radius:99px;white-space:nowrap;">MENIPIS</span>`
    : '';
  return `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <div class="stock-control" data-product-id="${p.id}" style="display:flex;align-items:center;gap:4px;">
            <button type="button" class="step-btn stock-step" data-delta="-1" title="Kurangi stok" style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:var(--text-muted);">&minus;</button>
            <input type="number" class="stock-input" value="${p.stock}" min="0" aria-label="Stok ${escapeAttr(p.name)}"
                   style="width:52px;padding:5px 4px;text-align:center;font-size:13.5px;font-weight:700;border-radius:7px;${inputStyle}">
            <button type="button" class="step-btn stock-step" data-delta="1" title="Tambah stok" style="width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:var(--text-muted);">+</button>
          </div>
          ${warning}
        </div>`;
}

function renderProdukList({ products, stats, flash, admin, view = {}, categories = [], totalCount = 0 }) {
  const rows = products.length
    ? products
        .map(
          (p) => `
      <div class="row-hover" style="display:grid;grid-template-columns:2.2fr 1.1fr 1fr 1.6fr 1fr 1fr;align-items:center;padding:14px 22px;border-top:1px solid var(--border);${
        Number(p.stock) <= 0 ? 'background:oklch(99% 0.012 25);' : ''
      }">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:44px;height:44px;flex-shrink:0;">${productThumb(p, { size: 24, radius: 10 })}</div>
          <span style="font-size:14px;font-weight:700;">${escapeHtml(p.name)}</span>
        </div>
        <a href="${produkUrl(view, { kategori: p.category, halaman: '' })}" style="font-size:13.5px;color:var(--text-muted);">${escapeHtml(p.category)}</a>
        <span style="font-size:13.5px;font-weight:600;">${formatRupiah(p.price)}</span>
        ${stockCell(p)}
        <form method="post" action="/admin/produk/${p.id}/toggle">
          <button type="submit" class="toggle-pill ${p.active ? 'toggle-on' : 'toggle-off'}" title="Klik untuk ${p.active ? 'nonaktifkan' : 'aktifkan'}">
            <span class="toggle-dot"></span>
          </button>
          <span style="font-size:11.5px;font-weight:700;margin-left:8px;color:${p.active ? '#3f7a42' : 'var(--text-muted)'};">${p.active ? 'Aktif' : 'Nonaktif'}</span>
        </form>
        <div style="display:flex;gap:6px;">
          <a class="icon-action" href="/admin/produk/${p.id}/edit" style="padding:6px;display:inline-flex;" title="Edit">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
          </a>
          <form method="post" action="/admin/produk/${p.id}/hapus" onsubmit="return confirm('Hapus produk ini?');">
            <button type="submit" class="icon-action" style="padding:6px;" title="Hapus">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c94f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
            </button>
          </form>
        </div>
      </div>`
        )
        .join('')
    : `<div style="padding:32px 22px;color:var(--text-muted);font-size:14px;">${
        totalCount > 0
          ? 'Tidak ada produk yang cocok dengan filter ini.'
          : 'Belum ada produk. Klik "Tambah Produk Baru" untuk mulai mengisi inventori.'
      }</div>`;

  // Each card is a link that filters the table to exactly what it counts.
  const clickableStat = (label, value, statusKey, bg, iconPath, stroke) => {
    const isActive = (view.status || 'semua') === statusKey;
    return `<a href="${produkUrl(view, { status: statusKey })}" style="display:block;color:inherit;">
      <div style="background:var(--surface);border:${isActive ? '2px solid var(--green)' : '1px solid var(--border)'};border-radius:16px;padding:${
        isActive ? '19px 21px' : '20px 22px'
      };display:flex;align-items:center;gap:16px;transition:border-color 0.18s ease, transform 0.15s ease;" class="stat-card">
        <div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8">${iconPath}</svg>
        </div>
        <div><div style="font-size:22px;font-weight:800;">${value}</div><div style="font-size:12.5px;color:var(--text-muted);">${label}</div></div>
      </div>
    </a>`;
  };

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main">
    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:12px;">
      <div><div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Produk</div><h1 style="font-size:24px;font-weight:800;">Kelola Produk</h1></div>
      <a href="/admin/produk/tambah" class="btn-primary" style="padding:13px 22px;border-radius:11px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Tambah Produk Baru
      </a>
    </div>

    <div class="grid-4" style="margin:28px 0;gap:16px;">
      ${clickableStat('Semua Produk', stats.total, 'semua', 'var(--surface-2)', '<path d="M20 8l-8-5-8 5v8l8 5 8-5V8z"/>', '#5a5a60')}
      ${clickableStat('Produk Aktif', stats.active, 'aktif', 'var(--green-soft)', '<path d="M20 6L9 17l-5-5"/>', '#3f7a42')}
      ${clickableStat('Stok Menipis (≤5)', stats.lowStock, 'menipis', 'var(--orange-soft)', '<path d="M12 9v4m0 4h.01M10.3 3.9L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', '#a15a1f')}
      ${clickableStat('Stok Habis', stats.soldOut, 'habis', '#f6dcdc', '<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>', '#a13f3f')}
    </div>

    <div class="card" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:12.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;">FILTER</span>
      <a class="chip ${(view.kategori || '') === '' ? 'chip-active' : ''}" href="${produkUrl(view, { kategori: '' })}" style="padding:8px 16px;border-radius:99px;font-size:13px;font-weight:600;${
        (view.kategori || '') === '' ? '' : 'color:var(--text);'
      }">Semua Kategori</a>
      ${categories
        .map(
          (c) =>
            `<a class="chip ${view.kategori === c ? 'chip-active' : ''}" href="${produkUrl(view, { kategori: c })}" style="padding:8px 16px;border-radius:99px;font-size:13px;font-weight:600;${
              view.kategori === c ? '' : 'color:var(--text);'
            }">${escapeHtml(c)}</a>`
        )
        .join('')}
      ${
        view.kategori || (view.status && view.status !== 'semua') || view.urut
          ? `<a href="/admin/produk" style="font-size:12.5px;font-weight:600;margin-left:auto;">Reset filter</a>`
          : ''
      }
    </div>

    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      Menampilkan <strong>${products.length}</strong> dari <strong>${totalCount}</strong> produk${
        view.kategori ? ` · kategori <strong>${escapeHtml(view.kategori)}</strong>` : ''
      }${view.status && view.status !== 'semua' ? ` · <strong>${escapeHtml(STATUS_LABELS[view.status] || view.status)}</strong>` : ''}
    </p>

    <div class="table-scroll" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:2.2fr 1.1fr 1fr 1.6fr 1fr 1fr;padding:14px 22px;background:var(--surface-2);font-size:12.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;min-width:800px;">
        <span>${sortHeader('PRODUK', 'nama', view)}</span>
        <span>${sortHeader('KATEGORI', 'kategori', view)}</span>
        <span>${sortHeader('HARGA', 'harga', view)}</span>
        <span>${sortHeader('STOK', 'stok', view)}</span>
        <span>STATUS</span><span>AKSI</span>
      </div>
      <div style="min-width:800px;">${rows}</div>
    </div>
    <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;">Stok tersimpan otomatis — pakai tombol &minus;/+ atau ketik angkanya langsung. Klik judul kolom untuk mengurutkan.</p>
  </main>
</div>
<script>
(function(){
  // Inline stock editing: saves on its own (no Save button, no page reload),
  // and paints the field green/red for a moment so it's obvious it stuck.
  function flash(input, ok){
    input.style.transition = 'background 0.2s ease, border-color 0.2s ease';
    input.style.background = ok ? 'var(--green-soft)' : '#f6dcdc';
    input.style.borderColor = ok ? 'var(--green)' : '#c94f4f';
    setTimeout(function(){ input.style.background = ''; input.style.borderColor = ''; }, 700);
  }
  function save(control, value){
    var input = control.querySelector('.stock-input');
    if(control.dataset.busy === '1') return;
    control.dataset.busy = '1';
    var body = new FormData();
    body.append('stock', String(value));
    fetch('/admin/produk/' + control.dataset.productId + '/stok', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: body
    }).then(function(res){ return res.json(); })
      .then(function(data){
        if(data && data.ok){ input.value = data.stock; flash(input, true); }
        else flash(input, false);
      })
      .catch(function(){ flash(input, false); })
      .then(function(){ control.dataset.busy = ''; });
  }
  document.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.stock-step') : null;
    if(!btn) return;
    var control = btn.closest('.stock-control');
    var input = control.querySelector('.stock-input');
    var next = Math.max(0, (Number(input.value) || 0) + Number(btn.dataset.delta));
    input.value = next;
    save(control, next);
  });
  document.addEventListener('change', function(e){
    var input = e.target;
    if(!input.classList || !input.classList.contains('stock-input')) return;
    var next = Math.max(0, Number(input.value) || 0);
    input.value = next;
    save(input.closest('.stock-control'), next);
  });
})();
</script>`;

  return page({ title: 'Kelola Produk — Admin Pecup', bodyHtml: body });
}

function renderProdukForm({ product, error, categories = [], admin }) {
  const isEdit = Boolean(product && product.id);
  const p = product || {
    name: '',
    description: '',
    category: 'Buah Tunggal',
    weight: '',
    price: '',
    stock: '',
    active: 1,
    is_bestseller: 0,
    is_recommended: 0,
    wholesale_min_qty: '',
    wholesale_price: '',
  };
  const existingPhotos = productPhotos(p);

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <form method="post" action="${isEdit ? `/admin/produk/${p.id}/edit` : '/admin/produk/tambah'}" enctype="multipart/form-data" style="margin-top:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Produk / ${isEdit ? 'Edit' : 'Tambah Baru'}</div>
          <h1 style="font-size:24px;font-weight:800;">${isEdit ? 'Edit Produk' : 'Tambah Produk Baru'}</h1>
        </div>
        <div style="display:flex;gap:10px;">
          <a href="/admin/produk" class="btn-outline" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Batal</a>
          <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Simpan Produk</button>
        </div>
      </div>

      ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

      <div style="display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;">
        <div style="flex:0 0 320px;display:flex;flex-direction:column;gap:20px;">
          <div class="card">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:6px;">Foto Produk</h3>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">Foto pertama jadi foto utama. Kalau lebih dari satu, pembeli bisa geser-geser fotonya.</p>
            ${
              isEdit && existingPhotos.length
                ? `<div style="display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:8px;margin-bottom:14px;">
                    ${existingPhotos
                      .map(
                        (url, i) => `
                      <div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:${
                        i === 0 ? '2px solid var(--green)' : '1px solid var(--border)'
                      };">
                        <img src="${escapeAttr(url)}" style="width:100%;height:100%;object-fit:cover;display:block;">
                        ${
                          i === 0
                            ? `<span style="position:absolute;top:3px;left:3px;background:var(--green);color:#fff;font-size:8.5px;font-weight:800;padding:2px 6px;border-radius:99px;">UTAMA</span>`
                            : ''
                        }
                        <label style="position:absolute;bottom:3px;right:3px;background:rgba(255,255,255,0.94);border-radius:6px;padding:2px 6px;font-size:9.5px;font-weight:700;color:#a13f3f;cursor:pointer;display:flex;align-items:center;gap:3px;margin:0;">
                          <input type="checkbox" name="hapusFoto" value="${escapeAttr(url)}" style="width:11px;height:11px;margin:0;"> Hapus
                        </label>
                      </div>`
                      )
                      .join('')}
                  </div>`
                : ''
            }
            <div class="dropzone" style="padding:24px;text-align:center;">
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" multiple style="border:none;padding:0;background:transparent;">
              <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">JPG / PNG / WEBP${
                isEdit ? ' — foto baru ditambahkan ke galeri' : ''
              }. Bisa pilih beberapa sekaligus.</div>
            </div>
          </div>
        </div>

        <div class="card" style="flex:1 1 420px;">
          <div class="field"><label>Nama Produk <span class="req">*</span></label><input type="text" name="name" required value="${escapeAttr(p.name)}" placeholder="Contoh: Mangga Harum Manis"></div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div class="field" style="flex:1 1 180px;">
              <label>Kategori <span class="req">*</span></label>
              <input type="text" name="category" list="categoryOptions" required value="${escapeAttr(p.category)}" placeholder="Contoh: Buah Tunggal">
              <datalist id="categoryOptions">
                ${categories.map((c) => `<option value="${escapeAttr(c)}">`).join('')}
              </datalist>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Pilih dari daftar atau ketik nama kategori baru.</div>
            </div>
            <div class="field" style="flex:1 1 180px;"><label>Berat / Ukuran Kemasan <span class="req">*</span></label><input type="text" name="weight" required value="${escapeAttr(p.weight)}" placeholder="Contoh: 250g"></div>
          </div>
          <div class="field"><label>Deskripsi Produk</label><textarea name="description" rows="4" placeholder="Ceritakan kesegaran &amp; keunggulan produk ini...">${escapeHtml(p.description)}</textarea></div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div class="field" style="flex:1 1 180px;"><label>Harga (Rp) <span class="req">*</span></label><input type="number" name="price" required min="0" value="${escapeAttr(p.price)}" placeholder="Contoh: 18000"></div>
            <div class="field" style="flex:1 1 180px;"><label>Stok Tersedia <span class="req">*</span></label><input type="number" name="stock" required min="0" value="${escapeAttr(p.stock)}" placeholder="Contoh: 24"></div>
          </div>

          <div style="background:var(--orange-soft);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:800;color:#7a4a1f;margin-bottom:4px;">Harga Grosir (opsional)</div>
            <p style="font-size:12.5px;color:#7a4a1f;line-height:1.6;margin-bottom:14px;">Kalau pembeli ambil banyak sekaligus, harga per cup-nya turun. Kosongkan kalau produk ini tidak ada harga grosir.</p>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              <div class="field" style="flex:1 1 160px;margin-bottom:0;">
                <label style="color:#7a4a1f;">Minimal Jumlah</label>
                <input type="number" name="wholesaleMinQty" min="0" value="${escapeAttr(p.wholesale_min_qty || '')}" placeholder="Contoh: 20">
              </div>
              <div class="field" style="flex:1 1 160px;margin-bottom:0;">
                <label style="color:#7a4a1f;">Harga Grosir / cup (Rp)</label>
                <input type="number" name="wholesalePrice" min="0" value="${escapeAttr(
                  p.wholesale_price === null || p.wholesale_price === undefined ? '' : p.wholesale_price
                )}" placeholder="Contoh: 15000">
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:var(--surface-2);border-radius:12px;">
            <div>
              <div style="font-size:14px;font-weight:700;">Tampilkan di Toko</div>
              <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">Produk aktif akan langsung terlihat oleh pembeli</div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;margin:0;">
              <input type="checkbox" name="active" value="1" ${Number(p.active) ? 'checked' : ''} style="width:20px;height:20px;">
            </label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:var(--surface-2);border-radius:12px;margin-top:12px;">
            <div>
              <div style="font-size:14px;font-weight:700;">Best Seller</div>
              <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">Tampilkan label "Best Seller" pada produk ini</div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;margin:0;">
              <input type="checkbox" name="is_bestseller" value="1" ${Number(p.is_bestseller) ? 'checked' : ''} style="width:20px;height:20px;">
            </label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:var(--surface-2);border-radius:12px;margin-top:12px;">
            <div>
              <div style="font-size:14px;font-weight:700;">Direkomendasikan</div>
              <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">Tampilkan label "Direkomendasikan" pada produk ini</div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;margin:0;">
              <input type="checkbox" name="is_recommended" value="1" ${Number(p.is_recommended) ? 'checked' : ''} style="width:20px;height:20px;">
            </label>
          </div>
        </div>
      </div>
    </form>
  </main>
</div>`;

  return page({ title: `${isEdit ? 'Edit' : 'Tambah'} Produk — Admin Pecup`, bodyHtml: body });
}

function renderPesananList({ dateKey, prevDate, nextDate, orders, stats, admin }) {
  const rows = orders.length
    ? orders
        .map((o) => {
          const status = orderStatus(o.status);
          const badge = `<span style="font-size:11.5px;font-weight:700;color:${status.color};background:${status.bg};padding:5px 11px;border-radius:99px;white-space:nowrap;">${status.label}</span>`;
          return `
      <div class="row-hover" style="display:grid;grid-template-columns:0.7fr 1.5fr 1fr 0.9fr 1fr 1fr;align-items:center;padding:14px 20px;border-top:1px solid var(--border);">
        <span style="font-size:13px;color:var(--text-muted);">${formatTimeID(o.created_at)}</span>
        <div><div style="font-size:13.5px;font-weight:700;">${escapeHtml(o.customer_name)}</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHtml(o.whatsapp)}</div></div>
        <span style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(o.order_number)}</span>
        <span style="font-size:13px;font-weight:700;">${formatRupiah(o.total)}</span>
        <div>${badge}</div>
        <a href="/admin/pesanan/${o.id}" class="lihat-btn" style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;width:fit-content;">Lihat Detail</a>
      </div>`;
        })
        .join('')
    : `<div style="padding:32px 22px;color:var(--text-muted);font-size:14px;">Belum ada pesanan pada tanggal ini.</div>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('pesanan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:12px;">
      <div><div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Pesanan</div><h1 style="font-size:24px;font-weight:800;">Pesanan Masuk</h1></div>
      <form method="get" action="/admin/pesanan/unduh" style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;">
        <div style="margin:0;">
          <label style="margin-bottom:4px;">Dari</label>
          <input type="date" name="dari" value="${dateKey}" required style="padding:10px 12px;">
        </div>
        <div style="margin:0;">
          <label style="margin-bottom:4px;">Sampai</label>
          <input type="date" name="sampai" value="${dateKey}" required style="padding:10px 12px;">
        </div>
        <button class="btn-primary" type="submit" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;white-space:nowrap;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          Unduh CSV
        </button>
      </form>
    </div>

    <div style="display:flex;align-items:center;gap:14px;margin:20px 0 28px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;width:fit-content;">
      <a href="/admin/pesanan?tanggal=${prevDate}" style="display:flex;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></a>
      <div style="display:flex;align-items:center;gap:10px;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
        <span style="font-size:14.5px;font-weight:700;">${formatDateID(dateKey)}</span>
      </div>
      <a href="/admin/pesanan?tanggal=${nextDate}" style="display:flex;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></a>
    </div>

    <div class="grid-4" style="margin-bottom:28px;gap:16px;">
      ${statCard('Pesanan Hari Ini', stats.total, 'var(--surface-2)', '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>', '#5a5a60')}
      ${statCard('Menunggu Verifikasi', stats.pending, 'oklch(94% 0.06 55)', '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>', '#a15a1f')}
      ${statCard('Diproses', stats.processing, 'oklch(93% 0.05 245)', '<path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/>', '#1f5aa1')}
      ${statCard('Selesai', stats.done, 'var(--green-soft)', '<path d="M20 6L9 17l-5-5"/>')}
    </div>

    <div class="table-scroll" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:0.7fr 1.5fr 1fr 0.9fr 1fr 1fr;padding:14px 20px;background:var(--surface-2);font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;min-width:600px;">
        <span>WAKTU</span><span>PEMESAN</span><span>NO. PESANAN</span><span>TOTAL</span><span>STATUS</span><span>AKSI</span>
      </div>
      <div style="min-width:600px;">${rows}</div>
    </div>
  </main>
</div>`;

  return page({ title: 'Pesanan — Admin Pecup', bodyHtml: body });
}

function renderPesananDetail({ order, items, proofUrl, admin, loyalty = null }) {
  const itemRows = items
    .map(
      (it) => `
    <div style="display:flex;justify-content:space-between;font-size:14px;padding:10px 0;border-bottom:1px solid var(--border);">
      <span>${escapeHtml(it.product_name)} <span style="color:var(--text-muted);">×${it.qty}</span></span>
      <span style="font-weight:600;">${formatRupiah(it.subtotal)}</span>
    </div>`
    )
    .join('');

  // proofUrl is a short-lived signed Vercel Blob URL resolved by the
  // route handler right before rendering (the "proofs" store is private).
  const proofBlock = proofUrl
    ? `<a href="${escapeAttr(proofUrl)}" target="_blank" style="display:block;">
        <img src="${escapeAttr(proofUrl)}" style="max-width:100%;border-radius:14px;border:1px solid var(--border);" onerror="this.replaceWith(Object.assign(document.createElement('div'),{innerText:'Berkas: ${escapeAttr(order.proof_filename || '')}',style:'padding:16px;background:var(--surface-2);border-radius:12px;font-size:13px;'}))">
      </a>`
    : `<span style="color:var(--text-muted);font-size:13px;">Tidak ada bukti transfer.</span>`;

  const emailStatus = order.email_sent
    ? `<span style="color:#3f7a42;font-weight:600;">Terkirim otomatis ke email toko</span>`
    : `<span style="color:#a13f3f;font-weight:600;">Belum terkirim otomatis${order.email_error ? ` — ${escapeHtml(order.email_error)}` : ''}</span>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('pesanan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main" style="max-width:900px;">
    ${backButton('/admin/pesanan', 'Kembali ke Pesanan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;"><a href="/admin/pesanan">Admin / Pesanan</a> / ${escapeHtml(order.order_number)}</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:24px;">Detail Pesanan ${escapeHtml(order.order_number)}</h1>

    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div class="card" style="flex:1 1 380px;">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Data Pemesan</h3>
        <div style="font-size:14px;margin-bottom:8px;"><strong>${escapeHtml(order.customer_name)}</strong></div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">WhatsApp: ${
          normalizeWhatsapp(order.whatsapp)
            ? `<a href="https://wa.me/${normalizeWhatsapp(order.whatsapp)}" target="_blank" rel="noopener">${escapeHtml(formatWhatsapp(order.whatsapp))}</a>`
            : escapeHtml(order.whatsapp)
        }</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:16px;">Catatan: ${order.notes ? escapeHtml(order.notes) : '(tidak ada)'}</div>

        <div style="background:var(--orange-soft);border-radius:12px;padding:14px 16px;margin-bottom:16px;">
          <div style="font-size:12px;font-weight:800;color:#7a4a1f;letter-spacing:0.4px;margin-bottom:8px;">PENGANTARAN</div>
          <div style="font-size:14px;color:#7a4a1f;margin-bottom:6px;">Tanggal: <strong>${
            order.delivery_date ? escapeHtml(formatDateID(order.delivery_date)) : '(tidak diisi)'
          }</strong></div>
          <div style="font-size:14px;color:#7a4a1f;">Lokasi: <strong>${
            order.address ? escapeHtml(order.address) : '(tidak diisi)'
          }</strong></div>
        </div>

        ${
          loyalty
            ? `<div style="background:${
                loyalty.rewardsAvailable > 0 ? 'var(--green-soft)' : 'var(--surface-2)'
              };border-radius:12px;padding:14px 16px;margin-bottom:16px;">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.4px;margin-bottom:8px;color:${
                  loyalty.rewardsAvailable > 0 ? 'var(--green-dark)' : 'var(--text-muted)'
                };">KARTU STEMPEL PELANGGAN</div>
                <div style="font-size:14px;margin-bottom:${loyalty.rewardsAvailable > 0 ? '12px' : '0'};">
                  <strong>${loyalty.displayStamps}/${loyalty.perReward}</strong> stempel di kartu saat ini
                  · ${loyalty.stamps} pesanan selesai seumur hidup
                </div>
                ${
                  loyalty.rewardsAvailable > 0
                    ? `<form method="post" action="/admin/pesanan/${order.id}/tukar-stempel" onsubmit="return confirm('Tukarkan 1 cup gratis untuk pelanggan ini?');" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <span style="font-size:13.5px;font-weight:700;color:var(--green-dark);">${loyalty.rewardsAvailable} cup gratis belum ditukar</span>
                        <button class="btn-primary" type="submit" style="padding:9px 16px;border-radius:9px;font-size:13px;font-weight:700;">Tukarkan 1 Cup Gratis</button>
                      </form>`
                    : ''
                }
              </div>`
            : ''
        }

        <div style="font-size:12.5px;color:var(--text-muted);">Email notifikasi: ${emailStatus}</div>

        <h3 style="font-size:15px;font-weight:800;margin:24px 0 12px;">Item Dipesan</h3>
        ${itemRows}
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;padding-top:16px;"><span>Total</span><span style="color:var(--green-dark);">${formatRupiah(order.total)}</span></div>

        <form method="post" action="/admin/pesanan/${order.id}/status" style="margin-top:20px;display:flex;gap:10px;">
          <select name="status" style="flex:1;">
            ${ORDER_STATUSES.map((s) => `<option value="${s.value}" ${order.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          <button class="btn-primary" type="submit" style="padding:0 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Update Status</button>
        </form>
      </div>

      <div class="card" style="flex:1 1 300px;">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Bukti Transfer</h3>
        ${proofBlock}
      </div>
    </div>
  </main>
</div>`;

  return page({ title: `${order.order_number} — Admin Pecup`, bodyHtml: body });
}

function renderAdminList({ admins, admin, error }) {
  const currentAdminId = admin.adminId;
  const rows = admins
    .map((a) => {
      const isSelf = a.id === currentAdminId;
      const roleBadge =
        a.role === 'superadmin'
          ? `<span style="font-size:11.5px;font-weight:700;color:#a15a1f;background:var(--orange-soft);padding:5px 11px;border-radius:99px;">Superadmin</span>`
          : `<span style="font-size:11.5px;font-weight:700;color:#3f7a42;background:var(--green-soft);padding:5px 11px;border-radius:99px;">Admin</span>`;
      return `
      <div class="row-hover" style="display:grid;grid-template-columns:1.6fr 1fr 1.2fr 0.8fr;align-items:center;padding:14px 22px;border-top:1px solid var(--border);">
        <span style="font-size:14px;font-weight:700;">${escapeHtml(a.username)}${isSelf ? ' <span style="color:var(--text-muted);font-weight:500;font-size:12px;">(kamu)</span>' : ''}</span>
        <div>${roleBadge}</div>
        <span style="font-size:12.5px;color:var(--text-muted);">${formatDateID(a.created_at)}</span>
        <div>
          ${
            isSelf
              ? ''
              : `<form method="post" action="/admin/akun/${a.id}/hapus" onsubmit="return confirm('Hapus admin ${escapeAttr(a.username)}?');">
                <button type="submit" class="icon-action" style="padding:6px;" title="Hapus">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c94f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                </button>
              </form>`
          }
        </div>
      </div>`;
    })
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('akun', { isSuperadmin: true, username: admin.username })}
  <main class="admin-main">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Kelola Admin</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:24px;">Kelola Admin</h1>

    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <div class="card" style="margin-bottom:28px;">
      <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Tambah Admin Baru</h3>
      <form method="post" action="/admin/akun/tambah" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="flex:1 1 200px;margin-bottom:0;"><label>Username <span class="req">*</span></label><input type="text" name="username" required placeholder="Contoh: Budi"></div>
        <div class="field" style="flex:1 1 200px;margin-bottom:0;"><label>Password <span class="req">*</span></label><input type="password" name="password" required minlength="6" placeholder="Minimal 6 karakter"></div>
        <div class="field" style="flex:1 1 160px;margin-bottom:0;">
          <label>Peran <span class="req">*</span></label>
          <select name="role">
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </div>
        <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;white-space:nowrap;">Tambah Admin</button>
      </form>
    </div>

    <div class="table-scroll" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:1.6fr 1fr 1.2fr 0.8fr;padding:14px 22px;background:var(--surface-2);font-size:12.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;min-width:520px;">
        <span>USERNAME</span><span>PERAN</span><span>DIBUAT</span><span>AKSI</span>
      </div>
      <div style="min-width:520px;">${rows}</div>
    </div>
  </main>
</div>`;

  return page({ title: 'Kelola Admin — Admin Pecup', bodyHtml: body });
}

function renderPelangganList({ customers, admin, perReward, expiryMonths, tierConfig, flash = '', error = '' }) {
  const rows = customers.length
    ? customers
        .map((c) => {
          const style = c.tierStyle;
          return `
      <div class="row-hover" style="display:grid;grid-template-columns:1.7fr 1.3fr 1.5fr 1fr 1.1fr;align-items:center;padding:14px 20px;border-top:1px solid var(--border);gap:12px;">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:700;">${escapeHtml(c.name)}</div>
          <a href="https://wa.me/${escapeAttr(c.whatsapp)}" target="_blank" rel="noopener" style="font-size:12px;">${escapeHtml(formatWhatsapp(c.whatsapp))}</a>
        </div>
        <div>
          ${
            tierConfig.enabled
              ? `<span style="font-size:11.5px;font-weight:800;letter-spacing:0.4px;padding:4px 12px;border-radius:99px;color:${style.color};background:${style.bg};white-space:nowrap;">${escapeHtml(c.tier.name.toUpperCase())}</span>`
              : `<span style="font-size:12px;color:var(--text-muted);">&mdash;</span>`
          }
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">${c.claims}&times; klaim gratis</div>
        </div>
        <form method="post" action="/admin/pelanggan/${c.id}/stempel" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <input type="number" name="stamps" value="${c.stamps}" min="0" max="999" style="width:62px;padding:6px 4px;text-align:center;font-size:13.5px;font-weight:700;border-radius:7px;">
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;">/ ${perReward}</span>
          <button class="btn-outline" type="submit" style="padding:6px 11px;border-radius:8px;font-size:12px;font-weight:700;">Simpan</button>
        </form>
        <span style="font-size:12px;color:var(--text-muted);">${
          c.expiresLabel ? `Habis<br><strong style="color:var(--text);">${escapeHtml(c.expiresLabel)}</strong>` : '&mdash;'
        }</span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${
            c.cardComplete
              ? `<form method="post" action="/admin/pelanggan/${c.id}/klaim" onsubmit="return confirm('Tukarkan 1 cup gratis? Stempel akan kembali ke nol.');">
                  <button class="btn-primary" type="submit" style="padding:7px 13px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;">Tukar Gratis</button>
                </form>`
              : `<span style="font-size:12px;color:var(--text-muted);">belum penuh</span>`
          }
        </div>
      </div>`;
        })
        .join('')
    : `<div style="padding:32px 22px;color:var(--text-muted);font-size:14px;">Belum ada pelanggan yang mendaftar akun.</div>`;

  const tierRows = tierConfig.tiers
    .map(
      (t, i) => `
      <div style="display:grid;grid-template-columns:1.3fr 0.9fr 0.9fr 1fr 1fr;gap:10px;align-items:end;padding:12px 0;border-top:1px solid var(--border);">
        <div style="margin:0;"><label style="margin-bottom:4px;font-size:12px;">Nama</label><input type="text" name="tierName" value="${escapeAttr(t.name)}" maxlength="30" required style="padding:9px 11px;"></div>
        <div style="margin:0;"><label style="margin-bottom:4px;font-size:12px;">Min. klaim</label><input type="number" name="tierMinClaims" value="${t.minClaims}" min="0" max="999" required style="padding:9px 11px;"></div>
        <div style="margin:0;"><label style="margin-bottom:4px;font-size:12px;">Diskon %</label><input type="number" name="tierDiscount" value="${t.discountPercent}" min="0" max="100" required style="padding:9px 11px;"></div>
        <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;margin:0 0 9px;font-weight:500;">
          <input type="checkbox" name="tierWeekly" value="${i}" ${t.weeklyFreeCup ? 'checked' : ''} style="width:16px;height:16px;"> Diskon mingguan
        </label>
        <label style="display:flex;align-items:center;gap:7px;font-size:12.5px;margin:0 0 9px;font-weight:500;">
          <input type="checkbox" name="tierBirthday" value="${i}" ${t.birthdayFreeCup ? 'checked' : ''} style="width:16px;height:16px;"> Gratis ulang tahun
        </label>
      </div>`
    )
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('pelanggan', { isSuperadmin: true, username: admin.username })}
  <main class="admin-main">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Pelanggan &amp; Stempel</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:20px;">Pelanggan &amp; Stempel</h1>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <form method="post" action="/admin/pengaturan/stempel" class="card" style="padding:20px 22px;margin-bottom:20px;">
      <h2 style="font-size:16px;font-weight:800;margin-bottom:14px;">Aturan Stempel</h2>
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div style="margin:0;flex:0 1 200px;">
          <label style="margin-bottom:5px;">Stempel untuk 1 cup gratis</label>
          <input type="number" name="perReward" value="${perReward}" min="1" max="100" required style="padding:10px 12px;">
        </div>
        <div style="margin:0;flex:0 1 200px;">
          <label style="margin-bottom:5px;">Stempel kedaluwarsa (bulan)</label>
          <input type="number" name="expiryMonths" value="${expiryMonths}" min="1" max="60" required style="padding:10px 12px;">
        </div>
        <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Simpan Aturan</button>
      </div>
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin:14px 0 0;">Kedaluwarsa dihitung sejak stempel <strong>pertama</strong> di kartu berjalan. Lewat itu, seluruh kartu hangus dan mulai lagi dari nol.</p>
    </form>

    <form method="post" action="/admin/pengaturan/tier" class="card" style="padding:20px 22px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
        <h2 style="font-size:16px;font-weight:800;">Membership Tier</h2>
        <label style="display:flex;align-items:center;gap:9px;margin:0;font-size:13.5px;font-weight:700;">
          <input type="checkbox" name="tiersEnabled" value="1" ${tierConfig.enabled ? 'checked' : ''} style="width:20px;height:20px;">
          Aktifkan fitur tier
        </label>
      </div>
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:4px;">Tingkat naik berdasarkan berapa kali pelanggan sudah klaim cup gratis. Matikan centang di atas untuk menyembunyikan fitur ini dari pelanggan.</p>
      ${tierRows}
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;margin-top:18px;">Simpan Tier</button>
    </form>

    <div class="table-scroll" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:1.7fr 1.3fr 1.5fr 1fr 1.1fr;padding:14px 20px;background:var(--surface-2);font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;min-width:800px;gap:12px;">
        <span>PELANGGAN</span><span>TIER</span><span>STEMPEL</span><span>KEDALUWARSA</span><span>AKSI</span>
      </div>
      <div style="min-width:800px;">${rows}</div>
    </div>
    <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;line-height:1.7;">
      Stempel bertambah otomatis tiap pesanan berstatus <strong>Selesai</strong>. Mengubah angkanya di sini menambah atau menghapus stempel secara manual, dan tercatat di log aktivitas.
    </p>
  </main>
</div>`;

  return page({ title: 'Pelanggan & Stempel — Admin Pecup', bodyHtml: body });
}

function actionLabel(action) {
  const labels = {
    login: 'Masuk (login)',
    'product.create': 'Menambah produk',
    'product.update': 'Mengubah produk',
    'product.delete': 'Menghapus produk',
    'product.toggle': 'Mengubah status tampil produk',
    'order.status_update': 'Mengubah status pesanan',
    'admin.create': 'Menambah admin',
    'admin.delete': 'Menghapus admin',
    'product.stock': 'Mengubah stok produk',
    'loyalty.redeem': 'Menukar cup gratis',
    'loyalty.stamps': 'Mengubah stempel pelanggan',
    'settings.update': 'Mengubah pengaturan toko',
  };
  return labels[action] || action;
}

// Builds a /admin/log-aktivitas URL carrying the current filters, changing
// only the keys passed in — so paging keeps the filters and vice versa.
function logUrl(filters, overrides = {}) {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `/admin/log-aktivitas${qs ? `?${qs}` : ''}`;
}

function pager(filters, current, totalPages) {
  if (totalPages <= 1) return '';
  const link = (targetPage, label, disabled) =>
    disabled
      ? `<span style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:700;color:var(--text-muted);opacity:0.45;">${label}</span>`
      : `<a class="btn-outline" href="${logUrl(filters, { halaman: targetPage })}" style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:700;">${label}</a>`;

  // Window of page numbers around the current page, so 40 pages don't all render.
  const windowSize = 5;
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const numbers = [];
  for (let p = start; p <= end; p += 1) {
    numbers.push(
      p === current
        ? `<span style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:800;background:var(--green);color:#fff;">${p}</span>`
        : `<a class="btn-outline" href="${logUrl(filters, { halaman: p })}" style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:700;">${p}</a>`
    );
  }

  return `
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:20px;">
      ${link(1, '« Awal', current === 1)}
      ${link(current - 1, '‹ Sebelumnya', current === 1)}
      ${numbers.join('')}
      ${link(current + 1, 'Berikutnya ›', current === totalPages)}
      ${link(totalPages, 'Akhir »', current === totalPages)}
    </div>`;
}

function renderAdminLog({ logs, admin, filters = {}, page: current = 1, totalPages = 1, total = 0, sort = 'desc', options = {} }) {
  const rows = logs.length
    ? logs
        .map(
          (l) => `
      <div class="row-hover" style="display:grid;grid-template-columns:1.3fr 1fr 1.4fr 1.6fr;align-items:center;padding:12px 20px;border-top:1px solid var(--border);">
        <span style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;">${escapeHtml(formatDateTimeID(l.created_at))}</span>
        <span style="font-size:13.5px;font-weight:700;">${escapeHtml(l.admin_username)}</span>
        <span style="font-size:13px;">${escapeHtml(actionLabel(l.action))}</span>
        <span style="font-size:12.5px;color:var(--text-muted);">${l.detail ? escapeHtml(l.detail) : '—'}</span>
      </div>`
        )
        .join('')
    : `<div style="padding:32px 22px;color:var(--text-muted);font-size:14px;">Tidak ada aktivitas yang cocok dengan filter ini.</div>`;

  const firstShown = total === 0 ? 0 : (current - 1) * (filters.per || 25) + 1;
  const lastShown = Math.min(current * (filters.per || 25), total);
  const nextSort = sort === 'desc' ? 'asc' : 'desc';

  const body = `
<div class="admin-shell">
  ${adminSidebar('log', { isSuperadmin: true, username: admin.username })}
  <main class="admin-main">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Log Aktivitas</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:20px;">Log Aktivitas</h1>

    <form method="get" action="/admin/log-aktivitas" class="card" style="padding:18px 20px;margin-bottom:20px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
      <div style="margin:0;flex:0 1 150px;">
        <label style="margin-bottom:5px;">Dari Tanggal</label>
        <input type="date" name="dari" value="${escapeAttr(filters.dari || '')}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:0 1 150px;">
        <label style="margin-bottom:5px;">Sampai Tanggal</label>
        <input type="date" name="sampai" value="${escapeAttr(filters.sampai || '')}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:0 1 150px;">
        <label style="margin-bottom:5px;">Admin</label>
        <select name="admin" style="padding:10px 12px;">
          <option value="">Semua admin</option>
          ${(options.admins || [])
            .map((a) => `<option value="${escapeAttr(a)}" ${filters.admin === a ? 'selected' : ''}>${escapeHtml(a)}</option>`)
            .join('')}
        </select>
      </div>
      <div style="margin:0;flex:0 1 190px;">
        <label style="margin-bottom:5px;">Jenis Aksi</label>
        <select name="aksi" style="padding:10px 12px;">
          <option value="">Semua aksi</option>
          ${(options.actions || [])
            .map((a) => `<option value="${escapeAttr(a)}" ${filters.aksi === a ? 'selected' : ''}>${escapeHtml(actionLabel(a))}</option>`)
            .join('')}
        </select>
      </div>
      <div style="margin:0;flex:0 1 120px;">
        <label style="margin-bottom:5px;">Per Halaman</label>
        <select name="per" style="padding:10px 12px;">
          ${[25, 50, 100]
            .map((n) => `<option value="${n}" ${Number(filters.per || 25) === n ? 'selected' : ''}>${n}</option>`)
            .join('')}
        </select>
      </div>
      <input type="hidden" name="urut" value="${escapeAttr(sort)}">
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Terapkan</button>
      <a class="btn-outline" href="/admin/log-aktivitas" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Reset</a>
    </form>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <p style="font-size:13px;color:var(--text-muted);">
        ${total === 0 ? 'Tidak ada aktivitas.' : `Menampilkan <strong>${firstShown}–${lastShown}</strong> dari <strong>${total}</strong> aktivitas`}
        ${totalPages > 1 ? ` · halaman ${current} dari ${totalPages}` : ''}
      </p>
      <a class="btn-outline" href="${logUrl(filters, { urut: nextSort, halaman: 1 })}" style="padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:7px;">
        ${sort === 'desc' ? 'Terbaru dulu' : 'Terlama dulu'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${sort === 'desc' ? 0 : 180}deg);"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
      </a>
    </div>

    <div class="table-scroll" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:1.3fr 1fr 1.4fr 1.6fr;padding:14px 20px;background:var(--surface-2);font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;min-width:660px;">
        <span>WAKTU (WIB)</span><span>ADMIN</span><span>AKSI</span><span>DETAIL</span>
      </div>
      <div style="min-width:660px;">${rows}</div>
    </div>
    ${pager(filters, current, totalPages)}
  </main>
</div>`;

  return page({ title: 'Log Aktivitas — Admin Pecup', bodyHtml: body });
}

module.exports = {
  renderPelangganList,
  renderLogin,
  renderProdukList,
  renderProdukForm,
  renderPesananList,
  renderPesananDetail,
  renderAdminList,
  renderAdminLog,
};
