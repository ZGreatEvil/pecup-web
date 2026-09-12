// Full data reset: wipes everything the shop has *done* and keeps everything
// the shop *is*. Run this to go live with a clean slate after testing.
//
// DELETED
//   orders + order_items          every transaction
//   payment-proof files           the uploads those orders carried (Vercel Blob)
//   stamps                        every loyalty stamp, earned or redeemed
//   admin_logs                    the whole activity trail
//   password_resets               any open or spent reset request
//
// RESET (rows kept, counters zeroed)
//   customers.rewards_claimed     back to 0, so every card starts at Bronze
//   customers.weekly_cup_at       the weekly free cup becomes available again
//   customers.birthday_cup_year   the birthday cup becomes available again
//   vouchers.used_count           codes keep working, redemptions forgotten
//   order numbering               next order is PC-<tanggal>-0001 again
//
// UNTOUCHED
//   admins, customers (name / number / password / address / birthday),
//   products and their stock, shop settings, the tier ladder
//
//   node scripts/reset-data.js                  # dry run — reports, deletes nothing
//   node scripts/reset-data.js --yes            # do it
//   node scripts/reset-data.js --yes --voucher  # ...and delete the promo codes too
const path = require('path');

const { loadEnv } = require('../src/env');
loadEnv(path.join(__dirname, '..', '.env'));
loadEnv(path.join(__dirname, '..', '.env.local'));

const db = require('../src/db');
const { list, del } = require('@vercel/blob');

const confirmed = process.argv.includes('--yes');
const dropVouchers = process.argv.includes('--voucher');

async function count(table) {
  const rows = await db.query(`select count(*)::int as n from ${table}`);
  return Number(rows[0].n) || 0;
}

async function main() {
  const before = {
    orders: await count('orders'),
    order_items: await count('order_items'),
    stamps: await count('stamps'),
    admin_logs: await count('admin_logs'),
    password_resets: await count('password_resets'),
    vouchers: await count('vouchers'),
  };
  const keep = {
    admins: await count('admins'),
    customers: await count('customers'),
    products: await count('products'),
    settings: await count('settings'),
  };
  const proofs = await db.query('select count(*)::int as n from orders where proof_filename is not null');

  console.log('AKAN DIHAPUS');
  console.log(`  Pesanan            : ${before.orders}`);
  console.log(`  Baris item         : ${before.order_items}`);
  console.log(`  Bukti transfer     : ${proofs[0].n} berkas (+ berkas yatim di Blob)`);
  console.log(`  Stempel            : ${before.stamps}`);
  console.log(`  Log aktivitas      : ${before.admin_logs}`);
  console.log(`  Permintaan reset   : ${before.password_resets}`);
  console.log(`  Kode voucher       : ${dropVouchers ? before.vouchers : `0 (${before.vouchers} disimpan, hitungan pemakaian di-nol-kan)`}`);
  console.log('\nAKAN DIRESET');
  console.log('  Klaim cup gratis, cup mingguan, dan cup ulang tahun tiap pelanggan');
  console.log('  Nomor pesanan kembali ke 0001');
  console.log('\nTIDAK DISENTUH');
  console.log(`  Akun admin         : ${keep.admins}`);
  console.log(`  Akun pelanggan     : ${keep.customers} (nama, nomor, password, alamat, ulang tahun tetap)`);
  console.log(`  Produk             : ${keep.products} (termasuk stok)`);
  console.log(`  Pengaturan toko    : ${keep.settings} (termasuk tier)`);

  if (!confirmed) {
    console.log('\n--- DRY RUN ---');
    console.log('Tidak ada yang dihapus. Jalankan lagi dengan --yes untuk benar-benar menghapus:');
    console.log('    node scripts/reset-data.js --yes');
    return;
  }

  // Payment proofs live in Blob, not Postgres — delete by listing the store
  // rather than trusting proof_filename, so uploads orphaned by an abandoned
  // checkout get cleaned up too.
  const token = process.env.PROOFS_BLOB_READ_WRITE_TOKEN;
  let blobsDeleted = 0;
  if (token) {
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
    console.log('\nPROOFS_BLOB_READ_WRITE_TOKEN tidak diatur — berkas bukti transfer dilewati.');
  }

  // Stamps reference orders (ON DELETE SET NULL), so they'd survive the order
  // wipe as untraceable rows — clear them first and explicitly.
  await db.query('delete from stamps');
  await db.query('delete from password_resets');
  await db.query('delete from order_items');
  await db.query('delete from orders');
  await db.query('delete from admin_logs');

  await db.query(
    'update customers set rewards_claimed = 0, weekly_cup_at = null, birthday_cup_year = null'
  );
  if (dropVouchers) await db.query('delete from vouchers');
  else await db.query('update vouchers set used_count = 0');

  // Restart identities so the first real order reads PC-<tanggal>-0001.
  for (const table of ['orders', 'order_items', 'stamps', 'admin_logs', 'password_resets']) {
    try {
      await db.query(`alter table ${table} alter column id restart with 1`);
    } catch (err) {
      console.error(`  gagal reset penomoran ${table}: ${err.message}`);
    }
  }

  const after = {
    orders: await count('orders'),
    order_items: await count('order_items'),
    stamps: await count('stamps'),
    admin_logs: await count('admin_logs'),
    password_resets: await count('password_resets'),
    admins: await count('admins'),
    customers: await count('customers'),
    products: await count('products'),
  };

  console.log('\nSELESAI.');
  console.log(`  Berkas bukti transfer dihapus : ${blobsDeleted}`);
  console.log(`  Sisa pesanan / item / stempel : ${after.orders} / ${after.order_items} / ${after.stamps}`);
  console.log(`  Sisa log / permintaan reset   : ${after.admin_logs} / ${after.password_resets}`);
  console.log(`  Akun admin tersisa            : ${after.admins}`);
  console.log(`  Akun pelanggan tersisa        : ${after.customers}`);
  console.log(`  Produk tersisa                : ${after.products}`);
  console.log('  Nomor pesanan berikutnya      : PC-<tanggal>-0001');
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
