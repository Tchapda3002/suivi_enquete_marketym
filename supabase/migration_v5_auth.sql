-- ============================================================
-- MIGRATION v5 - Systeme d'authentification OTP + Tracking
-- A executer dans : Supabase > SQL Editor > New Query
-- ============================================================

-- ============================================================
-- 1. MODIFIER TABLE ENQUETEURS
-- ============================================================

-- Ajouter colonne token (6 caracteres uniques pour tracking)
ALTER TABLE enqueteurs ADD COLUMN IF NOT EXISTS token TEXT UNIQUE;

-- Generer des tokens pour les enqueteurs existants
UPDATE enqueteurs
SET token = UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6))
WHERE token IS NULL;

-- Rendre token NOT NULL apres generation
ALTER TABLE enqueteurs ALTER COLUMN token SET NOT NULL;

-- Rendre email obligatoire (s'il ne l'est pas deja)
-- Note: Ajouter les emails aux enqueteurs existants AVANT d'executer cette ligne
-- ALTER TABLE enqueteurs ALTER COLUMN email SET NOT NULL;

-- Supprimer ancienne colonne mot_de_passe (optionnel, garder pour rollback)
-- ALTER TABLE enqueteurs DROP COLUMN IF EXISTS mot_de_passe;

-- Supprimer ancienne colonne identifiant (optionnel, garder pour rollback)
-- ALTER TABLE enqueteurs DROP COLUMN IF EXISTS identifiant;

-- ============================================================
-- 2. MODIFIER TABLE ENQUETES
-- ============================================================

-- Ajouter survey_id et lien_base
ALTER TABLE enquetes ADD COLUMN IF NOT EXISTS survey_id TEXT;
ALTER TABLE enquetes ADD COLUMN IF NOT EXISTS lien_base TEXT;

-- ============================================================
-- 3. CREER TABLE OTP_CODES
-- ============================================================

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche rapide par email
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);

-- Index pour nettoyage des codes expires
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at);

-- ============================================================
-- 4. MODIFIER TABLE AFFECTATIONS
-- ============================================================

-- Supprimer survey_id de affectations (maintenant dans enquetes)
-- Note: D'abord migrer les donnees si necessaire
-- ALTER TABLE affectations DROP COLUMN IF EXISTS survey_id;

-- Supprimer lien_questionnaire (sera calcule dynamiquement)
-- ALTER TABLE affectations DROP COLUMN IF EXISTS lien_questionnaire;

-- ============================================================
-- 5. FONCTION POUR GENERER TOKEN UNIQUE
-- ============================================================

CREATE OR REPLACE FUNCTION generate_unique_token()
RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
  token_exists BOOLEAN;
BEGIN
  LOOP
    -- Generer token aleatoire de 6 caracteres (A-Z, 0-9)
    new_token := UPPER(SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 6));

    -- Verifier unicite
    SELECT EXISTS(SELECT 1 FROM enqueteurs WHERE token = new_token) INTO token_exists;

    -- Sortir si unique
    EXIT WHEN NOT token_exists;
  END LOOP;

  RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. TRIGGER POUR AUTO-GENERER TOKEN
-- ============================================================

CREATE OR REPLACE FUNCTION set_enqueteur_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.token IS NULL THEN
    NEW.token := generate_unique_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_token_enqueteur ON enqueteurs;
CREATE TRIGGER auto_token_enqueteur
BEFORE INSERT ON enqueteurs
FOR EACH ROW EXECUTE FUNCTION set_enqueteur_token();

-- ============================================================
-- 7. FONCTION NETTOYAGE OTP EXPIRES
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_expired_otp()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW() OR used = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. DESACTIVER RLS SUR NOUVELLES TABLES
-- ============================================================

ALTER TABLE otp_codes DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. VERIFICATION
-- ============================================================

-- Verifier que tout est en place
DO $$
BEGIN
  RAISE NOTICE 'Migration v5 terminee avec succes!';
  RAISE NOTICE 'Tables modifiees: enqueteurs, enquetes, affectations';
  RAISE NOTICE 'Table creee: otp_codes';
  RAISE NOTICE 'Fonctions creees: generate_unique_token, set_enqueteur_token, cleanup_expired_otp';
END;
$$;
