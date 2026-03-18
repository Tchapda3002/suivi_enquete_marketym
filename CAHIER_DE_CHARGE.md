# Cahier de Charge - Marketym v2 (Django)

# Plateforme de Suivi d'Enquetes - H&C Executive

---

## Table des matieres

1. [Presentation generale](#1-presentation-generale)
2. [Architecture technique](#2-architecture-technique)
3. [Schema de base de donnees](#3-schema-de-base-de-donnees)
4. [Application `accounts`](#4-application-accounts)
5. [Application `enquetes`](#5-application-enquetes)
6. [Application `quotas`](#6-application-quotas)
7. [Application `sync`](#7-application-sync)
8. [Application `tracking`](#8-application-tracking)
9. [Application `dashboard`](#9-application-dashboard)
10. [Application `exports`](#10-application-exports)
11. [Application `notifications`](#11-application-notifications)
12. [Integration QuestionPro](#12-integration-questionpro)
13. [Logique metier detaillee](#13-logique-metier-detaillee)
14. [Templates et pages](#14-templates-et-pages)
15. [Etapes d'implementation](#15-etapes-dimplementation)

---

## 1. Presentation generale

### 1.1 Contexte

H&C Executive realise des enquetes terrain via des enqueteurs. Les sondages sont heberges sur QuestionPro. Cette plateforme permet de :

- Gerer les enqueteurs (comptes, affectations, suivi)
- Gerer les enquetes (creation, configuration, quotas)
- Suivre la progression en temps reel (completions, quotas, segmentations)
- Synchroniser les donnees avec QuestionPro
- Visualiser les statistiques (dashboards admin et enqueteur)
- Gerer les quotas simples et croises
- Tracker les clics sur les liens de collecte
- Exporter les donnees

### 1.2 Utilisateurs

| Role | Description | Acces |
|------|-------------|-------|
| **Super Admin** | Gestionnaire de la plateforme | Tout |
| **Admin** | Responsable d'enquetes | Gestion enquetes, enqueteurs, affectations |
| **Enqueteur** | Realise les enquetes terrain | Dashboard personnel, ses enquetes |

### 1.3 Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Django 5.x |
| Base de donnees | PostgreSQL (Supabase) |
| Templates | Django Templates + HTML/CSS |
| CSS | TailwindCSS (via CDN ou build) |
| Emails | Brevo (ex-Sendinblue) via API |
| Sondages | QuestionPro API v2 |
| Deploiement backend | Railway |
| Deploiement frontend | Render (ou Railway unique) |
| Taches planifiees | django-crontab ou Celery (optionnel) |

### 1.4 Contraintes

- Pas d'API REST separee : tout en server-side rendering
- Pas de framework JavaScript (React, Vue, etc.)
- JavaScript minimal uniquement pour interactions UI (modals, toggles, AJAX ponctuel)
- Hebergement sur Railway/Render
- Base de donnees PostgreSQL existante sur Supabase (migration des donnees)

---

## 2. Architecture technique

### 2.1 Structure du projet Django

```
marketym/
    manage.py
    marketym/                   # Projet Django principal
        __init__.py
        settings.py
        urls.py
        wsgi.py
        asgi.py
    accounts/                   # Authentification, utilisateurs
        models.py
        views.py
        forms.py
        urls.py
        templates/accounts/
        admin.py
        services/
            email_service.py    # Envoi emails Brevo
            otp_service.py      # Generation/verification OTP
    enquetes/                   # Enquetes, affectations, segmentations
        models.py
        views.py
        forms.py
        urls.py
        templates/enquetes/
        admin.py
    quotas/                     # Quotas simples et croises
        models.py
        views.py
        forms.py
        urls.py
        templates/quotas/
        admin.py
    sync/                       # Synchronisation QuestionPro
        models.py               # (vide ou logs de sync)
        views.py
        services/
            questionpro.py      # Client QuestionPro API
            sync_engine.py      # Logique de synchronisation
        urls.py
        templates/sync/
    tracking/                   # Tracking clics
        models.py
        views.py
        urls.py
        middleware.py           # (optionnel)
    dashboard/                  # Dashboards admin + enqueteur
        views.py
        urls.py
        templates/dashboard/
        templatetags/
            dashboard_tags.py   # Filtres/tags custom
    exports/                    # Export CSV/Excel
        views.py
        urls.py
        services/
            csv_export.py
            excel_export.py
    notifications/              # Emails, rappels
        models.py
        views.py
        services/
            reminder_service.py
        urls.py
    templates/                  # Templates globaux
        base.html               # Layout principal
        base_admin.html         # Layout admin (sidebar)
        base_enqueteur.html     # Layout enqueteur
        components/             # Includes reutilisables
            navbar.html
            sidebar.html
            modal.html
            progress_bar.html
            stat_card.html
            table.html
            pagination.html
            alert.html
            badge.html
            chart_bar.html      # Barre de graphique CSS
    static/
        css/
            main.css            # Styles principaux
            components.css      # Styles composants
        js/
            main.js             # JS minimal (modals, confirmations)
            charts.js           # Graphiques barres CSS
```

### 2.2 Settings principaux

```python
# marketym/settings.py - Variables d'environnement requises

# Base de donnees
DATABASE_URL              # PostgreSQL (Supabase)

# Supabase (acces direct pour operations speciales)
SUPABASE_URL
SUPABASE_KEY

# QuestionPro
QUESTIONPRO_API_KEY
QUESTIONPRO_BASE_URL = "https://api.questionpro.com/a/api/v2"

# Email (Brevo)
BREVO_API_KEY
EMAIL_FROM                # ex: marketym@hcexecutive.net
EMAIL_FROM_NAME           # ex: Marketym

# Securite
SECRET_KEY                # Django secret key
JWT_SECRET_KEY            # Pour tokens d'invitation (pas pour auth session)
JWT_ALGORITHM = "HS256"

# OTP
OTP_EXPIRE_MINUTES = 5
OTP_MAX_ATTEMPTS = 3
OTP_LENGTH = 6

# Application
FRONTEND_URL              # URL publique du site
ALLOWED_HOSTS
SYNC_INTERVAL_MINUTES = 30
```

### 2.3 Middleware et configuration

- `SessionMiddleware` : authentification par session Django
- `AuthenticationMiddleware` : gestion utilisateur connecte
- `CsrfViewMiddleware` : protection CSRF
- `SecurityMiddleware` : HTTPS, HSTS en production
- Pas besoin de CORS (pas d'API separee)

---

## 3. Schema de base de donnees

### 3.1 Diagramme des tables

```
enqueteurs (accounts.Enqueteur - extends AbstractUser)
    |
    |--- otp_codes
    |--- invitation_tokens
    |
    |--- affectations ---|--- enquetes
    |                    |--- clics
    |                    |--- completions_segments
    |                    |--- completions_combinations
    |                    |--- historique_completions
    |
    enquetes
    |--- segmentations ---|--- answer_options (JSON)
    |--- quotas
    |--- quota_configs ---|--- quota_config_questions
                          |--- completions_combinations

    zones --- pays
```

### 3.2 Modeles detailles

#### `accounts.Enqueteur` (etend `AbstractUser`)

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto | Identifiant unique |
| email | varchar(255) | UNIQUE, NOT NULL | Email (= username) |
| nom | varchar(100) | NOT NULL | Nom de famille |
| prenom | varchar(100) | NOT NULL | Prenom |
| telephone | varchar(20) | NULL | Telephone |
| identifiant | varchar(20) | UNIQUE, NOT NULL | Code court (ex: "WK47HP") |
| token | varchar(20) | UNIQUE, NULL | Token QuestionPro tracking |
| actif | boolean | default TRUE | Compte actif |
| role | varchar(20) | default 'enqueteur' | 'super_admin', 'admin', 'enqueteur' |
| compte_configure | boolean | default FALSE | OTP premiere connexion valide |
| doit_changer_mdp | boolean | default FALSE | Forcer changement MDP |
| derniere_connexion | datetime | NULL | Derniere connexion |
| created_at | datetime | auto | Date de creation |

**Note** : Le champ `password` est herite d'`AbstractUser` (hash bcrypt via Django).

#### `accounts.OtpCode`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| email | varchar(255) | NOT NULL, INDEX | Email associe |
| code_hash | varchar(255) | NOT NULL | Hash bcrypt du code |
| expires_at | datetime | NOT NULL | Expiration |
| attempts | int | default 0 | Tentatives echouees |
| used | boolean | default FALSE | Deja utilise |
| created_at | datetime | auto | |

#### `accounts.InvitationToken`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| enqueteur | FK(Enqueteur) | NOT NULL | Enqueteur invite |
| token | varchar(255) | UNIQUE, NOT NULL | Token securise (64 chars) |
| expires_at | datetime | NOT NULL | Expiration (48h) |
| used | boolean | default FALSE | Deja utilise |
| used_at | datetime | NULL | Date d'utilisation |
| created_at | datetime | auto | |

#### `enquetes.Zone`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| nom | varchar(100) | UNIQUE, NOT NULL | Nom de la zone |

#### `enquetes.Pays`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| nom | varchar(100) | NOT NULL | Nom du pays |
| code | varchar(10) | NULL | Code ISO |
| zone | FK(Zone) | NULL | Zone geographique |

#### `enquetes.Enquete`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| survey_id | varchar(50) | NOT NULL | ID QuestionPro |
| code | varchar(20) | UNIQUE, NULL | Code interne |
| nom | varchar(300) | NOT NULL | Nom (depuis QuestionPro) |
| description | text | NULL | Description |
| cible | int | default 0 | Objectif global |
| statut | varchar(20) | default 'en_cours' | 'en_cours', 'termine', 'archive' |
| survey_url | text | NULL | URL du sondage QuestionPro |
| created_at | datetime | auto | |

#### `enquetes.Affectation`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| enqueteur | FK(Enqueteur) | NOT NULL, CASCADE | |
| enquete | FK(Enquete) | NOT NULL, CASCADE | |
| survey_id | varchar(50) | NOT NULL | ID QuestionPro (denormalise) |
| lien_questionnaire | text | NULL | Lien de tracking `/r/{id}` |
| lien_direct | text | NULL | Lien QuestionPro direct |
| objectif_total | int | default 0 | Objectif pour cet enqueteur |
| completions_total | int | default 0 | Total completions |
| clics | int | default 0 | Nombre de clics uniques |
| statut | varchar(20) | default 'en_cours' | |
| commentaire_admin | text | NULL | Note admin |
| derniere_synchro | datetime | NULL | Derniere sync QP |
| created_at | datetime | auto | |

**Contrainte** : UNIQUE(enqueteur, enquete)

#### `enquetes.Segmentation`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| enquete | FK(Enquete) | NOT NULL, CASCADE | |
| question_id | varchar(50) | NOT NULL | ID question QuestionPro |
| question_text | varchar(500) | NOT NULL | Texte de la question |
| answer_options | JSON | default [] | Options de reponse cachees depuis QP |
| created_at | datetime | auto | |

**Contrainte** : UNIQUE(enquete, question_id)

#### `quotas.Quota`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| enquete | FK(Enquete) | NOT NULL, CASCADE | |
| affectation | FK(Affectation) | NULL, CASCADE | NULL = quota global |
| segmentation | FK(Segmentation) | NULL, CASCADE | Pour quotas simples |
| segment_value | varchar(200) | NULL | Valeur du segment |
| objectif | int | default 0 | Objectif |
| quota_config | FK(QuotaConfig) | NULL, CASCADE | Pour quotas croises |
| combination | JSON | NULL | Combinaison croisee |
| pourcentage | decimal(5,2) | default 0 | % de repartition |

#### `quotas.QuotaConfig`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| enquete | FK(Enquete) | NOT NULL, CASCADE | |
| nom | varchar(200) | NOT NULL | Nom du croisement |
| created_at | datetime | auto | |

#### `quotas.QuotaConfigQuestion`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| quota_config | FK(QuotaConfig) | NOT NULL, CASCADE | |
| segmentation | FK(Segmentation) | NOT NULL | |
| position | int | default 0 | Ordre |

**Contrainte** : UNIQUE(quota_config, segmentation)

#### `sync.CompletionSegment`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| affectation | FK(Affectation) | NOT NULL, CASCADE | |
| segmentation | FK(Segmentation) | NOT NULL | |
| segment_value | varchar(200) | NOT NULL | Valeur exacte QP |
| completions | int | default 0 | Nombre de completions |
| updated_at | datetime | auto | |

**Contrainte** : UNIQUE(affectation, segmentation, segment_value)

#### `sync.CompletionCombination`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| affectation | FK(Affectation) | NOT NULL, CASCADE | |
| quota_config | FK(QuotaConfig) | NOT NULL, CASCADE | |
| combination | JSON | NOT NULL | Ex: {"Pays":"Senegal","Secteur":"Finance"} |
| completions | int | default 0 | |
| updated_at | datetime | auto | |

**Contrainte** : UNIQUE(affectation, quota_config, combination)

#### `sync.CompletionPays`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| affectation | FK(Affectation) | NOT NULL, CASCADE | |
| pays | varchar(100) | NOT NULL | Pays |
| completions | int | default 0 | |
| updated_at | datetime | auto | |

**Contrainte** : UNIQUE(affectation, pays)

#### `sync.HistoriqueCompletion`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| affectation | FK(Affectation) | NOT NULL, CASCADE | |
| completions | int | NOT NULL | Completions a cet instant |
| recorded_at | datetime | auto | |

#### `tracking.Clic`

| Champ | Type | Contraintes | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| affectation | FK(Affectation) | NOT NULL, CASCADE | |
| ip_address | varchar(45) | NOT NULL | IP du visiteur |
| user_agent | text | NULL | User-Agent |
| created_at | datetime | auto | |

**Contrainte** : UNIQUE(affectation, ip_address) - deduplication par IP

---

## 4. Application `accounts`

### 4.1 Fonctionnalites

1. **Inscription** (self-registration)
2. **Connexion** (email + mot de passe)
3. **OTP premiere connexion** (code 6 chiffres par email)
4. **Mot de passe oublie** (envoi OTP, reset)
5. **Changement de mot de passe**
6. **Profil enqueteur** (modification avec OTP de confirmation)
7. **Invitation par admin** (email avec lien d'activation, token 48h)
8. **Gestion des roles** (super_admin, admin, enqueteur)
9. **Creation enqueteur par admin** (avec envoi invitation)

### 4.2 Flux d'authentification

```
1. Inscription (/accounts/register)
   └─> Creation compte (compte_configure=False)
   └─> Redirect vers /accounts/login

2. Premiere connexion (/accounts/login)
   └─> Email + Password OK
   └─> Si compte_configure=False : envoi OTP, redirect /accounts/activate
   └─> Si compte_configure=True : creation session, redirect /dashboard

3. Activation (/accounts/activate)
   └─> Saisie code OTP
   └─> Si OK : compte_configure=True, creation session, redirect /dashboard

4. Mot de passe oublie (/accounts/forgot-password)
   └─> Saisie email
   └─> Envoi OTP
   └─> Redirect /accounts/reset-password

5. Reset password (/accounts/reset-password)
   └─> Saisie email + code OTP + nouveau mot de passe
   └─> Si OK : redirect /accounts/login

6. Invitation (email)
   └─> Admin cree enqueteur -> envoi email avec lien /accounts/activate/{token}
   └─> Enqueteur clique -> definit son mot de passe
   └─> compte_configure=True, redirect /accounts/login
```

### 4.3 Vues

| URL | Vue | Methode | Description |
|-----|-----|---------|-------------|
| /accounts/login | `LoginView` | GET/POST | Formulaire de connexion |
| /accounts/register | `RegisterView` | GET/POST | Formulaire d'inscription |
| /accounts/activate | `ActivateView` | GET/POST | Saisie code OTP |
| /accounts/activate/{token} | `ActivateTokenView` | GET/POST | Activation par lien d'invitation |
| /accounts/forgot-password | `ForgotPasswordView` | GET/POST | Demande reset |
| /accounts/reset-password | `ResetPasswordView` | GET/POST | Reset avec OTP |
| /accounts/change-password | `ChangePasswordView` | GET/POST | Changer MDP (authentifie) |
| /accounts/profile | `ProfileView` | GET/POST | Modifier profil (avec OTP) |
| /accounts/logout | `LogoutView` | POST | Deconnexion |

### 4.4 Services

#### `email_service.py`

Utilise l'API Brevo (sib_api_v3_sdk) pour envoyer :

- **Email OTP** : code 6 chiffres, expire en 5 min
- **Email de bienvenue** : lien d'activation, expire en 48h
- **Email reset password** : code OTP

Templates HTML integres dans le code Python (inline). Style : fond blanc, bouton vert #059669, police system, max-width 480px.

#### `otp_service.py`

- `generate_otp(length=6)` : code numerique aleatoire (secrets.choice)
- `hash_code(code)` : hash bcrypt
- `verify_code(code, hash)` : verification bcrypt
- `create_otp(email)` : genere OTP, hash, sauvegarde en base, retourne code clair
- `verify_otp(email, code)` : verifie code, marque comme utilise, gere tentatives (max 3)

### 4.5 Securite

- Mots de passe hashes avec bcrypt (via Django `make_password`/`check_password` ou bcrypt direct)
- Sessions Django (cookie securise, HttpOnly, SameSite)
- Protection CSRF sur tous les formulaires POST
- OTP : max 3 tentatives, expiration 5 minutes, code a usage unique
- Tokens d'invitation : 64 caracteres securises (`secrets.token_urlsafe(48)`), expiration 48h
- Identifiants enqueteurs : 6 caracteres alphanumeriques sans ambiguite (sans 0, O, I, L)

### 4.6 Decorateurs d'acces

```python
@login_required                    # Tout utilisateur connecte
@admin_required                    # role in ('admin', 'super_admin')
@super_admin_required              # role == 'super_admin'
```

---

## 5. Application `enquetes`

### 5.1 Fonctionnalites

1. **CRUD Enquetes** (admin)
2. **CRUD Affectations** (admin)
3. **CRUD Segmentations** (admin)
4. **Gestion des liens de collecte** (tracking + direct)
5. **Vue detail enquete** (admin)
6. **Vue mes enquetes** (enqueteur)

### 5.2 Vues Admin

| URL | Vue | Description |
|-----|-----|-------------|
| /admin/enquetes/ | `EnqueteListView` | Liste des enquetes |
| /admin/enquetes/create/ | `EnqueteCreateView` | Creer enquete (survey_id) |
| /admin/enquetes/{id}/ | `EnqueteDetailView` | Detail avec affectations, segmentations, quotas |
| /admin/enquetes/{id}/edit/ | `EnqueteUpdateView` | Modifier enquete |
| /admin/enquetes/{id}/delete/ | `EnqueteDeleteView` | Supprimer enquete |
| /admin/enqueteurs/ | `EnqueteurListView` | Liste des enqueteurs |
| /admin/enqueteurs/create/ | `EnqueteurCreateView` | Creer enqueteur + envoi invitation |
| /admin/enqueteurs/{id}/ | `EnqueteurDetailView` | Detail enqueteur (= dashboard enqueteur vu par admin) |
| /admin/enqueteurs/{id}/edit/ | `EnqueteurUpdateView` | Modifier enqueteur |
| /admin/enqueteurs/{id}/delete/ | `EnqueteurDeleteView` | Supprimer enqueteur |
| /admin/affectations/create/ | `AffectationCreateView` | Creer affectation |
| /admin/affectations/{id}/edit/ | `AffectationUpdateView` | Modifier affectation |
| /admin/affectations/{id}/delete/ | `AffectationDeleteView` | Supprimer affectation |
| /admin/segmentations/create/ | `SegmentationCreateView` | Creer segmentation |
| /admin/segmentations/{id}/edit/ | `SegmentationUpdateView` | Modifier segmentation |
| /admin/segmentations/{id}/delete/ | `SegmentationDeleteView` | Supprimer segmentation |

### 5.3 Creation d'enquete

A la creation, l'admin saisit uniquement le `survey_id` QuestionPro. Le systeme :

1. Appelle `GET /surveys/{survey_id}` de QuestionPro
2. Recupere : `nom`, `survey_url`, `status`
3. Sauvegarde en base avec `statut = 'en_cours'`

### 5.4 Creation d'affectation

Lors de la creation d'une affectation :

1. Admin selectionne un enqueteur et une enquete
2. Saisit l'objectif total
3. Le systeme genere :
   - `lien_direct` : URL QuestionPro avec custom variable `custom1={token_enqueteur}` pour tracking
   - `lien_questionnaire` : URL de tracking interne `/r/{affectation_id}` qui redirige vers `lien_direct`

Format du lien direct (recupere depuis l'API QP) :
```
{survey_url}?custom1={enqueteur.token}
```

### 5.5 Creation de segmentation

Lors de la creation d'une segmentation :

1. Admin selectionne une enquete
2. Fetch les questions du sondage via `GET /surveys/{survey_id}/questions`
3. Selectionne une question (de type choix unique/multiple)
4. Le systeme sauvegarde :
   - `question_id` : ID de la question QP
   - `question_text` : texte de la question
   - `answer_options` : JSON des options de reponse `[{"id": 123, "text": "Senegal"}, ...]`

Les `answer_options` sont cachees en base pour eviter des appels API repetitifs. Elles servent a :
- Generer les quotas (une ligne par option)
- Generer les combinaisons croisees
- Matcher les reponses lors de la sync (comparaison exacte, aucune normalisation)

---

## 6. Application `quotas`

### 6.1 Quotas simples

Un quota simple est defini par :
- Une enquete
- Une segmentation (question QP)
- Un segment_value (option de reponse)
- Un objectif (nombre de completions souhaitees)
- Optionnel : une affectation (quota par enqueteur)

Si `affectation = NULL` : quota global pour l'enquete entiere.
Si `affectation != NULL` : quota specifique a un enqueteur.

#### Creation en masse

L'admin peut creer des quotas en masse : pour une segmentation donnee, definir un objectif par option de reponse. Le systeme cree une ligne `Quota` par option.

### 6.2 Quotas croises (cross-tabulation)

Un quota croise combine N segmentations (ex: Pays x Secteur x Taille) pour definir des objectifs par combinaison.

#### Structure

```
QuotaConfig (nom: "Pays x Secteur", enquete)
    |--- QuotaConfigQuestion (segmentation: Pays, position: 0)
    |--- QuotaConfigQuestion (segmentation: Secteur, position: 1)
    |
    |--- Quota (combination: {"Pays":"Senegal","Secteur":"Finance"}, objectif: 20, pourcentage: 15%)
    |--- Quota (combination: {"Pays":"Senegal","Secteur":"Telecom"}, objectif: 10, pourcentage: 8%)
    |--- ...
```

#### Processus de creation

1. Admin clique "Creer quota croise"
2. **Etape 1** : Selectionne N segmentations (checkboxes parmi celles de l'enquete)
3. **Etape 2** : Le systeme genere le produit cartesien de toutes les `answer_options`
4. **Etape 3** : Admin saisit un pourcentage par combinaison (bouton "Repartition equitable" disponible)
5. Les objectifs sont calcules : `objectif_combo = pourcentage * cible_enquete / 100`
6. Le systeme cree :
   - 1 `QuotaConfig`
   - N `QuotaConfigQuestion`
   - P `Quota` (P = produit cartesien des options)

#### Generation de combinaisons

```python
from itertools import product

def generate_combinations(segmentations):
    """
    segmentations = [
        {"question_text": "Pays", "answer_options": [{"text": "Senegal"}, {"text": "Cote d'Ivoire"}]},
        {"question_text": "Secteur", "answer_options": [{"text": "Finance"}, {"text": "Telecom"}]},
    ]
    Resultat = [
        {"Pays": "Senegal", "Secteur": "Finance"},
        {"Pays": "Senegal", "Secteur": "Telecom"},
        {"Pays": "Cote d'Ivoire", "Secteur": "Finance"},
        {"Pays": "Cote d'Ivoire", "Secteur": "Telecom"},
    ]
    """
    keys = [s["question_text"] for s in segmentations]
    values = [
        [opt["text"] for opt in s["answer_options"]]
        for s in segmentations
    ]
    return [
        dict(zip(keys, combo))
        for combo in product(*values)
    ]
```

### 6.3 Vues Admin

| URL | Vue | Description |
|-----|-----|-------------|
| /admin/quotas/enquete/{id}/ | `QuotasByEnqueteView` | Quotas d'une enquete |
| /admin/quotas/create/ | `QuotaCreateView` | Creer quota simple |
| /admin/quotas/bulk-create/ | `QuotaBulkCreateView` | Creer quotas en masse |
| /admin/quotas/{id}/edit/ | `QuotaUpdateView` | Modifier quota |
| /admin/quotas/{id}/delete/ | `QuotaDeleteView` | Supprimer quota |
| /admin/quota-configs/create/ | `QuotaConfigCreateView` | Creer quota croise (multi-etapes) |
| /admin/quota-configs/{id}/ | `QuotaConfigDetailView` | Detail quota croise |
| /admin/quota-configs/{id}/delete/ | `QuotaConfigDeleteView` | Supprimer quota croise |

---

## 7. Application `sync`

### 7.1 Fonctionnalites

Synchronisation des donnees de reponses depuis QuestionPro vers la base locale.

### 7.2 Processus de synchronisation

Pour chaque affectation d'une enquete `en_cours` :

```
1. Appeler GET /surveys/{survey_id}/responses?page=1&perPage=1000
   - Filtrer par custom1 = {enqueteur.token}
   - Paginer si necessaire

2. Pour chaque reponse :
   a. Compter les completions totales pour cet enqueteur
   b. Pour chaque segmentation de l'enquete :
      - Trouver la reponse a la question (par question_id)
      - Extraire le segment_value (texte de l'option choisie)
      - Upsert dans completions_segments
   c. Pour chaque quota_config de l'enquete :
      - Construire la combinaison JSON depuis les reponses
      - Upsert dans completions_combinations

3. Mettre a jour affectation.completions_total
4. Mettre a jour affectation.derniere_synchro
5. Inserer dans historique_completions (snapshot)
```

### 7.3 Correspondance des reponses

Les valeurs de segment sont stockees **telles quelles** depuis QuestionPro. Aucune normalisation n'est effectuee. Le matching se fait par comparaison exacte entre `answer_options[].text` et la valeur retournee par l'API.

### 7.4 Serialisation des combinaisons

Pour les quotas croises, les combinaisons sont serialisees en JSON avec `json.dumps(combo, sort_keys=True)` pour garantir l'unicite des cles de deduplication :

```python
combo = {"Pays": "Senegal", "Secteur": "Finance"}
combo_key = json.dumps(combo, sort_keys=True)
# '{"Pays": "Senegal", "Secteur": "Finance"}'
```

### 7.5 Vues

| URL | Vue | Description |
|-----|-----|-------------|
| /admin/sync/ | `SyncAllView` | POST : lancer sync complete |
| /admin/sync/{affectation_id}/ | `SyncAffectationView` | POST : sync une affectation |
| /enqueteur/{id}/sync/ | `EnqueteurSyncView` | POST : sync enqueteur |

### 7.6 Optimisations

- `per_page = 1000` (max autorise par QP) au lieu de 100
- Sync uniquement les enquetes `statut = 'en_cours'`
- `answer_options` cachees en base (pas de re-fetch des questions a chaque sync)
- Rate limiting : 300 appels / 60 secondes sur QP (surveiller)
- Quota API : 5000 appels gratuits / mois

---

## 8. Application `tracking`

### 8.1 Fonctionnalites

Tracking des clics sur les liens de collecte avec deduplication par IP.

### 8.2 Flux

```
Enqueteur partage le lien: https://marketym.com/r/{affectation_id}
    |
    └─> Visiteur clique
        └─> GET /r/{affectation_id}
            1. Recuperer IP du visiteur (X-Forwarded-For ou REMOTE_ADDR)
            2. Tenter INSERT INTO clics (affectation_id, ip_address, user_agent)
               - Si UNIQUE violation (ip deja vue) → ignorer
               - Si OK → incrementer affectation.clics += 1
            3. Redirect 302 vers affectation.lien_direct
```

### 8.3 Vues

| URL | Vue | Description |
|-----|-----|-------------|
| /r/{affectation_id} | `TrackClickView` | GET : track + redirect |
| /admin/affectations/{id}/clics/ | `ClicListView` | Liste des clics d'une affectation |

---

## 9. Application `dashboard`

### 9.1 Dashboard Admin

#### Page principale (`/admin/`)

**KPI globaux** (cartes en haut) :
- Enquetes actives (nombre)
- Enqueteurs actifs (nombre)
- Completions totales (somme)
- Taux de completion moyen (%)

**Liste des enquetes en cours** : tableau avec nom, cible, completions, taux, statut

**Enqueteurs recents** : derniers connectes

#### Detail enquete admin (`/admin/enquetes/{id}/`)

**KPI enquete** :
- Cible totale
- Completions totales
- Completions valides (apres logique excedent)
- Excedents (completions au-dela de la cible)
- Taux de completion (valides / cible * 100)
- Clics totaux

**Tableau des affectations** : enqueteur, objectif, completions, completions valides, excedents, taux, clics, derniere sync

**Graphiques barres par segmentation** : pour chaque segmentation de l'enquete, un graphique en barres horizontales CSS montrant objectif vs completions par segment_value. Si quota defini : barre objectif + barre completions. Sinon : barre completions seule.

**Tableau croise** (si quota_configs existent) : tableau avec une colonne par variable du croisement + colonnes %, Objectif, Completions, Progression

#### Detail enqueteur admin (`/admin/enqueteurs/{id}/`)

Affiche le **meme dashboard que l'enqueteur verrait**, mais dans le layout admin. Permet a l'admin de voir exactement ce que l'enqueteur voit :
- KPI personnels
- Liste des enquetes affectees
- Graphiques par segmentation
- Historique

### 9.2 Dashboard Enqueteur

#### Page principale (`/dashboard/`)

**Onglets** : Tableau de bord | Mes enquetes | Profil

**Onglet Tableau de bord** :
- KPI : Enquetes actives, Completions totales, Taux moyen
- Liste des enquetes avec progression

**Onglet Mes enquetes** :
- Liste des enquetes affectees
- Pour chaque enquete : objectif, completions, taux
- Clic sur une enquete → detail

**Detail enquete enqueteur** :
- KPI : objectif, completions, completions valides, excedents, taux
- Lien de collecte (avec bouton copier)
- **Graphiques barres par segmentation** : meme format que l'admin, barres horizontales CSS

**Onglet Profil** :
- Infos personnelles (nom, prenom, email, telephone, identifiant)
- Modification avec OTP de confirmation
- Changement de mot de passe

### 9.3 Graphiques barres CSS

Pas de librairie JS. Barres horizontales en CSS pur :

```html
<!-- Exemple de barre -->
<div class="bar-container">
    <div class="bar-label">Senegal</div>
    <div class="bar-track">
        <div class="bar-fill" style="width: 75%;">
            <span class="bar-value">150 / 200</span>
        </div>
    </div>
</div>
```

```css
.bar-track {
    background: #E5E7EB;
    border-radius: 8px;
    height: 32px;
    position: relative;
}
.bar-fill {
    background: #059669;
    border-radius: 8px;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 12px;
    color: white;
    font-size: 13px;
    min-width: fit-content;
}
.bar-fill.exceeded {
    background: #F59E0B; /* orange pour excedent */
}
```

Couleurs :
- Vert `#059669` : en cours, normal
- Orange `#F59E0B` : excedent
- Gris `#E5E7EB` : fond de barre

---

## 10. Application `exports`

### 10.1 Fonctionnalites

Export des donnees en CSV et Excel (optionnel).

### 10.2 Exports disponibles

| Export | Contenu |
|--------|---------|
| Enqueteurs | id, nom, prenom, email, telephone, identifiant, actif, role, date creation |
| Affectations par enquete | enqueteur, objectif, completions, valides, excedents, taux, clics, derniere sync |
| Quotas par enquete | segment, objectif, completions, valides, excedents, % |
| Historique completions | date, enqueteur, enquete, completions |

### 10.3 Vues

| URL | Vue | Description |
|-----|-----|-------------|
| /admin/exports/enqueteurs/ | `ExportEnqueteursView` | CSV enqueteurs |
| /admin/exports/enquete/{id}/affectations/ | `ExportAffectationsView` | CSV affectations |
| /admin/exports/enquete/{id}/quotas/ | `ExportQuotasView` | CSV quotas |

---

## 11. Application `notifications`

### 11.1 Fonctionnalites

- Envoi d'emails de rappel aux enqueteurs
- Alertes de quota atteint
- Recapitulatifs periodiques (optionnel)

### 11.2 Types de notifications

| Type | Declencheur | Destinataire |
|------|-------------|--------------|
| Rappel inactivite | Enqueteur inactif > X jours | Enqueteur |
| Quota atteint | Completions >= objectif sur un segment | Admin |
| Excedent detecte | Completions > cible globale | Admin |
| Recapitulatif | Periodique (hebdomadaire) | Admin |

### 11.3 Implementation

Phase initiale : manuellement via bouton admin ("Envoyer rappel").
Phase ulterieure : tache Celery/cron pour automatiser.

---

## 12. Integration QuestionPro

### 12.1 API QuestionPro v2

- **Base URL** : `https://api.questionpro.com/a/api/v2`
- **Authentification** : Header `api-key: {QUESTIONPRO_API_KEY}`
- **Limites** : 5000 appels gratuits/mois, 300 appels/60 secondes
- **Pagination** : `page` (1-based) + `perPage` (max 1000)

### 12.2 Endpoints utilises

| Endpoint | Usage | Quand |
|----------|-------|-------|
| `GET /surveys/{id}` | Info sondage (nom, URL, statut) | Creation enquete |
| `GET /surveys/{id}/questions` | Questions + options reponse | Creation segmentation |
| `GET /surveys/{id}/responses` | Reponses des participants | Synchronisation |

### 12.3 Structure de reponse QuestionPro

```json
// GET /surveys/{id}/responses
{
  "response": [
    {
      "responseID": 12345,
      "timestamp": "2026-01-15T10:30:00Z",
      "customVariables": [
        {"variableKey": "custom1", "variableValue": "WK47HP"}
      ],
      "questionResponse": [
        {
          "questionID": 67890,
          "answerValues": [
            {"answerID": 111, "value": {"text": "Senegal"}}
          ]
        }
      ]
    }
  ]
}
```

### 12.4 Filtrage par enqueteur

Chaque enqueteur a un `token` unique (6 caracteres). A la creation d'une affectation, le lien QuestionPro est genere avec `?custom1={token}`. Lors de la sync, on filtre les reponses dont `customVariables[custom1] == token`.

### 12.5 Client QuestionPro (`sync/services/questionpro.py`)

```python
class QuestionProClient:
    def __init__(self, api_key):
        self.base_url = "https://api.questionpro.com/a/api/v2"
        self.headers = {"api-key": api_key}

    def get_survey(self, survey_id) -> dict
    def get_questions(self, survey_id) -> list
    def get_responses(self, survey_id, page=1, per_page=1000) -> list
    def get_all_responses(self, survey_id) -> list  # avec pagination auto
```

---

## 13. Logique metier detaillee

### 13.1 Logique des excedents (IMPORTANT)

Les excedents sont calcules au niveau **global de l'enquete** d'abord, puis propages aux enqueteurs individuels.

#### Principe

1. On a une enquete avec `cible = 100`
2. Plusieurs enqueteurs y sont affectes
3. Tant que le total des completions de TOUS les enqueteurs <= 100, TOUTES les completions sont valides
4. Des que le total depasse 100, les completions en surplus deviennent des excedents
5. Les excedents sont attribues chronologiquement : les **dernieres** completions arrivent sont les excedents

#### Exemple

```
Enquete "Satisfaction Client" - Cible: 100

Enqueteur A : 45 completions (arrivees en premier)
Enqueteur B : 35 completions
Enqueteur C : 30 completions (arrivees en dernier)
Total: 110 -> Excedent global: 10

Repartition des excedents (chronologiquement, derniers arrivent = excedents) :
- Enqueteur C : 30 completions, dont 10 sont excedent → 20 valides, 10 excedents
- Enqueteur B : 35 completions → 35 valides, 0 excedent
- Enqueteur A : 45 completions → 45 valides, 0 excedent
```

#### Algorithme

```python
def calculer_excedents(enquete, affectations):
    """
    Calcule les completions valides et excedents par affectation.
    Les excedents sont attribues aux derniers arrivants (par date de derniere sync).
    """
    cible = enquete.cible
    total = sum(a.completions_total for a in affectations)

    if total <= cible:
        # Pas d'excedent
        return {a.id: {"valides": a.completions_total, "excedents": 0} for a in affectations}

    excedent_global = total - cible
    restant_excedent = excedent_global

    # Trier par derniere_synchro DESC (derniers arrivent = premiers a avoir excedents)
    sorted_aff = sorted(affectations, key=lambda a: a.derniere_synchro or datetime.min, reverse=True)

    result = {}
    for aff in sorted_aff:
        if restant_excedent <= 0:
            result[aff.id] = {"valides": aff.completions_total, "excedents": 0}
        elif aff.completions_total <= restant_excedent:
            result[aff.id] = {"valides": 0, "excedents": aff.completions_total}
            restant_excedent -= aff.completions_total
        else:
            exc = restant_excedent
            result[aff.id] = {"valides": aff.completions_total - exc, "excedents": exc}
            restant_excedent = 0

    return result
```

#### Application aux quotas/segments

La meme logique s'applique au niveau des segments. Pour un quota "Senegal = 50" :
- Si le total global des completions "Senegal" (tous enqueteurs confondus) depasse 50
- Les completions en surplus sont des excedents, attribues aux derniers arrivants

### 13.2 Calcul du taux de completion

```
taux = (completions_valides / objectif) * 100
```

Si `objectif = 0`, le taux est 0.

### 13.3 Generation d'identifiant enqueteur

```python
import secrets, string

def generate_identifiant(length=6):
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace("0", "").replace("O", "").replace("I", "").replace("L", "")
    return "".join(secrets.choice(chars) for _ in range(length))
```

Genere un code comme `WK47HP`, `B3DNER`, etc. Verifie l'unicite en base avant de sauvegarder.

### 13.4 Generation de token enqueteur

Meme fonction que l'identifiant mais avec un usage different : le token sert pour le tracking QuestionPro (`custom1`).

### 13.5 Statuts des enquetes

| Statut | Description | Actions possibles |
|--------|-------------|-------------------|
| en_cours | Active, sync possible | Sync, editer, affecter |
| termine | Terminee, pas de sync | Voir stats, exporter |
| archive | Archivee | Voir seulement |

### 13.6 Statuts des affectations

| Statut | Description |
|--------|-------------|
| en_cours | Active |
| termine | Objectif atteint ou cloturee |
| suspendu | Temporairement desactivee |

---

## 14. Templates et pages

### 14.1 Layout general

```
base.html
├── <head> : meta, TailwindCSS CDN, favicon, title
├── <body>
│   ├── navbar.html (logo, menu, user dropdown)
│   ├── {% block content %}{% endblock %}
│   └── footer (optionnel)
└── main.js (modals, confirmations, copier liens)
```

### 14.2 Layout admin

```
base_admin.html (extends base.html)
├── sidebar.html
│   ├── Dashboard
│   ├── Enquetes
│   ├── Enqueteurs
│   ├── Statistiques
│   ├── Synchronisation
│   └── Exports
├── content area (avec breadcrumb)
```

### 14.3 Layout enqueteur

```
base_enqueteur.html (extends base.html)
├── navbar avec onglets : Tableau de bord | Mes enquetes | Profil
├── content area
```

### 14.4 Pages detaillees

#### Pages publiques (accounts/)

| Page | Description | Elements |
|------|-------------|----------|
| login.html | Connexion | Formulaire email + password, liens inscription/oublie |
| register.html | Inscription | Formulaire nom, prenom, email, telephone, password |
| activate.html | OTP | Champ code 6 chiffres, timer expiration |
| activate_token.html | Invitation | Formulaire nouveau mot de passe |
| forgot_password.html | Oublie | Champ email |
| reset_password.html | Reset | Champs email + code + nouveau MDP |

#### Pages admin (dashboard/)

| Page | Description |
|------|-------------|
| admin_dashboard.html | KPI globaux + liste enquetes + enqueteurs recents |
| enquete_list.html | Tableau des enquetes (nom, survey_id, cible, completions, taux, statut) |
| enquete_detail.html | KPI + tableau affectations + graphiques segmentations + tableau croise |
| enquete_form.html | Formulaire creation/edition enquete |
| enqueteur_list.html | Tableau des enqueteurs (nom, email, identifiant, actif, role, completions) |
| enqueteur_detail.html | Dashboard enqueteur vu par admin |
| enqueteur_form.html | Formulaire creation/edition enqueteur |
| affectation_form.html | Formulaire creation/edition affectation |
| segmentation_form.html | Formulaire creation segmentation (select question QP) |
| quota_list.html | Quotas d'une enquete (simples + croises) |
| quota_form.html | Formulaire creation quota simple |
| quota_bulk_form.html | Formulaire creation quotas en masse |
| quota_config_form.html | Multi-etapes : selection segmentations, generation combos, saisie % |
| quota_config_detail.html | Tableau croise avec progressions |
| sync_panel.html | Bouton sync + historique des syncs |
| stats.html | Statistiques globales par pays, segments |
| export_panel.html | Boutons export CSV |

#### Pages enqueteur (dashboard/)

| Page | Description |
|------|-------------|
| enqueteur_dashboard.html | KPI personnels + liste enquetes |
| enqueteur_enquete_detail.html | Detail enquete : KPI, lien, graphiques barres |
| enqueteur_profil.html | Infos personnelles, modification, changement MDP |

### 14.5 Composants reutilisables (includes)

| Composant | Usage |
|-----------|-------|
| components/stat_card.html | Carte KPI (titre, valeur, icone, couleur) |
| components/progress_bar.html | Barre de progression (%, couleur) |
| components/bar_chart.html | Graphique barres horizontales CSS |
| components/cross_table.html | Tableau croise quotas |
| components/modal.html | Modal generique (confirmation, formulaire) |
| components/table.html | Tableau avec tri et pagination |
| components/badge.html | Badge statut (en_cours, termine, etc.) |
| components/alert.html | Alerte (succes, erreur, info, warning) |
| components/copy_button.html | Bouton copier dans le presse-papier |
| components/empty_state.html | Etat vide (icone + message) |

### 14.6 Charte graphique

| Element | Valeur |
|---------|--------|
| Couleur primaire | #059669 (vert emeraude) |
| Couleur secondaire | #111827 (gris fonce) |
| Couleur excedent | #F59E0B (orange) |
| Couleur danger | #EF4444 (rouge) |
| Couleur info | #3B82F6 (bleu) |
| Couleur fond | #F9FAFB |
| Couleur texte | #111827 |
| Couleur texte secondaire | #6B7280 |
| Couleur bordures | #E5E7EB |
| Police | -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif |
| Rayon bordures | 8px (cartes), 6px (boutons), 12px (modals) |
| Nom de l'application | Marketym |

---

## 15. Etapes d'implementation

### Phase 0 : Initialisation du projet (1 etape)

**Etape 0.1** : Setup Django
- `django-admin startproject marketym`
- Creer les apps : `accounts`, `enquetes`, `quotas`, `sync`, `tracking`, `dashboard`, `exports`, `notifications`
- Configurer `settings.py` : database (PostgreSQL/Supabase), installed apps, middleware, templates, static files
- Configurer `urls.py` principal
- Variables d'environnement avec `django-environ` ou `python-dotenv`
- `requirements.txt` : Django, psycopg2-binary, bcrypt, sib-api-v3-sdk, httpx, python-dotenv, gunicorn, whitenoise

### Phase 1 : Modeles et base de donnees (1 etape)

**Etape 1.1** : Definir tous les modeles
- `accounts/models.py` : Enqueteur (AbstractUser), OtpCode, InvitationToken
- `enquetes/models.py` : Zone, Pays, Enquete, Affectation, Segmentation
- `quotas/models.py` : Quota, QuotaConfig, QuotaConfigQuestion
- `sync/models.py` : CompletionSegment, CompletionCombination, CompletionPays, HistoriqueCompletion
- `tracking/models.py` : Clic
- `python manage.py makemigrations && python manage.py migrate`

### Phase 2 : Authentification (3 etapes)

**Etape 2.1** : Services de base
- `accounts/services/otp_service.py` : generate_otp, hash_code, verify_code, create_otp, verify_otp
- `accounts/services/email_service.py` : send_email (Brevo), send_otp_email, send_welcome_email

**Etape 2.2** : Vues d'authentification
- LoginView, RegisterView, LogoutView
- ActivateView (OTP premiere connexion)
- ForgotPasswordView, ResetPasswordView
- Decorateurs : @admin_required, @super_admin_required

**Etape 2.3** : Templates auth
- login.html, register.html, activate.html, forgot_password.html, reset_password.html
- base.html (layout minimal pour pages publiques)

### Phase 3 : Layout et templates de base (1 etape)

**Etape 3.1** : Templates globaux
- base.html (TailwindCSS, structure generale)
- base_admin.html (sidebar, breadcrumb)
- base_enqueteur.html (navbar onglets)
- Composants : stat_card.html, progress_bar.html, badge.html, alert.html, modal.html, table.html, empty_state.html
- static/css/main.css, static/js/main.js

### Phase 4 : Gestion des enquetes (3 etapes)

**Etape 4.1** : CRUD enquetes
- EnqueteListView, EnqueteCreateView, EnqueteDetailView, EnqueteUpdateView, EnqueteDeleteView
- Templates : enquete_list.html, enquete_form.html, enquete_detail.html
- Integration QuestionPro pour creation (fetch survey info)

**Etape 4.2** : CRUD enqueteurs (admin)
- EnqueteurListView, EnqueteurCreateView, EnqueteurDetailView, EnqueteurUpdateView, EnqueteurDeleteView
- Envoi invitation email a la creation
- Templates : enqueteur_list.html, enqueteur_form.html

**Etape 4.3** : CRUD affectations
- AffectationCreateView, AffectationUpdateView, AffectationDeleteView
- Generation automatique des liens (tracking + direct)
- Templates : affectation_form.html
- Affichage dans enquete_detail.html

### Phase 5 : Segmentations et quotas (3 etapes)

**Etape 5.1** : Segmentations
- SegmentationCreateView (fetch questions QP, cache answer_options)
- SegmentationUpdateView, SegmentationDeleteView
- Templates : segmentation_form.html

**Etape 5.2** : Quotas simples
- QuotaCreateView, QuotaBulkCreateView, QuotaUpdateView, QuotaDeleteView
- Templates : quota_form.html, quota_bulk_form.html, quota_list.html

**Etape 5.3** : Quotas croises
- QuotaConfigCreateView (multi-etapes avec formulaires)
- Generation combinaisons (produit cartesien)
- QuotaConfigDetailView, QuotaConfigDeleteView
- Templates : quota_config_form.html, quota_config_detail.html
- Composant : cross_table.html

### Phase 6 : Synchronisation QuestionPro (2 etapes)

**Etape 6.1** : Client QuestionPro
- `sync/services/questionpro.py` : QuestionProClient (get_survey, get_questions, get_responses, get_all_responses)
- Gestion pagination, rate limiting, erreurs

**Etape 6.2** : Moteur de sync
- `sync/services/sync_engine.py` : sync_affectation, sync_enquete, sync_all
- Remplissage : completions_total, completions_segments, completions_combinations, completions_pays, historique_completions
- Vues : SyncAllView, SyncAffectationView
- Templates : sync_panel.html

### Phase 7 : Tracking des clics (1 etape)

**Etape 7.1** : Tracking
- TrackClickView : GET /r/{affectation_id} → track IP + redirect
- Deduplication par UNIQUE(affectation, ip_address)
- ClicListView (admin)

### Phase 8 : Dashboards (3 etapes)

**Etape 8.1** : Dashboard admin
- AdminDashboardView : KPI globaux, enquetes en cours, enqueteurs recents
- Template : admin_dashboard.html
- Composants graphiques barres CSS : bar_chart.html

**Etape 8.2** : Detail enquete admin
- Vue enrichie avec graphiques par segmentation
- Tableau croise pour quota_configs
- Logique excedents (global → individuel)
- Template : enquete_detail.html (enrichi)

**Etape 8.3** : Dashboard enqueteur
- EnqueteurDashboardView : KPI personnels, liste enquetes
- EnqueteurEnqueteDetailView : detail avec graphiques barres
- ProfilView : infos + modification + changement MDP
- Templates : enqueteur_dashboard.html, enqueteur_enquete_detail.html, enqueteur_profil.html

**Etape 8.4** : Vue enqueteur dans admin
- EnqueteurDetailView (admin) : reutilise les memes donnees que le dashboard enqueteur mais dans le layout admin
- Template : enqueteur_detail.html

### Phase 9 : Exports (1 etape)

**Etape 9.1** : Exports CSV
- ExportEnqueteursView, ExportAffectationsView, ExportQuotasView
- Generation CSV avec `csv.writer` + `HttpResponse(content_type='text/csv')`
- Boutons dans les pages admin

### Phase 10 : Statistiques avancees (1 etape)

**Etape 10.1** : Pages stats
- Stats par pays, par segment, globales
- Templates avec graphiques barres CSS
- StatsView dans dashboard/

### Phase 11 : Notifications (1 etape)

**Etape 11.1** : Notifications de base
- Bouton "Envoyer rappel" par enqueteur
- Alerte quota atteint (affichee dans l'admin)
- Templates email rappel

### Phase 12 : Deploiement (1 etape)

**Etape 12.1** : Configuration deploiement
- `Procfile` : `web: gunicorn marketym.wsgi --bind 0.0.0.0:$PORT`
- `runtime.txt` : python-3.12.x
- `whitenoise` pour fichiers statiques
- Variables d'environnement Railway/Render
- `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`
- `collectstatic` dans le build

### Phase 13 : Migration des donnees (1 etape)

**Etape 13.1** : Script de migration
- Script Python pour migrer les donnees existantes de Supabase vers les nouveaux modeles Django
- Verifier la correspondance des UUIDs
- Migrer : enqueteurs, enquetes, affectations, segmentations, quotas, completions, clics, historique

---

## Annexes

### A. Comptes de test

- **Super Admin** : wilfredkouadjo006@gmail.com
- **Email expediteur** : marketym@hcexecutive.net

### B. URLs externes

- **QuestionPro API** : https://api.questionpro.com/a/api/v2
- **Brevo API** : via SDK `sib_api_v3_sdk`
- **Supabase** : URL dans variable d'environnement

### C. Contraintes de performance

- Sync : max 1000 reponses par page QP
- Sync uniquement enquetes `en_cours`
- Cache answer_options en base (evite re-fetch)
- 5000 appels QP/mois maximum
- 300 appels/60s rate limit

### D. Securite

- HTTPS obligatoire en production
- CSRF protection sur tous les POST
- Sessions securisees (HttpOnly, SameSite=Lax)
- Mots de passe hashes bcrypt
- OTP a usage unique, expire en 5 min, max 3 tentatives
- Tokens d'invitation expire en 48h
- Pas de secrets en dur dans le code (tout en variables d'environnement)
- Validation de toutes les entrees utilisateur via Django Forms
- Protection XSS via auto-escaping Django templates

### E. Dependencies Python

```
Django>=5.0
psycopg2-binary
bcrypt
sib-api-v3-sdk
httpx
python-dotenv
gunicorn
whitenoise
django-environ
```
