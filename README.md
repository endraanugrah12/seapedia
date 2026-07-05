# SEAPEDIA

SEAPEDIA adalah marketplace web untuk kebutuhan teknologi seperti keyboard, mouse, headset, dan produk pendukung kerja atau belajar. Aplikasi ini punya katalog publik, autentikasi pengguna, manajemen toko, cart, checkout, diskon, pengiriman, dan monitoring admin.

Project ini dibuat dengan backend Express dan frontend vanilla JavaScript. Data disimpan di file JSON agar mudah dijalankan lokal tanpa setup database tambahan.

## Fitur Utama

- Katalog produk publik dan halaman detail produk.
- Register, login, logout, dan pemilihan role aktif untuk akun dengan lebih dari satu role.
- Dashboard Buyer untuk wallet, alamat, cart, checkout, voucher/promo, dan riwayat pesanan.
- Dashboard Seller untuk mengelola toko, produk, dan pesanan masuk.
- Dashboard Driver untuk mengambil pengiriman dan menyelesaikan delivery job.
- Dashboard Admin untuk monitoring, membuat voucher/promo, dan simulasi overdue order.
- Review aplikasi dari pengunjung.
- Dokumentasi API dengan Swagger UI.

## Tech Stack

- Node.js
- Express
- JSON Web Token
- bcryptjs
- Swagger UI Express
- Vanilla HTML, CSS, dan JavaScript
- File-based JSON datastore

## Menjalankan Project

Install dependency:

```bash
npm install
```

Jalankan server:

```bash
npm start
```

Aplikasi akan berjalan di:

```text
http://localhost:3000
```

Dokumentasi API tersedia di:

```text
http://localhost:3000/api-docs
```

Reset data awal:

```bash
npm run reset-db
```

## Environment Variable

Project tetap bisa berjalan tanpa file `.env`, tetapi untuk deployment sebaiknya set nilai berikut:

```text
PORT=3000
JWT_SECRET=isi-dengan-secret-yang-aman
TOKEN_EXPIRES_IN=6h
```

## Akun Testing

Semua akun testing memakai password:

```text
password123
```

| Role | Email | Username |
|---|---|---|
| Admin | admin@seapedia.test | admin |
| Seller | seller@seapedia.test | seller |
| Buyer | buyer@seapedia.test | buyer |
| Driver | driver@seapedia.test | driver |
| Buyer + Seller + Driver | multi@seapedia.test | multi |

## Alur Singkat Penggunaan

### Pengunjung

1. Buka homepage.
2. Lihat katalog produk.
3. Buka detail produk.
4. Kirim review aplikasi jika ingin memberi feedback.

### Buyer

1. Login sebagai `buyer@seapedia.test`.
2. Buka katalog dan tambahkan produk ke cart.
3. Pastikan alamat pengiriman sudah tersedia.
4. Gunakan voucher `SEAHEMAT25K` atau promo `PROMO10` saat checkout.
5. Lihat status pesanan dari dashboard Buyer.

### Seller

1. Login sebagai `seller@seapedia.test`.
2. Kelola informasi toko.
3. Tambah, update, atau hapus produk.
4. Proses pesanan masuk agar siap dikirim.

### Driver

1. Login sebagai `driver@seapedia.test`.
2. Ambil delivery job yang tersedia.
3. Selesaikan pengiriman dari dashboard Driver.

### Admin

1. Login sebagai `admin@seapedia.test`.
2. Pantau data marketplace dari dashboard Admin.
3. Buat voucher atau promo.
4. Jalankan simulasi overdue order jika diperlukan.

## Aturan Bisnis

- Satu cart hanya boleh berisi produk dari satu toko.
- Jika Buyer mencoba menambah produk dari toko lain, backend menolak request dan UI meminta cart dikosongkan terlebih dahulu.
- Checkout menghitung subtotal produk, diskon, delivery fee, PPN 12%, dan final total.
- PPN dihitung 12% dari subtotal produk setelah diskon, sebelum biaya pengiriman.
- Satu checkout hanya menerima satu kode diskon: Voucher atau Promo.
- Voucher memiliki batas penggunaan dan tanggal kedaluwarsa.
- Promo memiliki tanggal kedaluwarsa.
- Driver mendapat earning sebesar 80% dari delivery fee untuk pengiriman yang selesai.
- SLA delivery: Instant 4 jam, Next Day 24 jam, Regular 72 jam.
- Order yang melewati SLA dapat diproses sebagai `Dikembalikan`.
- Overdue refund mengembalikan dana Buyer ke wallet, mencatat transaksi refund, mengembalikan stok produk, dan menandai delivery job sebagai returned.
- Order returned tidak dihitung sebagai Seller income karena laporan Seller hanya menjumlahkan order dengan status `Pesanan Selesai`.

## Fitur Aplikasi

