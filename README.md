# Pamantau

Monitor topologi jaringan langsung (PHP + vanilla JS).

## Versi

Sumber versi: `version.json` (saat ini **1.3.0**).

## Update dari GitHub (seperti FO-Simulator)

1. Bump `version.json`
2. Commit + tag `vX.Y.Z` + buat GitHub Release
3. Workflow `.github/workflows/release-dist.yml` mengunggah `pamantau-dist.zip`
4. Di aplikasi: **Pengaturan → Update → Cek update / Pasang update**

Server Linux membutuhkan PHP `exec` + `bash` untuk `update.php` / `update.sh`. Folder `database/` dan file topology `*.json` di root **dipertahankan** saat update.

## Monitoring v1.3.0

- Ping status berjalan setiap 30 detik secara default, timeout 500 ms, dengan
  3–5 percobaan per siklus.
- Scan port otomatis memiliki jadwal terpisah setiap 5 menit, timeout 350 ms,
  dan memproses 16–32 perangkat paralel (default 24).
- Service terakhir tetap tersimpan saat perangkat offline.
- Worker backend dapat dipanggil setiap 5 detik; setiap job mengatur intervalnya
  sendiri. Untuk cron Linux 30 detik, jalankan sekali pada detik 0 dan sekali
  lagi setelah `sleep 30`.
