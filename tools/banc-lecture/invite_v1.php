<?php
// php invite_v1.php <dossier du plan> <version> [cote envoyée] : prépare <version>/ (vues + invites)
require __DIR__ . '/../../server/lecture-plan.php';
[$_, $d, $ver] = $argv;
$cote = (int) ($argv[3] ?? 3600);
@mkdir("$d/$ver");
$im = imagecreatefromstring(file_get_contents("$d/plan.png"));
$W = imagesx($im); $H = imagesy($im);
$k = min(1, $cote / max($W, $H));
$r = imagescale($im, (int) round($W * $k), (int) round($H * $k), IMG_BICUBIC);
ob_start(); imagejpeg($r, null, 80); $jpeg = ob_get_clean();
$textes = json_decode(file_get_contents("$d/textes.json"), true);
$lectures = preparerLesLectures($jpeg, 'image/jpeg', $textes);
foreach (['murs', 'pieces'] as $cle) {
  $l = $lectures[$cle];
  $n = 0;
  $msg = '';
  foreach ($l['contenu'] as $bloc) {
    if ($bloc['type'] === 'image') {
      $n++;
      $f = "$ver/vue$n.jpg";
      file_put_contents("$d/$f", base64_decode($bloc['source']['data']));
      $msg .= "[image : $f]\n";
    } else {
      $msg .= $bloc['text'] . "\n";
    }
  }
  $txt = "=== CONSIGNE SYSTÈME ===\n" . $l['consigne']
    . "\n\n=== OUTIL " . $l['outil']['name'] . " (schéma JSON de ta réponse) ===\n" . json_encode($l['outil']['input_schema'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
    . "\n\n=== MESSAGE DE L'UTILISATEUR ===\n" . $msg;
  file_put_contents("$d/$ver/invite_$cle.txt", $txt);
}
