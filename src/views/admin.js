const { page, adminSidebar, logoMark, backButton } = require('./layout');
const { productThumb, productMedia } = require('./productIcon');
const { isVideoUrl, MAX_VIDEO_BYTES, PRODUCT_VIDEO_TYPES } = require('../media');
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
  toDateKey,
  ORDER_STATUSES,
  comboRangeText,
} = require('../utils');
const { tierStyle: tierStyleFor } = require('../loyalty');
const { discountLines, taxLine, freeCupValue } = require('../orderMoney');
const permissions = require('../permissions');

// What the sidebar needs to know about who is looking at the page: their name,
// whether they're the owner, and the exact set of things they're allowed to
// open — so the menu never offers a page that would turn them away.
function sidebarProps(admin) {
  return {
    isSuperadmin: Boolean(admin && admin.role === 'superadmin'),
    username: (admin && admin.username) || 'Admin',
    can: new Set(permissions.permissionsFor(admin)),
  };
}

/** Does the admin looking at this page hold this permission? */
function can(admin, key) {
  return permissions.has(admin, key);
}

function renderLogin({ error }) {
  const body = `
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);">
  <div class="card" style="width:100%;max-width:380px;">
    <a href="/" class="brand-link" style="gap:10px;margin-bottom:24px;justify-content:center;" aria-label="Pecup — buka halaman toko">
      ${logoMark(34)}
      <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:20px;">Pecup Admin</span>
    </a>
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/admin/login">
      <div class="field"><label>Username</label><input type="text" name="username" required autofocus></div>
      <div class="field" style="margin-bottom:8px;"><label>Password</label><input type="password" name="password" required></div>
      <button class="btn-primary" type="submit" style="width:100%;padding:14px;border-radius:11px;font-size:14.5px;font-weight:700;margin-top:14px;">Masuk</button>
    </form>
  </div>
</div>`;
  return page({ title: 'Masuk Admin — Pecup', bodyHtml: body, noindex: true });
}

// ---- responsive admin table -------------------------------------------
// One row definition drives both layouts: a grid on desktop, a stacked
// labelled card on a phone (see .adm-* in layout.js). Every admin table goes
// through here so none of them can drift back to being a wide table that only
// works sideways on mobile.
//
// cells: [{ label, html, label:'' to span full width }]
function admRow(cells, { href = null, style = '' } = {}) {
  const inner = cells
    .map((c) => `<div class="adm-cell" data-label="${escapeAttr(c.label || '')}">${c.html}</div>`)
    .join('');
  return href
    ? `<a class="adm-row row-hover" href="${href}" style="${style}">${inner}</a>`
    : `<div class="adm-row row-hover" style="${style}">${inner}</div>`;
}

function admTable({ cols, minWidth = 0, head = [], rows = '', empty = 'Tidak ada data.', note = '' }) {
  const vars = `--cols:${cols};${minWidth ? `--min:${minWidth}px;` : ''}`;
  return `
    <div class="adm-table" style="${vars}">
      <div class="adm-scroll">
        ${head.length ? `<div class="adm-head">${head.map((h) => `<span>${h}</span>`).join('')}</div>` : ''}
        <div class="adm-rows">${rows || `<div class="adm-empty">${empty}</div>`}</div>
      </div>
    </div>
    ${note ? `<p class="adm-note">${note}</p>` : ''}`;
}

