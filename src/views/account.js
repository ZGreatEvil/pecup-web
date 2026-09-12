const { page, customerHeader, customerFooter, backButton, logoMark } = require('./layout');
const {
  formatRupiah,
  escapeHtml,
  escapeAttr,
  formatDateID,
  formatWhatsapp,
  formatShortDateID,
  orderStatus,
} = require('../utils');

const WA_INPUT_ATTRS =
  'type="tel" inputmode="numeric" autocomplete="tel" pattern="[0-9+][0-9 .()\\-]{8,19}" ' +
  'title="Masukkan nomor WhatsApp yang valid, contoh: 081234567890" placeholder="Contoh: 081234567890"';

function authShell({ title, heading, subheading, formHtml, footerHtml, cartCount }) {
  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount)}
  <section class="px-page" style="padding-top:48px;padding-bottom:100px;display:flex;justify-content:center;">
    <div style="width:100%;max-width:420px;">
      ${backButton('/', 'Kembali ke Beranda')}
      <div class="card" style="margin-top:20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          ${logoMark(34)}
          <span style="font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:19px;">${escapeHtml(heading)}</span>
        </div>
        <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin-bottom:22px;">${subheading}</p>
        ${formHtml}
      </div>
      <p style="text-align:center;font-size:13.5px;color:var(--text-muted);margin-top:20px;">${footerHtml}</p>
    </div>
  </section>
  ${customerFooter()}
