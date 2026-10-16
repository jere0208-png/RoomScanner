<?php
/**
 * EchoPlan — l'API des comptes, en un fichier.
 *
 * Une app ne parle JAMAIS à MySQL en direct : ce fichier est la seule
 * porte. Toutes les actions sont en POST JSON :
 *
 *   code_email {email}                       → {ok} ou {ok:false, raison}
 *              Envoie un code à six chiffres à l'adresse : c'est la preuve
 *              qu'on la possède.
 *   connecter  {identifiant, prenom?, email?, appareil, + SA PREUVE}
 *              → {ok, jeton, pro, plans} ou {ok:false, raison}
 *              La preuve dépend de la méthode : `code` pour l'e-mail,
 *              `sig` pour Google (posée par auth-google.php), `jetonApple`
 *              pour Apple (le jeton d'identité signé par Apple).
 *   etat       {identifiant, jeton}          → {ok, pro, plans}
 *   plan       {identifiant, jeton}          → {ok, plans}   (n += 1)
 *   code       {identifiant, jeton, code}    → {ok, pro}
 *   tarifs     {}                            → {ok, tarifs} ou {ok:false}
 *              Le catalogue public des prix — sans compte, sans base.

 *
 *   supprimer  {identifiant, jeton}          → {ok}  le compte ET ses plans
 *   retirer    {identifiant, jeton, scan}    → {ok}  un plan déposé
 *   lire_plan  {identifiant, jeton, image, media, textes, preuve?}
 *              → {ok, lecture, essai}  un plan papier lu par Claude
 *              (voir lecture-plan.php) — une lecture d'essai, puis le Pro.
 *              `preuve` : la transaction d'abonnement signée par Apple,
 *              vérifiée ici (voir preuve-apple.php).
 *
 * Le jeton est un HMAC de l'identifiant : sans état côté serveur, il prouve
 * que l'appelant est bien passé par `connecter`.
 *
 * PERSONNE NE SE CONNECTE AU COMPTE D'UN AUTRE. `connecter` délivrait ce
 * jeton à n'importe quel identifiant, sans preuve : il suffisait de taper
 * l'e-mail de quelqu'un pour lister et télécharger ses plans. Chaque méthode
 * apporte maintenant SA preuve, vérifiée ici avant tout (`preuveRefusee`).
 */
require __DIR__ . '/config-echoplan.php';
require __DIR__ . '/preuve-apple.php';

header('Content-Type: application/json; charset=utf-8');

function sortir(array $reponse): void {
  echo json_encode($reponse, JSON_UNESCAPED_UNICODE);
  exit;
}

/**
 * LES CODES INTERNES SONT-ILS OUVERTS ? — relevé du patron : « l'app est
 * encore en dev ». Le code maison donne le Pro sans passer par l'App Store :
 * c'est ce qu'il faut pendant le développement (l'app n'est pas publiée, la
 * feuille des codes d'Apple n'existe pas pour elle), et ce que la règle
 * 3.1.1 interdit une fois l'app publiée. La config en décide :
 * `CODES_INTERNES` à true le temps des essais, à false avant la publication.
 */
