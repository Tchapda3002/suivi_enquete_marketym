-- ============================================================
-- SCHEMA SUPABASE — Plateforme de suivi enqueteurs v4
-- Integration API QuestionPro avec quotas dynamiques
-- A executer dans : Supabase > SQL Editor > New Query
-- ============================================================

-- Supprimer les tables si elles existent (pour reset)
DROP TABLE IF EXISTS completions_segments CASCADE;
DROP TABLE IF EXISTS quotas CASCADE;
DROP TABLE IF EXISTS completions_pays CASCADE;
DROP TABLE IF EXISTS affectations CASCADE;
DROP TABLE IF EXISTS enqueteurs CASCADE;
DROP TABLE IF EXISTS enquetes CASCADE;
DROP TABLE IF EXISTS quotas_pays CASCADE;
DROP TABLE IF EXISTS pays CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS admin CASCADE;

-- ============================================================
-- TABLE: zones (UEMOA, CEMAC)
-- ============================================================
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL
);

-- ============================================================
-- TABLE: pays
-- ============================================================
CREATE TABLE pays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,        -- Code ISO (SN, CI, ML...)
  nom TEXT NOT NULL,
  quota INTEGER NOT NULL DEFAULT 0, -- Objectif par pays (legacy)
  icp_pct DECIMAL(5,2) DEFAULT 0    -- Pourcentage ICP
);

-- ============================================================
-- TABLE: enquetes
-- ============================================================
CREATE TABLE enquetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,              -- ACQ, GENZ, TR
  nom TEXT NOT NULL,
  description TEXT,
  cible TEXT NOT NULL,                    -- Public vise
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('brouillon', 'en_cours', 'termine', 'archive')),
  -- Nouvelles colonnes pour segmentation dynamique
  segmentation_question_id TEXT,          -- ID de la question QuestionPro pour segmentation
  segmentation_question_text TEXT,        -- Texte de la question de segmentation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: enqueteurs
-- ============================================================
CREATE TABLE enqueteurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifiant TEXT UNIQUE NOT NULL,       -- ACQ1, GENZ2, TR1, ADMIN...
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  telephone TEXT,
  reseau_mobile TEXT CHECK (reseau_mobile IN ('wave', 'orange_money', 'free_money', 'autre')),
  mode_remuneration TEXT CHECK (mode_remuneration IN ('espece', 'virement', 'cheque', 'espece_virement')),
  mot_de_passe TEXT NOT NULL DEFAULT '1234',
  actif BOOLEAN DEFAULT TRUE,
  -- Nouvelles colonnes
  is_admin BOOLEAN DEFAULT FALSE,         -- Si true, c'est un admin (ADMIN enqueteur)
  derniere_connexion TIMESTAMPTZ,         -- Derniere connexion
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: affectations (liaison enqueteur <-> enquete)
-- ============================================================
CREATE TABLE affectations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquete_id UUID REFERENCES enquetes(id) ON DELETE CASCADE,
  enqueteur_id UUID REFERENCES enqueteurs(id) ON DELETE CASCADE,
  survey_id TEXT NOT NULL,                -- ID QuestionPro (ex: 13445449)
  lien_questionnaire TEXT NOT NULL,       -- Lien QuestionPro
  objectif_total INTEGER DEFAULT 200,     -- Quota total
  completions_total INTEGER DEFAULT 0,    -- Reponses completees
  clics INTEGER DEFAULT 0,                -- Vues du questionnaire
  taux_conversion DECIMAL(5,2) DEFAULT 0, -- % clics -> completions
  statut TEXT DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'en_retard', 'termine')),
  derniere_synchro TIMESTAMPTZ,           -- Derniere synchro API
  commentaire_admin TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enquete_id, enqueteur_id)
);

-- ============================================================
-- TABLE: quotas (quotas dynamiques par segment)
-- ============================================================
CREATE TABLE quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquete_id UUID REFERENCES enquetes(id) ON DELETE CASCADE,
  affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,
  segment_value TEXT NOT NULL,            -- Valeur du segment (ex: "Senegal", "18-25 ans")
  objectif INTEGER NOT NULL DEFAULT 0,    -- Objectif pour ce segment
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Contrainte: soit enquete_id (quota global) soit affectation_id (quota par enqueteur)
  CONSTRAINT quotas_unique_constraint UNIQUE (enquete_id, affectation_id, segment_value)
);

-- ============================================================
-- TABLE: completions_segments (completions par segment)
-- ============================================================
CREATE TABLE completions_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,
  segment_value TEXT NOT NULL,            -- Valeur du segment
  completions INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT completions_segments_unique UNIQUE (affectation_id, segment_value)
);

