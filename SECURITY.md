# Security Notes — SEAPEDIA

## Password Hashing

Password tidak disimpan dalam bentuk plain text. Server menggunakan `bcryptjs` dengan salt rounds 10.

## Session and Token

Authentication menggunakan JWT Bearer token. Token berisi `userId` dan `activeRole`, serta memiliki expiration default 6 jam (`TOKEN_EXPIRES_IN=6h`). Logout pada implementasi JWT stateless dilakukan dengan menghapus token dari client. Untuk production, implementasi blacklist/refresh-token rotation dapat ditambahkan.

## Role-Based Access Control

Semua endpoint privat memakai middleware:

- `authRequired`
- `requireActiveRole("Buyer" | "Seller" | "Driver")`
- `requireAdmin`

Backend tidak mempercayai role yang muncul di UI. Active role harus ada di JWT dan harus dimiliki oleh user. User multi-role hanya dapat menjalankan action yang sesuai active role saat itu.

## Ownership Checks

- Seller hanya dapat mengelola store dan produk miliknya.
- Seller hanya dapat memproses order dari store miliknya.
- Buyer hanya dapat mengakses wallet, cart, address, dan order miliknya.
- Driver hanya dapat menyelesaikan job yang sudah ia ambil.
- Admin-only endpoints tidak dapat diakses non-admin.

## Input Validation

Server melakukan validasi untuk:

- email,
- phone number,
- rating 1 sampai 5,
- quantity integer,
- price integer,
- stock integer,
- discount amount,
- voucher remaining usage,
- delivery method,
- discount expiry date.

Invalid input ditolak dengan response 400/403/409 yang jelas.

## XSS Prevention

Public reviews dan field teks lain dibersihkan dari control characters di backend. Frontend tidak memasukkan konten dari user secara mentah tanpa escaping. Semua rendering konten user melewati fungsi `escapeHTML`, sehingga payload seperti:

```html
<script>alert(1)</script>
```

ditampilkan sebagai teks, bukan dieksekusi.

## SQL Injection Prevention

Project ini memakai file-based JSON datastore dan tidak menyusun SQL query dinamis. Karena tidak ada interpreter SQL, payload SQL-like pada login/search/review/checkout tidak dapat mengubah struktur database. Input tetap divalidasi dan diproses sebagai string biasa.

