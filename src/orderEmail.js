const { formatRupiah, escapeHtml, formatWhatsapp, formatDateID } = require('./utils');
const { discountLines, taxLine, freeCupValue } = require('./orderMoney');

function buildOrderEmailHtml({ order, items }) {
  // Anything waived — a free cup, a member discount, a promo code — makes the
  // total lower than the line items add up to. Every one of them is itemised
  // here, or the shop's books look like an underpayment.
  const discounts = discountLines(order);
  const totalDiscount = discounts.reduce((sum, line) => sum + line.amount, 0);
  const freeCups = freeCupValue(order);
  const tax = taxLine(order);
  const deliveryFee = Number(order.delivery_fee) || 0;
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(it.product_name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${it.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatRupiah(it.subtotal)}</td>
      </tr>`
    )
    .join('');

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#22221f;">
    <h2 style="color:#3f7a42;margin-bottom:4px;">Pesanan Baru Masuk — ${escapeHtml(order.orderNumber)}</h2>
    <p style="color:#666;margin-top:0;">Pesanan baru diterima lewat website Pecup. Berikut detailnya:</p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Nama Pemesan</td><td style="padding:4px 0;font-weight:bold;">${escapeHtml(order.customer_name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Nomor WhatsApp</td><td style="padding:4px 0;font-weight:bold;">${escapeHtml(formatWhatsapp(order.whatsapp))}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Tanggal Antar</td><td style="padding:4px 0;font-weight:bold;">${
        order.delivery_date ? escapeHtml(formatDateID(order.delivery_date)) : '<span style="color:#999;">(tidak diisi)</span>'
      }</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">Lokasi Antar</td><td style="padding:4px 0;font-weight:bold;">${
        order.address ? escapeHtml(order.address) : '<span style="color:#999;">(tidak diisi)</span>'
      }</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">Catatan</td><td style="padding:4px 0;">${order.notes ? escapeHtml(order.notes) : '<span style="color:#999;">(tidak ada catatan)</span>'}</td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f3f6f0;">
          <th style="text-align:left;padding:8px 12px;">Produk</th>
          <th style="text-align:center;padding:8px 12px;">Qty</th>
          <th style="text-align:right;padding:8px 12px;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${
          totalDiscount > 0 || deliveryFee > 0 || tax
            ? `<tr>
          <td colspan="2" style="padding:8px 12px;text-align:right;color:#666;">Subtotal</td>
          <td style="padding:8px 12px;text-align:right;">${formatRupiah(order.subtotal)}</td>
        </tr>`
            : ''
        }
        ${discounts
          .map(
            (line) => `<tr>
          <td colspan="2" style="padding:8px 12px;text-align:right;color:#a15a1f;font-weight:bold;">${escapeHtml(line.label)}</td>
          <td style="padding:8px 12px;text-align:right;color:#a15a1f;font-weight:bold;">&minus;${formatRupiah(line.amount)}</td>
        </tr>`
          )
          .join('')}
        ${
          tax
            ? `<tr>
          <td colspan="2" style="padding:8px 12px;text-align:right;color:#666;">${escapeHtml(tax.label)}</td>
          <td style="padding:8px 12px;text-align:right;">${formatRupiah(tax.amount)}</td>
        </tr>`
            : ''
        }
        ${
          deliveryFee > 0
            ? `<tr>
          <td colspan="2" style="padding:8px 12px;text-align:right;color:#666;">Ongkos antar</td>
          <td style="padding:8px 12px;text-align:right;">${formatRupiah(deliveryFee)}</td>
        </tr>`
            : ''
        }
        <tr>
          <td colspan="2" style="padding:10px 12px;text-align:right;font-weight:bold;">Total Dibayar</td>
          <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#3f7a42;">${formatRupiah(order.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${
      totalDiscount > 0
        ? `<div style="margin-top:16px;padding:14px 16px;background:#fdf1e3;border-left:4px solid #e88a3a;border-radius:6px;">
      <div style="font-weight:bold;color:#7a4a1f;margin-bottom:4px;">Pesanan ini dapat potongan ${formatRupiah(totalDiscount)}</div>
      <div style="font-size:13px;color:#7a4a1f;line-height:1.6;">
        ${discounts.map((line) => escapeHtml(line.label)).join('<br>')}
        <br><br>
        Uang yang masuk hanya <strong>${formatRupiah(order.total)}</strong> — selisihnya adalah biaya promo, bukan kekurangan bayar.
        ${
          freeCups > 0
            ? `Nilai cup yang digratiskan: <strong>${formatRupiah(freeCups)}</strong> (barang keluar, uang tidak masuk).`
            : ''
        }
        ${Number(order.reward_discount) > 0 ? 'Stempel pelanggan sudah kembali ke nol.' : ''}
      </div>
    </div>`
        : ''
    }

    <p style="font-size:13px;color:#666;margin-top:20px;">
      Bukti transfer pelanggan terlampir pada email ini (jika ada).
      Buka panel admin Pecup untuk memverifikasi dan mengubah status pesanan ini.
    </p>
  </div>`;
}

// Sends the order-notification email via the Resend API. Returns
// { ok: true } or { ok: false, error }. Uses Resend's shared
// "onboarding@resend.dev" sender, which works out of the box with just an
// API key — no domain verification needed. To send from your own domain
// instead (e.g. no-reply@pecup.id), verify it in the Resend dashboard and
// change RESEND_FROM below.
async function sendOrderNotification({ order, items, proofFile }) {
  const apiKey = process.env.RESEND_API_KEY;
  const sellerEmail = process.env.SELLER_EMAIL || process.env.EMAIL_USER;
  const from = process.env.RESEND_FROM || 'Pecup <onboarding@resend.dev>';

  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY belum diisi di environment variables.' };
  }
  if (!sellerEmail) {
    return { ok: false, error: 'SELLER_EMAIL (atau EMAIL_USER) belum diisi di environment variables.' };
  }

  const html = buildOrderEmailHtml({ order, items });

  const payload = {
    from,
    to: [sellerEmail],
    subject: `Pesanan Baru — ${order.orderNumber} (${order.customer_name})`,
    html,
  };
  if (proofFile) {
    payload.attachments = [
      { filename: proofFile.filename, content: proofFile.buffer.toString('base64') },
    ];
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, error: `Resend API gagal (${res.status}): ${errBody}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// buildOrderEmailHtml is exported so the money breakdown can be checked
// without sending anything — the email is the one surface that can't be
// opened in a browser to look at.
module.exports = { sendOrderNotification, buildOrderEmailHtml };
