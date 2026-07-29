# Pamantau

Monitor topologi jaringan langsung (PHP + vanilla JS).

## Versi

Sumber versi: `version.json` (saat ini **1.2.5**).

## Update dari GitHub (seperti FO-Simulator)

1. Bump `version.json`
2. Commit + tag `vX.Y.Z` + buat GitHub Release
3. Workflow `.github/workflows/release-dist.yml` mengunggah `pamantau-dist.zip`
4. Di aplikasi: **Pengaturan → Update → Cek update / Pasang update**

Server Linux membutuhkan PHP `exec` + `bash` untuk `update.php` / `update.sh`. Folder `database/` dan file topology `*.json` di root **dipertahankan** saat update.
