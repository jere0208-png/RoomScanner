<?php
// php invite_v0.php <dossier du plan> : prépare v0/ (l'envoi actuel de l'app) et v0/invite.txt
// L'ancienne lecture : git show c2ccad5:server/lecture-plan.php > lecture-plan-v0.php
require __DIR__ . '/lecture-plan-v0.php';
$d = $argv[1]; $ver = $argv[2] ?? 'v0';
@mkdir("$d/$ver");
$im = imagecreatefromstring(file_get_contents("$d/plan.png"));
$W = imagesx($im); $H = imagesy($im);
$k = min(1, 2000 / max($W, $H)); if ($ver !== "v0") $k = min($k, 1568 / max($W, $H), sqrt(1150000 / ($W * $H)));
$r = imagescale($im, (int) round($W * $k), (int) round($H * $k), IMG_BICUBIC);
imagejpeg($r, "$d/$ver/envoi.jpg", 82);
$textes = json_decode(file_get_contents("$d/textes.json"), true);
$lignes = [];
foreach (array_slice($textes, 0, 500) as $t) $lignes[] = mb_substr(trim($t['t']), 0, 60) . ' @ ' . (int) $t['x'] . ',' . (int) $t['y'];
$txt = "=== CONSIGNE SYSTÈME ===\n" . str_replace('@COMMUNE@', CONSIGNE_COMMUNE, CONSIGNE_STRUCTURE)
  . "\n\n=== OUTIL plan_lu (schéma JSON de ta réponse) ===\n" . json_encode(outilPlanLu()['input_schema'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
  . "\n\n=== MESSAGE DE L'UTILISATEUR ===\n[image : $ver/envoi.jpg]\n"
  . 'Lis le bâti de ce plan — toutes les pièces avec leur contour, tous les murs et cloisons, toutes les ouvertures, toutes les cotes — et rends-le par l’outil plan_lu.'
  . "\n\nTextes reconnus sur la photo par l’iPhone (texte @ x,y en millièmes, exacts) :\n" . implode("\n", $lignes) . "\n";
file_put_contents("$d/$ver/invite.txt", $txt);
