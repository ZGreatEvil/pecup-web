# Pecup — versi serverless (Vercel + Neon)

Ini adalah versi **serverless** dari aplikasi Pecup (toko online buah potong
per kemasan), untuk di-deploy ke Vercel tanpa server yang menyala terus.
Kalau kamu ingin coba di komputer sendiri tanpa akun cloud sama sekali,
pakai versi lokal (folder terpisah) — versi ini butuh akun Neon (gratis)
dan Vercel (gratis, termasuk Vercel Blob untuk penyimpanan foto/bukti
transfer) untuk database, penyimpanan gambar, dan hosting.

**Catatan jujur:** kode ini sudah dites secara menyeluruh secara *logika*
(routing, validasi, escaping XSS, perhitungan CSV, penandatanganan sesi
admin, dll — lihat bagian "Yang sudah dites" di bawah) memakai data
tiruan. Tapi karena lingkungan pengembangan ini tidak bisa membuat akun
Neon/Vercel sungguhan, alur end-to-end melawan database & storage yang
asli **belum** pernah benar-benar dicoba. Uji dulu dengan `vercel dev`
(lihat langkah 5) sebelum dipakai untuk jualan sungguhan.

## Bagaimana ini berbeda dari versi lokal

| | Versi lokal | Versi serverless (ini) |
|---|---|---|
| Server | Proses Node.js yang menyala terus | Fungsi Vercel, hidup hanya saat ada request |
| Database | SQLite (file di disk) | Postgres (Neon) |
| Foto produk & bukti transfer | Disimpan di folder `public/uploads` | Disimpan di Vercel Blob (2 store: publik untuk foto, privat untuk bukti transfer) |
| Keranjang belanja | Session di memori server | Cookie (aman, tidak sensitif — cuma id produk & jumlah) |
| Sesi admin | Session di memori server | Cookie yang ditandatangani (HMAC), tanpa penyimpanan di server |
| Email notifikasi | Dikirim di belakang layar setelah customer lihat halaman sukses | Dikirim **sebelum** merespons — fungsi serverless bisa "dibekukan" begitu response selesai dikirim |
| Ukuran maksimal bukti transfer | 15MB | 4MB (batas ukuran body request Vercel) |

## Langkah setup

### 1. Buat project Neon (gratis)