-- ============================================================
-- TABLE: completions_pays (legacy - pour compatibilite)
-- ============================================================
CREATE TABLE completions_pays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affectation_id UUID REFERENCES affectations(id) ON DELETE CASCADE,
  pays_id UUID REFERENCES pays(id) ON DELETE CASCADE,
  completions INTEGER DEFAULT 0,
  objectif INTEGER DEFAULT 0,             -- Quota pour ce pays
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(affectation_id, pays_id)
);

-- ============================================================
-- TABLE: admin
-- ============================================================
CREATE TABLE admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  mot_de_passe TEXT NOT NULL DEFAULT 'admin2024'
);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_affectations
BEFORE UPDATE ON affectations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_completions_pays
BEFORE UPDATE ON completions_pays
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_completions_segments
BEFORE UPDATE ON completions_segments
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DESACTIVER RLS (securite geree par le backend)
-- ============================================================
ALTER TABLE zones DISABLE ROW LEVEL SECURITY;
ALTER TABLE pays DISABLE ROW LEVEL SECURITY;
ALTER TABLE enquetes DISABLE ROW LEVEL SECURITY;
ALTER TABLE enqueteurs DISABLE ROW LEVEL SECURITY;
ALTER TABLE affectations DISABLE ROW LEVEL SECURITY;
ALTER TABLE completions_pays DISABLE ROW LEVEL SECURITY;
ALTER TABLE completions_segments DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotas DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DONNEES: Admin par defaut
-- ============================================================
INSERT INTO admin (mot_de_passe) VALUES ('admin2024');

-- ============================================================
-- DONNEES: Enqueteur ADMIN (recoit les enquetes non assignees)
-- ============================================================
INSERT INTO enqueteurs (identifiant, nom, prenom, mot_de_passe, is_admin, actif)
VALUES ('ADMIN', 'Administrateur', 'Systeme', 'admin2024', TRUE, TRUE);

-- ============================================================
-- DONNEES: Zones
-- ============================================================
INSERT INTO zones (code, nom) VALUES
  ('UEMOA', 'Union Economique et Monetaire Ouest Africaine'),
  ('CEMAC', 'Communaute Economique et Monetaire de l''Afrique Centrale');

-- ============================================================
-- DONNEES: Pays avec quotas
-- ============================================================
INSERT INTO pays (zone_id, code, nom, quota, icp_pct)
SELECT z.id, p.code, p.nom, p.quota, p.icp_pct
FROM zones z, (VALUES
  -- UEMOA
  ('UEMOA', 'CI', 'Cote d''Ivoire', 29, 14.36),
  ('UEMOA', 'SN', 'Senegal', 18, 9.23),
  ('UEMOA', 'ML', 'Mali', 17, 8.34),
  ('UEMOA', 'BF', 'Burkina Faso', 15, 7.33),
  ('UEMOA', 'NE', 'Niger', 16, 7.87),
  ('UEMOA', 'TG', 'Togo', 13, 6.41),
  ('UEMOA', 'BJ', 'Benin', 16, 7.91),
  ('UEMOA', 'GW', 'Guinee-Bissau', 8, 4.14),
  ('UEMOA', 'MR', 'Mauritanie', 10, 5.00),
  -- CEMAC
  ('CEMAC', 'CM', 'Cameroun', 22, 11.11),
  ('CEMAC', 'GA', 'Gabon', 14, 7.18),
  ('CEMAC', 'CG', 'Congo', 8, 4.08),
  ('CEMAC', 'TD', 'Tchad', 11, 5.57),
  ('CEMAC', 'CF', 'RCA', 6, 3.09),
  ('CEMAC', 'GQ', 'Guinee Equatoriale', 7, 3.38)
) AS p(zone_code, code, nom, quota, icp_pct)
WHERE z.code = p.zone_code;

-- ============================================================
-- DONNEES: Enquetes
-- ============================================================
INSERT INTO enquetes (code, nom, description, cible, statut) VALUES
  ('ACQ', 'Acquisitions des talents', 'Enquete sur l''acquisition des talents en entreprise', 'Dirigeants, manager, chef de service, chef de departement (Poste de decision)', 'en_cours'),
  ('GENZ', 'GENZ', 'Barometre sur les talents Gen Z et Millenials en Afrique', 'Travailleurs ages de 18 a 42 ans', 'en_cours'),
  ('TR', 'Transformation digitale', 'Enquete sur la transformation digitale des entreprises', 'Dirigeants, manager, chef de service, chef de departement (Poste de decision) dans le domaine digital', 'en_cours');

