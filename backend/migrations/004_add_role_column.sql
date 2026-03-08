-- Migration: Ajout de la colonne role pour gerer les permissions
-- Roles: enqueteur, admin, super_admin

-- 1. Ajouter la colonne role
ALTER TABLE enqueteurs
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'enqueteur';

-- 2. Mettre a jour les roles existants basés sur is_admin
UPDATE enqueteurs
SET role = 'admin'
WHERE is_admin = true AND role = 'enqueteur';

-- 3. Creer un index pour les recherches par role
CREATE INDEX IF NOT EXISTS idx_enqueteurs_role ON enqueteurs(role);