function statCard(label, value, bg, iconPath, stroke = '#3f7a42') {
  return `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 22px;display:flex;align-items:center;gap:16px;">
    <div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" style="flex-shrink:0;">${iconPath}</svg>
    </div>
    <div style="min-width:0;"><div style="font-size:22px;font-weight:800;">${value}</div><div style="font-size:12.5px;color:var(--text-muted);">${label}</div></div>
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
  // Nothing to count, and nothing to step up or down — showing a number here
  // would invite someone to "top it up" forever for no reason.
  if (p.unlimited_stock) {
    return `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:16px;font-weight:800;color:var(--green-dark);line-height:1;">&infin;</span>
          <span style="font-size:10.5px;font-weight:800;color:#3f7a42;background:var(--green-soft);padding:3px 8px;border-radius:99px;white-space:nowrap;">TANPA BATAS</span>
        </div>`;
  }
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

// Small markers in the product table so the two combination switches are
// visible without opening every product: which cups are built from choices,
// and which products are offered as one of those choices.
function comboTags(p) {
  const tag = (text, bg, color) =>
    `<span style="display:inline-block;margin-left:7px;padding:2px 8px;border-radius:99px;background:${bg};color:${color};font-size:10.5px;font-weight:800;vertical-align:middle;white-space:nowrap;">${text}</span>`;
  return (
    (p.combo_enabled ? tag('KOMBINASI', 'var(--green-soft)', '#3f7a42') : '') +
    (p.combo_option ? tag('PILIHAN ISI', 'var(--orange-soft)', '#7a4a1f') : '')
  );
}

function renderProdukList({ products, stats, flash, admin, view = {}, categories = [], totalCount = 0 }) {
  const rows = products.length
    ? products
        .map((p) =>
          admRow(
            [
              {
                label: '',
                html: `<div class="adm-lead">
          <div class="adm-thumb">${productThumb(p, { size: 40, radius: 12 })}</div>
          <span class="adm-lead-name">${escapeHtml(p.name)}${comboTags(p)}</span>
        </div>`,
              },
              {
                label: 'Kategori',
                html: `<a href="${produkUrl(view, { kategori: p.category, halaman: '' })}" style="font-size:13.5px;color:var(--text-muted);">${escapeHtml(p.category)}</a>`,
              },
              { label: 'Harga', html: `<span class="tnum" style="font-size:13.5px;font-weight:600;">${formatRupiah(p.price)}</span>` },
              { label: 'Stok', html: stockCell(p) },
              {
                label: 'Status',
                html: `<form method="post" action="/admin/produk/${p.id}/toggle" style="display:flex;align-items:center;">
          <button type="submit" class="toggle-pill ${p.active ? 'toggle-on' : 'toggle-off'}" title="Klik untuk ${p.active ? 'nonaktifkan' : 'aktifkan'}">
            <span class="toggle-dot"></span>
          </button>
          <span style="font-size:11.5px;font-weight:700;margin-left:8px;color:${p.active ? '#3f7a42' : 'var(--text-muted)'};">${p.active ? 'Aktif' : 'Nonaktif'}</span>
        </form>`,
              },
              {
                label: 'Aksi',
                html: `<div style="display:flex;gap:6px;justify-content:flex-end;">
          <a class="icon-action" href="/admin/produk/${p.id}/edit" style="padding:6px;display:inline-flex;align-items:center;gap:6px;color:#3f7a42;font-size:12px;font-weight:700;" title="Edit">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            <span class="hide-desktop">Edit</span>
          </a>
          <form method="post" action="/admin/produk/${p.id}/hapus" data-confirm="Hapus produk ${escapeAttr(p.name)}?">
            <button type="submit" class="icon-action" style="padding:6px;display:inline-flex;align-items:center;gap:6px;color:#c94f4f;font-size:12px;font-weight:700;" title="Hapus">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c94f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
              <span class="hide-desktop">Hapus</span>
            </button>
          </form>
        </div>`,
              },
            ],
            // Pink = sold out. An unlimited product can't be, whatever its number says.
            { style: !p.unlimited_stock && Number(p.stock) <= 0 ? 'background:oklch(99% 0.012 25);' : '' }
          )
        )
        .join('')
    : '';

  // Each card is a link that filters the table to exactly what it counts.
  const clickableStat = (label, value, statusKey, bg, iconPath, stroke) => {
    const isActive = (view.status || 'semua') === statusKey;
    return `<a href="${produkUrl(view, { status: statusKey })}" style="display:block;color:inherit;">
      <div style="background:var(--surface);border:${isActive ? '2px solid var(--green)' : '1px solid var(--border)'};border-radius:16px;padding:${
        isActive ? '19px 21px' : '20px 22px'
      };display:flex;align-items:center;gap:16px;transition:border-color 0.18s ease, transform 0.15s ease;" class="stat-card">
        <div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
        </div>
        <div><div style="font-size:22px;font-weight:800;">${value}</div><div style="font-size:12.5px;color:var(--text-muted);">${label}</div></div>
      </div>
    </a>`;
  };

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk', sidebarProps(admin))}
  <main class="admin-main" id="konten">
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

    <div class="card chip-row" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
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

    ${admTable({
      cols: '2.2fr 1.1fr 1fr 1.6fr 1fr 1fr',
      minWidth: 820,
      head: [
        sortHeader('PRODUK', 'nama', view),
        sortHeader('KATEGORI', 'kategori', view),
        sortHeader('HARGA', 'harga', view),
        sortHeader('STOK', 'stok', view),
        'STATUS',
        'AKSI',
      ],
      rows,
      empty:
        totalCount > 0
          ? 'Tidak ada produk yang cocok dengan filter ini.'
          : 'Belum ada produk. Klik &ldquo;Tambah Produk Baru&rdquo; untuk mulai mengisi inventori.',
      note: 'Stok tersimpan otomatis — pakai tombol &minus;/+ atau ketik angkanya langsung. Klik judul kolom untuk mengurutkan.',
    })}
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

  return page({ title: 'Kelola Produk — Admin Pecup', bodyHtml: body, noindex: true });
}

// The gallery editor: each item carries a hidden `fotoUrutan` input, so the
// order the tiles are in when the form is submitted *is* the saved order —
// no separate "position" field to keep in sync. The first tile is the main
// item and is labelled as such, which is why moving one left matters.
//
// Photos and videos share this grid and reorder identically; only what's
// drawn inside the frame differs.
function photoReorder(items) {
  const tiles = items
    .map((url) => {
      const video = isVideoUrl(url);
      const what = video ? 'Video' : 'Foto';
      const inner = video
        ? `<video src="${escapeAttr(url)}#t=0.1" muted playsinline preload="metadata"
                  aria-label="Video produk"></video>
           <span class="foto-jenis">VIDEO</span>`
        : `<img src="${escapeAttr(url)}" alt="Foto produk" draggable="false">`;
      return `
      <div class="foto-tile" draggable="true" data-url="${escapeAttr(url)}" tabindex="0"
           role="listitem" aria-label="${what} produk — seret untuk mengurutkan, atau tekan panah kiri/kanan">
        <input type="hidden" name="fotoUrutan" value="${escapeAttr(url)}">
        <div class="foto-frame">
          ${inner}
          <span class="foto-utama">UTAMA</span>
          <span class="foto-grip" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
          </span>
        </div>
        <label class="foto-hapus" title="Centang untuk menghapus ${what.toLowerCase()} ini saat disimpan">
          <input type="checkbox" name="hapusFoto" value="${escapeAttr(url)}"> Hapus
        </label>
      </div>`;
    })
    .join('');

  return `
    <style>
      .foto-grid{display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:10px;margin-bottom:10px;}
      .foto-tile{display:flex;flex-direction:column;gap:5px;cursor:grab;border-radius:12px;
        transition:opacity 0.16s ease, transform 0.16s ease;}
      .foto-tile:active{cursor:grabbing;}
      .foto-tile:focus-visible{outline:2.5px solid var(--orange);outline-offset:3px;}
      .foto-frame{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);}
      .foto-frame img, .foto-frame video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;}
      .foto-frame video{background:#0b0b0c;}
      .foto-utama{display:none;position:absolute;top:4px;left:4px;background:var(--green);color:#fff;font-size:8.5px;
        font-weight:800;letter-spacing:0.3px;padding:3px 7px;border-radius:99px;}
      /* Marks a tile as a clip, at the bottom so it never sits under the
         UTAMA badge or the drag grip. */
      .foto-jenis{position:absolute;left:4px;bottom:4px;background:rgba(17,17,19,0.72);color:#fff;font-size:8.5px;
        font-weight:800;letter-spacing:0.4px;padding:3px 7px;border-radius:99px;pointer-events:none;}
      /* Whichever tile is first in the DOM is the main photo — so the badge
         and the green frame follow the order instead of being baked in. */
      .foto-tile:first-child .foto-utama{display:block;}
      .foto-tile:first-child .foto-frame{border:2px solid var(--green);}
      .foto-grip{position:absolute;top:4px;right:4px;width:30px;height:30px;border-radius:8px;
        background:rgba(255,255,255,0.92);color:#3a3a40;display:flex;align-items:center;justify-content:center;
        box-shadow:0 1px 4px rgba(0,0,0,0.18);cursor:grab;
        /* The browser must not claim the gesture for scrolling, or a touch
           drag turns into a page scroll and the tile never moves. */
        touch-action:none;}
      .foto-grip:active{cursor:grabbing;}
      @media (max-width: 560px){ .foto-grip{width:34px;height:34px;} }
      /* The tile being carried. */
      .foto-tile.is-dragging{opacity:0.4;transform:scale(0.96);}
      /* Where it would land. */
      .foto-tile.is-over .foto-frame{outline:2.5px dashed var(--orange);outline-offset:2px;}
      .foto-hapus{display:flex;align-items:center;justify-content:center;gap:4px;margin:0;font-size:10px;
        font-weight:700;color:#a13f3f;cursor:pointer;}
      .foto-hapus input{width:12px;height:12px;margin:0;padding:0;}
      /* A photo marked for deletion stays put but visibly steps back. */
      .foto-tile.is-removing .foto-frame{opacity:0.35;filter:grayscale(1);}
      @media (max-width: 560px){ .foto-grid{grid-template-columns:repeat(2, minmax(0,1fr));} }
    </style>
    <div class="foto-grid" id="fotoGaleri" role="list">${tiles}</div>
    <p style="font-size:11.5px;color:var(--text-muted);line-height:1.6;margin:0 0 14px;">
      Seret untuk mengurutkan — di HP, tahan ikon titik-titik di pojok lalu geser.
      Bisa juga pilih satu lalu tekan tombol panah &larr; &rarr; di keyboard. Yang pertama jadi tampilan utama.
    </p>
    <script>
    (function(){
      var grid = document.getElementById('fotoGaleri');
      if(!grid) return;
      var dragging = null;

      function tiles(){ return Array.prototype.slice.call(grid.querySelectorAll('.foto-tile')); }
      function clearOver(){ tiles().forEach(function(t){ t.classList.remove('is-over'); }); }

      grid.addEventListener('dragstart', function(e){
        var tile = e.target.closest('.foto-tile');
        if(!tile) return;
        dragging = tile;
        tile.classList.add('is-dragging');
        // Firefox refuses to start a drag unless some data is set.
        try{ e.dataTransfer.setData('text/plain', tile.dataset.url || ''); }catch(err){}
        e.dataTransfer.effectAllowed = 'move';
      });

      grid.addEventListener('dragend', function(){
        if(dragging) dragging.classList.remove('is-dragging');
        dragging = null;
        clearOver();
      });

      grid.addEventListener('dragover', function(e){
        if(!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        var over = e.target.closest('.foto-tile');
        if(!over || over === dragging) return;
        clearOver();
        over.classList.add('is-over');
        // Insert before or after depending on which half we're over, so the
        // tile lands where the pointer actually is.
        var box = over.getBoundingClientRect();
        var after = (e.clientX - box.left) > box.width / 2;
        grid.insertBefore(dragging, after ? over.nextSibling : over);
      });

      grid.addEventListener('drop', function(e){ e.preventDefault(); clearOver(); });

      // ---- touch / pen dragging ------------------------------------------
      // HTML5 drag-and-drop (the handlers above) never fires on a touch
      // screen, so phones got a gallery that looked draggable and wasn't.
      // Pointer events cover mouse, pen and touch uniformly; the grip is the
      // handle so a normal swipe still scrolls the page.
      var touchTile = null;

      function tileFromPoint(x, y){
        var el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('.foto-tile') : null;
      }

      grid.addEventListener('pointerdown', function(e){
        if(e.pointerType === 'mouse') return;      // mouse keeps native DnD
        var grip = e.target.closest('.foto-grip');
        if(!grip) return;
        touchTile = grip.closest('.foto-tile');
        if(!touchTile) return;
        e.preventDefault();
        touchTile.classList.add('is-dragging');
        // Keep receiving moves even when the finger leaves the grip.
        try{ grip.setPointerCapture(e.pointerId); }catch(err){}
      });

      grid.addEventListener('pointermove', function(e){
        if(!touchTile) return;
        e.preventDefault();
        var over = tileFromPoint(e.clientX, e.clientY);
        if(!over || over === touchTile) return;
        clearOver();
        over.classList.add('is-over');
        var box = over.getBoundingClientRect();
        var after = (e.clientX - box.left) > box.width / 2;
        grid.insertBefore(touchTile, after ? over.nextSibling : over);
      });

      function endTouchDrag(){
        if(!touchTile) return;
        touchTile.classList.remove('is-dragging');
        touchTile = null;
        clearOver();
      }
      grid.addEventListener('pointerup', endTouchDrag);
      grid.addEventListener('pointercancel', endTouchDrag);

      // Keyboard equivalent, so reordering doesn't require a mouse.
      grid.addEventListener('keydown', function(e){
        var tile = e.target.closest('.foto-tile');
        if(!tile) return;
        if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        if(e.key === 'ArrowLeft' && tile.previousElementSibling){
          grid.insertBefore(tile, tile.previousElementSibling);
        } else if(e.key === 'ArrowRight' && tile.nextElementSibling){
          grid.insertBefore(tile.nextElementSibling, tile);
        }
        tile.focus();
      });

      grid.addEventListener('change', function(e){
        var box = e.target;
        if(!box.matches || !box.matches('.foto-hapus input')) return;
        box.closest('.foto-tile').classList.toggle('is-removing', box.checked);
      });
    })();
    </script>`;
}

function renderProdukForm({
  product,
  error,
  categories = [],
  admin,
  pendingVideos = [],
  // The stockroom list is passed only when this admin may manage it; empty
  // means the packaging section isn't drawn at all.
  inventoryItems = [],
  materials = [],
  // Every product currently ticked as "pilihan isi" — shown here so the admin
  // can see exactly which choices a combination cup will offer, and why there
  // are that many of them.
  comboOptions = [],
  // The catalogue, for ticking which products may go inside THIS one, and the
  // ids currently ticked for it.
  allProducts = [],
  comboChoices = [],
}) {
  const isEdit = Boolean(product && product.id);
  const materialCostPerCup = materials.reduce(
    (sum, m) => sum + Number(m.qty || 0) * (Number(m.unit_cost) || 0),
    0
  );
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
    combo_enabled: 0,
    combo_option: 0,
    combo_min: 2,
    combo_max: 3,
    unlimited_stock: 0,
  };
  // Bouncing the form hands back the posted fields, where a checkbox that was
  // ticked arrives as "1" and the numbers as text — so read both shapes.
  const comboOn = Boolean(Number(p.combo_enabled) || p.combo_enabled === true || p.comboEnabled);
  const comboIsOption = Boolean(Number(p.combo_option) || p.combo_option === true || p.comboOption);
  const comboMinValue = Number(p.combo_min ?? p.comboMin) || 2;
  const comboMaxValue = Number(p.combo_max ?? p.comboMax) || 3;
  // A product can't be a choice inside itself, so it is never listed here.
  const otherOptions = comboOptions.filter((o) => !isEdit || Number(o.id) !== Number(p.id));
  const existingMedia = productMedia(p);
  const videoAccept = Object.keys(PRODUCT_VIDEO_TYPES).join(',');
  const maxVideoMb = Math.round(MAX_VIDEO_BYTES / 1024 / 1024);

  // Clips uploaded before the form bounced on a validation error. They are
  // already sitting in penyimpanan, so they're handed straight back rather
  // than making the admin upload 40MB a second time.
  const pendingRows = pendingVideos
    .map(
      (url) => `
      <div class="video-row is-done">
        <div class="video-row-top">
          <div class="video-row-name">Video siap disimpan</div>
          <button type="button" class="video-row-drop">Batal</button>
        </div>
        <div class="video-row-note">Video siap — tersimpan setelah produk disimpan.</div>
        <input type="hidden" name="videoBaru" value="${escapeAttr(url)}">
        <video src="${escapeAttr(url)}#t=0.1" muted playsinline controls preload="metadata"></video>
      </div>`
    )
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <form method="post" action="${isEdit ? `/admin/produk/${p.id}/edit` : '/admin/produk/tambah'}" enctype="multipart/form-data" data-warn-unsaved style="margin-top:20px;">
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
            <h3 style="font-size:15px;font-weight:800;margin-bottom:6px;">Foto &amp; Video Produk</h3>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">Yang pertama jadi <strong>tampilan utama</strong>. Kalau lebih dari satu, pembeli bisa geser-geser di halaman produk — video ikut diputar di sana.</p>
            ${isEdit && existingMedia.length ? photoReorder(existingMedia) : ''}
            <div class="dropzone" style="padding:24px;text-align:center;">
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" multiple style="border:none;padding:0;background:transparent;">
              <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">JPG / PNG / WEBP${
                isEdit ? ' — foto baru ditambahkan ke galeri' : ''
              }. Bisa pilih beberapa sekaligus.</div>
            </div>

            <!-- Video is uploaded straight from this page to penyimpanan, not
                 through the form: a clip is far bigger than the request body
                 limit. What the form posts is only the resulting address. -->
            <div class="video-add" id="videoAdd">
              <label class="video-pick">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.5 10.5l5.2-3v9l-5.2-3z"/><rect x="2.8" y="6" width="12.7" height="12" rx="2.6"/></svg>
                <span>Tambah Video</span>
                <input type="file" id="videoPick" accept="${escapeAttr(videoAccept)}">
              </label>
              <div style="font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.6;">
                MP4 / WEBM / MOV, maksimal ${maxVideoMb}MB. Klip pendek 5&ndash;15 detik paling enak dilihat pembeli.
              </div>
              <div class="video-queue" id="videoQueue">${pendingRows}</div>
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
            <div class="field" style="flex:1 1 180px;">
              <label>Stok Tersedia <span class="req">*</span></label>
              <input type="number" name="stock" required min="0" value="${escapeAttr(p.stock)}" placeholder="Contoh: 24">
              <label style="display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:12.5px;font-weight:600;cursor:pointer;">
                <input type="checkbox" name="unlimitedStock" value="1" ${
                  Number(p.unlimited_stock) || p.unlimited_stock === true || p.unlimitedStock ? 'checked' : ''
                } style="width:17px;height:17px;flex-shrink:0;">
                Stok tanpa batas (selalu tersedia)
              </label>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
                Untuk produk yang dibuat dadakan dari buah curah — stoknya tidak pernah dihitung,
                tidak pernah habis, dan angka di atas diabaikan.
              </div>
            </div>
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

          <!-- Combinations. Two separate switches, because they answer two
               different questions: is THIS cup built from choices, and is this
               product offered as one of those choices. Nothing here is tied to
               the category name any more, so any product can be either, both,
               or neither — and the choice list is simply the catalogue. -->
          <div style="background:var(--green-soft);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:800;color:var(--green-dark);margin-bottom:4px;">Kombinasi Isi (opsional)</div>
            <p style="font-size:12.5px;color:var(--green-dark);line-height:1.6;margin-bottom:14px;">
              Untuk produk seperti <strong>Mix Buah</strong> — pembeli (atau admin, saat catat manual) memilih sendiri isi tiap cup.
            </p>

            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:var(--surface);border-radius:11px;padding:14px 16px;">
              <div style="flex:1 1 220px;min-width:0;">
                <div style="font-size:13.5px;font-weight:700;">Isinya dipilih pembeli</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:3px;line-height:1.6;">
                  Produk ini jadi produk kombinasi: di halaman produk muncul daftar pilihan isi, dan di catat manual tiap cup bisa beda isinya.
                </div>
              </div>
              <label style="margin:0;flex:0 0 auto;">
                <input type="checkbox" name="comboEnabled" value="1" ${comboOn ? 'checked' : ''} style="width:20px;height:20px;">
              </label>
            </div>

            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;">
              <div class="field" style="flex:1 1 150px;margin-bottom:0;">
                <label style="color:var(--green-dark);">Minimal Pilihan / cup</label>
                <input type="number" name="comboMin" min="1" max="20" value="${escapeAttr(comboMinValue)}">
              </div>
              <div class="field" style="flex:1 1 150px;margin-bottom:0;">
                <label style="color:var(--green-dark);">Maksimal Pilihan / cup</label>
                <input type="number" name="comboMax" min="1" max="20" value="${escapeAttr(comboMaxValue)}">
              </div>
            </div>
            <div style="font-size:11.5px;color:var(--green-dark);margin-top:8px;line-height:1.6;">
              Contoh: minimal 2, maksimal 3 &rarr; pembeli harus pilih 2 atau 3 buah per cup.
            </div>

            <!-- Per-product choices: tick exactly what may go inside THIS cup.
                 Two combo products can therefore offer two different lists. -->
            <div style="margin-top:16px;background:var(--surface);border-radius:11px;padding:14px 16px;">
              <div style="font-size:13.5px;font-weight:700;margin-bottom:4px;">Isi yang boleh dipilih untuk produk ini</div>
              <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin:0 0 12px;">
                Centang produk mana saja yang boleh jadi isi cup ini — bebas, tidak harus buah potong.
                ${
                  comboChoices.length
                    ? 'Yang tidak dicentang tidak akan muncul sebagai pilihan.'
                    : 'Belum ada yang dicentang, jadi untuk sekarang dipakai semua produk yang ditandai <strong>&ldquo;Jadikan pilihan isi&rdquo;</strong> di bawah.'
                }
              </p>
              ${
                allProducts.filter((o) => !isEdit || Number(o.id) !== Number(p.id)).length
                  ? `<div style="display:flex;flex-wrap:wrap;gap:8px;max-height:260px;overflow:auto;">
                  ${allProducts
                    .filter((o) => !isEdit || Number(o.id) !== Number(p.id))
                    .map((o) => {
                      const available = Boolean(o.active) && (Boolean(o.unlimited_stock) || Number(o.stock) > 0);
                      return `<label style="display:inline-flex;align-items:center;gap:7px;margin:0;font-size:12.5px;font-weight:600;background:var(--surface-2);border:1.5px solid var(--border);border-radius:9px;padding:7px 11px;cursor:pointer;white-space:nowrap;${
                        available ? '' : 'opacity:0.55;'
                      }">
                      <input type="checkbox" name="comboChoice" value="${escapeAttr(o.id)}" ${
                        comboChoices.includes(Number(o.id)) ? 'checked' : ''
                      } style="width:15px;height:15px;">
                      ${escapeHtml(o.name)}${available ? '' : ' <span style="font-weight:500;">(tidak tersedia)</span>'}
                    </label>`;
                    })
                    .join('')}
                </div>`
                  : '<div style="font-size:12px;color:var(--text-muted);">Belum ada produk lain untuk dijadikan pilihan isi.</div>'
              }
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:10px;line-height:1.6;">
                Produk yang sedang <strong>tidak dijual</strong> atau <strong>stoknya habis</strong> tetap boleh dicentang,
                tapi tidak akan ditawarkan ke pembeli sampai tersedia lagi.
              </div>
            </div>

            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;background:var(--surface);border-radius:11px;padding:14px 16px;margin-top:14px;">
              <div style="flex:1 1 220px;min-width:0;">
                <div style="font-size:13.5px;font-weight:700;">Jadikan pilihan isi</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:3px;line-height:1.6;">
                  Produk ini ikut muncul sebagai pilihan di semua produk kombinasi. Mau tambah varian buah potong baru?
                  Buat produknya, lalu centang ini — langsung ikut muncul.
                  <br>Syaratnya produknya memang dijual satuan: kalau <strong>Tampilkan di Toko</strong> dimatikan atau
                  <strong>stoknya habis</strong>, dia otomatis hilang dari pilihan isi sampai tersedia lagi.
                </div>
              </div>
              <label style="margin:0;flex:0 0 auto;">
                <input type="checkbox" name="comboOption" value="1" ${comboIsOption ? 'checked' : ''} style="width:20px;height:20px;">
              </label>
            </div>

            <div style="font-size:11.5px;color:var(--green-dark);margin-top:10px;line-height:1.7;">
              ${
                otherOptions.length
                  ? `Pilihan isi yang sudah aktif (${otherOptions.length}): ${otherOptions
                      .map((o) => escapeHtml(o.name))
                      .join(', ')}.`
                  : 'Belum ada produk yang dicentang sebagai pilihan isi — produk kombinasi tidak akan punya pilihan apa pun sampai ada.'
              }
            </div>
          </div>
          ${
            // What one cup of this product uses up. Only shown to an admin who
            // is allowed to manage the stockroom — for everyone else the
            // product form is unchanged, and the hidden field below keeps their
            // save from wiping a list they were never shown.
            inventoryItems.length
              ? `<div style="background:var(--surface-2);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
            <div style="font-size:14px;font-weight:800;margin-bottom:4px;">Bahan &amp; Kemasan per Cup</div>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:14px;">
              Centang apa saja yang terpakai untuk <strong>satu</strong> cup produk ini, lalu isi jumlahnya.
              Setiap kali produk ini terjual, stok bahannya otomatis berkurang segitu.
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${inventoryItems
                .map((item) => {
                  const chosen = materials.find((m) => Number(m.item_id) === Number(item.id));
                  return `<label style="display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap;">
                  <input type="checkbox" name="bahan" value="${escapeAttr(item.id)}" ${chosen ? 'checked' : ''} style="width:18px;height:18px;">
                  <span style="flex:1 1 160px;min-width:0;font-weight:600;">${escapeHtml(item.name)}
                    <span style="color:var(--text-muted);font-weight:500;"> · sisa ${item.stock} ${escapeHtml(item.unit)} · ${formatRupiah(item.unitCost)}/${escapeHtml(item.unit)}</span>
                  </span>
                  <input type="number" name="bahanQty_${escapeAttr(item.id)}" min="1" value="${escapeAttr(
                    chosen ? chosen.qty : 1
                  )}" style="width:74px;padding:7px 8px;font-size:12.5px;text-align:center;border-radius:8px;"
                    aria-label="Jumlah ${escapeAttr(item.name)} per cup">
                </label>`;
                })
                .join('')}
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:12px;">
              Modal kemasan per cup saat ini: <strong>${formatRupiah(materialCostPerCup)}</strong>.
              Belum ada di daftar? <a href="/admin/inventaris">Tambahkan di Stok Bahan</a>.
            </div>
          </div>`
              : '<input type="hidden" name="bahanTidakDitampilkan" value="1">'
          }

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
</div>
<style>
  .video-add{margin-top:14px;padding-top:16px;border-top:1px solid var(--border);}
  .video-pick{display:inline-flex;align-items:center;gap:9px;margin:0;padding:11px 18px;border-radius:11px;
    border:1.5px dashed var(--border);background:var(--surface-2);font-size:13.5px;font-weight:700;
    color:var(--text);cursor:pointer;line-height:1.2;}
  .video-pick:hover{border-color:var(--orange);color:var(--orange);}
  /* The real input is driven by the label, so it is hidden without being
     display:none — a hidden input can still be focused by the keyboard. */
  .video-pick input[type="file"]{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}
  .video-pick:focus-within{outline:2.5px solid var(--orange);outline-offset:2px;}
  .video-queue:empty{display:none;}
  .video-queue{margin-top:12px;display:flex;flex-direction:column;gap:10px;}
  .video-row{border:1px solid var(--border);border-radius:12px;padding:11px 13px;background:var(--surface);}
  .video-row-top{display:flex;align-items:center;gap:10px;}
  .video-row-name{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:700;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .video-row-drop{flex:0 0 auto;background:var(--surface);border:1px solid var(--border);border-radius:8px;
    padding:6px 11px;font-size:11.5px;font-weight:700;font-family:inherit;color:#a13f3f;cursor:pointer;}
  .video-bar{height:6px;border-radius:99px;background:var(--surface-2);overflow:hidden;margin-top:9px;}
  .video-bar span{display:block;height:100%;width:0;background:var(--orange);border-radius:99px;
    transition:width 0.18s ease;}
  .video-row-note{font-size:11.5px;color:var(--text-muted);margin-top:7px;line-height:1.55;}
  .video-row.is-error{border-color:#e0b4b4;background:#fdf4f4;}
  .video-row.is-error .video-row-note{color:#a13f3f;}
  .video-row.is-done{border-color:var(--green);}
  .video-row video{width:100%;max-height:150px;object-fit:cover;border-radius:9px;margin-top:9px;
    background:#0b0b0c;display:block;}
</style>
<script>
// Video upload.
//
// A clip cannot go through the form: the serverless request body is capped
// around 4.5MB and a phone video is many times that. So the browser asks the
// server for a short-lived, single-purpose upload address, PUTs the file
// straight to penyimpanan, and drops the resulting address into a hidden
// field. Saving the product then only stores that address.
//
// Without JavaScript the photo input still works exactly as before; only the
// video button needs a script, which is why it isn't a plain file field.
(function(){
  var pick = document.getElementById('videoPick');
  var queue = document.getElementById('videoQueue');
  if(!pick || !queue) return;
  var form = pick.form || (pick.closest ? pick.closest('form') : null);
  if(!form) return;

  var MAX_BYTES = ${MAX_VIDEO_BYTES};
  var TYPES = ${JSON.stringify(Object.keys(PRODUCT_VIDEO_TYPES))};
  var pending = 0;

  function readable(bytes){
    return bytes >= 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  // Saving mid-upload would store a product pointing at a half-written file,
  // so the submit button waits until every clip has landed.
  function lock(){
    var buttons = form.querySelectorAll('button[type="submit"]');
    for(var i = 0; i < buttons.length; i++){
      buttons[i].disabled = pending > 0;
      buttons[i].textContent = pending > 0 ? 'Menunggu video…' : 'Simpan Produk';
    }
  }

  function makeRow(name){
    var row = document.createElement('div');
    row.className = 'video-row';
    var top = document.createElement('div');
    top.className = 'video-row-top';
    var label = document.createElement('div');
    label.className = 'video-row-name';
    label.textContent = name;
    top.appendChild(label);
    row.appendChild(top);
    var bar = document.createElement('div');
    bar.className = 'video-bar';
    var fill = document.createElement('span');
    bar.appendChild(fill);
    row.appendChild(bar);
    var note = document.createElement('div');
    note.className = 'video-row-note';
    note.textContent = 'Menyiapkan…';
    row.appendChild(note);
    queue.appendChild(row);
    return { row: row, top: top, bar: bar, fill: fill, note: note };
  }

  function dropButton(label){
    var drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'video-row-drop';
    drop.textContent = label;
    return drop;   // the click is handled by delegation, below
  }

  // One handler for every row, including the ones the server rendered back
  // after a failed save.
  queue.addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.video-row-drop') : null;
    if(!btn) return;
    var row = btn.closest('.video-row');
    if(!row) return;
    var preview = row.querySelector('video');
    if(preview && String(preview.src).indexOf('blob:') === 0){
      try{ URL.revokeObjectURL(preview.src); }catch(err){}
    }
    row.remove();
  });

  function fail(ui, message){
    ui.row.className = 'video-row is-error';
    ui.bar.hidden = true;
    ui.note.textContent = message;
    ui.top.appendChild(dropButton('Tutup'));
  }

  function succeed(ui, url, file){
    ui.row.className = 'video-row is-done';
    ui.bar.hidden = true;
    ui.note.textContent = 'Video siap — tersimpan setelah produk disimpan.';
    // This hidden field is the only thing the form actually posts.
    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'videoBaru';
    hidden.value = url;
    ui.row.appendChild(hidden);
    var preview = document.createElement('video');
    preview.src = URL.createObjectURL(file);
    preview.muted = true;
    preview.playsInline = true;
    preview.controls = true;
    preview.preload = 'metadata';
    ui.row.appendChild(preview);
    ui.top.appendChild(dropButton('Batal'));
  }

  function upload(file){
    var ui = makeRow(file.name + ' (' + readable(file.size) + ')');
    pending += 1;
    lock();
    function done(){ pending -= 1; lock(); }

    fetch('/admin/media/video/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'contentType=' + encodeURIComponent(file.type) + '&size=' + encodeURIComponent(String(file.size))
    }).then(function(res){
      return res.json().then(function(data){ return { ok: res.ok, data: data }; });
    }).then(function(out){
      if(!out.ok || !out.data || !out.data.uploadUrl){
        throw new Error((out.data && out.data.error) || 'Tidak bisa menyiapkan unggahan video.');
      }
      ui.note.textContent = 'Mengunggah…';
      // XMLHttpRequest, not fetch: fetch has no upload progress, and a 40MB
      // clip with no progress bar looks like a frozen page.
      return new Promise(function(resolve, reject){
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', out.data.uploadUrl, true);
        xhr.setRequestHeader('content-type', file.type);
        xhr.upload.onprogress = function(e){
          if(!e.lengthComputable) return;
          var pct = Math.round((e.loaded / e.total) * 100);
          ui.fill.style.width = pct + '%';
          ui.note.textContent = 'Mengunggah… ' + pct + '%';
        };
        xhr.onload = function(){
          if(xhr.status < 200 || xhr.status >= 300) return reject(new Error('Unggahan ditolak (' + xhr.status + ').'));
          var body = null;
          try{ body = JSON.parse(xhr.responseText); }catch(err){}
          if(!body || !body.url) return reject(new Error('Unggahan selesai tapi alamatnya tidak terbaca.'));
          resolve(body.url);
        };
        xhr.onerror = function(){ reject(new Error('Koneksi terputus saat mengunggah.')); };
        xhr.onabort = function(){ reject(new Error('Unggahan dibatalkan.')); };
        xhr.send(file);
      });
    }).then(function(url){
      succeed(ui, url, file);
      done();
    }).catch(function(err){
      fail(ui, (err && err.message) || 'Gagal mengunggah video.');
      done();
    });
  }

  pick.addEventListener('change', function(){
    var file = pick.files && pick.files[0];
    // Cleared straight away so picking the same file again still fires.
    pick.value = '';
    if(!file) return;
    if(TYPES.indexOf(file.type) < 0){
      fail(makeRow(file.name), 'Format video harus MP4, WEBM atau MOV.');
      return;
    }
    if(file.size > MAX_BYTES){
      fail(makeRow(file.name), 'Video terlalu besar (' + readable(file.size) + '). Maksimal ' + readable(MAX_BYTES) + '.');
      return;
    }
    upload(file);
  });
})();
</script>`;

  return page({ title: `${isEdit ? 'Edit' : 'Tambah'} Produk — Admin Pecup`, bodyHtml: body, noindex: true });
}

// Builds a /admin/pesanan URL carrying the current view, changing only what's
// passed in — so switching sort keeps the filters and vice versa.
function pesananUrl(view, overrides = {}) {
  const merged = { ...view, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `/admin/pesanan${qs ? `?${qs}` : ''}`;
}

function pesananSortHeader(label, key, view) {
  const isActive = view.urut === key;
  const nextDir = isActive && view.arah === 'asc' ? 'desc' : 'asc';
  const arrow = isActive
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${
        view.arah === 'asc' ? 180 : 0
      }deg);"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3;"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/></svg>`;
  return `<a href="${pesananUrl(view, { urut: key, arah: nextDir })}" style="display:inline-flex;align-items:center;gap:5px;color:${
    isActive ? 'var(--text)' : 'var(--text-muted)'
  };font-weight:${isActive ? 800 : 700};">${label}${arrow}</a>`;
}

// Relative wording for the delivery date — "hari ini" / "besok" is what an
// admin packing orders actually needs to see at a glance.
function deliveryLabel(deliveryDate, todayKey) {
  if (!deliveryDate) return { text: '—', tone: 'var(--text-muted)', weight: 500, note: '' };
  const key = toDateKey(deliveryDate);
  const diff = Math.round((Date.parse(key + 'T00:00:00') - Date.parse(todayKey + 'T00:00:00')) / 86400000);
  let note = '';
  let tone = 'var(--text)';
  if (diff < 0) {
    note = `${Math.abs(diff)} hari lalu`;
    tone = 'var(--text-muted)';
  } else if (diff === 0) {
    note = 'Hari ini';
    tone = '#a15a1f';
  } else if (diff === 1) {
    note = 'Besok';
    tone = '#a15a1f';
  } else {
    note = `${diff} hari lagi`;
  }
  return { text: formatShortDateID(key), tone, weight: diff <= 1 && diff >= 0 ? 800 : 600, note };
}

const PESANAN_PRESETS = [
  { key: 'hari-ini', label: 'Hari ini' },
  { key: '7-hari', label: '7 hari terakhir' },
  { key: '30-hari', label: '30 hari terakhir' },
  { key: 'kirim-hari-ini', label: 'Dikirim hari ini' },
  { key: 'kirim-mendatang', label: 'Pengiriman mendatang' },
  { key: 'semua', label: 'Semua pesanan' },
];

function renderPesananList({ orders, stats, admin, view = {}, todayKey, activePreset = '', pagination = null }) {
  const rows = orders.length
    ? orders
        .map((o) => {
          const status = orderStatus(o.status);
          const kirim = deliveryLabel(o.delivery_date, todayKey);
          return admRow(
            [
              {
                label: '',
                html: `<div style="min-width:0;">
                  <div style="font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(o.customer_name)}</div>
                  <div class="tnum" style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHtml(o.order_number)}</div>
                </div>`,
              },
              {
                label: 'Dipesan',
                html: `<div style="text-align:right;">
                  <div style="font-size:13px;font-weight:600;">${escapeHtml(formatShortDateID(o.created_at))}</div>
                  <div class="tnum" style="font-size:11.5px;color:var(--text-muted);">${formatTimeID(o.created_at)} WIB</div>
                </div>`,
              },
              {
                label: 'Dikirim',
                html: `<div style="text-align:right;">
                  <div style="font-size:13px;font-weight:${kirim.weight};color:${kirim.tone};">${escapeHtml(kirim.text)}</div>
                  ${kirim.note ? `<div style="font-size:11.5px;color:${kirim.tone};opacity:0.85;">${escapeHtml(kirim.note)}</div>` : ''}
                </div>`,
              },
              {
                label: 'Total',
                html: `<div style="text-align:right;">
                  <span class="tnum" style="font-size:13px;font-weight:700;">${formatRupiah(o.total)}</span>
                  ${
                    // Money owed has to be visible from the list — an unpaid
                    // order you have to open to notice is one you forget.
                    o.paid || o.status === 'dibatalkan'
                      ? ''
                      : `<div style="font-size:10.5px;font-weight:800;color:#a13f3f;margin-top:3px;white-space:nowrap;">BELUM DIBAYAR</div>`
                  }
                </div>`,
              },
              {
                label: 'Status',
                html: `<span style="font-size:11.5px;font-weight:700;color:${status.color};background:${status.bg};padding:5px 11px;border-radius:99px;white-space:nowrap;">${status.label}</span>`,
              },
              {
                label: '',
                html: `<span class="lihat-btn" style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;width:fit-content;display:inline-block;">Detail &rsaquo;</span>`,
              },
            ],
            { href: `/admin/pesanan/${o.id}` }
          );
        })
        .join('')
    : '';

  const presetChips = PESANAN_PRESETS.map(
    (p) =>
      `<a class="chip ${activePreset === p.key ? 'chip-active' : ''}" href="/admin/pesanan?tampilan=${p.key}" style="padding:8px 16px;border-radius:99px;font-size:13px;font-weight:600;${
        activePreset === p.key ? '' : 'color:var(--text);'
      }">${p.label}</a>`
  ).join('');

  const statusOptions = [{ value: '', label: 'Semua' }, ...ORDER_STATUSES]
    .map((s) => `<option value="${s.value}" ${view.status === s.value ? 'selected' : ''}>${s.label}</option>`)
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('pesanan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Pesanan</div>
        <h1 style="font-size:24px;font-weight:800;">Pesanan Masuk</h1>
        <a href="/admin/pesanan/tambah" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--green-dark);margin-top:8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Catat pesanan manual (WhatsApp / datang langsung)
        </a>
      </div>
      <a class="btn-primary" href="/admin/pesanan/unduh?${new URLSearchParams({
        dari: view.dari || '',
        sampai: view.sampai || '',
        status: view.status || '',
        q: view.q || '',
        jenisTanggal: view.jenisTanggal || 'dipesan',
      }).toString()}" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Unduh CSV
      </a>
    </div>

    <div class="chip-row" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">${presetChips}</div>

    <form method="get" action="/admin/pesanan" class="card" style="padding:18px 20px;margin-bottom:22px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
      <div style="margin:0;flex:0 1 170px;">
        <label style="margin-bottom:5px;">Filter tanggal pakai</label>
        <select name="jenisTanggal" style="padding:10px 12px;">
          <option value="dipesan" ${view.jenisTanggal !== 'dikirim' ? 'selected' : ''}>Dipesan</option>
          <option value="dikirim" ${view.jenisTanggal === 'dikirim' ? 'selected' : ''}>Dikirim</option>
        </select>
      </div>
      <div style="margin:0;flex:0 1 150px;">
        <label style="margin-bottom:5px;">Dari</label>
        <input type="date" name="dari" value="${escapeAttr(view.dari || '')}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:0 1 150px;">
        <label style="margin-bottom:5px;">Sampai</label>
        <input type="date" name="sampai" value="${escapeAttr(view.sampai || '')}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:0 1 160px;">
        <label style="margin-bottom:5px;">Status</label>
        <select name="status" style="padding:10px 12px;">${statusOptions}</select>
      </div>
      <div style="margin:0;flex:1 1 190px;">
        <label style="margin-bottom:5px;">Cari pemesan</label>
        <input type="search" name="q" value="${escapeAttr(view.q || '')}" placeholder="Nama, WA, no. pesanan…" style="padding:10px 12px;">
      </div>
      <input type="hidden" name="urut" value="${escapeAttr(view.urut || 'dipesan')}">
      <input type="hidden" name="arah" value="${escapeAttr(view.arah || 'desc')}">
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Terapkan</button>
      <a class="btn-outline" href="/admin/pesanan?tampilan=semua" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;">Reset</a>
    </form>

    <div class="grid-4" style="margin-bottom:24px;gap:16px;">
      ${statCard('Pesanan Tampil', stats.total, 'var(--surface-2)', '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>', '#5a5a60')}
      ${statCard('Menunggu Verifikasi', stats.pending, 'oklch(94% 0.06 55)', '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>', '#a15a1f')}
      ${statCard('Diproses', stats.processing, 'oklch(93% 0.05 245)', '<path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/>', '#1f5aa1')}
      ${statCard('Selesai', stats.done, 'var(--green-soft)', '<path d="M20 6L9 17l-5-5"/>')}
    </div>

    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      ${
        pagination && pagination.total > 0
          ? `Menampilkan <strong>${(pagination.page - 1) * pagination.perPage + 1}–${Math.min(
              pagination.page * pagination.perPage,
              pagination.total
            )}</strong> dari <strong>${pagination.total}</strong> pesanan`
          : `<strong>${orders.length}</strong> pesanan`
      }${
        view.dari || view.sampai
          ? ` · ${view.jenisTanggal === 'dikirim' ? 'dikirim' : 'dipesan'} ${
              view.dari ? escapeHtml(formatShortDateID(view.dari)) : 'awal'
            } – ${view.sampai ? escapeHtml(formatShortDateID(view.sampai)) : 'sekarang'}`
          : ' · semua tanggal'
      }${stats.revenue ? ` · omzet selesai <strong>${formatRupiah(stats.revenue)}</strong>` : ''}
    </p>

    ${admTable({
      cols: '1.5fr 1.1fr 1.1fr 1fr 1fr 0.9fr',
      minWidth: 820,
      head: [
        pesananSortHeader('PEMESAN', 'nama', view),
        pesananSortHeader('DIPESAN', 'dipesan', view),
        pesananSortHeader('DIKIRIM', 'dikirim', view),
        pesananSortHeader('TOTAL', 'total', view),
        pesananSortHeader('STATUS', 'status', view),
        '',
      ],
      rows,
      empty: 'Tidak ada pesanan yang cocok dengan filter ini.',
      note: 'Klik judul kolom untuk mengurutkan. Unduh CSV mengikuti filter yang sedang aktif — termasuk seluruh halaman, bukan cuma yang tampil.',
    })}
    ${pagination ? pageLinks((p) => pesananUrl(view, { halaman: p }), pagination.page, pagination.totalPages) : ''}
  </main>
