-- ============================================================================
-- MIGRATION 010 : Migration des données vers le nouveau modèle
-- ============================================================================
-- À appliquer APRÈS la migration 009.
-- Peuple les nouvelles tables depuis les anciennes.
-- Les anciennes tables sont conservées (pas de DROP).
-- ============================================================================

-- Fonction utilitaire : normaliser une valeur de segment
-- (remplace la fonction Python normalize_segment_value)
CREATE OR REPLACE FUNCTION normalize_segment(val TEXT) RETURNS TEXT AS $$
DECLARE
    t TEXT;
BEGIN
    IF val IS NULL THEN RETURN val; END IF;
    -- Remplacer apostrophes courbes et espaces insécables
    t := REPLACE(REPLACE(REPLACE(val, E'\u2019', ''''), E'\u2018', ''''), E'\u00A0', ' ');
    t := TRIM(t);
    -- Alias pays
    t := CASE t
        WHEN 'République du Congo' THEN 'Congo-Brazzaville'
        WHEN 'Republique du Congo'  THEN 'Congo-Brazzaville'
        WHEN 'Guinée Bissau'        THEN 'Guinée-Bissau'
        WHEN 'Guinee Bissau'        THEN 'Guinée-Bissau'
        ELSE t
    END;
    RETURN t;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- ÉTAPE 1 : Peupler answer_options depuis segmentations.answer_options (JSONB)
-- ============================================================================

INSERT INTO answer_options (segmentation_id, qp_answer_id, valeur, valeur_display, position)
SELECT
    s.id AS segmentation_id,
    opt->>'id'   AS qp_answer_id,
    normalize_segment(opt->>'text') AS valeur,
    opt->>'text' AS valeur_display,
    (ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY (opt->>'id')::bigint NULLS LAST))::int - 1 AS position
FROM segmentations s,
     JSONB_ARRAY_ELEMENTS(COALESCE(s.answer_options, '[]'::jsonb)) AS opt
WHERE opt->>'text' IS NOT NULL
  AND TRIM(opt->>'text') <> ''
ON CONFLICT (segmentation_id, valeur) DO UPDATE
    SET qp_answer_id   = EXCLUDED.qp_answer_id,
        valeur_display = EXCLUDED.valeur_display;

-- ============================================================================
-- ÉTAPE 2 : Compléter answer_options depuis quotas.segment_value
--           (pour les segmentations dont le JSONB était vide)
-- ============================================================================

INSERT INTO answer_options (segmentation_id, valeur, valeur_display)
SELECT DISTINCT
    q.segmentation_id,
    normalize_segment(q.segment_value) AS valeur,
    q.segment_value                    AS valeur_display
FROM quotas q
WHERE q.affectation_id IS NULL
  AND q.segment_value IS NOT NULL
  AND TRIM(q.segment_value) <> ''
  AND q.segmentation_id IS NOT NULL
ON CONFLICT (segmentation_id, valeur) DO NOTHING;

-- ============================================================================
-- ÉTAPE 3 : Lier les quotas globaux à leur answer_option (answer_option_id)
-- ============================================================================

UPDATE quotas q
SET answer_option_id = ao.id
FROM answer_options ao
WHERE ao.segmentation_id = q.segmentation_id
  AND ao.valeur = normalize_segment(q.segment_value)
  AND q.affectation_id IS NULL
  AND q.answer_option_id IS NULL;

-- ============================================================================
-- ÉTAPE 4 : Supprimer les quotas individuels par affectation (doublons)
--           Les quotas globaux suffisent ; les objectifs individuels sont
--           calculés à la requête via objectif_total * pourcentage / 100.
-- ============================================================================

DELETE FROM quotas WHERE affectation_id IS NOT NULL;

-- ============================================================================
-- ÉTAPE 5 : Peupler response_counts depuis completions_segments
-- ============================================================================

INSERT INTO response_counts (affectation_id, answer_option_id, count)
SELECT
    cs.affectation_id,
    ao.id AS answer_option_id,
    cs.completions AS count
FROM completions_segments cs
JOIN answer_options ao
    ON ao.segmentation_id = cs.segmentation_id
    AND ao.valeur = normalize_segment(cs.segment_value)
WHERE cs.segmentation_id IS NOT NULL
  AND cs.completions > 0
ON CONFLICT (affectation_id, answer_option_id)
DO UPDATE SET count = GREATEST(response_counts.count, EXCLUDED.count);

-- Fallback : lignes completions_segments sans segmentation_id
-- Essayer de matcher par valeur seule (si une seule segmentation pour l'enquête de l'affectation)
INSERT INTO response_counts (affectation_id, answer_option_id, count)
SELECT
    cs.affectation_id,
    ao.id AS answer_option_id,
    cs.completions AS count
FROM completions_segments cs
JOIN affectations aff ON aff.id = cs.affectation_id
JOIN segmentations seg ON seg.enquete_id = aff.enquete_id
JOIN answer_options ao ON ao.segmentation_id = seg.id
    AND ao.valeur = normalize_segment(cs.segment_value)
WHERE cs.segmentation_id IS NULL
  AND cs.completions > 0
ON CONFLICT (affectation_id, answer_option_id)
DO UPDATE SET count = GREATEST(response_counts.count, EXCLUDED.count);

-- ============================================================================
-- ÉTAPE 6 : Migrer quota_configs → quota_groups
-- ============================================================================

INSERT INTO quota_groups (id, enquete_id, nom, created_at)
SELECT id, enquete_id, nom, created_at
FROM quota_configs
ON CONFLICT DO NOTHING;

-- quota_config_questions → quota_group_segmentations
INSERT INTO quota_group_segmentations (quota_group_id, segmentation_id, position)
SELECT quota_config_id, segmentation_id, position
FROM quota_config_questions
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ÉTAPE 7 : Migrer les quotas croisés vers quota_group_combinations
--           (conversion combination textuelle → combination par UUIDs)
-- ============================================================================

-- Pour les quotas avec quota_config_id défini, on construit la combination UUID
-- en cherchant les answer_options correspondantes pour chaque entrée de la combination JSONB.
-- Cette migration est best-effort : les entrées sans correspondance sont ignorées.

DO $$
DECLARE
    q_row RECORD;
    new_combination JSONB;
    seg_rec RECORD;
    ao_id UUID;
    key TEXT;
    val TEXT;
    valid BOOLEAN;
BEGIN
    FOR q_row IN
        SELECT q.id, q.quota_config_id, q.combination, q.pourcentage
        FROM quotas q
        WHERE q.quota_config_id IS NOT NULL
          AND q.combination IS NOT NULL
    LOOP
        new_combination := '{}'::JSONB;
        valid := TRUE;

        -- Pour chaque clé (nom de segmentation) dans la combination
        FOR key, val IN SELECT * FROM JSONB_EACH_TEXT(q_row.combination)
        LOOP
            -- Chercher la segmentation par nom dans le quota_group
            SELECT seg.id INTO seg_rec
            FROM segmentations seg
            JOIN quota_group_segmentations qgs ON qgs.segmentation_id = seg.id
            WHERE qgs.quota_group_id = q_row.quota_config_id
              AND seg.nom = key
            LIMIT 1;

            IF seg_rec.id IS NULL THEN
                valid := FALSE;
                EXIT;
            END IF;

            -- Chercher l'answer_option correspondante
            SELECT ao.id INTO ao_id
            FROM answer_options ao
            WHERE ao.segmentation_id = seg_rec.id
              AND ao.valeur = normalize_segment(val)
            LIMIT 1;

            IF ao_id IS NULL THEN
                valid := FALSE;
                EXIT;
            END IF;

            new_combination := new_combination || JSONB_BUILD_OBJECT(seg_rec.id::TEXT, ao_id::TEXT);
        END LOOP;

        IF valid AND new_combination <> '{}'::JSONB THEN
            INSERT INTO quota_group_combinations (quota_group_id, combination, pourcentage)
            VALUES (q_row.quota_config_id, new_combination, COALESCE(q_row.pourcentage, 0))
            ON CONFLICT (quota_group_id, combination) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- VÉRIFICATION (lecture seule - ne bloque pas si vide)
-- ============================================================================

DO $$
DECLARE
    n_ao    INT;
    n_rc    INT;
    n_qg    INT;
BEGIN
    SELECT COUNT(*) INTO n_ao FROM answer_options;
    SELECT COUNT(*) INTO n_rc FROM response_counts;
    SELECT COUNT(*) INTO n_qg FROM quota_groups;
    RAISE NOTICE 'Migration 010 terminée : % answer_options, % response_counts, % quota_groups', n_ao, n_rc, n_qg;
END $$;

-- ============================================================================
-- NOTE : Les anciennes tables sont conservées (completions_segments, quota_configs,
-- quota_config_questions, completions_combinations).
-- Le nouveau main.py n'y écrit plus mais elles restent présentes pour rollback.
-- Supprimer avec DROP TABLE après validation complète en production.
-- ============================================================================
