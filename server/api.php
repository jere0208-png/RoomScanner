<?php
/**
 * EchoPlan — l'API des comptes, en un fichier.
 *
 * Une app ne parle JAMAIS à MySQL en direct : ce fichier est la seule
 * porte. Quatre actions, toutes en POST JSON :
 *
 *   connecter  {identifiant, prenom?, email?, appareil}
 *              → {ok, jeton, pro, plans} ou {ok:false, raison}
 *              Le verrou « un compte par téléphone » se juge ICI : un
 *              appareil déjà lié à un AUTRE identifiant est refusé.
 *   etat       {identifiant, jeton}          → {ok, pro, plans}
 *   plan       {identifiant, jeton}          → {ok, plans}   (n += 1)
 *   code       {identifiant, jeton, code}    → {ok, pro}
 *
 * Le jeton est un HMAC de l'identifiant : sans état côté serveur, il prouve
 * que l'appelant est bien passé par `connecter` — assez pour une API de
 * quota, sans gestion de sessions.
 */
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function sortir(array $reponse): void {
  echo json_encode($reponse, JSON_UNESCAPED_UNICODE);
  exit;
}

function jeton(string $identifiant): string {
  return hash_hmac('sha256', $identifiant, SECRET_HMAC);
}

$corps = json_decode(file_get_contents('php://input'), true);
if (!is_array($corps)) {
  sortir(['ok' => false, 'raison' => 'Requête vide.']);
}
$action = $corps['action'] ?? '';
$identifiant = trim((string) ($corps['identifiant'] ?? ''));
if ($identifiant === '' || strlen($identifiant) > 191) {
  sortir(['ok' => false, 'raison' => 'Identifiant manquant.']);
}

$db = mysqli_connect(DB_HOTE, DB_UTILISATEUR, DB_MOT_DE_PASSE, DB_BASE);
if (!$db) {
  sortir(['ok' => false, 'raison' => 'Base injoignable.']);
}
mysqli_set_charset($db, 'utf8mb4');

/** Le compte, s'il existe. */
function compteDe(mysqli $db, string $identifiant): ?array {
  $req = mysqli_prepare($db, 'SELECT id, pro, plans FROM comptes WHERE identifiant = ?');
  mysqli_stmt_bind_param($req, 's', $identifiant);
  mysqli_stmt_execute($req);
  $res = mysqli_stmt_get_result($req);
  $ligne = mysqli_fetch_assoc($res);
  return $ligne ?: null;
}

if ($action === 'connecter') {
  $appareil = trim((string) ($corps['appareil'] ?? ''));
  if ($appareil === '' || strlen($appareil) > 191) {
    sortir(['ok' => false, 'raison' => 'Appareil manquant.']);
  }

  // TOUS les comptes sont accueillis. Ce que la base retient, c'est
  // l'ESSAI DU TÉLÉPHONE : le plus grand compteur `plans` porté par cet
  // appareil, tous comptes confondus — c'est lui qui décide du popup.
  $compte = compteDe($db, $identifiant);
  if (!$compte) {
    $prenom = substr(trim((string) ($corps['prenom'] ?? '')), 0, 80);
    $email = substr(trim((string) ($corps['email'] ?? '')), 0, 191);
    $req = mysqli_prepare(
      $db,
      'INSERT INTO comptes (identifiant, prenom, email) VALUES (?, ?, ?)',
    );
    mysqli_stmt_bind_param($req, 'sss', $identifiant, $prenom, $email);
    mysqli_stmt_execute($req);
    $compte = compteDe($db, $identifiant);
  }

  $req = mysqli_prepare(
    $db,
    'INSERT INTO appareils (appareil, compte_id) VALUES (?, ?) ' .
      'ON DUPLICATE KEY UPDATE compte_id = compte_id',
  );
  mysqli_stmt_bind_param($req, 'si', $appareil, $compte['id']);
  mysqli_stmt_execute($req);

  $req = mysqli_prepare(
    $db,
    'SELECT COALESCE(MAX(plans), 0) AS p FROM appareils WHERE appareil = ?',
  );
  mysqli_stmt_bind_param($req, 's', $appareil);
  mysqli_stmt_execute($req);
  $res = mysqli_stmt_get_result($req);
  $duTelephone = (int) (mysqli_fetch_assoc($res)['p'] ?? 0);

  sortir([
    'ok' => true,
    'jeton' => jeton($identifiant),
    'pro' => $compte['pro'],
    'plans' => max((int) $compte['plans'], $duTelephone),
  ]);
}

// Toutes les actions suivantes exigent le jeton.
if (!hash_equals(jeton($identifiant), (string) ($corps['jeton'] ?? ''))) {
  sortir(['ok' => false, 'raison' => 'Jeton invalide.']);
}
$compte = compteDe($db, $identifiant);
if (!$compte) {
  sortir(['ok' => false, 'raison' => 'Compte inconnu.']);
}

if ($action === 'etat') {
  sortir(['ok' => true, 'pro' => $compte['pro'], 'plans' => (int) $compte['plans']]);
}

if ($action === 'plan') {
  $req = mysqli_prepare($db, 'UPDATE comptes SET plans = plans + 1 WHERE id = ?');
  mysqli_stmt_bind_param($req, 'i', $compte['id']);
  mysqli_stmt_execute($req);
  // L'essai se consomme au TÉLÉPHONE : toutes ses lignes avancent d'un.
  $appareil = trim((string) ($corps['appareil'] ?? ''));
  if ($appareil !== '') {
    $req = mysqli_prepare(
      $db,
      'UPDATE appareils SET plans = plans + 1 WHERE appareil = ?',
    );
    mysqli_stmt_bind_param($req, 's', $appareil);
    mysqli_stmt_execute($req);
  }
  sortir(['ok' => true, 'plans' => (int) $compte['plans'] + 1]);
}

if ($action === 'code') {
  $code = strtoupper(trim((string) ($corps['code'] ?? '')));
  $req = mysqli_prepare(
    $db,
    'SELECT pour_cent FROM codes_promo WHERE code = ? AND actif = 1',
  );
  mysqli_stmt_bind_param($req, 's', $code);
  mysqli_stmt_execute($req);
  $res = mysqli_stmt_get_result($req);
  $promo = mysqli_fetch_assoc($res);
  if (!$promo || (int) $promo['pour_cent'] < 100) {
    sortir(['ok' => false, 'raison' => 'Code inconnu ou partiel.']);
  }
  $req = mysqli_prepare($db, "UPDATE comptes SET pro = 'code' WHERE id = ?");
  mysqli_stmt_bind_param($req, 'i', $compte['id']);
  mysqli_stmt_execute($req);
  $req = mysqli_prepare(
    $db,
    'UPDATE codes_promo SET utilisations = utilisations + 1 WHERE code = ?',
  );
  mysqli_stmt_bind_param($req, 's', $code);
  mysqli_stmt_execute($req);
  sortir(['ok' => true, 'pro' => 'code']);
}

sortir(['ok' => false, 'raison' => 'Action inconnue.']);
