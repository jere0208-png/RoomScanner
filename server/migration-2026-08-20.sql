-- Migration du 2026-08-20 : l'essai gratuit passe du compte au TÉLÉPHONE.
-- À exécuter UNE FOIS dans phpMyAdmin (onglet SQL) sur la base existante.

ALTER TABLE appareils ADD COLUMN plans INT NOT NULL DEFAULT 0;
ALTER TABLE appareils DROP INDEX appareil;
ALTER TABLE appareils ADD UNIQUE KEY app_cpt (appareil, compte_id);

-- Reporte l'essai déjà consommé par les comptes sur leurs appareils.
UPDATE appareils a
  JOIN comptes c ON c.id = a.compte_id
  SET a.plans = GREATEST(a.plans, c.plans);
