from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import json
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from supabase import create_client, Client
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Configuration centralisee
from .config import settings

# Module d'authentification
from .auth import auth_router, require_admin, require_super_admin, get_current_user

# ══════════════════════════════════════════════════════════════════════════════
# SCHEDULER - Sync automatique periodique
# ══════════════════════════════════════════════════════════════════════════════

scheduler = AsyncIOScheduler(timezone="UTC")

async def run_auto_sync():
    """Synchronisation automatique de toutes les affectations en cours"""
    try:
        sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        affectations = sb.table("affectations")\
            .select("id, survey_id, enquete_id, enquetes!inner(statut)")\
            .eq("enquetes.statut", "en_cours")\
            .execute()
        if not affectations.data:
            return
        responses_cache: dict = {}
        cache_lock = asyncio.Lock()
        semaphore = asyncio.Semaphore(3)

        async def _sync(aff):
            async with semaphore:
                return await sync_affectation(aff["id"], aff["survey_id"], sb, responses_cache, cache_lock)

        results = await asyncio.gather(*[_sync(a) for a in affectations.data], return_exceptions=True)
        ok = sum(1 for r in results if not isinstance(r, Exception))
        print(f"[auto-sync] {ok}/{len(results)} OK — {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")
    except Exception as e:
        print(f"[auto-sync] Erreur: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    interval = getattr(settings, "SYNC_INTERVAL_MINUTES", 30)
    scheduler.add_job(run_auto_sync, "interval", minutes=interval, id="auto_sync", replace_existing=True)
    scheduler.start()
    print(f"[scheduler] Sync auto toutes les {interval} min")
    yield
    scheduler.shutdown()

app = FastAPI(title="Suivi Enqueteurs API v5", lifespan=lifespan)

# CORS - ouvert a toutes les origines (auth via Bearer token, pas de cookies)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

CORS_HEADERS = {"Access-Control-Allow-Origin": "*"}

@app.get("/health")
def health():
    """Keep-alive + healthcheck"""
    next_sync = None
    try:
        job = scheduler.get_job("auto_sync")
        if job and job.next_run_time:
            next_sync = job.next_run_time.strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        pass
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "next_sync": next_sync}

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers=CORS_HEADERS,
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=CORS_HEADERS,
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
    identifiant: Optional[str] = None
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
    answer_options: Optional[List[Dict[str, Any]]] = None  # Options de reponse QP

class UpdateSegmentation(BaseModel):
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    nom: Optional[str] = None

# ══════════════════════════════════════════════════════════════════════════════
# QUOTAS (lies a une segmentation)
# ══════════════════════════════════════════════════════════════════════════════

class CreateQuota(BaseModel):
    enquete_id: str
    segmentation_id: str
    affectation_id: Optional[str] = None  # Si None = s'applique a tous les enqueteurs
    segment_value: str                     # Ex: "Cote d'Ivoire", "Tech"
    pourcentage: float                     # Ex: 30.0 (%)

class UpdateQuota(BaseModel):
    pourcentage: Optional[float] = None

class BulkQuotas(BaseModel):
    enquete_id: str
    segmentation_id: str
    affectation_id: Optional[str] = None
    quotas: List[Dict[str, Any]]  # [{segment_value: str, pourcentage: float}]

# ══════════════════════════════════════════════════════════════════════════════
# QUOTAS CROISES (cross-tabulation)
# ══════════════════════════════════════════════════════════════════════════════