### Guest, Review, dan Authentication

1. Buka homepage dan katalog tanpa login.
2. Buka detail produk dan pastikan tidak ada action checkout untuk guest.
3. Submit application review dari homepage.
4. Login atau register user baru.
5. Login sebagai `multi@seapedia.test`, pilih active role, lalu pastikan dashboard mengikuti role aktif.

### Seller

1. Login sebagai Seller.
2. Buat atau update store. Nama store harus unik.
3. Tambah produk, update harga/stok/deskripsi, lalu hapus produk bila diperlukan.
4. Pastikan produk Seller muncul di katalog publik.
5. Proses incoming order dari `Sedang Dikemas` ke `Menunggu Pengirim`.

### Buyer

1. Login sebagai Buyer.
2. Top-up wallet dan lihat transaction history.
3. Tambah alamat pengiriman.
4. Tambah produk ke cart, update quantity, dan coba tambah produk dari toko lain untuk melihat single-store validation.
5. Preview checkout dengan delivery method dan kode `SEAHEMAT25K` atau `PROMO10`.
6. Checkout dan lihat order history beserta status timeline.

### Driver

1. Login sebagai Driver.
2. Lihat available jobs yang sudah diproses Seller.
3. Ambil job untuk mengubah order menjadi `Sedang Dikirim`.
4. Selesaikan job untuk mengubah order menjadi `Pesanan Selesai`.
5. Lihat earning dan job history.

### Admin dan Overdue

1. Login sebagai Admin.
2. Pantau users, stores, products, orders, discounts, delivery jobs, dan overdue orders.
3. Buat Voucher atau Promo dari dashboard Admin.
4. Gunakan `Simulate Next Day` atau `Run Overdue Now` untuk memproses order yang melewati SLA.
5. Verifikasi order menjadi `Dikembalikan`, wallet Buyer menerima refund, status history bertambah, dan stock produk kembali.

## Security Notes

Ringkasan keamanan ada di [SECURITY.md](SECURITY.md). Implementasi utama:

- Password di-hash dengan `bcryptjs`.
- Authentication memakai JWT Bearer token dengan expiration default 6 jam.
- Logout menghapus token di client karena JWT bersifat stateless.
- Backend memverifikasi active role pada endpoint Seller, Buyer, Driver, dan Admin.
- Ownership check diterapkan untuk produk Seller, order Seller, wallet/cart/address/order Buyer, dan delivery job Driver.
- User-generated content dirender lewat `escapeHTML` agar payload XSS tampil sebagai teks.
- Input penting divalidasi sebelum disimpan, termasuk email, phone, rating, quantity, price, stock, discount amount, expiry date, dan delivery method.
- Project memakai JSON datastore, bukan SQL query dinamis, sehingga payload SQL-like diproses sebagai string biasa dan tidak dapat mengubah struktur database.

Test singkat keamanan:

1. Isi review comment dengan `<script>alert(1)</script>` dan pastikan tampil sebagai teks.
2. Coba akses endpoint role lain dengan token active role yang salah dan pastikan response `403`.
3. Coba update produk milik Seller lain dan pastikan ditolak.
4. Coba checkout dengan quantity/stock tidak valid dan pastikan ditolak.

## Struktur Folder

```text
seapedia/
├── data/
│   └── db.json
├── docs/
│   └── openapi.json
├── public/
│   ├── app.js
│   ├── index.html
│   ├── seapedia-logo.svg
│   ├── seapedia-mark.svg
│   └── style.css
├── src/
│   ├── db.js
│   ├── reset-db.js
│   └── server.js
├── package.json
├── README.md
└── SECURITY.md
```

## Deployment

Aplikasi ini membutuhkan runtime Node.js karena frontend dan API dijalankan dari server Express yang sama.

Konfigurasi umum:

```text
Build Command: npm install
Start Command: npm start
```

Pastikan `JWT_SECRET` diatur melalui environment variable pada platform deployment.

### Docker dan Traefik

Repo ini juga menyediakan `Dockerfile`, `docker-compose.yml`, dan `.env.example`. Untuk VPS dengan Traefik yang sudah berjalan di network eksternal, isi `.env` seperti berikut:

```text
PORT=3000
JWT_SECRET=isi-dengan-secret-yang-aman
TOKEN_EXPIRES_IN=6h
SEAPEDIA_HOST=seapedia.example.com
TRAEFIK_NETWORK=traefik
TRAEFIK_ENTRYPOINT=web
TRAEFIK_TLS=false
TRAEFIK_CERTRESOLVER=letsencrypt
```

Jika HTTPS sudah siap di Traefik, gunakan:

```text
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_TLS=true
```

Jalankan:

```bash
docker compose up -d --build
```

Deployment URL final perlu dicantumkan di dokumen `Seleksi - [Nama Lengkap].pdf` bersama tautan public repository.
