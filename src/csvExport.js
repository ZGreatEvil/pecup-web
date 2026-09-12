const { csvEscape, formatTimeID, formatWhatsapp, toDateOnly, orderStatus } = require('./utils');
const { getOrderItemsForOrders } = require('./queries');

// Money is exported as bare numbers (18000, not "Rp 18.000") so the columns
// can be summed in Excel/Sheets without cleaning them up first. That's the
// whole point of the export for bookkeeping.
function money(value) {
  return String(Math.round(Number(value) || 0));
}

async function buildDailyOrdersCsv(orders) {
  const header = [
    'Tanggal Pesan',
    'Waktu (WIB)',
    'Nomor Pesanan',
    'Nama Pemesan',
    'WhatsApp',
    'Tanggal Antar',
    'Lokasi Antar',
    'Produk Dipesan',
    'Jumlah Cup',
    'Catatan',
    'Subtotal',
    'Diskon Cup Gratis',
    'Item Digratiskan',
    'Total Dibayar',
    'Status',
    'Bukti Transfer',
    'Email Terkirim',
  ];

  const lines = [header.map(csvEscape).join(',')];
  // One batched query for every order's items instead of one query per order.
  const itemsByOrder = await getOrderItemsForOrders(orders.map((o) => o.id));

  let totalSubtotal = 0;
  let totalDiscount = 0;
  let totalPaid = 0;
  let totalCups = 0;

  for (const o of orders) {
    const items = itemsByOrder.get(Number(o.id)) || [];
    const itemsText = items.map((it) => `${it.product_name} x${it.qty}`).join('; ');
    const cups = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const discount = Number(o.reward_discount) || 0;
    // Older rows pre-date the subtotal column; fall back to total + discount.
    const subtotal = Number(o.subtotal) || Number(o.total) + discount;

    // Only completed orders count toward the money totals — pending and
    // in-progress orders aren't revenue yet.
    if (o.status === 'selesai') {
      totalSubtotal += subtotal;
      totalDiscount += discount;
      totalPaid += Number(o.total) || 0;
      totalCups += cups;
    }

    lines.push(
      [
        toDateOnly(o.created_at),
        formatTimeID(o.created_at),
        o.order_number,
        o.customer_name,
        formatWhatsapp(o.whatsapp),
        toDateOnly(o.delivery_date),
        o.address || '',
        itemsText,
        String(cups),
        o.notes || '',
        money(subtotal),
        money(discount),
        discount > 0 ? o.reward_item || '1 cup termurah' : '',
        money(o.total),
        orderStatus(o.status).label,
        o.proof_filename || '',
        o.email_sent ? 'Ya' : 'Tidak',
      ].map(csvEscape).join(',')
    );
  }

  // Summary row for the selesai orders only, so the file is usable for
  // bookkeeping without building a pivot first.
  lines.push('');
  lines.push(
    ['TOTAL (pesanan selesai saja)', '', '', '', '', '', '', '', String(totalCups), '',
      money(totalSubtotal), money(totalDiscount), '', money(totalPaid), '', '', '']
      .map(csvEscape)
      .join(',')
  );

  // UTF-8 BOM so Excel on Windows renders "Rp" and Indonesian text correctly.
  return '﻿' + lines.join('\r\n');
}

module.exports = { buildDailyOrdersCsv };