class CreateQuotaConfig(BaseModel):
    enquete_id: str
    nom: str                                  # Ex: "Pays x Secteur"
    segmentation_ids: List[str]               # IDs des segmentations a croiser
    quotas: List[Dict[str, Any]]              # [{combination: {}, pourcentage: float}]

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
        # Recuperer le lien du survey (plusieurs champs possibles selon la version API)
        survey_url = (
            survey.get("shortUrl") or
            survey.get("webLink") or
            survey.get("surveyUrl") or
            survey.get("url") or
            ""
        )
        return {
            "completions": survey.get("completedResponses", 0),
            "clics": survey.get("viewedResponses", 0),
            "started": survey.get("startedResponses", 0),
            "name": survey.get("name", ""),
            "description": survey.get("description", ""),
            "survey_url": survey_url,
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

async def fetch_survey_responses(survey_id: str, page: int = 1, per_page: int = 1000) -> list:
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

def extract_segment_value_from_response(response: dict, question_id: str, answer_id_map: dict = None) -> str:
    """Extraire la valeur d'un segment d'une reponse QuestionPro.
    answer_id_map: mapping answerID -> texte modalite (pour corriger les textes corrompus par QuestionPro)
    """
    for question in response.get("responseSet", []):
        if str(question.get("questionID", "")) == str(question_id):
            answers = question.get("answerValues", [])
            if answers:
                answer_id = answers[0].get("answerID")
                # Utiliser le texte de la modalite si disponible (plus fiable que answerText)
                if answer_id_map and answer_id in answer_id_map:
                    return answer_id_map[answer_id]
                return answers[0].get("answerText", "Autre")
    return None

# ══════════════════════════════════════════════════════════════════════════════
# TRACKING CLICS - Endpoint de redirection
# ══════════════════════════════════════════════════════════════════════════════

def get_client_ip(request: Request) -> str:
    """Recuperer l'adresse IP du client (supporte les proxies)"""
    # Headers standards pour les proxies
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Prendre la premiere IP (client original)
        return forwarded.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # Fallback: IP directe
    return request.client.host if request.client else "unknown"

@app.get("/r/{affectation_id}")
async def track_and_redirect(affectation_id: str, request: Request, sb: Client = Depends(get_supabase)):
    """
    Tracker le clic et rediriger vers le questionnaire QuestionPro.
    Deduplication par IP: un seul clic compte par IP unique.
    """
    # Recuperer l'affectation avec le lien direct
    aff = sb.table("affectations")\
        .select("id, lien_direct, lien_questionnaire, survey_id, enqueteur_id")\
        .eq("id", affectation_id)\
        .execute()

    if not aff.data:
        raise HTTPException(status_code=404, detail="Lien invalide")

    affectation = aff.data[0]

    # Determiner le lien de redirection (lien_direct si existe, sinon lien_questionnaire)
    redirect_url = affectation.get("lien_direct") or affectation.get("lien_questionnaire")

    if not redirect_url:
        raise HTTPException(status_code=404, detail="Aucun lien de questionnaire configure")

    # Recuperer l'IP et le user-agent
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")[:500]  # Limiter la taille

    # Enregistrer le clic (avec deduplication par IP via UNIQUE constraint)
    try:
        sb.table("clics").insert({
            "affectation_id": affectation_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "statut": "clique"
        }).execute()

        # Mettre a jour le compteur de clics dans affectations
        # COUNT des IPs uniques pour cette affectation
        clics_count = sb.table("clics")\
            .select("id", count="exact")\
            .eq("affectation_id", affectation_id)\
            .execute()

        sb.table("affectations")\
            .update({"clics": clics_count.count})\
            .eq("id", affectation_id)\
            .execute()

    except Exception as e:
        # Si l'IP existe deja (doublon), on ignore l'erreur
        # L'utilisateur est quand meme redirige
        if "duplicate" not in str(e).lower() and "unique" not in str(e).lower():
            print(f"Erreur tracking clic: {e}")

    # Rediriger vers QuestionPro
    return RedirectResponse(url=redirect_url, status_code=302)

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

    # Charger les quotas individuels (lies aux affectations)
    all_quotas_individuels = []
    all_quotas_globaux = []
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
                # Recuperer les quotas individuels (lies aux affectations de cet enqueteur)
                quotas_indiv_res = sb.table("quotas")\
                    .select("*")\
                    .in_("segmentation_id", seg_ids)\
                    .in_("affectation_id", aff_ids)\
                    .execute()
                all_quotas_individuels = quotas_indiv_res.data

                # Recuperer aussi les quotas globaux (fallback si pas de quotas individuels)
                quotas_glob_res = sb.table("quotas")\
                    .select("*")\
                    .in_("segmentation_id", seg_ids)\
                    .is_("affectation_id", "null")\
                    .execute()
                for q in quotas_glob_res.data:
                    q["enquete_id"] = seg_to_enquete.get(q.get("segmentation_id"))
                all_quotas_globaux = quotas_glob_res.data
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

    # Mapper quotas individuels par affectation_id
    quotas_indiv_map = {}
    for q in all_quotas_individuels:
        aid = q.get("affectation_id")
        if aid and aid not in quotas_indiv_map:
            quotas_indiv_map[aid] = []
        if aid:
            quotas_indiv_map[aid].append(q)

    # Mapper quotas globaux par enquete_id (fallback)
    quotas_glob_map = {}
    for q in all_quotas_globaux:
        eid = q.get("enquete_id")
        if eid and eid not in quotas_glob_map:
            quotas_glob_map[eid] = []
        if eid:
            quotas_glob_map[eid].append(q)

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
        # Utiliser les quotas individuels si disponibles, sinon les quotas globaux
        aff["quotas"] = quotas_indiv_map.get(aff_id) or quotas_glob_map.get(enquete_id, [])
        aff["completions_segments"] = segments_map.get(aff_id, [])

        # Completions = completions_total (plus de calcul valides/invalides)
        aff["completions_valides"] = aff.get("completions_total", 0) or 0

        # S'assurer que lien_direct et lien_questionnaire sont corrects
        if not aff.get("lien_direct"):
            enquete_data = aff.get("enquetes", {})
            enquete_survey_id = enquete_data.get("survey_id") if enquete_data else None
            aff_survey_id = aff.get("survey_id")
            is_individual = aff_survey_id and enquete_survey_id and aff_survey_id != enquete_survey_id
            if not is_individual and enquete_survey_id and enq.get("token"):
                aff["lien_direct"] = f"https://hcakpo.questionpro.com/t/{enquete_survey_id}?custom1={enq['token']}"

        # lien_questionnaire : pour survey individuel = lien_direct, pour partage = lien_direct aussi (pas de tracking URL sans base_url)
        if not aff.get("lien_questionnaire"):
            aff["lien_questionnaire"] = aff.get("lien_direct", "")

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
    affectations = sb.table("affectations").select("id, enquete_id, objectif_total, completions_total, clics, statut").execute()

    # Objectif global = somme des tailles d'echantillon de toutes les enquetes
    total_objectif = sum(e.get("taille_echantillon", 0) for e in enquetes.data)
    total_completions = sum(a.get("completions_total", 0) or 0 for a in affectations.data)
    total_clics = sum(a.get("clics", 0) or 0 for a in affectations.data)

    # Charger les quotas par enquete (avec pourcentage)
    all_quotas = sb.table("quotas").select("segmentation_id, segment_value, pourcentage").is_("affectation_id", "null").execute()
    all_segmentations = sb.table("segmentations").select("id, enquete_id").execute()
    seg_to_enquete = {s["id"]: s["enquete_id"] for s in all_segmentations.data}

    # Construire quotas par enquete: {enquete_id: {seg_norm: pourcentage}}
    enquete_quotas = {}
    for q in all_quotas.data:
        enquete_id = seg_to_enquete.get(q.get("segmentation_id"))
        if enquete_id:
            if enquete_id not in enquete_quotas:
                enquete_quotas[enquete_id] = {}
            seg_norm = q.get("segment_value", "")
            enquete_quotas[enquete_id][seg_norm] = q.get("pourcentage", 0) or 0

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

    # Completions = total_completions (plus de calcul valides/invalides)
    total_valides = total_completions

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
        "total_invalides": 0,
        "taux_completion": round((total_completions / total_objectif * 100), 1) if total_objectif > 0 else 0
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enquetes")
def list_enquetes(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Liste des enquetes avec stats et completions valides"""
    enquetes = sb.table("enquetes").select("*").order("code").execute()

    # Charger tous les quotas et segmentations
    all_quotas = sb.table("quotas").select("segmentation_id, segment_value, pourcentage").is_("affectation_id", "null").execute()
    all_segmentations = sb.table("segmentations").select("id, enquete_id").execute()
    seg_to_enquete = {s["id"]: s["enquete_id"] for s in all_segmentations.data}

    # Construire quotas par enquete: {enquete_id: {seg_norm: pourcentage}}
    enquete_quotas = {}
    for q in all_quotas.data:
        enquete_id = seg_to_enquete.get(q.get("segmentation_id"))
        if enquete_id:
            if enquete_id not in enquete_quotas:
                enquete_quotas[enquete_id] = {}
            seg_norm = q.get("segment_value", "")
            enquete_quotas[enquete_id][seg_norm] = q.get("pourcentage", 0) or 0

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

        # Valides = completions totales (excedents calcules au niveau global dans la v2)
        total_valides = total_completions

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
    """Detail d'une enquete avec completions par affectation"""
    res = sb.table("enquetes").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enquete introuvable")

    affectations = sb.table("affectations")\
        .select("*, enqueteurs(*)")\
        .eq("enquete_id", id)\
        .execute()

    # Completions = completions_total (plus de calcul valides/invalides)
    for aff in affectations.data:
        aff["completions_valides"] = aff.get("completions_total", 0) or 0

    # Recuperer les quotas globaux pour l'affichage
    segmentations = sb.table("segmentations").select("id").eq("enquete_id", id).execute()
    seg_ids = [s["id"] for s in segmentations.data]
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
        .select("segmentation_id, segment_value, pourcentage")\
        .is_("affectation_id", "null")\
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
            seg_norm = q.get("segment_value", "")
            enquete_quotas[enquete_id][seg_norm] = q.get("pourcentage", 0) or 0

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

        # Completions = total_completions (plus de calcul valides/invalides)
        total_valides = total_completions

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
    # Auto-générer l'identifiant si non fourni
    if not data.identifiant:
        prefix = "adm" if data.is_admin else "usr"
        existing = sb.table("enqueteurs").select("identifiant").ilike("identifiant", f"{prefix}%").execute()
        next_num = len(existing.data) + 1
        data.identifiant = f"{prefix}{next_num:05d}"

    payload = {k: v for k, v in data.dict().items() if v is not None}
    res = sb.table("enqueteurs").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation enqueteur")
    return res.data[0]


@app.post("/admin/enqueteurs/migrate-identifiants")
def migrate_identifiants(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Migrer tous les identifiants existants vers le format usr00001 / adm00001"""
    all_users = sb.table("enqueteurs").select("id, is_admin, identifiant").order("created_at").execute()

    adm_count = 0
    usr_count = 0
    updated = []

    for user in all_users.data:
        if user.get("is_admin"):
            adm_count += 1
            new_id = f"adm{adm_count:05d}"
        else:
            usr_count += 1
            new_id = f"usr{usr_count:05d}"

        sb.table("enqueteurs").update({"identifiant": new_id}).eq("id", user["id"]).execute()
        updated.append({"id": user["id"], "ancien": user["identifiant"], "nouveau": new_id})

    return {"ok": True, "migres": len(updated), "details": updated}

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
    """Liste des affectations d'une enquete avec completions_valides"""
    affectations = sb.table("affectations")\
        .select("*, enqueteurs(*)")\
        .eq("enquete_id", enquete_id)\
        .execute()

    if not affectations.data:
        return []

    # Recuperer les quotas de l'enquete (normalises)
    segmentations = sb.table("segmentations").select("id").eq("enquete_id", enquete_id).execute()
    seg_ids = [s["id"] for s in segmentations.data]

    # Recuperer les quotas globaux avec pourcentage
    quota_info = {}  # {seg_norm: pourcentage}
    if seg_ids:
        quotas_raw = sb.table("quotas")\
            .select("segment_value, pourcentage")\
            .in_("segmentation_id", seg_ids)\
            .is_("affectation_id", "null")\
            .execute()
        for q in quotas_raw.data:
            seg_norm = q.get("segment_value", "")
            quota_info[seg_norm] = q.get("pourcentage", 0) or 0

    # Completions = completions_total (plus de calcul valides/invalides)
    for aff in affectations.data:
        aff["completions_valides"] = aff.get("completions_total", 0) or 0

    return affectations.data

@app.post("/admin/affectations")
async def create_affectation(data: CreateAffectation, request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
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

    # Recuperer le vrai lien du survey depuis QuestionPro
    lien_direct = None
    if survey_id and enqueteur_token:
        survey_info = await fetch_survey_stats(survey_id)
        survey_url = survey_info.get("survey_url", "") if survey_info else ""
        if survey_url:
            lien_direct = f"{survey_url}?custom1={enqueteur_token}"
        else:
            lien_direct = f"https://hcakpo.questionpro.com/t/{survey_id}?custom1={enqueteur_token}"

    affectation_data = {
        "enquete_id": data.enquete_id,
        "enqueteur_id": data.enqueteur_id,
        "survey_id": survey_id,
        "lien_direct": lien_direct,
        "objectif_total": data.objectif_total,
    }

    res = sb.table("affectations").insert(affectation_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation affectation")

    aff_id = res.data[0]["id"]

    # Lien de tracking avec https force en production
    base_url = str(request.base_url).rstrip('/')
    if base_url.startswith('http://') and 'localhost' not in base_url:
        base_url = 'https://' + base_url[7:]
    lien_questionnaire = f"{base_url}/r/{aff_id}"

    sb.table("affectations")\
        .update({"lien_questionnaire": lien_questionnaire})\
        .eq("id", aff_id)\
        .execute()
    pays_list = sb.table("pays").select("id, quota").execute()
    for pays in pays_list.data:
        sb.table("completions_pays").insert({
            "affectation_id": aff_id,
            "pays_id": pays["id"],
            "completions": 0,
            "objectif": pays["quota"]
        }).execute()

    # Copier les quotas globaux vers cette affectation
    # D'abord recuperer les segmentations de l'enquete
    segmentations = sb.table("segmentations")\
        .select("id")\
        .eq("enquete_id", data.enquete_id)\
        .execute()

    if segmentations.data:
        seg_ids = [s["id"] for s in segmentations.data]
        # Recuperer les quotas globaux (affectation_id IS NULL)
        quotas_globaux = sb.table("quotas")\
            .select("segmentation_id, segment_value, pourcentage")\
            .in_("segmentation_id", seg_ids)\
            .is_("affectation_id", "null")\
            .execute()

        # Creer les quotas individuels pour cette affectation
        for q in quotas_globaux.data:
            sb.table("quotas").insert({
                "segmentation_id": q["segmentation_id"],
                "affectation_id": aff_id,
                "segment_value": q["segment_value"],
                "pourcentage": q.get("pourcentage") or 0,
                "completions": 0
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

@app.get("/admin/affectations/{id}/clics")
def get_affectation_clics(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Recuperer les clics d'une affectation (avec IPs uniques)"""
    clics = sb.table("clics")\
        .select("id, ip_address, user_agent, statut, created_at")\
        .eq("affectation_id", id)\
        .order("created_at", desc=True)\
        .execute()

    data = clics.data or []
    return {
        "affectation_id": id,
        "total_clics": len(data),
        "total_demarre": sum(1 for c in data if c.get("statut") in ("Partial", "Completed")),
        "total_completed": sum(1 for c in data if c.get("statut") == "Completed"),
        "clics": data
    }

@app.post("/admin/affectations/migrate-links")
async def migrate_affectation_links(request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """
    Migrer les affectations vers le bon systeme de liens.
    - Survey partage : lien_questionnaire = tracking /r/{id}, lien_direct = vrai URL QP + custom1=token
    - Survey individuel : lien_questionnaire = lien_direct (URL QuestionPro directe)
    """
    affectations = sb.table("affectations")\
        .select("id, survey_id, enquete_id, enqueteur_id, lien_questionnaire, lien_direct, enquetes(survey_id), enqueteurs(token)")\
        .execute()

    base_url = str(request.base_url).rstrip('/')
    if base_url.startswith('http://') and 'localhost' not in base_url:
        base_url = 'https://' + base_url[7:]
    updated = 0

    # Cache des URLs par survey_id pour eviter les appels API repetitifs
    survey_url_cache = {}

    for aff in affectations.data:
        aff_survey_id = aff.get("survey_id")
        enquete_survey_id = (aff.get("enquetes") or {}).get("survey_id")
        enqueteur_token = (aff.get("enqueteurs") or {}).get("token")
        is_individual = aff_survey_id and enquete_survey_id and aff_survey_id != enquete_survey_id

        if is_individual:
            lien_direct = aff.get("lien_direct")
            if lien_direct:
                sb.table("affectations")\
                    .update({"lien_questionnaire": lien_direct})\
                    .eq("id", aff["id"])\
                    .execute()
                updated += 1
        else:
            updates = {"lien_questionnaire": f"{base_url}/r/{aff['id']}"}
            if aff_survey_id and enqueteur_token:
                # Recuperer le vrai URL depuis QP (avec cache)
                if aff_survey_id not in survey_url_cache:
                    survey_info = await fetch_survey_stats(aff_survey_id)
                    survey_url_cache[aff_survey_id] = (survey_info or {}).get("survey_url", "")
                survey_url = survey_url_cache[aff_survey_id]
                if survey_url:
                    updates["lien_direct"] = f"{survey_url}?custom1={enqueteur_token}"
                else:
                    updates["lien_direct"] = f"https://hcakpo.questionpro.com/t/{aff_survey_id}?custom1={enqueteur_token}"
            sb.table("affectations")\
                .update(updates)\
                .eq("id", aff["id"])\
                .execute()
            updated += 1

    return {"message": f"{updated} affectations mises a jour", "updated": updated}

@app.get("/enquetes/disponibles")
def list_enquetes_disponibles(sb: Client = Depends(get_supabase)):
    """Liste des enquetes disponibles pour un enqueteur (nom, statut, description, cible)"""
    result = sb.table("enquetes").select("id, nom, statut, description, cible").order("nom").execute()
    return result.data

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES - DEMANDES D'AFFECTATION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/enqueteur/{enqueteur_id}/demandes")
def creer_demande(enqueteur_id: str, data: dict, sb: Client = Depends(get_supabase)):
    """Enqueteur demande a rejoindre une enquete"""
    enquete_id = data.get("enquete_id")
    message = data.get("message", "")
    if not enquete_id:
        raise HTTPException(status_code=400, detail="enquete_id requis")

    # Verifier que l'enquete existe et est active
    enquete = sb.table("enquetes").select("id, statut").eq("id", enquete_id).execute()
    if not enquete.data:
        raise HTTPException(status_code=404, detail="Enquete non trouvee")

    # Verifier qu'il n'est pas deja affecte
    existing_aff = sb.table("affectations").select("id").eq("enqueteur_id", enqueteur_id).eq("enquete_id", enquete_id).execute()
    if existing_aff.data:
        raise HTTPException(status_code=400, detail="Vous etes deja affecte a cette enquete")

    # Creer ou mettre a jour la demande
    try:
        result = sb.table("demandes_affectation").upsert({
            "enqueteur_id": enqueteur_id,
            "enquete_id": enquete_id,
            "statut": "en_attente",
            "message": message,
            "updated_at": datetime.utcnow().isoformat()
        }, on_conflict="enqueteur_id,enquete_id").execute()
        return {"message": "Demande envoyee", "demande": result.data[0] if result.data else {}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/enqueteur/{enqueteur_id}/demandes")
def list_demandes_enqueteur(enqueteur_id: str, sb: Client = Depends(get_supabase)):
    """Lister les demandes d'un enqueteur"""
    result = sb.table("demandes_affectation").select(
        "id, statut, message, commentaire_admin, created_at, enquete_id, enquetes(id, nom, statut)"
    ).eq("enqueteur_id", enqueteur_id).order("created_at", desc=True).execute()
    return result.data

@app.get("/admin/demandes")
def list_demandes_admin(statut: str = None, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Lister toutes les demandes (admin)"""
    query = sb.table("demandes_affectation").select(
        "id, statut, message, commentaire_admin, created_at, updated_at, enqueteur_id, enquete_id, "
        "enqueteurs(id, nom, prenom, email), enquetes(id, nom, statut)"
    ).order("created_at", desc=True)
    if statut:
        query = query.eq("statut", statut)
    result = query.execute()
    return result.data

@app.put("/admin/demandes/{demande_id}/accepter")
async def accepter_demande(demande_id: str, request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Accepter une demande : cree l'affectation automatiquement"""
    try:
        body = await request.json()
        commentaire = body.get("commentaire", "") if body else ""
        objectif_total = int(body.get("objectif_total", 0) or 0) if body else 0
    except Exception:
        commentaire = ""
        objectif_total = 0

    # Recuperer la demande
    demande = sb.table("demandes_affectation").select("*").eq("id", demande_id).execute()
    if not demande.data:
        raise HTTPException(status_code=404, detail="Demande non trouvee")
    d = demande.data[0]

    if d["statut"] != "en_attente":
        raise HTTPException(status_code=400, detail="Cette demande a deja ete traitee")

    # Verifier qu'il n'est pas deja affecte
    existing = sb.table("affectations").select("id").eq("enqueteur_id", d["enqueteur_id"]).eq("enquete_id", d["enquete_id"]).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="L'enqueteur est deja affecte a cette enquete")

    # Recuperer l'enquete et l'enqueteur
    enquete = sb.table("enquetes").select("*").eq("id", d["enquete_id"]).execute()
    enqueteur = sb.table("enqueteurs").select("*").eq("id", d["enqueteur_id"]).execute()
    if not enquete.data or not enqueteur.data:
        raise HTTPException(status_code=404, detail="Enquete ou enqueteur introuvable")

    enq = enquete.data[0]
    enqueteur_data = enqueteur.data[0]
    survey_id = enq["survey_id"]
    token = enqueteur_data.get("token", "")

    # Construire les liens
    lien_tracking = f"{settings.BACKEND_URL}/r/"
    lien_direct = f"https://hcakpo.questionpro.com/t/{survey_id}?custom1={token}"

    # Creer l'affectation
    aff_result = sb.table("affectations").insert({
        "enqueteur_id": d["enqueteur_id"],
        "enquete_id": d["enquete_id"],
        "survey_id": survey_id,
        "lien_direct": lien_direct,
        "objectif_total": objectif_total,
        "completions_total": 0,
        "clics": 0,
        "statut": "en_cours"
    }).execute()

    if not aff_result.data:
        raise HTTPException(status_code=500, detail="Erreur lors de la creation de l'affectation")

    aff_id = aff_result.data[0]["id"]

    # Mettre a jour le lien tracking avec l'ID de l'affectation
    sb.table("affectations").update({
        "lien_questionnaire": f"{settings.BACKEND_URL}/r/{aff_id}"
    }).eq("id", aff_id).execute()

    # Mettre a jour la demande
    sb.table("demandes_affectation").update({
        "statut": "acceptee",
        "commentaire_admin": commentaire,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", demande_id).execute()

    return {"message": "Demande acceptee, affectation creee", "affectation_id": aff_id}

@app.put("/admin/demandes/{demande_id}/refuser")
async def refuser_demande(demande_id: str, request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Refuser une demande"""
    try:
        body = await request.json()
        commentaire = body.get("commentaire", "") if body else ""
    except Exception:
        commentaire = ""

    demande = sb.table("demandes_affectation").select("id, statut").eq("id", demande_id).execute()
    if not demande.data:
        raise HTTPException(status_code=404, detail="Demande non trouvee")
    if demande.data[0]["statut"] != "en_attente":
        raise HTTPException(status_code=400, detail="Cette demande a deja ete traitee")

    sb.table("demandes_affectation").update({
        "statut": "refusee",
        "commentaire_admin": commentaire,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", demande_id).execute()

    return {"message": "Demande refusee"}

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
    payload = data.dict()
    if payload.get("answer_options") is None:
        payload["answer_options"] = []
    res = sb.table("segmentations").insert(payload).execute()
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
    """Recuperer les quotas d'une segmentation avec valides/objectif (contexte: enquete entiere)"""
    # Recuperer la segmentation pour connaitre l'enquete
    seg_info = sb.table("segmentations").select("id, enquete_id").eq("id", segmentation_id).execute()
    if not seg_info.data:
        return []
    enquete_id = seg_info.data[0]["enquete_id"]

    # Objectif total de l'enquete = somme des objectifs de toutes les affectations
    affectations = sb.table("affectations").select("id, objectif_total").eq("enquete_id", enquete_id).execute()
    objectif_total_enquete = sum(a.get("objectif_total") or 0 for a in affectations.data)
    aff_ids = [a["id"] for a in affectations.data]

    # Completions par segment pour cette segmentation specifique
    completions_par_segment = {}
    if aff_ids:
        cs = sb.table("completions_segments")\
            .select("segment_value, completions")\
            .in_("affectation_id", aff_ids)\
            .eq("segmentation_id", segmentation_id)\
            .execute()
        # Fallback si aucune ligne avec segmentation_id (donnees avant migration 008)
        if not cs.data:
            cs = sb.table("completions_segments")\
                .select("segment_value, completions")\
                .in_("affectation_id", aff_ids)\
                .is_("segmentation_id", "null")\
                .execute()
        for s in cs.data:
            seg_norm = s.get("segment_value", "")
            completions_par_segment[seg_norm] = completions_par_segment.get(seg_norm, 0) + (s.get("completions") or 0)

    # Quotas globaux
    quotas = sb.table("quotas")\
        .select("id, segment_value, pourcentage")\
        .eq("segmentation_id", segmentation_id)\
        .is_("affectation_id", "null")\
        .execute()

    if not quotas.data:
        return []

    result = []
    for q in quotas.data:
        seg_val = q.get("segment_value", "")
        pourcentage = q.get("pourcentage") or 0
        objectif = int(objectif_total_enquete * pourcentage / 100)
        seg_norm = seg_val
        valides_brut = completions_par_segment.get(seg_norm, 0)
        valides = min(valides_brut, objectif) if objectif > 0 else valides_brut
        result.append({
            "id": q["id"],
            "segment_value": seg_val,
            "pourcentage": pourcentage,
            "objectif": objectif,
            "valides": valides,
        })

    result.sort(key=lambda x: x["pourcentage"], reverse=True)
    return result

@app.get("/admin/quotas/by-enquete/{enquete_id}")
def get_quotas_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Recuperer les quotas d'une enquete avec les pourcentages"""
    segs = sb.table("segmentations").select("id, nom").eq("enquete_id", enquete_id).execute()
    if not segs.data:
        return []

    result = []
    for seg in segs.data:
        seg_id = seg["id"]

        # Recuperer les quotas globaux (affectation_id = null) pour cette segmentation
        quotas_glob = sb.table("quotas")\
            .select("id, segment_value, pourcentage")\
            .eq("segmentation_id", seg_id)\
            .is_("affectation_id", "null")\
            .execute()

        quotas_liste = []
        total_pourcentage = 0
        for q in (quotas_glob.data or []):
            pct = q.get("pourcentage", 0) or 0
            total_pourcentage += pct
            quotas_liste.append({
                "id": q["id"],
                "segment_value": q.get("segment_value", ""),
                "pourcentage": pct,
                "segmentation_id": seg_id
            })
        quotas_liste.sort(key=lambda x: x["pourcentage"], reverse=True)

        result.append({
            "segmentation_id": seg_id,
            "segmentation_nom": seg["nom"],
            "quotas": quotas_liste,
            "total_pourcentage": total_pourcentage
        })

    return result

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
    quota_data = {
        "enquete_id": data.enquete_id,
        "segmentation_id": data.segmentation_id,
        "affectation_id": data.affectation_id,
        "segment_value": data.segment_value,
        "pourcentage": data.pourcentage
    }
    res = sb.table("quotas").insert(quota_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation quota")
    return res.data[0]

@app.post("/admin/quotas/bulk")
def create_quotas_bulk(data: BulkQuotas, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Creer plusieurs quotas en une fois pour une segmentation"""
    created = []
    for q in data.quotas:
        quota_data = {
            "enquete_id": data.enquete_id,
            "segmentation_id": data.segmentation_id,
            "affectation_id": data.affectation_id,
            "segment_value": q.get("segment_value"),
            "pourcentage": float(q.get("pourcentage", 0))
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
# ROUTES ADMIN - QUOTAS CROISES
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/quota-configs")
def create_quota_config(data: CreateQuotaConfig, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Creer une configuration de quotas croises avec ses combinaisons"""
    # 1. Creer la config
    config_res = sb.table("quota_configs").insert({
        "enquete_id": data.enquete_id,
        "nom": data.nom
    }).execute()
    if not config_res.data:
        raise HTTPException(status_code=400, detail="Erreur creation quota config")
    config = config_res.data[0]
    config_id = config["id"]

    # 2. Lier les segmentations
    for i, seg_id in enumerate(data.segmentation_ids):
        sb.table("quota_config_questions").insert({
            "quota_config_id": config_id,
            "segmentation_id": seg_id,
            "position": i
        }).execute()

    # 3. Creer les quotas pour chaque combinaison
    for q in data.quotas:
        combination = q.get("combination", {})
        pourcentage = float(q.get("pourcentage", 0))
        # Trouver la premiere segmentation pour lier le quota
        first_seg_id = data.segmentation_ids[0] if data.segmentation_ids else None
        sb.table("quotas").insert({
            "segmentation_id": first_seg_id,
            "quota_config_id": config_id,
            "segment_value": " x ".join(str(v) for v in combination.values()),
            "combination": combination,
            "pourcentage": pourcentage
        }).execute()

    return config

@app.get("/admin/quota-configs/by-enquete/{enquete_id}")
def get_quota_configs_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Lister les configs de quotas croises d'une enquete avec completions"""
    configs = sb.table("quota_configs")\
        .select("*")\
        .eq("enquete_id", enquete_id)\
        .execute()

    if not configs.data:
        return []

    # Recuperer les affectations de l'enquete
    affectations = sb.table("affectations")\
        .select("id, objectif_total")\
        .eq("enquete_id", enquete_id)\
        .execute()
    aff_ids = [a["id"] for a in affectations.data]
    objectif_total_enquete = sum(a.get("objectif_total") or 0 for a in affectations.data)

    result = []
    for config in configs.data:
        config_id = config["id"]

        # Questions liees
        questions = sb.table("quota_config_questions")\
            .select("*, segmentations(id, nom, question_id)")\
            .eq("quota_config_id", config_id)\
            .order("position")\
            .execute()

        # Quotas (combinaisons avec pourcentages)
        quotas = sb.table("quotas")\
            .select("id, segment_value, combination, pourcentage")\
            .eq("quota_config_id", config_id)\
            .execute()

        # Completions par combinaison (agrege toutes les affectations)
        completions_map = {}
        if aff_ids:
            combs = sb.table("completions_combinations")\
                .select("combination, completions")\
                .eq("quota_config_id", config_id)\
                .in_("affectation_id", aff_ids)\
                .execute()
            for c in combs.data:
                key = str(c["combination"])
                completions_map[key] = completions_map.get(key, 0) + (c["completions"] or 0)

        # Enrichir les quotas avec completions
        quotas_enriched = []
        for q in quotas.data:
            comb = q.get("combination", {})
            key = str(comb)
            pct = q.get("pourcentage") or 0
            objectif = int(objectif_total_enquete * pct / 100)
            completions = completions_map.get(key, 0)
            quotas_enriched.append({
                **q,
                "objectif": objectif,
                "completions": completions,
                "progression": round(completions / objectif * 100, 1) if objectif > 0 else 0
            })

        result.append({
            **config,
            "questions": questions.data,
            "quotas": quotas_enriched,
            "objectif_total": objectif_total_enquete
        })

    return result

@app.delete("/admin/quota-configs/{id}")
def delete_quota_config(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Supprimer une config de quotas croises (cascade sur questions, quotas, completions)"""
    sb.table("quota_configs").delete().eq("id", id).execute()
    return {"ok": True}

@app.post("/admin/quota-configs/{config_id}/generate-combinations")
def generate_combinations(config_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Generer le produit cartesien des answer_options des segmentations liees"""
    from itertools import product as itertools_product

    # Recuperer les questions liees a cette config
    questions = sb.table("quota_config_questions")\
        .select("segmentation_id, position, segmentations(id, nom, answer_options)")\
        .eq("quota_config_id", config_id)\
        .order("position")\
        .execute()

    if not questions.data:
        return {"combinations": []}

    # Construire les listes d'options par segmentation
    axes = []
    for q in questions.data:
        seg = q.get("segmentations", {})
        nom = seg.get("nom", "")
        options = seg.get("answer_options") or []
        # Chaque option est un dict avec au minimum "text" ou "value"
        values = []
        for opt in options:
            val = opt.get("text") or opt.get("value") or opt.get("label") or str(opt)
            values.append(val)
        axes.append({"nom": nom, "values": values})

    # Produit cartesien
    if not axes or any(len(a["values"]) == 0 for a in axes):
        return {"combinations": []}

    noms = [a["nom"] for a in axes]
    all_values = [a["values"] for a in axes]
    combinations = []
    for combo in itertools_product(*all_values):
        combination = dict(zip(noms, combo))
        combinations.append(combination)

    return {"combinations": combinations, "axes": axes}

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

    # Ne synchroniser que les affectations des enquetes en cours
    affectations = sb.table("affectations").select("id, survey_id, enquete_id, enquetes!inner(statut)").eq("enquetes.statut", "en_cours").execute()

    # Cache partage : chaque survey n'est telecharge qu'une seule fois pour tout le sync
    responses_cache: dict = {}
    cache_lock = asyncio.Lock()

    # Executer les syncs en parallele (max 5 a la fois pour eviter de surcharger l'API)
    semaphore = asyncio.Semaphore(5)

    async def sync_with_limit(aff):
        async with semaphore:
            return await sync_affectation(aff["id"], aff["survey_id"], sb, responses_cache, cache_lock)

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

async def sync_affectation(affectation_id: str, survey_id: str, sb: Client, responses_cache: dict = None, cache_lock=None) -> dict:
    """Synchroniser une affectation avec les donnees QuestionPro"""

    async def _fetch(sid):
        """fetch avec cache partage — chaque survey n'est telecharge qu'une seule fois"""
        sid = str(sid)
        if responses_cache is None:
            return await fetch_survey_responses(sid)
        if sid not in responses_cache:
            async with cache_lock:
                if sid not in responses_cache:
                    responses_cache[sid] = await fetch_survey_responses(sid)
        return responses_cache[sid]

    # 1. Recuperer les infos completes de l'affectation
    aff_info = sb.table("affectations")\
        .select("id, enquete_id, survey_id, enqueteur_id, enqueteurs(token, identifiant), enquetes(survey_id, survey_ids_historique, segmentation_question_id)")\
        .eq("id", affectation_id)\
        .execute()

    if not aff_info.data:
        return {"affectation_id": affectation_id, "error": "Affectation introuvable"}

    aff = aff_info.data[0]
    enquete = aff.get("enquetes") or {}
    enqueteur = aff.get("enqueteurs") or {}

    survey_id_affectation = aff.get("survey_id")
    survey_id_enquete = enquete.get("survey_id")
    survey_ids_historique = enquete.get("survey_ids_historique") or []
    enqueteur_token = enqueteur.get("token")
    enqueteur_identifiant = enqueteur.get("identifiant", "")
    segmentation_question_id = enquete.get("segmentation_question_id")
    enquete_id = aff.get("enquete_id")
    enqueteur_id = aff.get("enqueteur_id")

    # 2. Determiner si l'affectation a un survey individuel
    is_ancien_systeme = survey_id_affectation and survey_id_enquete and str(survey_id_affectation) != str(survey_id_enquete)
    # Marketym recoit aussi les reponses sans custom1 connu (fourre-tout)
    is_fourre_tout = enqueteur_identifiant == "usr00015"

    # survey cible pour les segmentations/questions
    target_survey_id = survey_id_enquete or survey_id_affectation

    # 3. Recuperer et fusionner les reponses de TOUTES les sources
    STATUS_RANK = {"Completed": 3, "Partial": 2, "Started": 1}
    source_responses = []
    seen_response_ids = set()

    async def add_responses_filtered(sid, token):
        """Fetch depuis un survey partage et filtre par token enqueteur"""
        if not sid or not token:
            return
        try:
            resps = await _fetch(sid)
            for r in resps:
                rid = str(r.get("responseID") or r.get("responseId") or "")
                if rid in seen_response_ids:
                    continue
                custom_vars = r.get("customVariables", {})
                custom1 = custom_vars.get("custom1", "")
                if custom1 == token:
                    seen_response_ids.add(rid)
                    source_responses.append(r)
        except Exception as e:
            print(f"[sync] Erreur fetch survey {sid}: {e}")

    async def add_responses_all(sid):
        """Fetch depuis un survey individuel (toutes les reponses lui appartiennent)"""
        if not sid:
            return
        try:
            resps = await _fetch(sid)
            for r in resps:
                rid = str(r.get("responseID") or r.get("responseId") or "")
                if rid not in seen_response_ids:
                    seen_response_ids.add(rid)
                    source_responses.append(r)
        except Exception as e:
            print(f"[sync] Erreur fetch survey individuel {sid}: {e}")

    async def add_responses_fourre_tout(sid, known_tokens):
        """Fetch depuis un survey : token Marketym + reponses sans token connu"""
        if not sid:
            return
        try:
            resps = await _fetch(sid)
            for r in resps:
                rid = str(r.get("responseID") or r.get("responseId") or "")
                if rid in seen_response_ids:
                    continue
                custom1 = r.get("customVariables", {}).get("custom1", "")
                # Inclure si : token Marketym OU custom1 absent OU token inconnu
                if custom1 == enqueteur_token or custom1 not in known_tokens:
                    seen_response_ids.add(rid)
                    source_responses.append(r)
        except Exception as e:
            print(f"[sync] Erreur fetch fourre-tout {sid}: {e}")

    # Source 1 : survey individuel (si applicable) — toutes les reponses lui appartiennent
    if is_ancien_systeme:
        await add_responses_all(survey_id_affectation)

    if is_fourre_tout:
        # Recuperer tous les tokens des autres enqueteurs de cette enquete
        all_aff_tokens_res = sb.table("affectations")\
            .select("enqueteurs(token)")\
            .eq("enquete_id", enquete_id)\
            .neq("enqueteur_id", enqueteur_id)\
            .execute()
        known_tokens = set()
        for a in (all_aff_tokens_res.data or []):
            t = (a.get("enqueteurs") or {}).get("token")
            if t:
                known_tokens.add(t)
        # Source 2 + 3 : fourre-tout (token Marketym + reponses sans token connu)
        await add_responses_fourre_tout(survey_id_enquete, known_tokens)
        for old_sid in survey_ids_historique:
            await add_responses_fourre_tout(str(old_sid), known_tokens)
    else:
        # Source 2 : survey actuel de l'enquete filtre par token
        await add_responses_filtered(survey_id_enquete, enqueteur_token)
        # Source 3 : anciens surveys de l'enquete (historique) filtres par token
        for old_sid in survey_ids_historique:
            await add_responses_filtered(str(old_sid), enqueteur_token)

    enqueteur_responses = [r for r in source_responses if r.get("responseStatus") == "Completed"]

    # Construire ip_status : chaque IP garde son statut le plus avance
    ip_status = {}
    for r in source_responses:
        ip = r.get("ipAddress")
        status = r.get("responseStatus", "")
        if ip:
            if STATUS_RANK.get(status, 0) > STATUS_RANK.get(ip_status.get(ip, ""), 0):
                ip_status[ip] = status

    # 3b. Enrichir la table clics avec les statuts QP (sans degrad er le statut existant)
    if ip_status:
        existing_clics = sb.table("clics")\
            .select("ip_address, statut")\
            .eq("affectation_id", affectation_id)\
            .execute()
        existing_ip_statut = {c["ip_address"]: c.get("statut", "clique") for c in (existing_clics.data or [])}

        for ip, status in ip_status.items():
            existing_rank = STATUS_RANK.get(existing_ip_statut.get(ip, ""), 0)
            new_rank = STATUS_RANK.get(status, 0)
            if new_rank >= existing_rank:
                sb.table("clics").upsert({
                    "affectation_id": affectation_id,
                    "ip_address": ip,
                    "statut": status
                }, on_conflict="affectation_id,ip_address").execute()

    # Recompter depuis la table clics (source de verite)
    clics_data = sb.table("clics").select("statut").eq("affectation_id", affectation_id).execute()
    clics_count = len(clics_data.data)
    demarre_count = sum(1 for c in clics_data.data if c.get("statut") in ("Partial", "Completed"))

    # 4. Recuperer les stats du survey
    stats = await fetch_survey_stats(target_survey_id)
    if not stats:
        stats = {"completions": 0, "clics": 0}

    # 5. Compter par segment pour CET ENQUETEUR
    # Charger les segmentations depuis la table segmentations (nouveau systeme)
    segmentations_list = []
    if enquete_id:
        seg_res = sb.table("segmentations").select("id, question_id, question_text, nom, answer_options").eq("enquete_id", enquete_id).execute()
        segmentations_list = seg_res.data if seg_res.data else []
        # Enrichir chaque segmentation avec les segment_values des quotas globaux (fallback pour answer_options vides)
        if segmentations_list:
            seg_ids = [s["id"] for s in segmentations_list if s.get("id")]
            if seg_ids:
                q_rows = sb.table("quotas").select("segmentation_id, segment_value").in_("segmentation_id", seg_ids).is_("affectation_id", "null").execute()
                quota_vals_by_seg = {}
                for qr in (q_rows.data or []):
                    sid = qr.get("segmentation_id")
                    sv = qr.get("segment_value", "")
                    if sid and sv:
                        quota_vals_by_seg.setdefault(sid, set()).add(sv)
                for seg in segmentations_list:
                    if not (seg.get("answer_options") or []):
                        vals = quota_vals_by_seg.get(seg.get("id"), set())
                        seg["answer_options"] = [{"text": v} for v in vals]

    # Fallback sur l'ancien champ segmentation_question_id si pas de segmentations
    if not segmentations_list and segmentation_question_id:
        segmentations_list = [{"id": None, "question_id": segmentation_question_id, "nom": "Segment"}]

    # Charger les questions du survey source des reponses pour :
    # 1. Trouver le bon question_id (ancien systeme : match par texte)
    # 2. Mapper answerID -> texte modalite (corrige les textes corrompus par QuestionPro)
    answer_id_maps = {}  # qid -> {answerID: texte_modalite}
    target_questions = []
    target_sid = str(survey_id_affectation if is_ancien_systeme else (survey_id_enquete or survey_id_affectation))
    if segmentations_list:
        try:
            target_questions = await fetch_survey_questions(target_sid)
            for q in target_questions:
                aid_map = {}
                for a in q.get("answers", []):
                    aid = a.get("id")
                    if aid:
                        try:
                            aid_map[int(aid)] = a.get("text", "")
                        except (ValueError, TypeError):
                            pass
                answer_id_maps[q["id"]] = aid_map
        except Exception as e:
            print(f"[sync] Erreur fetch questions survey {target_sid}: {e}")

    # Ancien systeme : trouver le bon question_id par matching de texte
    if is_ancien_systeme and segmentations_list and target_questions:
        indiv_qid_by_text = {}
        for q in target_questions:
            indiv_qid_by_text[q["text"].strip().lower()] = q["id"]
        for seg in segmentations_list:
            seg_text = (seg.get("question_text") or seg.get("nom") or "").strip().lower()
            if seg_text in indiv_qid_by_text:
                seg["_resolved_qid"] = indiv_qid_by_text[seg_text]
            else:
                # Priorite 1 : match par chevauchement des answer_options
                # (ex: si segmentation a options ["Cameroun","Cote d'Ivoire"], chercher
                #  la question du survey individuel dont les reponses contiennent ces memes valeurs)
                seg_options = set(
                    o.get("text", "").strip().lower()
                    for o in (seg.get("answer_options") or [])
                    if o.get("text")
                )
                if seg_options:
                    best_qid = None
                    best_overlap = 0
                    for q in target_questions:
                        q_options = set(a["text"].strip().lower() for a in q.get("answers", []))
                        overlap = len(seg_options & q_options)
                        if overlap > best_overlap:
                            best_overlap = overlap
                            best_qid = q["id"]
                    if best_overlap >= 2:
                        seg["_resolved_qid"] = best_qid

                # Priorite 2 (fallback) : match souple par mot-cle du nom
                if "_resolved_qid" not in seg:
                    seg_nom = (seg.get("nom") or "").strip().lower()
                    keywords = [w for w in seg_nom.split() if len(w) > 2]
                    if not keywords and seg_text:
                        keywords = [w for w in seg_text.split() if len(w) > 3]
                    # Chercher la question avec le plus de keywords correspondants
                    best_qid = None
                    best_score = 0
                    for q in target_questions:
                        q_text = q["text"].strip().lower()
                        score = sum(1 for kw in keywords if kw in q_text)
                        if score > best_score:
                            best_score = score
                            best_qid = q["id"]
                    if best_score > 0:
                        seg["_resolved_qid"] = best_qid

    # Compter les completions par segmentation et par valeur
    segment_counts_by_question = {}
    for seg in segmentations_list:
        qid = seg.get("_resolved_qid", seg["question_id"])
        aid_map = answer_id_maps.get(str(qid), {})
        segment_counts_by_question[qid] = {}
        # Valeurs connues pour le fallback (lowercase) : from answer_options or quotas
        known_values_lower = set(
            o.get("text", "").strip().lower()
            for o in (seg.get("answer_options") or [])
            if o.get("text")
        )
        for resp in enqueteur_responses:
            value = extract_segment_value_from_response(resp, qid, aid_map)
            # Fallback : si le matching par question_id echoue (reponses venant d'un autre
            # survey que le survey individuel), scanner toutes les reponses et chercher
            # une valeur qui correspond a une valeur connue de la segmentation
            if not value and known_values_lower:
                for question in resp.get("responseSet", []):
                    for ans in question.get("answerValues", []):
                        ans_text = (ans.get("answerText") or "").strip()
                        if ans_text and ans_text.lower() in known_values_lower:
                            value = ans_text
                            break
                    if value:
                        break
            if value:
                segment_counts_by_question[qid][value] = segment_counts_by_question[qid].get(value, 0) + 1

    # 5b. Mettre a jour completions_segments (une ligne par segmentation x segment_value)
    sb.table("completions_segments").delete().eq("affectation_id", affectation_id).execute()

    # Inserer par segmentation avec segmentation_id pour eviter les collisions
    segments_normalized = {}  # garde pour les etapes 8b/9 (matching quotas)
    for seg in segmentations_list:
        seg_id = seg.get("id")  # None pour l'ancien systeme fallback
        qid = seg.get("_resolved_qid", seg["question_id"])
        counts = segment_counts_by_question.get(qid, {})
        for seg_val, count in counts.items():
            row = {
                "affectation_id": affectation_id,
                "segment_value": seg_val,
                "completions": count
            }
            if seg_id:
                row["segmentation_id"] = seg_id
            sb.table("completions_segments").insert(row).execute()
            # Agreger aussi dans segments_normalized pour les etapes suivantes
            segments_normalized[seg_val] = segments_normalized.get(seg_val, 0) + count

    completions_enqueteur = len(enqueteur_responses)

    # 7. Mettre a jour l'affectation avec completions_total, clics et demarre_total
    sb.table("affectations").update({
        "completions_total": completions_enqueteur,
        "clics": clics_count,
        "demarre_total": demarre_count,
        "invalid_total": 0,
        "derniere_synchro": datetime.utcnow().isoformat()
    }).eq("id", affectation_id).execute()

    # 8b. Mettre a jour les QUOTAS INDIVIDUELS de cet enqueteur
    if enquete_id:
        segmentations = sb.table("segmentations").select("id").eq("enquete_id", enquete_id).execute()
        seg_ids = [s["id"] for s in segmentations.data]

        if seg_ids:
            # Recuperer les quotas individuels de cette affectation
            quotas_indiv = sb.table("quotas")\
                .select("id, segment_value")\
                .in_("segmentation_id", seg_ids)\
                .eq("affectation_id", affectation_id)\
                .execute()

            # Creer mapping: nom_normalise -> quota_id
            quota_indiv_mapping = {}
            for q in quotas_indiv.data:
                q_name = q.get("segment_value", "")
                q_norm = q_name
                quota_indiv_mapping[q_norm] = q["id"]

            # Mettre a jour chaque quota individuel avec les completions de cet enqueteur
            for seg_norm, count in segments_normalized.items():
                if seg_norm in quota_indiv_mapping:
                    quota_id = quota_indiv_mapping[seg_norm]
                    sb.table("quotas").update({
                        "completions": count,
                        "updated_at": datetime.utcnow().isoformat()
                    }).eq("id", quota_id).execute()

    # 9. Mettre a jour les QUOTAS GLOBAUX pour l'enquete
    # Agreger les completions de TOUTES les affectations de cette enquete
    if enquete_id:
        # Recuperer les segmentations de cette enquete specifiquement
        segmentations = sb.table("segmentations").select("id").eq("enquete_id", enquete_id).execute()
        seg_ids = [s["id"] for s in segmentations.data]

        if seg_ids:
            # Recuperer tous les quotas globaux avec leur segmentation_id
            all_quotas = sb.table("quotas")\
                .select("id, segmentation_id, segment_value")\
                .in_("segmentation_id", seg_ids)\
                .is_("affectation_id", "null")\
                .execute()

            # Mapping: (segmentation_id, segment_value) -> quota_id
            quota_mapping = {}
            for q in all_quotas.data:
                key = (q.get("segmentation_id", ""), q.get("segment_value", ""))
                quota_mapping[key] = q["id"]

            # Recuperer toutes les affectations de cette enquete
            all_affs = sb.table("affectations").select("id").eq("enquete_id", enquete_id).execute()
            all_aff_ids = [a["id"] for a in all_affs.data]

            if all_aff_ids:
                # Recuperer completions_segments avec segmentation_id
                all_segments = sb.table("completions_segments")\
                    .select("segmentation_id, segment_value, completions")\
                    .in_("affectation_id", all_aff_ids)\
                    .execute()

                # Agreger par (segmentation_id, segment_value)
                global_counts = {}
                for s in all_segments.data:
                    sid = s.get("segmentation_id") or ""
                    seg = s.get("segment_value", "")
                    count = s.get("completions", 0) or 0
                    if seg:
                        key = (sid, seg)
                        global_counts[key] = global_counts.get(key, 0) + count

                # Mettre a jour les quotas globaux
                for key, total_completions in global_counts.items():
                    if key in quota_mapping:
                        quota_id = quota_mapping[key]
                        sb.table("quotas").update({
                            "completions": total_completions,
                            "updated_at": datetime.utcnow().isoformat()
                        }).eq("id", quota_id).execute()
                    else:
                        # Fallback: match par segment_value seul (donnees avant migration 008)
                        for (s_id, s_val), qid in quota_mapping.items():
                            if s_val == key[1]:
                                sb.table("quotas").update({
                                    "completions": total_completions,
                                    "updated_at": datetime.utcnow().isoformat()
                                }).eq("id", qid).execute()
                                break

    # 10. Sauvegarder dans historique_completions par date reelle de reponse QuestionPro
    if enquete_id:
        # Grouper les reponses par date QuestionPro (utctimestamp = timestamp Unix de soumission)
        daily_counts = {}
        for resp in enqueteur_responses:
            utc_ts = resp.get("utctimestamp")
            if utc_ts:
                date = datetime.utcfromtimestamp(utc_ts).date().isoformat()
                daily_counts[date] = daily_counts.get(date, 0) + 1

        # Supprimer les anciennes entrees pour repartir propre
        sb.table("historique_completions").delete().eq("affectation_id", affectation_id).execute()

        # Inserer une ligne par date reelle de reponse
        for date, count in daily_counts.items():
            sb.table("historique_completions").upsert({
                "date": date,
                "affectation_id": affectation_id,
                "enquete_id": enquete_id,
                "completions": count,
                "clics": 0
            }, on_conflict="date,enquete_id,affectation_id").execute()

    # 11. Mettre a jour les completions_combinations (quotas croises)
    if enquete_id:
        quota_configs = sb.table("quota_configs")\
            .select("id")\
            .eq("enquete_id", enquete_id)\
            .execute()

        for qc in quota_configs.data:
            qc_id = qc["id"]

            # Recuperer les questions liees a cette config
            qc_questions = sb.table("quota_config_questions")\
                .select("segmentation_id, position, segmentations(question_id, nom)")\
                .eq("quota_config_id", qc_id)\
                .order("position")\
                .execute()

            if not qc_questions.data:
                continue

            # Pour chaque reponse, extraire les valeurs de TOUTES les questions du croisement
            combo_counts = {}
            for resp in enqueteur_responses:
                combo = {}
                valid = True
                for qq in qc_questions.data:
                    seg = qq.get("segmentations", {})
                    question_id = seg.get("question_id", "")
                    nom = seg.get("nom", "")
                    value = extract_segment_value_from_response(resp, question_id)
                    if not value or value == "Inconnu":
                        valid = False
                        break
                    combo[nom] = value

                if valid and combo:
                    combo_key = json.dumps(combo, sort_keys=True)
                    combo_counts[combo_key] = combo_counts.get(combo_key, 0) + 1

            # Supprimer les anciennes completions pour cette config/affectation
            sb.table("completions_combinations")\
                .delete()\
                .eq("affectation_id", affectation_id)\
                .eq("quota_config_id", qc_id)\
                .execute()

            # Inserer les nouvelles completions par combinaison
            for combo_key, count in combo_counts.items():
                combo_dict = json.loads(combo_key)
                sb.table("completions_combinations").insert({
                    "affectation_id": affectation_id,
                    "quota_config_id": qc_id,
                    "combination": combo_dict,
                    "completions": count
                }).execute()

    return {
        "affectation_id": affectation_id,
        "survey_id": survey_id,
        "completions": completions_enqueteur,
        "clics": clics_count,
        "segment_counts": segments_normalized,
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
    """Stats de completions par pays (agregees)"""
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

        if pays_nom not in stats:
            stats[pays_nom] = {
                "pays": pays_nom,
                "code": pays.get("code", ""),
                "completions": 0,
                "objectif": 0
            }
        stats[pays_nom]["completions"] += completions
        stats[pays_nom]["objectif"] += objectif

    result = list(stats.values())
    result.sort(key=lambda x: x["completions"], reverse=True)

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
    """Stats des segmentations par enquete avec valides/objectif pour chaque quota (contexte: enquete entiere)"""
    enquetes = sb.table("enquetes").select("id, code, nom").execute()

    # Charger toutes les affectations en une fois
    all_affectations = sb.table("affectations").select("id, enquete_id, objectif_total").execute()
    # Charger tous les completions_segments en une fois (avec segmentation_id)
    aff_ids_all = [a["id"] for a in all_affectations.data]
    all_cs = {}
    if aff_ids_all:
        cs_data = sb.table("completions_segments").select("affectation_id, segmentation_id, segment_value, completions").in_("affectation_id", aff_ids_all).execute()
        for s in cs_data.data:
            aid = s["affectation_id"]
            if aid not in all_cs:
                all_cs[aid] = []
            all_cs[aid].append(s)

    # Index affectations par enquete
    aff_by_enquete = {}
    for a in all_affectations.data:
        eid = a["enquete_id"]
        if eid not in aff_by_enquete:
            aff_by_enquete[eid] = []
        aff_by_enquete[eid].append(a)

    result = []
    for enq in enquetes.data:
        enquete_id = enq["id"]
        affectations_enq = aff_by_enquete.get(enquete_id, [])
        objectif_total_enquete = sum(a.get("objectif_total") or 0 for a in affectations_enq)

        # Agregation des completions par (segmentation_id, segment_value)
        completions_enq_by_seg = {}  # {segmentation_id: {segment_value: count}}
        completions_enq_global = {}  # fallback sans segmentation_id
        for a in affectations_enq:
            for s in all_cs.get(a["id"], []):
                seg_id = s.get("segmentation_id")
                seg_norm = s.get("segment_value", "")
                count = s.get("completions") or 0
                if seg_id:
                    if seg_id not in completions_enq_by_seg:
                        completions_enq_by_seg[seg_id] = {}
                    completions_enq_by_seg[seg_id][seg_norm] = completions_enq_by_seg[seg_id].get(seg_norm, 0) + count
                else:
                    completions_enq_global[seg_norm] = completions_enq_global.get(seg_norm, 0) + count

        segmentations = sb.table("segmentations").select("id, nom, question_text").eq("enquete_id", enquete_id).execute()

        enquete_segs = []
        for seg in segmentations.data:
            seg_id = seg["id"]
            # Utiliser les completions filtrees par segmentation si disponibles, sinon fallback global
            completions_seg = completions_enq_by_seg.get(seg_id) or completions_enq_global

            quotas_globaux = sb.table("quotas")\
                .select("id, segment_value, pourcentage")\
                .eq("segmentation_id", seg_id)\
                .is_("affectation_id", "null")\
                .execute()

            quotas_liste = []
            for q in quotas_globaux.data:
                seg_val = q.get("segment_value", "")
                pourcentage = q.get("pourcentage") or 0
                objectif = int(objectif_total_enquete * pourcentage / 100)
                valides_brut = completions_seg.get(seg_val, 0)
                valides = min(valides_brut, objectif) if objectif > 0 else valides_brut
                quotas_liste.append({
                    "segment_value": seg_val,
                    "pourcentage": pourcentage,
                    "objectif": objectif,
                    "valides": valides,
                })
            quotas_liste.sort(key=lambda x: x["pourcentage"], reverse=True)

            # Cap total_valides a objectif_total pour eviter la double-comptabilite
            total_valides = min(sum(q["valides"] for q in quotas_liste), objectif_total_enquete)
            total_objectif = objectif_total_enquete

            enquete_segs.append({
                "id": seg["id"],
                "nom": seg["nom"],
                "question_text": seg.get("question_text", ""),
                "total_valides": total_valides,
                "total_objectif": total_objectif,
                "quotas": quotas_liste
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
    """Recuperer les segmentations et quotas individuels pour un enqueteur (basees sur ses affectations)"""
    # Verifier que l'enqueteur existe
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    # Recuperer ses affectations avec les enquetes
    affectations = sb.table("affectations")\
        .select("id, enquete_id, objectif_total, completions_total, enquetes(id, code, nom)")\
        .eq("enqueteur_id", id)\
        .execute()

    result = []
    for aff in affectations.data:
        enquete = aff.get("enquetes") or {}
        enquete_id = aff.get("enquete_id")
        if not enquete_id:
            continue
        aff_id = aff["id"]
        objectif_total_aff = aff.get("objectif_total") or 0

        # Recuperer les segmentations de cette enquete
        segmentations = sb.table("segmentations")\
            .select("id, nom, question_id, question_text")\
            .eq("enquete_id", enquete_id)\
            .execute()

        enquete_segs = []
        for seg in segmentations.data:
            seg_id = seg["id"]

            # Completions pour cette affectation, filtrees par segmentation
            cs_rows = sb.table("completions_segments")\
                .select("segment_value, completions")\
                .eq("affectation_id", aff_id)\
                .eq("segmentation_id", seg_id)\
                .execute()
            # Fallback si aucune ligne avec segmentation_id (avant migration 008)
            if not cs_rows.data:
                cs_rows = sb.table("completions_segments")\
                    .select("segment_value, completions")\
                    .eq("affectation_id", aff_id)\
                    .is_("segmentation_id", "null")\
                    .execute()
            completions_par_segment = {}
            for cs in cs_rows.data:
                sv = cs.get("segment_value", "")
                completions_par_segment[sv] = completions_par_segment.get(sv, 0) + (cs.get("completions") or 0)

            # Quotas globaux (avec pourcentage, pas objectif)
            quotas_rows = sb.table("quotas")\
                .select("id, segment_value, pourcentage")\
                .eq("segmentation_id", seg_id)\
                .is_("affectation_id", "null")\
                .order("pourcentage", desc=True)\
                .execute()

            quotas_enriched = []
            total_objectif = 0
            total_valides = 0
            for q in quotas_rows.data:
                pourcentage = q.get("pourcentage") or 0
                objectif = int(objectif_total_aff * pourcentage / 100)
                seg_val = q.get("segment_value", "")
                valides_brut = completions_par_segment.get(seg_val, 0)
                valides = min(valides_brut, objectif) if objectif > 0 else valides_brut
                total_objectif += objectif
                total_valides += valides
                quotas_enriched.append({
                    "id": q["id"],
                    "segment_value": seg_val,
                    "objectif": objectif,
                    "completions": valides
                })
            # Cap total_valides pour eviter la double-comptabilite
            total_valides = min(total_valides, objectif_total_aff)

            enquete_segs.append({
                "id": seg["id"],
                "nom": seg["nom"],
                "total_objectif": total_objectif,
                "total_valides": total_valides,
                "quotas": quotas_enriched
            })

        if enquete_segs:
            result.append({
                "enquete_id": enquete_id,
                "enquete_code": enquete.get("code", ""),
                "enquete_nom": enquete.get("nom", ""),
                "affectation_id": aff_id,
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
    per_page = 1000

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
def get_historique_global(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: int = 30,
    admin: dict = Depends(require_admin),
    sb: Client = Depends(get_supabase)
):
    """Historique global des completions depuis historique_completions (Supabase uniquement)"""
    from datetime import timedelta

    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    if not to_date:
        to_date = datetime.utcnow().date().isoformat()

    rows = sb.table("historique_completions")\
        .select("date, completions, clics")\
        .gte("date", from_date)\
        .lte("date", to_date)\
        .order("date")\
        .execute()

    daily = {}
    for r in rows.data:
        d = r["date"]
        if d not in daily:
            daily[d] = {"date": d, "completions": 0, "clics": 0}
        daily[d]["completions"] += r.get("completions") or 0
        daily[d]["clics"] += r.get("clics") or 0

    return sorted(daily.values(), key=lambda x: x["date"])


@app.get("/admin/historique/enquete/{enquete_id}")
def get_historique_enquete(
    enquete_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: int = 30,
    admin: dict = Depends(require_admin),
    sb: Client = Depends(get_supabase)
):
    """Historique des completions pour une enquete depuis historique_completions"""
    from datetime import timedelta

    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    if not to_date:
        to_date = datetime.utcnow().date().isoformat()

    rows = sb.table("historique_completions")\
        .select("date, completions, clics")\
        .eq("enquete_id", enquete_id)\
        .gte("date", from_date)\
        .lte("date", to_date)\
        .order("date")\
        .execute()

    daily = {}
    for r in rows.data:
        d = r["date"]
        if d not in daily:
            daily[d] = {"date": d, "completions": 0, "clics": 0}
        daily[d]["completions"] += r.get("completions") or 0
        daily[d]["clics"] += r.get("clics") or 0

    return sorted(daily.values(), key=lambda x: x["date"])

@app.get("/enqueteur/{id}/historique")
def get_historique_enqueteur(id: str, from_date: Optional[str] = None, to_date: Optional[str] = None, days: int = 30, sb: Client = Depends(get_supabase)):
    """Historique des completions pour un enqueteur (basé sur la table historique_completions)"""
    from datetime import timedelta

    # Verifier que l'enqueteur existe
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    if not to_date:
        to_date = datetime.utcnow().date().isoformat()

    # Recuperer les affectations de cet enqueteur
    affectations = sb.table("affectations").select("id").eq("enqueteur_id", id).execute()
    if not affectations.data:
        return []
    aff_ids = [a["id"] for a in affectations.data]

    historique = sb.table("historique_completions")\
        .select("date, completions, clics")\
        .in_("affectation_id", aff_ids)\
        .gte("date", from_date)\
        .lte("date", to_date)\
        .order("date")\
        .execute()

    daily = {}
    for h in historique.data:
        date = h["date"]
        if date not in daily:
            daily[date] = {"completions": 0, "clics": 0}
        daily[date]["completions"] += h.get("completions", 0) or 0
        daily[date]["clics"] += h.get("clics", 0) or 0

    result = [{"date": date, **vals} for date, vals in daily.items()]
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
