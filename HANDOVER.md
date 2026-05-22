# HANDOVER — Projet DATATYM™ / Marketym

> Document de transmission pour un nouveau collaborateur reprenant le projet.
> À lire EN PREMIER après le `CLAUDE.md`.

---

## 1. Vue d'ensemble en 2 minutes

Ce dépôt contient **deux choses** qui coexistent :

1. **Marketym** — La plateforme web (FastAPI + React + Supabase) qui sert à piloter la collecte d'enquêtes via QuestionPro. Déployée en production sur Railway (backend) et Render (frontend).

2. **DATATYM™** — Le référentiel de notation du marché du talent africain (la marque/produit éditorial). Construit à partir des données collectées via Marketym. Les livrables sont des `.docx`, `.xlsx`, `.pptx` générés par des scripts Python à la racine.

L'objectif final : positionner DATATYM™ comme l'autorité de la donnée stratégique africaine, avec à terme la plateforme `datatym.ai` (projet GETITHERE) qui élargit le scope au-delà du talent.

---

## 2. Setup en local — étape par étape

### 2.1 Cloner et installer

```bash
git clone https://github.com/Tchapda3002/suivi_enquete_marketym.git
cd suivi_enquete_marketym

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### 2.2 Variables d'environnement (DEMANDER À WILFRED)

À récupérer **par canal sécurisé** (Signal, 1Password, etc.) — **PAS dans Git** :

- `backend/.env` → Supabase URL/Key, QuestionPro API Key, JWT Secret, Brevo API Key, DATABASE_URL
- `frontend/.env` → VITE_API_URL

Templates dans `backend/.env.example` et `frontend/.env.example`.

### 2.3 Environnement Python pour les scripts DATATYM™

À la racine, les scripts `generate_*.py` utilisent leur propre venv :

```bash
cd /chemin/vers/repo
python3 -m venv .venv
source .venv/bin/activate
pip install pandas openpyxl python-docx python-pptx matplotlib scipy scikit-learn httpx
```

### 2.4 Lancer en local

```bash
# Terminal 1 — Backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm run dev  # Lance sur http://localhost:3000
```

---

## 3. Accès production

- **Backend Railway** : https://suivienquetemarketym-prodsuivi.up.railway.app
- **Frontend Render** : (URL à demander)
- **Supabase** : projet accessible via la console Supabase (demander l'invitation)
- **Admin de la plateforme** : wilfredkouadjo006@gmail.com
- **QuestionPro** : compte hcakpo (demander accès)

Pour appeler l'API en script, récupérer un token JWT via la console navigateur après connexion :
```javascript
sessionStorage.getItem('jwt_token')
```

---

## 4. État actuel du projet (à la transmission)

### 4.1 Marketym (plateforme)

**En production, fonctionne**, mais quelques évolutions récentes non encore appliquées en prod :

- ✅ Code poussé sur main
- ⚠️ **Migrations 009, 010 et 011 à appliquer dans Supabase** (voir `backend/migrations/`)
  - 009 : refonte schema vers UUID FK (`answer_options`, `response_counts`, `quota_groups`)
  - 010 : migration des données depuis ancien modèle
  - 011 : ajout de `date_debut_vague` et `completions_vague` sur affectations
- ⚠️ Après les migrations, lancer un **sync global** pour repeupler les compteurs

### 4.2 Données collectées (au moment de la transmission)

**Baromètre Gen Z 2026** :
- 1 200 répondants total (673 Gen Z + 477 Millennials + 50 autres)
- 13 pays, 10+ secteurs
- Fichier source : `GENZ_Base_Exploitable_2026.xlsx`
- Base consolidée propre : `GENZ_Base_Consolidee_Complete_2026.xlsx`

**ACQ (Acquisition Talents)** :
- 6 surveys distincts sur QuestionPro
- 1 survey principal (`13150459`) : 37 questions orientées processus RH, 705 réponses
- 5 surveys identiques (`13442994`, `13445449`, `13445452`, `13445457`, `13445458`) : 27 questions perspective employeur sur les Gen Z, 293 réponses agrégeables
- Base employeurs : `ACQ_Base_Employeurs_2026.xlsx`

**TR (Transformation Digitale)** :
- Toujours en cours de collecte

### 4.3 Livrables DATATYM™ produits

À la racine du repo (à mettre à jour) — **les vrais fichiers sont sur le disque local, pas dans Git** (ils sont dans .gitignore probablement) :

| Catégorie | Fichier | Notes |
|---|---|---|
| **Référentiel** | DATATYM_53Slides_V3_EN_1.pptx | Document maître du système DATATYM™ |
| **Référentiel** | DATATYM_Referentiel_GenZ_2026.pptx | Adaptation Gen Z |
| **PPT exécutifs** | DATATYM_GenZ_V2_2026.pptx | 29 slides DG |
| **PPT exécutifs** | DATATYM_MasterClass_2026.pptx | 23 slides CEO |
| **PPT exécutifs** | DATATYM_Analytique_2026.pptx | 22 slides DRH/Data |
| **PPT exécutifs** | DATATYM_Rapport_Strategique_GenZ_2026.pptx | Storytelling 3 temps |
| **Rapport** | Rapport_Scientifique_GenZ_DATATYM_2026_V2.docx | ~70 pages, format académique |
| **Rapport** | Miroir_Deformant_GenZ_vs_Employeurs_2026.docx | Croisement vécu vs perception |
| **Stratégie** | GETITHERE_Document_Strategique_2026.docx | Vision plateforme BI multi-verticales |
| **Benchmark** | Benchmark_Plateformes_DATATYM_2026.docx | 15 plateformes analysées |
| **Audit** | DATATYM_Audit_Coherence_GenZ_.pptx | 11 incohérences V1 → V3 |

---

## 5. Scripts générateurs (à la racine)

Tous se lancent depuis la racine avec `.venv/bin/python generate_XXX.py` :

| Script | Génère | Note |
|---|---|---|
| `generate_pptx_v2.py` | PPT V2 GenZ DG | À régénérer si données changent |
| `generate_masterclass.py` | PPT Master Class | |
| `generate_analytique.py` | PPT Analytique | |
| `generate_referentiel_genz.py` | PPT Référentiel Gen Z | |
| `generate_rapport_scientifique_v2.py` | Rapport scientifique V2 | Le plus récent |
| `generate_miroir.py` | Document Miroir Déformant | Croisement Gen Z × ACQ |
| `generate_getithere.py` | Dossier GETITHERE | |
| `generate_benchmark.py` | Benchmark plateformes | |
| `generate_rapport_complet.py` | Rapport complet (long) | |
| `generate_rapport_synthetique.py` | Rapport synthétique (court) | |
| `generate_rapport_activite.py` | Rapport d'activité | |

**Dépendance :** la plupart des scripts lisent `/tmp/genz_dataset.json` ou `/tmp/genz_full_stats.json`. Si ces fichiers n'existent pas, les recréer depuis `GENZ_Base_Exploitable_2026.xlsx`.

---

## 6. Données et stats clés à connaître

### Indices DATATYM™ sur Gen Z (n=673)

| Indice | Score | Note | Formule |
|---|---|---|---|
| IPE™ | 25,3 | D (Rouge) | 100 - Tension × 2 où Tension = Score_interne - NPS_norm |
| IRTA™ | 68,7 | D (Rouge) | D1 + D2 + (D3 × 0,30) - ΔE |
| ILUX™ | 53,9 | C (Orange) | NPS×0,30 + Préf×0,25 + Reco×0,25 + Rem×0,20 |
| IGRO™ | 45,1 | C (Orange) | G1×0,54 + G2×0,46 |
| ICON™ | 37,2 | C | Composite agrégé |

**Grille de notation** : A ≥ 80 · B 60-79 · C 35-59 · D < 35

### Findings clés

- 88% des Gen Z ne se voient plus dans la même entreprise dans 5 ans
- 69% veulent entreprendre (dont 23% déjà en cours)
- 78% d'engagement mais NPS = -29 (paradoxe central)
- Corrélation ICEQ → RECO = 0,78 (équité salariale fait recommander)
- Corrélation IATM → rétention = 0,62 (management fait rester)
- Corrélation salaire → rétention = 0,06 (le salaire ne retient pas)

### Miroir Déformant (Gen Z vs Employeurs)

| Dimension | Gen Z vivent | Employeurs voient | Écart |
|---|---|---|---|
| % qui partent à 12 mois | 65% | 22% | **-43 pts** |
| Satisfaction | 65% | 86% | +21 pts |
| Équité salariale | 48% | 76% | +28 pts |
| Culture alignée | 71% | 89% | +18 pts |

---

## 7. Travail en cours et prochaines étapes

### Court terme

1. **Appliquer migrations 009/010/011 en production**
2. **Lancer sync global** pour repeupler les compteurs
3. **Finaliser collecte TR** (Transformation Digitale)
4. **Valider les derniers PPT** avec le boss (retours en cours)

### Moyen terme

5. **Vague 2 du baromètre** (septembre 2026) — intégrer la variable sexe en priorité absolue
6. **Lancement GETITHERE** — verticale Finance d'abord (rapports BCEAO)
7. **Intégration "Situation financière" comme onglet** dans la plateforme Marketym (demande différée)

### Long terme

8. **datatym.ai** comme plateforme publique (vision 2027)
9. **Partenariats** : Jeune Afrique / Africa CEO Forum (distribution), GeoPoll (collecte mobile)

---

## 8. Préférences de travail (conventions équipe)

D'après les habitudes du projet (à respecter par le repreneur) :

- **Commits** : pas de `Co-Authored-By` Claude. Auteur = Wilfred uniquement.
- **Communication** : français par défaut, pas d'emojis sauf demande explicite.
- **Avant toute action sur le code** : présenter le plan et attendre validation.
- **Sécurité** : ne JAMAIS commiter les `.env`, credentials, clés API. Toujours vérifier `git diff` avant push.
- **Backend** : main.py est monolithique. Pas de séparation en routeurs sauf pour auth. Garder ce style.
- **Frontend** : composants UI réutilisables dans `frontend/src/components/ui.jsx`. Pas de framework UI lourd.

---

## 9. Comment retrouver le contexte avec Claude Code

Quand tu lances Claude Code dans ce repo, il va :

1. Lire automatiquement `CLAUDE.md` (instructions projet)
2. Lire automatiquement `~/.claude/CLAUDE.md` (tes instructions globales personnelles)
3. Découvrir le repo via Read/Grep/Glob au besoin

**Pour reprendre le contexte de la dernière session** :
- Lire `HANDOVER.md` (ce fichier)
- Lire `CLAUDE.md` (section "Dernière Session")
- Demander à Claude : "Lis le HANDOVER et fais-moi un résumé de l'état du projet"

---

## 10. Contacts

- **Lead du projet** : Wilfred TCHAPDA (wilfredkouadjo006@gmail.com)
- **DG** : (à demander à Wilfred)
- **Manager direct** : (à demander à Wilfred)
- **Équipe ACQ/TR** : voir tableau des enquêteurs dans `Plan_Redistribution_ACQ_TR_*.xlsx`

---

**Bonne reprise. Le projet est dense mais bien documenté — prends ton temps de tout lire avant d'agir.**
