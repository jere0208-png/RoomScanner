<?php
/**
 * EchoPlan — connexion Google SANS SDK dans l'app.
 *
 * L'app ouvre cette page dans une feuille web sécurisée
 * (ASWebAuthenticationSession). Le fichier joue les deux temps du flux
 * OAuth : sans `code`, il envoie vers Google ; au retour, il échange le
 * code contre l'identité, puis renvoie vers l'app par son schéma d'URL
 * (`echoplan://google?...`), le tout SIGNÉ — l'app vérifie le HMAC avant
 * de créer le compte, personne ne forge une identité en tapant une URL.
 */
require __DIR__ . '/config-echoplan.php';

function repartir(string $url): void {
  /*
    PAS D'EN-TÊTE `Location` : l'hébergement OVH de bourseur.fr rend un 500
    dès qu'une réponse le porte (règle de sécurité du site, constatée le
    2026-08-20 — la même page en réponse 200 passe sans broncher). Une page
    minuscule redirige donc en JavaScript, avec le meta-refresh en secours ;
    la feuille web de l'app suit l'un comme l'autre, schéma echoplan://
    compris.
  */
  $safe = htmlspecialchars($url, ENT_QUOTES);
  echo '<!doctype html><meta http-equiv="refresh" content="0;url=' . $safe .
    '"><script>location.replace(' . json_encode($url) . ');</script>';
  exit;
}

if (!isset($_GET['code'])) {
  // Premier temps : envoyer chez Google. `state` contre le CSRF.
  $state = bin2hex(random_bytes(16));
  setcookie('echoplan_state', $state, [
    'expires' => time() + 600,
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
  repartir(
    'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
      'client_id' => GOOGLE_CLIENT_ID,
      'redirect_uri' => GOOGLE_REDIRECT,
      'response_type' => 'code',
      'scope' => 'openid email profile',
      'state' => $state,
      'prompt' => 'select_account',
    ]),
  );
}

// Second temps : le retour de Google.
if (($_COOKIE['echoplan_state'] ?? '') !== ($_GET['state'] ?? '-')) {
  http_response_code(400);
  exit('État invalide — refaites la connexion depuis l’app.');
}

$curl = curl_init('https://oauth2.googleapis.com/token');
curl_setopt_array($curl, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POSTFIELDS => http_build_query([
    'code' => $_GET['code'],
    'client_id' => GOOGLE_CLIENT_ID,
    'client_secret' => GOOGLE_CLIENT_SECRET,
    'redirect_uri' => GOOGLE_REDIRECT,
    'grant_type' => 'authorization_code',
  ]),
]);
$reponse = json_decode((string) curl_exec($curl), true);
curl_close($curl);

$idToken = $reponse['id_token'] ?? null;
if (!$idToken) {
  http_response_code(502);
  exit('Google n’a pas rendu d’identité — vérifiez client_id/secret.');
}

// L'id_token est un JWT ; sa charge utile (2e segment) porte sub/email/nom.
// On vient de le RECEVOIR de Google en direct (TLS) : pas besoin d'en
// revérifier la signature ici.
$charge = json_decode(
  base64_decode(strtr(explode('.', $idToken)[1], '-_', '+/')),
  true,
);
$sub = (string) ($charge['sub'] ?? '');
if ($sub === '') {
  http_response_code(502);
  exit('Identité Google illisible.');
}

$identifiant = 'google:' . $sub;
$email = (string) ($charge['email'] ?? '');
$prenom = (string) ($charge['given_name'] ?? '');
// La signature que l'app vérifie : identité non forgeable par l'URL.
$signature = hash_hmac('sha256', $identifiant . '|' . $email . '|' . $prenom, SECRET_HMAC);

repartir(RETOUR_APP . '?' . http_build_query([
  'id' => $identifiant,
  'email' => $email,
  'prenom' => $prenom,
  'sig' => $signature,
]));
