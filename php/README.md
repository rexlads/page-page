# page-page (versi PHP) — tanpa npm / Node

Versi PHP murni dari page-page. **Tidak butuh npm, Node, atau Composer.** Cukup PHP
7.4+ dengan ekstensi `pdo_sqlite` (dan `zip` untuk export/import) — tersedia default
di hampir semua hosting cPanel. Fitur sama persis dengan versi Node, termasuk
**cloaking canggih**, pixel (Meta/TikTok/GA4), link shortener, analytics bot, dan
export/import. Database & format `.zip` kompatibel dengan versi Node.

## Pasang di cPanel (tanpa SSH)

1. **cPanel → File Manager** → masuk **`public_html`** (atau docroot subdomain).
2. **Upload** `page-page-php.zip`, lalu klik kanan → **Extract** sampai `index.php`
   berada langsung di dalam `public_html/`.
3. Buka domainmu — selesai. Panel ada di **`https://domainmu/panel/`**.
   - Login awal: **admin / admin123** → segera ganti di menu **Pengaturan**.

> Tidak ada konfigurasi wajib: `BASE_URL` dideteksi otomatis dari domain, dan
> `JWT_SECRET` dibuat acak saat pertama jalan. Semua data ada di folder `data/`
> (otomatis dibuat & terlindungi), file upload di `uploads/`.

### Syarat
- **PHP 7.4+** (8.x disarankan) dengan ekstensi **`pdo_sqlite`** aktif.
  cPanel → *Select PHP Version* → Extensions → centang `pdo_sqlite`, `sqlite3`, `zip`.
- **mod_rewrite** aktif (default di cPanel) agar `.htaccess` routing jalan.
- Folder app **bisa ditulis** PHP (untuk `data/` & `uploads/`) — default di cPanel.

### Cloaking & Cloudflare
Karena pakai Cloudflare, header `CF-IPCountry` otomatis terbaca → cloaking
per-negara akurat tanpa setup tambahan. IP asli diambil dari `CF-Connecting-IP`.

## Catatan
- Backup: tombol **Export** di panel mengunduh `data/` + `uploads/` sebagai `.zip`.
  Pindah/restore: tombol **Import**. Tidak bergantung GitHub.
- QR code dirender di browser panel (butuh internet saat membuka modal QR).
- Untuk pindah dari versi Node ke PHP (atau sebaliknya): cukup **Export** di satu
  sisi lalu **Import** di sisi lain — skema & format zip-nya sama.
