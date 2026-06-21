# page-page (versi PHP) — tanpa npm / Node

Versi PHP murni dari page-page. **Tidak butuh npm, Node, atau Composer.** Cukup PHP
7.4+ dengan ekstensi `pdo_sqlite` (dan `zip` untuk export/import) — tersedia default
di hampir semua hosting cPanel. Fitur sama persis dengan versi Node, termasuk
**cloaking canggih**, pixel (Meta/TikTok/GA4), link shortener, analytics bot, dan
export/import. Database & format `.zip` kompatibel dengan versi Node.

## Pasang di cPanel (tanpa SSH) — tinggal extract & jalan

1. Cari **Document Root** domainmu: cPanel → **Domains** (atau *Addon/Subdomains*).
   Setiap domain punya foldernya sendiri (mis. `/home/USER/mikirdongkids.vip`),
   **belum tentu `public_html`**.
2. **cPanel → File Manager** → masuk ke **folder Document Root** tersebut.
3. **Upload** `page-page-php.zip` → klik kanan → **Extract**. File langsung berada
   di tempat yang benar (`index.php`, `lib/`, `panel/`) — **tidak perlu dipindah**.
4. Buka domainmu — selesai. Panel ada di **`https://domainmu/panel/`**.
   - Login awal: **admin / admin123** → segera ganti di menu **Pengaturan**.

> **Bebas lokasi:** app otomatis menyesuaikan, baik dipasang di root domain maupun
> di subfolder (mis. `domain.com/promo/`). Tidak ada konfigurasi wajib — `BASE_URL`
> terdeteksi sendiri dan `JWT_SECRET` dibuat acak saat pertama jalan. Data di
> folder `data/` (otomatis & terlindungi), upload di `uploads/`.

### Cek kesehatan / diagnosa
Buka **`https://domainmu/health`** — menampilkan versi PHP & status ekstensi, mis:
`{"ok":true,"php":"8.x","pdo_sqlite":true,"zip":true,"data_writable":true}`.
Jika `pdo_sqlite` atau `zip` `false`, aktifkan di cPanel → *Select PHP Version →
Extensions*. Jika `data_writable` `false`, set permission folder app ke 755.

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
