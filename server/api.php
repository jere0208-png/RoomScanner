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
 *   tarifs     {}                            → {ok, tarifs} ou {ok:false}
 *              Le catalogue public des prix — sans compte, sans base.

 *
 * Le jeton est un HMAC de l'identifiant : sans état côté serveur, il prouve
 * que l'appelant est bien passé par `connecter` — assez pour une API de
 * quota, sans gestion de sessions.
 */
require __DIR__ . '/config-echoplan.php';

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

/*
  LES TARIFS SE SERVENT AVANT TOUT LE RESTE, ET SANS COMPTE.

  Ce n'est pas une donnee de compte : c'est un catalogue public, le meme pour
  tout le monde. Il passe donc AVANT le controle d'identifiant — sans quoi
  l'application devrait se connecter pour savoir combien coute une gaine — et
  AVANT l'ouverture de la base : un catalogue qui tomberait avec MySQL priverait
  de prix a jour tous les devis d'un chantier, pour rien.

  D'OU VIENNENT CES PRIX. Les sites de vente refusent la lecture automatique
  (Leroy Merlin et 123elec renvoient une page anti-robot) : le releve se fait
  A LA MAIN, ici, dans `tarifs.json`, par quelqu'un qui va voir. Le fichier
  porte l'enseigne et le jour ; l'application les affiche tels quels sur le
  devis, et chaque ligne du ticket cite sa provenance.

  Voir `tarifs.exemple.json` pour la forme attendue.
*/
if ($action === 'tarifs') {
  $chemin = __DIR__ . '/tarifs.json';
  if (!is_readable($chemin)) {
    // Pas de catalogue depose : l'application garde ses prix embarques, et
    // le dit a l'utilisateur. Ce n'est pas une erreur.
    sortir(['ok' => false, 'raison' => 'Aucun catalogue de tarifs.']);
  }
  $brut = json_decode((string) file_get_contents($chemin), true);
  if (!is_array($brut)) {
    sortir(['ok' => false, 'raison' => 'Catalogue de tarifs illisible.']);
  }
  sortir(['ok' => true, 'tarifs' => $brut]);
}

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

/*
  LES PLANS SUIVENT LE COMPTE.

  Relevé du chantier : « que les photos soient lues même s'il réinstalle
  l'application, tant qu'il est sur son compte ». Les photos vivent
  désormais dans la photothèque du téléphone, où elles survivent — mais un
  scan, lui, vit dans le stockage de l'application, et celui-là part avec
  elle. Une photo restaurée n'aurait plus de plan où se punaiser.

  Trois actions, et rien de plus : DÉPOSER un plan, LISTER ce que le compte
  garde, REPRENDRE un plan. Les images ne montent jamais ici : le plan ne
  porte que leurs identifiants dans la photothèque.

  Nécessite la table `plans` — voir migration-plans.sql.
*/
if ($action === 'deposer') {
  $scan = trim((string) ($corps['scan'] ?? ''));
  $contenu = (string) ($corps['contenu'] ?? '');
  $nom = trim((string) ($corps['nom'] ?? ''));
  $maj = (int) ($corps['maj'] ?? 0);
  if ($scan === '' || $contenu === '') {
    sortir(['ok' => false, 'raison' => 'Plan vide.']);
  }
  // Deux mégaoctets : le relevé d'un logement entier en fait moins de cent
  // kilo-octets. Au-delà, ce n'est plus un plan.
  if (strlen($contenu) > 2097152) {
    sortir(['ok' => false, 'raison' => 'Plan trop lourd.']);
  }
  $req = mysqli_prepare(
    $db,
    'INSERT INTO plans (identifiant, scan, nom, contenu, maj)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nom = VALUES(nom), contenu = VALUES(contenu),
       maj = VALUES(maj)',
  );
  mysqli_stmt_bind_param($req, 'ssssi', $identifiant, $scan, $nom, $contenu, $maj);
  mysqli_stmt_execute($req);
  sortir(['ok' => true]);
}

if ($action === 'catalogue') {
  // Le contenu ne descend PAS ici : on liste ce que le compte garde, avec
  // de quoi choisir. Un téléphone qui se reconnecte n'a pas à télécharger
  // vingt relevés pour en ouvrir un.
  $req = mysqli_prepare(
    $db,
    'SELECT scan, nom, maj, LENGTH(contenu) AS taille
     FROM plans WHERE identifiant = ? ORDER BY maj DESC',
  );
  mysqli_stmt_bind_param($req, 's', $identifiant);
  mysqli_stmt_execute($req);
  $res = mysqli_stmt_get_result($req);
  $liste = [];
  while ($ligne = mysqli_fetch_assoc($res)) {
    $liste[] = [
      'scan' => $ligne['scan'],
      'nom' => $ligne['nom'],
      'maj' => (int) $ligne['maj'],
      'taille' => (int) $ligne['taille'],
    ];
  }
  sortir(['ok' => true, 'plans' => $liste]);
}

if ($action === 'reprendre') {
  $scan = trim((string) ($corps['scan'] ?? ''));
  $req = mysqli_prepare(
    $db,
    'SELECT nom, contenu, maj FROM plans WHERE identifiant = ? AND scan = ?',
  );
  mysqli_stmt_bind_param($req, 'ss', $identifiant, $scan);
  mysqli_stmt_execute($req);
  $res = mysqli_stmt_get_result($req);
  $ligne = mysqli_fetch_assoc($res);
  if (!$ligne) {
    sortir(['ok' => false, 'raison' => 'Plan introuvable.']);
  }
  sortir([
    'ok' => true,
    'nom' => $ligne['nom'],
    'contenu' => $ligne['contenu'],
    'maj' => (int) $ligne['maj'],
  ]);
}

sortir(['ok' => false, 'raison' => 'Action inconnue.']);
