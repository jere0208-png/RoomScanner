-- LES PLANS SUIVENT LE COMPTE.
--
-- Relevé du chantier : « que les photos soient lues même s'il réinstalle
-- l'application, tant qu'il est sur son compte ». Les photos vivent
-- maintenant dans la photothèque du téléphone — elles y survivent — mais un
-- scan, lui, vit dans le stockage de l'application, et celui-là part avec
-- elle. Une photo restaurée n'aurait plus de plan où se punaiser.
--
-- Un plan pèse quelques dizaines de kilo-octets : des murs, des ouvertures,
-- de l'appareillage et des renvois vers les photos. C'est du texte, il tient
-- en base sans rien coûter. Les IMAGES ne montent pas ici — elles restent
-- dans la photothèque de l'utilisateur, et le plan ne porte que leurs
-- identifiants.
--
-- À rejouer dans phpMyAdmin (OVH), une fois.

CREATE TABLE IF NOT EXISTS plans (
  -- L'identifiant du compte : le même que dans `comptes.identifiant`.
  identifiant VARCHAR(191) NOT NULL,
  -- L'identifiant du scan côté application : c'est LUI qui fait l'unicité,
  -- pour qu'un même plan renvoyé ne se duplique jamais.
  scan VARCHAR(64) NOT NULL,
  nom VARCHAR(191) NOT NULL DEFAULT '',
  -- Le plan entier, tel que l'application le sérialise.
  contenu MEDIUMTEXT NOT NULL,
  -- L'horodatage de l'application, pas celui du serveur : c'est le téléphone
  -- qui sait quand le relevé a été touché pour la dernière fois.
  maj BIGINT NOT NULL DEFAULT 0,
  recu TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (identifiant, scan),
  INDEX idx_compte (identifiant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