-- ============================================================
-- DONNEES: Enqueteurs
-- ============================================================
INSERT INTO enqueteurs (identifiant, nom, prenom, telephone, reseau_mobile, mode_remuneration, mot_de_passe) VALUES
  ('ACQ1', 'AGNANGMA SANAM', 'David Landry', '771879590', 'wave', 'espece_virement', '1234'),
  ('ACQ2', 'NGAKE YAMAHA', 'Herman Parfait', '776044943', 'wave', 'espece_virement', '1234'),
  ('ACQ3', 'TEVOEDJRE', 'Senou Michel-Marie Tresor', '776935973', 'orange_money', 'virement', '1234'),
  ('ACQ4', 'RIRADJIM NGARMOUNDOU', 'Tresor', '781903861', 'wave', 'virement', '1234'),
  ('ACQ5', 'AMOULE', 'Leonce Yannick Mahounan', '778829059', 'wave', 'espece_virement', '1234'),
  ('GENZ1', 'DACI YIMETE', 'Princilia Doleresse', '786898250', 'wave', 'espece_virement', '1234'),
  ('GENZ2', 'NGUIMKENG TOUKEN', 'Linda Lamerveille', '787308214', 'wave', 'espece_virement', '1234'),
  ('GENZ3', 'NGUEMFOUO NGOUMTSA', 'Celina', '772207134', 'wave', 'virement', '1234'),
  ('GENZ4', 'NDIAYE', 'Bator', '703534904', 'wave', 'virement', '1234'),
  ('GENZ5', 'Faye', 'Abdoulaye dit vieux', '776240152', 'wave', 'virement', '1234'),
  ('TR1', 'YEMELI SAAH', 'Eugene Crespo', '771337429', 'orange_money', 'virement', '1234'),
  ('TR2', 'BAGBONON', 'Apollos Sergio Comlan', '786591381', 'wave', 'virement', '1234');

-- ============================================================
-- DONNEES: Affectations avec survey_id
-- ============================================================
-- ACQ
INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445449', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYM', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'ACQ' AND enq.identifiant = 'ACQ1';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445453', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYQ', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'ACQ' AND enq.identifiant = 'ACQ2';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445452', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYP', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'ACQ' AND enq.identifiant = 'ACQ3';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445457', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYU', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'ACQ' AND enq.identifiant = 'ACQ4';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445458', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYV', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'ACQ' AND enq.identifiant = 'ACQ5';

-- GENZ
INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13443679', 'https://hcakpo.questionpro.com/t/Ac5QjZ8N5L', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'GENZ' AND enq.identifiant = 'GENZ1';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13444868', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OOq', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'GENZ' AND enq.identifiant = 'GENZ2';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13444871', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OOt', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'GENZ' AND enq.identifiant = 'GENZ3';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13444872', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OOu', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'GENZ' AND enq.identifiant = 'GENZ4';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13444873', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OOv', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'GENZ' AND enq.identifiant = 'GENZ5';

-- TR (Transformation digitale)
INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445440', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYD', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'TR' AND enq.identifiant = 'TR1';

INSERT INTO affectations (enquete_id, enqueteur_id, survey_id, lien_questionnaire, objectif_total)
SELECT e.id, enq.id, '13445441', 'https://hcakpo.questionpro.com/t/Ac5QjZ8OYE', 200
FROM enquetes e, enqueteurs enq WHERE e.code = 'TR' AND enq.identifiant = 'TR2';

-- ============================================================
-- DONNEES: Initialiser completions_pays pour chaque affectation
-- ============================================================
INSERT INTO completions_pays (affectation_id, pays_id, completions, objectif)
SELECT a.id, p.id, 0, p.quota
FROM affectations a
CROSS JOIN pays p;

-- ============================================================
-- FONCTION: Calculer le statut automatiquement
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_affectation_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completions_total >= NEW.objectif_total THEN
    NEW.statut = 'termine';
  ELSIF NEW.completions_total < (NEW.objectif_total * 0.5) AND
        NEW.created_at < NOW() - INTERVAL '7 days' THEN
    NEW.statut = 'en_retard';
  ELSE
    NEW.statut = 'en_cours';
  END IF;

  -- Calculer taux de conversion
  IF NEW.clics > 0 THEN
    NEW.taux_conversion = ROUND((NEW.completions_total::DECIMAL / NEW.clics) * 100, 2);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_status_affectation
BEFORE UPDATE ON affectations
FOR EACH ROW EXECUTE FUNCTION calculate_affectation_status();
