-- EchoPlan — la connexion par e-mail se prouve par un code.
-- À importer une fois via phpMyAdmin (onglet « Importer »), après schema.sql.
--
-- Le code lui-même n'est jamais gardé : seulement son EMPREINTE (HMAC), son
-- échéance et le nombre d'essais. `envoye`, `envois` et `fenetre` limitent la
-- cadence : une minute entre deux envois, cinq envois par heure.

CREATE TABLE IF NOT EXISTS codes_email (
  email VARCHAR(191) NOT NULL PRIMARY KEY,
  empreinte CHAR(64) NOT NULL,
  expire INT NOT NULL,
  essais INT NOT NULL DEFAULT 0,
  envoye INT NOT NULL,
  envois INT NOT NULL DEFAULT 1,
  fenetre INT NOT NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- FACULTATIF — le code « CARIDI12 » a été publié dans schema.sql (dépôt
-- public) : n'importe qui avec un compte pouvait s'en servir pour passer
-- Pro. Les comptes déjà débloqués le restent. Pour le fermer, retirez les
-- deux tirets de la ligne suivante, et créez un nouveau code privé :
-- UPDATE codes_promo SET actif = 0 WHERE code = 'CARIDI12';
