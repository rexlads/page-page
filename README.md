# page-page

Platform **biolink** + **link shortener** yang bisa kamu hosting sendiri, lengkap
dengan **panel admin**, kustomisasi tombol yang banyak (termasuk **cloaking per
negara**), dan fitur **export/import seluruh domain** (file + database) dalam satu
file `.zip` — tidak bergantung pada GitHub.

Konsepnya mirip Linktree / bio.link / jagalink, tapi sepenuhnya milikmu.

---

## ✨ Fitur

- **Biolink pages** — buat halaman bio (`/namaku`) dengan avatar, judul, bio, dan
  banyak tombol.
- **Kustomisasi tombol** — teks, URL, ikon (emoji), warna tombol, warna teks, gaya
  (filled / outline / soft / pill), urutan drag-and-drop, aktif/nonaktif.
- **🛡️ Cloaking canggih** — gabungan beberapa aturan sekaligus (logika AND):
  per **negara** (allow/block), **anti-bot/crawler**, target **perangkat**
  (mobile/desktop), dan **referrer** (hanya/blokir sumber seperti facebook.com,
  tiktok.com). Pengunjung yang diblokir bisa dialihkan ke "safe page".
- **🤖 Deteksi bot + daftar IP bot** — bot dikenali dari user-agent, daftar IP/CIDR
  yang bisa kamu kelola, dan request tanpa user-agent. Klik bot tidak menambah
  statistik, dan analytics memisahkan **manusia vs bot**.
- **📈 Integrasi Pixel / Ads** — Meta (Facebook) Pixel, TikTok Pixel, Google
  Analytics (GA4), plus kode kustom (head/body) untuk pixel lain. Bisa **global**
  (semua page) maupun **per-page**. Event PageView + konversi saat tombol diklik.
- **✂️ Link shortener** — persingkat URL apa pun (`/promo`), dengan kode kustom
  atau acak, statistik klik, dan cloaking juga (plus URL fallback untuk visitor
  yang diblokir).
- **⏰ Penjadwalan tombol** — atur kapan tombol mulai & berhenti tampil (mis. untuk
  promo terbatas waktu).
- **🎨 Tema cantik** — preset siap pakai (midnight, aurora, sunset, candy, forest,
  mono, light), pilihan font (Inter/Poppins/Montserrat/Space Grotesk), warna aksen,
  efek kaca (glass) & animasi masuk tombol.
- **📱 Live preview** — pratinjau halaman publik dalam bingkai ponsel langsung di
  editor tombol.
- **🌍 Analytics per-negara** — page views, klik, jumlah yang diblokir cloaking,
  grafik harian, rincian per negara, dan top pages/links/tombol.
- **🔳 QR Code** — buat & unduh QR untuk setiap biolink page maupun short link.
- **💾 Export / Import total** — unduh seluruh data (database SQLite + semua file
  upload) sebagai satu `.zip`, dan restore di server mana pun. Lewat panel maupun
  terminal.
- **📊 Dashboard** — statistik views, klik tombol, klik link.
- **Panel admin** yang aman (login + password ter-hash), bisa dipakai kapan pun.

---

## 🚀 Instalasi

Butuh **Node.js 18+**.

```bash
git clone <repo-ini> page-page
cd page-page
npm install
cp .env.example .env          # lalu edit nilainya
npm start
```

Buka panel di **http://localhost:3000/panel** dan login dengan kredensial dari
`.env` (default `admin` / `admin123`).

> Ganti `JWT_SECRET` dan password admin sebelum dipakai publik!

### Konfigurasi `.env`

| Variabel | Keterangan |
|---|---|
| `PORT` | Port server (default 3000) |
| `BASE_URL` | URL publik, dipakai untuk membuat short link di panel |
| `JWT_SECRET` | Rahasia untuk token login — **wajib diganti** |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Kredensial admin saat pertama kali jalan |
| `DATA_DIR` | Lokasi database + uploads (default `./data`) — semua ini ikut ke-export |

---

## 📖 Tutorial Fitur

### 1. Membuat Biolink Page

1. Login ke `/panel`.
2. Menu **Biolink Pages → + Page Baru**.
3. Isi **Slug** (mis. `john`) → halamanmu jadi `http://domainmu/john`.
4. Isi judul, bio, avatar (boleh upload gambar atau tempel URL), warna background.
5. Centang **Published** agar tampil ke publik, lalu **Simpan**.

### 2. Kustomisasi Tombol

1. Di daftar page, klik **Edit Tombol**.
2. **+ Tambah Tombol**, lalu atur:
   - Teks tombol & URL tujuan
   - Ikon (emoji), gaya, warna tombol & teks
   - Aktif/nonaktif
