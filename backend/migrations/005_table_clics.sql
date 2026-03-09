-- ============================================================================
-- MIGRATION: Table clics pour tracking avec deduplication par IP
-- ============================================================================

-- Table pour stocker les clics sur les liens de collecte
CREATE TABLE IF NOT EXISTS clics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affectation_id UUID NOT NULL REFERENCES affectations(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,  -- IPv4 (15) ou IPv6 (45)
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Un seul clic par IP par affectation (deduplication)
    UNIQUE(affectation_id, ip_address)
);

-- Index pour les recherches rapides
CREATE INDEX idx_clics_affectation ON clics(affectation_id);
CREATE INDEX idx_clics_created_at ON clics(created_at);

-- Activer RLS
ALTER TABLE clics ENABLE ROW LEVEL SECURITY;

-- Policy pour acces
CREATE POLICY "Enable all for authenticated users" ON clics
    FOR ALL USING (true) WITH CHECK (true);

-- Ajouter colonne lien_direct dans affectations (le lien QuestionPro direct, pour la redirection)
ALTER TABLE affectations ADD COLUMN IF NOT EXISTS lien_direct TEXT;

-- Copier les liens actuels vers lien_direct (pour les anciennes affectations)
-- lien_questionnaire contiendra desormais le lien de tracking /r/{id}
UPDATE affectations
SET lien_direct = lien_questionnaire
WHERE lien_direct IS NULL AND lien_questionnaire IS NOT NULL;

-- Vider lien_questionnaire pour forcer la regeneration avec le nouveau format de tracking
-- (sera regenere dynamiquement par le backend avec /r/{affectation_id})
UPDATE affectations
SET lien_questionnaire = NULL
WHERE lien_questionnaire LIKE '%questionpro.com%';

-- ============================================================================
-- RESUME:
-- - Table clics: stocke chaque clic avec IP (deduplique par IP)
-- - lien_questionnaire: lien de tracking qui passe par notre backend (/r/{id})
-- - lien_direct: lien QuestionPro direct (pour la redirection)
-- - Le champ clics dans affectations = COUNT(DISTINCT ip_address) de cette table
--
-- APRES MIGRATION:
-- 1. Configurer BACKEND_URL dans les variables d'environnement
-- 2. Les liens seront regeneres automatiquement par le backend
-- ============================================================================
