# Pamantau

Monitor topologi jaringan langsung (PHP + vanilla JS).

## Install Debian/Ubuntu (Apache + www-data)

Dari folder aplikasi di server:

```bash
sudo chmod +x install.sh
sudo ./install.sh --base-url=https://127.0.0.1/PAMANTAU/
```

Skrip akan:
- memasang PHP, Apache, Chromium, ping/traceroute, cron
- `chown` seluruh app ke **www-data**
- memindahkan cron worker dari **root** ke **www-data**
- menulis `database/runtime-base-url.json` untuk renderer headless
- menjalankan smoke-check worker sekali

Perbaikan cepat (tanpa apt):

```bash
sudo ./install.sh --repair --base-url=https://127.0.0.1/PAMANTAU/
```

Cron harus milik `www-data`, bukan root (kalau root, file job headless jadi tidak bisa di-update Apache).

## Versi

Sumber versi: `version.json` (saat ini **1.6.3**).

## Update dari GitHub (seperti FO-Simulator)

1. Bump `version.json`
2. Jalankan `scripts/package-release.ps1`
3. Commit + tag `vX.Y.Z` + buat GitHub Release
4. Unggah `pamantau-dist.zip` ke release
5. Di aplikasi: **Pengaturan → Update → Cek update / Pasang update**

Server Linux membutuhkan PHP `exec` + `bash` untuk `update.php` / `update.sh`. Folder `database/` dan file topology `*.json` di root **dipertahankan** saat update.

## Headless HTTP fallback v1.6.3

- Renderer headless otomatis mencoba `http://127.0.0.1/...` sebelum HTTPS `:443` (vhost SSL lokal sering gagal).
- Mode headless tidak lagi redirect ke `login.php` saat API 401.
- URL loopback yang berhasil di-probe disimpan ke `runtime-base-url.json`.

## Headless screenshot & install v1.6.2

- `install.sh` Debian/Ubuntu: paket PHP/Apache/Chromium, ownership www-data, cron worker di **www-data** (bukan root).
- Chromium headless menunggu upload canvas (tanpa `--dump-dom` yang keluar terlalu cepat).
- Worker CLI drop otomatis root → www-data jika cron masih di root.
- Fallback timer untuk `requestAnimationFrame` / fonts di mode headless.
- Menerima `output.bin` valid meski update status `job.json` gagal (ownership).

## Screenshot Linux & UI v1.6.1

- Interval screenshot terjadwal minimal **1 menit**.
- Label perangkat di canvas **18px**.
- “Terakhir Dikirim” format WIB mudah dibaca, teks hijau tebal.
- Headless Chromium untuk Debian/Ubuntu server (env D-Bus, path `/usr/bin/chromium`, budget render lebih panjang).
- Menyimpan screenshot ON ikut mengaktifkan sakelar Background agar worker CLI tidak di-skip.

## Mobile zoom & language v1.6.0

- Pinch dua jari pada perangkat mobile memperbesar, memperkecil, dan menggeser
  canvas tanpa menyeret perangkat.
- Seluruh kunci UI Indonesia dan Inggris disinkronkan, termasuk teks dinamis,
  laporan, clipboard, scan, polling, dan proses update.
- Data persentase Online/Offline yang kosong ditampilkan sebagai `-`.
- Distribusi kini web-only; folder dan paket server portable tidak disertakan.

## Reports, notification & canvas v1.5.0

- Laporan baru **Port** merangkum perangkat, tipe, IP, dan port terbuka.
- Laporan **Individu** menampilkan persentase Online/Offline per tanggal untuk
  satu perangkat dan rentang waktu yang dipilih.
- Istilah status Telegram diseragamkan menjadi Online/Offline.
- Pilihan snap otomatis disembunyikan dan dinonaktifkan saat grid canvas mati.
- Klik kanan perangkat diprioritaskan terhadap kabel yang bertumpuk.
- Tampilan awal mobile menyembunyikan kontrol zoom dan bar komponen.

- File Save/Open hanya berisi struktur topologi lokal; counter, statistik, dan
  riwayat polling tetap menjadi data otoritatif di database server.
- Berganti topologi tidak lagi menghapus riwayat. Counter dipulihkan kembali
  berdasarkan ID perangkat ketika topologi tersebut dibuka lagi.
- Pengaturan polling ping dan scan port otomatis dipisahkan beserta jadwal,
  timeout, dan batas paralelnya.
- Tampilan pengaturan dirapikan dan ikon komponen memakai outline luar putih
  serta hitam yang halus.

- Ping status berjalan setiap 30 detik secara default, timeout 500 ms, dengan
  3–5 percobaan per siklus.
- Scan port otomatis memiliki jadwal terpisah setiap 5 menit, timeout 350 ms,
  dan memproses 16–32 perangkat paralel (default 24).
- Service terakhir tetap tersimpan saat perangkat offline.
- Screenshot Telegram terjadwal menjalankan Chrome/Edge headless sendiri dan
  memakai fungsi render canvas yang sama dengan dashboard (tema, grid, ikon,
  label, koneksi, posisi, dan status). Setiap jadwal mengambil data terbaru;
  cache lama dan renderer server tidak dipakai sebagai fallback.
- Worker backend dapat dipanggil setiap 5 detik; setiap job mengatur intervalnya
  sendiri. Untuk cron Linux 30 detik, jalankan sekali pada detik 0 dan sekali
  lagi setelah `sleep 30`.
