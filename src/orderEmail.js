const { formatRupiah, escapeHtml } = require('./utils');

function buildOrderEmailHtml({ order, items }) {
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
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Nomor WhatsApp</td><td style="padding:4px 0;font-weight:bold;">${escapeHtml(order.whatsapp)}</td></tr>
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
        <tr>
          <td colspan="2" style="padding:10px 12px;text-align:right;font-weight:bold;">Total</td>
          <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#3f7a42;">${formatRupiah(order.total)}</td>
        </tr>
      </tfoot>
    </table>

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

module.exports = { sendOrderNotification };
