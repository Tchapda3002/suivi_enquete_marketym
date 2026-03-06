# Plateforme de Suivi Enqueteurs — H&C Executive Education

Application web de suivi de collecte pour enqueteurs QuestionPro avec synchronisation automatique des donnees.

---

## Structure du projet

```
enquetes/
├── supabase/
│   └── schema.sql              ← Schema base de donnees
├── backend/                    ← API FastAPI (Python)
│   ├── app/main.py
│   ├── requirements.txt
│   ├── .env.example            ← Variables d'environnement (template)
│   └── Procfile
├── frontend/                   ← Interface React
│   ├── src/
│   ├── .env.example
│   └── package.json
└── .gitignore
```

---

## Configuration

### 1. Variables d'environnement Backend

Copier `backend/.env.example` vers `backend/.env` et remplir :

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJhbGci...

# QuestionPro API
QUESTIONPRO_API_KEY=13fa4106-d8a5-445d-a4fb-d658a3ff2386

# Optionnel
SYNC_INTERVAL_MINUTES=30
```

### 2. Variables d'environnement Frontend

Copier `frontend/.env.example` vers `frontend/.env` :

```env
VITE_API_URL=http://localhost:8000
```

---

## Deploiement

### Etape 1 — Base de donnees (Supabase)

1. Creer un projet sur [supabase.com](https://supabase.com)
2. SQL Editor → New Query
3. Copier-coller `supabase/schema.sql` → Run
4. Recuperer les cles dans Settings > API

### Etape 2 — Backend (Railway)

1. Deployer le dossier `backend/` sur Railway
2. Ajouter les variables d'environnement
3. URL: `https://ton-app.railway.app`

### Etape 3 — Frontend (Vercel)

1. Deployer le dossier `frontend/` sur Vercel
2. Variable: `VITE_API_URL` = URL Railway
3. URL: `https://suivi-enqueteurs.vercel.app`

---

## Utilisation

### Enqueteur
- Connexion avec identifiant (ACQ1, GENZ2...) et mot de passe
- Voir sa progression globale et par pays
- Acceder a son lien QuestionPro

### Administrateur
- Mot de passe par defaut: `admin2024`
- Voir toutes les enquetes et enqueteurs
- Synchroniser les donnees avec QuestionPro
- Modifier les stats et envoyer des messages

---

## API QuestionPro

L'application synchronise automatiquement :
- Nombre de completions
- Nombre de clics/vues
- Repartition par pays

Les donnees sont recuperees via l'API QuestionPro v2.

---

## Securite

**IMPORTANT : Ne jamais committer les fichiers `.env`**

Les fichiers suivants contiennent des secrets :
- `backend/.env` (cles Supabase, API QuestionPro)
- `frontend/.env` (URL API)

Ces fichiers sont dans `.gitignore`.
