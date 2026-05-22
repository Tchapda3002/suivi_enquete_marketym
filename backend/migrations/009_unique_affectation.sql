-- ============================================================================
-- MIGRATION 009 : Suppression doublons affectations + contrainte UNIQUE
-- ============================================================================

-- 1. Supprimer les affectations en doublon (garder la plus ancienne)
DELETE FROM affectations WHERE id = '2a55ac6f-0890-4fb5-967a-90e9a5d403d5'; -- Marketym doublon (10h27)
DELETE FROM affectations WHERE id = 'f62d2efd-746c-4b84-a258-0ac93c6bb96e'; -- Edgar doublon

-- 2. Contrainte UNIQUE pour empecher les futurs doublons
ALTER TABLE affectations ADD CONSTRAINT unique_enqueteur_enquete UNIQUE (enqueteur_id, enquete_id);
