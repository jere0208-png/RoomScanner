# Configurer les connexions et la base OVH

Trois chantiers indépendants. L'app marche sans eux (tout en local) ; chacun
s'allume quand sa configuration est faite, sans rebrancher le code.

## 1. Connexion Apple (10 min + compte développeur)

Le code est prêt (`RoomScanAccount.swift`) et l'entitlement est câblé au
projet (`ios/RoomScanner/RoomScanner.entitlements`). Il ne manque que la
signature — c'est elle qui active la capacité.

1. **developer.apple.com** → Certificates, Identifiers & Profiles →
   **Identifiers** → votre App ID (créez-le si besoin, avec le bundle id
   définitif — remplacez le `org.reactjs.native.example…` actuel dans Xcode
   ou dans `project.pbxproj`, par ex. `fr.echoplan.app`).
2. Cochez la capability **« Sign in with Apple »** sur cet App ID,
   enregistrez.
3. Regénérez le **profil de provisionnement** qui utilise cet App ID
   (Xcode le fait seul en signature automatique).
4. C'est tout côté portail. Dès que l'app est **signée** avec ce profil
   (TestFlight, App Store, ou build de développement signé), le bouton
   « Continuer avec Apple » fonctionne. Sur l'IPA non signé de la CI, il
   continue d'afficher son message et renvoie vers l'e-mail.

## 2. Base OVH (30 min)

Une app ne parle jamais à MySQL en direct : le dossier `server/` porte la
petite API qui s'y colle. Prérequis : un **hébergement web OVH** (PHP) avec
sa base — une base seule ne suffit pas, il faut où poser les `.php`.

1. **Créer la base** (espace client OVH → Hébergements → Bases de données) :
   notez l'hôte (`xxxxx.mysql.db`), le nom, l'utilisateur, le mot de passe.
2. **Importer le schéma** : phpMyAdmin → votre base → Importer →
   `server/schema.sql`. Trois tables (comptes, appareils, codes_promo) et
   deux codes déjà semés : CARIDI12 (100 % — déverrouille le Pro) et
   FIRST20 (20 % — la remise de bienvenue du popup « Surprise ! », qui
   baisse le prix sans rien déverrouiller).
3. **Téléverser l'API** : par FTP (ou le gestionnaire de fichiers OVH),
   copiez `server/api.php` et `server/auth-google.php` dans un dossier du
   site, par ex. `www/echoplan/`.
4. **Configurer** : copiez `server/config-echoplan.exemple.php` en `config-echoplan.php` DANS
   LE MÊME DOSSIER sur le serveur, remplissez la base et le secret :
   `php -r "echo bin2hex(random_bytes(32));"` (ou n'importe quel générateur
   de 64 hexadécimaux). Ne versionnez jamais `config-echoplan.php` — et le nom porte « echoplan » pour ne jamais écraser le config.php d’un site déjà en place.
5. **Brancher l'app** : dans `src/config/serveur.ts`, posez
   `url: 'https://votre-domaine.fr/echoplan'`. Dès lors : le verrou « un
   compte par téléphone » se juge AUSSI en base, le quota et le Pro se
   synchronisent, et les codes promo se vérifient dans `codes_promo` (vous
   en ajoutez d'autres par une simple ligne SQL).

L'app reste **offline-first** : serveur muet = comportement local, jamais un
chantier bloqué.

## 3. Connexion Google (20 min, après le 2)

Sans SDK dans l'app : le flux OAuth passe par votre serveur, l'app n'ouvre
qu'une feuille web sécurisée.

1. **console.cloud.google.com** → créez un projet « EchoPlan » →
   **API et services → Écran de consentement OAuth** : type Externe,
   nom EchoPlan, votre e-mail ; ajoutez les scopes de base
   (openid, email, profile) ; publiez l'écran.
2. **Identifiants → Créer des identifiants → ID client OAuth** : type
   **« Application Web »** (oui, Web : c'est le serveur qui parle à Google,
   pas l'app). URI de redirection autorisée :
   `https://votre-domaine.fr/echoplan/auth-google.php`
3. Copiez l'**ID client** et le **secret** dans `config-echoplan.php`
   (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT).
4. C'est tout : le bouton « Continuer avec Google » détecte que
   `SERVEUR.url` est renseigné et ouvre le flux. L'identité revient signée
   (HMAC) par le schéma `echoplan://google`, livrée uniquement à la feuille
   web qui l'a demandée.

## 4. Lecture des plans papier (10 min, après le 2)

La photo d'un plan papier est lue par Claude (Anthropic) au travers de votre
serveur : la clé reste sur le serveur, jamais dans l'app.

1. **Créer la clé** : console.anthropic.com → API Keys → Create Key. Ajouter un
   moyen de paiement (Billing) : une lecture coûte quelques centimes avec
   Sonnet.
2. **La poser** dans `config-echoplan.php`, sur le serveur :
   `const ANTHROPIC_CLE = 'sk-ant-…';` — avec, au besoin,
   `ANTHROPIC_MODELE` (`claude-sonnet-5-5` par défaut, `claude-opus-5-5` lit
   mieux les plans chargés pour cinq fois plus) et `LECTURES_PAR_JOUR` (20).
3. **Mettre la base à jour** : phpMyAdmin → Importer → `migration-lecture.sql`
   (trois colonnes sur `comptes` : le compte des lectures et le plafond du
   jour).
4. **Téléverser** `lecture-plan.php` à côté de `api.php`, et le nouvel
   `api.php`.

Sans clé, l'app dit « La lecture de plans n'est pas encore activée sur le
serveur » : rien ne casse.

## La page vitrine (2 min)

`server/echoplan.html` est la page de présentation de l'app : une seule
page, un seul fichier (icône, animation du plan et pictogrammes embarqués
en base64 — rien d'autre à téléverser), responsive. Le bouton App Store est
volontairement INACTIF (« en attente ») tant que l'app n'est pas publiée :
le jour venu, remplacer son `href="#"` par l'URL de la fiche.

Déploiement : copier `server/echoplan.html` dans le dossier `www/echoplan/`
de l'hébergement (comme `api.php`) → https://bourseur.fr/echoplan/echoplan.html

## Ce qui reste volontairement dehors

- **L'abonnement 4,90 €** passe par StoreKit/App Store Connect (produit
  `echoplan.pro.mensuel`), pas par la base — Apple l'exige pour du contenu
  numérique. La base ne fait que MÉMORISER l'état Pro.
- **Aucun mot de passe** : Apple et Google prouvent l'identité ; l'e-mail
  local reste sans secret (rien à protéger côté serveur, rien à se faire
  voler). Si un jour un vrai login e-mail/mot de passe est voulu, il faudra
  du hachage (password_hash) et un reset — à ne faire que si nécessaire.
