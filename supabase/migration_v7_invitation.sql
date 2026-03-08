-- ============================================================
-- MIGRATION v7 - Tokens d'invitation pour inscription
-- A executer dans : Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Table pour les tokens d'invitation
CREATE TABLE IF NOT EXISTS invitation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enqueteur_id UUID NOT NULL REFERENCES enqueteurs(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index pour recherche rapide par token
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_enqueteur ON invitation_tokens(enqueteur_id);

-- 3. Modifier enqueteurs: mot de passe nullable au debut
-- (l'utilisateur le definit via le lien d'invitation)
ALTER TABLE enqueteurs ALTER COLUMN mot_de_passe DROP NOT NULL;

-- 4. Ajouter colonne pour savoir si le compte est configure
ALTER TABLE enqueteurs ADD COLUMN IF NOT EXISTS compte_configure BOOLEAN DEFAULT FALSE;

-- 5. Mettre a jour les comptes existants (ceux qui ont un mot de passe sont configures)
UPDATE enqueteurs SET compte_configure = TRUE WHERE mot_de_passe IS NOT NULL;

-- 6. Verification
DO $$
BEGIN
  RAISE NOTICE 'Migration v7 terminee!';
  RAISE NOTICE 'Table creee: invitation_tokens';
  RAISE NOTICE 'Colonne ajoutee: compte_configure';
END;
$$;