</div>`;

  return page({ title: 'Pesanan — Admin Pecup', bodyHtml: body, noindex: true });
}

// Pre-written WhatsApp messages for the three things an admin says all day.
// Saves retyping the order number and total into WhatsApp by hand.
function whatsappButtons(order, items) {
  const wa = normalizeWhatsapp(order.whatsapp);
  if (!wa) {
    return `<p style="font-size:12.5px;color:var(--text-muted);margin-top:16px;">Nomor WhatsApp pemesan tidak valid, jadi tidak bisa dihubungi otomatis.</p>`;
  }

  // Plain ASCII only in these templates: emoji and typographic punctuation
  // came through as "?" boxes in some WhatsApp builds.
  const lines = items.map((it) => `- ${it.product_name} x${it.qty}`).join('\n');
  const when = order.delivery_date ? formatDateID(order.delivery_date) : 'segera';
  const templates = [
    // Only while money is still owed — once it's paid this would be a false
    // reminder, and a cancelled order owes nothing.
    ...(!order.paid && order.status !== 'dibatalkan'
      ? [
          {
            label: 'Diterima, belum dibayar',
            color: '#d4a017',
            text: `Halo ${order.customer_name}! Pesanan ${order.order_number} sudah kami terima ya\n\n${lines}\n\nTotal: ${formatRupiah(order.total)}\nDiantar: ${when}\n\nTapi pembayarannya *belum kami terima*. Silakan bayar sejumlah ${formatRupiah(order.total)} lewat QRIS Pecup, lalu kirim bukti pembayarannya di chat ini ya. Pesanan akan kami proses setelah pembayaran masuk. Terima kasih!`,
          },
        ]
      : []),
    {
      label: 'Konfirmasi diterima',
      color: 'var(--green)',
      text: `Halo ${order.customer_name}! Pesanan ${order.order_number} sudah kami terima ya\n\n${lines}\n\nTotal: ${formatRupiah(order.total)}\nDiantar: ${when}\n\nPembayaranmu sudah kami cek dan pesanan masuk antrian. Terima kasih sudah pesan di Pecup!`,
    },
    {
      label: 'Sedang diantar',
      color: 'var(--orange)',
      text: `Halo ${order.customer_name}! Pesanan ${order.order_number} sedang dalam perjalanan ke ${order.address || 'lokasimu'}\n\nDitunggu ya, sebentar lagi sampai!`,
    },
    {
      label: 'Bukti transfer belum sesuai',
      color: '#c94f4f',
      text: `Halo ${order.customer_name}, mohon maaf, untuk pesanan ${order.order_number}, bukti transfer yang kami terima belum sesuai dengan total ${formatRupiah(order.total)}.\n\nBoleh dicek dan dikirim ulang buktinya? Terima kasih`,
    },
  ];

  return `
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border);">
      <h3 style="font-size:14px;font-weight:800;margin-bottom:4px;">Hubungi Pemesan</h3>
      <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:12px;">Buka WhatsApp dengan pesan yang sudah terisi — tinggal kirim.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${templates
          .map(
            (t) => `<a class="btn-outline" href="https://wa.me/${wa}?text=${encodeURIComponent(t.text)}" target="_blank" rel="noopener"
              style="padding:10px 15px;border-radius:10px;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:7px;border-left:3px solid ${t.color};">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1a13 13 0 0 1-6.2-5.4c-.5-.8-.8-1.7-.8-2.5 0-.9.5-1.4.7-1.6.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.2.1.4.1.6-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.6-.1 1.3z"/></svg>
              ${t.label}
            </a>`
          )
          .join('')}
      </div>
    </div>`;
}

function renderPesananDetail({ order, items, proofUrl, admin, loyalty = null, flash = '', error = '' }) {
  const rewardDiscount = Number(order.reward_discount) || 0;
  const deliveryFee = Number(order.delivery_fee) || 0;
  // Free cups, member discount and promo code all itemised from one place
  // (src/orderMoney.js), so this page, the receipt and the email agree.
  const orderDiscounts = discountLines(order);
  const totalDiscount = orderDiscounts.reduce((sum, line) => sum + line.amount, 0);
  const orderTax = taxLine(order);
  const freeCups = freeCupValue(order);
  const itemCount = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const waButtons = whatsappButtons(order, items);
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
  // A proof that isn't an image (a PDF) falls back to naming the file. The
  // filename rides in a data attribute rather than being pasted into an inline
  // onerror handler: escapeAttr protects an attribute VALUE, but a browser
  // decodes entities before it parses the JavaScript inside an event
  // attribute, so an apostrophe in the value would have closed the string
  // literal and let whatever followed run. Proof filenames are minted by the
  // server today, so it was never reachable — but it only stayed safe because
  // of an invariant somewhere else, which is not a thing to rely on.
  const proofBlock = proofUrl
    ? `<a href="${escapeAttr(proofUrl)}" target="_blank" style="display:block;">
        <img src="${escapeAttr(proofUrl)}" data-proof-name="${escapeAttr(order.proof_filename || '')}"
             style="max-width:100%;border-radius:14px;border:1px solid var(--border);">
      </a>`
    : `<span style="color:var(--text-muted);font-size:13px;">Tidak ada bukti transfer.</span>`;

  const emailStatus = order.email_sent
    ? `<span style="color:#3f7a42;font-weight:600;">Terkirim otomatis ke email toko</span>`
    : `<span style="color:#a13f3f;font-weight:600;">Belum terkirim otomatis${order.email_error ? ` — ${escapeHtml(order.email_error)}` : ''}</span>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('pesanan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/pesanan', 'Kembali ke Pesanan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;"><a href="/admin/pesanan">Admin / Pesanan</a> / ${escapeHtml(order.order_number)}</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:18px;">Detail Pesanan ${escapeHtml(order.order_number)}</h1>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}
    ${
      order.status === 'dibatalkan'
        ? `<div class="flash flash-error" style="align-items:flex-start;">Pesanan ini <strong>dibatalkan</strong> dan ${itemCount} cup sudah dikembalikan ke stok.</div>`
        : ''
    }

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
                loyalty.cardComplete ? 'var(--green-soft)' : 'var(--surface-2)'
              };border-radius:12px;padding:14px 16px;margin-bottom:16px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
                  <div style="font-size:12px;font-weight:800;letter-spacing:0.4px;color:${
                    loyalty.cardComplete ? 'var(--green-dark)' : 'var(--text-muted)'
                  };">KARTU STEMPEL PELANGGAN</div>
                  <a href="/admin/pelanggan/${order.customer_id}" style="font-size:12px;font-weight:700;">Lihat profil &rsaquo;</a>
                </div>
                <div class="tnum" style="font-size:14px;margin-bottom:${loyalty.cardComplete ? '12px' : '0'};">
                  <strong>${loyalty.stamps}/${loyalty.perReward}</strong> stempel di kartu saat ini
                  · sudah ${loyalty.claims}&times; klaim cup gratis
                  ${loyalty.expiresLabel ? `· hangus ${escapeHtml(loyalty.expiresLabel)}` : ''}
                </div>
                ${
                  loyalty.cardComplete
                    ? `<form method="post" action="/admin/pesanan/${order.id}/tukar-stempel" data-confirm="Tukarkan 1 cup gratis untuk pelanggan ini? Stempel akan kembali ke nol." style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <span style="font-size:13.5px;font-weight:700;color:var(--green-dark);">Kartu penuh — 1 cup gratis siap ditukar</span>
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
        ${
          orderDiscounts.length || deliveryFee > 0 || orderTax
            ? `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:10px 0 0;color:var(--text-muted);">
                <span>Subtotal</span><span class="tnum">${formatRupiah(order.subtotal)}</span>
              </div>`
            : ''
        }
        ${orderDiscounts
          .map(
            (line) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13.5px;font-weight:700;padding:6px 0;color:#a15a1f;">
                <span>${escapeHtml(line.label)}</span>
                <span class="tnum">&minus;${formatRupiah(line.amount)}</span>
              </div>`
          )
          .join('')}
        ${
          orderTax
            ? `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:6px 0;color:var(--text-muted);">
                <span>${escapeHtml(orderTax.label)}</span><span class="tnum">${formatRupiah(orderTax.amount)}</span>
              </div>`
            : ''
        }
        ${
          deliveryFee > 0
            ? `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:6px 0;color:var(--text-muted);">
                <span>Ongkos antar</span><span class="tnum">${formatRupiah(deliveryFee)}</span>
              </div>`
            : ''
        }
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;padding-top:16px;"><span>${
          totalDiscount > 0 ? 'Total Dibayar' : 'Total'
        }</span><span class="tnum" style="color:var(--green-dark);">${formatRupiah(order.total)}</span></div>
        ${
          totalDiscount > 0
            ? `<div style="background:var(--orange-soft);border-radius:10px;padding:12px 14px;margin-top:14px;font-size:12.5px;color:#7a4a1f;line-height:1.7;">
                <strong>Catatan keuangan:</strong> pesanan ini dapat potongan ${formatRupiah(totalDiscount)}
                (${escapeHtml(orderDiscounts.map((line) => line.label).join(' · '))}).
                Uang masuk ${formatRupiah(order.total)} — bukan kurang bayar.${
                  freeCups > 0
                    ? ` Nilai cup yang keluar tanpa uang masuk: ${formatRupiah(freeCups)}.`
                    : ''
                }
              </div>`
            : ''
        }

        ${
          // Payment is its own line, because it moves independently of the
          // cups: an order can be delivered and still unpaid, and an unpaid
          // one must be impossible to overlook on the page that shows it.
          order.paid
            ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--green-soft);border-radius:11px;padding:13px 15px;margin-top:18px;">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--green-dark)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                <span style="font-size:13.5px;font-weight:700;color:var(--green-dark);">Sudah dibayar${
                  order.paid_at ? ` — ${escapeHtml(formatDateID(order.paid_at))}` : ''
                }</span>
                <form method="post" action="/admin/pesanan/${order.id}/bayar" style="margin-left:auto;"
                      data-confirm="Tandai pesanan ini BELUM dibayar?">
                  <input type="hidden" name="paid" value="0">
                  <button type="submit" style="background:none;border:none;font-size:12px;font-weight:700;color:var(--green-dark);cursor:pointer;text-decoration:underline;">Batalkan tanda ini</button>
                </form>
              </div>`
            : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#f6dcdc;border-radius:11px;padding:13px 15px;margin-top:18px;">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#a13f3f" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>
                <span style="font-size:13.5px;font-weight:800;color:#a13f3f;">Belum dibayar — ${formatRupiah(order.total)}</span>
                <form method="post" action="/admin/pesanan/${order.id}/bayar" style="margin-left:auto;">
                  <input type="hidden" name="paid" value="1">
                  <button class="btn-primary" type="submit" style="padding:9px 16px;border-radius:9px;font-size:12.5px;font-weight:700;">Tandai Sudah Dibayar</button>
                </form>
              </div>`
        }

        <form method="post" action="/admin/pesanan/${order.id}/status" style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
          <select name="status" style="flex:1 1 180px;">
            ${ORDER_STATUSES.map((s) => `<option value="${s.value}" ${order.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
          <button class="btn-primary" type="submit" style="padding:13px 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Update Status</button>
        </form>
        <p style="font-size:12px;color:var(--text-muted);line-height:1.7;margin-top:10px;">
          Memilih <strong>Dibatalkan</strong> otomatis mengembalikan ${itemCount} cup ke stok. Mengembalikannya ke status lain akan memotong stok lagi.
        </p>

        ${waButtons}
      </div>

      <div class="card" style="flex:1 1 300px;">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Bukti Transfer</h3>
        ${proofBlock}
      </div>
    </div>
  </main>
</div>
<script>
// A proof that will not render as an image (a PDF) is replaced by its filename.
// The name comes off a data attribute and is set with textContent, so it is
// text and can never be code. "error" does not bubble, hence the capture.
document.addEventListener('error', function(e){
  var img = e.target;
  if(!img || img.tagName !== 'IMG' || !img.hasAttribute('data-proof-name')) return;
  var box = document.createElement('div');
  box.textContent = 'Berkas: ' + img.getAttribute('data-proof-name');
  box.style.cssText = 'padding:16px;background:var(--surface-2);border-radius:12px;font-size:13px;';
  if(img.parentNode) img.parentNode.replaceChild(box, img);
}, true);
</script>`;

  return page({ title: `${order.order_number} — Admin Pecup`, bodyHtml: body, noindex: true });
}

// Signed in, but this page isn't theirs. Says which allowance is missing and
// sends them somewhere they can actually go — a bare 403 with a link back to
// "Produk" was a dead end for an account that can't open Produk either.
function renderForbidden({ admin, permissionLabel = '', backHref = '/admin' }) {
  const body = `
<div class="admin-shell">
  ${adminSidebar('', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    <div class="card" style="max-width:560px;margin-top:40px;">
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">403</div>
      <h1 style="font-size:22px;font-weight:800;margin-bottom:10px;">Halaman ini di luar izinmu</h1>
      <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;margin-bottom:6px;">
        Akun <strong>${escapeHtml(admin ? admin.username : '')}</strong> belum punya izin
        ${permissionLabel ? `<strong>&ldquo;${escapeHtml(permissionLabel)}&rdquo;</strong>` : 'untuk bagian ini'}.
      </p>
      <p style="font-size:13px;color:var(--text-muted);line-height:1.75;margin-bottom:20px;">
        Kalau memang butuh, minta superadmin membukanya lewat <em>Kelola Admin → Atur Izin</em>.
      </p>
      <a class="btn-primary" href="${escapeAttr(backHref)}" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Kembali</a>
    </div>
  </main>
</div>`;
  return page({ title: 'Tidak diizinkan — Admin Pecup', bodyHtml: body, noindex: true });
}

// One page: which boxes are ticked for one admin, and what each one means.
function renderAdminIzin({ admin, target, catalog, presets, granted, grantable, flash = '', error = '' }) {
  const grantedSet = new Set(granted);
  const grantableSet = new Set(grantable);

  const groups = catalog
    .map((group) => {
      const rows = group.items
        .map((item) => {
          const on = grantedSet.has(item.key);
          // A permission the editor doesn't hold themselves is shown, but
          // frozen: they can see what the account has without being able to
          // hand it out or take it away.
          const locked = !grantableSet.has(item.key);
          return `
        <label style="display:flex;gap:12px;align-items:flex-start;padding:13px 0;border-top:1px solid var(--border);${
          locked ? 'opacity:0.55;' : 'cursor:pointer;'
        }">
          <input type="checkbox" name="izin" value="${escapeAttr(item.key)}" ${on ? 'checked' : ''} ${
            locked ? 'disabled' : ''
          } style="width:19px;height:19px;margin-top:2px;flex-shrink:0;">
          <span style="min-width:0;">
            <span style="display:block;font-size:13.5px;font-weight:700;">${escapeHtml(item.label)}${
              item.sensitive ? ' <span style="font-size:11px;color:#a15a1f;font-weight:800;">· hati-hati</span>' : ''
            }</span>
            <span style="display:block;font-size:12px;color:var(--text-muted);line-height:1.6;margin-top:3px;">${escapeHtml(
              item.hint
            )}</span>
            ${locked ? '<span style="display:block;font-size:11.5px;color:#a15a1f;margin-top:4px;">Kamu sendiri belum punya izin ini, jadi tidak bisa memberikannya.</span>' : ''}
          </span>
        </label>`;
        })
        .join('');
      return `
      <div class="card" style="margin-bottom:18px;">
        <h3 style="font-size:14px;font-weight:800;letter-spacing:0.3px;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px;">${escapeHtml(
          group.group
        )}</h3>
        ${rows}
      </div>`;
    })
    .join('');

  const presetButtons = presets
    .map(
      (p) => `<button type="button" class="btn-outline" data-preset="${escapeAttr(p.keys.join(' '))}"
        title="${escapeAttr(p.hint)}"
        style="padding:9px 15px;border-radius:10px;font-size:12.5px;font-weight:700;">${escapeHtml(p.label)}</button>`
    )
    .join('');

  const isSuper = target.role === 'superadmin';
  const body = `
<div class="admin-shell">
  ${adminSidebar('akun', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/akun', 'Kembali ke Kelola Admin')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Kelola Admin / Izin</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Izin untuk ${escapeHtml(target.username)}</h1>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;margin-bottom:20px;max-width:620px;">
      Centang persis apa yang boleh dia buka. Yang tidak dicentang bukan sekadar disembunyikan dari menu —
      halamannya benar-benar ditolak, walaupun alamatnya diketik langsung.
    </p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    ${
      isSuper
        ? `<div class="card" style="background:var(--orange-soft);border-color:var(--orange-mid);">
            <h3 style="font-size:15px;font-weight:800;color:#7a4a1f;margin-bottom:6px;">${escapeHtml(
              target.username
            )} adalah superadmin</h3>
            <p style="font-size:13px;color:#7a4a1f;line-height:1.75;margin:0;">
              Superadmin selalu punya seluruh izin, dan itu tidak bisa dikurangi di sini — supaya pemilik toko
              tidak pernah bisa terkunci dari tokonya sendiri. Kalau orang ini seharusnya dibatasi, ubah dulu
              perannya menjadi Admin biasa di halaman Kelola Admin.
            </p>
          </div>`
        : `<form method="post" action="/admin/akun/${target.id}/izin" data-warn-unsaved>
      <div class="card" style="margin-bottom:18px;">
        <h3 style="font-size:14px;font-weight:800;margin-bottom:4px;">Mulai dari contoh</h3>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:14px;">
          Ini hanya mengisi centang di bawah — silakan ubah lagi sebelum disimpan.
        </p>
        <div style="display:flex;gap:9px;flex-wrap:wrap;">${presetButtons}</div>
      </div>

      ${groups}

      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:40px;">
        <button class="btn-primary" type="submit" style="padding:13px 26px;border-radius:11px;font-size:14px;font-weight:700;">Simpan Izin</button>
        <a class="btn-outline" href="/admin/akun" style="padding:13px 22px;border-radius:11px;font-size:14px;font-weight:700;">Batal</a>
        <span style="font-size:12.5px;color:var(--text-muted);">Perubahan berlaku begitu dia memuat halaman berikutnya.</span>
      </div>
    </form>
    <script>
    // Presets only tick boxes; nothing is saved until the form is submitted.
    (function(){
      var form = document.querySelector('form[action$="/izin"]');
      if(!form) return;
      form.addEventListener('click', function(e){
        var btn = e.target.closest && e.target.closest('[data-preset]');
        if(!btn) return;
        e.preventDefault();
        var wanted = (btn.getAttribute('data-preset') || '').split(' ').filter(Boolean);
        var boxes = form.querySelectorAll('input[name="izin"]');
        for(var i = 0; i < boxes.length; i++){
          if(boxes[i].disabled) continue;
          boxes[i].checked = wanted.indexOf(boxes[i].value) >= 0;
        }
      });
    })();
    </script>`
    }
  </main>
</div>`;
  return page({ title: `Izin ${target.username} — Admin Pecup`, bodyHtml: body, noindex: true });
}

function renderAdminList({ admins, admin, error, flash = '' }) {
  const currentAdminId = admin.adminId;
  const rows = admins
    .map((a) => {
      const isSelf = a.id === currentAdminId;
      const roleBadge =
        a.role === 'superadmin'
          ? `<span style="font-size:11.5px;font-weight:700;color:#a15a1f;background:var(--orange-soft);padding:5px 11px;border-radius:99px;">Superadmin</span>`
          : `<span style="font-size:11.5px;font-weight:700;color:#3f7a42;background:var(--green-soft);padding:5px 11px;border-radius:99px;">Admin</span>`;
      return admRow([
        {
          label: '',
          html: `<span style="font-size:14px;font-weight:700;">${escapeHtml(a.username)}${
            isSelf ? ' <span style="color:var(--text-muted);font-weight:500;font-size:12px;">(kamu)</span>' : ''
          }</span>`,
        },
        { label: 'Peran', html: roleBadge },
        {
          label: 'Izin',
          html:
            a.role === 'superadmin'
              ? `<span style="font-size:12px;color:var(--text-muted);">Semua (superadmin)</span>`
              : `<a href="/admin/akun/${a.id}/izin" style="font-size:12.5px;font-weight:700;color:var(--green-dark);display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M2 12h4M18 12h4M12 2v4M12 18v4"/></svg>
                  ${Number(a.permissions ? a.permissions.length : 0)} izin · atur
                </a>`,
        },
        { label: 'Dibuat', html: `<span style="font-size:12.5px;color:var(--text-muted);">${formatDateID(a.created_at)}</span>` },
        {
          label: 'Password',
          html: `<form method="post" action="/admin/akun/${a.id}/password" style="display:flex;align-items:center;gap:7px;"
              data-confirm="Ganti password ${escapeAttr(a.username)}? Mereka harus pakai password baru ini untuk masuk.">
          <input type="password" name="password" required minlength="6" placeholder="Password baru (min. 6)"
                 autocomplete="new-password" style="padding:8px 11px;font-size:12.5px;border-radius:8px;">
          <button class="btn-outline" type="submit" style="padding:8px 13px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;">Ganti</button>
        </form>`,
        },
        {
          label: '',
          html: isSelf
            ? ''
            : `<form method="post" action="/admin/akun/${a.id}/hapus" data-confirm="Hapus admin ${escapeAttr(a.username)}? Catatan aktivitasnya tetap tersimpan di Log Aktivitas." style="display:flex;justify-content:flex-end;">
                <button type="submit" class="icon-action" style="padding:6px;display:inline-flex;align-items:center;gap:6px;color:#c94f4f;font-size:12px;font-weight:700;" title="Hapus">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c94f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                  <span class="hide-desktop">Hapus admin</span>
                </button>
              </form>`,
        },
      ]);
    })
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('akun', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Kelola Admin</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:24px;">Kelola Admin</h1>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
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
            ${
              // Only the owner may mint another owner. An admin who merely has
              // "kelola akun" would otherwise be one dropdown away from
              // handing themselves the whole shop.
              admin.role === 'superadmin' ? '<option value="superadmin">Superadmin</option>' : ''
            }
          </select>
        </div>
        <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;white-space:nowrap;">Tambah Admin</button>
      </form>
      <!-- The hint lives under the row, not inside one of its boxes. The row is
           bottom-aligned, so a box with an extra line under its control ends up
           with its control sitting a line higher than the others — which is
           exactly what made these three boxes look out of line. -->
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:10px;line-height:1.6;">
        Admin baru dibuat tanpa izin apa pun — kamu akan langsung diantar ke halaman izinnya.
      </div>
    </div>

    ${admTable({
      cols: '1.3fr 0.8fr 1fr 0.9fr 1.7fr 0.5fr',
      minWidth: 880,
      head: ['USERNAME', 'PERAN', 'IZIN', 'DIBUAT', 'GANTI PASSWORD', ''],
      rows,
      note:
        'Password disimpan dalam bentuk hash (scrypt + salt acak) — tidak pernah disimpan apa adanya, dan tidak bisa dilihat lagi oleh siapa pun termasuk superadmin. Kalau admin lupa password, set yang baru di sini lalu beri tahu orangnya.',
    })}
  </main>
</div>`;

  return page({ title: 'Kelola Admin — Admin Pecup', bodyHtml: body, noindex: true });
}

function tierPill(c, tiersEnabled) {
  if (!tiersEnabled) return `<span style="font-size:12px;color:var(--text-muted);">&mdash;</span>`;
  // A customer that reached here without its loyalty status resolved used to
  // take the whole admin page down with it — one missing field and the render
  // threw. A pill is decoration; it must never be the thing that 500s a page.
  const style = c.tierStyle || { color: 'var(--text-muted)', bg: 'var(--surface-2)' };
  const name = c.tier && c.tier.name ? String(c.tier.name) : '';
  if (!name) return `<span style="font-size:12px;color:var(--text-muted);">&mdash;</span>`;
  return `<span style="display:inline-block;font-size:11.5px;font-weight:800;letter-spacing:0.4px;padding:4px 12px;border-radius:99px;color:${style.color};background:${style.bg};white-space:nowrap;">${escapeHtml(
    name.toUpperCase()
  )}</span>`;
}

// A compact n/10 progress bar — reads faster than the bare number when
// you're scanning a list of customers.
function stampMeter(c) {
  const pct = c.perReward ? Math.min(100, Math.round((c.stamps / c.perReward) * 100)) : 0;
  return `
    <div style="min-width:0;">
      <div style="display:flex;align-items:baseline;gap:5px;">
        <span class="tnum" style="font-size:14px;font-weight:800;color:${
          c.cardComplete ? 'var(--green-dark)' : 'var(--text)'
        };">${c.stamps}</span>
        <span class="tnum" style="font-size:11.5px;color:var(--text-muted);">/ ${c.perReward}</span>
        ${
          c.cardComplete
            ? `<span style="font-size:9.5px;font-weight:800;color:#fff;background:var(--green);padding:2px 7px;border-radius:99px;margin-left:2px;">PENUH</span>`
            : ''
        }
      </div>
      <div class="meter">
        <div class="meter-fill${c.cardComplete ? ' is-full' : ''}" style="width:${pct}%;"></div>
      </div>
    </div>`;
}

// The searchable customer directory. Open to every admin (they need to look
// up a shopper's history day to day); the editing controls on the detail
// page are what's gated to superadmin.
// Labels stay short on purpose: in the two-column filter bar a phone gives a
// select about 105px of text, and anything longer was cut to "Terbaru me…".
// The field's own label ("Urutkan", "Tampilkan") carries the context.
const CUSTOMER_SORT_OPTIONS = [
  { value: 'baru', label: 'Terbaru' },
  { value: 'lama', label: 'Terlama' },
  { value: 'nama', label: 'Nama A → Z' },
  { value: 'nama-desc', label: 'Nama Z → A' },
  { value: 'stempel', label: 'Stempel terbanyak' },
  { value: 'stempel-asc', label: 'Stempel tersedikit' },
  { value: 'klaim', label: 'Paling sering klaim' },
  { value: 'tier', label: 'Tier tertinggi' },
  { value: 'tier-asc', label: 'Tier terendah' },
];

const CUSTOMER_VIEW_OPTIONS = [
  { value: '', label: 'Semua' },
  { value: 'penuh', label: 'Kartu penuh' },
  { value: 'hangus-dekat', label: 'Segera hangus' },
  { value: 'belum-klaim', label: 'Belum klaim' },
];

function renderPelangganList({
  customers,
  admin,
  search = '',
  totalCustomers = 0,
  tiersEnabled = true,
  tierNames = [],
  view = {},
  flash = '',
  error = '',
  // With the loyalty programme off there is no tier, no stamp card and no
  // expiry date to show, so those three columns come out of the table rather
  // than standing there empty.
  loyaltyOn = true,
}) {
  const rows = customers.length
    ? customers
        .map((c) =>
          admRow(
            [
              {
                label: '',
                html: `<div style="min-width:0;display:flex;align-items:center;gap:12px;">
          <span style="width:36px;height:36px;border-radius:50%;background:var(--green-soft);color:var(--green-dark);font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${escapeHtml(
            String(c.name || '?').charAt(0).toUpperCase()
          )}</span>
          <div style="min-width:0;">
            <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(c.name)}</div>
            <div class="tnum" style="font-size:12px;color:var(--text-muted);">${escapeHtml(formatWhatsapp(c.whatsapp))}</div>
          </div>
        </div>`,
              },
              ...(loyaltyOn
                ? [
                    {
                      label: 'Tier',
                      html: `<div style="text-align:right;">
          ${tierPill(c, tiersEnabled)}
          <div class="tnum" style="font-size:11.5px;color:var(--text-muted);margin-top:4px;">${c.claims}&times; klaim gratis</div>
        </div>`,
                    },
                    { label: 'Stempel', html: stampMeter(c) },
                    {
                      label: 'Kedaluwarsa',
                      html: `<span style="font-size:12px;color:var(--text-muted);text-align:right;">${
                        c.expiresLabel ? `<strong style="color:var(--text);">${escapeHtml(c.expiresLabel)}</strong>` : '&mdash;'
                      }</span>`,
                    },
                  ]
                : []),
              {
                label: '',
                html: `<span class="lihat-btn" style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;width:fit-content;display:inline-block;">Detail &rsaquo;</span>`,
              },
            ],
            { href: `/admin/pelanggan/${c.id}` }
          )
        )
        .join('')
    : '';

  const body = `
<div class="admin-shell">
  ${adminSidebar('pelanggan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Cari Pelanggan</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:6px;">
      <h1 style="font-size:24px;font-weight:800;">Cari Pelanggan</h1>
      <a class="btn-primary" href="/admin/pelanggan/tambah" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Tambah Pelanggan
      </a>
    </div>
    <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:20px;">Cari berdasarkan nama atau nomor WhatsApp, lalu buka detailnya untuk melihat stempel dan riwayat pesanan.</p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <form method="get" action="/admin/pelanggan" class="card" style="padding:16px 18px;margin-bottom:20px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
      <div style="flex:1 1 240px;margin:0;">
        <label style="margin-bottom:5px;">Cari</label>
        <div style="position:relative;display:flex;align-items:center;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" style="position:absolute;left:14px;pointer-events:none;"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="search" name="q" value="${escapeAttr(search)}" placeholder="Nama atau nomor WhatsApp…" style="padding-left:40px;">
        </div>
      </div>
      <div style="flex:0 1 190px;margin:0;">
        <label style="margin-bottom:5px;">Urutkan</label>
        <select name="urut">
          ${CUSTOMER_SORT_OPTIONS.map(
            (o) => `<option value="${o.value}" ${(view.urut || 'baru') === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      ${
        tiersEnabled && tierNames.length
          ? `<div style="flex:0 1 160px;margin:0;">
        <label style="margin-bottom:5px;">Tier</label>
        <select name="tier">
          <option value="">Semua tier</option>
          ${tierNames
            .map((t) => `<option value="${escapeAttr(t)}" ${view.tier === t ? 'selected' : ''}>${escapeHtml(t)}</option>`)
            .join('')}
        </select>
      </div>`
          : ''
      }
      <div style="flex:0 1 220px;margin:0;">
        <label style="margin-bottom:5px;">Tampilkan</label>
        <select name="hanya">
          ${CUSTOMER_VIEW_OPTIONS.map(
            (o) => `<option value="${o.value}" ${(view.hanya || '') === o.value ? 'selected' : ''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;">Terapkan</button>
      ${
        search || view.tier || view.hanya || (view.urut && view.urut !== 'baru')
          ? `<a class="btn-outline" href="/admin/pelanggan" style="padding:13px 20px;border-radius:11px;font-size:14px;font-weight:700;">Reset</a>`
          : ''
      }
      ${
        can(admin, 'pelanggan.unduh')
          ? `<a class="btn-outline" href="/admin/pelanggan/unduh" style="padding:13px 20px;border-radius:11px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              Unduh CSV
            </a>`
          : ''
      }
    </form>

    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      ${
        search
          ? `<strong>${customers.length}</strong> hasil untuk &ldquo;${escapeHtml(search)}&rdquo; · <strong>${totalCustomers}</strong> pelanggan terdaftar`
          : `<strong>${totalCustomers}</strong> pelanggan terdaftar`
      }
    </p>

    ${admTable({
      cols: loyaltyOn ? '2fr 1.2fr 1.4fr 1fr 0.8fr' : '3fr 0.8fr',
      minWidth: loyaltyOn ? 780 : 420,
      head: loyaltyOn ? ['PELANGGAN', 'TIER', 'KARTU STEMPEL', 'KEDALUWARSA', ''] : ['PELANGGAN', ''],
      rows,
      empty: search
        ? `Tidak ada pelanggan yang cocok dengan &ldquo;<strong>${escapeHtml(search)}</strong>&rdquo;.`
        : 'Belum ada pelanggan yang mendaftar akun.',
    })}
  </main>
</div>`;

  return page({ title: 'Cari Pelanggan — Admin Pecup', bodyHtml: body, noindex: true });
}

const STAMP_STATUS_LABELS = {
  active: { label: 'Aktif', color: 'var(--green-dark)', bg: 'var(--green-soft)' },
  redeemed: { label: 'Ditukar', color: '#7a4a1f', bg: 'var(--orange-soft)' },
  expired: { label: 'Hangus', color: '#a13f3f', bg: '#f6dcdc' },
};

// One customer: profile, loyalty state, stamp history and order history.
// `canEdit` (pelanggan.ubah) and `canStamp` (pelanggan.stempel) decide what is
// editable here; an admin with neither still sees the whole page, read-only.
function renderPelangganDetail({
  customer,
  loyalty,
  // Lists default to empty. A caller that forgets one should get a page with
  // an empty table, not a 500 — the route always passes them, but a renderer
  // has no business crashing over a missing list.
  orders = [],
  stamps = [],
  admin,
  // Two separate allowances now, not one "is the boss" flag: editing a
  // customer's details and handing out stamps are different jobs and can be
  // given to different people.
  canEdit,
  canStamp = canEdit,
  tiersEnabled,
  // With the loyalty programme off there is no card, no claim and no tier to
  // show here — only the customer's details and their order history.
  loyaltyOn = true,
  flash = '',
  error = '',
  pagination = null,
  orderView = {},
  activePreset = '',
  lifetime = { orders: 0, spent: 0 },
}) {
  const detailUrl = (overrides = {}) => {
    const merged = { ...orderView, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v !== '' && v !== null && v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return `/admin/pelanggan/${customer.id}${qs ? `?${qs}` : ''}`;
  };
  const orderRows = orders.length
    ? orders
        .map((o) => {
          const status = orderStatus(o.status);
          return admRow(
            [
              {
                label: '',
                html: `<div>
          <div style="font-size:13px;font-weight:700;">${escapeHtml(o.order_number)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(formatDateTimeID(o.created_at))}</div>
        </div>`,
              },
              { label: 'Total', html: `<span class="tnum" style="font-size:13px;font-weight:700;">${formatRupiah(o.total)}</span>` },
              {
                label: 'Status',
                html: `<span style="font-size:11.5px;font-weight:700;color:${status.color};background:${status.bg};padding:4px 10px;border-radius:99px;width:fit-content;white-space:nowrap;display:inline-block;">${status.label}</span>`,
              },
              {
                label: 'Catatan',
                html: `<span style="font-size:12px;color:var(--text-muted);text-align:right;">${
                  discountLines(o).length
                    ? `Potongan ${formatRupiah(discountLines(o).reduce((sum, line) => sum + line.amount, 0))}`
                    : o.delivery_date
                    ? escapeHtml(formatShortDateID(o.delivery_date))
                    : '&mdash;'
                }</span>`,
              },
            ],
            { href: `/admin/pesanan/${o.id}` }
          );
        })
        .join('')
    : '';

  const stampRows = stamps.length
    ? stamps
        .map((s) => {
          const meta = STAMP_STATUS_LABELS[s.status] || STAMP_STATUS_LABELS.active;
          return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;">${escapeHtml(formatShortDateID(s.earned_at))}</div>
          ${s.note ? `<div style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(s.note)}</div>` : ''}
        </div>
        <span style="font-size:11px;font-weight:800;color:${meta.color};background:${meta.bg};padding:3px 10px;border-radius:99px;white-space:nowrap;flex-shrink:0;">${meta.label}</span>
      </div>`;
        })
        .join('')
    : `<p style="font-size:13px;color:var(--text-muted);margin:0;">Belum ada stempel.</p>`;

  const miniStat = (label, value, sub = '') => `
    <div style="background:var(--surface-2);border-radius:12px;padding:14px 16px;">
      <div class="tnum" style="font-size:19px;font-weight:800;">${value}</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">${label}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${sub}</div>` : ''}
    </div>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('pelanggan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/pelanggan', 'Kembali ke Cari Pelanggan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;"><a href="/admin/pelanggan">Admin / Cari Pelanggan</a> / ${escapeHtml(customer.name)}</div>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:26px;">
      <span style="width:56px;height:56px;border-radius:50%;background:var(--green);color:#fff;font-size:22px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${escapeHtml(
        String(customer.name || '?').charAt(0).toUpperCase()
      )}</span>
      <div style="min-width:0;">
        <h1 style="font-size:24px;font-weight:800;">${escapeHtml(customer.name)}</h1>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:5px;">
          <a class="tnum" href="https://wa.me/${escapeAttr(customer.whatsapp)}" target="_blank" rel="noopener" style="font-size:13.5px;">${escapeHtml(
            formatWhatsapp(customer.whatsapp)
          )}</a>
          ${tierPill(loyalty, tiersEnabled)}
        </div>
      </div>
      <!-- Every admin can record a manual order, so this isn't behind canEdit.
           It's also the route that needs no JavaScript: the manual-order form's
           account picker searches over the network, so this link is how an
           account gets attached without a script. -->
      <a class="btn-outline" href="/admin/pesanan/tambah?pelanggan=${customer.id}"
        style="margin-left:auto;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;white-space:nowrap;">Catat Pesanan Manual</a>
    </div>

    <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:20px;">
        <div class="card" style="padding:22px;">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Ringkasan</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:10px;">
            ${
              loyaltyOn
                ? `${miniStat('Stempel aktif', `${loyalty.stamps}<span style="font-size:13px;color:var(--text-muted);font-weight:600;"> / ${loyalty.perReward}</span>`, loyalty.expiresLabel ? `Hangus ${escapeHtml(loyalty.expiresLabel)}` : '')}
            ${miniStat('Klaim cup gratis', loyalty.claims)}`
                : ''
            }
            ${miniStat('Pesanan selesai', lifetime.orders)}
            ${miniStat('Total belanja', formatRupiah(lifetime.spent))}
          </div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-top:16px;line-height:1.7;">
            Bergabung ${escapeHtml(formatDateID(customer.created_at))}
            ${customer.address ? `<br>Alamat tersimpan: ${escapeHtml(customer.address)}` : ''}
            ${customer.birthday ? `<br>Ulang tahun: ${escapeHtml(formatShortDateID(customer.birthday))}` : ''}
          </div>
        </div>

        ${
          canEdit
            ? `<div class="card" style="padding:22px;">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:4px;">Ubah Data Pelanggan</h3>
          <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">Nomor WhatsApp juga dipakai sebagai username untuk masuk, jadi mengubahnya ikut mengubah cara pelanggan login.</p>
          <form method="post" action="/admin/pelanggan/${customer.id}/ubah" data-warn-unsaved>
            <div class="field" style="margin-bottom:14px;">
              <label>Nama lengkap <span class="req">*</span></label>
              <input type="text" name="name" value="${escapeAttr(customer.name)}" required style="padding:10px 12px;">
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label>Nomor WhatsApp <span class="req">*</span></label>
              <input type="text" name="whatsapp" value="${escapeAttr(formatWhatsapp(customer.whatsapp))}" required style="padding:10px 12px;">
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label>Alamat / lokasi antar</label>
              <input type="text" name="address" value="${escapeAttr(customer.address || '')}" style="padding:10px 12px;">
            </div>
            <div class="field" style="margin-bottom:16px;">
              <label>Tanggal ulang tahun</label>
              <input type="date" name="birthday" value="${escapeAttr(
                customer.birthday ? toDateKey(customer.birthday) : ''
              )}" style="padding:10px 12px;">
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Dipakai untuk benefit ulang tahun kalau tier diaktifkan.</div>
            </div>
            <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:13.5px;font-weight:700;">Simpan Perubahan</button>
          </form>

          <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:18px;">
            <h4 style="font-size:13.5px;font-weight:800;margin-bottom:4px;">Reset Password</h4>
            <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:12px;">Password lama tidak bisa dilihat — disimpan sebagai hash. Set yang baru lalu beri tahu pelanggannya.</p>
            <form method="post" action="/admin/pelanggan/${customer.id}/password" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;"
                  data-confirm="Ganti password ${escapeAttr(customer.name)}?">
              <div style="margin:0;flex:1 1 200px;">
                <input type="password" name="password" required minlength="6" placeholder="Password baru (min. 6 karakter)"
                       autocomplete="new-password" style="padding:10px 12px;">
              </div>
              <button class="btn-outline" type="submit" style="padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;white-space:nowrap;">Ganti Password</button>
            </form>
          </div>

          <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:18px;">
            <h4 style="font-size:13.5px;font-weight:800;margin-bottom:4px;color:#a13f3f;">Hapus Akun</h4>
            <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:12px;">Stempel ikut terhapus. Riwayat pesanan tetap tersimpan sebagai catatan penjualan, hanya tidak lagi terhubung ke akun ini.</p>
            <form method="post" action="/admin/pelanggan/${customer.id}/hapus"
                  data-confirm="Hapus akun ${escapeAttr(customer.name)} beserta stempelnya? Tindakan ini tidak bisa dibatalkan.">
              <button type="submit" class="btn-outline" style="padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;color:#a13f3f;border-color:#e0a0a0;">Hapus Akun Pelanggan</button>
            </form>
          </div>
        </div>`
            : ''
        }

        ${
          !loyaltyOn
            ? ''
            : `<div class="card" style="padding:22px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
            <h3 style="font-size:15px;font-weight:800;">Kartu Stempel</h3>
            ${
              canStamp
                ? ''
                : `<span style="font-size:11px;font-weight:700;color:var(--text-muted);background:var(--surface-2);padding:4px 10px;border-radius:99px;">Kamu tidak punya izin mengubah stempel</span>`
            }
          </div>
          ${
            canStamp
              ? `<form method="post" action="/admin/pelanggan/${customer.id}/stempel" style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-top:12px;">
                  <div style="margin:0;flex:0 1 150px;">
                    <label style="margin-bottom:5px;">Jumlah stempel</label>
                    <input type="number" name="stamps" value="${loyalty.stamps}" min="0" max="999" style="padding:10px 12px;text-align:center;font-weight:700;">
                  </div>
                  <button class="btn-outline" type="submit" style="padding:12px 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Simpan Stempel</button>
                </form>
                ${
                  loyalty.cardComplete
                    ? `<form method="post" action="/admin/pelanggan/${customer.id}/klaim" data-confirm="Tukarkan 1 cup gratis? Stempel akan kembali ke nol." style="margin-top:12px;">
                        <button class="btn-primary" type="submit" style="padding:12px 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Tukar 1 Cup Gratis</button>
                      </form>`
                    : ''
                }
                <p style="font-size:12px;color:var(--text-muted);line-height:1.7;margin:14px 0 0;">Stempel bertambah <strong>otomatis</strong> begitu pesanan berstatus <strong>Selesai</strong> — <strong>1 stempel per cup</strong>, bukan per pesanan. Jadi belanja 5 cup sekaligus langsung dapat 5 stempel. Perubahan manual di sini tercatat di log aktivitas.</p>`
              : ''
          }
          <h4 style="font-size:13px;font-weight:800;color:var(--text-muted);letter-spacing:0.3px;margin:20px 0 6px;">RIWAYAT STEMPEL</h4>
          ${stampRows}
        </div>`
        }
      </div>

      <div style="flex:1 1 400px;min-width:0;">
        <div>
          <div style="padding:0 2px 14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
              <h3 style="font-size:15px;font-weight:800;">Riwayat Pesanan</h3>
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span style="font-size:12px;color:var(--text-muted);">${
                  pagination ? `${pagination.total} pesanan` : `${orders.length} pesanan`
                }</span>
                ${
                  // The list below pages, but a customer with a long history is
                  // usually being looked at to DO something with those orders —
                  // so this opens them in the full order screen, already
                  // filtered to this person.
                  can(admin, 'pesanan.lihat')
                    ? `<a href="/admin/pesanan?q=${encodeURIComponent(
                        String(customer.whatsapp || '').replace(/\D/g, '')
                      )}" style="font-size:12.5px;font-weight:700;color:var(--green-dark);white-space:nowrap;">Lihat semua di daftar pesanan &rarr;</a>`
                    : ''
                }
              </div>
            </div>
            <div class="chip-row" style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px;">${rangeChips(
              `/admin/pelanggan/${customer.id}`,
              activePreset
            )}</div>
            <form method="get" action="/admin/pelanggan/${customer.id}" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
              <div style="margin:0;flex:1 1 130px;">
                <label style="margin-bottom:4px;font-size:11.5px;">Dari</label>
                <input type="date" name="dari" value="${escapeAttr(orderView.dari || '')}" style="padding:8px 10px;font-size:13px;">
              </div>
              <div style="margin:0;flex:1 1 130px;">
                <label style="margin-bottom:4px;font-size:11.5px;">Sampai</label>
                <input type="date" name="sampai" value="${escapeAttr(orderView.sampai || '')}" style="padding:8px 10px;font-size:13px;">
              </div>
              <button class="btn-outline" type="submit" style="padding:9px 15px;border-radius:9px;font-size:12.5px;font-weight:700;">Filter</button>
            </form>
          </div>
          ${admTable({
            cols: '1.2fr 1fr 0.9fr 1fr',
            minWidth: 520,
            head: ['PESANAN', 'TOTAL', 'STATUS', 'CATATAN'],
            rows: orderRows,
            empty: 'Belum ada pesanan dari pelanggan ini.',
          })}
        </div>
        ${pagination ? pageLinks((p) => detailUrl({ halaman: p }), pagination.page, pagination.totalPages) : ''}
      </div>
    </div>
  </main>
</div>`;

  return page({ title: `${customer.name} — Admin Pecup`, bodyHtml: body, noindex: true });
}

// The stamp-and-tier rulebook, split off from the customer directory so the
// two jobs (look someone up / change the programme) don't share a page.
function renderLoyalitas({ admin, perReward, expiryMonths, tierConfig, stats, flash = '', error = '' }) {
  // One card per tier. Every field is the same shape (label / input / hint),
  // so they line up on a shared baseline instead of drifting the way a mixed
  // grid of inputs and bare checkboxes did.
  const tierRows = tierConfig.tiers
    .map((t, i) => {
      const style = tierStyleFor(t.name);
      return `
      <div class="tier-card">
        <div class="tier-card-head">
          <span class="tier-card-num" style="color:${style.color};background:${style.bg};">${i + 1}</span>
          <span style="font-size:13px;font-weight:800;">Tingkat ${i + 1}</span>
          <span style="font-size:11.5px;color:var(--text-muted);margin-left:auto;">${
            t.minClaims === 0 ? 'Tingkat awal untuk semua pelanggan baru' : `Mulai dari ${t.minClaims} klaim`
          }</span>
        </div>
        <div class="tier-fields">
          <div class="tier-field">
            <label>Nama tingkat</label>
            <input type="text" name="tierName" value="${escapeAttr(t.name)}" maxlength="30" required>
            <span class="tier-hint">Tampil sebagai lencana di profil pelanggan.</span>
          </div>
          <div class="tier-field">
            <label>Naik setelah … klaim</label>
            <input type="number" name="tierMinClaims" value="${t.minClaims}" min="0" max="999" required>
            <span class="tier-hint">${
              t.minClaims === 0
                ? 'Semua pelanggan baru mulai di sini.'
                : `Masuk tingkat ini setelah menukar ${t.minClaims} cup gratis.`
            }</span>
          </div>
          <div class="tier-field">
            <label>Diskon (%)</label>
            <input type="number" name="tierDiscount" value="${t.discountPercent}" min="0" max="100" required>
            <span class="tier-hint">Berlaku <strong>setiap kali belanja</strong>, otomatis, tanpa batas berapa kali sebulan. 0 berarti tanpa diskon.</span>
          </div>
          <div class="tier-field">
            <label>Benefit tambahan</label>
            <div class="tier-perks">
              <label class="tier-check">
                <input type="checkbox" name="tierWeekly" value="${i}" ${t.weeklyFreeCup ? 'checked' : ''}>
                1 cup gratis per minggu
              </label>
              <label class="tier-check">
                <input type="checkbox" name="tierBirthday" value="${i}" ${t.birthdayFreeCup ? 'checked' : ''}>
                1 cup gratis saat ulang tahun
              </label>
            </div>
            <span class="tier-hint" style="margin-top:8px;">
              Beda dengan diskon di atas: diskon berlaku tiap belanja, sedangkan dua benefit ini
              <strong>sekali per minggu</strong> dan <strong>sekali per tahun</strong> — cup termurah di
              keranjang yang digratiskan, dan hangus kalau tidak dipakai.
            </span>
          </div>
        </div>
      </div>`;
    })
    .join('');

  // Worked example in the shop's own numbers, so "min. klaim" isn't an
  // abstraction anyone has to decode.
  const ladder = tierConfig.tiers
    .map((t, i) => {
      const next = tierConfig.tiers[i + 1];
      const range = next
        ? t.minClaims === next.minClaims - 1
          ? `${t.minClaims} klaim`
          : `${t.minClaims}–${next.minClaims - 1} klaim`
        : `${t.minClaims} klaim atau lebih`;
      const style = tierStyleFor(t.name);
      return `<div class="ladder-row">
        <span class="ladder-pill" style="color:${style.color};background:${style.bg};">${escapeHtml(
          t.name.toUpperCase()
        )}</span>
        <span style="color:var(--text-muted);">${escapeHtml(range)}</span>
        <span style="color:var(--text-muted);text-align:right;">${
          [
            t.discountPercent ? `diskon ${t.discountPercent}%` : '',
            t.weeklyFreeCup ? '1 cup gratis/minggu' : '',
            t.birthdayFreeCup ? '1 cup gratis saat ulang tahun' : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'tanpa benefit tambahan'
        }</span>
      </div>`;
    })
    .join('');

  const body = `
<style>
  /* Every tier field is label / input / hint in the same order, and the row
     is a grid with equal-height cells — so nothing sits higher than its
     neighbour regardless of how long a hint wraps. */
  .tier-card{border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-top:14px;background:var(--surface);}
  .tier-card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
  .tier-card-num{width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:800;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .tier-fields{display:grid;grid-template-columns:1.2fr 1.1fr 0.8fr 1.4fr;gap:14px;align-items:start;}
  .tier-field{display:flex;flex-direction:column;min-width:0;}
  /* Direct child only: the benefit checkboxes are labels too, and this caption
     styling (flex-end, a 2.6em floor) was landing on them — which is why the
     checkbox sat pinned to the bottom of an over-tall empty box. */
  .tier-field > label{font-size:12px;font-weight:700;margin-bottom:5px;min-height:2.6em;display:flex;align-items:flex-end;}
  .tier-field input[type="text"], .tier-field input[type="number"]{padding:9px 11px;}
  .tier-hint{font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;}
  .tier-perks{display:flex;flex-direction:column;gap:8px;padding-top:2px;}
  .tier-check{display:flex;align-items:center;gap:8px;margin:0;font-size:12.5px;font-weight:500;cursor:pointer;
    border:1.5px solid var(--border);border-radius:9px;padding:9px 11px;transition:border-color 0.16s ease, background 0.16s ease;}
  .tier-check:hover{border-color:var(--orange);background:var(--orange-soft);}
  .tier-check input{width:16px;height:16px;margin:0;padding:0;flex-shrink:0;}
  @media (max-width: 1100px){
    .tier-fields{grid-template-columns:1fr 1fr;}
    .tier-field > label{min-height:0;}
  }
  @media (max-width: 620px){
    .tier-fields{grid-template-columns:1fr;}
    /* Once the header wraps, the right-aligned caption ("Mulai dari N klaim")
       lands on its own line still pushed right by margin-left:auto, which reads
       as a stray indent. Wrapped means left-aligned, full width. */
    .tier-card-head > span:last-child{margin-left:0 !important;width:100%;}
  }
  /* The ladder preview: fixed-width pill column keeps the names, ranges and
     benefits in three straight columns. */
  .ladder-row{display:grid;grid-template-columns:112px 1fr auto;gap:12px;align-items:center;padding:7px 0;font-size:13px;}
  .ladder-pill{font-size:11px;font-weight:800;letter-spacing:0.4px;padding:4px 11px;border-radius:99px;text-align:center;white-space:nowrap;}
  @media (max-width: 620px){
    .ladder-row{grid-template-columns:1fr;gap:2px;}
    .ladder-row > span:last-child{text-align:left !important;}
  }
</style>
<div class="admin-shell">
  ${adminSidebar('loyalitas', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/pelanggan', 'Kembali ke Cari Pelanggan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Program Stempel</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Program Stempel &amp; Tier</h1>
    <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:20px;">Aturan yang berlaku untuk semua pelanggan. Untuk mengubah stempel satu orang, buka halaman <a href="/admin/pelanggan">Cari Pelanggan</a>.</p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <div class="grid-4" style="margin-bottom:24px;gap:16px;">
      ${statCard('Pelanggan Terdaftar', stats.customers, 'var(--surface-2)', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', '#5a5a60')}
      ${statCard('Kartu Penuh', stats.cardsComplete, 'var(--green-soft)', '<path d="M20 6L9 17l-5-5"/>')}
      ${statCard('Total Cup Gratis Ditukar', stats.totalClaims, 'var(--orange-soft)', '<path d="M12 2l2.9 6.3 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6L2.5 9.1l6.6-.8z"/>', '#a15a1f')}
      ${statCard('Stempel Aktif', stats.activeStamps, 'oklch(93% 0.05 245)', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', '#1f5aa1')}
    </div>

    <form method="post" action="/admin/pengaturan/stempel" class="card" data-warn-unsaved style="padding:22px;margin-bottom:20px;">
      <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Aturan Stempel</h2>
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">
        <strong>1 stempel untuk tiap cup</strong> (bukan tiap pesanan), diberikan otomatis begitu pesanan
        berstatus <strong>Selesai</strong> — tidak perlu diberikan manual. Beli 5 cup sekaligus = 5 stempel.
        Cup gratis ikut dihitung. Kalau pesanan dibatalkan atau dikembalikan ke status lain,
        stempelnya ditarik lagi selama belum ditukar.
      </p>
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div style="margin:0;flex:0 1 220px;">
          <label style="margin-bottom:5px;">Stempel untuk 1 cup gratis</label>
          <input type="number" name="perReward" value="${perReward}" min="1" max="100" required style="padding:10px 12px;">
        </div>
        <div style="margin:0;flex:0 1 220px;">
          <label style="margin-bottom:5px;">Masa berlaku kartu (bulan)</label>
          <input type="number" name="expiryMonths" value="${expiryMonths}" min="1" max="60" required style="padding:10px 12px;">
        </div>
        <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Simpan Aturan</button>
      </div>
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin:14px 0 0;">Masa berlaku dihitung sejak stempel <strong>pertama</strong> di kartu berjalan — lewat itu seluruh kartu hangus dan mulai lagi dari nol. Cup yang digratiskan selalu cup <strong>termurah</strong> di pesanan tersebut.</p>
    </form>

    <form method="post" action="/admin/pengaturan/tier" class="card" data-warn-unsaved style="padding:22px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
        <h2 style="font-size:16px;font-weight:800;">Membership Tier</h2>
        <label style="display:flex;align-items:center;gap:9px;margin:0;font-size:13.5px;font-weight:700;">
          <input type="checkbox" name="tiersEnabled" value="1" ${tierConfig.enabled ? 'checked' : ''} style="width:20px;height:20px;">
          Aktifkan fitur tier
        </label>
      </div>
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:16px;">
        Tingkat naik berdasarkan <strong>berapa kali pelanggan sudah menukar cup gratis</strong> — bukan jumlah pesanan, dan bukan jumlah stempel.
        Jadi angka &ldquo;naik setelah … klaim&rdquo; di bawah artinya: begitu pelanggan sudah menukar sebanyak itu cup gratis, dia masuk tingkat ini.
        Matikan centang di atas untuk menyembunyikan seluruh fitur tier dari pelanggan.
      </p>

      <div style="background:var(--surface-2);border-radius:12px;padding:14px 18px;margin-bottom:8px;">
        <div style="font-size:11.5px;font-weight:800;color:var(--text-muted);letter-spacing:0.4px;margin-bottom:6px;">TANGGA TINGKAT SAAT INI</div>
        ${ladder}
      </div>

      ${tierRows}
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;margin-top:18px;">Simpan Tier</button>
    </form>

    <div class="card" style="padding:18px 22px;margin-top:20px;background:var(--orange-soft);border-color:var(--orange-mid);">
      <div style="font-size:13.5px;font-weight:800;color:#7a4a1f;margin-bottom:6px;">Catatan</div>
      <p style="font-size:12.5px;color:#7a4a1f;line-height:1.7;margin:0;">
        Cup gratis dari kartu stempel sudah berjalan otomatis saat checkout. Benefit per tingkat (diskon %, diskon mingguan, gratis ulang tahun) saat ini <strong>tersimpan dan tampil ke pelanggan</strong>, tapi belum dipotong otomatis di total pesanan.
      </p>
    </div>
  </main>
</div>`;

  return page({ title: 'Program Stempel — Admin Pecup', bodyHtml: body, noindex: true });
}

// Shared date-range presets. Every date filter in the admin uses the same
// vocabulary so "bulan ini" means the same thing on every page.
const RANGE_PRESETS = [
  { key: 'hari-ini', label: 'Hari ini' },
  { key: '7-hari', label: '7 hari' },
  { key: '30-hari', label: '30 hari' },
  { key: 'bulan-ini', label: 'Bulan ini' },
  { key: 'bulan-lalu', label: 'Bulan lalu' },
  { key: 'tahun-ini', label: 'Tahun ini' },
  { key: 'semua', label: 'Semua' },
];

function rangeChips(basePath, activeKey, extra = {}) {
  const qs = (key) => {
    const params = new URLSearchParams({ ...extra, rentang: key });
    return `${basePath}?${params.toString()}`;
  };
  return RANGE_PRESETS.map(
    (p) =>
      `<a class="chip ${activeKey === p.key ? 'chip-active' : ''}" href="${qs(p.key)}" style="padding:7px 15px;border-radius:99px;font-size:12.5px;font-weight:600;${
        activeKey === p.key ? '' : 'color:var(--text);'
      }">${p.label}</a>`
  ).join('');
}

// Generic pager used by the order tables and the customer's own history.
function pageLinks(buildUrl, current, totalPages) {
  if (totalPages <= 1) return '';
  const link = (target, label, disabled) =>
    disabled
      ? `<span style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:700;color:var(--text-muted);opacity:0.45;">${label}</span>`
      : `<a class="btn-outline" href="${buildUrl(target)}" style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:700;">${label}</a>`;

  const windowSize = 5;
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const numbers = [];
  for (let p = start; p <= end; p += 1) {
    numbers.push(
      p === current
        ? `<span style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:800;background:var(--green);color:#fff;">${p}</span>`
        : `<a class="btn-outline" href="${buildUrl(p)}" style="padding:8px 13px;border-radius:9px;font-size:13px;font-weight:700;">${p}</a>`
    );
  }

  return `
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:18px;">
      ${link(1, '« Awal', current === 1)}
      ${link(current - 1, '‹ Sebelumnya', current === 1)}
      ${numbers.join('')}
      ${link(current + 1, 'Berikutnya ›', current === totalPages)}
      ${link(totalPages, 'Akhir »', current === totalPages)}
    </div>`;
}

// Finance view: what was sold, what was given away, and what actually came in.
function renderLaporan({ admin, report, view, activePreset, todayKey, showProfit = false, expenses = null }) {
  // Laba kotor  = uang masuk − PPN (bukan milik toko) − modal kemasan
  // Laba bersih = laba kotor − seluruh pengeluaran pada rentang yang sama
  const spend = expenses ? expenses.total : 0;
  const grossProfit = Number(report.grossProfit) || 0;
  const netProfit = grossProfit - spend;
  const profitBlock =
    showProfit && expenses
      ? `
    <div class="card" style="margin-bottom:22px;padding:0;overflow:hidden;">
      <div style="padding:18px 22px;border-bottom:1px solid var(--border);">
        <h3 style="font-size:16px;font-weight:800;margin-bottom:2px;">Untung &amp; Rugi</h3>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin:0;">
          Rentang yang sama dengan angka di atas. Hanya admin dengan izin &ldquo;lihat laba&rdquo; yang melihat bagian ini.
        </p>
      </div>
      <div style="padding:6px 22px 18px;">
        ${[
          ['Uang masuk', report.net, 'var(--text)', 'Total yang dibayar pembeli'],
          ['PPN dititipkan', -Number(report.tax || 0), '#a15a1f', 'Bukan pendapatan toko — untuk disetor'],
          ['Modal kemasan (HPP)', -Number(report.cogs || 0), '#a15a1f', 'Cup, tutup, sendok, dll. yang ikut terjual'],
        ]
          .map(
            ([label, value, color, hint]) => `
          <div style="display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13.5px;">${label}<span style="display:block;font-size:11.5px;color:var(--text-muted);margin-top:2px;">${hint}</span></span>
            <strong class="tnum" style="color:${color};white-space:nowrap;">${value < 0 ? '− ' : ''}${formatRupiah(
              Math.abs(value)
            )}</strong>
          </div>`
          )
          .join('')}
        <div style="display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--border);background:var(--green-soft);margin:0 -22px;padding-left:22px;padding-right:22px;">
          <span style="font-size:14px;font-weight:800;color:var(--green-dark);">Laba kotor</span>
          <strong class="tnum" style="font-size:15px;color:var(--green-dark);white-space:nowrap;">${formatRupiah(
            grossProfit
          )}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:13.5px;">Pengeluaran<span style="display:block;font-size:11.5px;color:var(--text-muted);margin-top:2px;">${
            expenses.count
          } catatan · <a href="/admin/pengeluaran?dari=${escapeAttr(view.dari || '')}&amp;sampai=${escapeAttr(
          view.sampai || ''
        )}">lihat rinciannya</a></span></span>
          <strong class="tnum" style="color:#a13f3f;white-space:nowrap;">− ${formatRupiah(spend)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;gap:14px;padding:16px 22px;margin:0 -22px -18px;background:${
          netProfit >= 0 ? 'var(--green-soft)' : '#f6dcdc'
        };">
          <span style="font-size:15px;font-weight:800;color:${netProfit >= 0 ? 'var(--green-dark)' : '#a13f3f'};">Laba bersih</span>
          <strong class="tnum" style="font-size:19px;color:${
            netProfit >= 0 ? 'var(--green-dark)' : '#a13f3f'
          };white-space:nowrap;">${netProfit < 0 ? '− ' : ''}${formatRupiah(Math.abs(netProfit))}</strong>
        </div>
      </div>
    </div>`
      : '';
  const bigStat = (label, value, sub, accent) => `
    <div class="card" style="padding:20px 22px;border-left:4px solid ${accent};">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.4px;text-transform:uppercase;">${label}</div>
      <div class="tnum" style="font-size:25px;font-weight:800;margin-top:8px;letter-spacing:-0.5px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${sub}</div>` : ''}
    </div>`;

  // Expenses for one day/month of the table. The map is keyed by 'YYYY-MM-DD',
  // so a monthly grouping sums the days whose key starts with that month.
  const dayExpense = (periode) => {
    if (!expenses) return 0;
    if (view.kelompok !== 'bulan') return expenses.byDay.get(periode) || 0;
    let total = 0;
    for (const [day, amount] of expenses.byDay) if (String(day).startsWith(periode)) total += amount;
    return total;
  };

  // Simple inline bar so the trend is visible without a charting library.
  const maxNet = Math.max(1, ...report.series.map((s) => s.net));
  const seriesRows = report.series.length
    ? report.series
        .map((s) => {
          const pct = Math.round((s.net / maxNet) * 100);
          const label = view.kelompok === 'bulan' ? s.periode : formatShortDateID(s.periode);
          return admRow([
            { label: '', html: `<span style="font-size:13px;font-weight:700;">${escapeHtml(label)}</span>` },
            { label: 'Pesanan', html: `<span class="tnum" style="font-size:13px;color:var(--text-muted);">${s.orders}</span>` },
            { label: 'Kotor', html: `<span class="tnum" style="font-size:13px;">${formatRupiah(s.gross)}</span>` },
            {
              label: 'Potongan',
              html: `<span class="tnum" style="font-size:13px;color:${s.discount ? '#a15a1f' : 'var(--text-muted)'};">${
                s.discount ? `−${formatRupiah(s.discount)}` : '—'
              }</span>`,
            },
            {
              label: 'Ongkos',
              html: `<span class="tnum" style="font-size:13px;color:var(--text-muted);">${
                s.delivery ? formatRupiah(s.delivery) : '—'
              }</span>`,
            },
            {
              label: 'Uang masuk',
              html: `<div style="display:flex;align-items:center;gap:10px;flex:1;">
          <div class="meter" style="flex:1;margin:0;"><div class="meter-fill is-full" style="width:${pct}%;"></div></div>
          <span class="tnum" style="font-size:13px;font-weight:800;color:var(--green-dark);white-space:nowrap;">${formatRupiah(s.net)}</span>
        </div>`,
            },
            // Per-day profit, and only for the admins allowed to see margins.
            ...(showProfit
              ? [
                  {
                    label: 'Laba kotor',
                    html: `<span class="tnum" style="font-size:13px;font-weight:700;color:${
                      s.grossProfit >= 0 ? 'var(--green-dark)' : '#a13f3f'
                    };white-space:nowrap;">${s.grossProfit < 0 ? '− ' : ''}${formatRupiah(Math.abs(s.grossProfit))}</span>`,
                  },
                  {
                    label: 'Pengeluaran',
                    html: `<span class="tnum" style="font-size:13px;color:${
                      dayExpense(s.periode) ? '#a13f3f' : 'var(--text-muted)'
                    };white-space:nowrap;">${dayExpense(s.periode) ? '− ' + formatRupiah(dayExpense(s.periode)) : '—'}</span>`,
                  },
                ]
              : []),
          ]);
        })
        .join('')
    : '';

  const maxProduct = Math.max(1, ...report.byProduct.map((p) => p.gross));
  const productRows = report.byProduct.length
    ? report.byProduct
        .map((p) =>
          admRow([
            { label: '', html: `<span style="font-size:13px;font-weight:700;">${escapeHtml(p.name)}</span>` },
            { label: 'Terjual', html: `<span class="tnum" style="font-size:13px;color:var(--text-muted);">${p.cups} cup</span>` },
            {
              label: 'Nilai',
              html: `<div style="display:flex;align-items:center;gap:10px;flex:1;">
          <div class="meter" style="flex:1;margin:0;"><div class="meter-fill" style="width:${Math.round(
            (p.gross / maxProduct) * 100
          )}%;"></div></div>
          <span class="tnum" style="font-size:13px;font-weight:700;white-space:nowrap;">${formatRupiah(p.gross)}</span>
        </div>`,
            },
          ])
        )
        .join('')
    : '';

  const exportQs = new URLSearchParams({
    dari: view.dari || '',
    sampai: view.sampai || '',
    status: view.includeAll ? '' : 'selesai',
  }).toString();

  const body = `
<div class="admin-shell">
  ${adminSidebar('laporan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Laporan</div>
        <h1 style="font-size:24px;font-weight:800;">Laporan Penjualan</h1>
        <p style="font-size:13.5px;color:var(--text-muted);margin-top:6px;">Angka di bawah dihitung dari pesanan <strong>${
          view.includeAll ? 'semua status' : 'berstatus Selesai'
        }</strong>.</p>
      </div>
      <a class="btn-primary" href="/admin/pesanan/unduh?${exportQs}" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Unduh CSV
      </a>
    </div>

    <div class="chip-row" style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px;">${rangeChips('/admin/laporan', activePreset, {
      kelompok: view.kelompok,
      semuaStatus: view.includeAll ? '1' : '',
    })}</div>

    <form method="get" action="/admin/laporan" class="card" style="padding:18px 20px;margin-bottom:22px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
      <div style="margin:0;flex:0 1 155px;">
        <label style="margin-bottom:5px;">Dari tanggal</label>
        <input type="date" name="dari" value="${escapeAttr(view.dari || '')}" max="${todayKey}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:0 1 155px;">
        <label style="margin-bottom:5px;">Sampai tanggal</label>
        <input type="date" name="sampai" value="${escapeAttr(view.sampai || '')}" max="${todayKey}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:0 1 150px;">
        <label style="margin-bottom:5px;">Kelompokkan</label>
        <select name="kelompok" style="padding:10px 12px;">
          <option value="hari" ${view.kelompok !== 'bulan' ? 'selected' : ''}>Per hari</option>
          <option value="bulan" ${view.kelompok === 'bulan' ? 'selected' : ''}>Per bulan</option>
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;font-weight:600;white-space:nowrap;">
        <input type="checkbox" name="semuaStatus" value="1" ${view.includeAll ? 'checked' : ''} style="width:17px;height:17px;">
        Termasuk pesanan belum selesai
      </label>
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Terapkan</button>
    </form>

    <div class="grid-4" style="margin-bottom:16px;gap:16px;">
      ${bigStat('Uang Masuk', formatRupiah(report.net), `${report.orders} pesanan`, 'var(--green)')}
      ${bigStat('Nilai Kotor', formatRupiah(report.gross), 'nilai cup sebelum potongan', 'var(--text-muted)')}
      ${bigStat(
        'Total Potongan',
        report.discount ? `−${formatRupiah(report.discount)}` : formatRupiah(0),
        'cup gratis + member + voucher',
        'var(--orange)'
      )}
      ${bigStat('Rata-rata / Pesanan', formatRupiah(report.averageOrder), `${report.cups} cup terjual`, 'oklch(60% 0.12 245)')}
    </div>

    ${profitBlock}

    ${
      report.discount > 0 || report.delivery > 0 || report.tax > 0
        ? `<div class="card" style="padding:18px 20px;margin-bottom:22px;background:var(--orange-soft);border-color:var(--orange-mid);">
      <div style="font-size:13px;color:#7a4a1f;line-height:1.8;">
        <strong>Cara angka ini menutup:</strong> nilai kotor ${formatRupiah(report.gross)}
        &minus; potongan ${formatRupiah(report.discount)}
        ${report.tax > 0 ? `+ PPN ${formatRupiah(report.tax)}` : ''}
        + ongkos antar ${formatRupiah(report.delivery)}
        = uang masuk <strong>${formatRupiah(report.net)}</strong>.
      </div>
      ${
        report.tax > 0
          ? `<div style="font-size:12.5px;color:#7a4a1f;line-height:1.7;margin-top:10px;">
              Dari jumlah itu, <strong>${formatRupiah(report.tax)}</strong> adalah PPN yang ditagihkan ke pembeli —
              uang titipan untuk disetor, bukan pendapatan toko.
            </div>`
          : ''
      }
      <div style="display:flex;gap:22px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:#7a4a1f;">
        <span>Cup gratis: <strong>${formatRupiah(report.freeCups)}</strong></span>
        <span>Diskon member: <strong>${formatRupiah(report.tierDiscount)}</strong></span>
        <span>Voucher: <strong>${formatRupiah(report.voucherDiscount)}</strong></span>
      </div>
      <div style="font-size:12.5px;color:#7a4a1f;line-height:1.7;margin-top:10px;">
        Cup gratis adalah barang yang keluar tanpa uang masuk — biaya promo, bukan kekurangan pembayaran.
        Semua kolom ini juga ada di CSV.
      </div>
    </div>`
        : ''
    }

    <div style="margin-bottom:24px;">
      ${admTable({
        cols: showProfit ? '1.1fr 0.6fr 1fr 1fr 0.9fr 1.4fr 1fr 1fr' : '1.1fr 0.6fr 1fr 1fr 0.9fr 1.4fr',
        minWidth: showProfit ? 1020 : 780,
        head: [
          view.kelompok === 'bulan' ? 'BULAN' : 'TANGGAL', 'PESANAN', 'KOTOR', 'POTONGAN', 'ONGKOS', 'UANG MASUK',
          ...(showProfit ? ['LABA KOTOR', 'PENGELUARAN'] : []),
        ],
        rows: seriesRows,
        empty: 'Tidak ada penjualan pada rentang ini.',
      })}
    </div>

    <h3 class="section-title" style="font-size:17px;font-weight:800;margin-bottom:6px;">Produk Terlaris</h3>
    <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:14px;">Berdasarkan nilai penjualan pada rentang yang dipilih.</p>
    ${admTable({
      cols: '1.6fr 0.6fr 1.4fr',
      minWidth: 520,
      head: ['PRODUK', 'TERJUAL', 'NILAI'],
      rows: productRows,
      empty: 'Belum ada produk terjual.',
    })}
  </main>
</div>`;

  return page({ title: 'Laporan Penjualan — Admin Pecup', bodyHtml: body, noindex: true });
}

