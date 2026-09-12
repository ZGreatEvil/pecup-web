// One-off cleanup: wipes every order so the shop can go live with a clean
// slate. Deletes the order rows (order_items cascade), the payment-proof
// files those orders uploaded, and restarts order numbering at 0001.
//
// Products, categories, admin accounts and the activity log are NOT touched.
//
// Loyalty stamps are NOT deleted by default, because a stamp whose order is
// gone looks exactly like one an admin added by hand — there's no way to tell
// them apart afterwards. Pass --stempel to clear them too, which is what you
// want when the orders being wiped were test data.
//
//   node scripts/reset-orders.js              # dry run — only reports what it would delete
//   node scripts/reset-orders.js --yes        # actually deletes
//   node scripts/reset-orders.js --yes --stempel   # ...including loyalty stamps
const path = require('path');

const { loadEnv } = require('../src/env');
loadEnv(path.join(__dirname, '..', '.env'));
loadEnv(path.join(__dirname, '..', '.env.local'));

const db = require('../src/db');
const { list, del } = require('@vercel/blob');

const confirmed = process.argv.includes('--yes');
const clearStamps = process.argv.includes('--stempel');

async function main() {
  const orders = await db.query('select id, order_number, proof_filename from orders order by id');
  const itemCount = await db.query('select count(*)::int as n from order_items');
  const stampCount = await db.query("select count(*)::int as n from stamps where status = 'active'");

  console.log(`Pesanan tersimpan : ${orders.length}`);
  console.log(`Baris item        : ${itemCount[0].n}`);
  console.log(`Bukti transfer    : ${orders.filter((o) => o.proof_filename).length} berkas`);
  console.log(
    `Stempel aktif     : ${stampCount[0].n}` +
      (clearStamps ? ' (akan dihapus — --stempel)' : ' (TIDAK dihapus; pakai --stempel kalau mau)')
  );

  if (!orders.length) {
    console.log('\nTidak ada yang perlu dihapus.');
    return;
  }

  if (!confirmed) {
    console.log('\n--- DRY RUN ---');
    console.log('Tidak ada yang dihapus. Jalankan lagi dengan --yes untuk benar-benar menghapus:');
    console.log('    node scripts/reset-orders.js --yes');
    return;
  }

  const token = process.env.PROOFS_BLOB_READ_WRITE_TOKEN;
  let blobsDeleted = 0;
  if (token) {
    // Delete by listing the store rather than trusting proof_filename alone,
    // so uploads orphaned by an earlier failed checkout get cleaned up too.
    const { blobs } = await list({ token, prefix: 'bukti-' });
    for (const blob of blobs) {
      try {
        await del(blob.url, { token });
        blobsDeleted += 1;
      } catch (err) {
        console.error(`  gagal hapus ${blob.pathname}: ${err.message}`);
      }
    }
  } else {
    console.log('PROOFS_BLOB_READ_WRITE_TOKEN tidak diatur — berkas bukti transfer dilewati.');
  }

  if (clearStamps) {
    // Stamps outlive their order (the FK is ON DELETE SET NULL), so wiping
    // test orders otherwise leaves customers holding cards they earned from
    // data that no longer exists.
    await db.query('delete from stamps');
    await db.query('update customers set rewards_claimed = 0');
  }

  await db.query('delete from orders');
  // Restart numbering so the first real order is PC-<tanggal>-0001 again.
  await db.query('alter table orders alter column id restart with 1');
  await db.query('alter table order_items alter column id restart with 1');

  console.log(`\nSelesai. ${orders.length} pesanan dihapus, ${blobsDeleted} berkas bukti transfer dihapus.`);
  console.log('Nomor pesanan berikutnya dimulai lagi dari 0001.');
  if (clearStamps) console.log('Semua stempel dan hitungan klaim pelanggan juga direset ke nol.');
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