</div></div>`;
  // Sign-in / sign-up aren't useful search results, and robots.txt already
  // disallows them — keep the two consistent.
  return page({ title, bodyHtml: body, noindex: true });
}

function errorBox(errors) {
  if (!errors || !errors.length) return '';
  return `<div class="flash flash-error">${errors.map((e) => escapeHtml(e)).join('<br>')}</div>`;
}

function renderMasuk({ cartCount = 0, errors = [], values = {}, next = '' } = {}) {
  return authShell({
    title: 'Masuk — Pecup',
    heading: 'Masuk ke Akunmu',
    subheading: 'Pakai nomor WhatsApp kamu sebagai username, supaya pesanan berikutnya tinggal beberapa klik.',
    cartCount,
    formHtml: `
      ${errorBox(errors)}
      <form method="post" action="/masuk">
        ${next ? `<input type="hidden" name="next" value="${escapeAttr(next)}">` : ''}
        <div class="field"><label>Nomor WhatsApp</label><input name="whatsapp" required ${WA_INPUT_ATTRS} value="${escapeAttr(values.whatsapp || '')}"></div>
        <div class="field" style="margin-bottom:8px;"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>
        <button class="btn-primary" type="submit" style="width:100%;padding:15px;border-radius:12px;font-size:15px;font-weight:700;margin-top:14px;">Masuk</button>
      </form>`,
    footerHtml: `Belum punya akun? <a href="/daftar">Daftar di sini</a>`,
  });
}

function renderDaftar({ cartCount = 0, errors = [], values = {} } = {}) {
  return authShell({
    title: 'Daftar — Pecup',
    heading: 'Buat Akun Pecup',
    subheading:
      'Simpan data pengantaranmu sekali, lalu pesan lebih cepat. Kamu juga langsung mulai mengumpulkan stempel — tiap 10 pesanan selesai dapat 1 cup gratis.',
    cartCount,
    formHtml: `
      ${errorBox(errors)}
      <form method="post" action="/daftar">
        <div class="field"><label>Nama Lengkap <span class="req">*</span></label><input type="text" name="name" required value="${escapeAttr(values.name || '')}" placeholder="Contoh: Alexander Dwiono"></div>
        <div class="field">
          <label>Nomor WhatsApp <span class="req">*</span></label>
          <input name="whatsapp" required ${WA_INPUT_ATTRS} value="${escapeAttr(values.whatsapp || '')}">
          <span style="font-size:12px;color:var(--text-muted);display:block;margin-top:6px;">Nomor ini sekaligus jadi username-mu saat masuk.</span>
        </div>
        <div class="field"><label>Lokasi Pengantaran Utama</label><input type="text" name="address" maxlength="200" value="${escapeAttr(values.address || '')}" placeholder="Contoh: Kantor BCA Sudirman lt. 5"></div>
        <div class="field" style="margin-bottom:8px;"><label>Password <span class="req">*</span></label><input type="password" name="password" required minlength="6" autocomplete="new-password" placeholder="Minimal 6 karakter"></div>
        <button class="btn-primary" type="submit" style="width:100%;padding:15px;border-radius:12px;font-size:15px;font-weight:700;margin-top:14px;">Daftar</button>
      </form>`,
    footerHtml: `Sudah punya akun? <a href="/masuk">Masuk di sini</a>`,
  });
}

// One slot per stamp in the current card. Earned slots carry the Pecup logo
// tilted 30°; the last slot is highlighted as the free-cup reward.
function stampCard(loyalty, stampHistory = []) {
  const slots = [];
  for (let i = 0; i < loyalty.perReward; i += 1) {
    const earned = i < loyalty.stamps;
    const isReward = i === loyalty.perReward - 1;
    if (earned) {
      slots.push(
        `<div class="stamp-slot ${isReward ? 'stamp-reward' : 'stamp-filled'}"><img src="/assets/pecup-logo.png" alt="Stempel ${i + 1}"></div>`
      );
    } else {
      slots.push(
        `<div class="stamp-slot stamp-empty" title="Stempel ke-${i + 1}">${isReward ? 'GRATIS' : i + 1}</div>`
      );
    }
  }

  const message = loyalty.cardComplete
    ? 'Kartu penuh! Centang "Pakai 1 cup gratis" saat checkout — stempelmu kembali ke nol setelah dipakai.'
    : `Kurang <strong>${loyalty.toNextReward}</strong> pesanan selesai lagi untuk 1 cup gratis.`;

  const recent = stampHistory
    .filter((row) => row.status === 'active')
    .slice(0, loyalty.perReward)
    .map(
      (row) =>
        `<li style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
          <span style="color:var(--text-muted);">${escapeHtml(formatShortDateID(row.earned_at))}</span>
          <span style="color:var(--text);font-weight:600;">${row.order_id ? 'Dari pesanan' : 'Ditambahkan admin'}</span>
        </li>`
    )
    .join('');

  return `
  <div class="card">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
      <h2 style="font-size:19px;font-weight:800;">Kartu Stempel</h2>
      <span style="font-size:13px;color:var(--text-muted);">${loyalty.stamps} / ${loyalty.perReward} stempel</span>
    </div>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin-bottom:22px;">${message}</p>
    <div class="stamp-grid">${slots.join('')}</div>

    ${
      loyalty.expiresLabel
        ? `<div style="margin-top:20px;display:flex;align-items:flex-start;gap:10px;background:var(--surface-2);border-radius:12px;padding:13px 15px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.9" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/></svg>
            <span style="font-size:12.5px;color:var(--text-muted);line-height:1.6;">Stempel di kartu ini berlaku sampai <strong style="color:var(--text);">${escapeHtml(loyalty.expiresLabel)}</strong> (${loyalty.expiryMonths} bulan sejak stempel pertama). Lewat tanggal itu kartu dimulai lagi dari nol.</span>
          </div>`
        : ''
    }

    <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
      <div style="flex:1 1 150px;background:var(--green-soft);border-radius:12px;padding:13px 15px;">
        <div style="font-size:21px;font-weight:800;color:var(--green-dark);">${loyalty.claims}</div>
        <div style="font-size:12px;color:var(--green-dark);">cup gratis sudah diklaim</div>
      </div>
      ${
        loyalty.expiredCount > 0
          ? `<div style="flex:1 1 150px;background:var(--surface-2);border-radius:12px;padding:13px 15px;">
              <div style="font-size:21px;font-weight:800;color:var(--text-muted);">${loyalty.expiredCount}</div>
              <div style="font-size:12px;color:var(--text-muted);">stempel kedaluwarsa</div>
            </div>`
          : ''
      }
    </div>

    ${
      recent
        ? `<details style="margin-top:18px;">
            <summary style="font-size:13px;font-weight:700;cursor:pointer;color:var(--text);">Tanggal stempel di kartu ini</summary>
            <ul style="list-style:none;padding:0;margin:10px 0 0;">${recent}</ul>
          </details>`
        : ''
    }
  </div>`;
}

// Shopee-style membership ladder, driven by how many free cups were claimed.
function tierCard(loyalty) {
  if (!loyalty.tiersEnabled) return '';
  const style = loyalty.tierStyle;
  const tier = loyalty.tier;
  const perks = [];
  if (tier.discountPercent > 0) perks.push(`Diskon <strong>${tier.discountPercent}%</strong> tiap pesanan`);
  if (tier.weeklyFreeCup) perks.push('Diskon mingguan untuk 1 cup');
  if (tier.birthdayFreeCup) perks.push('1 cup gratis saat ulang tahun');

  return `
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <h2 style="font-size:19px;font-weight:800;">Membership</h2>
      <span style="font-size:13px;font-weight:800;letter-spacing:0.5px;padding:6px 16px;border-radius:99px;color:${style.color};background:${style.bg};">${escapeHtml(tier.name.toUpperCase())}</span>
    </div>
    ${
      perks.length
        ? `<ul style="list-style:none;padding:0;margin:0 0 14px;display:flex;flex-direction:column;gap:9px;">
            ${perks
              .map(
                (p) => `<li style="display:flex;align-items:flex-start;gap:9px;font-size:13.5px;color:var(--text);line-height:1.6;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${style.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:3px;"><path d="M20 6L9 17l-5-5"/></svg>
                  <span>${p}</span>
                </li>`
              )
              .join('')}
          </ul>`
        : `<p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin:0 0 14px;">Belum ada benefit khusus di tingkat ini — klaim cup gratis untuk naik tingkat.</p>`
    }
    ${
      loyalty.nextTier
        ? `<div style="background:var(--surface-2);border-radius:12px;padding:13px 15px;font-size:12.5px;color:var(--text-muted);line-height:1.6;">
            Klaim <strong style="color:var(--text);">${Math.max(0, loyalty.nextTier.minClaims - loyalty.claims)}</strong> cup gratis lagi untuk naik ke <strong style="color:var(--text);">${escapeHtml(loyalty.nextTier.name)}</strong>.
          </div>`
        : `<div style="background:var(--surface-2);border-radius:12px;padding:13px 15px;font-size:12.5px;color:var(--text-muted);line-height:1.6;">Kamu sudah di tingkat tertinggi. Terima kasih ya!</div>`
    }
  </div>`;
}

function orderRow(o) {
  const status = orderStatus(o.status);
  const discount = Number(o.reward_discount) || 0;
  return `
      <a href="/pesanan-berhasil/${o.id}" style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;color:inherit;">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:700;">${escapeHtml(o.order_number)}</div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;">${escapeHtml(formatDateID(o.created_at))}</div>
          ${
            discount > 0
              ? `<div style="font-size:11.5px;font-weight:700;color:#a15a1f;margin-top:4px;">★ Pakai cup gratis${
                  o.reward_item ? ` — ${escapeHtml(o.reward_item)}` : ''
                }</div>`
              : ''
          }
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:99px;color:${status.color};background:${status.bg};white-space:nowrap;">${status.label}</span>
          <span class="tnum" style="font-size:14.5px;font-weight:800;color:var(--green-dark);white-space:nowrap;">${formatRupiah(o.total)}</span>
        </div>
      </a>`;
}

// The account page shows only the latest few; the rest live on their own
// paginated page so a long-standing customer's profile doesn't become a
// mile-long scroll.
function orderHistory(orders, { total = 0, previewCount = 0 } = {}) {
  if (!orders.length) {
    return `<p style="font-size:14px;color:var(--text-muted);padding:8px 0;">Belum ada pesanan. <a href="/">Mulai belanja →</a></p>`;
  }
  const rows = orders.map(orderRow).join('');
  const more = total > previewCount
    ? `<a class="btn-outline" href="/akun/pesanan" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:11px;font-size:13.5px;font-weight:700;margin-top:16px;">
        Lihat semua ${total} pesanan
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </a>`
    : '';
  return rows + more;
}

// Full, paginated order history — its own page, reachable from "Lihat semua".
function renderRiwayatPesanan({ customer, orders, pagination, cartCount = 0, view = {} }) {
  const buildUrl = (page) => {
    const params = new URLSearchParams();
    if (view.dari) params.set('dari', view.dari);
    if (view.sampai) params.set('sampai', view.sampai);
    if (page > 1) params.set('halaman', String(page));
    const qs = params.toString();
    return `/akun/pesanan${qs ? `?${qs}` : ''}`;
  };

  const pager = () => {
    if (pagination.totalPages <= 1) return '';
    const link = (target, label, disabled) =>
      disabled
        ? `<span style="padding:9px 14px;border-radius:9px;font-size:13px;font-weight:700;color:var(--text-muted);opacity:0.45;">${label}</span>`
        : `<a class="btn-outline" href="${buildUrl(target)}" style="padding:9px 14px;border-radius:9px;font-size:13px;font-weight:700;">${label}</a>`;

    const windowSize = 5;
    let start = Math.max(1, pagination.page - Math.floor(windowSize / 2));
    const end = Math.min(pagination.totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);

    const numbers = [];
    for (let p = start; p <= end; p += 1) {
      numbers.push(
        p === pagination.page
          ? `<span style="padding:9px 14px;border-radius:9px;font-size:13px;font-weight:800;background:var(--green);color:#fff;">${p}</span>`
          : `<a class="btn-outline" href="${buildUrl(p)}" style="padding:9px 14px;border-radius:9px;font-size:13px;font-weight:700;">${p}</a>`
      );
    }

    return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:24px;justify-content:center;">
      ${link(pagination.page - 1, '‹ Sebelumnya', pagination.page === 1)}
      ${numbers.join('')}
      ${link(pagination.page + 1, 'Berikutnya ›', pagination.page === pagination.totalPages)}
    </div>`;
  };

  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, null, customer)}
  <section class="px-page" style="padding-top:40px;padding-bottom:100px;max-width:760px;margin:0 auto;">
    ${backButton('/akun', 'Kembali ke Akun')}
    <h1 style="font-size:26px;font-weight:800;margin:20px 0 6px;">Riwayat Pesanan</h1>
    <p style="color:var(--text-muted);font-size:14px;margin-bottom:24px;">
      ${
        pagination.total > 0
          ? `Menampilkan ${(pagination.page - 1) * pagination.perPage + 1}–${Math.min(
              pagination.page * pagination.perPage,
              pagination.total
            )} dari ${pagination.total} pesanan`
          : 'Belum ada pesanan pada rentang ini.'
      }
    </p>

    <form method="get" action="/akun/pesanan" class="card" style="padding:16px 18px;margin-bottom:22px;display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
      <div style="margin:0;flex:1 1 150px;">
        <label style="margin-bottom:5px;">Dari tanggal</label>
        <input type="date" name="dari" value="${escapeAttr(view.dari || '')}" style="padding:10px 12px;">
      </div>
      <div style="margin:0;flex:1 1 150px;">
        <label style="margin-bottom:5px;">Sampai tanggal</label>
        <input type="date" name="sampai" value="${escapeAttr(view.sampai || '')}" style="padding:10px 12px;">
      </div>
      <button class="btn-primary" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Filter</button>
      ${
        view.dari || view.sampai
          ? `<a class="btn-outline" href="/akun/pesanan" style="padding:12px 20px;border-radius:11px;font-size:14px;font-weight:700;">Reset</a>`
          : ''
      }
    </form>

    <div class="card">
      ${
        orders.length
          ? orders.map(orderRow).join('')
          : `<p style="font-size:14px;color:var(--text-muted);padding:8px 0;margin:0;">Tidak ada pesanan pada rentang ini.</p>`
      }
    </div>
    ${pager()}
    <div style="margin-top:28px;">${backButton('/akun', 'Kembali ke Akun')}</div>
  </section>
  ${customerFooter()}
