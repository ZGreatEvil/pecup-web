// What each admin account is allowed to do.
//
// Before this, there were exactly two kinds of admin: 'superadmin' (everything)
// and 'admin' (products, orders, and looking customers up). That's too blunt
// for a real shop — the person taking orders shouldn't necessarily be able to
// change prices, and the person minding stock has no business reading the
// activity log. A superadmin now ticks, per account, exactly what that person
// may reach, which is what makes roles like "admin penjualan" possible without
// a code change.
//
// Rules of the system, in one place so they can't drift:
//   * A superadmin always has everything. The tick boxes don't apply to them —
//     there is no way to lock the owner out of their own shop.
//   * A regular admin has exactly the keys stored on their row. No key means
//     no access, on the server, not merely a hidden menu item.
//   * Granting is never an escalation: an admin who can manage accounts can
//     only hand out permissions they hold themselves, and can't touch a
//     superadmin at all (see canManage/grantableBy below).

// The catalogue. `group` only decides how the editor lays them out.
// Order matters: it's the order the page renders them in.
const CATALOG = [
  {
    group: 'Produk',
    items: [
      { key: 'produk.lihat', label: 'Lihat produk', hint: 'Buka daftar produk dan detailnya.' },
      { key: 'produk.kelola', label: 'Tambah, ubah & hapus produk', hint: 'Termasuk harga, foto, video dan stok.' },
    ],
  },
  {
    group: 'Pesanan',
    items: [
      { key: 'pesanan.lihat', label: 'Lihat pesanan', hint: 'Daftar pesanan masuk dan detail tiap pesanan.' },
      { key: 'pesanan.status', label: 'Ubah status pesanan', hint: 'Menunggu → diproses → selesai, termasuk membatalkan.' },
      { key: 'pesanan.manual', label: 'Catat pesanan manual', hint: 'Pesanan lewat WhatsApp atau datang langsung.' },
      { key: 'pesanan.unduh', label: 'Unduh pesanan (CSV)', hint: 'Ekspor pesanan untuk pembukuan.' },
    ],
  },
  {
    group: 'Pelanggan',
    items: [
      { key: 'pelanggan.lihat', label: 'Cari & lihat pelanggan', hint: 'Nama, nomor WhatsApp, riwayat pesanan.' },
      { key: 'pelanggan.tambah', label: 'Buat akun pelanggan', hint: 'Untuk pelanggan yang belum punya akun.' },
      { key: 'pelanggan.ubah', label: 'Ubah & hapus akun pelanggan', hint: 'Termasuk mengganti password pelanggan.' },
      { key: 'pelanggan.stempel', label: 'Atur stempel & cup gratis', hint: 'Menambah stempel dan menukarkan cup gratis.' },
      { key: 'pelanggan.unduh', label: 'Unduh data pelanggan (CSV)', hint: 'Ekspor seluruh daftar pelanggan.' },
    ],
  },
  {
    group: 'Penjualan & Promo',
    items: [
      { key: 'laporan.lihat', label: 'Lihat laporan penjualan', hint: 'Omzet, produk terlaris, grafik harian.' },
      { key: 'voucher.kelola', label: 'Kelola kode promo', hint: 'Membuat, menonaktifkan dan menghapus voucher.' },
      { key: 'loyalitas.kelola', label: 'Kelola program stempel & tier', hint: 'Aturan stempel, hadiah dan tingkat keanggotaan.' },
    ],
  },
  {
    group: 'Biaya & Stok Bahan',
    items: [
      {
        key: 'inventaris.kelola',
        label: 'Kelola stok bahan & kemasan',
        hint: 'Isi ulang cup, tutup, sendok; atur harga beli dan bahan tiap produk.',
      },
      {
        key: 'pengeluaran.kelola',
        label: 'Catat pengeluaran',
        hint: 'Semua biaya toko: bahan, gaji, sewa, transport.',
      },
      {
        key: 'laba.lihat',
        label: 'Lihat laba kotor & laba bersih',
        hint: 'Angka untung-rugi, termasuk modal dan biaya. Terpisah dari laporan penjualan biasa.',
        sensitive: true,
      },
    ],
  },
  {
    group: 'Toko & Sistem',
    items: [
      { key: 'pengaturan.kelola', label: 'Ubah pengaturan toko', hint: 'Buka/tutup, ongkir, jam, PPN, retensi data.' },
      { key: 'reset_sandi.kelola', label: 'Tangani reset password pelanggan', hint: 'Menyetujui atau menolak permintaan reset.' },
      { key: 'log.lihat', label: 'Lihat log aktivitas', hint: 'Catatan siapa mengubah apa, beserta ekspornya.' },
      {
        key: 'admin.kelola',
        label: 'Kelola akun admin',
        hint: 'Menambah admin lain dan mengatur izinnya. Hanya bisa untuk sesama admin biasa, dan hanya izin yang dia punya sendiri.',
        sensitive: true,
      },
    ],
  },
];