function codesInternesOuverts(): bool {
  return defined('CODES_INTERNES') && CODES_INTERNES === true;
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

/** La base, ouverte une fois. */
function base(): mysqli {
  static $db = null;
  if ($db === null) {
    $db = mysqli_connect(DB_HOTE, DB_UTILISATEUR, DB_MOT_DE_PASSE, DB_BASE);
    if (!$db) {
      sortir(['ok' => false, 'raison' => 'Base injoignable.']);
    }
    mysqli_set_charset($db, 'utf8mb4');
  }
  return $db;
}

/** L'empreinte d'un code d'e-mail : le code lui-même n'est jamais gardé. */
function empreinteDuCode(string $email, string $code): string {
  return hash_hmac('sha256', 'code|' . $email . '|' . $code, SECRET_HMAC);
}

/*
  LE CODE PAR E-MAIL — la preuve qu'on possède l'adresse.

  Six chiffres tirés au hasard, gardés en EMPREINTE (jamais en clair), valables
  quinze minutes, cinq essais. Une minute au moins entre deux envois, cinq
  envois par heure au plus : on n'inonde pas la boîte de quelqu'un.
  Nécessite la table `codes_email` — voir migration-connexion.sql.
*/
if ($action === 'code_email') {
  $email = strtolower(trim((string) ($corps['email'] ?? '')));
  if (strlen($email) > 191 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sortir(['ok' => false, 'raison' => 'Adresse e-mail invalide.']);
  }
  $db = base();
  $maintenant = time();
  $req = mysqli_prepare($db, 'SELECT envoye, envois, fenetre FROM codes_email WHERE email = ?');
  mysqli_stmt_bind_param($req, 's', $email);
  mysqli_stmt_execute($req);
  $avant = mysqli_fetch_assoc(mysqli_stmt_get_result($req));
  if ($avant && $maintenant - (int) $avant['envoye'] < 60) {
    sortir(['ok' => false, 'raison' => 'Un code vient de partir : patientez une minute avant d’en demander un autre.']);
  }
  $memeHeure = $avant && $maintenant - (int) $avant['fenetre'] < 3600;
  $envois = $memeHeure ? (int) $avant['envois'] + 1 : 1;
  $fenetre = $memeHeure ? (int) $avant['fenetre'] : $maintenant;
  if ($envois > 5) {
    sortir(['ok' => false, 'raison' => 'Trop de codes demandés pour cette adresse : réessayez dans une heure.']);
  }
  $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
  $empreinte = empreinteDuCode($email, $code);
  $expire = $maintenant + 900;
  $req = mysqli_prepare(
    $db,
    'INSERT INTO codes_email (email, empreinte, expire, essais, envoye, envois, fenetre)
     VALUES (?, ?, ?, 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE empreinte = VALUES(empreinte), expire = VALUES(expire),
       essais = 0, envoye = VALUES(envoye), envois = VALUES(envois), fenetre = VALUES(fenetre)',
  );
  mysqli_stmt_bind_param($req, 'ssiiii', $email, $empreinte, $expire, $maintenant, $envois, $fenetre);
  mysqli_stmt_execute($req);
  $expediteur = defined('EMAIL_EXPEDITEUR') && EMAIL_EXPEDITEUR !== ''
    ? EMAIL_EXPEDITEUR
    : 'no-reply@' . preg_replace('/^www\./', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));
  $sujet = '=?UTF-8?B?' . base64_encode('Votre code EchoPlan : ' . $code) . '?=';
  $texte = "Bonjour,\r\n\r\nVotre code de connexion EchoPlan : " . $code . "\r\n\r\n" .
    "Il est valable quinze minutes. Si vous n'avez rien demandé, ignorez ce message : " .
    "sans ce code, personne ne peut se connecter à votre compte.\r\n";
  $entetes = 'From: EchoPlan <' . $expediteur . ">\r\n" .
    "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit";
  if (!mail($email, $sujet, $texte, $entetes)) {
    sortir(['ok' => false, 'raison' => 'Le code n’a pas pu partir. Réessayez dans un instant.']);
  }
  sortir(['ok' => true]);
}

$identifiant = trim((string) ($corps['identifiant'] ?? ''));
if ($identifiant === '' || strlen($identifiant) > 191) {
  sortir(['ok' => false, 'raison' => 'Identifiant manquant.']);
}

$db = base();

/**
 * La requête préparée, ou `false` si la base ne la connaît pas (colonne pas
 * encore migrée) — que mysqli le dise par `false` (PHP 7) ou par une
 * exception (PHP 8.1 et suivants).
 */
function prepareTolerant(mysqli $db, string $sql) {
  try {
    return mysqli_prepare($db, $sql);
  } catch (Throwable $e) {
    return false;
  }
}

/**
 * Le compte, s'il existe — avec l'échéance de son abonnement quand la base
 * la connaît (`pro_echeance`, voir migration-abonnement.sql ; sans elle,
 * `null` : on ne sait pas, on ne retire rien).
 */
function compteDe(mysqli $db, string $identifiant): ?array {
  $req = prepareTolerant($db, 'SELECT id, pro, plans, pro_echeance FROM comptes WHERE identifiant = ?');
  if (!$req) {
    $req = mysqli_prepare($db, 'SELECT id, pro, plans, NULL AS pro_echeance FROM comptes WHERE identifiant = ?');
  }
  mysqli_stmt_bind_param($req, 's', $identifiant);
  mysqli_stmt_execute($req);
  $res = mysqli_stmt_get_result($req);
  $ligne = mysqli_fetch_assoc($res);
  return $ligne ?: null;
}

/**
 * INSCRIRE L'ABONNEMENT QU'APPLE A SIGNÉ — `comptes.pro = 'abonnement'`, et
 * son échéance si la base a la colonne. Rend `false` si la transaction est
 * déjà attachée à UN AUTRE compte : une preuve recopiée ne fait pas autant
 * d'abonnés qu'on veut (une transaction, un compte ; supprimer le compte la
 * libère). Un ancien code (`pro = 'code'`) n'est jamais écrasé.
 */
function inscrireAbonnement(mysqli $db, array $compte, array $preuve): bool {
  if ($preuve['transaction'] !== '') {
    $req = prepareTolerant($db, 'SELECT id FROM comptes WHERE apple_transaction = ? AND id <> ?');
    if ($req) {
      mysqli_stmt_bind_param($req, 'si', $preuve['transaction'], $compte['id']);
      mysqli_stmt_execute($req);
      if (mysqli_fetch_assoc(mysqli_stmt_get_result($req))) {
        return false;
      }
    }
  }
  $pro = $compte['pro'] === 'code' ? 'code' : 'abonnement';
  $req = prepareTolerant($db, 'UPDATE comptes SET pro = ?, pro_echeance = ?, apple_transaction = ? WHERE id = ?');
  if ($req) {
    mysqli_stmt_bind_param($req, 'sisi', $pro, $preuve['expiration'], $preuve['transaction'], $compte['id']);
  } else {
    $req = mysqli_prepare($db, 'UPDATE comptes SET pro = ? WHERE id = ?');
    mysqli_stmt_bind_param($req, 'si', $pro, $compte['id']);
  }
  mysqli_stmt_execute($req);
  return true;
}

/** base64url → octets. */
function b64url(string $s): string {
  return (string) base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/** Les clés publiques d'Apple, gardées une journée. */
function clesApple(): array {
  $cache = sys_get_temp_dir() . '/echoplan-apple-keys.json';
  if (is_readable($cache) && time() - (int) filemtime($cache) < 86400) {
    $lu = json_decode((string) file_get_contents($cache), true);
    if (is_array($lu['keys'] ?? null)) {
      return $lu['keys'];
    }
  }
  $curl = curl_init('https://appleid.apple.com/auth/keys');
  curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6]);
  $brut = (string) curl_exec($curl);
  curl_close($curl);
  $lu = json_decode($brut, true);
  if (!is_array($lu['keys'] ?? null)) {
    return [];
  }
  @file_put_contents($cache, $brut);
  return $lu['keys'];
}

