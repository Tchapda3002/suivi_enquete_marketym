-- ============================================================
-- MIGRATION V2: Quotas dynamiques et structure amelioree
-- A executer dans Supabase SQL Editor
-- ============================================================

-- 1. Ajouter is_admin a enqueteurs
ALTER TABLE enqueteurs ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Ajouter derniere_connexion si n'existe pas
ALTER TABLE enqueteurs ADD COLUMN IF NOT EXISTS derniere_connexion TIMESTAMPTZ;

-- 3. Ajouter colonnes segmentation a enquetes
ALTER TABLE enquetes ADD COLUMN IF NOT EXISTS segmentation_question_id TEXT;
ALTER TABLE enquetes ADD COLUMN IF NOT EXISTS segmentation_question_text TEXT;

-- 4. Creer table quotas
CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquete_id UUID REFERENCES enquetes(id) ON DELETE CASCADE,
  affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,
  segment_value TEXT NOT NULL,
  objectif INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ajouter contrainte unique si n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotas_unique_constraint'
  ) THEN
    ALTER TABLE quotas ADD CONSTRAINT quotas_unique_constraint
    UNIQUE (enquete_id, affectation_id, segment_value);
  END IF;
END $$;

-- 5. Creer table completions_segments
CREATE TABLE IF NOT EXISTS completions_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,
  segment_value TEXT NOT NULL,
  completions INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ajouter contrainte unique si n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'completions_segments_unique'
  ) THEN
    ALTER TABLE completions_segments ADD CONSTRAINT completions_segments_unique
    UNIQUE (affectation_id, segment_value);
  END IF;
END $$;

-- 6. Trigger pour updated_at sur completions_segments
DROP TRIGGER IF EXISTS set_updated_at_completions_segments ON completions_segments;
CREATE TRIGGER set_updated_at_completions_segments
BEFORE UPDATE ON completions_segments
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Desactiver RLS sur nouvelles tables
ALTER TABLE quotas DISABLE ROW LEVEL SECURITY;
ALTER TABLE completions_segments DISABLE ROW LEVEL SECURITY;

-- 8. Creer enqueteur ADMIN par defaut (si n'existe pas)
INSERT INTO enqueteurs (identifiant, nom, prenom, mot_de_passe, is_admin, actif)
VALUES ('ADMIN', 'Administrateur', 'Systeme', 'admin2024', TRUE, TRUE)
ON CONFLICT (identifiant) DO UPDATE SET is_admin = TRUE;

-- 9. Migrer donnees de completions_pays vers completions_segments
INSERT INTO completions_segments (affectation_id, segment_value, completions)
SELECT cp.affectation_id, p.nom, cp.completions
FROM completions_pays cp
JOIN pays p ON cp.pays_id = p.id
WHERE cp.completions > 0
ON CONFLICT (affectation_id, segment_value)
DO UPDATE SET completions = EXCLUDED.completions;

-- 10. Verification
SELECT 'Migration V2 terminee avec succes!' as status;
SELECT
  (SELECT COUNT(*) FROM enqueteurs WHERE is_admin = TRUE) as admin_count,
  (SELECT COUNT(*) FROM quotas) as quotas_count,
  (SELECT COUNT(*) FROM completions_segments) as segments_count;