3. **Seret** kartu tombol untuk mengubah urutan (tersimpan otomatis).
4. Klik **Simpan** pada tombol yang diubah.

### 3. 🌍 Cloaking (sembunyikan dari negara tertentu)

Setiap tombol punya bagian **Cloaking**:

- **Nonaktif** → tampil ke semua orang.
- **Hanya tampil ke negara berikut** (*allow*) → tombol hanya muncul untuk
  pengunjung dari negara yang kamu daftarkan.
- **Sembunyikan dari negara berikut** (*block*) → tombol disembunyikan dari
  negara yang kamu daftarkan.

Isi kolom negara dengan **kode ISO 2 huruf**, dipisah koma. Contoh: `ID, MY, SG`.

> Contoh: untuk menyembunyikan tombol dari pengunjung Amerika Serikat, pilih
> **block** dan isi `US`. Pengunjung dari US tidak akan melihat tombol itu sama
> sekali, dan link langsungnya pun ikut diblokir (anti-bypass).

**Cara deteksi negara:** server membaca header `CF-IPCountry` (jika di belakang
Cloudflare), atau melakukan lookup GeoIP offline dari IP pengunjung. Pastikan
`trust proxy` aktif (sudah default) agar IP asli terbaca di belakang reverse proxy.

#### 🛡️ Cloaking lanjutan

Selain negara, setiap tombol & short link punya **Cloaking lanjutan**. Semua aturan
yang aktif harus lolos (AND) agar item ditampilkan:

- **Bot / crawler** — pilih *Sembunyikan dari bot* untuk menyembunyikan dari mesin
  pencari, scraper, dan **peninjau iklan** (mis. `facebookexternalhit`). Klasik
  untuk menampilkan "money page" ke manusia dan "safe page" ke bot.
- **Perangkat** — tampilkan hanya di *mobile* atau *desktop*.
- **Referrer** — *Hanya dari sumber* (mis. `facebook.com, tiktok.com`) sangat
  berguna untuk trafik iklan; atau *Blokir sumber* tertentu.

Pada **short link**, isi **"safe page"** (URL fallback) agar bot / pengunjung yang
diblokir dialihkan ke sana alih-alih melihat 404.

#### 🤖 Deteksi bot & daftar IP bot

Bot dideteksi dari (1) pola **user-agent** (Googlebot, bingbot, facebookexternalhit,
TikTok, headless browser, curl, dll), (2) **daftar IP/CIDR** yang kamu kelola di
**Pengaturan → Daftar IP Bot** (sudah diisi range umum Google/Bing/Facebook, bisa
ditambah/hapus), dan (3) request **tanpa user-agent**.

Klik dari bot **tidak** menambah statistik klik, dan di menu **Analytics** trafik
dipisah **👤 Manusia vs 🤖 Bot**, lengkap dengan **Top IP Bot** dan log deteksi
bot terbaru (IP, negara, user-agent).

### 3a. 📈 Integrasi Pixel / Meta Ads / TikTok Ads

Pasang pixel untuk tracking konversi kampanye iklan:

- **Per page**: buka **Setelan** page → bagian *Tracking Pixel* → isi **Meta/Facebook
  Pixel ID**, **TikTok Pixel ID**, **GA4 ID**, atau kode kustom (head/body).
- **Global** (berlaku ke semua page): **Pengaturan → Pixel Global**.

Yang otomatis terjadi di halaman publik:
- `PageView` dikirim saat halaman dibuka (fbq/ttq/gtag).
- Saat tombol diklik, dikirim event konversi (`Lead` untuk Meta, `ClickButton`
  untuk TikTok, `select_content` untuk GA4) sebelum diarahkan ke tujuan.

> Pixel per-page menimpa nilai global yang sama; kode kustom global + page digabung.
> Tip: pakai cloaking *anti-bot* agar pixel/PageView tidak terpicu oleh crawler.

### 3b. ⏰ Penjadwalan tombol

Di editor tombol ada bagian **Jadwal tampil**:

- **Mulai tampil** — tombol baru muncul setelah waktu ini.
- **Berhenti tampil** — tombol otomatis hilang setelah waktu ini.

Kosongkan salah satu/keduanya untuk tanpa batas. Cocok untuk promo/event terbatas.
Sama seperti cloaking, link langsungnya pun ikut nonaktif di luar jadwal.

### 3c. 🎨 Tema & tampilan

