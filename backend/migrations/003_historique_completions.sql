-- ============================================================================
-- MIGRATION: Historique des completions pour courbes d'evolution
-- ============================================================================

-- Table pour stocker l'historique quotidien des completions
CREATE TABLE IF NOT EXISTS historique_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    enquete_id UUID REFERENCES enquetes(id) ON DELETE CASCADE,
    affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,
    completions INT NOT NULL DEFAULT 0,
    clics INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Une seule entree par jour par enquete (global) ou par affectation
    UNIQUE(date, enquete_id, affectation_id)
);

-- Index pour les recherches rapides
CREATE INDEX idx_historique_date ON historique_completions(date);
CREATE INDEX idx_historique_enquete ON historique_completions(enquete_id);
CREATE INDEX idx_historique_affectation ON historique_completions(affectation_id);

-- Activer RLS
ALTER TABLE historique_completions ENABLE ROW LEVEL SECURITY;

-- Policy pour acces
CREATE POLICY "Enable all for authenticated users" ON historique_completions
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- RESUME:
-- - Table historique_completions: stocke les completions par jour
-- - Peut etre global (enquete_id sans affectation_id) ou par affectation
-- - Permet de generer des courbes d'evolution
-- ============================================================================