const ALL_KEYS = CATALOG.flatMap((g) => g.items.map((i) => i.key));
const KEY_SET = new Set(ALL_KEYS);

// What a plain 'admin' account could already do before this existed. Accounts
// created before permissions were introduced are seeded with exactly this, so
// nobody wakes up with less access than they had yesterday.
const LEGACY_ADMIN_KEYS = [
  'produk.lihat',
  'produk.kelola',
  'pesanan.lihat',
  'pesanan.status',
  'pesanan.manual',
  'pesanan.unduh',
  'pelanggan.lihat',
  'pelanggan.tambah',
  'laporan.lihat',
  'reset_sandi.kelola',
];

// Starting points offered in the editor. They are a convenience only — every
// box stays individually tickable afterwards.
const PRESETS = [
  {
    key: 'penjualan',
    label: 'Admin Penjualan',
    hint: 'Terima dan catat pesanan, lihat pelanggan. Tidak bisa ubah harga atau pengaturan.',
    keys: ['produk.lihat', 'pesanan.lihat', 'pesanan.status', 'pesanan.manual', 'pelanggan.lihat', 'pelanggan.tambah'],
  },
  {
    key: 'gudang',
    label: 'Admin Stok',
    hint: 'Urus produk dan stok, lihat pesanan yang harus disiapkan.',
    keys: ['produk.lihat', 'produk.kelola', 'pesanan.lihat', 'pesanan.status', 'inventaris.kelola'],
  },
  {
    key: 'keuangan',
    label: 'Admin Keuangan',
    hint: 'Laporan, ekspor dan promo. Tidak mengubah produk.',
    keys: [
      'pesanan.lihat', 'pesanan.unduh', 'laporan.lihat', 'laba.lihat', 'voucher.kelola',
      'pelanggan.lihat', 'pelanggan.unduh', 'pengeluaran.kelola', 'inventaris.kelola',
    ],
  },
  {
    key: 'penuh',
    label: 'Akses Penuh',
    hint: 'Semua izin di bawah, kecuali hal yang memang hanya untuk superadmin.',
    keys: ALL_KEYS.filter((k) => k !== 'admin.kelola'),
  },
  { key: 'kosong', label: 'Kosongkan', hint: 'Hapus semua centang, lalu pilih sendiri.', keys: [] },
];

/** Drops anything that isn't a real permission key, and de-duplicates. */
function normalize(keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const key = String(raw || '').trim();
    if (!KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  // Stable order, so a stored list and a rendered list always match.
  return ALL_KEYS.filter((k) => out.includes(k));
}

/**
 * Everything this admin may do.
 * A superadmin is not stored with a list — they simply have all of it, so
 * adding a new permission to the catalogue can never lock the owner out.
 */
function permissionsFor(admin) {
  if (!admin) return [];
  if (admin.role === 'superadmin') return ALL_KEYS.slice();
  return normalize(admin.permissions || []);
}

function has(admin, key) {
  if (!admin) return false;
  if (admin.role === 'superadmin') return true;
  return normalize(admin.permissions || []).includes(key);
}

/** True if this admin may reach any of the listed permissions. */
function hasAny(admin, keys) {
  return keys.some((key) => has(admin, key));
}

/**
 * May `actor` manage `target`'s account at all?
 * A superadmin may manage anyone. Everyone else needs admin.kelola AND the
 * target must not be a superadmin — otherwise "kelola akun" would be a way to
 * reset the owner's password and take the shop.
 */
function canManage(actor, target) {
  if (!actor || !target) return false;
  if (actor.role === 'superadmin') return true;
  if (!has(actor, 'admin.kelola')) return false;
  return target.role !== 'superadmin';
}

/**
 * Which permissions `actor` is allowed to hand out. A superadmin may grant
 * anything; anyone else may only pass on what they already hold, so nobody can
 * quietly promote themselves (or a friend) past their own level.
 */
function grantableBy(actor) {
  if (actor && actor.role === 'superadmin') return ALL_KEYS.slice();
  return permissionsFor(actor);
}

/** The subset of `wanted` that `actor` is actually allowed to grant. */
function limitGrant(actor, wanted, { keep = [] } = {}) {
  const allowed = new Set(grantableBy(actor));
  const kept = normalize(keep).filter((k) => !allowed.has(k)); // untouchable by this actor
  return normalize([...kept, ...normalize(wanted).filter((k) => allowed.has(k))]);
}

/** Human-readable list, for the activity log. */
function describe(keys) {
  const list = normalize(keys);
  if (!list.length) return 'tidak ada izin';
  const byKey = new Map();
  for (const g of CATALOG) for (const i of g.items) byKey.set(i.key, i.label);
  return list.map((k) => byKey.get(k) || k).join(', ');
}

module.exports = {
  CATALOG,
  ALL_KEYS,
  LEGACY_ADMIN_KEYS,
  PRESETS,
  normalize,
  permissionsFor,
  has,
  hasAny,
  canManage,
  grantableBy,
  limitGrant,
  describe,
};
