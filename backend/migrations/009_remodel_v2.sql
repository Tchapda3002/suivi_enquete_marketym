-- ============================================================================
-- MIGRATION 009 : Remodélisation complète - nouvelles tables
-- ============================================================================
-- Applique APRES les migrations 006, 007, 008.
-- Crée les nouvelles tables sans toucher aux anciennes (migration douce).
-- La migration 010 copiera les données, puis le nouveau main.py utilisera
-- exclusivement les nouvelles tables.
-- ============================================================================

-- 1. answer_options : les valeurs possibles pour chaque segmentation (remplace JSONB)
CREATE TABLE IF NOT EXISTS answer_options (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segmentation_id UUID NOT NULL REFERENCES segmentations(id) ON DELETE CASCADE,
    qp_answer_id VARCHAR,                    -- ID QuestionPro de l'option (answerID)
    valeur       VARCHAR NOT NULL,           -- valeur normalisée (apostrophes droites, pas d'espace insécable)
    valeur_display VARCHAR,                  -- texte original tel que retourné par QP
    position     INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(segmentation_id, valeur)
);

-- 2. response_counts : compteur de réponses par (affectation, answer_option)
--    Remplace completions_segments (matching texte → matching UUID FK)
CREATE TABLE IF NOT EXISTS response_counts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affectation_id  UUID NOT NULL REFERENCES affectations(id) ON DELETE CASCADE,
    answer_option_id UUID NOT NULL REFERENCES answer_options(id) ON DELETE CASCADE,
    count           INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(affectation_id, answer_option_id)
);

-- 3. quota_groups : groupe de quotas croisés (remplace quota_configs)
CREATE TABLE IF NOT EXISTS quota_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enquete_id  UUID NOT NULL REFERENCES enquetes(id) ON DELETE CASCADE,
    nom         VARCHAR(200) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. quota_group_segmentations : segmentations impliquées dans un groupe croisé
CREATE TABLE IF NOT EXISTS quota_group_segmentations (
    quota_group_id  UUID REFERENCES quota_groups(id) ON DELETE CASCADE,
    segmentation_id UUID REFERENCES segmentations(id) ON DELETE CASCADE,
    position        INTEGER DEFAULT 0,
    PRIMARY KEY (quota_group_id, segmentation_id)
);

-- 5. quota_group_combinations : chaque combinaison croisée avec son objectif
--    combination = {"<segmentation_id>": "<answer_option_id>", ...}
--    → matching par UUID, plus jamais par texte
CREATE TABLE IF NOT EXISTS quota_group_combinations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quota_group_id UUID NOT NULL REFERENCES quota_groups(id) ON DELETE CASCADE,
    combination    JSONB NOT NULL,     -- {seg_id: ao_id, ...}
    pourcentage    NUMERIC(5,2) DEFAULT 0,
    UNIQUE(quota_group_id, combination)
);

-- 6. response_combinations : completions par (affectation, combination)
CREATE TABLE IF NOT EXISTS response_combinations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affectation_id           UUID NOT NULL REFERENCES affectations(id) ON DELETE CASCADE,
    quota_group_combination_id UUID NOT NULL REFERENCES quota_group_combinations(id) ON DELETE CASCADE,
    count                    INTEGER NOT NULL DEFAULT 0,
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(affectation_id, quota_group_combination_id)
);

-- 7. Ajouter answer_option_id aux quotas existants (liaison FK vers answer_options)
ALTER TABLE quotas ADD COLUMN IF NOT EXISTS answer_option_id UUID REFERENCES answer_options(id) ON DELETE CASCADE;

-- 8. Ajouter survey_url à enquetes si pas déjà fait (migration 006 peut l'avoir fait)
ALTER TABLE enquetes ADD COLUMN IF NOT EXISTS survey_url TEXT;

-- 9. Index
CREATE INDEX IF NOT EXISTS idx_answer_options_segmentation ON answer_options(segmentation_id);
CREATE INDEX IF NOT EXISTS idx_response_counts_affectation ON response_counts(affectation_id);
CREATE INDEX IF NOT EXISTS idx_response_counts_answer_option ON response_counts(answer_option_id);
CREATE INDEX IF NOT EXISTS idx_quota_groups_enquete ON quota_groups(enquete_id);
CREATE INDEX IF NOT EXISTS idx_quota_group_combinations_group ON quota_group_combinations(quota_group_id);
CREATE INDEX IF NOT EXISTS idx_response_combinations_affectation ON response_combinations(affectation_id);
CREATE INDEX IF NOT EXISTS idx_quotas_answer_option ON quotas(answer_option_id);

-- 10. RLS
ALTER TABLE answer_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_group_segmentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_group_combinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_combinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON answer_options
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON response_counts
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON quota_groups
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON quota_group_segmentations
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON quota_group_combinations
    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON response_combinations
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- RÉSUMÉ DES NOUVELLES TABLES :
-- answer_options        → valeurs QP normalisées (remplace segmentations.answer_options JSONB)
-- response_counts       → completions par (affectation, answer_option) via UUID FK
-- quota_groups          → groupes de quotas croisés (remplace quota_configs)
-- quota_group_segmentations → segmentations d'un groupe croisé
-- quota_group_combinations  → combinaisons croisées (UUIDs dans combination JSONB)
-- response_combinations → completions par combinaison croisée
-- quotas.answer_option_id → nouveau lien FK (segment_value toujours présent pour transition)
-- ============================================================================