// Landing page for the admin: what needs doing right now, in one screen.
function renderDashboard({ admin, today, lowStock, pendingOrders, upcoming, shop, revenue }) {
  const tile = (label, value, sub, accent, href) => {
    const inner = `
      <div class="card stat-card" style="padding:18px 20px;border-left:4px solid ${accent};height:100%;">
        <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.4px;text-transform:uppercase;">${label}</div>
        <div class="tnum" style="font-size:24px;font-weight:800;margin-top:7px;letter-spacing:-0.5px;">${value}</div>
        ${sub ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${sub}</div>` : ''}
      </div>`;
    return href ? `<a href="${href}" style="color:inherit;display:block;">${inner}</a>` : inner;
  };

  const orderList = pendingOrders.length
    ? pendingOrders
        .map((o) => {
          const status = orderStatus(o.status);
          return `<a class="row-hover" href="/admin/pesanan/${o.id}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--border);color:inherit;flex-wrap:wrap;">
            <div style="min-width:0;">
              <div style="font-size:13.5px;font-weight:700;">${escapeHtml(o.customer_name)}</div>
              <div class="tnum" style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(o.order_number)} · ${formatTimeID(o.created_at)} WIB</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="tnum" style="font-size:13px;font-weight:700;">${formatRupiah(o.total)}</span>
              <span style="font-size:11px;font-weight:700;color:${status.color};background:${status.bg};padding:4px 10px;border-radius:99px;white-space:nowrap;">${status.label}</span>
            </div>
          </a>`;
        })
        .join('')
    : `<div style="padding:26px 16px;color:var(--text-muted);font-size:13.5px;text-align:center;">Tidak ada pesanan yang menunggu. Mantap.</div>`;

  const stockList = lowStock.length
    ? lowStock
        .map(
          (p) => `<a class="row-hover" href="/admin/produk/${p.id}/edit" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px;border-top:1px solid var(--border);color:inherit;">
            <span style="font-size:13.5px;font-weight:600;">${escapeHtml(p.name)}</span>
            <span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:99px;white-space:nowrap;color:${
              Number(p.stock) <= 0 ? '#a13f3f' : '#a15a1f'
            };background:${Number(p.stock) <= 0 ? '#f6dcdc' : 'var(--orange-soft)'};">${
            Number(p.stock) <= 0 ? 'HABIS' : `SISA ${p.stock}`
          }</span>
          </a>`
        )
        .join('')
    : `<div style="padding:26px 16px;color:var(--text-muted);font-size:13.5px;text-align:center;">Semua stok aman.</div>`;

  const upcomingList = upcoming.length
    ? upcoming
        .map(
          (row) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px;border-top:1px solid var(--border);">
            <span style="font-size:13.5px;font-weight:600;">${escapeHtml(formatShortDateID(row.day))}</span>
            <span class="tnum" style="font-size:13px;color:var(--text-muted);">${row.orders} pesanan · ${row.cups} cup</span>
          </div>`
        )
        .join('')
    : `<div style="padding:26px 16px;color:var(--text-muted);font-size:13.5px;text-align:center;">Belum ada pengantaran terjadwal.</div>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('dashboard', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Ringkasan</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:4px;">Halo, ${escapeHtml(admin.username)}</h1>
    <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:22px;">Ringkasan hari ini, ${escapeHtml(formatDateID(new Date()))}.</p>

    ${
      !shop.open
        ? `<div class="flash flash-error" style="align-items:flex-start;">
            <strong>Toko sedang TUTUP</strong> — pembeli tidak bisa mengirim pesanan.
            <a href="/admin/pengaturan" style="margin-left:auto;font-weight:700;white-space:nowrap;">Buka toko →</a>
          </div>`
        : ''
    }

    <div class="grid-4" style="gap:16px;margin-bottom:26px;">
      ${
        can(admin, 'pesanan.lihat')
          ? tile('Pesanan Hari Ini', today.total, `${today.pending} menunggu verifikasi`, 'var(--orange)', '/admin/pesanan?tampilan=hari-ini')
          : ''
      }
      ${
        // Takings are a figure not every admin should see: the summary page is
        // open to all of them, so these two tiles follow the same permission as
        // the sales report they link to.
        can(admin, 'laporan.lihat')
          ? tile('Uang Masuk Hari Ini', formatRupiah(today.revenue), 'dari pesanan selesai', 'var(--green)', '/admin/laporan?rentang=hari-ini') +
            tile('Uang Masuk Bulan Ini', formatRupiah(revenue.month), `${revenue.monthOrders} pesanan selesai`, 'oklch(60% 0.12 245)', '/admin/laporan?rentang=bulan-ini')
          : ''
      }
      ${
        can(admin, 'produk.lihat')
          ? tile('Perlu Restock', lowStock.length, 'produk menipis atau habis', lowStock.length ? '#c94f4f' : 'var(--text-muted)', '/admin/produk?status=menipis')
          : ''
      }
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      ${
        // Each panel follows the permission for the thing it shows, so a
        // limited account gets a summary of its own work rather than a page
        // of links that turn it away.
        can(admin, 'pesanan.lihat')
          ? `<div style="flex:1 1 380px;min-width:0;">
        <div class="adm-table">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;">
            <h2 style="font-size:15px;font-weight:800;">Perlu Ditangani</h2>
            <a href="/admin/pesanan" style="font-size:12.5px;font-weight:700;">Semua pesanan →</a>
          </div>
          ${orderList}
        </div>
      </div>`
          : ''
      }

      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:20px;">
        ${
          can(admin, 'produk.lihat')
            ? `<div class="adm-table">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;">
            <h2 style="font-size:15px;font-weight:800;">Stok Menipis</h2>
            ${can(admin, 'produk.kelola') ? '<a href="/admin/produk" style="font-size:12.5px;font-weight:700;">Kelola →</a>' : ''}
          </div>
          ${stockList}
        </div>`
            : ''
        }

        ${
          can(admin, 'pesanan.lihat')
            ? `<div class="adm-table">
          <div style="padding:16px 18px;">
            <h2 style="font-size:15px;font-weight:800;">Pengantaran Mendatang</h2>
            <p style="font-size:12px;color:var(--text-muted);margin-top:3px;">Yang harus disiapkan.</p>
          </div>
          ${upcomingList}
        </div>`
            : ''
        }
      </div>
    </div>
  </main>
</div>`;
  return page({ title: 'Ringkasan — Admin Pecup', bodyHtml: body, noindex: true });
}

