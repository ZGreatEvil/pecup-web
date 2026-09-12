// Runs the retention sweep by hand: deletes payment-proof files for orders
// past the retention window, and activity-log rows past theirs.
//
// Orders, customers, products and settings are never touched — see
// src/retention.js for why, and the Pengaturan Toko page to change the
// windows (default: proofs 90 days, logs 12 months).
//
// Normally you don't need this: the same sweep runs nightly from Vercel Cron,
// with the admin dashboard as a fallback if the cron ever stops. This is for
// running it on demand, or for seeing what it would do.
//
//   node scripts/prune.js         # dry run — reports, deletes nothing
//   node scripts/prune.js --yes   # do it
const path = require('path');

const { loadEnv } = require('../src/env');
loadEnv(path.join(__dirname, '..', '.env'));
loadEnv(path.join(__dirname, '..', '.env.local'));

const retention = require('../src/retention');
const settings = require('../src/settings');

function readable(bytes) {
  if (!bytes) return '0 KB';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

async function main() {
  const confirmed = process.argv.includes('--yes');
  const { proofDays, logMonths } = await retention.policy();
  const all = await settings.getAll({ fresh: true });

  console.log('KEBIJAKAN RETENSI');
  console.log(`  Bukti transfer : ${proofDays ? `${proofDays} hari` : 'disimpan selamanya'}`);
  console.log(`  Log aktivitas  : ${logMonths ? `${logMonths} bulan` : 'disimpan selamanya'}`);
  console.log(`  Sapuan terakhir: ${all.last_prune_at || 'belum pernah'}`);
  console.log('  Pesanan        : tidak pernah dihapus');

  const preview = await retention.runRetention({ force: true, dryRun: true });
  console.log('\nYANG AKAN DIHAPUS SEKARANG');
  console.log(
    `  Berkas bukti   : ${preview.proofs.files || 0}` +
      (preview.proofs.bytes ? ` (${readable(preview.proofs.bytes)})` : '') +
      (preview.proofs.skipped ? ` — ${preview.proofs.skipped}` : '')
  );
  console.log(
    `  Baris log      : ${preview.logs.rows || 0}` + (preview.logs.skipped ? ` — ${preview.logs.skipped}` : '')
  );

  if (!confirmed) {
    console.log('\n--- DRY RUN ---');
    console.log('Tidak ada yang dihapus. Jalankan lagi dengan --yes:');
    console.log('    node scripts/prune.js --yes');
    return;
  }

  const result = await retention.runRetention({ force: true });
  console.log('\nSELESAI.');
  console.log(`  Berkas bukti dihapus : ${result.proofs.files || 0} (${readable(result.proofs.bytes || 0)})`);
  console.log(`  Pesanan dilepas dari bukti : ${result.proofs.orders || 0} (pesanannya sendiri tetap ada)`);
  console.log(`  Baris log dihapus    : ${result.logs.rows || 0}`);
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
