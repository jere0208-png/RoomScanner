-- EchoPlan — l'abonnement App Store, prouvé par Apple, inscrit au compte.
-- À importer une fois via phpMyAdmin (onglet « Importer »), sur la base
-- existante (une base neuve créée avec schema.sql a déjà ces colonnes).
--
-- `pro_echeance` : la fin de la période payée (millisecondes), lue dans la
-- transaction signée par Apple — passée, le Pro par abonnement retombe.
-- `apple_transaction` : la transaction d'origine (`originalTransactionId`) ;
-- un abonnement ne fait le Pro que d'un seul compte.

ALTER TABLE comptes
  ADD COLUMN pro_echeance BIGINT NULL,
  ADD COLUMN apple_transaction VARCHAR(64) NULL,
  ADD KEY apple_transaction (apple_transaction);