// Shop-wide operating settings: open/closed, notice, minimum order, delivery
// fee and the same-day cut-off.
function renderPengaturan({
  admin,
  shop,
  flash = '',
  error = '',
  retention = { proofDays: 90, logMonths: 12, lastRun: '' },
  // The next few dates the current rules actually allow — shown back to the
  // admin so a rule that accidentally closes the shop is obvious immediately.
  nextOpenDates = [],
}) {
  const body = `
<div class="admin-shell">
  ${adminSidebar('pengaturan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Pengaturan Toko</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Pengaturan Toko</h1>
    <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:22px;">Aturan yang berlaku untuk seluruh pesanan yang masuk.</p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <form method="post" action="/admin/pengaturan/toko" data-warn-unsaved>
      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="flex:1 1 300px;">
            <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Status Toko</h2>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin:0;">Kalau dimatikan, pembeli masih bisa lihat menu tapi tidak bisa mengirim pesanan. Pakai ini untuk libur, tanggal merah, atau kalau stok habis semua.</p>
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin:0;font-size:14px;font-weight:700;white-space:nowrap;">
            <input type="checkbox" name="shopOpen" value="1" ${shop.open ? 'checked' : ''} style="width:20px;height:20px;">
            Toko buka
          </label>
        </div>
        <div class="field" style="margin-top:20px;margin-bottom:0;">
          <label>Pengumuman di atas halaman</label>
          <input type="text" name="shopNotice" maxlength="200" value="${escapeAttr(shop.notice || '')}"
                 placeholder="Contoh: Libur Lebaran 1–5 April, pesanan dibuka lagi tanggal 6.">
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Tampil sebagai banner di atas halaman depan. Kosongkan kalau tidak ada pengumuman.</div>
        </div>
        <div class="field" style="margin-top:20px;margin-bottom:0;">
          <label>Nomor WhatsApp toko</label>
          <input type="tel" name="shopWhatsapp" inputmode="numeric" maxlength="20" value="${escapeAttr(
            shop.whatsapp ? formatWhatsapp(shop.whatsapp) : ''
          )}" placeholder="Contoh: 081234567890">
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Dipakai untuk tombol &ldquo;hubungi admin&rdquo; — misalnya saat pelanggan minta reset password.</div>
          ${
            shop.whatsapp
              ? ''
              : `<div class="flash flash-error" style="margin:10px 0 0;">
                  Belum diisi. Halaman <strong>Lupa Password</strong> menyuruh pelanggan menghubungi admin,
                  tapi tanpa nomor ini tombolnya tidak bisa ditampilkan — pelanggan jadi buntu di situ.
                </div>`
          }
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Ongkos Antar &amp; Minimal Belanja</h2>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:18px;">Ongkos antar ditambahkan setelah diskon — promo memotong harga buahnya, bukan biaya antarnya.</p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 200px;margin-bottom:0;">
            <label>Minimal belanja (Rp)</label>
            <input type="number" name="minOrder" min="0" step="1000" value="${escapeAttr(shop.minOrder)}">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">0 = tanpa minimal.</div>
          </div>
          <div class="field" style="flex:1 1 200px;margin-bottom:0;">
            <label>Ongkos antar (Rp)</label>
            <input type="number" name="deliveryFee" min="0" step="1000" value="${escapeAttr(shop.deliveryFee)}">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">0 = gratis ongkir selalu.</div>
          </div>
          <div class="field" style="flex:1 1 200px;margin-bottom:0;">
            <label>Gratis ongkir di atas (Rp)</label>
            <input type="number" name="freeDeliveryOver" min="0" step="1000" value="${escapeAttr(shop.freeDeliveryOver)}">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">0 = tidak ada gratis ongkir.</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="flex:1 1 300px;">
            <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">PPN</h2>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin:0;">
              Kalau dicentang, PPN ditambahkan ke setiap pesanan baru — dihitung dari harga buah <em>setelah</em>
              semua diskon, dan tidak dikenakan ke ongkos antar. Pesanan yang sudah masuk tidak ikut berubah:
              tarifnya disimpan per pesanan, jadi nota lama tetap apa adanya.
              <strong>Biarkan mati kalau toko belum PKP.</strong>
            </p>
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin:0;font-size:14px;font-weight:700;white-space:nowrap;">
            <input type="checkbox" name="taxEnabled" value="1" ${shop.taxEnabled ? 'checked' : ''} style="width:20px;height:20px;">
            Kenakan PPN
          </label>
        </div>
        <div class="field" style="margin-top:20px;margin-bottom:0;max-width:200px;">
          <label>Tarif PPN (%)</label>
          <input type="number" name="taxPercent" min="0" max="100" step="1" value="${escapeAttr(
            shop.taxPercent === 0 || shop.taxPercent ? shop.taxPercent : 11
          )}">
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Tarif berlaku saat ini 11%. Nilainya tetap tersimpan walau PPN dimatikan.</div>
        </div>
        ${
          shop.taxEnabled && Number(shop.taxPercent) > 0
            ? `<div class="flash flash-ok" style="margin:16px 0 0;">PPN ${Number(shop.taxPercent)}% sedang aktif dan ditagihkan ke pembeli.</div>`
            : `<div style="margin-top:16px;font-size:12.5px;color:var(--text-muted);">Status sekarang: <strong>tidak ada PPN</strong> yang ditagihkan.</div>`
        }
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="flex:1 1 300px;">
            <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Program Stempel &amp; Keanggotaan</h2>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin:0;">
              Kalau dimatikan, toko jalan seperti toko online biasa: <strong>tidak ada</strong> kartu stempel,
              cup gratis, diskon member, cup ulang tahun, maupun halaman keuntungan member — baik di sisi
              pembeli maupun di menu admin. Stempel yang sudah terkumpul <strong>tidak dihapus</strong>:
              kalau dinyalakan lagi, kartu semua pelanggan kembali persis seperti semula.
            </p>
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin:0;font-size:14px;font-weight:700;white-space:nowrap;">
            <input type="checkbox" name="loyaltyEnabled" value="1" ${shop.loyaltyEnabled ? 'checked' : ''} style="width:20px;height:20px;">
            Program aktif
          </label>
        </div>
        <div style="margin-top:16px;font-size:12.5px;color:var(--text-muted);">
          Status sekarang: <strong>${shop.loyaltyEnabled ? 'program stempel aktif' : 'tidak ada program stempel'}</strong>.
          ${shop.loyaltyEnabled ? 'Aturan stempel dan tier diatur di <a href="/admin/loyalitas">Program Stempel</a>.' : ''}
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Jam Operasional</h2>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:18px;">
          Di luar jam ini toko otomatis tutup — sama seperti mematikan tombol &ldquo;Toko buka&rdquo; di atas: menu tetap
          bisa dilihat, tapi checkout ditutup. Kosongkan keduanya kalau tidak mau dibatasi jam.
          ${
            shop.hoursLabel
              ? `<br><strong>Sekarang: ${shop.withinHours ? 'dalam jam buka' : 'di luar jam buka'} (${escapeHtml(shop.hoursLabel)}).</strong>`
              : ''
          }
        </p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 180px;margin-bottom:0;">
            <label>Jam buka (WIB)</label>
            <input type="time" name="openTime" value="${escapeAttr(shop.openTime || '')}">
          </div>
          <div class="field" style="flex:1 1 180px;margin-bottom:0;">
            <label>Jam tutup (WIB)</label>
            <input type="time" name="closeTime" value="${escapeAttr(shop.closeTime || '')}">
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Hari Pengantaran (Pre-order)</h2>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:16px;">
          Kalau Pecup hanya bikin di hari tertentu, centang harinya di sini. Tanggal di luar itu ditolak
          saat pembeli mengirim pesanan — bukan cuma disembunyikan. Tidak dicentang sama sekali = buka tiap hari.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
          ${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
            .map(
              (name, i) => `<label style="display:flex;align-items:center;gap:8px;margin:0;font-size:13px;font-weight:600;background:var(--surface-2);padding:9px 13px;border-radius:10px;cursor:pointer;">
                <input type="checkbox" name="deliveryDays" value="${i}" ${
                shop.delivery && shop.delivery.days.has(i) ? 'checked' : ''
              } style="width:17px;height:17px;">
                ${name}
              </label>`
            )
            .join('')}
        </div>

        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 240px;margin-bottom:0;">
            <label>Tanggal khusus ditutup</label>
            <input type="text" name="deliveryClosedDates" value="${escapeAttr(
              shop.delivery ? [...shop.delivery.closed].sort().join(', ') : ''
            )}" placeholder="2026-12-25, 2027-01-01">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Libur/tanggal merah, walaupun harinya dicentang di atas.</div>
          </div>
          <div class="field" style="flex:1 1 240px;margin-bottom:0;">
            <label>Tanggal khusus dibuka</label>
            <input type="text" name="deliveryOpenDates" value="${escapeAttr(
              shop.delivery ? [...shop.delivery.open].sort().join(', ') : ''
            )}" placeholder="2026-12-24">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Buka sekali saja, walaupun harinya tidak dicentang.</div>
          </div>
          <div class="field" style="flex:0 1 190px;margin-bottom:0;">
            <label>Tampilkan berapa hari ke depan</label>
            <input type="number" name="deliveryHorizon" min="1" max="60" value="${escapeAttr(
              shop.delivery ? shop.delivery.horizon : 14
            )}">
          </div>
        </div>

        <div style="margin-top:20px;padding-top:18px;border-top:1px solid var(--border);">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;">Cara pembeli memilih tanggal</div>
          <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:12px;">
            Keduanya pakai aturan hari yang sama — ini cuma soal tampilan, dan bisa ditukar kapan saja.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:flex-start;gap:10px;margin:0;flex:1 1 240px;background:var(--surface-2);padding:13px 15px;border-radius:12px;cursor:pointer;">
              <input type="radio" name="deliveryDateMode" value="kalender" ${
                shop.deliveryMode !== 'pilihan' ? 'checked' : ''
              } style="width:18px;height:18px;margin-top:2px;flex-shrink:0;">
              <span>
                <span style="display:block;font-size:13.5px;font-weight:700;">Kalender biasa</span>
                <span style="display:block;font-size:12px;color:var(--text-muted);line-height:1.6;margin-top:3px;">Pembeli pilih tanggal sendiri. Tanggal tutup ditolak saat dikirim.</span>
              </span>
            </label>
            <label style="display:flex;align-items:flex-start;gap:10px;margin:0;flex:1 1 240px;background:var(--surface-2);padding:13px 15px;border-radius:12px;cursor:pointer;">
              <input type="radio" name="deliveryDateMode" value="pilihan" ${
                shop.deliveryMode === 'pilihan' ? 'checked' : ''
              } style="width:18px;height:18px;margin-top:2px;flex-shrink:0;">
              <span>
                <span style="display:block;font-size:13.5px;font-weight:700;">Daftar tanggal tersedia</span>
                <span style="display:block;font-size:12px;color:var(--text-muted);line-height:1.6;margin-top:3px;">Hanya tanggal yang buka yang muncul, jadi tidak ada yang salah pilih.</span>
              </span>
            </label>
          </div>
        </div>

        ${
          nextOpenDates.length
            ? `<div class="flash flash-ok" style="margin:18px 0 0;">Tanggal terdekat yang bisa dipesan: ${nextOpenDates
                .slice(0, 5)
                .map((d) => escapeHtml(formatShortDateID(d)))
                .join(' · ')}</div>`
            : `<div class="flash flash-error" style="margin:18px 0 0;">Dengan aturan ini tidak ada satu pun tanggal yang bisa dipesan — pembeli tidak akan bisa checkout.</div>`
        }
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Batas Pesan untuk Diantar Hari Ini</h2>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:18px;">Beda dengan jam operasional di atas: toko tetap buka, tapi setelah jam ini pembeli tidak bisa lagi memilih tanggal antar <strong>hari ini</strong> — hanya besok atau setelahnya. Kosongkan kalau tidak ada batas.</p>
        <div class="field" style="max-width:200px;margin-bottom:0;">
          <label>Batas pesan hari ini (WIB)</label>
          <input type="time" name="sameDayCutoff" value="${escapeAttr(shop.sameDayCutoff || '')}">
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:4px;">Penyimpanan &amp; Retensi Data</h2>
        <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:18px;">
          <strong>Pesanan tidak pernah dihapus</strong> — itu catatan penjualanmu. Yang dibersihkan otomatis tiap malam
          hanya dua hal yang memakan tempat: berkas bukti transfer (foto dari HP, ukurannya besar) dan log aktivitas.
          Isi <strong>0</strong> kalau mau disimpan selamanya.
        </p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 220px;margin-bottom:0;">
            <label>Hapus bukti transfer setelah (hari)</label>
            <input type="number" name="retentionProofDays" min="0" max="3650" step="1" value="${escapeAttr(retention.proofDays)}">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Pesanannya tetap ada lengkap dengan nominal dan statusnya — hanya fotonya yang dihapus.</div>
          </div>
          <div class="field" style="flex:1 1 220px;margin-bottom:0;">
            <label>Hapus log aktivitas setelah (bulan)</label>
            <input type="number" name="retentionLogMonths" min="0" max="120" step="1" value="${escapeAttr(retention.logMonths)}">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Jejak audit admin. 12 bulan biasanya cukup.</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
          <span style="font-size:12.5px;color:var(--text-muted);">
            Pembersihan terakhir: <strong>${retention.lastRun ? escapeHtml(formatDateTimeID(retention.lastRun)) : 'belum pernah'}</strong>
          </span>
          <a class="btn-outline" href="/tugas/pembersihan" target="_blank" rel="noopener"
             style="margin-left:auto;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;">Jalankan sekarang</a>
        </div>
      </div>

      <button class="btn-primary" type="submit" style="padding:13px 26px;border-radius:11px;font-size:14px;font-weight:700;">Simpan Pengaturan</button>
    </form>
  </main>
</div>`;
  return page({ title: 'Pengaturan Toko — Admin Pecup', bodyHtml: body, noindex: true });
}

