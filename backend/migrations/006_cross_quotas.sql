-- ============================================================================
-- MIGRATION: Quotas croises (cross-tabulation)
-- ============================================================================

-- 1. Table quota_configs : definit un groupe de quotas croises
CREATE TABLE IF NOT EXISTS quota_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquete_id UUID NOT NULL REFERENCES enquetes(id) ON DELETE CASCADE,
    nom VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table quota_config_questions : les segmentations qui composent un quota croise
CREATE TABLE IF NOT EXISTS quota_config_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quota_config_id UUID NOT NULL REFERENCES quota_configs(id) ON DELETE CASCADE,
    segmentation_id UUID NOT NULL REFERENCES segmentations(id),
    position INT NOT NULL DEFAULT 0,
    UNIQUE(quota_config_id, segmentation_id)
);

-- 3. Ajouter colonnes aux quotas existants pour les lier aux configs
ALTER TABLE quotas ADD COLUMN IF NOT EXISTS quota_config_id UUID REFERENCES quota_configs(id) ON DELETE CASCADE;
ALTER TABLE quotas ADD COLUMN IF NOT EXISTS combination JSONB;
ALTER TABLE quotas ADD COLUMN IF NOT EXISTS pourcentage NUMERIC(5,2) DEFAULT 0;

-- 4. Table completions_combinations : completions par combinaison croisee
CREATE TABLE IF NOT EXISTS completions_combinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affectation_id UUID NOT NULL REFERENCES affectations(id) ON DELETE CASCADE,
    quota_config_id UUID NOT NULL REFERENCES quota_configs(id) ON DELETE CASCADE,
    combination JSONB NOT NULL,
    completions INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(affectation_id, quota_config_id, combination)
);

-- 5. Ajouter answer_options aux segmentations (cache des options QP)
ALTER TABLE segmentations ADD COLUMN IF NOT EXISTS answer_options JSONB DEFAULT '[]';

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_quota_configs_enquete ON quota_configs(enquete_id);
CREATE INDEX IF NOT EXISTS idx_quota_config_questions_config ON quota_config_questions(quota_config_id);
CREATE INDEX IF NOT EXISTS idx_completions_combinations_affectation ON completions_combinations(affectation_id);
CREATE INDEX IF NOT EXISTS idx_completions_combinations_config ON completions_combinations(quota_config_id);
CREATE INDEX IF NOT EXISTS idx_quotas_config ON quotas(quota_config_id);

-- 7. RLS
ALTER TABLE quota_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_config_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions_combinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON quota_configs
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON quota_config_questions
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON completions_combinations
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- RESUME:
-- - quota_configs: groupe de quotas croises (ex: "Pays x Secteur")
-- - quota_config_questions: les N segmentations du croisement
-- - quotas: enrichi avec quota_config_id + combination (JSONB)
-- - completions_combinations: completions par combinaison croisee par affectation
-- - segmentations.answer_options: cache des options de reponse QuestionPro
-- ============================================================================
