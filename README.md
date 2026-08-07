# Pamantau

Monitor topologi jaringan langsung (PHP + vanilla JS).

## Versi

Sumber versi: `version.json` (saat ini **1.7.2**).

## Update dari GitHub (seperti FO-Simulator)

1. Bump `version.json`
2. Jalankan `scripts/package-release.ps1`
3. Commit + tag `vX.Y.Z` + buat GitHub Release
4. Unggah `pamantau-dist.zip` ke release
5. Di aplikasi: **Pengaturan → Update → Cek update / Pasang update**

Server Linux membutuhkan PHP `exec` + `bash` untuk `update.php` / `update.sh`. Folder `database/` dan file topology `*.json` di root **dipertahankan** saat update.

## Save & toast v1.7.2

- Toast notifikasi tampil 5 detik.
- Pesan Open lebih jelas bila file JSON kosong/rusak.
- Simpan / Simpan sebagai: jika browser memblokir `createWritable`, otomatis unduh file JSON.

## Auth, screenshot & canvas v1.7.0

- Lupa Password memakai recovery key `database/app.key` (bisa reset username + password).
- Tema Sand dihapus; hanya Light dan Dark.
- Sakelar Background digabung ke **Aktifkan screenshot terjadwal**; cron root dipasang/dihapus otomatis (WSL via `cli/cronctl.sh`).
- Interval screenshot minimal 1 menit.
- Worker headless di WSL memakai Chrome/Edge Windows di `/mnt/c/...`.
- Ukuran teks label perangkat di canvas diperbesar.

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