// Promo codes.
function renderVoucher({ admin, vouchers: list, kinds, flash = '', error = '' }) {
  const rows = list.length
    ? list
        .map((v) => {
          const expired = v.expires_at && toDateKey(v.expires_at) < toDateKey(new Date());
          const usedUp = v.usage_limit !== null && Number(v.used_count) >= Number(v.usage_limit);
          const state = !v.active
            ? { label: 'Nonaktif', color: 'var(--text-muted)', bg: 'var(--surface-2)' }
            : expired
            ? { label: 'Kedaluwarsa', color: '#a13f3f', bg: '#f6dcdc' }
            : usedUp
            ? { label: 'Kuota habis', color: '#a13f3f', bg: '#f6dcdc' }
            : { label: 'Aktif', color: '#3f7a42', bg: 'var(--green-soft)' };
          return admRow([
            {
              label: '',
              html: `<div>
                <div class="tnum" style="font-size:14px;font-weight:800;letter-spacing:0.5px;">${escapeHtml(v.code)}</div>
                <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">${
                  v.kind === 'nominal' ? `Potong ${formatRupiah(v.amount)}` : `Potong ${v.amount}%`
                }${v.max_discount ? ` (maks ${formatRupiah(v.max_discount)})` : ''}</div>
              </div>`,
            },
            {
              label: 'Min. belanja',
              html: `<span class="tnum" style="font-size:13px;">${v.min_spend > 0 ? formatRupiah(v.min_spend) : '—'}</span>`,
            },
            {
              label: 'Terpakai',
              html: `<span class="tnum" style="font-size:13px;">${v.used_count}${v.usage_limit !== null ? ` / ${v.usage_limit}` : ''}</span>`,
            },
            {
              label: 'Berlaku sampai',
              html: `<span style="font-size:12.5px;color:var(--text-muted);">${v.expires_at ? escapeHtml(formatShortDateID(v.expires_at)) : 'Tanpa batas'}</span>`,
            },
            {
              label: 'Status',
              html: `<span style="font-size:11.5px;font-weight:700;color:${state.color};background:${state.bg};padding:4px 11px;border-radius:99px;white-space:nowrap;display:inline-block;">${state.label}</span>`,
            },
            {
              label: '',
              html: `<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;">
                <form method="post" action="/admin/voucher/${v.id}/toggle">
                  <button class="btn-outline" type="submit" style="padding:7px 13px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;">${v.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </form>
                <form method="post" action="/admin/voucher/${v.id}/hapus" data-confirm="Hapus voucher ${escapeAttr(v.code)}?">
                  <button type="submit" class="icon-action" style="padding:6px;display:inline-flex;align-items:center;gap:6px;color:#c94f4f;font-size:12px;font-weight:700;" title="Hapus">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c94f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                    <span class="hide-desktop">Hapus</span>
                  </button>
                </form>
              </div>`,
            },
          ]);
        })
        .join('')
    : '';

  const body = `
<div class="admin-shell">
  ${adminSidebar('voucher', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Kode Promo</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Kode Promo</h1>
    <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:22px;">Pembeli memasukkan kodenya di halaman checkout. Potongan dihitung dari harga buah, setelah cup gratis dan sebelum ongkos antar.</p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <form method="post" action="/admin/voucher/tambah" class="card" style="margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:800;margin-bottom:18px;">Buat Kode Baru</h2>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <div class="field" style="flex:1 1 170px;">
          <label>Kode <span class="req">*</span></label>
          <input type="text" name="code" required maxlength="24" placeholder="HEMAT10" style="text-transform:uppercase;">
        </div>
        <div class="field" style="flex:1 1 190px;">
          <label>Jenis potongan</label>
          <select name="kind">${kinds.map((k) => `<option value="${k.value}">${k.label}</option>`).join('')}</select>
        </div>
        <div class="field" style="flex:1 1 150px;">
          <label>Nilai <span class="req">*</span></label>
          <input type="number" name="amount" required min="1" placeholder="10">
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Persen atau rupiah, sesuai jenis potongan yang dipilih.</div>
        </div>
        <div class="field" style="flex:1 1 170px;">
          <label>Maks. potongan (Rp)</label>
          <input type="number" name="maxDiscount" min="0" placeholder="Opsional">
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Hanya untuk potongan persen.</div>
        </div>
        <div class="field" style="flex:1 1 170px;">
          <label>Min. belanja (Rp)</label>
          <input type="number" name="minSpend" min="0" placeholder="0">
        </div>
        <div class="field" style="flex:1 1 150px;">
          <label>Batas pemakaian</label>
          <input type="number" name="usageLimit" min="0" placeholder="Tanpa batas">
        </div>
        <div class="field" style="flex:1 1 170px;">
          <label>Berlaku sampai</label>
          <input type="date" name="expiresAt">
        </div>
      </div>
      <button class="btn-primary" type="submit" style="padding:13px 26px;border-radius:11px;font-size:14px;font-weight:700;margin-top:6px;">Buat Kode</button>
    </form>

    ${admTable({
      cols: '1.4fr 1fr 0.9fr 1.1fr 1fr 1.3fr',
      minWidth: 860,
      head: ['KODE', 'MIN. BELANJA', 'TERPAKAI', 'BERLAKU SAMPAI', 'STATUS', ''],
      rows,
      empty: 'Belum ada kode promo. Buat satu di atas.',
    })}
  </main>
</div>`;
  return page({ title: 'Kode Promo — Admin Pecup', bodyHtml: body, noindex: true });
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
    'admin.password': 'Mengganti password admin',
    'customer.update': 'Mengubah data pelanggan',
    'customer.password': 'Mengganti password pelanggan',
    'customer.delete': 'Menghapus akun pelanggan',
    'voucher.create': 'Membuat kode promo',
    'voucher.update': 'Mengubah kode promo',
    'voucher.delete': 'Menghapus kode promo',
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
        .map((l) =>
          admRow([
            {
              label: '',
              html: `<span style="font-size:13px;font-weight:700;">${escapeHtml(actionLabel(l.action))}</span>`,
            },
            { label: 'Waktu', html: `<span style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;">${escapeHtml(formatDateTimeID(l.created_at))}</span>` },
            {
              label: 'Admin',
              // admin_id goes null when the account is deleted; the entry
              // itself stays, which is the whole point of an audit trail. The
              // tag says so, so a name with no account behind it doesn't read
              // as a mistake.
              html:
                `<span style="font-size:13.5px;font-weight:700;">${escapeHtml(l.admin_username)}</span>` +
                (l.admin_id === null || l.admin_id === undefined
                  ? `<span style="display:block;font-size:10.5px;font-weight:700;color:var(--text-muted);">akun sudah dihapus</span>`
                  : ''),
            },
            { label: 'Detail', html: `<span style="font-size:12.5px;color:var(--text-muted);text-align:right;">${l.detail ? escapeHtml(l.detail) : '—'}</span>` },
          ])
        )
        .join('')
    : '';

  const firstShown = total === 0 ? 0 : (current - 1) * (filters.per || 25) + 1;
  const lastShown = Math.min(current * (filters.per || 25), total);
  const nextSort = sort === 'desc' ? 'asc' : 'desc';

  const body = `
<div class="admin-shell">
  ${adminSidebar('log', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:20px;margin-top:20px;">
      <div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Log Aktivitas</div>
        <h1 style="font-size:24px;font-weight:800;">Log Aktivitas</h1>
      </div>
      <a class="btn-primary" href="/admin/log-aktivitas/export?${new URLSearchParams({
        dari: filters.dari || '',
        sampai: filters.sampai || '',
        admin: filters.admin || '',
        aksi: filters.aksi || '',
        urut: sort === 'asc' ? 'asc' : 'desc',
      }).toString()}"
         style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Unduh CSV
      </a>
    </div>

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
          <option value="">Semua</option>
          ${(options.admins || [])
            .map((a) => `<option value="${escapeAttr(a)}" ${filters.admin === a ? 'selected' : ''}>${escapeHtml(a)}</option>`)
            .join('')}
        </select>
      </div>
      <div style="margin:0;flex:0 1 190px;">
        <label style="margin-bottom:5px;">Jenis Aksi</label>
        <select name="aksi" style="padding:10px 12px;">
          <option value="">Semua</option>
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

    ${admTable({
      cols: '1.4fr 1.3fr 1fr 1.6fr',
      minWidth: 680,
      head: ['AKSI', 'WAKTU (WIB)', 'ADMIN', 'DETAIL'],
      rows,
      empty: 'Tidak ada aktivitas yang cocok dengan filter ini.',
      note: 'Unduh CSV mengikuti filter yang sedang aktif — seluruh baris yang cocok, bukan cuma halaman ini.',
    })}
    ${pager(filters, current, totalPages)}
  </main>
</div>`;

  return page({ title: 'Log Aktivitas — Admin Pecup', bodyHtml: body, noindex: true });
}

