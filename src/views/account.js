const { page, customerHeader, customerFooter, backButton, logoMark } = require('./layout');
const {
  formatRupiah,
  escapeHtml,
  escapeAttr,
  formatDateID,
  formatWhatsapp,
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
  return page({ title, bodyHtml: body });
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
// tilted 30°; the 10th slot is highlighted as the free-cup reward.
function stampCard(loyalty) {
  const slots = [];
  for (let i = 0; i < loyalty.perReward; i += 1) {
    const earned = i < loyalty.inCurrentCard;
    const isReward = i === loyalty.perReward - 1;
    if (earned) {
      slots.push(`<div class="stamp-slot ${isReward ? 'stamp-reward' : 'stamp-filled'}"><img src="/assets/pecup-logo.png" alt="Stempel ${i + 1}"></div>`);
    } else {
      slots.push(
        `<div class="stamp-slot stamp-empty" title="Stempel ke-${i + 1}">${isReward ? 'GRATIS' : i + 1}</div>`
      );
    }
  }

  const justCompletedCard = loyalty.inCurrentCard === 0 && loyalty.rewardsEarned > 0;
  const message = justCompletedCard
    ? 'Kartu penuh! Tunjukkan halaman ini saat pesan untuk klaim cup gratismu, lalu kartu dimulai lagi dari nol.'
    : `Kurang <strong>${loyalty.toNextReward}</strong> pesanan selesai lagi untuk 1 cup gratis.`;

  return `
  <div class="card">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
      <h2 style="font-size:19px;font-weight:800;">Kartu Stempel</h2>
      <span style="font-size:13px;color:var(--text-muted);">${loyalty.stamps} stempel seumur hidup</span>
    </div>
    <p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin-bottom:22px;">${message}</p>
    <div class="stamp-grid">${slots.join('')}</div>
    ${
      loyalty.rewardsEarned > 0
        ? `<div style="margin-top:22px;background:var(--orange-soft);border-radius:12px;padding:14px 16px;font-size:13.5px;color:#7a4a1f;line-height:1.6;">
            Kamu sudah mengumpulkan <strong>${loyalty.rewardsEarned} cup gratis</strong> sejauh ini. Sebutkan saat memesan ya!
          </div>`
        : ''
    }
    <p style="font-size:12px;color:var(--text-muted);margin-top:16px;line-height:1.6;">Stempel bertambah otomatis setiap pesanan berstatus <strong>Selesai</strong>.</p>
  </div>`;
}

function orderHistory(orders) {
  if (!orders.length) {
    return `<p style="font-size:14px;color:var(--text-muted);padding:8px 0;">Belum ada pesanan. <a href="/">Mulai belanja →</a></p>`;
  }
  return orders
    .map((o) => {
      const status = orderStatus(o.status);
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:700;">${escapeHtml(o.order_number)}</div>
          <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;">${escapeHtml(formatDateID(o.created_at))}</div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:99px;color:${status.color};background:${status.bg};white-space:nowrap;">${status.label}</span>
          <span style="font-size:14.5px;font-weight:800;color:var(--green-dark);white-space:nowrap;">${formatRupiah(o.total)}</span>
        </div>
      </div>`;
    })
    .join('');
}

function renderAkun({ customer, loyalty, orders, cartCount = 0, flash = '', errors = [] }) {
  const body = `
<div class="frame-scroll"><div class="frame">
  ${customerHeader(cartCount, null, customer)}
  <section class="px-page" style="padding-top:40px;padding-bottom:100px;">
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
        ${stampCard(loyalty)}

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
        <h2 style="font-size:18px;font-weight:800;margin-bottom:14px;">Riwayat Pesanan</h2>
        ${orderHistory(orders)}
      </div>
    </div>
  </section>
  ${customerFooter()}
</div></div>`;

  return page({ title: 'Akun Saya — Pecup', bodyHtml: body });
}

module.exports = { renderMasuk, renderDaftar, renderAkun };
