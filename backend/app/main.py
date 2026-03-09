from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import unicodedata
from datetime import datetime
from supabase import create_client, Client

# Configuration centralisee
from .config import settings

# Module d'authentification
from .auth import auth_router, require_admin, require_super_admin

app = FastAPI(title="Suivi Enqueteurs API v5")

# CORS securise - seulement les origines autorisees
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Inclure le router d'authentification
app.include_router(auth_router)

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
QUESTIONPRO_BASE_URL = settings.QUESTIONPRO_BASE_URL

# Singleton Supabase - une seule connexion reutilisee
_supabase_client: Client = None

def get_supabase() -> Client:
    """Retourne une connexion Supabase singleton (evite de recreer a chaque requete)"""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase_client

# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS PYDANTIC
# ══════════════════════════════════════════════════════════════════════════════

class LoginEnqueteur(BaseModel):
    identifiant: str
    mot_de_passe: str

class LoginAdmin(BaseModel):
    mot_de_passe: str

class UpdateAffectation(BaseModel):
    objectif_total: Optional[int] = None
    statut: Optional[str] = None
    commentaire_admin: Optional[str] = None

class CreateEnqueteur(BaseModel):
    identifiant: str
    nom: str
    prenom: str
    email: Optional[str] = None
    telephone: Optional[str] = None
    reseau_mobile: Optional[str] = None
    mode_remuneration: Optional[str] = None
    mot_de_passe: str = "1234"
    is_admin: bool = False

class UpdateEnqueteur(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    reseau_mobile: Optional[str] = None
    mode_remuneration: Optional[str] = None
    mot_de_passe: Optional[str] = None
    actif: Optional[bool] = None
    is_admin: Optional[bool] = None

class CreateEnquete(BaseModel):
    survey_id: str              # ID QuestionPro (obligatoire)
    description: str = ""       # Description (optionnel)
    cible: str                  # Public cible (obligatoire)
    taille_echantillon: int = 0 # Taille de l'echantillon

class UpdateEnquete(BaseModel):
    survey_id: Optional[str] = None
    code: Optional[str] = None
    nom: Optional[str] = None
    description: Optional[str] = None
    cible: Optional[str] = None
    statut: Optional[str] = None
    taille_echantillon: Optional[int] = None

class CreateAffectation(BaseModel):
    enquete_id: str
    enqueteur_id: str
    objectif_total: int = 200

# ══════════════════════════════════════════════════════════════════════════════
# SEGMENTATIONS (plusieurs par enquete)
# ══════════════════════════════════════════════════════════════════════════════

class CreateSegmentation(BaseModel):
    enquete_id: str
    question_id: str              # ID de la question QuestionPro
    question_text: Optional[str] = None
    nom: str                      # Ex: "Pays", "Secteur", "Tranche d'age"

class UpdateSegmentation(BaseModel):
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    nom: Optional[str] = None

# ══════════════════════════════════════════════════════════════════════════════
# QUOTAS (lies a une segmentation)
# ══════════════════════════════════════════════════════════════════════════════

class CreateQuota(BaseModel):
    segmentation_id: str
    affectation_id: Optional[str] = None  # Si None = quota global pour l'enquete
    segment_value: str                     # Ex: "Cote d'Ivoire", "Tech"
    objectif: int

class UpdateQuota(BaseModel):
    objectif: Optional[int] = None
    completions: Optional[int] = None

class BulkQuotas(BaseModel):
    segmentation_id: str
    affectation_id: Optional[str] = None
    quotas: List[Dict[str, Any]]  # [{segment_value: str, objectif: int}]

# ══════════════════════════════════════════════════════════════════════════════
# NORMALISATION DES PAYS
# ══════════════════════════════════════════════════════════════════════════════

def normalize_country_name(name: str) -> str:
    """Normaliser le nom du pays (supprimer accents, apostrophes, espaces)"""
    # Supprimer les accents
    normalized = unicodedata.normalize('NFD', name)
    normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    # Nettoyer apostrophes et espaces multiples
    normalized = normalized.replace("'", " ").replace("d ", "d").strip().lower()
    # Supprimer espaces multiples
    normalized = ' '.join(normalized.split())
    return normalized

# Mapping QuestionPro -> Base de donnees (normalise)
PAYS_MAPPING = {
    "benin": "benin",
    "senegal": "senegal",
    "cote divoire": "cote divoire",
    "cotedivoire": "cote divoire",
    "mali": "mali",
    "burkina faso": "burkina faso",
    "niger": "niger",
    "togo": "togo",
    "guinee-bissau": "guinee-bissau",
    "guinee bissau": "guinee-bissau",
    "cameroun": "cameroun",
    "gabon": "gabon",
    "congo": "congo",
    "congo-brazzaville": "congo",  # Alias
    "congo brazzaville": "congo",  # Alias
    "tchad": "tchad",
    "rca": "rca",
    "centrafrique": "rca",
    "guinee equatoriale": "guinee equatoriale",
    "mauritanie": "mauritanie",
}

def match_country_to_db(country_name: str, db_pays_map: dict) -> str:
    """Trouver le pays_id correspondant dans la base de donnees"""
    normalized = normalize_country_name(country_name)

    # 1. Chercher dans le mapping explicite
    if normalized in PAYS_MAPPING:
        db_name = PAYS_MAPPING[normalized]
        if db_name in db_pays_map:
            return db_pays_map[db_name]

    # 2. Chercher par correspondance normalisee dans la DB
    for db_nom, db_id in db_pays_map.items():
        db_normalized = normalize_country_name(db_nom)
        if normalized == db_normalized:
            return db_id
        # Correspondance partielle
        if normalized in db_normalized or db_normalized in normalized:
            return db_id

    return None

# ══════════════════════════════════════════════════════════════════════════════
# FONCTIONS QUESTIONPRO
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_survey_stats(survey_id: str) -> dict:
    """Recuperer les stats d'un survey QuestionPro"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}",
            headers={"api-key": settings.QUESTIONPRO_API_KEY}
        )
        if response.status_code != 200:
            return None
        data = response.json()
        survey = data.get("response", {})
        return {
            "completions": survey.get("completedResponses", 0),
            "clics": survey.get("viewedResponses", 0),
            "started": survey.get("startedResponses", 0),
            "name": survey.get("name", ""),
            "description": survey.get("description", ""),
        }

async def fetch_survey_questions(survey_id: str) -> list:
    """Recuperer les questions d'un survey QuestionPro"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}/questions",
            headers={"api-key": settings.QUESTIONPRO_API_KEY}
        )
        if response.status_code != 200:
            return []
        data = response.json()
        questions = data.get("response", [])

        # Filtrer les questions avec des choix (utiles pour segmentation)
        result = []
        for q in questions:
            question_info = {
                "id": str(q.get("questionID", q.get("id", ""))),
                "code": q.get("code", ""),
                "text": q.get("text", ""),
                "type": q.get("type", ""),
                "answers": []
            }

            # Extraire les reponses possibles (API utilise "answers" pas "answerChoices")
            answers = q.get("answers", q.get("answerChoices", []))
            for ac in answers:
                question_info["answers"].append({
                    "id": str(ac.get("answerID", ac.get("id", ""))),
                    "text": ac.get("text", "")
                })

            # Ne garder que les questions avec des choix de reponse
            if question_info["answers"]:
                result.append(question_info)

        return result

