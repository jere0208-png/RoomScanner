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
// jetons de connexion et signe ses abonnements. Vide : la connexion Apple
// ne vérifie pas l'application destinataire, et AUCUN abonnement App Store
// n'est reconnu (la lecture de plans des abonnés retombe sur l'essai).
const APPLE_BUNDLE_ID = 'fr.echoplan.app';

// ---- LA LECTURE DE PLANS PAPIER (Claude, d'Anthropic) — console.anthropic.com
// → API Keys. La clé ne quitte jamais le serveur. Vide : la lecture se dit
// « pas encore activée ».
const ANTHROPIC_CLE = 'À_REMPLIR';
// Le modèle qui lit les SYMBOLES ÉLECTRIQUES : Sonnet coûte quelques
// centimes par plan.
const ANTHROPIC_MODELE = 'claude-sonnet-5-5';
// Facultatif — le modèle qui lit les MURS, LES PORTES, LES PIÈCES ET LES
// COTES. Sans cette ligne : Opus, le plus juste sur les cloisons fines et
// les portes (quelques dizaines de centimes par plan). 'claude-sonnet-5-5'
// pour une lecture moins chère.
// const ANTHROPIC_MODELE_PLAN = 'claude-opus-5-5';
// Le plafond de lectures par compte et par jour (chaque lecture est payée).
const LECTURES_PAR_JOUR = 20;

// LES CODES INTERNES (table codes_promo) : true le temps du développement,
// pour donner le Pro sans l'App Store ; false AVANT la publication — la
// règle 3.1.1 d'Apple interdit un code maison dans l'app publiée.
const CODES_INTERNES = false;

// ---- LE MODE DIAGNOSTIC — réservé à l'administrateur.
//
// L'app est un dépôt PUBLIC : aucune adresse d'administrateur n'y figure en
// dur. C'est le serveur qui sait qui est administrateur, par cette liste. Le
// compte dont l'e-mail (en base) y figure reçoit `admin: true` dans les
// réponses de connexion et d'état ; lui seul voit le réglage « Mode
// diagnostic » dans l'app, et lui seul peut déposer un diagnostic — le
// serveur le revérifie à chaque envoi. Laisser VIDE désactive tout.
// Comparaison insensible à la casse, adresses en minuscules.
//   const ADMIN_EMAILS = ['prenom.nom@example.com'];
const ADMIN_EMAILS = [];

// ---- OÙ ATTERRISSENT LES DIAGNOSTICS — un dépôt GitHub PRIVÉ.
//
// Quand l'administrateur appuie sur le bouton diagnostic, l'app envoie au
// serveur les dix dernières secondes de son écran et de ses gestes, le plan
// courant et un message ; le serveur les dépose dans ce dépôt (un dossier
// horodaté par rapport : message.md, journal.json, ecran.mp4).
//
// DIAG_GITHUB_DEPOT : « proprietaire/depot », un dépôt PRIVÉ créé pour ça.
// DIAG_GITHUB_JETON : un jeton GitHub à PORTÉE FINE (fine-grained), avec la
//   seule permission « Contents: Read and write » sur CE dépôt-là. Il ne
//   vit QUE dans cette configuration serveur, jamais dans l'app.
// Vides : le serveur range les diagnostics dans un dossier `diagnostics/`
// protégé à côté d'api.php, et répond `range: 'serveur'`.
const DIAG_GITHUB_DEPOT = '';
const DIAG_GITHUB_JETON = '';
