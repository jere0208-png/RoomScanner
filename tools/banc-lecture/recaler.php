<?php
// php recaler.php <dossier> <version> : lecture_<version>r.json, recalée sur l'image envoyée
require __DIR__ . '/../../server/lecture-plan.php';
require __DIR__ . '/recalage.php';
[$_, $d, $ver] = $argv;
$im = imagecreatefromstring(file_get_contents("$d/plan.png"));
$W = imagesx($im); $H = imagesy($im);
$k = min(1, 3200 / max($W, $H));
$r = imagescale($im, (int) round($W * $k), (int) round($H * $k), IMG_BICUBIC);
ob_start(); imagejpeg($r, null, 78); $jpeg = ob_get_clean();
$l = json_decode(file_get_contents("$d/lecture_$ver.json"), true);
$t = microtime(true);
$reg = json_decode(getenv("RECALAGE") ?: "{}", true); $l2 = recalerSurLImage($jpeg, $l, $reg);
fprintf(STDERR, "%s %s : %.2f s\n", $d, $ver, microtime(true) - $t);
file_put_contents("$d/lecture_{$ver}r.json", json_encode($l2, JSON_UNESCAPED_UNICODE));
