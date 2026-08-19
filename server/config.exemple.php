<?php
// EchoPlan — configuration serveur.
// COPIEZ ce fichier en `config.php` (jamais versionné) et remplissez-le.

// ---- Base de données OVH (espace client → Hébergements → Bases de données)
const DB_HOTE = 'xxxxx.mysql.db';      // ex. jere0208.mysql.db
const DB_BASE = 'echoplan';
const DB_UTILISATEUR = 'echoplan';
const DB_MOT_DE_PASSE = 'À_REMPLIR';

// ---- Secret de signature des jetons renvoyés à l'app.
// Générez-le une fois :  php -r "echo bin2hex(random_bytes(32));"
const SECRET_HMAC = 'À_REMPLIR_64_HEXA';

// ---- Connexion Google (console.cloud.google.com → Identifiants → OAuth)
// Type « Application Web », URI de redirection autorisée :
//   https://VOTRE-DOMAINE/echoplan/auth-google.php
const GOOGLE_CLIENT_ID = 'xxxxxxxx.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = 'À_REMPLIR';
const GOOGLE_REDIRECT = 'https://VOTRE-DOMAINE/echoplan/auth-google.php';

// ---- Où l'app attend le retour (schéma d'URL déclaré dans Info.plist).
const RETOUR_APP = 'echoplan://google';
