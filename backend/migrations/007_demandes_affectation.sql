-- Migration 007: Table demandes_affectation
-- Permet aux enqueteurs de demander a rejoindre une enquete
-- L'admin peut ensuite accepter (cree l'affectation) ou refuser

CREATE TABLE IF NOT EXISTS demandes_affectation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enqueteur_id UUID NOT NULL REFERENCES enqueteurs(id) ON DELETE CASCADE,
    enquete_id UUID NOT NULL REFERENCES enquetes(id) ON DELETE CASCADE,
    statut VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee')),
    message TEXT,                          -- message optionnel de l'enqueteur
    commentaire_admin TEXT,               -- commentaire optionnel de l'admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enqueteur_id, enquete_id)       -- un seul demande par enqueteur par enquete
);

-- Index pour les requetes frequentes
CREATE INDEX IF NOT EXISTS idx_demandes_enqueteur ON demandes_affectation(enqueteur_id);
CREATE INDEX IF NOT EXISTS idx_demandes_enquete ON demandes_affectation(enquete_id);
CREATE INDEX IF NOT EXISTS idx_demandes_statut ON demandes_affectation(statut);
