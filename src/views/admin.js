const { page, adminSidebar, logoMark } = require('./layout');
const { productThumb } = require('./productIcon');
const { formatRupiah, escapeHtml, escapeAttr, formatDateID, formatTimeID } = require('../utils');

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

function renderProdukList({ products, stats, flash }) {
  const rows = products.length
    ? products
        .map(
          (p) => `
      <div class="row-hover" style="display:grid;grid-template-columns:2.4fr 1.2fr 1fr 0.8fr 1fr 1.2fr;align-items:center;padding:14px 22px;border-top:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:44px;height:44px;flex-shrink:0;">${productThumb(p, { size: 24, radius: 10 })}</div>
          <span style="font-size:14px;font-weight:700;">${escapeHtml(p.name)}</span>
        </div>
        <span style="font-size:13.5px;color:var(--text-muted);">${escapeHtml(p.category)}</span>
        <span style="font-size:13.5px;font-weight:600;">${formatRupiah(p.price)}</span>
        <span style="font-size:13.5px;">${p.stock}</span>
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
    : `<div style="padding:32px 22px;color:var(--text-muted);font-size:14px;">Belum ada produk. Klik "Tambah Produk Baru" untuk mulai mengisi inventori.</div>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk')}
  <main class="admin-main">
    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:12px;">
      <div><div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Produk</div><h1 style="font-size:24px;font-weight:800;">Kelola Produk</h1></div>
      <a href="/admin/produk/tambah" class="btn-primary" style="padding:13px 22px;border-radius:11px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Tambah Produk Baru
      </a>
    </div>

    <div class="grid-3" style="margin:28px 0;">
      ${statCard('Total Produk', stats.total, 'var(--green-soft)', '<path d="M20 8l-8-5-8 5v8l8 5 8-5V8z"/>')}
      ${statCard('Produk Aktif', stats.active, 'var(--orange-soft)', '<path d="M20 6L9 17l-5-5"/>', '#a15a1f')}
      ${statCard('Stok Menipis (≤5)', stats.lowStock, '#f6dcdc', '<path d="M12 9v4m0 4h.01M10.3 3.9L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', '#a13f3f')}
    </div>

    <div class="table-scroll" style="background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:2.4fr 1.2fr 1fr 0.8fr 1fr 1.2fr;padding:14px 22px;background:var(--surface-2);font-size:12.5px;font-weight:700;color:var(--text-muted);letter-spacing:0.3px;min-width:640px;">
        <span>PRODUK</span><span>KATEGORI</span><span>HARGA</span><span>STOK</span><span>STATUS</span><span>AKSI</span>
      </div>
      <div style="min-width:640px;">${rows}</div>
    </div>
  </main>
</div>`;

  return page({ title: 'Kelola Produk — Admin Pecup', bodyHtml: body });
}

function renderProdukForm({ product, error }) {
  const isEdit = Boolean(product && product.id);
  const p = product || { name: '', description: '', category: 'Buah Tunggal', weight: '', price: '', stock: '', active: 1 };
  const categories = ['Buah Tunggal', 'Mix Buah', 'Salad Buah', 'Rujak', 'Paket Spesial'];

  const body = `
<div class="admin-shell">
  ${adminSidebar('produk')}
  <main class="admin-main">
    <form method="post" action="${isEdit ? `/admin/produk/${p.id}/edit` : '/admin/produk/tambah'}" enctype="multipart/form-data">
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
            <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Foto Produk</h3>
            ${
              isEdit && p.image
                ? `<div style="aspect-ratio:1;border-radius:14px;overflow:hidden;margin-bottom:12px;"><img src="${escapeAttr(p.image)}" style="width:100%;height:100%;object-fit:cover;"></div>`
                : ''
            }
            <div class="dropzone" style="padding:24px;text-align:center;">
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" style="border:none;padding:0;background:transparent;">
              <div style="font-size:12px;color:var(--text-muted);margin-top:8px;">JPG / PNG / WEBP, maks 2MB${isEdit ? ' (kosongkan jika tidak diganti)' : ''}</div>
            </div>
          </div>
        </div>

        <div class="card" style="flex:1 1 420px;">
          <div class="field"><label>Nama Produk <span class="req">*</span></label><input type="text" name="name" required value="${escapeAttr(p.name)}" placeholder="Contoh: Mangga Harum Manis"></div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div class="field" style="flex:1 1 180px;">
              <label>Kategori <span class="req">*</span></label>
              <select name="category">
                ${categories.map((c) => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="field" style="flex:1 1 180px;"><label>Berat / Ukuran Kemasan <span class="req">*</span></label><input type="text" name="weight" required value="${escapeAttr(p.weight)}" placeholder="Contoh: 250g"></div>
          </div>
          <div class="field"><label>Deskripsi Produk</label><textarea name="description" rows="4" placeholder="Ceritakan kesegaran &amp; keunggulan produk ini...">${escapeHtml(p.description)}</textarea></div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            <div class="field" style="flex:1 1 180px;"><label>Harga (Rp) <span class="req">*</span></label><input type="number" name="price" required min="0" value="${escapeAttr(p.price)}" placeholder="Contoh: 18000"></div>
            <div class="field" style="flex:1 1 180px;"><label>Stok Tersedia <span class="req">*</span></label><input type="number" name="stock" required min="0" value="${escapeAttr(p.stock)}" placeholder="Contoh: 24"></div>
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
        </div>
      </div>
    </form>
  </main>
</div>`;

  return page({ title: `${isEdit ? 'Edit' : 'Tambah'} Produk — Admin Pecup`, bodyHtml: body });
}

function renderPesananList({ dateKey, prevDate, nextDate, orders, stats, downloadUrl }) {
  const rows = orders.length
    ? orders
        .map((o) => {
          const badge = o.status === 'terkonfirmasi'
            ? `<span style="font-size:11.5px;font-weight:700;color:#3f7a42;background:var(--green-soft);padding:5px 11px;border-radius:99px;">Terkonfirmasi</span>`
            : `<span style="font-size:11.5px;font-weight:700;color:#a15a1f;background:var(--orange-soft);padding:5px 11px;border-radius:99px;">Menunggu</span>`;
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
  ${adminSidebar('pesanan')}
  <main class="admin-main">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:12px;">
      <div><div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">Admin / Pesanan</div><h1 style="font-size:24px;font-weight:800;">Pesanan Masuk</h1></div>
      <a href="${downloadUrl}" class="btn-primary" style="padding:13px 22px;border-radius:11px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Unduh Laporan Harian (CSV)
      </a>
    </div>

    <div style="display:flex;align-items:center;gap:14px;margin:20px 0 28px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;width:fit-content;">
      <a href="/admin/pesanan?tanggal=${prevDate}" style="display:flex;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></a>
      <div style="display:flex;align-items:center;gap:10px;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#58a05c" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
        <span style="font-size:14.5px;font-weight:700;">${formatDateID(dateKey)}</span>
      </div>
      <a href="/admin/pesanan?tanggal=${nextDate}" style="display:flex;"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></a>
    </div>

    <div class="grid-3" style="margin-bottom:28px;">
      ${statCard('Pesanan Hari Ini', stats.total, 'var(--green-soft)', '<path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/>')}
      ${statCard('Menunggu Verifikasi', stats.pending, 'var(--orange-soft)', '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>', '#a15a1f')}
      ${statCard('Terkonfirmasi', stats.confirmed, 'var(--green-soft)', '<path d="M20 6L9 17l-5-5"/>')}
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

function renderPesananDetail({ order, items, proofUrl }) {
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
  ${adminSidebar('pesanan')}
  <main class="admin-main" style="max-width:900px;">
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;"><a href="/admin/pesanan">Admin / Pesanan</a> / ${escapeHtml(order.order_number)}</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:24px;">Detail Pesanan ${escapeHtml(order.order_number)}</h1>

    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div class="card" style="flex:1 1 380px;">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:16px;">Data Pemesan</h3>
        <div style="font-size:14px;margin-bottom:8px;"><strong>${escapeHtml(order.customer_name)}</strong></div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">WhatsApp: ${escapeHtml(order.whatsapp)}</div>
        <div style="font-size:14px;color:var(--text-muted);margin-bottom:16px;">Catatan: ${order.notes ? escapeHtml(order.notes) : '(tidak ada)'}</div>
        <div style="font-size:12.5px;color:var(--text-muted);">Email notifikasi: ${emailStatus}</div>

        <h3 style="font-size:15px;font-weight:800;margin:24px 0 12px;">Item Dipesan</h3>
        ${itemRows}
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;padding-top:16px;"><span>Total</span><span style="color:var(--green-dark);">${formatRupiah(order.total)}</span></div>

        <form method="post" action="/admin/pesanan/${order.id}/status" style="margin-top:20px;display:flex;gap:10px;">
          <select name="status" style="flex:1;">
            <option value="menunggu" ${order.status === 'menunggu' ? 'selected' : ''}>Menunggu Verifikasi</option>
            <option value="terkonfirmasi" ${order.status === 'terkonfirmasi' ? 'selected' : ''}>Terkonfirmasi</option>
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

module.exports = { renderLogin, renderProdukList, renderProdukForm, renderPesananList, renderPesananDetail };
