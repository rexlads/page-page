# 🚀 Panduan Deploy page-page di Website-mu

`page-page` adalah aplikasi **Node.js** (Express + SQLite). Ia perlu host yang bisa
menjalankan proses Node terus-menerus — **VPS sangat direkomendasikan**. Shared
hosting biasa (HTML/PHP saja) **tidak cukup**.

Karena halaman biolink memakai URL root (`namadomain.com/slug`) dan short link juga
(`namadomain.com/kode`), cara paling rapi adalah menaruhnya di **domain atau
subdomain sendiri**, mis. `bio.websiteku.com` atau `link.websiteku.com`.

> 💡 **Penting untuk cloaking:** taruh di belakang **Cloudflare** agar header
> `CF-IPCountry` terisi → deteksi negara jadi akurat. Tanpa Cloudflare, sistem
> tetap jalan memakai GeoIP offline (akurasi sedikit lebih rendah).

Daftar isi:
- [A. Cara tercepat — VPS + Caddy (auto-HTTPS)](#a-cara-tercepat--vps--caddy)
- [B. VPS + Nginx + Certbot](#b-vps--nginx--certbot)
- [C. Platform instan (Railway / Render)](#c-platform-instan-railway--render)
- [D. Pasang di subdomain website yang sudah ada](#d-pasang-di-subdomain-website-yang-sudah-ada)
- [E. Setup Cloudflare (disarankan)](#e-setup-cloudflare)
- [F. Update, backup, & troubleshooting](#f-update-backup--troubleshooting)

---

## A. Cara tercepat — VPS + Caddy

Cocok untuk Ubuntu/Debian VPS. Caddy mengurus **HTTPS otomatis** tanpa konfigurasi
sertifikat manual.

### 1) Arahkan domain ke VPS
Di pengaturan DNS domainmu, buat **A record**:
```
bio.websiteku.com   ->   <IP_VPS_kamu>
```

### 2) Install Node.js 18+ dan Git
```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # pastikan v18+ / v20+
```

### 3) Ambil kode & install
```bash
cd /var/www
git clone <URL_REPO_KAMU> page-page
cd page-page
npm install --omit=dev
cp .env.example .env
nano .env
```
Isi `.env`:
```env
PORT=3000
BASE_URL=https://bio.websiteku.com
JWT_SECRET=<string-acak-panjang>          # WAJIB diganti
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<password-kuat>
DATA_DIR=./data
```
Buat JWT_SECRET acak: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 4) Jalankan terus-menerus dengan PM2
```bash
sudo npm install -g pm2
pm2 start server.js --name page-page
pm2 save
pm2 startup        # jalankan perintah yang ditampilkan agar auto-start saat reboot
```

### 5) Pasang Caddy sebagai reverse proxy + HTTPS
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```
Edit `/etc/caddy/Caddyfile`:
```caddy
bio.websiteku.com {
    reverse_proxy localhost:3000
}
```
Lalu:
```bash
sudo systemctl reload caddy
```
Selesai! Buka **https://bio.websiteku.com/panel** dan login. 🎉

---

## B. VPS + Nginx + Certbot

Kalau kamu sudah memakai Nginx.

Lakukan **langkah 1–4 dari bagian A** (DNS, Node, kode, PM2). Lalu:

### 5) Konfigurasi Nginx
Buat `/etc/nginx/sites-available/page-page`:
```nginx
server {
    listen 80;
    server_name bio.websiteku.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # WAJIB untuk GeoIP
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktifkan + HTTPS gratis:
```bash
sudo ln -s /etc/nginx/sites-available/page-page /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bio.websiteku.com
```
Certbot otomatis menambah konfigurasi SSL dan memperbarui sertifikat.

> ⚠️ Header `X-Forwarded-For` penting agar IP asli pengunjung terbaca (untuk
> deteksi negara/VPN/bot). App sudah mengaktifkan `trust proxy`.

---

## C. Platform instan (Railway / Render)

Tanpa atur server, tapi **perhatikan penyimpanan**: SQLite & uploads ada di folder
`data/`. Di platform yang filesystem-nya *ephemeral*, data bisa hilang saat re-deploy
— **wajib pasang Persistent Disk/Volume** yang di-mount ke `data/`.

Langkah umum:
1. Push kode ke GitHub.
2. Buat service baru dari repo tersebut.
3. **Build command:** `npm install` — **Start command:** `node server.js`.
4. Tambah **Volume** dan mount ke path `data` (atau set `DATA_DIR` ke path volume).
5. Set Environment Variables: `BASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`,
   `ADMIN_PASSWORD`, `PORT` (ikuti yang diberikan platform).
6. Arahkan domainmu (CNAME) ke domain yang diberikan platform.

> Jika tidak bisa pasang volume, andalkan fitur **Export** rutin (lihat bagian F)
> dan **Import** setelah re-deploy agar data tidak hilang.

---

## D. Pasang di subdomain website yang sudah ada

Kamu sudah punya `websiteku.com` (mis. WordPress) dan ingin biolink di
`bio.websiteku.com` pada server yang sama.

1. Jalankan page-page di port lokal (mis. 3000) via PM2 (langkah A.1–A.4).
2. Buat **A record** `bio` → IP server (atau via Cloudflare, lihat E).
3. Tambah server block reverse proxy **khusus subdomain** itu (Nginx contoh B, atau
   Caddy contoh A). Website utamamu tidak terganggu karena dipisah per `server_name`.

> Tidak disarankan menaruh di sub-path (`websiteku.com/bio`) karena rute biolink &
> short link memakai root path. Subdomain jauh lebih bersih.

---

## E. Setup Cloudflare

Sangat disarankan untuk cloaking yang akurat + proteksi.

1. Tambahkan domainmu ke Cloudflare, ganti nameserver sesuai instruksi mereka.
2. Buat DNS record untuk subdomain (mis. `bio`) → IP VPS, status **Proxied**
   (awan oranye ☁️).
3. SSL/TLS mode: **Full** (atau Full (strict) jika sertifikat origin valid).
4. Selesai — header `CF-IPCountry` otomatis terkirim ke app, dan deteksi negara
   memakai data Cloudflare.

> Setelah pakai Cloudflare, IP pengunjung datang lewat header. App sudah membaca
> `CF-IPCountry` lebih dulu, lalu `X-Forwarded-For`. Pastikan reverse proxy tetap
> meneruskan `X-Forwarded-For`.

---

## F. Update, backup & troubleshooting

### Update ke versi terbaru
```bash
cd /var/www/page-page
git pull
npm install --omit=dev
pm2 restart page-page
```

### Backup otomatis (tanpa GitHub)
Export membungkus **database + semua uploads** jadi satu `.zip`.
```bash
cd /var/www/page-page
npm run export                       # -> ./backups/page-page-backup-<tanggal>.zip
```
Jadwalkan harian via cron (`crontab -e`):
```cron
0 3 * * * cd /var/www/page-page && /usr/bin/node scripts/export.js >> /var/log/pp-backup.log 2>&1
```
Restore di server mana pun:
```bash
node scripts/import.js backups/page-page-backup-2026-01-01.zip
pm2 restart page-page
```
Atau pakai tombol **Export / Import** di panel.

### Cek status & log
```bash
pm2 status
pm2 logs page-page          # lihat log real-time
curl -I https://bio.websiteku.com/health
```

### Masalah umum
| Gejala | Penyebab & solusi |
|---|---|
| Negara selalu `XX` / cloaking tak jalan | Reverse proxy tidak meneruskan `X-Forwarded-For`, atau belum pakai Cloudflare. Cek konfigurasi proxy. |
| Tidak bisa diakses dari luar | Port 80/443 ditutup firewall: `sudo ufw allow 80,443/tcp`. Pastikan DNS sudah menunjuk ke IP benar. |
| Data hilang setelah re-deploy (PaaS) | Belum pasang persistent volume ke `data/`. Lihat bagian C. |
| Lupa password admin | Hentikan app, hapus baris admin di settings, atau set ulang via DB. Cara cepat: `node -e "const{setSetting}=require('./src/db');const b=require('bcryptjs');setSetting('admin_password',b.hashSync('PasswordBaru',10));"` lalu restart. |
| Port 3000 dipakai | Ganti `PORT` di `.env` dan `pm2 restart page-page`. |

### Keamanan
- Ganti `JWT_SECRET` dan password admin sebelum live.
- Jangan commit file `.env` (sudah masuk `.gitignore`).
- Gunakan HTTPS (Caddy/Certbot/Cloudflare) — wajib agar cookie login aman.
