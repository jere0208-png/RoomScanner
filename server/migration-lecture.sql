-- EchoPlan — la lecture de plans papier compte ses lectures.
-- À importer une fois via phpMyAdmin (onglet « Importer »), sur la base
-- existante (une base neuve créée avec schema.sql a déjà ces colonnes).
--
-- `lectures` : combien de plans papier ce compte a fait lire — la première
-- est l'essai offert, les suivantes demandent le Pro. `lectures_jour` et
-- `jour_lecture` plafonnent les lectures d'une journée : chacune coûte un
-- appel à l'IA.

ALTER TABLE comptes
  ADD COLUMN lectures INT NOT NULL DEFAULT 0,
  ADD COLUMN lectures_jour INT NOT NULL DEFAULT 0,
  ADD COLUMN jour_lecture DATE NULL;
