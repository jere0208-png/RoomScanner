<?php
// Essai écarté : le recalage des murs sur l'image (voir notes du banc).
/**
 * LE RECALAGE SUR L'IMAGE — relevé du patron : « se trompe souvent ». Une
 * vision situe un trait à quelques millièmes près : sur une maison de 13 m,
 * c'est une cloison à 10 ou 20 cm de sa place, une chambre qui prend un
 * mètre carré à sa voisine. Or le trait est là, sur l'image, au pixel. Chaque
 * mur lu cherche donc, de part et d'autre de là où il a été situé, la bande
 * sombre qui le dessine (pochée, grisée, ou ses deux traits) et s'y pose, à
 * son épaisseur vraie ; puis chaque ouverture cherche, le long de son mur,
 * l'interruption claire qu'elle est, et prend ses jambages au bord du trait.
 * Ce qui ne trouve rien de net garde sa place lue : le recalage corrige, il
 * n'invente pas.
 */
const RECALAGE_COTE = 2400;

function recalerSurLImage(string $octets, array $lecture, array $reglages = []): array {
  $portee = (float) ($reglages['portee'] ?? 0.012);
  $nettete = (float) ($reglages['nettete'] ?? 45);
  if (!function_exists('imagecreatefromstring') || empty($lecture['murs'])) return $lecture;
  @ini_set('memory_limit', '768M');
  $src = @imagecreatefromstring($octets);
  if (!$src) return $lecture;
  $k = min(1, RECALAGE_COTE / max(imagesx($src), imagesy($src)));
  $W = max(1, (int) round(imagesx($src) * $k));
  $H = max(1, (int) round(imagesy($src) * $k));
  $img = imagecreatetruecolor($W, $H);
  imagecopyresampled($img, $src, 0, 0, 0, 0, $W, $H, imagesx($src), imagesy($src));
  imagedestroy($src);
  imagefilter($img, IMG_FILTER_GRAYSCALE);
  $lum = function (float $x, float $y) use ($img, $W, $H): int {
    $xi = (int) round($x);
    $yi = (int) round($y);
    if ($xi < 0 || $yi < 0 || $xi >= $W || $yi >= $H) return 255;
    return imagecolorat($img, $xi, $yi) & 0xFF;
  };
  $R = max(6, (int) round($W * $portee));
  $murs = [];
  foreach ($lecture['murs'] as $i => $m) {
    $murs[$i] = ['m' => $m, 'ok' => false];
    $ax = $m[0] / 1000 * $W;
    $ay = $m[1] / 1000 * $H;
    $bx = $m[2] / 1000 * $W;
    $by = $m[3] / 1000 * $H;
    $L = hypot($bx - $ax, $by - $ay);
    if ($L < 15) continue;
    $ux = ($bx - $ax) / $L;
    $uy = ($by - $ay) / $L;
    $nx = -$uy;
    $ny = $ux;
    $t0 = isset($m[4]) && $m[4] > 0 ? $m[4] / 1000 * $W : 0.0;
    $T = max(6, (int) ceil($t0 * 1.5));
    // Le profil en travers : pour chaque décalage, la médiane le long du mur
    // (une porte, une cloison qui le rejoint ne pèsent pas sur la médiane).
    $pas = max(2.0, $L / 160);
    $profil = [];
    for ($o = -$R - $T; $o <= $R + $T; $o++) {
      $v = [];
      for ($t = 0.08 * $L; $t <= 0.92 * $L; $t += $pas) $v[] = $lum($ax + $ux * $t + $nx * $o, $ay + $uy * $t + $ny * $o);
      sort($v);
      $profil[$o] = $v ? $v[intdiv(count($v), 2)] : 255;
    }
    $moy = function (int $a, int $b) use ($profil): float {
      $s = 0;
      $n = 0;
      for ($o = $a; $o <= $b; $o++) {
        if (!isset($profil[$o])) continue;
        $s += $profil[$o];
        $n++;
      }
      return $n ? $s / $n : 255.0;
    };
    $hMin = $t0 > 0 ? max(1, (int) round($t0 * 0.3)) : 1;
    $hMax = $t0 > 0 ? max($hMin + 1, (int) round($t0 * 0.8) + 2) : 10;
    $mieux = null;
    for ($c = -$R; $c <= $R; $c++) {
      for ($h = $hMin; $h <= $hMax; $h++) {
        $dehors = min($moy($c - $h - 3, $c - $h - 1), $moy($c + $h + 1, $c + $h + 3));
        // Pochée ou grisée : la bande est sombre, ses bords clairs.
        $plein = $dehors - $moy($c - $h, $c + $h);
        // Deux traits : sombres aux bords, clair entre eux.
        $bords = max(min($profil[$c - $h] ?? 255, $profil[$c - $h + 1] ?? 255), min($profil[$c + $h] ?? 255, $profil[$c + $h - 1] ?? 255));
        $creux = $h >= 3 ? min($dehors, $moy($c - $h + 2, $c + $h - 2)) - $bords : -255;
        $score = max($plein, $creux) - 10 * abs($c) / $R - ($t0 > 0 ? 8 * abs(2 * $h + 1 - $t0) / max($t0, 3) : 0);
        if ($mieux === null || $score > $mieux['score']) {
          $mieux = ['score' => $score, 'c' => $c, 'h' => $h, 'dedans' => $plein >= $creux ? $moy($c - $h, $c + $h) : $bords, 'dehors' => $dehors];
        }
      }
    }
    if (!$mieux || $mieux['score'] < $nettete) continue;
    $c = $mieux['c'];
    $ax += $nx * $c;
    $ay += $ny * $c;
    $bx += $nx * $c;
    $by += $ny * $c;
    $ep = (2 * $mieux['h'] + 1) / $W * 1000;
    $murs[$i] = [
      'm' => [round($ax / $W * 1000, 1), round($ay / $H * 1000, 1), round($bx / $W * 1000, 1), round($by / $H * 1000, 1), round($ep, 2)],
      'ok' => true,
      'px' => [$ax, $ay, $bx, $by, $ux, $uy, $nx, $ny, $mieux['h'], $mieux['dedans'], $mieux['dehors']],
    ];
  }
  $lecture['murs'] = array_values(array_map(fn($x) => $x['m'], $murs));

  // Les ouvertures, au bord de leur interruption.
  foreach ($lecture['ouvertures'] ?? [] as $j => $o) {
    $px = $o['a'][0] / 1000 * $W;
    $py = $o['a'][1] / 1000 * $H;
    $qx = $o['b'][0] / 1000 * $W;
    $qy = $o['b'][1] / 1000 * $H;
    $w0 = hypot($qx - $px, $qy - $py);
    if ($w0 < 4) continue;
    $cx = ($px + $qx) / 2;
    $cy = ($py + $qy) / 2;
    // Le mur recalé qui la porte : parallèle, et tout près.
    $porteur = null;
    $loin = 2.0 * $R;
    foreach ($murs as $mu) {
      if (!$mu['ok']) continue;
      [$ax, $ay, $bx, $by, $ux, $uy, $nx, $ny] = $mu['px'];
      if (abs((($qx - $px) * $ux + ($qy - $py) * $uy) / $w0) < 0.9) continue;
      $t = ($cx - $ax) * $ux + ($cy - $ay) * $uy;
      $L = hypot($bx - $ax, $by - $ay);
      if ($t < -$R || $t > $L + $R) continue;
      $d = abs(($cx - $ax) * $nx + ($cy - $ay) * $ny);
      if ($d < $loin) {
        $loin = $d;
        $porteur = $mu['px'];
      }
    }
    if (!$porteur) continue;
    [$ax, $ay, , , $ux, $uy, $nx, $ny, $h, $dedans, $dehors] = $porteur;
    $seuil = $dedans + 0.4 * ($dehors - $dedans);
    $t0 = ($cx - $ax) * $ux + ($cy - $ay) * $uy;
    // Le long du mur : la bande est-elle pleine (le mur) ou claire (la baie) ?
    $clair = [];
    $de = (int) floor(-$w0 * 1.2);
    $a = (int) ceil($w0 * 1.2);
    for ($s = $de; $s <= $a; $s++) {
      $v = 0;
      $n = 0;
      for ($e = -$h; $e <= $h; $e++) {
        $v += $lum($ax + $ux * ($t0 + $s) + $nx * $e, $ay + $uy * ($t0 + $s) + $ny * $e);
        $n++;
      }
      $clair[$s] = $v / max(1, $n) > $seuil;
    }
    // La plage claire qui contient le milieu lu, ou la plus proche.
    $plages = [];
    $debut = null;
    for ($s = $de; $s <= $a + 1; $s++) {
      $c = $clair[$s] ?? false;
      if ($c && $debut === null) $debut = $s;
      if (!$c && $debut !== null) {
        $plages[] = [$debut, $s - 1];
        $debut = null;
      }
    }
    $choix = null;
    foreach ($plages as [$d, $f]) {
      $long = $f - $d + 1;
      if ($long < 0.6 * $w0 || $long > 1.5 * $w0) continue;
      $ecart = $d <= 0 && $f >= 0 ? 0 : min(abs($d), abs($f));
      if ($ecart > 0.4 * $w0) continue;
      if ($choix === null || $ecart < $choix[2]) $choix = [$d, $f, $ecart];
    }
    if (!$choix) continue;
    $pt = fn(float $s) => [round(($ax + $ux * ($t0 + $s)) / $W * 1000, 1), round(($ay + $uy * ($t0 + $s)) / $H * 1000, 1)];
    $lecture['ouvertures'][$j]['a'] = $pt($choix[0] - 0.5);
    $lecture['ouvertures'][$j]['b'] = $pt($choix[1] + 0.5);
  }
  imagedestroy($img);
  return $lecture;
}