</div></div>`;

  return page({ title: 'Riwayat Pesanan — Pecup', bodyHtml: body, noindex: true });
}

function renderAkun({
  customer,
  loyalty,
  orders,
  stampHistory = [],
  cartCount = 0,
  flash = '',
  errors = [],
  totalOrders = 0,
}) {
  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, null, customer)}
  <section class="px-page" id="konten" style="padding-top:40px;padding-bottom:100px;">
    ${backButton('/', 'Kembali ke Beranda')}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:20px 0 30px;">
      <div>
        <h1 style="font-size:26px;font-weight:800;">Halo, ${escapeHtml(customer.name)}</h1>
        <p style="color:var(--text-muted);font-size:14px;margin-top:6px;">${escapeHtml(formatWhatsapp(customer.whatsapp))}</p>
      </div>
      <form method="post" action="/keluar">
        <button class="btn-outline" type="submit" style="padding:12px 22px;border-radius:11px;font-size:14px;font-weight:700;">Keluar</button>
      </form>
    </div>

    ${flash ? `<div class="flash flash-ok">${escapeHtml(flash)}</div>` : ''}
    ${errorBox(errors)}

    <div class="split-layout">
      <div class="split-main" style="gap:24px;">
        ${tierCard(loyalty)}

        ${stampCard(loyalty, stampHistory)}

        <div class="card">
          <h2 style="font-size:19px;font-weight:800;margin-bottom:6px;">Data Pesanan Tersimpan</h2>
          <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin-bottom:22px;">Dipakai otomatis mengisi form checkout — jadi kamu tidak perlu ketik ulang tiap pesan.</p>
          <form method="post" action="/akun">
            <div class="field"><label>Nama Lengkap <span class="req">*</span></label><input type="text" name="name" required value="${escapeAttr(customer.name)}"></div>
            <div class="field"><label>Nomor WhatsApp</label><input type="text" value="${escapeAttr(formatWhatsapp(customer.whatsapp))}" disabled style="background:var(--surface-2);color:var(--text-muted);"><span style="font-size:12px;color:var(--text-muted);display:block;margin-top:6px;">Nomor ini username-mu, jadi tidak bisa diubah sendiri. Hubungi kami kalau nomormu ganti.</span></div>
            <div class="field" style="margin-bottom:8px;"><label>Lokasi Pengantaran Utama</label><input type="text" name="address" maxlength="200" value="${escapeAttr(customer.address || '')}" placeholder="Contoh: Kantor BCA Sudirman lt. 5"></div>
            <button class="btn-primary" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;margin-top:14px;">Simpan Perubahan</button>
          </form>
        </div>

        <div class="card">
          <h2 style="font-size:19px;font-weight:800;margin-bottom:6px;">Ganti Password</h2>
          <form method="post" action="/akun/password" style="margin-top:18px;">
            <div class="field"><label>Password Lama <span class="req">*</span></label><input type="password" name="currentPassword" required autocomplete="current-password"></div>
            <div class="field" style="margin-bottom:8px;"><label>Password Baru <span class="req">*</span></label><input type="password" name="newPassword" required minlength="6" autocomplete="new-password" placeholder="Minimal 6 karakter"></div>
            <button class="btn-outline" type="submit" style="padding:13px 24px;border-radius:11px;font-size:14px;font-weight:700;margin-top:14px;">Ganti Password</button>
          </form>
        </div>
      </div>

      <div class="split-side">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:14px;">
          <h2 style="font-size:18px;font-weight:800;">Riwayat Pesanan</h2>
          ${totalOrders ? `<span style="font-size:12px;color:var(--text-muted);">${totalOrders} total</span>` : ''}
        </div>
        ${orderHistory(orders, { total: totalOrders, previewCount: orders.length })}
      </div>
    </div>
  </section>
  ${customerFooter()}
</div></div>`;

  return page({ title: 'Akun Saya — Pecup', bodyHtml: body, noindex: true });
}

module.exports = { renderMasuk, renderDaftar, renderAkun, renderRiwayatPesanan };
