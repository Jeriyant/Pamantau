<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/network.php';

function expect_daily_report(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$rows = pamantau_daily_report_rows([
    '2026-07-30' => [
        'online_samples' => 9,
        'offline_samples' => 1,
        'poll_count' => 10,
    ],
], '2026-07-01', '2026-07-30');

expect_daily_report(count($rows) === 30, 'laporan harus berisi tepat 30 tanggal');
expect_daily_report($rows[0]['date'] === '2026-07-01', 'tanggal awal harus dipertahankan');
expect_daily_report(empty($rows[0]['has_data']), 'tanggal tanpa sampel harus tetap ditampilkan');
expect_daily_report($rows[29]['date'] === '2026-07-30', 'tanggal akhir harus dipertahankan');
expect_daily_report($rows[29]['poll_total'] === 10, 'total polling harian harus benar');
expect_daily_report($rows[29]['online_ratio'] === 90.0, 'persentase online harus benar');
expect_daily_report($rows[29]['offline_ratio'] === 10.0, 'persentase offline harus benar');

fwrite(STDOUT, "Daily report validation: OK\n");