async def fetch_survey_responses(survey_id: str, page: int = 1, per_page: int = 100) -> list:
    """Recuperer les reponses d'un survey QuestionPro"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}/responses",
            params={"page": page, "perPage": per_page},
            headers={"api-key": settings.QUESTIONPRO_API_KEY}
        )
        if response.status_code != 200:
            return []
        data = response.json()
        return data.get("response", [])

def extract_country_from_response(response: dict) -> str:
    """Extraire le pays d'une reponse QuestionPro"""
    for question in response.get("responseSet", []):
        question_text = question.get("questionText", "").lower()
        if "pays" in question_text:
            answers = question.get("answerValues", [])
            if answers:
                return answers[0].get("answerText", "Autre")
    return "Autre"

def extract_segment_value_from_response(response: dict, question_id: str) -> str:
    """Extraire la valeur d'un segment d'une reponse QuestionPro"""
    for question in response.get("responseSet", []):
        if str(question.get("questionID", "")) == str(question_id):
            answers = question.get("answerValues", [])
            if answers:
                return answers[0].get("answerText", "Autre")
    return "Autre"

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ENQUETEUR
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/enqueteur/login")
def login_enqueteur(data: LoginEnqueteur, sb: Client = Depends(get_supabase)):
    """Connexion enqueteur"""
    res = sb.table("enqueteurs").select("*").eq("identifiant", data.identifiant).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")
    enq = res.data[0]
    if enq["mot_de_passe"] != data.mot_de_passe:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    if not enq.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte desactive")

    # Mettre a jour la derniere connexion
    try:
        sb.table("enqueteurs").update({
            "derniere_connexion": datetime.utcnow().isoformat()
        }).eq("id", enq["id"]).execute()
    except Exception as e:
        print(f"Erreur mise a jour derniere_connexion: {e}")

    # Recuperer ses affectations
    affectations = sb.table("affectations")\
        .select("*, enquetes(*)")\
        .eq("enqueteur_id", enq["id"])\
        .execute()

    return {
        "id": enq["id"],
        "identifiant": enq["identifiant"],
        "nom": enq["nom"],
        "prenom": enq["prenom"],
        "telephone": enq["telephone"],
        "is_admin": enq.get("is_admin", False),
        "affectations": affectations.data
    }

@app.get("/enqueteur/{id}")
def get_enqueteur(id: str, sb: Client = Depends(get_supabase)):
    """Recuperer un enqueteur avec ses affectations et completions (optimise)"""
    res = sb.table("enqueteurs").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")
    enq = res.data[0]

    # Charger les affectations avec enquetes en une seule requete
    affectations = sb.table("affectations")\
        .select("*, enquetes(*)")\
        .eq("enqueteur_id", enq["id"])\
        .execute()

    if not affectations.data:
        return {**enq, "affectations": []}

    # Collecter tous les IDs d'affectations et enquetes pour requetes batch
    aff_ids = [aff["id"] for aff in affectations.data]
    enquete_ids = [aff["enquete_id"] for aff in affectations.data if aff.get("enquete_id")]

    # Charger toutes les donnees en batch (3 requetes au lieu de N*3)
    all_completions_pays = sb.table("completions_pays")\
        .select("*, pays(*)")\
        .in_("affectation_id", aff_ids)\
        .execute()

    # Charger les quotas via les segmentations (lies a enquete_id)
    all_quotas = []
    try:
        if enquete_ids:
            # D'abord recuperer les segmentations des enquetes
            segmentations = sb.table("segmentations")\
                .select("id, enquete_id")\
                .in_("enquete_id", enquete_ids)\
                .execute()
            seg_ids = [s["id"] for s in segmentations.data]

            # Mapper segmentation_id -> enquete_id
            seg_to_enquete = {s["id"]: s["enquete_id"] for s in segmentations.data}

            if seg_ids:
                quotas_res = sb.table("quotas")\
                    .select("*")\
                    .in_("segmentation_id", seg_ids)\
                    .execute()
                # Ajouter enquete_id a chaque quota
                for q in quotas_res.data:
                    q["enquete_id"] = seg_to_enquete.get(q.get("segmentation_id"))
                all_quotas = quotas_res.data
    except:
        pass

    all_completions_segments = []
    try:
        segments_res = sb.table("completions_segments")\
            .select("*")\
            .in_("affectation_id", aff_ids)\
            .execute()
        all_completions_segments = segments_res.data
    except:
        pass

    # Indexer par affectation_id pour acces O(1)
    completions_pays_map = {}
    for cp in all_completions_pays.data:
        aid = cp["affectation_id"]
        if aid not in completions_pays_map:
            completions_pays_map[aid] = []
        completions_pays_map[aid].append(cp)

    # Mapper quotas par enquete_id (car quotas sont lies aux segmentations, pas aux affectations)
    quotas_map = {}
    for q in all_quotas:
        eid = q.get("enquete_id")
        if eid and eid not in quotas_map:
            quotas_map[eid] = []
        if eid:
            quotas_map[eid].append(q)

    segments_map = {}
    for s in all_completions_segments:
        aid = s["affectation_id"]
        if aid not in segments_map:
            segments_map[aid] = []
        segments_map[aid].append(s)

    # Assembler les resultats
    for aff in affectations.data:
        aff_id = aff["id"]
        enquete_id = aff.get("enquete_id")
        aff["completions_pays"] = completions_pays_map.get(aff_id, [])
        aff["quotas"] = quotas_map.get(enquete_id, [])
        aff["completions_segments"] = segments_map.get(aff_id, [])

        # Calculer les completions valides pour cet enqueteur
        # Les completions valides = min(completions_enqueteur, part proportionnelle du quota)
        enqueteur_segments = segments_map.get(aff_id, [])
        enquete_quotas = quotas_map.get(enquete_id, [])

        # Creer un mapping segment_value normalise -> quota info
        quota_info = {}
        for q in enquete_quotas:
            seg_val = q.get("segment_value", "")
            if seg_val:
                # Normaliser le nom du segment pour la comparaison
                seg_val_norm = normalize_country_name(seg_val)
                quota_info[seg_val_norm] = {
                    "objectif": q.get("objectif", 0) or 0,
                    "completions_globales": q.get("completions", 0) or 0
                }

        # Calculer completions valides par segment (quotas INDIVIDUELS)
        # Chaque enqueteur a les memes quotas par segment
        # Valides = min(completions_enqueteur, quota_individuel)
        completions_valides = 0
        completions_total = aff.get("completions_total", 0) or 0

        # Agreger les completions par segment normalise (car peut y avoir Senegal + Sénégal)
        segments_agreg = {}
        for seg in enqueteur_segments:
            seg_val = seg.get("segment_value", "")
            seg_comp = seg.get("completions", 0) or 0
            seg_val_norm = normalize_country_name(seg_val)
            seg_val_norm = PAYS_MAPPING.get(seg_val_norm, seg_val_norm)
            segments_agreg[seg_val_norm] = segments_agreg.get(seg_val_norm, 0) + seg_comp

        # Calculer le ratio si les segments depassent completions_total (doublons dans DB)
        sum_segments = sum(segments_agreg.values())
        ratio = completions_total / sum_segments if sum_segments > completions_total else 1.0

        for seg_val_norm, seg_comp in segments_agreg.items():
            # Ajuster seg_comp si ratio < 1 (correction doublons)
            seg_comp_adjusted = int(seg_comp * ratio) if ratio < 1 else seg_comp
            if seg_val_norm in quota_info:
                objectif = quota_info[seg_val_norm]["objectif"]
                # Quota individuel: valides = min(completions, objectif)
                completions_valides += min(seg_comp_adjusted, objectif)
            # Segment non trouve = invalide (non classifie), on n'ajoute rien

        # S'assurer que valides <= completions_total
        aff["completions_valides"] = min(completions_valides, completions_total)

        # Generer le lien questionnaire dynamiquement
        enquete = aff.get("enquetes", {})
        survey_id = enquete.get("survey_id") if enquete else None
        if survey_id and enq.get("token"):
            aff["lien_questionnaire"] = f"https://hcakpo.questionpro.com/t/{survey_id}?custom1={enq['token']}"
        else:
            aff["lien_questionnaire"] = None

    return {**enq, "affectations": affectations.data}

