<?php
// EchoPlan — configuration serveur.
// COPIEZ ce fichier en `config-echoplan.php` (jamais versionné) et
// remplissez-le. Le nom porte « echoplan » pour ne JAMAIS écraser le
// config.php d'un site déjà en place sur le même hébergement — c'est
// arrivé sur bourseur.fr.

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

// ---- L'expéditeur des codes de connexion par e-mail (une adresse du
// domaine de l'hébergement, sans quoi les messageries les classent en
// indésirables). Vide : no-reply@<domaine>.
const EMAIL_EXPEDITEUR = 'no-reply@VOTRE-DOMAINE';

// ---- L'identifiant de l'app (« bundle ID ») pour lequel Apple émet ses
// jetons de connexion. Vide : on vérifie la signature d'Apple, l'utilisateur
// et l'expiration, mais pas l'application destinataire.
const APPLE_BUNDLE_ID = '';

// ---- LA LECTURE DE PLANS PAPIER (Claude, d'Anthropic) — console.anthropic.com
// → API Keys. La clé ne quitte jamais le serveur. Vide : la lecture se dit
// « pas encore activée ».
const ANTHROPIC_CLE = 'À_REMPLIR';
// Le modèle qui lit : Sonnet coûte quelques centimes par plan ; Opus lit
// mieux les plans chargés, pour cinq fois plus.
const ANTHROPIC_MODELE = 'claude-sonnet-5-5';
// Le plafond de lectures par compte et par jour (chaque lecture est payée).
const LECTURES_PAR_JOUR = 20;
