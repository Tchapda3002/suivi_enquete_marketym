-- ============================================================================
-- MIGRATION: Segmentations multiples + Lien legacy pour affectations
-- ============================================================================

-- 1. Creer la table segmentations (plusieurs segmentations par enquete)
CREATE TABLE IF NOT EXISTS segmentations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquete_id UUID NOT NULL REFERENCES enquetes(id) ON DELETE CASCADE,
    question_id VARCHAR(50) NOT NULL,          -- ID de la question QuestionPro
    question_text VARCHAR(500),                -- Texte de la question (pour affichage)
    nom VARCHAR(100) NOT NULL,                 -- Nom de la segmentation (ex: "Pays", "Secteur")
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enquete_id, question_id)            -- Une question par enquete max
);

-- 2. Modifier la table quotas pour lier a segmentation_id
-- D'abord, supprimer l'ancienne structure si elle existe
DROP TABLE IF EXISTS quotas CASCADE;

CREATE TABLE quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segmentation_id UUID NOT NULL REFERENCES segmentations(id) ON DELETE CASCADE,
    affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,  -- Optionnel: quota global ou par affectation
    segment_value VARCHAR(200) NOT NULL,       -- Ex: "Cote d'Ivoire", "Tech", "18-25"
    objectif INT NOT NULL DEFAULT 0,
    completions INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches rapides
CREATE INDEX idx_quotas_segmentation ON quotas(segmentation_id);
CREATE INDEX idx_quotas_affectation ON quotas(affectation_id);
CREATE INDEX idx_segmentations_enquete ON segmentations(enquete_id);

-- 3. Ajouter lien_legacy a la table affectations
ALTER TABLE affectations
ADD COLUMN IF NOT EXISTS lien_legacy VARCHAR(500);

-- 4. Copier les liens actuels dans lien_legacy (pour garder l'historique)
UPDATE affectations
SET lien_legacy = lien_questionnaire
WHERE lien_legacy IS NULL AND lien_questionnaire IS NOT NULL;

-- 5. Activer RLS
ALTER TABLE segmentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;

-- Policies pour segmentations
CREATE POLICY "Enable all for authenticated users" ON segmentations
    FOR ALL USING (true) WITH CHECK (true);

-- Policies pour quotas
CREATE POLICY "Enable all for authenticated users" ON quotas
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- RESUME DES CHANGEMENTS:
-- - Table segmentations: permet plusieurs segmentations par enquete
-- - Table quotas: liee a segmentation_id (plus flexible)
-- - Colonne lien_legacy: garde l'ancien lien des affectations
-- ============================================================================
