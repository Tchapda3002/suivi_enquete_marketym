# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Marketym - Plateforme de Suivi d'Enquetes

## Description
Application web pour H&C Executive permettant de suivre les enqueteurs et leurs enquetes. Les enqueteurs realisent des sondages via QuestionPro, et cette plateforme permet de suivre leur progression, gerer les affectations, et visualiser les statistiques.

## Stack Technique
- **Backend**: FastAPI (Python) - `/backend`
- **Frontend**: React + Vite + TailwindCSS - `/frontend`
- **Base de donnees**: Supabase (PostgreSQL)
- **Emails**: Brevo (ex-Sendinblue)
- **Sondages**: QuestionPro API
- **Deploiement**: Railway (backend), Render (frontend)

## Commandes de Developpement

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Premiere fois seulement
pip install -r requirements.txt                     # Premiere fois seulement
uvicorn app.main:app --reload --port 8000           # Lancer le serveur dev
```

### Frontend
```bash
cd frontend
npm install          # Premiere fois seulement
npm run dev          # Lancer le serveur dev (port 3000)
npm run build        # Build production → dist/
```

### Variables d'environnement
- Backend: copier `backend/.env.example` → `backend/.env`
- Frontend: copier `frontend/.env.example` → `frontend/.env`

## Architecture

### Backend (`/backend/app/`)
- **`main.py`** (2163 lignes) - Fichier monolithique contenant TOUS les endpoints (admin, enqueteur, tracking, segmentations, quotas, sync QuestionPro). Pas de routeurs separees sauf pour l'auth.
- **`db.py`** - DirectClient: wrapper PostgreSQL direct (psycopg2) avec API chainable compatible Supabase (.table().select().eq().execute()). ~3ms vs ~100ms par requete. Fallback automatique vers REST si connexion echoue.
- **`auth/router.py`** (1067 lignes) - Endpoints d'authentification + dependance `require_admin`
- **`auth/security.py`** - JWT, hash bcrypt, generation OTP
- **`auth/email.py`** - Envoi emails via Brevo SDK
- **`config.py`** - Settings depuis variables d'environnement (Supabase, QuestionPro, Brevo, JWT, DATABASE_URL)

### Frontend (`/frontend/src/`)
- **`lib/api.js`** - Instance Axios avec intercepteur JWT automatique + toutes les fonctions API
- **`components/ui.jsx`** - Composants UI reutilisables (boutons, modals, tables, formulaires)
- **Pages**: Login, Register, ActivateAccount (OTP premiere connexion), Dashboard (enqueteur), Admin

### Flux d'authentification
1. Inscription → `POST /auth/register`
2. Premiere connexion → `POST /auth/login` retourne `otp_required` → redirect vers `/activate`
3. Verif OTP → `POST /auth/verify-otp` → `compte_configure = true`
4. Connexions suivantes → `POST /auth/login` retourne `authenticated` directement

## Services & Configurations
- **Email**: Brevo - expediteur `marketym@hcexecutive.net`
- **Auth**: JWT + OTP (code 6 chiffres, expire 5 min)
- **Variables d'env**: voir `/backend/.env`

## Donnees Importantes

### Comptes de test
- **Admin**: wilfredkouadjo006@gmail.com

## Schema Base de Donnees

### enqueteurs
- id (UUID), email, nom, prenom, telephone, identifiant
- mot_de_passe (hash bcrypt), token (QuestionPro)
- actif, is_admin, compte_configure, doit_changer_mdp
- derniere_connexion, created_at

### otp_codes
- id, email, code_hash, expires_at, attempts, used, created_at

### invitation_tokens
- id, enqueteur_id, token, expires_at, used, used_at, created_at

### enquetes
- id, survey_id (QuestionPro), code, nom, description, cible, statut
- segmentation_question_id, segmentation_question_text
- survey_url (TEXT) - URL du sondage QuestionPro
- created_at

### affectations
- id, enqueteur_id, enquete_id, survey_id
- lien_questionnaire (lien de tracking /r/{id})
- lien_direct (lien QuestionPro)
- objectif_total, completions_total, clics, invalid_total
- statut, commentaire_admin, derniere_synchro, created_at

### clics (tracking avec deduplication IP)
- id, affectation_id, ip_address, user_agent, created_at
- UNIQUE(affectation_id, ip_address)

### segmentations
- id, enquete_id, nom, question_id (QP), question_text
- answer_options (JSONB) - cache des options QP
- created_at

### answer_options (NOUVEAU - migration 009)
- id (UUID), segmentation_id FK, qp_answer_id (QP answerID)
- valeur (normalisee: apostrophes droites, pas d'espace insecable)
- valeur_display (texte original QP)
- position, created_at
- UNIQUE(segmentation_id, valeur)

### quotas
- id, enquete_id, segment_value, objectif (pourcentage)
- answer_option_id FK (NOUVEAU - lien vers answer_options)
- quota_config_id FK (optionnel - pour quotas croises)
- combination (JSONB, optionnel - pour quotas croises ancienne API)

### response_counts (NOUVEAU - migration 009, remplace completions_segments)
- id (UUID), affectation_id FK, answer_option_id FK
- count (INTEGER), updated_at
- UNIQUE(affectation_id, answer_option_id)
- Matching par UUID FK, plus jamais par texte

### quota_groups (NOUVEAU - migration 009, remplace quota_configs)
- id (UUID), enquete_id FK, nom, created_at

### quota_group_segmentations (NOUVEAU)
- quota_group_id FK, segmentation_id FK, position
- PRIMARY KEY (quota_group_id, segmentation_id)

### quota_group_combinations (NOUVEAU)
- id (UUID), quota_group_id FK
- combination (JSONB) = {seg_id: ao_id, ...} - matching par UUID
- pourcentage (NUMERIC), UNIQUE(quota_group_id, combination)

### response_combinations (NOUVEAU)
- id (UUID), affectation_id FK, quota_group_combination_id FK
- count (INTEGER), updated_at
- UNIQUE(affectation_id, quota_group_combination_id)

### Tables conservees (legacy, plus ecrites par le nouveau code)
- completions_segments - ancien tracking par texte
- quota_configs / quota_config_questions - ancien modele quotas croises
- completions_combinations - anciens compteurs croises

## Endpoints API

### Auth (`/auth`) - Publics
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /register | Inscription (email, password, nom, prenom) |
| POST | /login | Connexion - retourne "authenticated" ou "otp_required" |
| POST | /verify-otp | Verification OTP (premiere connexion) |
| POST | /forgot-password | Envoie code OTP par email |
| POST | /reset-password | Reset mot de passe avec code OTP |
| POST | /change-password | Changer mot de passe (authentifie) |
| GET | /me | Info utilisateur connecte |

### Admin (`/admin`) - Securises (JWT + is_admin)
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /dashboard | Stats globales |
| GET | /enqueteurs | Liste enqueteurs |
| POST | /enqueteurs | Creer enqueteur |
| GET | /enquetes | Liste enquetes |
| POST | /enquetes | Creer enquete (survey_id, cible, description) |
| GET | /affectations | Liste toutes les affectations |
| POST | /affectations | Creer une affectation |
| GET | /affectations/by-enquete/{id} | Affectations d'une enquete (avec completions_valides) |
| GET | /affectations/{id}/clics | Voir les clics d'une affectation |
| POST | /affectations/migrate-links | Migrer les anciens liens vers le tracking |
| GET | /segmentations/by-enquete/{id} | Segmentations d'une enquete |
| POST | /segmentations | Creer une segmentation |
| GET | /quotas/by-enquete/{id} | Quotas d'une enquete |
| POST | /quotas | Creer un quota |
| POST | /quotas/bulk | Creer des quotas en masse |
| POST | /sync | Synchroniser toutes les affectations |
| GET | /stats-pays | Stats par pays |
| GET | /stats-segments | Stats par segment |

### Enqueteur (`/enqueteur`)
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | /login | Login avec identifiant + mot de passe |
| GET | /{id} | Profil et stats enqueteur |
| GET | /{id}/affectation/{affectation_id}/pays | Completions par pays |
| GET | /{id}/segmentations | Segmentations de l'enqueteur |
| POST | /{id}/sync | Synchroniser avec QuestionPro |

### Tracking (Public)
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /r/{affectation_id} | Track clic (IP unique) et redirige vers QuestionPro |

## Pages Frontend

| Route | Composant | Description |
|-------|-----------|-------------|
| /login | Login.jsx | Connexion + lien inscription + mot de passe oublie |
| /register | Register.jsx | Formulaire inscription |
| /activate | ActivateAccount.jsx | Verification OTP premiere connexion |
| /admin | Admin.jsx | Dashboard admin complet (onglets: enquetes, enqueteurs, affectations, quotas, stats, mes enquetes) |
| /dashboard | Dashboard.jsx | Dashboard enqueteur |

## Migrations SQL
Appliquer dans Supabase dans l'ordre :
1. `supabase/schema.sql` - Schema initial
2. `supabase/migration_v2.sql` - Tables de base
3. `supabase/migration_v5_auth.sql` - Tables auth
4. `supabase/migration_v6_password.sql` - Reset mot de passe
5. `supabase/migration_v7_invitation.sql` - Tokens d'invitation
6. `backend/migrations/002_segmentations_et_lien_legacy.sql`
7. `backend/migrations/003_historique_completions.sql`
8. `backend/migrations/004_add_role_column.sql`
9. `backend/migrations/005_table_clics.sql` - Tracking clics avec dedup IP
10. `backend/migrations/006_cross_quotas.sql` - survey_url, answer_options JSONB, quota_configs
11. `backend/migrations/007_cross_quotas.sql` - Tables quotas croises (quota_config_questions, etc.)
12. `backend/migrations/008_clics_statut_segmentation_id.sql` - Colonnes supplementaires
13. `backend/migrations/009_remodel_v2.sql` - NOUVEAU modele: answer_options, response_counts, quota_groups, etc.
14. `backend/migrations/010_data_migration.sql` - Migration donnees vers le nouveau modele

**IMPORTANT** : Les migrations 009 et 010 sont les plus critiques. Appliquer 009 d'abord (cree les tables), puis 010 (peuple les donnees). Le backend actuel (main.py) n'ecrit QUE dans les nouvelles tables.

## A faire

- [ ] Appliquer migrations 009 et 010 en production (Supabase)
- [ ] Lancer un sync complet apres migration pour peupler response_counts
- [ ] Notifications email (rappels, alertes)
- [ ] Export des donnees (CSV, Excel)
- [ ] Page profil enqueteur (modifier ses infos)

## Decisions Techniques

1. **OTP au lieu de magic link** - Plus simple, pas besoin de gerer les tokens d'activation
2. **Brevo au lieu de Resend** - Resend limitait l'envoi aux emails verifies en mode test
3. **compte_configure** - Flag pour savoir si l'utilisateur a valide son compte via OTP
4. **Self-registration** - Les utilisateurs peuvent s'inscrire eux-memes
5. **Creation enquete simplifiee** - Survey ID recupere automatiquement nom/infos de QuestionPro
6. **Securite admin** - JWT obligatoire + verification is_admin pour tous les endpoints /admin/*
7. **main.py monolithique** - Tous les endpoints non-auth dans un seul fichier (simplite vs structure)
8. **UUID FK au lieu de text matching** - Le probleme core des statistiques incorrectes venait du matching texte (apostrophes U+2019 vs U+0027, accents, variantes de noms de pays). Nouveau modele: `answer_options` contient les valeurs normalisees, et `response_counts` lie par `answer_option_id UUID FK`. Plus jamais de matching texte a la requete.
9. **Normalisation a l'insertion seulement** - `normalize_segment_value()` appliquee uniquement quand on insere dans `answer_options.valeur`. Toutes les comparaisons ulterieures sont par UUID.
10. **Backward compatibility frontend** - Tous les contrats API frontend maintenus. `segment_value` toujours retourne (depuis `answer_options.valeur`). Memes URLs d'endpoints.
11. **DirectClient PostgreSQL** - Connexion directe via psycopg2 au lieu de l'API REST Supabase pour les performances (~3ms vs ~100ms). Fallback automatique vers REST si DATABASE_URL absent ou connexion echouee.
12. **Tarification progressive enqueteurs** - 850 FCFA (1-100), 900 FCFA (101-200), 1000 FCFA (201+) par enqueteur. Calcul cumulatif par tranches.

## Problemes Resolus

| Probleme | Solution |
|----------|----------|
| Resend n'envoyait qu'a l'email verifie | Migration vers Brevo |
| Emails non recus malgre 200 OK | Ajout logging, redemarrage serveur |
| Comptes dupliques avec meme email | Suppression du compte non-admin |
| Endpoints admin accessibles sans auth | Ajout require_admin sur tous les endpoints |
| Clics surestimes (993 vs 227 reel) | Deduplication par IP unique par affectation |
| Stats incorrectes: completions ne matchaient pas les quotas | Remodelisation complete DB: UUID FK au lieu de text matching (migrations 009+010) |
| Apostrophes U+2019 / espaces insecables cassent le matching | Normalisation a l'insertion dans answer_options.valeur; comparaisons par UUID |
| API Supabase REST lente (~100ms/requete) | DirectClient PostgreSQL direct via psycopg2 (~3ms/requete) avec fallback |
| DirectClient: virgules dans parentheses cassent le parsing JOIN | Splitter parenthesis-aware avec tracking de profondeur |

## Derniere Session
**Date**: Avril-Mai 2026
**Resume**:
- **Plateforme Marketym**: ajout date_debut_vague + completions_vague pour filtrer les compteurs cote enqueteur a partir d'une date donnee (migration 011). Endpoint POST /admin/affectations/set-vague.
- **Endpoint /admin/questionpro/survey/{id}/responses** ajoute pour recuperer les reponses brutes via le proxy backend.
- **DATATYM(TM) — Referentiel V3**: construction du systeme complet (5 indices proprietaires IPE/IRTA/ILUX/IGRO/ICON, 5 doctrines, grille A/B/C/D, scorecard, prescriptions CODIR, simulateur what-if). Voir DATATYM_53Slides_V3_EN_1.pptx.
- **GETITHERE**: dossier strategique du projet de plateforme BI multi-verticales (au-dela du talent). Voir GETITHERE_Document_Strategique_2026.docx.
- **Benchmark plateformes**: 15 plateformes analysees (Stears, Sagaci, Statista, Asoko, etc.). Voir Benchmark_Plateformes_DATATYM_2026.docx.
- **Baromètre Gen Z**: collecte 1 200 répondants (673 Gen Z + 477 Millennials + 50 autres). Calcul indices V3. Rapport scientifique complet V2. Base consolidee complete avec colonne Generation.
- **ACQ Employeurs**: identification de 6 surveys QuestionPro distincts. Survey principal (37 questions, orientation processus RH, 705 reponses). 5 surveys individuels + 1 historique (27 questions identiques, 293 reponses agregeables — perspective employeur sur les Gen Z).
- **Document Miroir Deformant**: croisement vecu Gen Z (n=673) vs perception employeurs (n=293). Revele 5 angles morts (departs sous-estimes -40 pts, satisfaction surestimee +21 pts, equite surestimee +28 pts, etc.).

**Prochain step**:
- Appliquer migrations 009/010/011 en production (Supabase)
- Lancer sync global pour peupler response_counts et completions_vague
- Vague 2 du barometre prevue septembre 2026 (ajout variable sexe en priorite)
- Construction effective de GETITHERE (verticale Finance d'abord)
