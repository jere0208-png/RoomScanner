<?php
// php assembler.php <dossier> <version> : lecture_<version>.json depuis les réponses des deux outils
require __DIR__ . '/../../server/lecture-plan.php';
[$_, $d, $ver] = $argv;
$m = json_decode(@file_get_contents("$d/{$ver}_murs.json"), true);
$p = json_decode(@file_get_contents("$d/{$ver}_pieces.json"), true);
if (!$m || !$p) { fwrite(STDERR, "$d : lecture incomplète\n"); exit(1); }
file_put_contents("$d/lecture_$ver.json", json_encode(lectureAssemblee($m, $p ?: null, null), JSON_UNESCAPED_UNICODE));
