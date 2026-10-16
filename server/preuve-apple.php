<?php
/**
 * LA PREUVE D'UN ABONNEMENT APP STORE — vérifiée, pas crue.
 *
 * Revue « sécurité » : le serveur croyait le champ `abonne` envoyé par l'app,
 * que n'importe qui pouvait écrire. L'app envoie maintenant la transaction
 * telle qu'Apple l'a SIGNÉE (StoreKit 2, `jwsRepresentation`) : un JWS
 * compact `entête.charge.signature`, signé ES256, dont l'entête porte la
 * chaîne de certificats (`x5c`) qui remonte à la racine d'Apple.
 *
 * Ce fichier ne touche ni la base ni le réseau : `verifierPreuveApple` est une
 * fonction PURE (le temps lui est donné), que server/tests/preuve-apple-test.php
 * éprouve avec une chaîne de certificats fabriquée pour l'occasion. Aucune clé
 * privée n'est nécessaire : tout se vérifie avec ce qu'Apple publie.
 */

/**
 * L'empreinte SHA-256 du certificat « Apple Root CA - G3 » — la racine ECC
 * d'Apple, celle qui signe les transactions StoreKit 2. Publiée sur
 * https://www.apple.com/certificateauthority/ .
 */
const APPLE_RACINE_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

/**
 * LES MARQUES D'APPLE DANS LA CHAÎNE. La racine G3 signe aussi les
 * intermédiaires des certificats de DÉVELOPPEUR — dont la clé privée est chez
 * le développeur. Sans ces deux extensions, n'importe quel compte développeur
 * pourrait signer un faux abonnement qui remonterait pourtant à G3.
 */
const APPLE_OID_FEUILLE = '1.2.840.113635.100.6.11.1';
const APPLE_OID_INTERMEDIAIRE = '1.2.840.113635.100.6.2.1';

/** Les abonnements qui donnent le Pro (voir PRODUIT_PRO / PRODUIT_PRO_AN, src/store/accountStore.ts). */
const PRODUITS_PRO_APPLE = ['echoplan.pro.mensuel', 'echoplan.pro.annuel'];

/** base64url → octets ; `null` si ce n'en est pas. */
function preuveB64url(string $s): ?string {
  if ($s === '' || preg_match('/[^A-Za-z0-9_-]/', $s)) {
    return null;
  }
  $o = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
  return $o === false ? null : $o;
}

/** Une longueur DER. */
function preuveDerLongueur(int $n): string {
  if ($n < 128) {
    return chr($n);
  }
  $octets = ltrim(pack('N', $n), "\0");
  return chr(0x80 | strlen($octets)) . $octets;
}

/** Un entier DER positif. */
function preuveDerEntier(string $octets): string {
  $octets = ltrim($octets, "\0");
  if ($octets === '' || ord($octets[0]) > 127) {
    $octets = "\0" . $octets;
  }
  return "\x02" . preuveDerLongueur(strlen($octets)) . $octets;
}

/**
 * LA SIGNATURE JWS N'EST PAS CELLE QU'OPENSSL ATTEND : JWS pose R puis S,
 * 32 octets chacun, bout à bout ; OpenSSL veut la structure DER
 * SEQUENCE { INTEGER r, INTEGER s }.
 */
function preuveSignatureDer(string $brute): ?string {
  if (strlen($brute) !== 64) {
    return null;
  }
  $corps = preuveDerEntier(substr($brute, 0, 32)) . preuveDerEntier(substr($brute, 32, 32));
  return "\x30" . preuveDerLongueur(strlen($corps)) . $corps;
}

/** Un certificat de `x5c` (DER en base64 standard) → PEM. */
function preuvePem(string $b64): ?string {
  $der = base64_decode($b64, true);
  if ($der === false || $der === '') {
    return null;
  }
  return "-----BEGIN CERTIFICATE-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END CERTIFICATE-----\n";
}

/**
 * VÉRIFIE LA TRANSACTION SIGNÉE PAR APPLE — rend ce qu'elle établit
 * (`produit`, `expiration` en ms, `transaction` d'origine, `environnement`),
 * ou `null` dès que quelque chose ne tient pas.
 *
 *   1. la chaîne `x5c` : trois certificats, le dernier EST la racine attendue
 *      (son empreinte), chacun signé par le suivant, tous en cours de validité,
 *      la feuille et l'intermédiaire portant les marques d'Apple ;
 *   2. la signature ES256 du JWS, par la clé de la feuille ;
 *   3. la charge : cette application (`bundleId`), un produit Pro, une
 *      échéance À VENIR, aucune révocation (remboursement).
 *
 * `$empreinteRacine` et `$bundleId` ne servent qu'aux tests : par défaut, la
 * racine Apple G3 et la constante de configuration APPLE_BUNDLE_ID. Sans
 * bundle ID configuré, rien n'est accepté.
 */
