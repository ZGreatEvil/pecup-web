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
  toDateKey,
  ORDER_STATUSES,
} = require('../utils');
const { tierStyle: tierStyleFor } = require('../loyalty');
const { discountLines, freeCupValue } = require('../orderMoney');

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
        .map((p) =>
          admRow(
            [
              {
                label: '',
                html: `<div class="adm-lead">
          <div class="adm-thumb">${productThumb(p, { size: 40, radius: 12 })}</div>
          <span class="adm-lead-name">${escapeHtml(p.name)}</span>
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
          <form method="post" action="/admin/produk/${p.id}/hapus" onsubmit="return confirm('Hapus produk ${escapeAttr(p.name)}?');">
            <button type="submit" class="icon-action" style="padding:6px;display:inline-flex;align-items:center;gap:6px;color:#c94f4f;font-size:12px;font-weight:700;" title="Hapus">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c94f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0l-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
              <span class="hide-desktop">Hapus</span>
            </button>
          </form>
        </div>`,
              },
            ],
            { style: Number(p.stock) <= 0 ? 'background:oklch(99% 0.012 25);' : '' }
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8">${iconPath}</svg>
        </div>
        <div><div style="font-size:22px;font-weight:800;">${value}</div><div style="font-size:12.5px;color:var(--text-muted);">${label}</div></div>
      </div>
    </a>`;
  };

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
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

// The gallery editor: each photo carries a hidden `fotoUrutan` input, so the
// order the tiles are in when the form is submitted *is* the saved order —
// no separate "position" field to keep in sync. The first tile is the main
// photo and is labelled as such, which is why moving one left matters.
function photoReorder(photos) {
  const tiles = photos
    .map(
      (url) => `
      <div class="foto-tile" draggable="true" data-url="${escapeAttr(url)}" tabindex="0"
           role="listitem" aria-label="Foto produk — seret untuk mengurutkan, atau tekan panah kiri/kanan">
        <input type="hidden" name="fotoUrutan" value="${escapeAttr(url)}">
        <div class="foto-frame">
          <img src="${escapeAttr(url)}" alt="Foto produk" draggable="false">
          <span class="foto-utama">UTAMA</span>
          <span class="foto-grip" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
          </span>
        </div>
        <label class="foto-hapus" title="Centang untuk menghapus foto ini saat disimpan">
          <input type="checkbox" name="hapusFoto" value="${escapeAttr(url)}"> Hapus
        </label>
      </div>`
    )
    .join('');

  return `
    <style>
      .foto-grid{display:grid;grid-template-columns:repeat(3, minmax(0,1fr));gap:10px;margin-bottom:10px;}
      .foto-tile{display:flex;flex-direction:column;gap:5px;cursor:grab;border-radius:12px;
        transition:opacity 0.16s ease, transform 0.16s ease;}
      .foto-tile:active{cursor:grabbing;}
      .foto-tile:focus-visible{outline:2.5px solid var(--orange);outline-offset:3px;}
      .foto-frame{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--surface-2);}
      .foto-frame img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;}
      .foto-utama{display:none;position:absolute;top:4px;left:4px;background:var(--green);color:#fff;font-size:8.5px;
        font-weight:800;letter-spacing:0.3px;padding:3px 7px;border-radius:99px;}
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
      Seret foto untuk mengurutkan — di HP, tahan ikon titik-titik di pojok foto lalu geser.
      Bisa juga pilih foto lalu tekan tombol panah &larr; &rarr; di keyboard. Foto pertama jadi foto utama.
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
            <h3 style="font-size:15px;font-weight:800;margin-bottom:6px;">Foto Produk</h3>
            <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">Foto pertama jadi <strong>foto utama</strong>. Kalau lebih dari satu, pembeli bisa geser-geser fotonya di halaman produk.</p>
            ${isEdit && existingPhotos.length ? photoReorder(existingPhotos) : ''}
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
              { label: 'Total', html: `<span class="tnum" style="font-size:13px;font-weight:700;">${formatRupiah(o.total)}</span>` },
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
  ${adminSidebar('pesanan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main" id="konten">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Pesanan</div>
        <h1 style="font-size:24px;font-weight:800;">Pesanan Masuk</h1>
        ${
          admin.role === 'superadmin'
            ? `<a href="/admin/pesanan/tambah" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--green-dark);margin-top:8px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                Catat pesanan manual (WhatsApp / datang langsung)
              </a>`
            : ''
        }
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
  <main class="admin-main" id="konten" style="max-width:900px;">
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
                    ? `<form method="post" action="/admin/pesanan/${order.id}/tukar-stempel" onsubmit="return confirm('Tukarkan 1 cup gratis untuk pelanggan ini? Stempel akan kembali ke nol.');" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
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
          orderDiscounts.length || deliveryFee > 0
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

        <form method="post" action="/admin/pesanan/${order.id}/status" style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
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
</div>`;

  return page({ title: `${order.order_number} — Admin Pecup`, bodyHtml: body, noindex: true });
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
        { label: 'Dibuat', html: `<span style="font-size:12.5px;color:var(--text-muted);">${formatDateID(a.created_at)}</span>` },
        {
          label: 'Password',
          html: `<form method="post" action="/admin/akun/${a.id}/password" style="display:flex;align-items:center;gap:7px;"
              onsubmit="return confirm('Ganti password ${escapeAttr(a.username)}? Mereka harus pakai password baru ini untuk masuk.');">
          <input type="password" name="password" required minlength="6" placeholder="Password baru (min. 6)"
                 autocomplete="new-password" style="padding:8px 11px;font-size:12.5px;border-radius:8px;">
          <button class="btn-outline" type="submit" style="padding:8px 13px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;">Ganti</button>
        </form>`,
        },
        {
          label: '',
          html: isSelf
            ? ''
            : `<form method="post" action="/admin/akun/${a.id}/hapus" onsubmit="return confirm('Hapus admin ${escapeAttr(a.username)}?');" style="display:flex;justify-content:flex-end;">
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
  ${adminSidebar('akun', { isSuperadmin: true, username: admin.username })}
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
            <option value="superadmin">Superadmin</option>
          </select>
        </div>
        <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;white-space:nowrap;">Tambah Admin</button>
      </form>
    </div>

    ${admTable({
      cols: '1.4fr 0.9fr 1fr 1.9fr 0.5fr',
      minWidth: 760,
      head: ['USERNAME', 'PERAN', 'DIBUAT', 'GANTI PASSWORD', ''],
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
  const style = c.tierStyle;
  return `<span style="display:inline-block;font-size:11.5px;font-weight:800;letter-spacing:0.4px;padding:4px 12px;border-radius:99px;color:${style.color};background:${style.bg};white-space:nowrap;">${escapeHtml(
    c.tier.name.toUpperCase()
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
  ${adminSidebar('pelanggan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main" id="konten">
    ${backButton('/admin/produk', 'Kembali ke Produk')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Cari Pelanggan</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:6px;">
      <h1 style="font-size:24px;font-weight:800;">Cari Pelanggan</h1>
      ${
        admin.role === 'superadmin'
          ? `<a class="btn-primary" href="/admin/pelanggan/tambah" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Tambah Pelanggan
            </a>`
          : ''
      }
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
        admin.role === 'superadmin'
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
      cols: '2fr 1.2fr 1.4fr 1fr 0.8fr',
      minWidth: 780,
      head: ['PELANGGAN', 'TIER', 'KARTU STEMPEL', 'KEDALUWARSA', ''],
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
// `canEdit` is the superadmin flag — everyone else sees the same page in
// read-only form.
function renderPelangganDetail({
  customer,
  loyalty,
  orders,
  stamps,
  admin,
  canEdit,
  tiersEnabled,
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
  ${adminSidebar('pelanggan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
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
    </div>

    <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:20px;">
        <div class="card" style="padding:22px;">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Ringkasan</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:10px;">
            ${miniStat('Stempel aktif', `${loyalty.stamps}<span style="font-size:13px;color:var(--text-muted);font-weight:600;"> / ${loyalty.perReward}</span>`, loyalty.expiresLabel ? `Hangus ${escapeHtml(loyalty.expiresLabel)}` : '')}
            ${miniStat('Klaim cup gratis', loyalty.claims)}
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
                  onsubmit="return confirm('Ganti password ${escapeAttr(customer.name)}?');">
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
                  onsubmit="return confirm('Hapus akun ${escapeAttr(customer.name)} beserta stempelnya? Tindakan ini tidak bisa dibatalkan.');">
              <button type="submit" class="btn-outline" style="padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;color:#a13f3f;border-color:#e0a0a0;">Hapus Akun Pelanggan</button>
            </form>
          </div>
        </div>`
            : ''
        }

        <div class="card" style="padding:22px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
            <h3 style="font-size:15px;font-weight:800;">Kartu Stempel</h3>
            ${
              canEdit
                ? ''
                : `<span style="font-size:11px;font-weight:700;color:var(--text-muted);background:var(--surface-2);padding:4px 10px;border-radius:99px;">Hanya superadmin yang bisa mengubah</span>`
            }
          </div>
          ${
            canEdit
              ? `<form method="post" action="/admin/pelanggan/${customer.id}/stempel" style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-top:12px;">
                  <div style="margin:0;flex:0 1 150px;">
                    <label style="margin-bottom:5px;">Jumlah stempel</label>
                    <input type="number" name="stamps" value="${loyalty.stamps}" min="0" max="999" style="padding:10px 12px;text-align:center;font-weight:700;">
                  </div>
                  <button class="btn-outline" type="submit" style="padding:12px 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Simpan Stempel</button>
                </form>
                ${
                  loyalty.cardComplete
                    ? `<form method="post" action="/admin/pelanggan/${customer.id}/klaim" onsubmit="return confirm('Tukarkan 1 cup gratis? Stempel akan kembali ke nol.');" style="margin-top:12px;">
                        <button class="btn-primary" type="submit" style="padding:12px 20px;border-radius:11px;font-size:13.5px;font-weight:700;">Tukar 1 Cup Gratis</button>
                      </form>`
                    : ''
                }
                <p style="font-size:12px;color:var(--text-muted);line-height:1.7;margin:14px 0 0;">Stempel bertambah otomatis tiap pesanan berstatus <strong>Selesai</strong>. Perubahan manual di sini tercatat di log aktivitas.</p>`
              : ''
          }
          <h4 style="font-size:13px;font-weight:800;color:var(--text-muted);letter-spacing:0.3px;margin:20px 0 6px;">RIWAYAT STEMPEL</h4>
          ${stampRows}
        </div>
      </div>

      <div style="flex:1 1 400px;min-width:0;">
        <div>
          <div style="padding:0 2px 14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
              <h3 style="font-size:15px;font-weight:800;">Riwayat Pesanan</h3>
              <span style="font-size:12px;color:var(--text-muted);">${
                pagination ? `${pagination.total} pesanan` : `${orders.length} pesanan`
              }</span>
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
            <span class="tier-hint">0 berarti tanpa diskon.</span>
          </div>
          <div class="tier-field">
            <label>Benefit tambahan</label>
            <div class="tier-perks">
              <label class="tier-check">
                <input type="checkbox" name="tierWeekly" value="${i}" ${t.weeklyFreeCup ? 'checked' : ''}>
                Diskon mingguan
              </label>
              <label class="tier-check">
                <input type="checkbox" name="tierBirthday" value="${i}" ${t.birthdayFreeCup ? 'checked' : ''}>
                Gratis ulang tahun
              </label>
            </div>
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
            t.weeklyFreeCup ? 'diskon mingguan' : '',
            t.birthdayFreeCup ? 'gratis ulang tahun' : '',
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
  ${adminSidebar('loyalitas', { isSuperadmin: true, username: admin.username })}
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
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;">Satu stempel diberikan tiap pesanan berstatus <strong>Selesai</strong>.</p>
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
function renderLaporan({ admin, report, view, activePreset, todayKey }) {
  const bigStat = (label, value, sub, accent) => `
    <div class="card" style="padding:20px 22px;border-left:4px solid ${accent};">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:0.4px;text-transform:uppercase;">${label}</div>
      <div class="tnum" style="font-size:25px;font-weight:800;margin-top:8px;letter-spacing:-0.5px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${sub}</div>` : ''}
    </div>`;

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
  ${adminSidebar('laporan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
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

    ${
      report.discount > 0 || report.delivery > 0
        ? `<div class="card" style="padding:18px 20px;margin-bottom:22px;background:var(--orange-soft);border-color:var(--orange-mid);">
      <div style="font-size:13px;color:#7a4a1f;line-height:1.8;">
        <strong>Cara angka ini menutup:</strong> nilai kotor ${formatRupiah(report.gross)}
        &minus; potongan ${formatRupiah(report.discount)}
        + ongkos antar ${formatRupiah(report.delivery)}
        = uang masuk <strong>${formatRupiah(report.net)}</strong>.
      </div>
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
        cols: '1.1fr 0.6fr 1fr 1fr 0.9fr 1.4fr',
        minWidth: 780,
        head: [view.kelompok === 'bulan' ? 'BULAN' : 'TANGGAL', 'PESANAN', 'KOTOR', 'POTONGAN', 'ONGKOS', 'UANG MASUK'],
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
  ${adminSidebar('dashboard', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
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
      ${tile('Pesanan Hari Ini', today.total, `${today.pending} menunggu verifikasi`, 'var(--orange)', '/admin/pesanan?tampilan=hari-ini')}
      ${tile('Uang Masuk Hari Ini', formatRupiah(today.revenue), 'dari pesanan selesai', 'var(--green)', '/admin/laporan?rentang=hari-ini')}
      ${tile('Uang Masuk Bulan Ini', formatRupiah(revenue.month), `${revenue.monthOrders} pesanan selesai`, 'oklch(60% 0.12 245)', '/admin/laporan?rentang=bulan-ini')}
      ${tile('Perlu Restock', lowStock.length, 'produk menipis atau habis', lowStock.length ? '#c94f4f' : 'var(--text-muted)', '/admin/produk?status=menipis')}
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      <div style="flex:1 1 380px;min-width:0;">
        <div class="adm-table">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;">
            <h2 style="font-size:15px;font-weight:800;">Perlu Ditangani</h2>
            <a href="/admin/pesanan" style="font-size:12.5px;font-weight:700;">Semua pesanan →</a>
          </div>
          ${orderList}
        </div>
      </div>

      <div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:20px;">
        <div class="adm-table">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;">
            <h2 style="font-size:15px;font-weight:800;">Stok Menipis</h2>
            <a href="/admin/produk" style="font-size:12.5px;font-weight:700;">Kelola →</a>
          </div>
          ${stockList}
        </div>

        <div class="adm-table">
          <div style="padding:16px 18px;">
            <h2 style="font-size:15px;font-weight:800;">Pengantaran Mendatang</h2>
            <p style="font-size:12px;color:var(--text-muted);margin-top:3px;">Yang harus disiapkan.</p>
          </div>
          ${upcomingList}
        </div>
      </div>
    </div>
  </main>
</div>`;
  return page({ title: 'Ringkasan — Admin Pecup', bodyHtml: body, noindex: true });
}

// Shop-wide operating settings: open/closed, notice, minimum order, delivery
// fee and the same-day cut-off.
function renderPengaturan({ admin, shop, flash = '', error = '' , retention = { proofDays: 90, logMonths: 12, lastRun: '' } }) {
  const body = `
<div class="admin-shell">
  ${adminSidebar('pengaturan', { isSuperadmin: true, username: admin.username })}
  <main class="admin-main" id="konten" style="max-width:760px;">
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
                <form method="post" action="/admin/voucher/${v.id}/hapus" onsubmit="return confirm('Hapus voucher ${escapeAttr(v.code)}?');">
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
  ${adminSidebar('voucher', { isSuperadmin: true, username: admin.username })}
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
            { label: 'Admin', html: `<span style="font-size:13.5px;font-weight:700;">${escapeHtml(l.admin_username)}</span>` },
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
  ${adminSidebar('log', { isSuperadmin: true, username: admin.username })}
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
                    <form method="post" action="/admin/reset-sandi/${r.id}/tolak" onsubmit="return confirm('Tolak permintaan reset ini?');">
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
  ${adminSidebar('reset', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
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
  const today = new Date().toISOString().slice(0, 10);
  const waText = created
    ? encodeURIComponent(
        `Halo ${created.name}, akun Pecup kamu sudah dibuat. Masuk pakai nomor ini dengan password sementara: ${created.password}. Ganti passwordnya setelah masuk ya.`
      )
    : '';
  const body = `
<div class="admin-shell">
  ${adminSidebar('pelanggan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
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
        <input type="text" name="name" required value="${escapeAttr(values.name || '')}" placeholder="Contoh: Alexander Dwiono">
      </div>
      <div class="field">
        <label>Nomor WhatsApp <span class="req">*</span></label>
        <input type="tel" name="whatsapp" required inputmode="numeric" value="${escapeAttr(values.whatsapp || '')}" placeholder="Contoh: 081234567890">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Ini sekaligus username-nya saat masuk.</div>
      </div>
      <div class="field">
        <label>Lokasi Pengantaran</label>
        <input type="text" name="address" maxlength="200" value="${escapeAttr(values.address || '')}" placeholder="Contoh: Kantor BCA Sudirman lt. 5">
      </div>
      <div class="field">
        <label>Tanggal Lahir <span style="font-weight:500;color:var(--text-muted);">(opsional)</span></label>
        <input type="date" name="birthday" max="${today}" value="${escapeAttr(values.birthday || '')}">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Perlu diisi kalau pelanggan ini mau dapat cup gratis ulang tahun.</div>
      </div>
      <div class="field" style="margin-bottom:8px;">
        <label>Stempel Awal</label>
        <input type="number" name="stamps" min="0" max="100" value="${escapeAttr(values.stamps || '0')}">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Kalau dia sudah belanja sebelum ada website, isi stempel yang sudah terkumpul.</div>
      </div>
      <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;margin-top:14px;">Buat Akun Pelanggan</button>
    </form>
  </main>
</div>`;
  return page({ title: 'Tambah Pelanggan — Admin Pecup', bodyHtml: body, noindex: true });
}

// Manual order entry: a sale that happened over WhatsApp or at the door, typed
// in afterwards. It runs through the same create_order path as a web checkout,
// so stock, stamps, tier perks and the books all move together.
function renderPesananTambah({ admin, products, customers, errors = [], values = {} }) {
  const today = new Date().toISOString().slice(0, 10);
  const qty = values.qty || {};
  const rows = products
    .map(
      (p) => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--border);flex-wrap:wrap;">
        <div style="flex:1 1 190px;min-width:0;">
          <div style="font-size:14px;font-weight:700;">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${formatRupiah(p.price)} · stok ${p.stock}</div>
        </div>
        <div style="display:flex;align-items:center;gap:9px;">
          <label style="margin:0;font-size:12px;color:var(--text-muted);">Jumlah</label>
          <input type="number" name="qty_${p.id}" min="0" max="${p.stock}" value="${escapeAttr(qty[p.id] || '')}"
                 placeholder="0" style="width:90px;text-align:center;">
        </div>
      </div>`
    )
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('pesanan', { isSuperadmin: admin.role === 'superadmin', username: admin.username })}
  <main class="admin-main" id="konten">
    ${backButton('/admin/pesanan', 'Kembali ke Pesanan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Pesanan / Catat Manual</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:8px;">Catat Pesanan Manual</h1>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;max-width:640px;margin-bottom:24px;">
      Untuk pesanan yang masuk lewat WhatsApp atau langsung di tempat. Stok otomatis terpotong, dan kalau
      dipilihkan akun pelanggan, pesanan ini ikut menghitung stempel dan benefit tier persis seperti pesanan dari website.
    </p>

    ${errors.length ? `<div class="flash flash-error">${errors.map((e) => escapeHtml(e)).join('<br>')}</div>` : ''}

    <form method="post" action="/admin/pesanan/tambah" data-warn-unsaved>
      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:16px;">Pemesan</h2>
        <div class="field">
          <label>Akun Pelanggan</label>
          <select name="customerId">
            <option value="">Tanpa akun (tamu)</option>
            ${customers
              .map(
                (c) =>
                  `<option value="${c.id}" ${String(values.customerId || '') === String(c.id) ? 'selected' : ''}>${escapeHtml(
                    c.name
                  )} — ${escapeHtml(formatWhatsapp(c.whatsapp))}</option>`
              )
              .join('')}
          </select>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">
            Pilih akun supaya pesanan ini menambah stempel. Belum punya akun?
            <a href="/admin/pelanggan/tambah">Buat dulu di sini</a>.
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
            <input type="date" name="deliveryDate" required value="${escapeAttr(values.deliveryDate || today)}">
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
        </div>
        ${rows}
      </div>

      <div class="card" style="margin-bottom:20px;">
        <h2 style="font-size:16px;font-weight:800;margin-bottom:16px;">Pembayaran &amp; Status</h2>
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
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
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">Pilih <strong>Selesai</strong> kalau sudah dibayar dan diantar — stempelnya langsung masuk.</div>
          </div>
        </div>
        <label style="display:flex;align-items:flex-start;gap:10px;margin:4px 0 0;font-size:13.5px;font-weight:600;cursor:pointer;">
          <input type="checkbox" name="useReward" value="1" ${values.useReward ? 'checked' : ''} style="width:18px;height:18px;margin-top:2px;flex-shrink:0;">
          <span>Pakai 1 cup gratis dari kartu stempel pelanggan (kalau kartunya memang penuh)</span>
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
</div>`;
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
  renderAdminLog,
};
