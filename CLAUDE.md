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

## Services & Configurations
- **Email**: Brevo - expediteur `marketym@hcexecutive.net`
- **Auth**: JWT + OTP (code 6 chiffres, expire 5 min)
- **Variables d'env**: voir `/backend/.env`

## Donnees Importantes

### Comptes de test
- **Admin**: wilfredkouadjo006@gmail.com

### Survey IDs QuestionPro
(A remplir quand des surveys sont utilises)
- Survey 1: `_________` - Description
- Survey 2: `_________` - Description

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

### quotas
- id, enquete_id, affectation_id, segment_value, objectif

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
| GET | /stats-pays | Stats par pays |
| GET | /affectations/by-enquete/{id} | Affectations d'une enquete |
| GET | /affectations/{id}/clics | Voir les clics d'une affectation |
| POST | /affectations/migrate-links | Migrer les anciens liens vers le tracking |
| POST | /sync | Synchroniser toutes les affectations |

### Tracking (Public)
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /r/{affectation_id} | Track clic et redirige vers QuestionPro |

### Enqueteur (`/enqueteur`)
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /{id} | Profil et stats enqueteur |

## Pages Frontend

| Route | Composant | Description |
|-------|-----------|-------------|
| /login | Login.jsx | Connexion + lien inscription + mot de passe oublie |
| /register | Register.jsx | Formulaire inscription |
| /admin | Admin.jsx | Dashboard admin complet |
| /dashboard | Dashboard.jsx | Dashboard enqueteur |

## Ce qui a ete fait

### Authentification (Complete)
1. **Inscription** - L'utilisateur cree son compte avec email/mot de passe
2. **Premiere connexion** - Apres login, envoi OTP par email pour valider le compte
3. **Connexions suivantes** - Login direct sans OTP (compte_configure = true)
4. **Mot de passe oublie** - Envoi OTP, puis reset du mot de passe
5. **Emails** - Migration de Resend vers Brevo (domaine verifie)

### Securite Admin (Complete)
1. **Dependance `require_admin`** - Verifie JWT + is_admin
2. **Tous les endpoints `/admin/*` securises** - 401 si pas de token, 403 si pas admin
3. **Intercepteur axios** - Ajoute automatiquement le token JWT aux requetes

### Gestion Enquetes (En cours)
1. **Creation simplifiee** - Seulement survey_id, cible, description
2. **Recuperation auto** - Nom et infos depuis QuestionPro
3. **Modal avec verification** - Bouton "Verifier" avant de creer

### Admin
1. Dashboard avec stats globales
2. Liste des enqueteurs (CRUD)
3. Liste des enquetes (CRUD)
4. Stats par pays
5. Affectations par enquete
6. **Onglet "Mes enquetes"** - Permet aux admins de voir leurs propres affectations en tant qu'enqueteur

### Enqueteur
1. Dashboard enqueteur avec ses stats

## A faire

- [ ] Affectations avec liens personnalises par enqueteur
- [ ] Quotas par enquete (par variable: pays, age, etc.)
- [ ] Synchronisation QuestionPro (recuperer les reponses)
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

## Problemes Resolus

| Probleme | Solution |
|----------|----------|
| Resend n'envoyait qu'a l'email verifie | Migration vers Brevo |
| Emails non recus malgre 200 OK | Ajout logging, redemarrage serveur |
| Comptes dupliques avec meme email | Suppression du compte non-admin |
| Endpoints admin accessibles sans auth | Ajout require_admin sur tous les endpoints |

## Fichiers Importants

```
backend/
  app/
    main.py              # Point d'entree FastAPI + tous les endpoints
    config.py            # Configuration (env vars)
    auth/
      router.py          # Endpoints authentification + require_admin
      security.py        # Hash, JWT, OTP
      email.py           # Envoi emails Brevo
  .env                   # Variables d'environnement

frontend/
  src/
    pages/
      Login.jsx          # Page connexion
      Register.jsx       # Page inscription
      Admin.jsx          # Dashboard admin complet
      Dashboard.jsx      # Dashboard enqueteur
    lib/
      api.js             # Appels API + intercepteur JWT
```

## Derniere Session
**Date**: 9 mars 2025
**Resume**:
- Implementation du tracking des clics avec deduplication par IP
  - Nouvelle table `clics` (affectation_id, ip_address, user_agent, created_at)
  - Endpoint de redirection `/r/{affectation_id}` qui track le clic puis redirige vers QuestionPro
  - Deduplication automatique: un seul clic compte par IP unique par affectation
  - Nouvelle colonne `lien_direct` dans affectations (lien QuestionPro)
  - `lien_questionnaire` contient maintenant le lien de tracking
  - Clics = IPs uniques des reponses QuestionPro (avant: 993, apres: 227)
- Nouveaux endpoints admin:
  - `GET /admin/affectations/{id}/clics` - voir les clics d'une affectation
  - `POST /admin/affectations/migrate-links` - migrer les anciennes affectations
- Migration: `backend/migrations/005_table_clics.sql`
- Correction expediteur email: `marketym@hcexecutive.net` (l'ancien `notification.afrikalytics.co` etait bloque)

**Configuration requise sur Railway**:
- `BACKEND_URL` = URL du backend (ex: `https://api.marketym.com`)
- `EMAIL_FROM` = `marketym@hcexecutive.net`
- Executer la migration SQL dans Supabase
- Appeler `/admin/affectations/migrate-links` pour mettre a jour les anciennes affectations

**Prochain step**:
- Executer la migration en production
- Configurer BACKEND_URL sur Railway
- Tester le tracking des clics
