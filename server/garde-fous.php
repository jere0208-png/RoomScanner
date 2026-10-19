<?php
/**
 * LES GARDE-FOUS DE L'API — revue « sécurité » du 19/10.
 *
 * Des fonctions pures, sans base ni réseau, qu'api.php et lecture-plan.php
 * appellent, et que `php server/tests/garde-fous-test.php` vérifie :
 *
 *   — l'e-mail d'un compte est celui qu'il PROUVE, jamais celui qu'il
 *     déclare : un compte e-mail déclarait l'adresse du patron et devenait
 *     administrateur ;
 *   — une image se mesure avant de se décoder : un PNG de 775 Ko qui se
 *     déplie en 16 000 × 16 000 prenait 1,7 Go au serveur ;
 *   — une vidéo refusée par PHP (trop lourde pour sa configuration) se dit,
 *     au lieu de répondre « envoyé » sans elle.
 */

/** Au-delà, une photo de plan n'en est pas une : 40 mégapixels, 10 000 px de côté. */
const IMAGE_PIXELS_MAX = 40000000;
const IMAGE_COTE_MAX = 10000;

/** Plans qu'un compte peut garder sur le serveur. */
const PLANS_PAR_COMPTE_MAX = 2000;

/**
 * L'E-MAIL PROUVÉ d'un compte qui se connecte, ou '' :
 *   — e-mail : l'adresse de l'identifiant, celle à qui le code est parti ;
 *   — Google : celle que auth-google.php a signée (vérifiée par Google) ;
 *   — Apple : celle du jeton d'identité signé par Apple, si Apple la dit
 *     vérifiée.
 * `$corps['email']` n'est lu que pour Google, dont la signature le couvre.
 */
function emailProuve(string $identifiant, array $corps, ?array $chargeApple): string {
  if (strncmp($identifiant, 'email:', 6) === 0) {
    return strtolower(trim(substr($identifiant, 6)));
  }
  if (strncmp($identifiant, 'google:', 7) === 0) {
    return strtolower(trim((string) ($corps['email'] ?? '')));
  }
  if (strncmp($identifiant, 'apple:', 6) === 0 && is_array($chargeApple)) {
    $verifie = $chargeApple['email_verified'] ?? false;
    if ($verifie === true || $verifie === 'true') {
      return strtolower(trim((string) ($chargeApple['email'] ?? '')));
    }
  }
  return '';
}

/**
 * EST-CE UN ADMINISTRATEUR ? Pour un compte e-mail, l'adresse se relit dans
 * l'IDENTIFIANT (c'est elle que le code a prouvée) : un ancien compte qui
 * aurait déclaré l'adresse du patron dans sa colonne `email` n'y gagne rien.
 * Pour Apple et Google, la colonne `email`, écrite à chaque connexion depuis
 * la preuve. `$identifiants` : une liste d'identifiants admis tels quels
 * (`apple:…`), la porte la plus sûre.
 */
function estAdminParmi(?array $compte, string $identifiant, array $emails, array $identifiants = []): bool {
  if (!$compte || $identifiant === '') {
    return false;
  }
  foreach ($identifiants as $admis) {
    if (hash_equals((string) $admis, $identifiant)) {
      return true;
    }
  }
  $email = strncmp($identifiant, 'email:', 6) === 0
    ? strtolower(trim(substr($identifiant, 6)))
    : strtolower(trim((string) ($compte['email'] ?? '')));
  if ($email === '') {
    return false;
  }
  foreach ($emails as $admin) {
    if (hash_equals(strtolower(trim((string) $admin)), $email)) {
      return true;
    }
  }
  return false;
}

/** La raison, lisible, d'un téléversement que PHP a refusé ; null s'il est arrivé (ou absent). */
function raisonDuTeleversement(int $erreur): ?string {
  switch ($erreur) {
    case UPLOAD_ERR_OK:
    case UPLOAD_ERR_NO_FILE:
      return null;
    case UPLOAD_ERR_INI_SIZE:
    case UPLOAD_ERR_FORM_SIZE:
      return 'Vidéo trop lourde pour le serveur (réglage upload_max_filesize).';
    case UPLOAD_ERR_PARTIAL:
      return 'Vidéo arrivée incomplète : la connexion a coupé.';
    default:
      return 'Le serveur n’a pas pu recevoir la vidéo (erreur ' . $erreur . ').';
  }
}

/** Un réglage de taille PHP (« 40M », « 2G », « 512K ») en octets ; 0 = sans limite. */
function octetsDuReglage(string $valeur): int {
  $v = trim($valeur);
  if ($v === '') {
    return 0;
  }
  $n = (int) $v;
  switch (strtoupper(substr($v, -1))) {
    case 'G':
      return $n * 1024 * 1024 * 1024;
    case 'M':
      return $n * 1024 * 1024;
    case 'K':
      return $n * 1024;
    default:
      return $n;
  }
}

/**
 * LA REQUÊTE DÉPASSAIT-ELLE `post_max_size` ? PHP la jette alors en entier :
 * $_POST et $_FILES arrivent vides, et l'on répondait « Requête vide ».
 */
function requeteTropLourde(int $longueur, string $postMaxSize): bool {
  $max = octetsDuReglage($postMaxSize);
  return $max > 0 && $longueur > $max;
}

/** La raison de refuser une image avant de la décoder, ou null si elle est raisonnable. */
function imageTropGrande(string $octets): ?string {
  $taille = @getimagesizefromstring($octets);
  if (!is_array($taille) || !isset($taille[0], $taille[1])) {
    return null;
  }
  $w = (int) $taille[0];
  $h = (int) $taille[1];
  if ($w > IMAGE_COTE_MAX || $h > IMAGE_COTE_MAX || $w * $h > IMAGE_PIXELS_MAX) {
    return 'Cette image est trop grande (' . $w . ' × ' . $h . ' pixels) : reprenez la photo.';
  }
  return null;
}

/** L'identifiant d'un plan déposé, s'il est recevable ; null sinon. */
function scanRecevable(string $scan): ?string {
  $scan = trim($scan);
  return $scan === '' || strlen($scan) > 64 ? null : $scan;
}

/** Le nom d'un plan, à la longueur de sa colonne (191 caractères). */
function nomBorne(string $nom): string {
  $nom = trim($nom);
  return function_exists('mb_substr') ? mb_substr($nom, 0, 191, 'UTF-8') : substr($nom, 0, 191);
}
