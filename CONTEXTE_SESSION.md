# Contexte Session - Suivi Enquetes Marketym

**Date:** 9 mars 2026
**Derniere synchronisation:** OK (14 affectations, 0 erreurs)

---

## Etat du Projet

### URLs de Production
- **Backend Railway:** `https://suivienquetemarketym-prodsuivi.up.railway.app`
- **Frontend Render:** (configurer `VITE_API_URL` avec l'URL ci-dessus)

### Base de donnees
- **Supabase:** `https://fshkxescaqldrnqcwwjc.supabase.co`

---

## Ce qui a ete fait dans cette session

### 1. Quotas Individuels (changement majeur)
- **Avant:** Les quotas etaient proportionnels (globaux partages entre enqueteurs)
- **Apres:** Chaque enqueteur a ses propres limites par segment/pays
- **Logique:** `valides = sum(min(completions_segment, quota))` pour chaque enqueteur
- **"Autre" = INVALIDE:** Les completions avec pays "Autre" ne sont pas comptees

### 2. Normalisation des noms de pays
- Fonction `normalize_country_name()` : supprime accents, apostrophes, met en minuscules
- `PAYS_MAPPING` : aliases (ex: "congo-brazzaville" → "congo")
- Corrige les doublons Senegal/Sénégal dans la base

### 3. Endpoints modifies (backend/app/main.py)

| Endpoint | Modification |
|----------|--------------|
| `GET /admin/dashboard` | Ajout `total_valides`, `total_invalides` avec quotas individuels |
| `GET /admin/enquetes` | Ajout `total_valides` par enquete |
| `GET /admin/enquetes/{id}` | Ajout `completions_valides` par affectation |
| `GET /admin/affectations/by-enquete/{id}` | Ajout `completions_valides` par affectation (corrige cette session) |
| `POST /admin/sync` | Normalise les noms de pays, supprime doublons |

### 4. Frontend (frontend/src/pages/Admin.jsx)
- Labels "Completions" → "Valides" partout
- Utilise `completions_valides ?? completions_total` pour fallback
- Tri par valides dans les tableaux

---

## Donnees actuelles (GENZ)

| Enqueteur | Completions | Valides | Invalides |
|-----------|-------------|---------|-----------|
| DACI YIMETE | 48 | 42 | 6 (togo depasse + autre) |
| NGUIMKENG TOUKEN | 29 | 28 | 1 (autre) |
| NDIAYE | 20 | 19 | 1 (autre) |
| Faye | 12 | 12 | 0 |
| NGUEMFOUO NGOUMTSA | 10 | 9 | 1 (autre) |
| **TOTAL** | **119** | **110** | **9** |

### Quotas GENZ (par enqueteur)
```
benin: 16, burkina faso: 15, cameroun: 22, congo: 8,
cote divoire: 29, gabon: 14, guinee bissau: 8, guinee equatoriale: 7,
mali: 17, niger: 16, rca: 6, senegal: 18, tchad: 11, togo: 13
```

---

## Fichiers cles

```
backend/
  app/
    main.py          # API principale, sync, calcul valides
    auth/
      router.py      # Authentification JWT
      security.py    # Hash, tokens
  .env               # Secrets (Supabase, JWT, Brevo, QuestionPro)
  Dockerfile
  railway.toml

frontend/
  src/
    pages/
      Admin.jsx      # Interface admin complete
      Dashboard.jsx  # Dashboard enqueteur
    lib/
      api.js         # Appels API
```

---

## Pour reprendre

1. **Lancer le backend local:**
   ```bash
   cd backend && source .venv/bin/activate && uvicorn app.main:app --reload
   ```

2. **Lancer le frontend local:**
   ```bash
   cd frontend && npm run dev
   ```

3. **Tester l'API:**
   ```bash
   curl https://suivienquetemarketym-prodsuivi.up.railway.app/
   ```

4. **Generer un token admin (si besoin):**
   ```python
   import jwt
   from datetime import datetime, timedelta, timezone
   token = jwt.encode({
       "sub": "05c0c7f8-bac6-4a6c-b1fd-c9168a3cadbe",  # ID admin
       "email": "wilfredkouadjo006@gmail.com",
       "is_admin": True,
       "role": "super_admin",
       "exp": datetime.now(timezone.utc) + timedelta(hours=24)
   }, "78db567ee7d73ef918b627573ab6f5a16418ebeae4d94b00709fcd25b38aab1b", algorithm="HS256")
   ```

---

## Problemes resolus cette session

1. **Quotas proportionnels → individuels** : Chaque enqueteur a ses propres limites
2. **Doublons Senegal/Sénégal** : Normalisation des noms dans sync
3. **Dashboard erreur 500** : Manquait `id, enquete_id` dans la requete affectations
4. **Detail enquete affichait completions au lieu de valides** : Endpoint `/admin/affectations/by-enquete` ne calculait pas `completions_valides`

---

## Derniers commits

```
620d27d Ajouter completions_valides a l'endpoint affectations/by-enquete
27c69fa Force Render frontend redeploy
0cad913 Fix dashboard: ajouter id et enquete_id dans la requete affectations
9f4a189 Force Railway redeploy
ed8e9be Quotas individuels: chaque enqueteur a ses propres limites
```
