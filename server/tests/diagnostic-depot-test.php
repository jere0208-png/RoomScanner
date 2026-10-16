<?php
/**
 * BANC DU DÉPÔT DE DIAGNOSTIC — `php server/tests/diagnostic-depot-test.php`.
 *
 * Les fonctions pures de `diagnostic-depot.php` : le chemin horodaté, le nom
 * de fichier sûr, et le résumé lisible du message.md. Ni base ni réseau. Sort
 * en code 1 au premier écart.
 */
require __DIR__ . '/../diagnostic-depot.php';

$echecs = 0;
function verifier(string $quoi, $attendu, $obtenu): void {
  global $echecs;
  if ($attendu === $obtenu) {
    echo "ok   — $quoi\n";
    return;
  }
  $echecs++;
  echo "RATÉ — $quoi\n";
  echo '     attendu : ' . var_export($attendu, true) . "\n";
  echo '     obtenu  : ' . var_export($obtenu, true) . "\n";
}

function contient(string $quoi, string $foin, string $aiguille): void {
  global $echecs;
  if (strpos($foin, $aiguille) !== false) {
    echo "ok   — $quoi\n";
    return;
  }
  $echecs++;
  echo "RATÉ — $quoi : « $aiguille » absent\n";
  echo "     dans : " . $foin . "\n";
}

// ---- Le dossier horodaté, à la seconde, en UTC.
$ts = gmmktime(14, 30, 5, 10, 16, 2026);
verifier('chemin du dossier horodaté', 'rapports/2026-10-16_14-30-05', diagCheminDossier($ts));

// ---- Le nom de fichier sûr : pas d'évasion de dossier possible.
verifier('nom sûr garde l’ordinaire', 'ecran.mp4', diagNomSur('ecran.mp4'));
// L'essentiel : aucune barre ne subsiste (pas d'évasion de dossier) et le nom
// ne commence jamais par un point.
$p = diagNomSur('/etc/passwd');
verifier('nom sûr : plus aucune barre', false, strpos($p, '/') !== false);
verifier('nom sûr : pas de point en tête', false, $p[0] === '.');
$s = diagNomSur('../../etc_shadow');
verifier('nom sûr : point-point sans barre', false, strpos($s, '/') !== false);
verifier('nom sûr : pas de point en tête (2)', false, $s[0] === '.');
verifier('nom sûr ne reste jamais vide', 'fichier', diagNomSur('...'));

// ---- Le résumé : le message d'abord, puis l'instantané.
$instant = [
  'app' => '1.4.0 (812)',
  'appareil' => 'iPhone15,2',
  'systeme' => 'ios 17.5',
  'ecran' => 'scan',
  'modeElec' => true,
  'plan' => ['murs' => 8, 'pieces' => 3, 'ouvertures' => 5, 'meubles' => 12, 'appareils' => 7],
];
$md = diagResume('Ça a planté en posant une prise', $instant, true, 9, 40, $ts);
contient('le message en tête', $md, 'Ça a planté en posant une prise');
contient('le titre', $md, '# Diagnostic EchoPlan');
contient('l’appareil', $md, 'iPhone15,2');
contient('l’écran', $md, 'scan');
contient('le mode électricité', $md, '**Mode électricité** : oui');
contient('le résumé du plan', $md, '8 murs, 3 pièces, 5 ouvertures, 12 meubles, 7 appareils');
contient('le compte des gestes', $md, '**Gestes (10 s)** : 9');
contient('la présence vidéo', $md, 'oui (ecran.mp4)');

// ---- Sans message ni vidéo : lisible quand même.
$maigre = diagResume('', [], false, 0, 0, $ts);
contient('message vide annoncé', $maigre, '_(aucun message)_');
contient('absence de vidéo', $maigre, '**Vidéo de l’écran** : non');

// ---- Le dépôt local écrit bien les fichiers (GitHub non configuré au banc).
$fichiers = ['message.md' => "coucou\n", 'journal.json' => '{"a":1}'];
$dossier = 'rapports/banc-' . bin2hex(random_bytes(4));
$r = diagDeposerLocal($dossier, $fichiers);
verifier('dépôt local ok', true, $r['ok']);
verifier('dépôt local se dit « serveur »', 'serveur', $r['range']);
$racine = __DIR__ . '/../diagnostics/' . $dossier;
verifier('message.md écrit', "coucou\n", file_get_contents($racine . '/message.md'));
verifier('journal.json écrit', '{"a":1}', file_get_contents($racine . '/journal.json'));
// On range derrière soi : le banc ne laisse pas de dossier.
@unlink($racine . '/message.md');
@unlink($racine . '/journal.json');
@rmdir($racine);

echo $echecs === 0 ? "\nTOUT PASSE.\n" : "\n$echecs ÉCART(S).\n";
exit($echecs === 0 ? 0 : 1);
