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
- [G. Setup cPanel/WHM + AlmaLinux + Cloudflare (langkah spesifik)](#g-setup-cpanelwhm--almalinux--cloudflare)
- [H. Tanpa SSH — cPanel "Setup Node.js App" (paling mudah)](#h-tanpa-ssh--cpanel-setup-nodejs-app)

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

---

## G. Setup cPanel/WHM + AlmaLinux + Cloudflare

Panduan persis untuk: **VPS AlmaLinux, ada WHM/cPanel, sudah pakai Cloudflare**.
Karena cPanel sudah memakai port 80/443 (Apache), kita jalankan Node di port lokal
**3000** lalu Apache mem-proxy ke sana. Contoh domain: `mikirdongkids.vip`.

> Jalankan perintah SSH sebagai **root**. Ganti `USER` dengan username akun cPanel
> pemilik domain, dan sesuaikan path `/home/USER/...`.

### 1) DNS di Cloudflare
- Buat **A record**: `mikirdongkids.vip` → `<IP_VPS>`, status **Proxied** (☁️ oranye).
  (Mau pakai subdomain? buat `bio` → IP, lalu pakai `bio.mikirdongkids.vip`.)
- **SSL/TLS → Overview**: pilih **Full** (atau **Full (strict)** jika nanti pasang
  Origin Certificate / AutoSSL).

### 2) Pastikan domain ada di cPanel
Di WHM, pastikan ada akun cPanel untuk `mikirdongkids.vip` (WHM → *Create a New
Account*). Docroot-nya biasanya `/home/USER/public_html`.

### 3) Install Node.js 20 + build tools (AlmaLinux pakai dnf)
```bash
sudo dnf install -y gcc-c++ make python3 git
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v   # v20.x
```

### 4) Ambil kode (taruh di LUAR public_html agar tidak bisa diakses publik)
```bash
mkdir -p /home/USER/apps && cd /home/USER/apps
git clone <URL_REPO_KAMU> page-page
cd page-page
npm install --omit=dev
cp .env.example .env
nano .env
```
Isi `.env`:
```env
PORT=3000
BASE_URL=https://mikirdongkids.vip
JWT_SECRET=<hasil-perintah-di-bawah>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<password-kuat>
DATA_DIR=./data
```
Buat secret acak:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Samakan kepemilikan file ke user cPanel:
```bash
chown -R USER:USER /home/USER/apps/page-page
```

### 5) Jalankan permanen dengan PM2
```bash
sudo npm install -g pm2
cd /home/USER/apps/page-page
pm2 start server.js --name page-page
pm2 save
pm2 startup systemd     # jalankan perintah yang ditampilkan agar auto-start saat boot
pm2 status              # pastikan "online"
curl -s http://127.0.0.1:3000/health   # harus {"ok":true}
```

### 6) ⚠️ Buka izin SELinux (WAJIB di AlmaLinux)
Tanpa ini, Apache **tidak boleh** menghubungi Node dan proxy akan error 503:
```bash
sudo setsebool -P httpd_can_network_connect 1
```

### 7) Pastikan mod_proxy aktif (EasyApache 4)
WHM → **EasyApache 4** → *Customize* → **Apache Modules** → pastikan `mod_proxy` dan
`mod_proxy_http` ter-centang (biasanya sudah). Provision bila belum.

### 8) Reverse proxy Apache → Node

**Cara cepat (.htaccess)** — buat `/home/USER/public_html/.htaccess`:
```apache
RewriteEngine On
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
```

**Cara tahan-rebuild (disarankan, via Include cPanel)** — buat dua file include:

`/etc/apache2/conf.d/userdata/std/2_4/USER/mikirdongkids_vip/proxy.conf`
dan `/etc/apache2/conf.d/userdata/ssl/2_4/USER/mikirdongkids_vip/proxy.conf`,
keduanya berisi:
```apache
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/
RequestHeader set X-Forwarded-Proto "https"
```
Lalu terapkan:
```bash
sudo mkdir -p /etc/apache2/conf.d/userdata/std/2_4/USER/mikirdongkids_vip
sudo mkdir -p /etc/apache2/conf.d/userdata/ssl/2_4/USER/mikirdongkids_vip
# (buat kedua file proxy.conf di atas)
sudo /scripts/ensure_vhost_includes --user=USER
sudo /scripts/restartsrv_httpd
```

### 9) Sertifikat HTTPS di origin
Karena Cloudflare mode **Full**, Apache butuh sertifikat:
- **AutoSSL**: WHM → *Manage AutoSSL* → jalankan untuk akun USER (Let's Encrypt), atau
- **Cloudflare Origin Certificate** (untuk Full strict): buat di Cloudflare → SSL/TLS →
  *Origin Server*, lalu pasang di cPanel → *SSL/TLS → Install Certificate*.

### 10) Tes
```
https://mikirdongkids.vip/health   ->  {"ok":true}
https://mikirdongkids.vip/panel    ->  halaman login
```
Login pakai kredensial dari `.env`, lalu segera ganti password di **Pengaturan**.

### Catatan cloaking di setup ini
- Cloudflare (Proxied) mengirim header **`CF-IPCountry`** → deteksi negara akurat
  (app membacanya lebih dulu). Tidak perlu konfigurasi tambahan.
- `ProxyPreserveHost On` + header diteruskan Apache → `BASE_URL`, IP asli
  (`X-Forwarded-For`), dan country terbaca dengan benar untuk cloaking/anti-bot.
- IP publik 3000 **tidak** perlu dibuka di firewall (CSF) — cukup diakses lokal oleh
  Apache.

### Update di cPanel/WHM
```bash
cd /home/USER/apps/page-page
git pull && npm install --omit=dev
pm2 restart page-page
```

---

## H. Tanpa SSH — cPanel "Setup Node.js App"

Cara paling mudah: semua lewat panel, **tanpa terminal/SSH**. Memakai fitur cPanel
**Setup Node.js App** (Application Manager / Passenger). App ini sudah kompatibel —
Passenger otomatis menangani port, jadi tidak perlu mengubah kode.

> **Cek dulu:** login cPanel → cari ikon **"Setup Node.js App"** (grup *Software*).
> - Jika ada → lanjut langkah 1.
> - Jika tidak ada → aktifkan sekali lewat WHM (tetap tanpa command line): **WHM →
>   EasyApache 4 → Customize → Additional Packages**, centang **`ea-ruby`/Passenger
>   (mod_passenger)**, lalu **Provision**. Setelah itu ikon akan muncul di cPanel.

### 1) Upload kode lewat File Manager
1. cPanel → **File Manager** → masuk `/home/USER`.
2. Buat folder **`page-page`**.
3. Masuk folder itu → **Upload** → pilih `page-page-deploy.zip`.
4. Klik kanan zip → **Extract** (pastikan `server.js`, `src/`, `public/` ada langsung
   di dalam `/home/USER/page-page/`). Hapus zip-nya.

### 2) Buat aplikasi Node
cPanel → **Setup Node.js App** → **Create Application**:
- **Node.js version:** pilih versi terbaru (mis. 20.x).
- **Application mode:** **Production**.
- **Application root:** `page-page` (folder tadi).
- **Application URL:** pilih domain **mikirdongkids.vip** dan biarkan path **kosong**
  (artinya app menempati root domain).
- **Application startup file:** `server.js`.

Klik **Create**.

### 3) Isi Environment Variables (ganti perlu .env)
Masih di halaman aplikasi, bagian **Detected configuration / Environment variables**
→ **Add Variable**, tambahkan:

| Name | Value |
|---|---|
| `BASE_URL` | `https://mikirdongkids.vip` |
| `JWT_SECRET` | string acak panjang (mis. ketik 50+ karakter campuran) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | password kuat pilihanmu |

(`PORT` tidak perlu — Passenger mengaturnya sendiri. `DATA_DIR` default `./data`
sudah cukup dan datanya persisten di folder aplikasi.)

### 4) Install dependency & jalankan (semua tombol)
1. Klik **Run NPM Install** — membaca `package.json` dan memasang semua dependency
   (termasuk `better-sqlite3`; biasanya pakai binari prebuilt, tanpa kompilasi).
2. Klik **Restart** (atau Start).
3. Status harus **running/started**.

> Jika **Run NPM Install** gagal pada `better-sqlite3` (butuh build tools), itu satu-
> satunya kemungkinan perlu SSH sekali: `dnf install -y gcc-c++ make python3` lalu
> klik Run NPM Install lagi. Di sebagian besar server, prebuilt langsung berhasil.

### 5) HTTPS + Cloudflare
- Cloudflare: A record `mikirdongkids.vip → IP_VPS` **Proxied** (☁️), SSL/TLS **Full**.
- cPanel → **SSL/TLS Status** → **Run AutoSSL** untuk domain (atau pasang Cloudflare
  Origin Certificate untuk Full strict).

### 6) Tes
- `https://mikirdongkids.vip/health` → `{"ok":true}`
- `https://mikirdongkids.vip/panel` → login, lalu ganti password di **Pengaturan**.

### Update versi (tanpa SSH)
1. File Manager → upload `page-page-deploy.zip` versi baru ke `/home/USER/page-page`
   → **Extract** (timpa). 
2. Setup Node.js App → **Run NPM Install** → **Restart**.

> Catatan: jangan upload folder `data/` dari mana pun saat update — biarkan data di
> server. Untuk pindah/backup data, pakai tombol **Export/Import** di panel.

### Kelebihan & kekurangan dibanding cara G (PM2)
- ✅ Tanpa SSH, auto-restart, auto-reverse-proxy, kelola dari panel.
- ✅ Tidak perlu setbool SELinux / .htaccess manual (Passenger mengurusnya).
- ⚠️ Bergantung pada Passenger/Node Selector tersedia di server.
- ⚠️ Jika native module butuh kompilasi, mungkin perlu sekali install build tools.