1. Daftar/masuk di [neon.com](https://neon.com) → **Create a project**
   (pilih region terdekat, misalnya Singapore).
2. Setelah project jadi, buka **SQL Editor** di dashboard Neon.
3. Salin seluruh isi file `schema.sql` di folder ini, tempel, lalu **Run**.
   Ini akan membuat semua tabel dan fungsi `create_order` (yang menjaga
   stok tetap aman walau ada dua orang checkout bersamaan). Juga otomatis
   mengisi 8 produk contoh kalau tabel produk masih kosong.
4. Buka **Connection Details** di dashboard project. Salin connection
   string yang **pakai pooling** (biasanya sudah jadi default, atau
   berlabel "Pooled connection") → jadi `DATABASE_URL`.

   ⚠️ Connection string ini setara akses penuh ke database — hanya dipakai
   di server (fungsi serverless), **jangan pernah** ditaruh di kode yang
   jalan di browser atau di-commit ke Git publik.

### 2. Buat dua Vercel Blob store (untuk foto produk & bukti transfer)

Supabase punya Storage bawaan; di versi Neon, file (foto produk, bukti
transfer) disimpan lewat **Vercel Blob** — dua store terpisah karena
foto produk perlu publik sementara bukti transfer harus privat.

1. Di dashboard Vercel, buka project ini → tab **Storage** → **Create
   Database** → pilih **Blob**.
2. Buat store pertama, akses **Public**, beri nama mis. `pecup-products`.
   Di **Advanced Options**, set prefix environment variable ke
   `PRODUCTS` (supaya token-nya jadi `PRODUCTS_BLOB_READ_WRITE_TOKEN`).
3. Ulangi untuk store kedua, akses **Private**, nama mis. `pecup-proofs`,
   prefix `PROOFS` (token: `PROOFS_BLOB_READ_WRITE_TOKEN`).
4. Hubungkan (**Connect**) keduanya ke project ini kalau belum otomatis
   ter-hubung saat dibuat — env variable token-nya akan otomatis muncul
   di Project Settings → Environment Variables.

### 3. Siapkan Resend (untuk email notifikasi pesanan)

1. Daftar/masuk di [resend.com](https://resend.com), lalu buka
   [resend.com/api-keys](https://resend.com/api-keys) dan buat API key baru.
2. `SELLER_EMAIL` adalah alamat tujuan notifikasi pesanan (email toko).
3. Pengirim default (`onboarding@resend.dev`) langsung berfungsi tanpa
   setup tambahan. Untuk kirim dari domain sendiri, verifikasi domainnya
   di dashboard Resend lalu isi `RESEND_FROM`.

### 4. Isi environment variables

Salin `.env.example` menjadi `.env` untuk dites lokal:

```
DATABASE_URL=...                      # dari langkah 1 (connection string PAKAI pooling)
PRODUCTS_BLOB_READ_WRITE_TOKEN=...    # dari langkah 2 (store publik)
PROOFS_BLOB_READ_WRITE_TOKEN=...      # dari langkah 2 (store privat)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ganti-ini
ADMIN_SESSION_SECRET=...   # hasil dari: openssl rand -hex 32
RESEND_API_KEY=...
SELLER_EMAIL=...
```

Untuk deploy sungguhan, isi variabel yang sama di **Vercel Dashboard →
Project Settings → Environment Variables** (jangan andalkan file `.env`
saat production — file itu tidak ikut ter-deploy). `PRODUCTS_BLOB_READ_WRITE_TOKEN`
dan `PROOFS_BLOB_READ_WRITE_TOKEN` biasanya sudah otomatis terisi kalau
kamu menghubungkan Blob store dari dalam project ini (lihat langkah 2).

### 5. Install dependency & install Vercel CLI (sekali saja)

```
npm install
npm install -g vercel
```

(Kalau `npm install -g` gagal karena kebijakan jaringan kantor/organisasi,
coba dari komputer/jaringan lain, atau pakai deploy lewat GitHub — hubungkan
repo ini ke project Vercel dari dashboard, tanpa perlu CLI sama sekali;
`npm install` biasa tetap perlu jalan dulu supaya `node_modules` terisi.)

### 6. Coba dulu secara lokal

```
vercel dev
```

Perintah ini menjalankan fungsi serverless di `api/index.js` secara lokal
(otomatis membaca `.env`), lengkap dengan koneksi asli ke Neon & Vercel
Blob. Buka `http://localhost:3000`. Coba seluruh alur: lihat produk →
tambah ke keranjang → checkout dengan upload bukti transfer → cek email
masuk → login admin di `/admin/login` → tambah/edit produk dengan foto →
lihat & download daftar pesanan harian (CSV).

### 7. Deploy ke Vercel

```
vercel        # deploy ke preview URL dulu
vercel --prod # setelah yakin, deploy ke production
```

Atau, lebih simpel: push kode ini ke GitHub, lalu **Import Project** di
[vercel.com/new](https://vercel.com/new) dan pilih repo-nya — deploy
otomatis jalan setiap kali kamu push.

### 8. Bersihkan pesanan percobaan sebelum buka untuk umum

Setelah selesai tes-tes pesanan sendiri, hapus semuanya supaya toko mulai
dari nol:

```
node scripts/reset-orders.js          # cuma menampilkan apa yang akan dihapus
node scripts/reset-orders.js --yes    # benar-benar menghapus
```

Yang dihapus: semua pesanan, item pesanan, dan berkas bukti transfernya,
lalu nomor pesanan mulai lagi dari `0001`. Yang **tidak** disentuh: produk,
kategori, akun admin, dan log aktivitas.

## Struktur folder

```
api/index.js         fungsi serverless tunggal — semua route lewat sini
                      (vercel.json mengarahkan SEMUA path ke sini)
src/
  db.js               koneksi Postgres ke Neon (driver HTTP @neondatabase/serverless)
  storage.js          upload file & signed URL lewat Vercel Blob (2 store: publik/privat)
  queries.js          semua query database (products, orders) — SQL langsung lewat db.js
  uploads.js          bungkus queries+storage: simpan foto produk / bukti transfer
  cart.js             keranjang belanja berbasis cookie (bukan session server)
  cookies.js          baca/tulis cookie mentah
  adminSession.js      cookie sesi admin yang ditandatangani (HMAC-SHA256), tanpa state di server
  adminAuth.js        cek username/password admin
  body.js              parser body (urlencoded + multipart/form-data), tanpa dependency luar
  router.js            router kecil (method + path dengan :param)
  orderEmail.js         susun & kirim email notifikasi pesanan baru lewat Resend API
  csvExport.js           bangun file CSV daftar pesanan harian
  utils.js               format Rupiah, escape HTML, format tanggal Indonesia, dst.
  views/                 semua tampilan HTML (server-rendered, tanpa framework front-end)
schema.sql              jalankan ini sekali di SQL Editor Neon
vercel.json             aturan rewrite: semua path → api/index.js
.env.example             daftar environment variable yang dibutuhkan
```

Dua dependency npm dipakai: `@neondatabase/serverless` (driver Postgres
resmi Neon, lewat HTTP — cocok untuk fungsi serverless karena tidak perlu
koneksi yang menyala terus) dan `@vercel/blob` (SDK resmi Vercel untuk
Blob storage). Selebihnya tetap ditulis dengan modul bawaan Node.js
(`http`, `crypto`, `net`/`tls`, `fetch`), supaya tetap minim dependency.

## Keamanan yang sudah diperhatikan

- Semua input pelanggan/admin di-escape sebelum ditulis ke HTML (mencegah XSS) —
  dites langsung dengan payload `<script>` di form nama, catatan, dsb.
- `DATABASE_URL` (Neon) dan token Vercel Blob cuma dipakai di server, tidak
  pernah dikirim ke browser.
- Sesi admin adalah cookie yang ditandatangani (HMAC-SHA256) dan kedaluwarsa
  otomatis setelah 3 hari — tidak bisa dipalsukan tanpa tahu `ADMIN_SESSION_SECRET`.
  **Wajib** isi `ADMIN_SESSION_SECRET` dengan teks acak yang panjang (`openssl rand -hex 32`).
  Kalau variabel ini kosong, aplikasi akan gagal (sengaja, demi keamanan) — bukan bug.
  Bukti transfer disimpan di Vercel Blob store **privat**; hanya bisa dilihat lewat
  signed URL berumur pendek (1 jam) yang dibuat server saat admin membuka
  halaman detail pesanan — tidak ada URL publik permanen ke bukti transfer siapa pun.
- Perhitungan harga & stok pesanan divalidasi ulang di database (fungsi
  `create_order` di `schema.sql`) — bukan cuma dipercaya dari input browser —
  dan menggunakan penguncian baris (`SELECT ... FOR UPDATE`) supaya dua
  pembeli tidak bisa "menghabiskan" stok yang sama secara bersamaan.

## Yang sudah dites (tanpa akun Neon/Vercel asli)

Karena lingkungan pengembangan ini tidak punya akses ke Neon/Vercel
sungguhan, pengujian dilakukan dengan menjalankan `api/index.js` langsung
memakai modul database/storage/email tiruan (mock), mencakup:

- Semua route storefront & admin merespons dengan status yang benar (200/302/404/401).
- Keranjang belanja via cookie: tambah, ubah jumlah, hapus, hitung total — benar.
- Alur checkout penuh (multipart form + upload file) sampai ke halaman sukses,
  termasuk pesanan tercatat dan email "terkirim" (lewat mock).
- Validasi stok sebelum checkout (produk stok 0 langsung ditolak dengan pesan yang jelas).
- Pesan error dari fungsi database (`create_order`) ditampilkan bersih ke
  pembeli, bukan pesan error mentah.
- Login admin: kredensial salah ditolak (401), kredensial benar memberi cookie
  sesi yang valid; route admin menolak akses tanpa cookie yang valid.
- Cookie sesi admin: tandatangan HMAC valid diterima, token yang diutak-atik/
  kedaluwarsa/salah kunci ditolak.
- Download CSV pesanan harian: format, escaping (koma/kutip/baris baru), dan BOM UTF-8 benar.
- Escaping XSS pada seluruh halaman yang menampilkan input pengguna (checkout,
  halaman sukses, detail pesanan admin, form produk) — dites dengan payload `<script>`.
- Urutan route diperiksa supaya path statis seperti `/admin/pesanan/unduh`
  tidak "tertangkap" duluan oleh pola `/admin/pesanan/:id`.

Yang **belum** dites (butuh akun asli): koneksi sungguhan ke Neon (lewat
`@neondatabase/serverless`) & Vercel Blob, kirim email sungguhan lewat
Resend dari lingkungan Vercel, dan perilaku Vercel yang sebenarnya soal
timeout/pembekuan fungsi.
