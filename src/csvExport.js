const { csvEscape, formatTimeID, formatRupiah, formatWhatsapp, toDateOnly, orderStatus } = require('./utils');
const { getOrderItems } = require('./queries');

async function buildDailyOrdersCsv(orders) {
  const header = [
    'Waktu',
    'Nomor Pesanan',
    'Nama Pemesan',
    'WhatsApp',
    'Tanggal Antar',
    'Lokasi Antar',
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
      formatWhatsapp(o.whatsapp),
      toDateOnly(o.delivery_date),
      o.address || '',
      itemsText,
      o.notes || '',
      formatRupiah(o.total),
      orderStatus(o.status).label,
      o.proof_filename || '',
      o.email_sent ? 'Ya' : 'Tidak',
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  // UTF-8 BOM so Excel on Windows renders "Rp" and Indonesian text correctly.
  return '﻿' + lines.join('\r\n');
}

module.exports = { buildDailyOrdersCsv };
