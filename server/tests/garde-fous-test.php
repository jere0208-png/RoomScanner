<?php
/**
 * BANC DES GARDE-FOUS — `php server/tests/garde-fous-test.php`.
 *
 * Revue « sécurité » du 19/10 : l'e-mail prouvé (pas déclaré), l'admin qui
 * ne s'usurpe plus, l'image démesurée refusée avant décodage, la vidéo
 * refusée par PHP qui se dit, les bornes d'un plan déposé. Ni base ni
 * réseau. Sort en code 1 au premier écart.
 */
require __DIR__ . '/../garde-fous.php';

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

$patron = 'patron@exemple.fr';
$admins = [$patron];

// ---- L'e-mail prouvé.
verifier('compte e-mail : l’adresse de l’identifiant, pas celle déclarée', 'pirate@exemple.fr',
  emailProuve('email:pirate@exemple.fr', ['email' => $patron], null));
verifier('Apple sans jeton vérifié : aucun e-mail', '', emailProuve('apple:001', ['email' => $patron], null));
verifier('Apple : l’e-mail déclaré est ignoré, celui du jeton vaut s’il est vérifié', 'moi@icloud.com',
  emailProuve('apple:001', ['email' => $patron], ['email' => 'Moi@iCloud.com', 'email_verified' => 'true']));
verifier('Apple : un e-mail non vérifié ne vaut rien', '',
  emailProuve('apple:001', [], ['email' => $patron, 'email_verified' => false]));
verifier('Google : celui que la signature couvre', $patron, emailProuve('google:42', ['email' => $patron], null));
verifier('méthode inconnue : rien', '', emailProuve('autre:1', ['email' => $patron], null));

// ---- L'administrateur.
verifier('le patron, par son compte e-mail', true, estAdminParmi(['email' => $patron], 'email:' . $patron, $admins));
verifier('un compte e-mail qui a DÉCLARÉ l’adresse du patron (ancienne base) n’est pas admin', false,
  estAdminParmi(['email' => $patron], 'email:pirate@exemple.fr', $admins));
verifier('le patron par Apple, e-mail prouvé en base', true, estAdminParmi(['email' => $patron], 'apple:001', $admins));
verifier('par son identifiant, listé', true, estAdminParmi(['email' => ''], 'apple:001', $admins, ['apple:001']));
verifier('listes vides : personne', false, estAdminParmi(['email' => $patron], 'email:' . $patron, []));
verifier('sans compte : personne', false, estAdminParmi(null, 'email:' . $patron, $admins));

// ---- Les téléversements.
verifier('vidéo arrivée : rien à dire', null, raisonDuTeleversement(UPLOAD_ERR_OK));
verifier('pas de vidéo : rien à dire', null, raisonDuTeleversement(UPLOAD_ERR_NO_FILE));
verifier('vidéo trop lourde pour PHP : on le dit', true, is_string(raisonDuTeleversement(UPLOAD_ERR_INI_SIZE)));
verifier('vidéo incomplète : on le dit', true, is_string(raisonDuTeleversement(UPLOAD_ERR_PARTIAL)));
verifier('réglage 40M', 40 * 1024 * 1024, octetsDuReglage('40M'));
verifier('réglage 1G', 1024 * 1024 * 1024, octetsDuReglage('1G'));
verifier('réglage 0 : sans limite', false, requeteTropLourde(999999999, '0'));
verifier('requête plus lourde que post_max_size', true, requeteTropLourde(9 * 1024 * 1024, '8M'));
verifier('requête dans la limite', false, requeteTropLourde(7 * 1024 * 1024, '8M'));

// ---- L'image démesurée, mesurée sans être décodée.
if (function_exists('imagecreatetruecolor')) {
  $petite = imagecreatetruecolor(40, 30);
  ob_start();
  imagepng($petite);
  $png = (string) ob_get_clean();
  verifier('une photo ordinaire passe', null, imageTropGrande($png));
  // Un en-tête PNG qui annonce 16 000 × 16 000 : on refuse sans rien déplier.
  $ihdr = 'IHDR' . pack('NN', 16000, 16000) . "\x08\x02\x00\x00\x00";
  $bombe = "\x89PNG\r\n\x1a\n" . pack('N', 13) . $ihdr . pack('N', crc32($ihdr));
  verifier('un PNG de 16 000 × 16 000 est refusé', true, is_string(imageTropGrande($bombe)));
} else {
  echo "—    GD absent : bancs d'image sautés\n";
}
verifier('des octets qui ne sont pas une image : pas de refus ici (le décodage dira)', null, imageTropGrande('pas une image'));

// ---- Les bornes d'un plan déposé.
verifier('identifiant de plan ordinaire', 'abc-123', scanRecevable(' abc-123 '));
verifier('identifiant vide refusé', null, scanRecevable('  '));
verifier('identifiant de 65 caractères refusé', null, scanRecevable(str_repeat('a', 65)));
verifier('nom tronqué à 191 caractères', 191, mb_strlen(nomBorne(str_repeat('é', 300)), 'UTF-8'));

if ($echecs > 0) {
  echo "\n$echecs écart(s).\n";
  exit(1);
}
echo "\nTout est bon.\n";
