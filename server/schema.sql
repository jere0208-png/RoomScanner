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

-- Le verrou « un compte par téléphone », côté serveur : un appareil
-- (identifiant stable posé par l'app dans son trousseau) ne crée qu'un
-- compte. Réinstaller ne le contourne pas ; changer de téléphone, si.
CREATE TABLE IF NOT EXISTS appareils (
  id INT AUTO_INCREMENT PRIMARY KEY,
  appareil VARCHAR(191) NOT NULL UNIQUE,
  compte_id INT NOT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
