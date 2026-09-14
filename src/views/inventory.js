// The cost side of the shop: the stockroom, and what gets paid out.
//
// Kept in its own file rather than bolted onto views/admin.js — that file is
// already the longest thing here, and none of this is ever rendered to a
// shopper, so there is nothing to share with the storefront views.
const { page, adminSidebar, backButton } = require('./layout');
const { formatRupiah, escapeHtml, escapeAttr, formatDateID, formatDateTimeID, toDateKey } = require('../utils');
const permissions = require('../permissions');

function sidebarProps(admin) {
  return {
    isSuperadmin: Boolean(admin && admin.role === 'superadmin'),
    username: (admin && admin.username) || 'Admin',
    can: new Set(permissions.permissionsFor(admin)),
  };
}

function statCard(label, value, hint, color) {
  return `
    <div class="card" style="padding:18px 20px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">${escapeHtml(
        label
      )}</div>
      <div class="tnum" style="font-size:22px;font-weight:800;color:${color || 'var(--text)'};">${value}</div>
      ${hint ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.5;">${hint}</div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------
// stockroom
// ---------------------------------------------------------------------

function renderInventaris({ admin, items, units, totalValue, flash = '', error = '', editing = null, history = [] }) {
  const rows = items.length
    ? items
        .map((it) => {
          const state = it.isNegative
            ? { color: '#a13f3f', bg: '#f6dcdc', label: 'MINUS' }
            : it.isLow
            ? { color: '#a15a1f', bg: 'var(--orange-soft)', label: 'MENIPIS' }
            : null;
          return `
      <tr style="border-top:1px solid var(--border);${it.active ? '' : 'opacity:0.55;'}">
        <td style="padding:12px 10px;">
          <div style="font-size:13.5px;font-weight:700;">${escapeHtml(it.name)}</div>
          ${it.note ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">${escapeHtml(it.note)}</div>` : ''}
          ${it.active ? '' : '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">tidak dipakai lagi</div>'}
        </td>
        <td style="padding:12px 10px;text-align:right;white-space:nowrap;">
          <span class="tnum" style="font-size:14px;font-weight:800;color:${state ? state.color : 'var(--text)'};">${it.stock}</span>
          <span style="font-size:11.5px;color:var(--text-muted);"> ${escapeHtml(it.unit)}</span>
          ${
            state
              ? `<div style="font-size:10px;font-weight:800;color:${state.color};background:${state.bg};padding:2px 8px;border-radius:99px;display:inline-block;margin-top:4px;">${state.label}</div>`
              : ''
          }
        </td>
        <td class="tnum" style="padding:12px 10px;text-align:right;white-space:nowrap;font-size:13px;">${formatRupiah(
          it.unitCost
        )}</td>
        <td class="tnum" style="padding:12px 10px;text-align:right;white-space:nowrap;font-size:13px;font-weight:700;">${formatRupiah(
          it.value
        )}</td>
        <td style="padding:12px 10px;">
          <form method="post" action="/admin/inventaris/${it.id}/stok" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
            <input type="number" name="jumlah" required placeholder="0" style="width:82px;padding:7px 9px;font-size:12.5px;border-radius:8px;text-align:center;">
            <input type="number" name="totalHarga" placeholder="Total Rp" title="Total yang dibayar untuk jumlah ini (opsional)" style="width:104px;padding:7px 9px;font-size:12.5px;border-radius:8px;">
            <button class="btn-outline" type="submit" style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;">Tambah</button>
          </form>
        </td>
        <td style="padding:12px 10px;text-align:right;white-space:nowrap;">
          <a href="/admin/inventaris?ubah=${it.id}" style="font-size:12px;font-weight:700;color:var(--green-dark);">Ubah</a>
          <form method="post" action="/admin/inventaris/${it.id}/hapus" style="display:inline;"
                data-confirm="Hapus ${escapeAttr(it.name)} dari daftar bahan? Riwayat pengeluarannya tetap tersimpan.">
            <button type="submit" style="background:none;border:none;color:#c94f4f;font-size:12px;font-weight:700;cursor:pointer;padding:0 0 0 10px;">Hapus</button>
          </form>
        </td>
      </tr>`;
        })
        .join('')
    : `<tr><td colspan="6" style="padding:26px 10px;text-align:center;color:var(--text-muted);font-size:13.5px;">Belum ada bahan. Tambahkan cup, tutup, sendok, atau apa pun yang kamu beli untuk jualan.</td></tr>`;

  const unitOptions = (selected) =>
    units.map((u) => `<option value="${escapeAttr(u)}" ${u === selected ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');

  const form = editing
    ? `
    <div class="card" style="margin-bottom:22px;border-color:var(--green);">
      <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">Ubah ${escapeHtml(editing.name)}</h3>
      <form method="post" action="/admin/inventaris/${editing.id}/ubah" data-warn-unsaved style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="flex:1 1 190px;margin:0;"><label>Nama barang <span class="req">*</span></label>
          <input type="text" name="nama" required value="${escapeAttr(editing.name)}"></div>
        <div class="field" style="flex:0 1 120px;margin:0;"><label>Satuan</label>
          <select name="satuan">${unitOptions(editing.unit)}</select></div>
        <div class="field" style="flex:0 1 150px;margin:0;"><label>Harga per satuan</label>
          <input type="number" name="harga" min="0" value="${escapeAttr(editing.unitCost)}"></div>
        <div class="field" style="flex:0 1 150px;margin:0;"><label>Peringatan di bawah</label>
          <input type="number" name="batas" min="0" value="${escapeAttr(editing.lowThreshold)}"></div>
        <div class="field" style="flex:1 1 200px;margin:0;"><label>Catatan</label>
          <input type="text" name="catatan" value="${escapeAttr(editing.note || '')}" placeholder="Misal: beli di toko plastik Pasar Baru"></div>
        <label style="display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;font-weight:600;white-space:nowrap;">
          <input type="checkbox" name="aktif" value="1" ${editing.active ? 'checked' : ''} style="width:17px;height:17px;"> Masih dipakai
        </label>
        <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:13.5px;font-weight:700;">Simpan</button>
        <a class="btn-outline" href="/admin/inventaris" style="padding:12px 18px;border-radius:11px;font-size:13.5px;font-weight:700;">Batal</a>
      </form>
      ${
        history.length
          ? `<h4 style="font-size:13px;font-weight:800;margin:22px 0 8px;">Riwayat terakhir</h4>
             <div style="display:flex;flex-direction:column;gap:6px;">
             ${history
               .map(
                 (h) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:12.5px;padding:7px 0;border-top:1px solid var(--border);">
                   <span style="color:var(--text-muted);">${escapeHtml(formatDateTimeID(h.created_at))} · ${escapeHtml(h.reason)}${
                   h.order_number ? ` · ${escapeHtml(h.order_number)}` : ''
                 }${h.note ? ` · ${escapeHtml(h.note)}` : ''}</span>
                   <strong class="tnum" style="color:${Number(h.delta) < 0 ? '#a13f3f' : '#3f7a42'};white-space:nowrap;">${
                   Number(h.delta) > 0 ? '+' : ''
                 }${h.delta}</strong>
                 </div>`
               )
               .join('')}
             </div>`
          : ''
      }
    </div>`
    : `
    <div class="card" style="margin-bottom:22px;">
      <h3 style="font-size:15px;font-weight:800;margin-bottom:4px;">Tambah Bahan / Kemasan</h3>
      <p style="font-size:12.5px;color:var(--text-muted);line-height:1.7;margin-bottom:16px;">
        Semua yang kamu beli untuk jualan: cup, tutup, sendok, stiker, kantong plastik, sampai buahnya sendiri.
      </p>
      <form method="post" action="/admin/inventaris/tambah" data-warn-unsaved style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="flex:1 1 190px;margin:0;"><label>Nama barang <span class="req">*</span></label>
          <input type="text" name="nama" required placeholder="Contoh: Cup 250ml"></div>
        <div class="field" style="flex:0 1 120px;margin:0;"><label>Satuan</label>
          <select name="satuan">${unitOptions('pcs')}</select></div>
        <div class="field" style="flex:0 1 140px;margin:0;"><label>Stok awal</label>
          <input type="number" name="stok" min="0" value="0"></div>
        <div class="field" style="flex:0 1 150px;margin:0;"><label>Harga per satuan</label>
          <input type="number" name="harga" min="0" value="0" placeholder="Contoh: 500"></div>
        <div class="field" style="flex:0 1 150px;margin:0;"><label>Peringatan di bawah</label>
          <input type="number" name="batas" min="0" value="0"></div>
        <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:13.5px;font-weight:700;">Tambah</button>
      </form>
    </div>`;

  const body = `
<div class="admin-shell">
  ${adminSidebar('inventaris', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin', 'Kembali ke Ringkasan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Stok Bahan</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Stok Bahan &amp; Kemasan</h1>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;max-width:640px;margin-bottom:20px;">
      Jumlahnya berkurang sendiri setiap ada pesanan, sesuai bahan yang dipakai tiap produk
      (diatur di halaman produk). Kalau pesanan dibatalkan, bahannya kembali lagi.
    </p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <div class="grid-4" style="margin-bottom:20px;gap:16px;">
      ${statCard('Nilai Stok', formatRupiah(totalValue), 'Uang yang sedang "parkir" di gudang', 'var(--green-dark)')}
      ${statCard('Jenis Barang', String(items.filter((i) => i.active).length), 'Yang masih dipakai')}
      ${statCard('Perlu Dibeli', String(items.filter((i) => i.isLow || i.isNegative).length), 'Sudah di bawah batas peringatan', '#a15a1f')}
    </div>

    ${form}

    <div class="card" style="padding:0;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:760px;">
        <thead>
          <tr style="background:var(--surface-2);">
            <th style="text-align:left;padding:11px 10px;font-size:11.5px;letter-spacing:0.4px;color:var(--text-muted);">BARANG</th>
            <th style="text-align:right;padding:11px 10px;font-size:11.5px;letter-spacing:0.4px;color:var(--text-muted);">SISA</th>
            <th style="text-align:right;padding:11px 10px;font-size:11.5px;letter-spacing:0.4px;color:var(--text-muted);">HARGA/SATUAN</th>
            <th style="text-align:right;padding:11px 10px;font-size:11.5px;letter-spacing:0.4px;color:var(--text-muted);">NILAI</th>
            <th style="text-align:right;padding:11px 10px;font-size:11.5px;letter-spacing:0.4px;color:var(--text-muted);">TAMBAH STOK</th>
            <th style="text-align:right;padding:11px 10px;font-size:11.5px;letter-spacing:0.4px;color:var(--text-muted);"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:12px;color:var(--text-muted);line-height:1.7;margin-top:14px;max-width:640px;">
      Kolom <strong>Tambah Stok</strong>: isi jumlah yang baru dibeli, dan kalau kamu isi total harganya,
      pengeluaran itu otomatis ikut tercatat di halaman Pengeluaran — jadi laba bersihnya langsung benar.
    </p>
  </main>
</div>`;
  return page({ title: 'Stok Bahan — Admin Pecup', bodyHtml: body, noindex: true });
}

// ---------------------------------------------------------------------
// expenses
// ---------------------------------------------------------------------

function renderPengeluaran({ admin, expenses, categories, totals, view = {}, flash = '', error = '' }) {
  const today = toDateKey(new Date());
  const rows = expenses.length
    ? expenses
        .map(
          (e) => `
      <tr style="border-top:1px solid var(--border);">
        <td style="padding:11px 10px;white-space:nowrap;font-size:13px;color:var(--text-muted);">${escapeHtml(
          formatDateID(e.date_key)
        )}</td>
        <td style="padding:11px 10px;font-size:13px;"><span style="font-weight:700;">${escapeHtml(e.category)}</span>${
            e.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${escapeHtml(e.description)}</div>` : ''
          }</td>
        <td class="tnum" style="padding:11px 10px;text-align:right;white-space:nowrap;font-size:13.5px;font-weight:700;">${formatRupiah(
          e.amount
        )}</td>
        <td style="padding:11px 10px;font-size:12px;color:var(--text-muted);white-space:nowrap;">${escapeHtml(
          e.admin_username || ''
        )}</td>
        <td style="padding:11px 10px;text-align:right;">
          <form method="post" action="/admin/pengeluaran/${e.id}/hapus" data-confirm="Hapus pengeluaran ${escapeAttr(
            formatRupiah(e.amount)
          )}?">
            <button type="submit" style="background:none;border:none;color:#c94f4f;font-size:12px;font-weight:700;cursor:pointer;">Hapus</button>
          </form>
        </td>
      </tr>`
        )
        .join('')
    : `<tr><td colspan="5" style="padding:26px 10px;text-align:center;color:var(--text-muted);font-size:13.5px;">Belum ada pengeluaran pada rentang ini.</td></tr>`;

  const catRows = totals.byCategory
    .map(
      (c) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:9px 0;border-top:1px solid var(--border);">
        <span>${escapeHtml(c.category)} <span style="color:var(--text-muted);">· ${c.count}×</span></span>
        <strong class="tnum">${formatRupiah(c.total)}</strong>
      </div>`
    )
    .join('');

  const body = `
<div class="admin-shell">
  ${adminSidebar('pengeluaran', sidebarProps(admin))}
  <main class="admin-main" id="konten">
    ${backButton('/admin', 'Kembali ke Ringkasan')}
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;margin-top:20px;">Admin / Pengeluaran</div>
    <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Pengeluaran</h1>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.75;max-width:640px;margin-bottom:20px;">
      Semua uang keluar. Angka di sini yang dipakai untuk menghitung <strong>laba bersih</strong> di Laporan Penjualan.
    </p>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escapeHtml(error)}</div>` : ''}

    <div class="card" style="margin-bottom:22px;">
      <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">Catat Pengeluaran</h3>
      <form method="post" action="/admin/pengeluaran/tambah" data-warn-unsaved style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="flex:0 1 165px;margin:0;"><label>Tanggal <span class="req">*</span></label>
          <input type="date" name="tanggal" required value="${escapeAttr(today)}" max="${today}"></div>
        <div class="field" style="flex:0 1 180px;margin:0;"><label>Kategori</label>
          <select name="kategori">${categories
            .map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`)
            .join('')}</select></div>
        <div class="field" style="flex:1 1 240px;margin:0;"><label>Keterangan</label>
          <input type="text" name="keterangan" maxlength="200" placeholder="Contoh: beli 1000 cup + tutup"></div>
        <div class="field" style="flex:0 1 170px;margin:0;"><label>Nominal (Rp) <span class="req">*</span></label>
          <input type="number" name="nominal" required min="1" placeholder="Contoh: 350000"></div>
        <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:13.5px;font-weight:700;">Simpan</button>
      </form>
    </div>

    <form method="get" action="/admin/pengeluaran" class="card" style="padding:16px 18px;margin-bottom:20px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;">
      <div style="margin:0;flex:0 1 155px;"><label style="margin-bottom:5px;">Dari tanggal</label>
        <input type="date" name="dari" value="${escapeAttr(view.dari || '')}" style="padding:10px 12px;"></div>
      <div style="margin:0;flex:0 1 155px;"><label style="margin-bottom:5px;">Sampai tanggal</label>
        <input type="date" name="sampai" value="${escapeAttr(view.sampai || '')}" style="padding:10px 12px;"></div>
      <div style="margin:0;flex:0 1 180px;"><label style="margin-bottom:5px;">Kategori</label>
        <select name="kategori" style="padding:10px 12px;">
          <option value="">Semua kategori</option>
          ${categories
            .map((c) => `<option value="${escapeAttr(c)}" ${view.kategori === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
            .join('')}
        </select></div>
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Terapkan</button>
    </form>

    <div style="display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex:1 1 420px;min-width:0;">
        <div class="card" style="padding:0;overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:620px;">
            <thead>
              <tr style="background:var(--surface-2);">
                <th style="text-align:left;padding:11px 10px;font-size:11.5px;color:var(--text-muted);">TANGGAL</th>
                <th style="text-align:left;padding:11px 10px;font-size:11.5px;color:var(--text-muted);">KATEGORI</th>
                <th style="text-align:right;padding:11px 10px;font-size:11.5px;color:var(--text-muted);">NOMINAL</th>
                <th style="text-align:left;padding:11px 10px;font-size:11.5px;color:var(--text-muted);">DICATAT</th>
                <th style="padding:11px 10px;"></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <div style="flex:0 1 300px;min-width:0;">
        <div class="card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:4px;">Total</h3>
          <div class="tnum" style="font-size:24px;font-weight:800;color:#a13f3f;margin-bottom:2px;">${formatRupiah(
            totals.total
          )}</div>
          <div style="font-size:12px;color:var(--text-muted);">${totals.count} catatan pada rentang ini</div>
          ${catRows ? `<div style="margin-top:14px;">${catRows}</div>` : ''}
        </div>
      </div>
    </div>
  </main>
</div>`;
  return page({ title: 'Pengeluaran — Admin Pecup', bodyHtml: body, noindex: true });
}

module.exports = { renderInventaris, renderPengeluaran };
