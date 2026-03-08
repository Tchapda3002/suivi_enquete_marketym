-- ============================================================
-- MIGRATION v6 - Authentification Email + Mot de passe + OTP
-- A executer dans : Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Modifier la colonne mot_de_passe pour stocker le hash
-- (garder les anciennes valeurs pour migration, elles seront hashees par le backend)

-- 2. Ajouter colonne pour forcer changement de mot de passe
ALTER TABLE enqueteurs ADD COLUMN IF NOT EXISTS doit_changer_mdp BOOLEAN DEFAULT TRUE;

-- 3. Mettre a jour les enqueteurs existants
-- Ceux qui ont deja un mot de passe n'ont pas besoin de le changer (pour transition)
UPDATE enqueteurs SET doit_changer_mdp = FALSE WHERE mot_de_passe IS NOT NULL;

-- 4. Verification
DO $$
BEGIN
  RAISE NOTICE 'Migration v6 terminee!';
  RAISE NOTICE 'Colonne ajoutee: doit_changer_mdp';
END;
$$;