Di **Setelan** page: pilih **preset tema** (klik swatch), atau atur sendiri warna
background (mendukung CSS gradient), warna teks, **warna aksen**, **font**, serta
nyalakan/matikan **efek kaca** dan **animasi masuk** tombol. Gunakan **Live Preview**
(bingkai ponsel di editor tombol) untuk melihat hasilnya secara langsung.

### 3d. 🔳 QR Code

Klik tombol **QR** pada page atau short link untuk menampilkan & **mengunduh** QR
code (PNG) — siap dicetak atau dibagikan.

### 4. ✂️ Link Shortener

1. Menu **Link Shortener → + Short Link**.
2. Isi **Kode** (mis. `promo`, atau kosongkan untuk kode acak) dan **URL Tujuan**.
3. Opsional: atur **Cloaking** + **URL fallback** (kemana visitor yang diblokir
   dialihkan).
4. Simpan → link siap dipakai: `http://domainmu/promo`. Klik **Salin**.

### 5. 💾 Export / Import seluruh domain

**Lewat panel** (menu **Export / Import**):

- **Export** → tombol *Download Backup (.zip)*. File berisi `app.db` (seluruh
  database) + folder `uploads` + `manifest.json`.
- **Import** → pilih file `.zip`, klik *Restore*. ⚠️ Ini **menimpa** semua data
  saat ini. Restore lewat panel berjalan langsung tanpa perlu restart server.

**Lewat terminal** (cocok untuk backup otomatis / pindah server):

```bash
# Export ke ./backups/page-page-backup-<tanggal>.zip
npm run export
# atau tentukan nama file:
node scripts/export.js /path/ke/backup-saya.zip

# Import / restore (HENTIKAN server dulu untuk hasil paling aman):
node scripts/import.js backups/page-page-backup-2026-01-01.zip
```

**Backup otomatis harian dengan cron:**

```cron
0 3 * * * cd /path/ke/page-page && /usr/bin/node scripts/export.js >> /var/log/pp-backup.log 2>&1
```

**Pindah ke server baru:** install seperti biasa, lalu `node scripts/import.js
backup.zip` — selesai. Semua page, tombol, short link, statistik, dan file upload
ikut berpindah. Tidak butuh GitHub atau layanan eksternal apa pun.

### 6. 🌍 Analytics

Menu **Analytics**: pilih rentang waktu (7/30/90/365 hari) untuk melihat page views,
klik tombol, klik short link, jumlah kunjungan yang **diblokir cloaking**, grafik
aktivitas harian, **rincian per negara**, serta daftar top pages/short links/tombol.
Data berasal dari log event internal (ikut ter-backup saat export).

### 7. Ganti password / judul situs

Menu **Pengaturan** → ubah judul situs, atau ganti password admin (butuh password
lama).

---

## 🏗️ Arsitektur

```
server.js              # entrypoint Express
src/
  config.js            # env + path + daftar slug terlarang
  db.js                # SQLite (better-sqlite3) + migrasi + seed admin
  auth.js              # login JWT (cookie httpOnly) + bcrypt
  geo.js               # deteksi negara + logika cloaking
  backup.js            # export/import (DB snapshot + uploads -> .zip)
  routes/
    admin.js           # REST API panel (terproteksi)
    public.js          # render biolink + redirect short link (cloaking diterapkan)
public/panel/          # panel admin (HTML/CSS/JS vanilla, tanpa build step)
scripts/
  export.js / import.js
data/                  # database + uploads (dibuat otomatis, gitignored)
```

**Kenapa SQLite?** Database hanya satu file, jadi "export semuanya" benar-benar
sesederhana membungkus satu file DB + folder uploads. Tidak ada server database
terpisah yang harus diurus saat pindah host.

---

## 🌐 Deploy produksi (ringkas)

1. Set `BASE_URL` ke domainmu dan `JWT_SECRET` ke string acak panjang.
2. Jalankan dengan process manager, mis. **pm2**: `pm2 start server.js --name page-page`.
3. Taruh di belakang reverse proxy (Nginx/Caddy) dengan HTTPS. Teruskan header
   `X-Forwarded-For` (dan idealnya pasang Cloudflare agar `CF-IPCountry` terisi).
4. Jadwalkan `npm run export` via cron untuk backup berkala.

---

## ⚠️ Catatan

- Deteksi GeoIP offline (`geoip-lite`) akurat di level negara, namun tidak 100%.
  Untuk akurasi terbaik, jalankan di belakang Cloudflare (header `CF-IPCountry`).
- Halaman biolink dikirim dengan `Cache-Control: no-store` karena isinya
  bergantung pada negara pengunjung.

## Lisensi

MIT.
