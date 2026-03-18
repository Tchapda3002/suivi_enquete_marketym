-- ============================================================================
-- MIGRATION 008 : statut dans clics, demarre_total dans affectations,
--                 segmentation_id dans completions_segments
-- ============================================================================

-- 1. Colonne statut dans clics (permet de suivre le niveau d'avancement par IP)
ALTER TABLE clics ADD COLUMN IF NOT EXISTS statut VARCHAR(20) DEFAULT 'clique';

-- 2. Colonne demarre_total dans affectations (nb IPs ayant au moins commence le questionnaire)
ALTER TABLE affectations ADD COLUMN IF NOT EXISTS demarre_total INTEGER DEFAULT 0;

-- 3. Colonne segmentation_id dans completions_segments
--    Permet de savoir a quelle segmentation appartient chaque ligne de completion
--    ON DELETE SET NULL pour ne pas perdre les donnees si une segmentation est supprimee
ALTER TABLE completions_segments ADD COLUMN IF NOT EXISTS segmentation_id UUID REFERENCES segmentations(id) ON DELETE SET NULL;

-- Index pour les requetes filtrees par segmentation
CREATE INDEX IF NOT EXISTS idx_completions_segments_segmentation ON completions_segments(segmentation_id);

-- ============================================================================
-- RESUME :
-- - clics.statut        : 'clique' | 'Partial' | 'Completed' (mis a jour lors du sync QP)
-- - affectations.demarre_total : nb IPs avec statut Partial ou Completed
-- - completions_segments.segmentation_id : lien vers la segmentation concernee
--
-- APRES MIGRATION :
-- Relancer un sync complet pour peupler les nouvelles colonnes
-- ============================================================================
