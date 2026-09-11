const { csvEscape, formatTimeID, formatRupiah } = require('./utils');
const { getOrderItems } = require('./queries');

async function buildDailyOrdersCsv(orders) {
  const header = [
    'Waktu',
    'Nomor Pesanan',
    'Nama Pemesan',
    'WhatsApp',
    'Produk Dipesan',
    'Catatan',
    'Total',
    'Status',
    'Bukti Transfer',
    'Email Terkirim',
  ];

  const lines = [header.map(csvEscape).join(',')];

  for (const o of orders) {
    const items = await getOrderItems(o.id);
    const itemsText = items.map((it) => `${it.product_name} x${it.qty}`).join('; ');
    const row = [
      formatTimeID(o.created_at),
      o.order_number,
      o.customer_name,
      o.whatsapp,
      itemsText,
      o.notes || '',
      formatRupiah(o.total),
      o.status === 'terkonfirmasi' ? 'Terkonfirmasi' : 'Menunggu Verifikasi',
      o.proof_filename || '',
      o.email_sent ? 'Ya' : 'Tidak',
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  // UTF-8 BOM so Excel on Windows renders "Rp" and Indonesian text correctly.
  return '﻿' + lines.join('\r\n');
}

module.exports = { buildDailyOrdersCsv };