@app.get("/enqueteur/{id}/affectation/{affectation_id}/pays")
def get_completions_pays(id: str, affectation_id: str, sb: Client = Depends(get_supabase)):
    """Recuperer les completions par pays pour une affectation"""
    res = sb.table("completions_pays")\
        .select("*, pays(*)")\
        .eq("affectation_id", affectation_id)\
        .execute()
    return res.data

@app.post("/enqueteur/{id}/sync")
async def sync_enqueteur(id: str, sb: Client = Depends(get_supabase)):
    """Synchroniser toutes les affectations d'un enqueteur"""
    # Verifier que l'enqueteur existe
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    # Recuperer ses affectations
    affectations = sb.table("affectations")\
        .select("id, survey_id")\
        .eq("enqueteur_id", id)\
        .execute()

    results = []
    for aff in affectations.data:
        result = await sync_affectation(aff["id"], aff["survey_id"], sb)
        results.append(result)

    return {"synced": len(results), "results": results}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - AUTH
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/login")
def login_admin(data: LoginAdmin, sb: Client = Depends(get_supabase)):
    res = sb.table("admin").select("*").execute()
    if not res.data or res.data[0]["mot_de_passe"] != data.mot_de_passe:
        raise HTTPException(status_code=401, detail="Mot de passe admin incorrect")
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/dashboard")
def get_dashboard(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Stats globales avec completions valides/invalides"""
    enquetes = sb.table("enquetes").select("id, code, nom, statut, taille_echantillon").execute()
    enqueteurs = sb.table("enqueteurs").select("*").execute()
    affectations = sb.table("affectations").select("objectif_total, completions_total, clics, statut").execute()

    # Objectif global = somme des tailles d'echantillon de toutes les enquetes
    total_objectif = sum(e.get("taille_echantillon", 0) for e in enquetes.data)
    total_completions = sum(a["completions_total"] for a in affectations.data)
    total_clics = sum(a["clics"] for a in affectations.data)

    # Calculer valides avec QUOTAS INDIVIDUELS
    # Chaque enqueteur a les memes quotas par segment
    # Total valides = somme des min(completions_enqueteur, quota) pour chaque enqueteur

    # Charger les quotas par enquete
    all_quotas = sb.table("quotas").select("segmentation_id, segment_value, objectif").is_("affectation_id", "null").execute()
    all_segmentations = sb.table("segmentations").select("id, enquete_id").execute()
    seg_to_enquete = {s["id"]: s["enquete_id"] for s in all_segmentations.data}

    # Construire quotas par enquete (normalises)
    enquete_quotas = {}
    for q in all_quotas.data:
        enquete_id = seg_to_enquete.get(q.get("segmentation_id"))
        if enquete_id:
            if enquete_id not in enquete_quotas:
                enquete_quotas[enquete_id] = {}
            seg_norm = normalize_country_name(q.get("segment_value", ""))
            seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
            enquete_quotas[enquete_id][seg_norm] = q.get("objectif", 0) or 0

    # Charger completions_segments pour toutes les affectations
    aff_ids = [a["id"] for a in affectations.data]
    all_segments = sb.table("completions_segments").select("affectation_id, segment_value, completions").in_("affectation_id", aff_ids).execute() if aff_ids else type('obj', (object,), {'data': []})()

    # Indexer par affectation
    aff_segments = {}
    for s in all_segments.data:
        aid = s["affectation_id"]
        if aid not in aff_segments:
            aff_segments[aid] = []
        aff_segments[aid].append(s)

    # Calculer total_valides = somme des valides de chaque affectation
    total_valides = 0
    for aff in affectations.data:
        enquete_id = aff.get("enquete_id")
        quotas = enquete_quotas.get(enquete_id, {})
        segments = aff_segments.get(aff["id"], [])

        # Agreger par segment normalise
        segments_agreg = {}
        for seg in segments:
            seg_val = seg.get("segment_value", "")
            seg_comp = seg.get("completions", 0) or 0
            seg_norm = normalize_country_name(seg_val)
            seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
            segments_agreg[seg_norm] = segments_agreg.get(seg_norm, 0) + seg_comp

        for seg_norm, seg_comp in segments_agreg.items():
            if seg_norm in quotas:
                total_valides += min(seg_comp, quotas[seg_norm])

    # Invalides = tout ce qui n'est pas valide
    total_invalides = total_completions - total_valides

    # Compter enqueteurs sans ADMIN (retro-compatible si is_admin n'existe pas)
    nb_enqueteurs = len([e for e in enqueteurs.data if not e.get("is_admin", False)])
    nb_enqueteurs_actifs = len([e for e in enqueteurs.data if e.get("actif", True) and not e.get("is_admin", False)])

    # Stats par statut
    nb_en_cours = len([e for e in enquetes.data if e["statut"] == "en_cours"])
    nb_terminees = len([e for e in enquetes.data if e["statut"] == "termine"])
    nb_archivees = len([e for e in enquetes.data if e["statut"] == "archive"])

    return {
        "nb_enquetes": len(enquetes.data),
        "nb_enquetes_en_cours": nb_en_cours,
        "nb_enquetes_terminees": nb_terminees,
        "nb_enquetes_archivees": nb_archivees,
        "nb_enqueteurs": nb_enqueteurs,
        "nb_enqueteurs_actifs": nb_enqueteurs_actifs,
        "nb_affectations": len(affectations.data),
        "total_objectif": total_objectif,
        "total_clics": total_clics,
        "total_completions": total_completions,
        "total_valides": total_valides,
        "total_invalides": total_invalides,
        "taux_completion": round((total_valides / total_objectif * 100), 1) if total_objectif > 0 else 0
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enquetes")
def list_enquetes(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Liste des enquetes avec stats et completions valides"""
    enquetes = sb.table("enquetes").select("*").order("code").execute()

    # Charger tous les quotas et segmentations
    all_quotas = sb.table("quotas").select("segmentation_id, segment_value, objectif").is_("affectation_id", "null").execute()
    all_segmentations = sb.table("segmentations").select("id, enquete_id").execute()
    seg_to_enquete = {s["id"]: s["enquete_id"] for s in all_segmentations.data}

    # Construire quotas par enquete (normalises)
    enquete_quotas = {}
    for q in all_quotas.data:
        enquete_id = seg_to_enquete.get(q.get("segmentation_id"))
        if enquete_id:
            if enquete_id not in enquete_quotas:
                enquete_quotas[enquete_id] = {}
            seg_norm = normalize_country_name(q.get("segment_value", ""))
            seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
            enquete_quotas[enquete_id][seg_norm] = q.get("objectif", 0) or 0

    # Charger toutes les affectations
    all_affectations = sb.table("affectations").select("id, enquete_id, objectif_total, completions_total, clics").execute()

    # Charger tous les completions_segments
    aff_ids = [a["id"] for a in all_affectations.data]
    all_segments = sb.table("completions_segments").select("affectation_id, segment_value, completions").in_("affectation_id", aff_ids).execute() if aff_ids else type('obj', (object,), {'data': []})()

    # Indexer segments par affectation
    aff_segments = {}
    for s in all_segments.data:
        aid = s["affectation_id"]
        if aid not in aff_segments:
            aff_segments[aid] = []
        aff_segments[aid].append(s)

    # Indexer affectations par enquete
    enquete_affectations = {}
    for aff in all_affectations.data:
        eid = aff["enquete_id"]
        if eid not in enquete_affectations:
            enquete_affectations[eid] = []
        enquete_affectations[eid].append(aff)

    result = []
    for enq in enquetes.data:
        affectations = enquete_affectations.get(enq["id"], [])
        quotas = enquete_quotas.get(enq["id"], {})

        taille_echantillon = enq.get("taille_echantillon", 0)
        total_objectif_affectations = sum(a["objectif_total"] or 0 for a in affectations)
        total_completions = sum(a["completions_total"] or 0 for a in affectations)
        total_clics = sum(a["clics"] or 0 for a in affectations)

        # Calculer total_valides = somme des valides de chaque affectation (quotas individuels)
        total_valides = 0
        for aff in affectations:
            segments = aff_segments.get(aff["id"], [])
            # Agreger par segment normalise
            segments_agreg = {}
            for seg in segments:
                seg_val = seg.get("segment_value", "")
                seg_comp = seg.get("completions", 0) or 0
                seg_norm = normalize_country_name(seg_val)
                seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
                segments_agreg[seg_norm] = segments_agreg.get(seg_norm, 0) + seg_comp

            for seg_norm, seg_comp in segments_agreg.items():
                if seg_norm in quotas:
                    total_valides += min(seg_comp, quotas[seg_norm])

        result.append({
            **enq,
            "nb_enqueteurs": len(affectations),
            "total_objectif": taille_echantillon if taille_echantillon > 0 else total_objectif_affectations,
            "total_objectif_affectations": total_objectif_affectations,
            "total_clics": total_clics,
            "total_completions": total_completions,
            "total_valides": total_valides
        })

    return result

@app.get("/admin/enquetes/{id}")
def get_enquete(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Detail d'une enquete avec completions_valides par affectation"""
    res = sb.table("enquetes").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enquete introuvable")

    affectations = sb.table("affectations")\
        .select("*, enqueteurs(*)")\
        .eq("enquete_id", id)\
        .execute()

    # Recuperer les segmentations et quotas de cette enquete
    segmentations = sb.table("segmentations").select("id").eq("enquete_id", id).execute()
    seg_ids = [s["id"] for s in segmentations.data]

    # Construire le mapping des quotas normalises
    quota_info = {}
    if seg_ids:
        quotas_raw = sb.table("quotas")\
            .select("segment_value, objectif, completions")\
            .in_("segmentation_id", seg_ids)\
            .is_("affectation_id", "null")\
            .execute()
        for q in quotas_raw.data:
            seg_norm = normalize_country_name(q.get("segment_value", ""))
            seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
            quota_info[seg_norm] = {
                "objectif": q.get("objectif", 0) or 0,
                "completions_globales": q.get("completions", 0) or 0
            }

    # Recuperer les completions_segments pour toutes les affectations
    aff_ids = [a["id"] for a in affectations.data]
    all_segments = {}
    if aff_ids:
        segments_data = sb.table("completions_segments")\
            .select("affectation_id, segment_value, completions")\
            .in_("affectation_id", aff_ids)\
            .execute()
        for s in segments_data.data:
            aid = s["affectation_id"]
            if aid not in all_segments:
                all_segments[aid] = []
            all_segments[aid].append(s)

    # Calculer completions_valides pour chaque affectation (quotas INDIVIDUELS)
    for aff in affectations.data:
        aff_segments = all_segments.get(aff["id"], [])
        completions_valides = 0

        # Agreger les completions par segment normalise
        segments_agreg = {}
        for seg in aff_segments:
            seg_val = seg.get("segment_value", "")
            seg_comp = seg.get("completions", 0) or 0
            seg_norm = normalize_country_name(seg_val)
            seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
            segments_agreg[seg_norm] = segments_agreg.get(seg_norm, 0) + seg_comp

        for seg_norm, seg_comp in segments_agreg.items():
            if seg_norm in quota_info:
                objectif = quota_info[seg_norm]["objectif"]
                # Quota individuel: valides = min(completions, objectif)
                completions_valides += min(seg_comp, objectif)

        aff["completions_valides"] = completions_valides

    # Recuperer les quotas globaux pour l'affichage
    quotas_data = []
    if seg_ids:
        quotas_result = sb.table("quotas")\
            .select("*")\
            .in_("segmentation_id", seg_ids)\
            .is_("affectation_id", "null")\
            .execute()
        quotas_data = quotas_result.data

    return {**res.data[0], "affectations": affectations.data, "quotas": quotas_data}

@app.post("/admin/enquetes")
async def create_enquete(data: CreateEnquete, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """
    Creer une nouvelle enquete

    1. Verifier que le survey_id n'existe pas deja
    2. Recuperer les infos du survey depuis QuestionPro
    3. Recuperer les questions (pour les quotas)
    4. Sauvegarder l'enquete
    """
    # Verifier si l'enquete existe deja
    existing = sb.table("enquetes").select("id").eq("survey_id", data.survey_id).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Cette enquete existe deja")

    # Recuperer les infos du survey depuis QuestionPro
    survey_info = await fetch_survey_stats(data.survey_id)
    if not survey_info:
        raise HTTPException(status_code=404, detail="Survey QuestionPro introuvable")

    # Recuperer les questions (pour les quotas futurs)
    questions = await fetch_survey_questions(data.survey_id)

    # Preparer les donnees a inserer
    enquete_data = {
        "survey_id": data.survey_id,
        "code": data.survey_id,  # Utiliser survey_id comme code
        "nom": survey_info.get("name", f"Survey {data.survey_id}"),
        "description": data.description or survey_info.get("description", ""),
        "cible": data.cible,
        "taille_echantillon": data.taille_echantillon,
        "statut": "en_cours",
    }

    res = sb.table("enquetes").insert(enquete_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation enquete")

    # Retourner l'enquete avec les questions disponibles
    return {
        **res.data[0],
        "questions": questions,
        "survey_info": survey_info
    }

@app.put("/admin/enquetes/{id}")
def update_enquete(id: str, data: UpdateEnquete, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Modifier une enquete"""
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("enquetes").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/enquetes/{id}")
def delete_enquete(id: str, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    """Supprimer une enquete (super admin uniquement)"""
    sb.table("enquetes").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETEURS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enqueteurs")
def list_enqueteurs(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Liste de tous les utilisateurs avec stats (optimise)"""
    # Requete 1: Recuperer tous les enqueteurs
    enqueteurs = sb.table("enqueteurs")\
        .select("*")\
        .order("identifiant")\
        .execute()

    if not enqueteurs.data:
        return []

    # Requete 2: Charger TOUTES les affectations avec enquete_id
    all_affectations = sb.table("affectations")\
        .select("id, enqueteur_id, enquete_id, objectif_total, completions_total, clics, enquetes(code, nom)")\
        .execute()

    # Requete 3: Charger tous les quotas (pour calcul des valides)
    all_quotas = sb.table("quotas")\
        .select("segmentation_id, segment_value, objectif, completions")\
        .execute()

    # Requete 4: Charger toutes les segmentations (pour mapper aux enquetes)
    all_segmentations = sb.table("segmentations")\
        .select("id, enquete_id")\
        .execute()

    # Requete 5: Charger tous les completions_segments
    all_segments = sb.table("completions_segments")\
        .select("affectation_id, segment_value, completions")\
        .execute()

    # Creer mapping segmentation_id -> enquete_id
    seg_to_enquete = {s["id"]: s["enquete_id"] for s in all_segmentations.data}

    # Creer mapping enquete_id -> quotas (normalises)
    enquete_quotas = {}
    for q in all_quotas.data:
        enquete_id = seg_to_enquete.get(q.get("segmentation_id"))
        if enquete_id:
            if enquete_id not in enquete_quotas:
                enquete_quotas[enquete_id] = {}
            seg_norm = normalize_country_name(q.get("segment_value", ""))
            seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
            enquete_quotas[enquete_id][seg_norm] = {
                "objectif": q.get("objectif", 0) or 0,
                "completions_globales": q.get("completions", 0) or 0
            }

    # Creer mapping affectation_id -> completions_segments
    aff_segments = {}
    for s in all_segments.data:
        aid = s["affectation_id"]
        if aid not in aff_segments:
            aff_segments[aid] = []
        aff_segments[aid].append(s)

    # Indexer les affectations par enqueteur_id
    affectations_map = {}
    for aff in all_affectations.data:
        eid = aff["enqueteur_id"]
        if eid not in affectations_map:
            affectations_map[eid] = []
        affectations_map[eid].append(aff)

    # Assembler les resultats
    result = []
    for enq in enqueteurs.data:
        enq_affectations = affectations_map.get(enq["id"], [])

        total_objectif = sum(a["objectif_total"] or 0 for a in enq_affectations)
        total_completions = sum(a["completions_total"] or 0 for a in enq_affectations)
        total_clics = sum(a["clics"] or 0 for a in enq_affectations)

        # Calculer completions valides pour cet enqueteur (quotas INDIVIDUELS)
        total_valides = 0
        for aff in enq_affectations:
            enquete_id = aff.get("enquete_id")
            quotas = enquete_quotas.get(enquete_id, {})
            segments = aff_segments.get(aff["id"], [])

            # Agreger les completions par segment normalise
            segments_agreg = {}
            for seg in segments:
                seg_val = seg.get("segment_value", "")
                seg_comp = seg.get("completions", 0) or 0
                seg_norm = normalize_country_name(seg_val)
                seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
                segments_agreg[seg_norm] = segments_agreg.get(seg_norm, 0) + seg_comp

            for seg_norm, seg_comp in segments_agreg.items():
                if seg_norm in quotas:
                    obj = quotas[seg_norm]["objectif"]
                    # Quota individuel: valides = min(completions, objectif)
                    total_valides += min(seg_comp, obj)

        result.append({
            **enq,
            "nb_enquetes": len(enq_affectations),
            "total_objectif": total_objectif,
            "total_clics": total_clics,
            "total_completions": total_completions,
            "total_completions_valides": total_valides,
            "enquetes": [a["enquetes"] for a in enq_affectations if a.get("enquetes")]
        })

    return result

@app.post("/admin/enqueteurs")
def create_enqueteur(data: CreateEnqueteur, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    res = sb.table("enqueteurs").insert(data.dict()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation enqueteur")
    return res.data[0]

@app.put("/admin/enqueteurs/{id}")
def update_enqueteur(id: str, data: UpdateEnqueteur, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("enqueteurs").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/enqueteurs/{id}")
def delete_enqueteur(id: str, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    """Supprimer un enqueteur (super admin uniquement)"""
    sb.table("enqueteurs").delete().eq("id", id).execute()
    return {"ok": True}


class UpdateRoleRequest(BaseModel):
    role: str  # "enqueteur", "admin", "super_admin"


@app.put("/admin/enqueteurs/{id}/role")
def update_enqueteur_role(id: str, data: UpdateRoleRequest, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    """Modifier le role d'un enqueteur (super admin uniquement)"""
    if data.role not in ["enqueteur", "admin", "super_admin"]:
        raise HTTPException(status_code=400, detail="Role invalide. Valeurs possibles: enqueteur, admin, super_admin")

    # Verifier que l'utilisateur existe
    user = sb.table("enqueteurs").select("id, role").eq("id", id).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    # Mettre a jour le role et is_admin pour compatibilite
    is_admin = data.role in ["admin", "super_admin"]
    res = sb.table("enqueteurs").update({
        "role": data.role,
        "is_admin": is_admin
    }).eq("id", id).execute()

    return {"ok": True, "role": data.role, "user": res.data[0] if res.data else None}


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - AFFECTATIONS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/affectations")
def list_affectations(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Liste de toutes les affectations"""
    res = sb.table("affectations")\
        .select("*, enquetes(*), enqueteurs(*)")\
        .execute()
    return res.data

@app.get("/admin/affectations/by-enquete/{enquete_id}")
def list_affectations_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    res = sb.table("affectations")\
        .select("*, enqueteurs(*)")\
        .eq("enquete_id", enquete_id)\
        .execute()
    return res.data

@app.post("/admin/affectations")
def create_affectation(data: CreateAffectation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Creer une nouvelle affectation"""
    # Verifier que l'enquete existe et recuperer son survey_id
    enquete = sb.table("enquetes").select("id, survey_id").eq("id", data.enquete_id).execute()
    if not enquete.data:
        raise HTTPException(status_code=404, detail="Enquete introuvable")

    survey_id = enquete.data[0].get("survey_id")

    # Recuperer le token de l'enqueteur
    enqueteur = sb.table("enqueteurs").select("id, token").eq("id", data.enqueteur_id).execute()
    if not enqueteur.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    enqueteur_token = enqueteur.data[0].get("token")

    # Verifier qu'il n'y a pas deja une affectation pour cet enqueteur sur cette enquete
    existing = sb.table("affectations")\
        .select("id")\
        .eq("enquete_id", data.enquete_id)\
        .eq("enqueteur_id", data.enqueteur_id)\
        .execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Cet enqueteur est deja affecte a cette enquete")

    # Generer le nouveau lien avec le token de l'enqueteur (si survey_id existe)
    lien_questionnaire = None
    if survey_id and enqueteur_token:
        lien_questionnaire = f"https://hcakpo.questionpro.com/t/{survey_id}?custom1={enqueteur_token}"

    # Creer l'affectation
    affectation_data = {
        "enquete_id": data.enquete_id,
        "enqueteur_id": data.enqueteur_id,
        "survey_id": survey_id,
        "lien_questionnaire": lien_questionnaire,
        "objectif_total": data.objectif_total,
    }

    res = sb.table("affectations").insert(affectation_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation affectation")

    # Initialiser completions_pays pour cette affectation
    aff_id = res.data[0]["id"]
    pays_list = sb.table("pays").select("id, quota").execute()
    for pays in pays_list.data:
        sb.table("completions_pays").insert({
            "affectation_id": aff_id,
            "pays_id": pays["id"],
            "completions": 0,
            "objectif": pays["quota"]
        }).execute()

    return res.data[0]

@app.put("/admin/affectations/{id}")
def update_affectation(id: str, data: UpdateAffectation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("affectations").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/affectations/{id}")
def delete_affectation(id: str, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    """Supprimer une affectation (super admin uniquement)"""
    sb.table("affectations").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - SEGMENTATIONS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/segmentations/by-enquete/{enquete_id}")
def get_segmentations_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Recuperer toutes les segmentations d'une enquete"""
    segs = sb.table("segmentations")\
        .select("*")\
        .eq("enquete_id", enquete_id)\
        .execute()
    return segs.data

@app.post("/admin/segmentations")
def create_segmentation(data: CreateSegmentation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Creer une segmentation pour une enquete"""
    res = sb.table("segmentations").insert(data.dict()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation segmentation")
    return res.data[0]

@app.put("/admin/segmentations/{id}")
def update_segmentation(id: str, data: UpdateSegmentation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Modifier une segmentation"""
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("segmentations").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/segmentations/{id}")
def delete_segmentation(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Supprimer une segmentation (et ses quotas associes)"""
    sb.table("segmentations").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - QUOTAS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/quotas/by-segmentation/{segmentation_id}")
def get_quotas_by_segmentation(segmentation_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Recuperer tous les quotas d'une segmentation"""
    quotas = sb.table("quotas")\
        .select("*, affectations(*, enqueteurs(*))")\
        .eq("segmentation_id", segmentation_id)\
        .execute()
    return quotas.data

@app.get("/admin/quotas/by-enquete/{enquete_id}")
def get_quotas_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Recuperer tous les quotas d'une enquete (via ses segmentations)"""
    # D'abord recuperer les segmentations de l'enquete
    segs = sb.table("segmentations").select("id").eq("enquete_id", enquete_id).execute()
    if not segs.data:
        return []
    seg_ids = [s["id"] for s in segs.data]
    # Puis recuperer les quotas de ces segmentations
    quotas = sb.table("quotas")\
        .select("*, segmentations(*), affectations(*, enqueteurs(*))")\
        .in_("segmentation_id", seg_ids)\
        .execute()
    return quotas.data

@app.get("/admin/quotas/by-affectation/{affectation_id}")
def get_quotas_by_affectation(affectation_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Recuperer les quotas d'une affectation specifique"""
    quotas = sb.table("quotas")\
        .select("*, segmentations(*)")\
        .eq("affectation_id", affectation_id)\
        .execute()
    return quotas.data

@app.post("/admin/quotas")
def create_quota(data: CreateQuota, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Creer un quota"""
    res = sb.table("quotas").insert(data.dict()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation quota")
    return res.data[0]

@app.post("/admin/quotas/bulk")
def create_quotas_bulk(data: BulkQuotas, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Creer plusieurs quotas en une fois pour une segmentation"""
    created = []
    for q in data.quotas:
        quota_data = {
            "segmentation_id": data.segmentation_id,
            "affectation_id": data.affectation_id,
            "segment_value": q.get("segment_value"),
            "objectif": q.get("objectif", 0)
        }
        res = sb.table("quotas").insert(quota_data).execute()
        if res.data:
            created.append(res.data[0])
    return {"created": len(created), "quotas": created}

@app.put("/admin/quotas/{id}")
def update_quota(id: str, data: UpdateQuota, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Modifier un quota"""
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("quotas").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/quotas/{id}")
def delete_quota(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Supprimer un quota"""
    sb.table("quotas").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - QUESTIONPRO QUESTIONS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/questionpro/survey/{survey_id}")
async def get_survey_info(survey_id: str, admin: dict = Depends(require_admin)):
    """Recuperer les infos d'un survey QuestionPro"""
    stats = await fetch_survey_stats(survey_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Survey introuvable")
    return stats

@app.get("/admin/questionpro/survey/{survey_id}/questions")
async def get_survey_questions(survey_id: str, admin: dict = Depends(require_admin)):
    """Recuperer les questions d'un survey QuestionPro (pour definir les quotas)"""
    questions = await fetch_survey_questions(survey_id)
    return questions

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - SYNCHRONISATION QUESTIONPRO
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/sync")
async def sync_all(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Synchroniser toutes les affectations avec QuestionPro (en parallele)"""
    import asyncio

    affectations = sb.table("affectations").select("id, survey_id").execute()

    # Executer les syncs en parallele (max 5 a la fois pour eviter de surcharger l'API)
    semaphore = asyncio.Semaphore(5)

    async def sync_with_limit(aff):
        async with semaphore:
            return await sync_affectation(aff["id"], aff["survey_id"], sb)

    tasks = [sync_with_limit(aff) for aff in affectations.data]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filtrer les erreurs
    success_results = [r for r in results if not isinstance(r, Exception)]
    error_count = len(results) - len(success_results)

    return {
        "synced": len(success_results),
        "errors": error_count,
        "results": success_results
    }

@app.post("/admin/sync/{affectation_id}")
async def sync_one(affectation_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Synchroniser une affectation specifique"""
    aff = sb.table("affectations").select("id, survey_id").eq("id", affectation_id).execute()
    if not aff.data:
        raise HTTPException(status_code=404, detail="Affectation introuvable")

    return await sync_affectation(aff.data[0]["id"], aff.data[0]["survey_id"], sb)

async def sync_affectation(affectation_id: str, survey_id: str, sb: Client) -> dict:
    """Synchroniser une affectation avec les donnees QuestionPro"""
    # 1. Recuperer les stats du survey
    stats = await fetch_survey_stats(survey_id)
    if not stats:
        return {"affectation_id": affectation_id, "error": "Impossible de recuperer les stats"}

    # 3. Recuperer les reponses pour compter par pays/segment
    responses = await fetch_survey_responses(survey_id)
    pays_counts = {}
    segment_counts = {}

    # Recuperer l'enquete pour savoir si elle a une segmentation personnalisee
    aff_info = sb.table("affectations")\
        .select("enquete_id, enquetes(segmentation_question_id)")\
        .eq("id", affectation_id)\
        .execute()

    segmentation_question_id = None
    if aff_info.data and aff_info.data[0].get("enquetes"):
        segmentation_question_id = aff_info.data[0]["enquetes"].get("segmentation_question_id")

    for resp in responses:
        if resp.get("responseStatus") == "Completed":
            # Compter par pays (legacy)
            country = extract_country_from_response(resp)
            pays_counts[country] = pays_counts.get(country, 0) + 1

            # Compter par segment personnalise si defini
            if segmentation_question_id:
                segment = extract_segment_value_from_response(resp, segmentation_question_id)
                segment_counts[segment] = segment_counts.get(segment, 0) + 1

    # 4. Mettre a jour completions_pays (legacy)
    pays_list = sb.table("pays").select("id, nom").execute()
    pays_map = {p["nom"]: p["id"] for p in pays_list.data}

    pays_matched = {}
    pays_non_matches = []

    for pays_nom, count in pays_counts.items():
        # Utiliser la nouvelle fonction de matching
        pays_id = match_country_to_db(pays_nom, pays_map)

        if pays_id:
            pays_matched[pays_nom] = count
            sb.table("completions_pays").update({
                "completions": count
            }).eq("affectation_id", affectation_id).eq("pays_id", pays_id).execute()
        else:
            pays_non_matches.append(pays_nom)

    # 5. Mettre a jour completions_segments avec noms NORMALISES
    # D'abord supprimer les anciennes entrees pour eviter les doublons
    sb.table("completions_segments").delete().eq("affectation_id", affectation_id).execute()

    # Agreger segment_counts par nom normalise
    segments_normalized = {}
    for segment_value, count in segment_counts.items():
        seg_norm = normalize_country_name(segment_value)
        seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
        segments_normalized[seg_norm] = segments_normalized.get(seg_norm, 0) + count

    # Agreger pays_matched par nom normalise
    for pays_nom, count in pays_matched.items():
        seg_norm = normalize_country_name(pays_nom)
        seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
        segments_normalized[seg_norm] = segments_normalized.get(seg_norm, 0) + count

    # Inserer les segments normalises
    for seg_norm, count in segments_normalized.items():
        sb.table("completions_segments").insert({
            "affectation_id": affectation_id,
            "segment_value": seg_norm,
            "completions": count
        }).execute()

    # 7. Calculer les completions valides (attribuees a un pays) vs invalides
    total_attribuees = sum(pays_matched.values())
    total_non_attribuees = stats["completions"] - total_attribuees

    # 8. Mettre a jour l'affectation avec completions_total, clics et invalid_total
    sb.table("affectations").update({
        "completions_total": stats["completions"],
        "clics": stats["clics"],
        "invalid_total": total_non_attribuees,
        "derniere_synchro": datetime.utcnow().isoformat()
    }).eq("id", affectation_id).execute()

    # 9. Mettre a jour les QUOTAS GLOBAUX pour l'enquete
    # Agreger les completions de TOUTES les affectations de cette enquete
    enquete_id = aff_info.data[0].get("enquete_id") if aff_info.data else None
    if enquete_id:
        # Recuperer les segmentations de cette enquete specifiquement
        segmentations = sb.table("segmentations").select("id").eq("enquete_id", enquete_id).execute()
        seg_ids = [s["id"] for s in segmentations.data]

        if seg_ids:
            # Recuperer tous les quotas de cette enquete avec leurs noms normalises
            all_quotas = sb.table("quotas")\
                .select("id, segment_value")\
                .in_("segmentation_id", seg_ids)\
                .is_("affectation_id", "null")\
                .execute()

            # Creer un mapping: nom_normalise -> quota_id
            quota_mapping = {}
            for q in all_quotas.data:
                q_name = q.get("segment_value", "")
                q_norm = normalize_country_name(q_name)
                q_norm = PAYS_MAPPING.get(q_norm, q_norm)
                quota_mapping[q_norm] = q["id"]

            # Recuperer toutes les affectations de cette enquete
            all_affs = sb.table("affectations").select("id").eq("enquete_id", enquete_id).execute()
            all_aff_ids = [a["id"] for a in all_affs.data]

            if all_aff_ids:
                # Recuperer toutes les completions_segments de ces affectations
                all_segments = sb.table("completions_segments")\
                    .select("segment_value, completions")\
                    .in_("affectation_id", all_aff_ids)\
                    .execute()

                # Agreger par segment_value NORMALISE
                global_counts = {}
                for s in all_segments.data:
                    seg = s.get("segment_value", "")
                    count = s.get("completions", 0) or 0
                    if seg:
                        # Normaliser le nom du segment
                        seg_norm = normalize_country_name(seg)
                        seg_norm = PAYS_MAPPING.get(seg_norm, seg_norm)
                        global_counts[seg_norm] = global_counts.get(seg_norm, 0) + count

                # Mettre a jour les quotas globaux par ID (pas par nom)
                for seg_norm, total_completions in global_counts.items():
                    if seg_norm in quota_mapping:
                        quota_id = quota_mapping[seg_norm]
                        sb.table("quotas").update({
                            "completions": total_completions,
                            "updated_at": datetime.utcnow().isoformat()
                        }).eq("id", quota_id).execute()

    # Note: L'historique est maintenant basé sur les timestamps QuestionPro directement
    # Plus besoin d'enregistrer dans historique_completions

    return {
        "affectation_id": affectation_id,
        "survey_id": survey_id,
        "completions": stats["completions"],
        "clics": stats["clics"],
        "completions_attribuees": total_attribuees,
        "completions_non_attribuees": total_non_attribuees,
        "pays_counts": pays_counts,
        "segment_counts": segment_counts,
        "pays_matched": pays_matched,
        "pays_non_matches": pays_non_matches
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES PAYS & ZONES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/pays")
def list_pays(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Liste des pays avec zones"""
    res = sb.table("pays").select("*, zones(*)").order("nom").execute()
    return res.data

@app.get("/admin/stats-pays")
def get_stats_pays(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Stats de completions par pays (agregees) avec valides/invalides"""
    # Recuperer toutes les completions_pays avec les infos pays
    res = sb.table("completions_pays")\
        .select("completions, objectif, pays(id, nom, code, quota)")\
        .execute()

    # Agreger par pays
    stats = {}
    for cp in res.data:
        pays = cp.get("pays", {})
        pays_nom = pays.get("nom", "Inconnu")
        completions = cp.get("completions", 0)
        objectif = cp.get("objectif", 0)

        # Calculer valides (min) et invalides (depassement)
        valides = min(completions, objectif) if objectif > 0 else completions
        invalides = max(0, completions - objectif) if objectif > 0 else 0

        if pays_nom not in stats:
            stats[pays_nom] = {
                "pays": pays_nom,
                "code": pays.get("code", ""),
                "completions": 0,
                "valides": 0,
                "invalides": 0,
                "objectif": 0
            }
        stats[pays_nom]["completions"] += completions
        stats[pays_nom]["valides"] += valides
        stats[pays_nom]["invalides"] += invalides
        stats[pays_nom]["objectif"] += objectif

    # Convertir en liste et trier par completions valides
    result = list(stats.values())
    result.sort(key=lambda x: x["valides"], reverse=True)

    return result

@app.get("/admin/stats-segments")
def get_stats_segments(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Stats de completions par segment (agregees)"""
    res = sb.table("completions_segments")\
        .select("segment_value, completions, affectation_id")\
        .execute()

    # Agreger par segment
    stats = {}
    for cs in res.data:
        segment = cs.get("segment_value", "Autre")
        completions = cs.get("completions", 0)

        if segment not in stats:
            stats[segment] = {
                "segment": segment,
                "completions": 0,
                "nb_affectations": 0
            }
        stats[segment]["completions"] += completions
        stats[segment]["nb_affectations"] += 1

    # Convertir en liste et trier par completions
    result = list(stats.values())
    result.sort(key=lambda x: x["completions"], reverse=True)

    return result

@app.get("/admin/zones")
def list_zones(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Liste des zones"""
    res = sb.table("zones").select("*").execute()
    return res.data

@app.get("/admin/segmentations-stats")
def get_segmentations_stats(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Stats des segmentations par enquete avec quotas"""
    # Recuperer toutes les enquetes
    enquetes = sb.table("enquetes").select("id, code, nom").execute()

    result = []
    for enq in enquetes.data:
        enquete_id = enq["id"]

        # Recuperer les segmentations de cette enquete
        segmentations = sb.table("segmentations")\
            .select("id, nom, question_id, question_text")\
            .eq("enquete_id", enquete_id)\
            .execute()

        enquete_segs = []
        for seg in segmentations.data:
            # Recuperer les quotas de cette segmentation
            quotas = sb.table("quotas")\
                .select("id, segment_value, objectif, completions")\
                .eq("segmentation_id", seg["id"])\
                .order("completions", desc=True)\
                .execute()

            total_completions = sum(q.get("completions", 0) for q in quotas.data)
            total_objectif = sum(q.get("objectif", 0) for q in quotas.data)

            enquete_segs.append({
                "id": seg["id"],
                "nom": seg["nom"],
                "question_text": seg.get("question_text", ""),
                "total_completions": total_completions,
                "total_objectif": total_objectif,
                "quotas": quotas.data
            })

        if enquete_segs:
            result.append({
                "enquete_id": enquete_id,
                "enquete_code": enq["code"],
                "enquete_nom": enq["nom"],
                "segmentations": enquete_segs
            })

    return result

@app.get("/enqueteur/{id}/segmentations")
def get_enqueteur_segmentations(id: str, sb: Client = Depends(get_supabase)):
    """Recuperer les segmentations et quotas pour un enqueteur (basees sur ses affectations)"""
    # Verifier que l'enqueteur existe
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    # Recuperer ses affectations avec les enquetes
    affectations = sb.table("affectations")\
        .select("id, enquete_id, enquetes(id, code, nom)")\
        .eq("enqueteur_id", id)\
        .execute()

    result = []
    for aff in affectations.data:
        enquete = aff.get("enquetes", {})
        enquete_id = aff.get("enquete_id")

        # Recuperer les segmentations de cette enquete
        segmentations = sb.table("segmentations")\
            .select("id, nom, question_id, question_text")\
            .eq("enquete_id", enquete_id)\
            .execute()

        enquete_segs = []
        for seg in segmentations.data:
            # Recuperer les quotas globaux de cette segmentation
            quotas = sb.table("quotas")\
                .select("id, segment_value, objectif, completions")\
                .eq("segmentation_id", seg["id"])\
                .is_("affectation_id", "null")\
                .order("completions", desc=True)\
                .execute()

            total_completions = sum(q.get("completions", 0) for q in quotas.data)
            total_objectif = sum(q.get("objectif", 0) for q in quotas.data)

            enquete_segs.append({
                "id": seg["id"],
                "nom": seg["nom"],
                "total_completions": total_completions,
                "total_objectif": total_objectif,
                "quotas": quotas.data
            })

        if enquete_segs:
            result.append({
                "enquete_id": enquete_id,
                "enquete_code": enquete.get("code", ""),
                "enquete_nom": enquete.get("nom", ""),
                "affectation_id": aff["id"],
                "segmentations": enquete_segs
            })

    return result

# ══════════════════════════════════════════════════════════════════════════════
# HISTORIQUE COMPLETIONS (basé sur les timestamps QuestionPro)
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_all_survey_responses(survey_id: str) -> list:
    """Recuperer TOUTES les reponses d'un survey (pagination)"""
    all_responses = []
    page = 1
    per_page = 100

    while True:
        responses = await fetch_survey_responses(survey_id, page, per_page)
        if not responses:
            break
        all_responses.extend(responses)
        if len(responses) < per_page:
            break
        page += 1

    return all_responses

def aggregate_responses_by_date(responses: list) -> list:
    """Agreger les reponses completees par date (basé sur utctimestamp)"""
    daily_counts = {}

    for resp in responses:
        if resp.get("responseStatus") == "Completed":
            # Utiliser utctimestamp (timestamp Unix en secondes)
            utc_ts = resp.get("utctimestamp")
            if utc_ts:
                # Convertir en date
                date = datetime.utcfromtimestamp(utc_ts).date().isoformat()
                if date not in daily_counts:
                    daily_counts[date] = 0
                daily_counts[date] += 1

    # Convertir en liste triee
    result = [{"date": date, "completions": count} for date, count in daily_counts.items()]
    result.sort(key=lambda x: x["date"])
    return result

@app.get("/admin/historique")
async def get_historique_global(days: int = 30, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Historique global des completions (basé sur timestamps QuestionPro)"""
    from datetime import timedelta

    # Date de debut
    start_date = (datetime.utcnow() - timedelta(days=days)).date()

    # Recuperer toutes les enquetes avec leur survey_id
    enquetes = sb.table("enquetes").select("id, survey_id").execute()

    # Agreger toutes les reponses de toutes les enquetes
    all_daily_counts = {}

    for enq in enquetes.data:
        survey_id = enq.get("survey_id")
        if not survey_id:
            continue

        # Recuperer toutes les reponses
        responses = await fetch_all_survey_responses(survey_id)
        daily_data = aggregate_responses_by_date(responses)

        for day in daily_data:
            date = day["date"]
            if date not in all_daily_counts:
                all_daily_counts[date] = 0
            all_daily_counts[date] += day["completions"]

    # Filtrer par date de debut et convertir en liste
    result = []
    for date, completions in all_daily_counts.items():
        if datetime.fromisoformat(date).date() >= start_date:
            result.append({"date": date, "completions": completions})

    result.sort(key=lambda x: x["date"])
    return result

@app.get("/admin/historique/enquete/{enquete_id}")
async def get_historique_enquete(enquete_id: str, days: int = 30, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Historique des completions pour une enquete (basé sur timestamps QuestionPro)"""
    from datetime import timedelta

    start_date = (datetime.utcnow() - timedelta(days=days)).date()

    # Recuperer le survey_id de l'enquete
    enquete = sb.table("enquetes").select("survey_id").eq("id", enquete_id).execute()
    if not enquete.data:
        raise HTTPException(status_code=404, detail="Enquete introuvable")

    survey_id = enquete.data[0].get("survey_id")
    if not survey_id:
        return []

    # Recuperer toutes les reponses
    responses = await fetch_all_survey_responses(survey_id)
    daily_data = aggregate_responses_by_date(responses)

    # Filtrer par date de debut
    result = [d for d in daily_data if datetime.fromisoformat(d["date"]).date() >= start_date]
    return result

@app.get("/enqueteur/{id}/historique")
def get_historique_enqueteur(id: str, days: int = 30, sb: Client = Depends(get_supabase)):
    """Historique des completions pour un enqueteur (basé sur la table historique_completions)"""
    from datetime import timedelta

    # Verifier que l'enqueteur existe
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    start_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()

    # Recuperer les affectations de cet enqueteur
    affectations = sb.table("affectations")\
        .select("id")\
        .eq("enqueteur_id", id)\
        .execute()

    if not affectations.data:
        return []

    aff_ids = [a["id"] for a in affectations.data]

    # Recuperer l'historique depuis la table historique_completions
    historique = sb.table("historique_completions")\
        .select("date, completions")\
        .in_("affectation_id", aff_ids)\
        .gte("date", start_date)\
        .order("date")\
        .execute()

    # Agreger par date (car un enqueteur peut avoir plusieurs affectations)
    daily_counts = {}
    for h in historique.data:
        date = h["date"]
        if date not in daily_counts:
            daily_counts[date] = 0
        daily_counts[date] += h.get("completions", 0)

    # Convertir en liste
    result = [{"date": date, "completions": completions} for date, completions in daily_counts.items()]
    result.sort(key=lambda x: x["date"])
    return result

# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "version": "4.0"}

@app.get("/")
def root():
    return {"message": "Suivi Enqueteurs API v4", "docs": "/docs"}