// Customer password-reset queue. An account here has no email address, so a
// reset can't be a mailed link — an admin confirms the person over WhatsApp,
// generates a one-time code, and reads it to them. The code is shown on this
// page exactly once, right after it's generated; only its hash is stored.
function renderResetSandi({ requests, admin, flash = '', issued = null, error = '' }) {
  const rows = requests.length
    ? requests
        .map((r) => {
          const badge = {
            menunggu: { label: 'Menunggu', color: '#a15a1f', bg: 'var(--orange-soft)' },
            disetujui: { label: 'Kode aktif', color: '#3f7a42', bg: 'var(--green-soft)' },
            selesai: { label: 'Selesai', color: 'var(--text-muted)', bg: 'var(--surface-2)' },
            ditolak: { label: 'Ditolak', color: '#a13f3f', bg: '#f6dcdc' },
          }[r.status] || { label: r.status, color: 'var(--text-muted)', bg: 'var(--surface-2)' };
          const open = r.status === 'menunggu' || r.status === 'disetujui';
          return admRow([
            {
              label: '',
              html: `<div style="min-width:0;">
                <div style="font-size:14px;font-weight:700;">${escapeHtml(r.name)}</div>
                <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;">${escapeHtml(
                  formatWhatsapp(r.whatsapp)
                )}</div>
              </div>`,
            },
            {
              label: 'Diminta',
              html: `<span style="font-size:13px;color:var(--text-muted);">${escapeHtml(
                formatDateTimeID(r.created_at)
              )}</span>`,
            },
            {
              label: 'Status',
              html: `<span style="font-size:11.5px;font-weight:700;color:${badge.color};background:${badge.bg};padding:4px 10px;border-radius:99px;white-space:nowrap;display:inline-block;">${badge.label}</span>`,
            },
            {
              label: 'Aksi',
              html: open
                ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                    <form method="post" action="/admin/reset-sandi/${r.id}/setujui">
                      <button type="submit" class="btn-primary" style="padding:9px 15px;border-radius:9px;font-size:12.5px;font-weight:700;">${
                        r.status === 'disetujui' ? 'Buat Kode Baru' : 'Setujui &amp; Buat Kode'
                      }</button>
                    </form>
                    <form method="post" action="/admin/reset-sandi/${r.id}/tolak" data-confirm="Tolak permintaan reset ini?">
                      <button type="submit" class="icon-action" style="padding:9px 14px;font-size:12.5px;font-weight:700;color:#c94f4f;">Tolak</button>
                    </form>
                  </div>`
                : `<span style="font-size:12.5px;color:var(--text-muted);">${
                    r.approved_by ? `oleh ${escapeHtml(r.approved_by)}` : '—'
                  }</span>`,
            },
          ]);
        })
        .join('')
    : '';

  const body = `
<div class="admin-shell">
  ${adminSidebar('reset', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}
    <div style="margin-bottom:8px;">
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Reset Password</div>
      <h1 style="font-size:24px;font-weight:800;">Reset Password Pelanggan</h1>
    </div>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;max-width:680px;margin:10px 0 24px;">
      Pelanggan tidak punya email di sistem ini — nomor WhatsApp-nya adalah username. Jadi reset dilakukan lewat kamu:
      pastikan dulu lewat chat bahwa itu memang orangnya, lalu klik <strong>Setujui</strong>. Kode 6 angka akan muncul
      <strong>sekali saja</strong> di halaman ini — kirimkan ke pelanggan lewat WhatsApp. Password barunya diisi sendiri
      oleh pelanggan; kamu tidak pernah melihat atau mengetiknya.
    </p>

    ${
      issued
        ? `<div class="card" style="margin-bottom:24px;background:var(--green-soft);border-color:var(--green);">
        <div style="font-size:13.5px;font-weight:800;color:var(--green-dark);margin-bottom:10px;">Kode untuk ${escapeHtml(
          issued.name
        )} (${escapeHtml(formatWhatsapp(issued.whatsapp))})</div>
        <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:38px;font-weight:800;letter-spacing:8px;color:var(--green-dark);">${escapeHtml(
          issued.code
        )}</div>
        <p style="font-size:13px;color:var(--green-dark);line-height:1.7;margin-top:12px;">
          Berlaku ${issued.expiresInMinutes} menit. Kode ini tidak akan ditampilkan lagi — kalau hilang, buat kode baru.
          Kirim lewat WhatsApp, jangan lewat jalur lain.
        </p>
        <a class="btn-primary" href="${escapeAttr(issued.waLink)}" target="_blank" rel="noopener"
           style="display:inline-block;margin-top:14px;padding:12px 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Kirim lewat WhatsApp</a>
      </div>`
        : ''
    }

    ${admTable({
      cols: '1.6fr 1.2fr 0.9fr 1.3fr',
      minWidth: 720,
      head: ['PELANGGAN', 'DIMINTA', 'STATUS', 'AKSI'],
      rows,
      empty: 'Belum ada permintaan reset password.',
      note: 'Kode berlaku 30 menit dan hangus setelah dipakai. Salah kode 5 kali menutup kode itu — buat kode baru kalau terjadi.',
    })}
  </main>
</div>`;

  return page({ title: 'Reset Password — Admin Pecup', bodyHtml: body, noindex: true });
}


// Superadmin-created customer account. Most of this shop's orders still arrive
// by word of mouth, so the people behind them need an account before their
// purchases can earn stamps. The password is generated and shown once — the
// admin passes it on, and the customer changes it from their account page.
function renderPelangganTambah({ admin, errors = [], values = {}, created = null }) {
  // WIB, not UTC: before 07:00 WIB the UTC date is still yesterday, which
  // would pre-fill the wrong day.
  const today = toDateKey(new Date());
  const waText = created
    ? encodeURIComponent(
        `Halo ${created.name}, akun Pecup kamu sudah dibuat. Masuk pakai nomor ini dengan password sementara: ${created.password}. Ganti passwordnya setelah masuk ya.`
      )
    : '';
  const body = `
<div class="admin-shell">
  ${adminSidebar('pelanggan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/pelanggan', 'Kembali ke Cari Pelanggan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Pelanggan / Tambah</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:8px;">Tambah Pelanggan</h1>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;max-width:620px;margin-bottom:24px;">
      Untuk pelanggan yang pesan lewat WhatsApp atau datang langsung. Dengan akun, pesanannya bisa dicatat
      di sini dan ikut mengumpulkan stempel.
    </p>

    ${
      created
        ? `<div class="card" style="margin-bottom:22px;background:var(--green-soft);border-color:var(--green);">
      <div style="font-size:14px;font-weight:800;color:var(--green-dark);margin-bottom:8px;">Akun ${escapeHtml(created.name)} dibuat</div>
      <div style="font-size:13px;color:var(--green-dark);line-height:1.8;">
        Nomor untuk masuk: <strong>${escapeHtml(formatWhatsapp(created.whatsapp))}</strong><br>
        Password sementara:
        <span style="font-family:monospace;font-size:19px;font-weight:800;letter-spacing:2px;">${escapeHtml(created.password)}</span>
      </div>
      <p style="font-size:12.5px;color:var(--green-dark);line-height:1.7;margin-top:10px;">
        Password ini hanya muncul sekali — kirimkan lewat WhatsApp, lalu minta pelanggan menggantinya sendiri.
        Kalau terlanjur hilang, pakai menu Reset Password.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
        <a class="btn-primary" href="https://wa.me/${escapeAttr(created.whatsapp)}?text=${escapeAttr(waText)}"
           target="_blank" rel="noopener" style="padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;">Kirim lewat WhatsApp</a>
        <a class="btn-outline" href="/admin/pesanan/tambah?pelanggan=${created.id}" style="padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;">Catat Pesanan untuk Akun Ini</a>
        <a class="btn-outline" href="/admin/pelanggan/${created.id}" style="padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;">Buka Detail</a>
      </div>
    </div>`
        : ''
    }

    ${errors.length ? `<div class="flash flash-error">${errors.map((e) => escapeHtml(e)).join('<br>')}</div>` : ''}

    <form method="post" action="/admin/pelanggan/tambah" class="card" data-warn-unsaved style="max-width:620px;">
      <div class="field">
        <label>Nama Lengkap <span class="req">*</span></label>
        <input type="text" name="name" required value="${escapeAttr(values.name || '')}" placeholder="Contoh: Kezia Sharent">
      </div>
      <div class="field">
        <label>Nomor WhatsApp <span class="req">*</span></label>
        <input type="tel" name="whatsapp" required inputmode="numeric" value="${escapeAttr(values.whatsapp || '')}" placeholder="Contoh: 081234567890">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Ini sekaligus username-nya saat masuk.</div>
      </div>
      <div class="field">
        <label>Lokasi Pengantaran</label>
        <input type="text" name="address" maxlength="200" value="${escapeAttr(values.address || '')}" placeholder="Contoh: Menara Batavia lt. 26">
      </div>
      <div class="field">
        <label>Tanggal Lahir <span style="font-weight:500;color:var(--text-muted);">(opsional)</span></label>
        <input type="date" name="birthday" max="${today}" value="${escapeAttr(values.birthday || '')}">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Perlu diisi kalau pelanggan ini mau dapat cup gratis ulang tahun.</div>
      </div>
      ${
        // Handing out stamps needs the stamp permission — the same rule as the
        // stamp controls on the customer page. Without it the account is created
        // empty; the route ignores the field either way.
        can(admin, 'pelanggan.stempel')
          ? `<div class="field" style="margin-bottom:8px;">
        <label>Stempel Awal</label>
        <input type="number" name="stamps" min="0" max="100" value="${escapeAttr(values.stamps || '0')}">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Kalau dia sudah belanja sebelum ada website, isi stempel yang sudah terkumpul.</div>
      </div>`
          : ''
      }
      <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;margin-top:14px;">Buat Akun Pelanggan</button>
    </form>
  </main>
</div>`;
  return page({ title: 'Tambah Pelanggan — Admin Pecup', bodyHtml: body, noindex: true });
}

// Manual order entry: a sale that happened over WhatsApp or at the door, typed
// in afterwards. It runs through the same create_order path as a web checkout,
// so stock, stamps, tier perks and the books all move together.
function renderPesananTambah({
  admin,
  products,
  picked = null,
  errors = [],
  values = {},
  taxPercent = 0,
  todayKey = '',
  openDates = [],
  deliveryMode = 'kalender',
  // Whether the loyalty programme is running at all. Defaults to on so a
  // caller that hasn't been told yet behaves as the shop always has.
  loyaltyOn = true,
  // Everything ticked as "pilihan isi" in the catalogue, and any combinations
  // the form is being redrawn with after an error.
  fruitOptions = [],
  // Per-product choice lists, keyed by product id. A combo product with its own
  // ticked list uses that; anything else falls back to fruitOptions above.
  fruitOptionsByProduct = {},
  mixLines = {},
}) {
  // WIB, not UTC: before 07:00 WIB the UTC date is still yesterday, which
  // would pre-fill the wrong day.
  const today = toDateKey(new Date());
  const qty = values.qty || {};
  // A combinable cup is built from the choices ticked in the catalogue, and
  // every cup can be a different build — eight cups can be eight combinations.
  // So those products get a list of combinations instead of one quantity box.
  // What may go inside THIS cup: its own ticked list when it has one, the
  // shop-wide "pilihan isi" pool when it doesn't.
  const optionsFor = (product) => {
    const own = fruitOptionsByProduct[String(product.id)];
    return own && own.length ? own : fruitOptions;
  };
  const isMix = (p) => Boolean(p.combo_enabled) && optionsFor(p).length > 0;
  // A product set up as combinable while nothing is ticked as a choice would
  // silently fall back to a plain quantity box, which looks like the feature
  // is broken. Say what's missing instead.
  const missingOptions = products.some((p) => p.combo_enabled && optionsFor(p).length === 0);
  const fruitCheckboxes = (product, index, chosen) =>
    optionsFor(product)
      .map(
        (f) => `<label style="display:inline-flex;align-items:center;gap:6px;margin:0;font-size:12.5px;font-weight:600;background:var(--surface);border:1.5px solid var(--border);border-radius:9px;padding:6px 10px;cursor:pointer;white-space:nowrap;">
          <input type="checkbox" name="mixBuah_${product.id}_${index}" value="${escapeAttr(f.id)}" ${
          chosen.includes(Number(f.id)) ? 'checked' : ''
        } style="width:15px;height:15px;">
          ${escapeHtml(f.name)}
        </label>`
      )
      .join('');

  const mixRow = (p, index, line) => `
        <div class="mix-line" data-mix-line style="border-top:1px dashed var(--border);padding:12px 0;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
            <span style="font-size:12px;font-weight:800;color:var(--text-muted);">KOMBINASI <span data-mix-number>${index + 1}</span></span>
            <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12.5px;">
              <span style="color:var(--text-muted);">Jumlah cup</span>
              <input type="number" name="mixQty_${p.id}" min="0" max="${p.unlimited_stock ? 9999 : p.stock}" value="${escapeAttr(
    line ? line.qty : 1
  )}" inputmode="numeric" style="width:70px;padding:6px 8px;font-size:12.5px;text-align:center;border-radius:8px;">
            </label>
            <button type="button" data-mix-remove style="margin-left:auto;background:none;border:none;color:#c94f4f;font-size:12px;font-weight:700;cursor:pointer;">Hapus</button>
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;">${fruitCheckboxes(p, index, line ? line.fruits : [])}</div>
        </div>`;

  const rows = products
    .map((p) => {
      if (isMix(p)) {
        const lines = mixLines[p.id] && mixLines[p.id].length ? mixLines[p.id] : [null];
        return `
      <div style="padding:14px 16px;border-top:1px solid var(--border);" data-mix-product="${p.id}" data-mix-max="${p.unlimited_stock ? 9999 : p.stock}">
        <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div style="flex:1 1 190px;min-width:0;">
            <div style="font-size:14px;font-weight:700;">${escapeHtml(p.name)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${formatRupiah(p.price)} · ${
      p.unlimited_stock ? 'stok tanpa batas' : `stok ${p.stock}`
    }</div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;line-height:1.6;">
              Tiap cup boleh beda isinya. Pesan 8 cup dengan 8 kombinasi? Tambah 8 baris di bawah.
              <br>Di website pembeli memilih ${escapeHtml(comboRangeText(p))} per cup — di sini bebas, sesuai pesanan aslinya.
            </div>
          </div>
          <div style="font-size:12.5px;font-weight:700;color:var(--green-dark);white-space:nowrap;">
            Total: <span data-mix-total>0</span> cup
          </div>
        </div>
        <div data-mix-lines>${lines.map((line, i) => mixRow(p, i, line)).join('')}</div>
        <button type="button" data-mix-add style="margin-top:10px;background:none;border:1.5px dashed var(--border);border-radius:10px;padding:9px 14px;font-size:12.5px;font-weight:700;color:var(--green-dark);cursor:pointer;">+ Tambah kombinasi</button>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;line-height:1.6;">
          ${optionsFor(p).length} pilihan isi tersedia untuk produk ini. Mau nambah varian buah potong?
          Buat produknya di <a href="/admin/produk">Produk</a> lalu centang &ldquo;Jadikan pilihan isi&rdquo; — langsung muncul di sini.
        </div>
      </div>`;
      }
      return `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--border);flex-wrap:wrap;">
        <div style="flex:1 1 190px;min-width:0;">
          <div style="font-size:14px;font-weight:700;">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${formatRupiah(p.price)} · stok ${p.stock}</div>
        </div>
        <div class="qty-pick" data-max="${p.unlimited_stock ? 9999 : p.stock}">
          <label style="margin:0;font-size:12px;color:var(--text-muted);">Jumlah</label>
          <button type="button" class="step-btn qty-step" data-delta="-1"
                  aria-label="Kurangi jumlah ${escapeAttr(p.name)}">&minus;</button>
          <input type="number" name="qty_${p.id}" min="0" max="${p.unlimited_stock ? 9999 : p.stock}" value="${escapeAttr(qty[p.id] || '')}"
                 inputmode="numeric" placeholder="0" aria-label="Jumlah ${escapeAttr(p.name)}">
          <button type="button" class="step-btn qty-step" data-delta="1"
                  aria-label="Tambah jumlah ${escapeAttr(p.name)}">+</button>
        </div>
      </div>`;
    })
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('pesanan', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin/pesanan', 'Kembali ke Pesanan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Pesanan / Catat Manual</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:8px;">Catat Pesanan Manual</h1>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;max-width:640px;margin-bottom:24px;">
      Untuk pesanan yang masuk lewat WhatsApp atau langsung di tempat. Stok otomatis terpotong, dan kalau
      dipilihkan akun pelanggan, pesanan ini ikut menghitung stempel dan benefit tier persis seperti pesanan dari website.
      ${
        taxPercent > 0
          ? `<br><strong>PPN ${taxPercent}% ikut ditambahkan</strong> ke pesanan ini, sama seperti pesanan dari website.`
          : ''
      }
    </p>

    ${errors.length ? `<div class="flash flash-error">${errors.map((e) => escapeHtml(e)).join('<br>')}</div>` : ''}

    <form method="post" action="/admin/pesanan/tambah" data-warn-unsaved>
      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:16px;">Pemesan</h2>
        <div class="field">
          <label>Akun Pelanggan</label>
          <!-- The account is posted by this one hidden field. The page no
               longer carries a list of every customer — that list only grows,
               and on a phone it was already the heaviest thing here. The
               search box below asks the server instead, as you type. -->
          <input type="hidden" name="customerId" id="custValue" value="${escapeAttr(
            picked ? String(picked.id) : ''
          )}">

          <div class="cust-picker" id="custPicker">
            <div class="cust-chosen${picked ? ' is-on' : ''}" id="custChosen">${
              picked
                ? `<span class="cust-chosen-text">${escapeHtml(picked.name)}${
                    picked.wa ? ` — ${escapeHtml(picked.wa)}` : ''
                  }</span><button type="button" data-cust-clear>Ganti</button>`
                : ''
            }</div>
            <div class="cust-search-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="search" id="custSearch" autocomplete="off" placeholder="Cari nama atau nomor WhatsApp…"
                     aria-label="Cari pelanggan" aria-controls="custResults">
            </div>
            <div class="cust-results" id="custResults" role="listbox"></div>
          </div>

          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;line-height:1.6;">
            Pilih akun supaya pesanan ini menambah stempel — nama, nomor dan alamatnya ikut terisi.
            Kosongkan saja kalau pembeli tidak punya akun.
            Belum punya akun? <a href="/admin/pelanggan/tambah">Buat dulu di sini</a>,
            atau buka <a href="/admin/pelanggan">daftar pelanggan</a> lalu catat pesanan dari sana.
          </div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 240px;">
            <label>Nama Pemesan <span class="req">*</span></label>
            <input type="text" name="customerName" required value="${escapeAttr(values.customerName || '')}" placeholder="Nama yang tercatat di pesanan">
          </div>
          <div class="field" style="flex:1 1 240px;">
            <label>Nomor WhatsApp <span class="req">*</span></label>
            <input type="tel" name="whatsapp" required inputmode="numeric" value="${escapeAttr(values.whatsapp || '')}" placeholder="081234567890">
          </div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 240px;margin-bottom:0;">
            <label>Tanggal Antar <span class="req">*</span></label>
            <input type="date" name="deliveryDate" required value="${escapeAttr(values.deliveryDate || today)}"
                   list="tanggalTersedia">
            ${
              // The open days as suggestions, not a cage: an admin recording a
              // sale that already happened must still be able to type any date.
              openDates.length
                ? `<datalist id="tanggalTersedia">${openDates
                    .map((d) => `<option value="${escapeAttr(d)}">`)
                    .join('')}</datalist>
                   <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">
                     Tanggal antar yang dibuka: ${openDates.slice(0, 6).map((d) => escapeHtml(formatShortDateID(d))).join(' · ')}${
                    openDates.length > 6 ? ' …' : ''
                  }
                   </div>`
                : ''
            }
          </div>
          <div class="field" style="flex:1 1 240px;margin-bottom:0;">
            <label>Lokasi Antar</label>
            <input type="text" name="address" maxlength="200" value="${escapeAttr(values.address || '')}" placeholder="Contoh: ambil di tempat">
          </div>
        </div>
      </div>

      <div class="adm-table" style="margin-bottom:20px;">
        <div style="padding:16px 18px;">
          <h2 style="font-size:16px;font-weight:800;">Isi Pesanan</h2>
          <p style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">Isi jumlah cup untuk produk yang dibeli. Kosongkan yang tidak dibeli.</p>
          ${
            missingOptions
              ? `<div style="margin-top:12px;background:var(--orange-soft);border-radius:10px;padding:12px 14px;font-size:12px;color:#7a4a1f;line-height:1.6;">
                   Ada produk kombinasi, tapi belum ada produk yang dicentang sebagai <strong>pilihan isi</strong>,
                   jadi isinya belum bisa dipilih di sini. Buka <a href="/admin/produk" style="color:#7a4a1f;font-weight:700;">Produk</a>,
                   edit buah potongnya, lalu centang &ldquo;Jadikan pilihan isi&rdquo;.
                 </div>`
              : ''
          }
        </div>
        ${rows}
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:16px;">Pembayaran &amp; Status</h2>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div class="field" style="flex:1 1 200px;">
            <label>Tanggal Pesanan</label>
            <input type="date" name="orderDate" max="${escapeAttr(todayKey)}" value="${escapeAttr(
              values.orderDate || todayKey
            )}">
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">
              Hari pesanan ini benar-benar terjadi. Kalau kamu catat besok, mundurkan tanggalnya supaya
              laporan penjualan tetap jatuh di hari yang benar.
            </div>
          </div>
          <div class="field" style="flex:1 1 200px;">
            <label>Ongkos Antar (Rp)</label>
            <input type="number" name="deliveryFee" min="0" step="500" value="${escapeAttr(values.deliveryFee || '0')}">
          </div>
          <div class="field" style="flex:1 1 200px;">
            <label>Status Pesanan</label>
            <select name="status">
              ${ORDER_STATUSES.filter((o) => o.value !== 'dibatalkan')
                .map(
                  (o) => `<option value="${o.value}" ${(values.status || 'selesai') === o.value ? 'selected' : ''}>${o.label}</option>`
                )
                .join('')}
            </select>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Ini soal <strong>cup-nya</strong> — sudah disiapkan/diantar atau belum. Uangnya diatur terpisah di bawah.</div>
          </div>
        </div>

        <div style="background:var(--surface-2);border-radius:12px;padding:14px 16px;margin-top:16px;">
          <div style="font-size:13.5px;font-weight:700;margin-bottom:4px;">Uangnya sudah masuk?</div>
          <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:12px;">
            Terpisah dari status di atas: cup bisa sudah diantar tapi bayarnya belakangan, atau sudah
            ditransfer padahal belum disiapkan. Yang belum dibayar tetap kelihatan di daftar pesanan.
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:9px;margin:0;flex:1 1 190px;background:var(--surface);border:1.5px solid var(--border);border-radius:11px;padding:12px 14px;font-size:13.5px;font-weight:600;cursor:pointer;">
              <input type="radio" name="paid" value="1" ${values.paid === false ? '' : 'checked'} style="width:18px;height:18px;flex-shrink:0;">
              Sudah dibayar
            </label>
            <label style="display:flex;align-items:center;gap:9px;margin:0;flex:1 1 190px;background:var(--surface);border:1.5px solid var(--border);border-radius:11px;padding:12px 14px;font-size:13.5px;font-weight:600;cursor:pointer;">
              <input type="radio" name="paid" value="0" ${values.paid === false ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
              Belum dibayar
            </label>
          </div>
        </div>
        ${
          // No stamp card means no free cup to spend, so the option isn't
          // offered. The route ignores the field either way.
          loyaltyOn
            ? `<label style="display:flex;align-items:flex-start;gap:10px;margin:4px 0 0;font-size:13.5px;font-weight:600;cursor:pointer;">
          <input type="checkbox" name="useReward" value="1" ${values.useReward ? 'checked' : ''} style="width:18px;height:18px;margin-top:2px;flex-shrink:0;">
          <span>Pakai 1 cup gratis dari kartu stempel pelanggan (kalau kartunya memang penuh)</span>
        </label>`
            : ''
        }

        <!-- The hidden 0 comes first on purpose: an unticked checkbox posts
             nothing at all, so without it "don't register them" would be
             indistinguishable from "the field wasn't on the form". The parser
             keeps the last value of a repeated name, so ticked wins. -->
        <input type="hidden" name="buatAkun" value="0">
        <label style="display:flex;align-items:flex-start;gap:10px;margin:14px 0 0;font-size:13.5px;font-weight:600;cursor:pointer;background:var(--green-soft);border-radius:11px;padding:13px 15px;">
          <input type="checkbox" name="buatAkun" value="1" ${values.buatAkun === false ? '' : 'checked'} style="width:18px;height:18px;margin-top:2px;flex-shrink:0;">
          <span>
            Daftarkan pembeli ini sebagai pelanggan
            <span style="display:block;font-size:12px;font-weight:500;color:var(--green-dark);line-height:1.6;margin-top:3px;">
              Tanpa ini pesanannya tercatat sebagai pembeli lepas${
                loyaltyOn ? ' — <strong>stempelnya tidak masuk</strong>' : ' dan tidak punya riwayat pesanan'
              }.
              Kalau nomornya sudah punya akun, pesanan ini otomatis ditautkan ke akun itu, bukan bikin baru.
              Akun baru dibuat tanpa password yang bisa dipakai — kalau pelanggan mau masuk sendiri,
              dia pakai menu &ldquo;Lupa Password&rdquo; dan kamu yang menyetujui kodenya.
            </span>
          </span>
        </label>
        <div class="field" style="margin-top:18px;margin-bottom:0;">
          <label>Catatan</label>
          <textarea name="notes" rows="2" placeholder="Contoh: pesan lewat WhatsApp, bayar tunai">${escapeHtml(values.notes || '')}</textarea>
        </div>
      </div>

      <button class="btn-primary" type="submit" style="padding:14px 26px;border-radius:11px;font-size:14.5px;font-weight:700;">Simpan Pesanan</button>
      <p style="font-size:12px;color:var(--text-muted);line-height:1.7;margin-top:12px;">
        Stok langsung dipotong sesuai jumlah di atas, sama seperti pesanan dari website.
      </p>
    </form>
  </main>
</div>
<script>
// Combinations for a "Mix Buah" product: add a row per different cup. The rows
// are plain form fields, so the order still saves correctly with JavaScript
// off — you just get the one combination the page was rendered with.
(function(){
  var blocks = document.querySelectorAll('[data-mix-product]');
  for (var b = 0; b < blocks.length; b++) wire(blocks[b]);

  function wire(block){
    var list = block.querySelector('[data-mix-lines]');
    var add = block.querySelector('[data-mix-add]');
    if(!list || !add) return;

    function renumber(){
      var lines = list.querySelectorAll('[data-mix-line]');
      var total = 0;
      for (var i = 0; i < lines.length; i++){
        var n = lines[i].querySelector('[data-mix-number]');
        if(n) n.textContent = String(i + 1);
        // The checkbox name carries the row index so the server can tell one
        // combination from another; renumbering keeps them in step after a
        // row in the middle is removed.
        var boxes = lines[i].querySelectorAll('input[type="checkbox"]');
        for (var c = 0; c < boxes.length; c++){
          boxes[c].name = boxes[c].name.replace(/_\\d+$/, '_' + i);
        }
        var qty = lines[i].querySelector('input[type="number"]');
        total += Math.max(0, Number(qty && qty.value) || 0);
        if(lines.length === 1){
          var rm = lines[i].querySelector('[data-mix-remove]');
          if(rm) rm.style.visibility = 'hidden';
        }
      }
      var out = block.querySelector('[data-mix-total]');
      if(out){
        out.textContent = String(total);
        var max = Number(block.getAttribute('data-mix-max')) || 0;
        out.style.color = total > max ? '#c94f4f' : '';
      }
    }

    add.addEventListener('click', function(){
      var lines = list.querySelectorAll('[data-mix-line]');
      var copy = lines[lines.length - 1].cloneNode(true);
      var boxes = copy.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
      var qty = copy.querySelector('input[type="number"]');
      if(qty) qty.value = '1';
      var rm = copy.querySelector('[data-mix-remove]');
      if(rm) rm.style.visibility = '';
      list.appendChild(copy);
      renumber();
    });

    block.addEventListener('click', function(e){
      var rm = e.target.closest && e.target.closest('[data-mix-remove]');
      if(!rm) return;
      var lines = list.querySelectorAll('[data-mix-line]');
      if(lines.length <= 1) return;
      var line = rm.closest('[data-mix-line]');
      if(line) line.remove();
      renumber();
    });

    block.addEventListener('input', renumber);
    renumber();
  }
})();
</script>
<style>
  /* Searchable account picker. Sizes are in relative units and the results box
     is capped by viewport height, so it behaves on a small phone as well as a
     desktop panel. */
  .cust-search-wrap{position:relative;display:flex;align-items:center;}
  .cust-search-wrap svg{position:absolute;left:13px;pointer-events:none;}
  .cust-search-wrap input[type="search"]{padding-left:38px !important;}
  .cust-results{margin-top:8px;border:1.5px solid var(--border);border-radius:12px;
    background:var(--surface);max-height:min(46vh,300px);overflow-y:auto;-webkit-overflow-scrolling:touch;}
  .cust-results:empty{display:none;}
  .cust-opt{display:block;width:100%;text-align:left;background:none;border:0;
    border-bottom:1px solid var(--border);padding:12px 14px;font-size:14px;cursor:pointer;
    font-family:inherit;color:var(--text);line-height:1.45;}
  .cust-opt:last-child{border-bottom:0;}
  .cust-opt:hover, .cust-opt:focus-visible{background:var(--orange-soft);outline:none;}
  .cust-opt[aria-selected="true"]{background:var(--orange-soft);}
  .cust-opt .cust-opt-name{font-weight:700;display:block;}
  .cust-opt .cust-opt-wa{font-size:12.5px;color:var(--text-muted);display:block;margin-top:2px;}
  .cust-empty{padding:14px;font-size:13px;color:var(--text-muted);}
  .cust-chosen{display:none;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;
    padding:11px 14px;border:1.5px solid var(--green-soft);background:var(--green-soft);border-radius:12px;}
  .cust-chosen.is-on{display:flex;}
  .cust-chosen .cust-chosen-text{font-size:13.5px;font-weight:700;min-width:0;word-break:break-word;flex:1 1 auto;}
  .cust-chosen button{flex:0 0 auto;background:var(--surface);border:1px solid var(--border);
    border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;color:var(--text);}

  /* Quantity stepper. Typing a number still works; the buttons are there so a
     phone doesn't need the keyboard at all. */
  .qty-pick{display:flex;align-items:center;gap:7px;}
  .qty-pick .step-btn{width:34px;height:34px;border-radius:9px;border:1px solid var(--border);
    display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;
    color:var(--text);font-family:inherit;line-height:1;}
  .qty-pick input[type="number"]{width:64px;text-align:center;font-weight:700;
    -moz-appearance:textfield;appearance:textfield;}
  /* The native spinners sit under our own buttons and make the box cramped. */
  .qty-pick input[type="number"]::-webkit-outer-spin-button,
  .qty-pick input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
  .qty-pick .step-btn:disabled{opacity:0.35;cursor:not-allowed;}
  @media (max-width: 860px){
    /* Real thumb targets once this is a phone form. */
    .qty-pick .step-btn{width:42px;height:42px;font-size:19px;}
    .qty-pick input[type="number"]{width:62px;}
  }
</style>
<script>
// Account picker.
//
// The customer list is not in this page — it is asked for as you type, 20 rows
// at a time. Embedding the whole table was fine at a handful of customers and
// would not have stayed fine: it grows forever, and it is the phone on the
// other end that pays for it.
(function(){
  var value=document.getElementById('custValue');
  var picker=document.getElementById('custPicker');
  var search=document.getElementById('custSearch');
  var results=document.getElementById('custResults');
  var chosen=document.getElementById('custChosen');
  if(!value||!picker||!search||!results||!chosen) return;

  var timer=null;
  var inflight=null;      // the request in progress, so a stale reply can't win
  var lastTerm=null;

  function field(n){ return document.querySelector('[name="'+n+'"]'); }

  function clearChoice(){
    value.value='';
    chosen.className='cust-chosen';
    chosen.innerHTML='';
  }

  function setChosen(o){
    value.value=String(o.id);
    chosen.className='cust-chosen is-on';
    var t=document.createElement('span'); t.className='cust-chosen-text';
    t.textContent=o.name+(o.wa?' — '+o.wa:'');
    var b=document.createElement('button'); b.type='button'; b.textContent='Ganti';
    b.setAttribute('data-cust-clear','');
    chosen.innerHTML=''; chosen.appendChild(t); chosen.appendChild(b);
    // Fill the order fields from the account — that is the point of picking one.
    var n=field('customerName'), w=field('whatsapp'), a=field('address');
    if(n) n.value=o.name;
    if(w) w.value=o.wa||o.digits;
    if(a && o.address && !a.value) a.value=o.address;
  }

  // Works for the "Ganti" button the server rendered as well as ours.
  chosen.addEventListener('click',function(e){
    var btn=e.target.closest?e.target.closest('[data-cust-clear]'):null;
    if(!btn) return;
    clearChoice();
    search.value='';
    message('Ketik nama atau nomor WhatsApp untuk mencari akun.');
    search.focus();
  });

  function message(text){
    results.innerHTML='';
    var e=document.createElement('div'); e.className='cust-empty';
    e.textContent=text;
    results.appendChild(e);
  }

  function draw(list){
    results.innerHTML='';
    if(!list.length){
      message('Tidak ada pelanggan yang cocok. Pesanan bisa tetap dicatat tanpa akun.');
      return;
    }
    list.forEach(function(o){
      var b=document.createElement('button');
      b.type='button'; b.className='cust-opt'; b.setAttribute('role','option');
      b.setAttribute('aria-selected', String(value.value===String(o.id)));
      var nm=document.createElement('span'); nm.className='cust-opt-name';
      nm.textContent=o.name;
      b.appendChild(nm);
      if(o.wa){ var wa=document.createElement('span'); wa.className='cust-opt-wa'; wa.textContent=o.wa; b.appendChild(wa); }
      b.addEventListener('click',function(){
        setChosen(o);
        results.innerHTML='';
        search.value='';
      });
      results.appendChild(b);
    });
  }

  function run(term){
    if(term===lastTerm) return;
    lastTerm=term;
    if(!term){
      if(inflight){ inflight.abort(); inflight=null; }
      message('Ketik nama atau nomor WhatsApp untuk mencari akun.');
      return;
    }
    // Only the newest question gets an answer: without this a slow reply for
    // "an" can land after the reply for "andi" and overwrite it.
    if(inflight) inflight.abort();
    var ctrl=new AbortController();
    inflight=ctrl;
    fetch('/admin/pelanggan/cari?q='+encodeURIComponent(term),{signal:ctrl.signal,credentials:'same-origin'})
      .then(function(res){ if(!res.ok) throw new Error('gagal'); return res.json(); })
      .then(function(data){
        if(ctrl!==inflight) return;
        inflight=null;
        draw((data&&data.customers)||[]);
      })
      .catch(function(err){
        if(err&&err.name==='AbortError') return;
        if(ctrl!==inflight) return;
        inflight=null;
        message('Pencarian gagal. Periksa koneksi lalu ketik lagi.');
      });
  }

  search.addEventListener('input',function(){
    var term=search.value.trim();
    if(timer) clearTimeout(timer);
    // Long enough that typing a name isn't one request per letter, short
    // enough that the list doesn't feel late.
    timer=setTimeout(function(){ run(term); },220);
  });

  // Enter must not submit the whole order form from the search box.
  search.addEventListener('keydown',function(ev){
    if(ev.key!=='Enter') return;
    ev.preventDefault();
    var first=results.querySelector('.cust-opt');
    if(first){ first.click(); return; }
    if(timer){ clearTimeout(timer); timer=null; }
    run(search.value.trim());
  });

  message('Ketik nama atau nomor WhatsApp untuk mencari akun.');
})();

// Quantity steppers: clamp between 0 and the stock on hand, and grey out the
// button that would take it past either end.
(function(){
  function sync(box){
    var input=box.querySelector('input[type="number"]');
    var max=Number(box.getAttribute('data-max'))||0;
    var v=Math.max(0,Math.min(max,Math.round(Number(input.value)||0)));
    var btns=box.querySelectorAll('.qty-step');
    for(var i=0;i<btns.length;i++){
      var d=Number(btns[i].getAttribute('data-delta'));
      btns[i].disabled = (d<0 && v<=0) || (d>0 && v>=max);
    }
    return {input:input,max:max,value:v};
  }
  var boxes=document.querySelectorAll('.qty-pick');
  for(var i=0;i<boxes.length;i++){(function(box){
    sync(box);
    box.addEventListener('click',function(e){
      var btn=e.target.closest?e.target.closest('.qty-step'):null;
      if(!btn||btn.disabled)return;
      var s=sync(box);
      var next=Math.max(0,Math.min(s.max,s.value+Number(btn.getAttribute('data-delta'))));
      // Blank rather than 0 keeps "not ordered" visually distinct from "zero".
      s.input.value = next===0 ? '' : String(next);
      sync(box);
    });
    box.addEventListener('input',function(){ sync(box); });
  })(boxes[i]);}
})();
</script>`;
  return page({ title: 'Catat Pesanan Manual — Admin Pecup', bodyHtml: body, noindex: true });
}

module.exports = {
  renderResetSandi,
  renderPelangganTambah,
  renderPesananTambah,
  renderPelangganList,
  renderPelangganDetail,
  renderLoyalitas,
  renderLaporan,
  renderDashboard,
  renderPengaturan,
  renderVoucher,
  renderLogin,
  renderProdukList,
  renderProdukForm,
  renderPesananList,
  renderPesananDetail,
  renderAdminList,
  renderAdminIzin,
  renderForbidden,
  renderAdminLog,
};