function verifierPreuveApple(
  string $jws,
  int $maintenantMs,
  ?string $empreinteRacine = null,
  ?string $bundleId = null
): ?array {
  $empreinteRacine = strtolower($empreinteRacine ?? APPLE_RACINE_G3_SHA256);
  if ($bundleId === null) {
    $bundleId = defined('APPLE_BUNDLE_ID') ? (string) APPLE_BUNDLE_ID : '';
  }
  if ($bundleId === '' || strlen($jws) > 32768) {
    return null;
  }
  $parts = explode('.', $jws);
  if (count($parts) !== 3) {
    return null;
  }
  $enteteBrut = preuveB64url($parts[0]);
  $chargeBrute = preuveB64url($parts[1]);
  $signature = preuveB64url($parts[2]);
  if ($enteteBrut === null || $chargeBrute === null || $signature === null) {
    return null;
  }
  $entete = json_decode($enteteBrut, true);
  $charge = json_decode($chargeBrute, true);
  if (!is_array($entete) || !is_array($charge) || ($entete['alg'] ?? '') !== 'ES256') {
    return null;
  }

  // Le temps des certificats : celui de la signature, comme le fait Apple
  // (une transaction ancienne reste vraie même si sa feuille a été remplacée
  // depuis) ; à défaut, maintenant.
  $instant = (int) floor(((int) ($charge['signedDate'] ?? $maintenantMs)) / 1000);

  // 1. LA CHAÎNE.
  $x5c = $entete['x5c'] ?? null;
  if (!is_array($x5c) || count($x5c) !== 3) {
    return null;
  }
  $certs = [];
  foreach ($x5c as $b64) {
    $pem = is_string($b64) ? preuvePem($b64) : null;
    $c = $pem !== null ? @openssl_x509_read($pem) : false;
    if ($c === false) {
      return null;
    }
    $certs[] = ['pem' => $pem, 'cert' => $c, 'infos' => openssl_x509_parse($c, true) ?: []];
  }
  $empreinte = openssl_x509_fingerprint($certs[2]['cert'], 'sha256');
  if (!is_string($empreinte) || !hash_equals($empreinteRacine, strtolower($empreinte))) {
    return null;
  }
  for ($i = 0; $i < 3; $i++) {
    $suivant = $certs[min($i + 1, 2)];
    $cle = openssl_pkey_get_public($suivant['pem']);
    if ($cle === false || openssl_x509_verify($certs[$i]['cert'], $cle) !== 1) {
      return null;
    }
    $de = (int) ($certs[$i]['infos']['validFrom_time_t'] ?? PHP_INT_MAX);
    $a = (int) ($certs[$i]['infos']['validTo_time_t'] ?? 0);
    if ($instant < $de || $instant > $a) {
      return null;
    }
  }
  if (!isset($certs[0]['infos']['extensions'][APPLE_OID_FEUILLE])
    || !isset($certs[1]['infos']['extensions'][APPLE_OID_INTERMEDIAIRE])) {
    return null;
  }

  // 2. LA SIGNATURE, par la clé de la feuille.
  $der = preuveSignatureDer($signature);
  $cleFeuille = openssl_pkey_get_public($certs[0]['pem']);
  if ($der === null || $cleFeuille === false
    || openssl_verify($parts[0] . '.' . $parts[1], $der, $cleFeuille, OPENSSL_ALGO_SHA256) !== 1) {
    return null;
  }

  // 3. CE QUE LA TRANSACTION DIT.
  if (($charge['bundleId'] ?? '') !== $bundleId) {
    return null;
  }
  $produit = (string) ($charge['productId'] ?? '');
  if (!in_array($produit, PRODUITS_PRO_APPLE, true)) {
    return null;
  }
  $expiration = (int) ($charge['expiresDate'] ?? 0);
  if ($expiration <= $maintenantMs) {
    return null;
  }
  if (!empty($charge['revocationDate'])) {
    return null;
  }
  return [
    'produit' => $produit,
    'expiration' => $expiration,
    'transaction' => (string) ($charge['originalTransactionId'] ?? $charge['transactionId'] ?? ''),
    'environnement' => (string) ($charge['environment'] ?? ''),
  ];
}
