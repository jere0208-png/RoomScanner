-- EchoPlan — schéma MySQL pour la base OVH.
-- À importer une fois via phpMyAdmin (onglet « Importer ») ou :
--   mysql -h <hôte> -u <utilisateur> -p <base> < schema.sql

CREATE TABLE IF NOT EXISTS comptes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- L'identifiant que l'app fabrique : apple:xxx, google:xxx, email:xxx.
  identifiant VARCHAR(191) NOT NULL UNIQUE,
  prenom VARCHAR(80) NULL,
  email VARCHAR(191) NULL,
  -- '' = gratuit ; 'code' ou 'abonnement' = Pro, et par quelle porte.
  pro ENUM('', 'code', 'abonnement') NOT NULL DEFAULT '',
  -- Plans consommés sur le palier gratuit (le trousseau du téléphone
  -- garde le même compteur ; le serveur fait foi quand les deux divergent).
  plans INT NOT NULL DEFAULT 0,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vu_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- L'ESSAI GRATUIT APPARTIENT AU TÉLÉPHONE, pas au compte : un appareil
-- (identifiant stable posé par l'app dans son trousseau) peut porter
-- autant de comptes qu'on veut, mais son compteur `plans` est UN — le
-- relevé offert se consomme une fois par téléphone, quel que soit le
-- compte. Réinstaller ne le contourne pas ; changer de téléphone, si.
CREATE TABLE IF NOT EXISTS appareils (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appareil VARCHAR(191) NOT NULL,
  compte_id INT NOT NULL,
  plans INT NOT NULL DEFAULT 0,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY app_cpt (appareil, compte_id),
  FOREIGN KEY (compte_id) REFERENCES comptes (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Les codes du patron. `pour_cent` = 100 débloque le Pro sans paiement.
CREATE TABLE IF NOT EXISTS codes_promo (
  code VARCHAR(40) PRIMARY KEY,
  pour_cent INT NOT NULL DEFAULT 100,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  utilisations INT NOT NULL DEFAULT 0
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

INSERT INTO codes_promo (code, pour_cent, actif)
VALUES ('CARIDI12', 100, 1)
ON DUPLICATE KEY UPDATE actif = 1;

-- L'offre de bienvenue : -20 % sur la première souscription, portée par
-- le popup « Surprise ! » de l'app. Une REMISE, pas un déverrouillage :
-- sous 100 %, l'app baisse le prix affiché, elle n'ouvre pas le Pro.
INSERT INTO codes_promo (code, pour_cent, actif)
VALUES ('FIRST20', 20, 1)
ON DUPLICATE KEY UPDATE actif = 1;