/** Une longueur DER. */
function derLongueur(int $n): string {
  if ($n < 128) {
    return chr($n);
  }
  $octets = ltrim(pack('N', $n), "\0");
  return chr(0x80 | strlen($octets)) . $octets;
}

/** Un entier DER (positif : un zéro devant si le bit de poids fort est levé). */
function derEntier(string $octets): string {
  $octets = ltrim($octets, "\0");
  if ($octets === '' || ord($octets[0]) > 127) {
    $octets = "\0" . $octets;
  }
  return "\x02" . derLongueur(strlen($octets)) . $octets;
}

/** La clé publique RSA d'une JWK (n, e), au format PEM qu'OpenSSL lit. */
function pemDeJwk(string $n, string $e): string {
  $rsa = derEntier(b64url($n)) . derEntier(b64url($e));
  $rsa = "\x30" . derLongueur(strlen($rsa)) . $rsa;
  // rsaEncryption (1.2.840.113549.1.1.1), paramètres NULL.
  $algo = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";
  $bits = "\x03" . derLongueur(strlen($rsa) + 1) . "\x00" . $rsa;
  $spki = "\x30" . derLongueur(strlen($algo) + strlen($bits)) . $algo . $bits;
  return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/**
 * LE JETON D'IDENTITÉ D'APPLE — signé RS256 par Apple, émis pour CET
 * utilisateur (`sub`), pas encore expiré ; et pour cette application, si
 * `APPLE_BUNDLE_ID` est renseigné dans la configuration.
 */
function jetonAppleValide(string $sub, string $jwt): bool {
  $parts = explode('.', $jwt);
  if (count($parts) !== 3) {
    return false;
  }
  $entete = json_decode(b64url($parts[0]), true);
  $charge = json_decode(b64url($parts[1]), true);
  if (!is_array($entete) || !is_array($charge) || ($entete['alg'] ?? '') !== 'RS256') {
    return false;
  }
  $cle = null;
  foreach (clesApple() as $k) {
    if (($k['kid'] ?? '') === ($entete['kid'] ?? '') && isset($k['n'], $k['e'])) {
      $cle = $k;
    }
  }
  if (!$cle) {
    return false;
  }
  $signe = openssl_verify(
    $parts[0] . '.' . $parts[1],
    b64url($parts[2]),
    pemDeJwk($cle['n'], $cle['e']),
    OPENSSL_ALGO_SHA256,
  );
  if ($signe !== 1) {
    return false;
  }
  if (($charge['iss'] ?? '') !== 'https://appleid.apple.com') {
    return false;
  }
  if ((int) ($charge['exp'] ?? 0) < time()) {
    return false;
  }
  if ((string) ($charge['sub'] ?? '') !== $sub) {
    return false;
  }
  if (defined('APPLE_BUNDLE_ID') && APPLE_BUNDLE_ID !== '' && ($charge['aud'] ?? '') !== APPLE_BUNDLE_ID) {
    return false;
  }
  return true;
}

/**
 * LA PREUVE DE CHAQUE MÉTHODE — `null` si elle tient, sinon la raison du
 * refus. Rien n'est créé, rien n'est délivré avant elle.
 */
function preuveRefusee(mysqli $db, string $identifiant, array $corps): ?string {
  if (strncmp($identifiant, 'email:', 6) === 0) {
    $email = substr($identifiant, 6);
    $code = preg_replace('/\D/', '', (string) ($corps['code'] ?? ''));
    if (strlen($code) !== 6) {
      return 'Entrez le code reçu par e-mail.';
    }
    $req = mysqli_prepare($db, 'SELECT empreinte, expire, essais FROM codes_email WHERE email = ?');
    mysqli_stmt_bind_param($req, 's', $email);
    mysqli_stmt_execute($req);
    $ligne = mysqli_fetch_assoc(mysqli_stmt_get_result($req));
    if (!$ligne || (int) $ligne['expire'] < time()) {
      return 'Ce code a expiré : demandez-en un nouveau.';
    }
    if ((int) $ligne['essais'] >= 5) {
      return 'Trop d’essais : demandez un nouveau code.';
    }
    if (!hash_equals((string) $ligne['empreinte'], empreinteDuCode($email, $code))) {
      $req = mysqli_prepare($db, 'UPDATE codes_email SET essais = essais + 1 WHERE email = ?');
      mysqli_stmt_bind_param($req, 's', $email);
      mysqli_stmt_execute($req);
      return 'Code incorrect.';
    }
    // Un code ne sert qu'une fois.
    $req = mysqli_prepare($db, 'UPDATE codes_email SET expire = 0 WHERE email = ?');
    mysqli_stmt_bind_param($req, 's', $email);
    mysqli_stmt_execute($req);
    return null;
  }
  if (strncmp($identifiant, 'google:', 7) === 0) {
    // La signature que auth-google.php a posée sur l'identité reçue de Google.
    $attendue = hash_hmac(
      'sha256',
      $identifiant . '|' . (string) ($corps['email'] ?? '') . '|' . (string) ($corps['prenom'] ?? ''),
      SECRET_HMAC,
    );
    return hash_equals($attendue, (string) ($corps['sig'] ?? '')) ? null : 'Connexion Google non vérifiée : recommencez.';
  }
  if (strncmp($identifiant, 'apple:', 6) === 0) {
    return jetonAppleValide(substr($identifiant, 6), (string) ($corps['jetonApple'] ?? ''))
      ? null
      : 'Connexion Apple non vérifiée : recommencez.';
  }
  return 'Méthode de connexion inconnue.';
}

if ($action === 'connecter') {
  $appareil = trim((string) ($corps['appareil'] ?? ''));
  if ($appareil === '' || strlen($appareil) > 191) {
    sortir(['ok' => false, 'raison' => 'Appareil manquant.']);
  }
  // LA PREUVE AVANT TOUT : aucun compte créé, aucun jeton délivré sans elle.
  $refus = preuveRefusee($db, $identifiant, $corps);
  if ($refus !== null) {
    sortir(['ok' => false, 'raison' => $refus]);
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
    'codes' => codesInternesOuverts(),
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

/*
  UN ABONNEMENT ÉCHU RETOMBE. L'échéance inscrite avec la preuve d'Apple
  passée, le Pro par abonnement s'en va : un renouvellement le rendra, à la
  prochaine preuve que l'app enverra. Sans échéance connue (base pas
  migrée), on ne retire rien.
*/
if ($compte['pro'] === 'abonnement' && $compte['pro_echeance'] !== null
  && (int) $compte['pro_echeance'] <= (int) floor(microtime(true) * 1000)) {
  $req = mysqli_prepare($db, "UPDATE comptes SET pro = '' WHERE id = ?");
  mysqli_stmt_bind_param($req, 'i', $compte['id']);
  mysqli_stmt_execute($req);
  $compte['pro'] = '';
}

if ($action === 'etat') {
  sortir(['ok' => true, 'pro' => $compte['pro'], 'plans' => (int) $compte['plans'], 'codes' => codesInternesOuverts()]);
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
  if (!codesInternesOuverts()) {
    sortir(['ok' => false, 'raison' => 'Les codes internes sont fermés.']);
  }
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

/*
  SUPPRIMER SON COMPTE L'EFFACE D'ICI AUSSI — ses plans d'abord, puis le
  compte (ses appareils partent avec, par la clé étrangère). La page
  Confidentialité le promettait ; le serveur n'avait pas de quoi le tenir.
*/
if ($action === 'supprimer') {
  $req = mysqli_prepare($db, 'DELETE FROM plans WHERE identifiant = ?');
  mysqli_stmt_bind_param($req, 's', $identifiant);
  mysqli_stmt_execute($req);
  $req = mysqli_prepare($db, 'DELETE FROM comptes WHERE id = ?');
  mysqli_stmt_bind_param($req, 'i', $compte['id']);
  mysqli_stmt_execute($req);
  sortir(['ok' => true]);
}

// Un plan supprimé du téléphone ne reste pas sur le serveur.
if ($action === 'retirer') {
  $scan = trim((string) ($corps['scan'] ?? ''));
  $req = mysqli_prepare($db, 'DELETE FROM plans WHERE identifiant = ? AND scan = ?');
  mysqli_stmt_bind_param($req, 'ss', $identifiant, $scan);
  mysqli_stmt_execute($req);
  sortir(['ok' => true]);
}

/*
  LIRE UN PLAN PAPIER — relevé du patron : « une lecture de plan papier, à la
  place de "Comment ça marche" ; réservée au Pro, avec un essai offert ».

  QUI A DROIT À UNE LECTURE :
    — le Pro que la BASE connaît (`comptes.pro` : 'code' ou 'abonnement') ;
    — tout compte, une fois : la lecture d'essai.
  Et personne plus de LECTURES_PAR_JOUR fois par jour : chaque lecture coûte
  un appel à l'IA.

  LE SERVEUR NE CROIT PLUS L'APP SUR PAROLE — revue « sécurité » : le champ
  `abonne` envoyé par l'app suffisait à passer Pro ; n'importe qui pouvait
  l'écrire et lire des plans à volonté, aux frais de l'IA. Il est ignoré :
  seul l'état du compte en base compte.

  L'ABONNEMENT APP STORE SE PROUVE — l'app joint `preuve`, la transaction
  d'abonnement telle qu'Apple l'a signée (StoreKit 2). `verifierPreuveApple`
  la vérifie (chaîne jusqu'à Apple Root CA - G3, signature, application,
  produit Pro, échéance à venir, pas de remboursement) ; valide, elle inscrit
  `comptes.pro = 'abonnement'` et son échéance, et la lecture passe en Pro.
  Une preuve absente ou refusée ne bloque rien : le compte garde ses droits.

  AU DÉPLOIEMENT :
    — renseigner `const APPLE_BUNDLE_ID = 'fr.echoplan.app';` dans
      config-echoplan.php (vide, AUCUNE preuve n'est acceptée) ;
    — déposer preuve-apple.php à côté d'api.php ;
    — importer migration-abonnement.sql (l'échéance, et la transaction qui
      attache un abonnement à un seul compte). Sans elle, le Pro s'inscrit
      quand même, mais ne retombe pas tout seul à l'échéance ;
    — aucune clé privée, aucun secret Apple : la vérification n'utilise que
      ce qu'Apple publie.

  Une photo qui n'est pas un plan ne consomme pas l'essai. Rien n'est gardé :
  ni l'image, ni la lecture — seulement le compte des lectures.
*/
if ($action === 'lire_plan') {
  @set_time_limit(190);
  $req = mysqli_prepare($db, 'SELECT lectures, lectures_jour, jour_lecture FROM comptes WHERE id = ?');
  if (!$req) {
    sortir(['ok' => false, 'raison' => 'La base n’est pas à jour : importez migration-lecture.sql.']);
  }
  mysqli_stmt_bind_param($req, 'i', $compte['id']);
  mysqli_stmt_execute($req);
  $l = mysqli_fetch_assoc(mysqli_stmt_get_result($req)) ?: ['lectures' => 0, 'lectures_jour' => 0, 'jour_lecture' => null];
  $estPro = $compte['pro'] === 'code' || $compte['pro'] === 'abonnement';
  if (!$estPro && is_string($corps['preuve'] ?? null)) {
    $preuve = verifierPreuveApple($corps['preuve'], (int) floor(microtime(true) * 1000));
    if ($preuve !== null && inscrireAbonnement($db, $compte, $preuve)) {
      $estPro = true;
    }
  }
  if (!$estPro && (int) $l['lectures'] >= 1) {
    sortir(['ok' => false, 'raison' => 'pro', 'message' => 'Votre lecture d’essai est utilisée : la lecture de plans papier est réservée au Pro.']);
  }
  $parJour = defined('LECTURES_PAR_JOUR') ? (int) LECTURES_PAR_JOUR : 20;
  $duJour = ($l['jour_lecture'] ?? '') === date('Y-m-d') ? (int) $l['lectures_jour'] : 0;
  if ($duJour >= $parJour) {
    sortir(['ok' => false, 'raison' => 'quota', 'message' => 'Vous avez lu ' . $parJour . ' plans aujourd’hui : la lecture reprend demain.']);
  }
  require __DIR__ . '/lecture-plan.php';
  $r = lirePlanPapier(
    (string) ($corps['image'] ?? ''),
    (string) ($corps['media'] ?? 'image/jpeg'),
    is_array($corps['textes'] ?? null) ? $corps['textes'] : [],
  );
  if (!$r['ok']) {
    sortir($r);
  }
  // Une lecture comptée seulement si c'était un plan.
  if (!empty($r['lecture']['est_un_plan'])) {
    $req = mysqli_prepare(
      $db,
      'UPDATE comptes SET lectures = lectures + 1, '
        . 'lectures_jour = IF(jour_lecture = CURDATE(), lectures_jour + 1, 1), '
        . 'jour_lecture = CURDATE() WHERE id = ?',
    );
    mysqli_stmt_bind_param($req, 'i', $compte['id']);
    mysqli_stmt_execute($req);
  }
  sortir(['ok' => true, 'lecture' => $r['lecture'], 'essai' => !$estPro]);
}

sortir(['ok' => false, 'raison' => 'Action inconnue.']);
