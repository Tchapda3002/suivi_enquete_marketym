-- Migration 011 : Ajout date_debut_vague pour filtrer les completions par vague
-- L'enquêteur ne voit que les completions depuis cette date
-- Si NULL, toutes les completions sont visibles (comportement par défaut)

ALTER TABLE affectations ADD COLUMN IF NOT EXISTS date_debut_vague TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE affectations ADD COLUMN IF NOT EXISTS completions_vague INTEGER DEFAULT 0;

COMMENT ON COLUMN affectations.date_debut_vague IS 'Date à partir de laquelle compter les completions pour la vague en cours. NULL = tout afficher.';
COMMENT ON COLUMN affectations.completions_vague IS 'Nombre de completions depuis date_debut_vague. Mis à jour par le sync.';
