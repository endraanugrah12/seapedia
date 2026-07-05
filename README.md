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
3. Tambah atau hapus produk.
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
- PPN dihitung 12% dari subtotal setelah diskon, sebelum biaya pengiriman.
- Satu checkout hanya menerima satu kode diskon.
- Voucher memiliki batas penggunaan dan tanggal kedaluwarsa.
- Promo memiliki tanggal kedaluwarsa.
- Driver mendapat earning sebesar 80% dari delivery fee untuk pengiriman yang selesai.
- Order yang melewati SLA dapat diproses sebagai `Dikembalikan` dan dana Buyer dikembalikan ke wallet.

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
