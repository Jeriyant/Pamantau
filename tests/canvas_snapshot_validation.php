<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/topology_snapshot.php';

function expect_canvas_snapshot(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$onePixelPng = base64_decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    true
);
expect_canvas_snapshot(is_string($onePixelPng), 'fixture PNG harus valid');

$valid = pamantau_validate_canvas_snapshot_binary($onePixelPng);
expect_canvas_snapshot(!empty($valid['ok']), 'PNG valid harus diterima');
expect_canvas_snapshot(($valid['mime'] ?? '') === 'image/png', 'MIME PNG harus terdeteksi');
expect_canvas_snapshot(($valid['width'] ?? 0) === 1, 'lebar PNG harus terdeteksi');
expect_canvas_snapshot(($valid['height'] ?? 0) === 1, 'tinggi PNG harus terdeteksi');

$invalid = pamantau_validate_canvas_snapshot_binary('not-an-image');
expect_canvas_snapshot(empty($invalid['ok']), 'payload non-gambar harus ditolak');

$tooLarge = pamantau_validate_canvas_snapshot_binary(
    str_repeat('x', PAMANTAU_CANVAS_SNAPSHOT_MAX_BYTES + 1)
);
expect_canvas_snapshot(empty($tooLarge['ok']), 'payload di atas 9 MB harus ditolak');

$runtimeUploadLimit = pamantau_canvas_snapshot_upload_limit_bytes();
expect_canvas_snapshot($runtimeUploadLimit >= 128 * 1024, 'target upload minimal harus masuk akal');
expect_canvas_snapshot(
    $runtimeUploadLimit <= PAMANTAU_CANVAS_SNAPSHOT_MAX_BYTES,
    'target upload tidak boleh melampaui batas gambar'
);

$tmp = tempnam(sys_get_temp_dir(), 'pamantau-canvas-test-');
expect_canvas_snapshot(is_string($tmp), 'file upload sementara harus dapat dibuat');
file_put_contents($tmp, $onePixelPng);
$uploaded = pamantau_canvas_snapshot_from_upload([
    'error' => UPLOAD_ERR_OK,
    'tmp_name' => $tmp,
    'size' => strlen($onePixelPng),
]);
expect_canvas_snapshot(!empty($uploaded['ok']), 'upload PNG valid harus diterima');
expect_canvas_snapshot(($uploaded['binary'] ?? '') === $onePixelPng, 'binary upload tidak boleh berubah');
@unlink($tmp);

fwrite(
    STDOUT,
    "Canvas snapshot validation: OK ({$runtimeUploadLimit} byte upload target)\n"
);
