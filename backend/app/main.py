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

from .config import settings
from .auth import auth_router, require_admin, require_super_admin, get_current_user

# ══════════════════════════════════════════════════════════════════════════════
# SCHEDULER
# ══════════════════════════════════════════════════════════════════════════════

scheduler = AsyncIOScheduler(timezone="UTC")

async def run_auto_sync():
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

app = FastAPI(title="Suivi Enqueteurs API v6", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

CORS_HEADERS = {"Access-Control-Allow-Origin": "*"}

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/health")
def health():
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
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=CORS_HEADERS)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=CORS_HEADERS)

app.include_router(auth_router)

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

QUESTIONPRO_BASE_URL = settings.QUESTIONPRO_BASE_URL

_supabase_client: Client = None

def get_supabase() -> Client:
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
    survey_id: str
    description: str = ""
    cible: str
    taille_echantillon: int = 0

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

class CreateSegmentation(BaseModel):
    enquete_id: str
    question_id: str
    question_text: Optional[str] = None
    nom: str
    answer_options: Optional[List[Dict[str, Any]]] = None  # [{id, text}, ...] depuis QP

class UpdateSegmentation(BaseModel):
    question_id: Optional[str] = None
    question_text: Optional[str] = None
    nom: Optional[str] = None

class CreateQuota(BaseModel):
    enquete_id: str
    segmentation_id: str
    segment_value: str       # valeur texte → lookup answer_option_id en interne
    pourcentage: float

class UpdateQuota(BaseModel):
    pourcentage: Optional[float] = None

class BulkQuotas(BaseModel):
    enquete_id: str
    segmentation_id: str
    quotas: List[Dict[str, Any]]  # [{segment_value, pourcentage}]

class CreateQuotaGroup(BaseModel):
    enquete_id: str
    nom: str
    segmentation_ids: List[str]
    quotas: List[Dict[str, Any]]  # [{combination: {seg_id: ao_id}, pourcentage}]

class UpdateRoleRequest(BaseModel):
    role: str

# ══════════════════════════════════════════════════════════════════════════════
# HELPERS : NORMALISATION
# ══════════════════════════════════════════════════════════════════════════════

_COUNTRY_ALIASES = {
    # Noms QP → valeur normalisée en base
    "République du Congo": "Congo",
    "Republique du Congo": "Congo",
    "Congo-Brazzaville": "Congo",
    "République Centrafricaine": "RCA",
    "Republique Centrafricaine": "RCA",
    "Guinée Bissau": "Guinée-Bissau",
    "Guinee Bissau": "Guinée-Bissau",
    # QP renvoie "Côte dIvoire" (pas d'apostrophe) — alias obligatoire
    "Côte dIvoire": "Côte d'Ivoire",
    "Cote dIvoire": "Côte d'Ivoire",
    "Cote d'Ivoire": "Côte d'Ivoire",
    "Cote d Ivoire": "Côte d'Ivoire",
}

def normalize_segment_value(text: str) -> str:
    """Normaliser : apostrophes curly→droites, espaces insécables→espaces, alias pays."""
    if not text:
        return text
    t = text.replace('\u2019', "'").replace('\u2018', "'").replace('\u00a0', ' ').strip()
    return _COUNTRY_ALIASES.get(t, t)

def get_answer_option_id(sb: Client, segmentation_id: str, segment_value: str) -> Optional[str]:
    """Chercher l'answer_option_id pour une valeur normalisée."""
    normalized = normalize_segment_value(segment_value)
    res = sb.table("answer_options").select("id")\
        .eq("segmentation_id", segmentation_id)\
        .eq("valeur", normalized)\
        .execute()
    return res.data[0]["id"] if res.data else None

def load_answer_options_map(sb: Client, segmentation_ids: List[str]) -> Dict[str, Dict[str, str]]:
    """Charger {segmentation_id: {valeur: ao_id, "__qp__<qp_answer_id>": ao_id}} pour un lot de segmentations."""
    if not segmentation_ids:
        return {}
    res = sb.table("answer_options").select("id, segmentation_id, valeur, qp_answer_id")\
        .in_("segmentation_id", segmentation_ids)\
        .execute()
    result: Dict[str, Dict[str, str]] = {}
    for ao in res.data:
        sid = ao["segmentation_id"]
        if sid not in result:
            result[sid] = {}
        result[sid][ao["valeur"]] = ao["id"]
        # Clé secondaire par qp_answer_id (matching robuste sans dépendre du texte)
        if ao.get("qp_answer_id"):
            result[sid][f"__qp__{ao['qp_answer_id']}"] = ao["id"]
    return result

def compute_quotas_for_segmentation(
    sb: Client,
    segmentation_id: str,
    objectif_total: int,
    aff_ids: List[str]
) -> List[dict]:
    """
    Retourner les quotas d'une segmentation enrichis avec completions.
    Utilise answer_options + response_counts (nouveau modèle).
    """
    # Quotas globaux pour cette segmentation
    quotas_res = sb.table("quotas").select("id, answer_option_id, pourcentage")\
        .eq("segmentation_id", segmentation_id)\
        .is_("affectation_id", "null")\
        .execute()

    if not quotas_res.data:
        return []

    ao_ids = [q["answer_option_id"] for q in quotas_res.data if q.get("answer_option_id")]

    # Labels des answer_options
    ao_labels: Dict[str, str] = {}
    if ao_ids:
        ao_res = sb.table("answer_options").select("id, valeur")\
            .in_("id", ao_ids)\
            .execute()
        ao_labels = {ao["id"]: ao["valeur"] for ao in ao_res.data}

    # Completions agrégées par answer_option_id pour ces affectations
    completions_map: Dict[str, int] = {}
    if aff_ids and ao_ids:
        rc_res = sb.table("response_counts").select("answer_option_id, count")\
            .in_("affectation_id", aff_ids)\
            .in_("answer_option_id", ao_ids)\
            .execute()
        for rc in rc_res.data:
            ao_id = rc["answer_option_id"]
            completions_map[ao_id] = completions_map.get(ao_id, 0) + (rc.get("count") or 0)

    result = []
    for q in quotas_res.data:
        ao_id = q.get("answer_option_id")
        if not ao_id:
            continue
        pourcentage = q.get("pourcentage") or 0
        objectif = int(objectif_total * pourcentage / 100)
        completions_brut = completions_map.get(ao_id, 0)
        completions = min(completions_brut, objectif) if objectif > 0 else completions_brut
        result.append({
            "id": q["id"],
            "answer_option_id": ao_id,
            "segment_value": ao_labels.get(ao_id, ""),
            "pourcentage": pourcentage,
            "objectif": objectif,
            "completions": completions,
        })

    result.sort(key=lambda x: x["pourcentage"], reverse=True)
    return result

# ══════════════════════════════════════════════════════════════════════════════
# HELPERS : QUESTIONPRO
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_survey_stats(survey_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}",
            headers={"api-key": settings.QUESTIONPRO_API_KEY}
        )
        if response.status_code != 200:
            return None
        data = response.json()
        survey = data.get("response", {})
        survey_url = (
            survey.get("shortUrl") or survey.get("webLink") or
            survey.get("surveyUrl") or survey.get("url") or ""
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
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}/questions",
            headers={"api-key": settings.QUESTIONPRO_API_KEY}
        )
        if response.status_code != 200:
            return []
        data = response.json()
        questions = data.get("response", [])
        result = []
        for q in questions:
            question_info = {
                "id": str(q.get("questionID", q.get("id", ""))),
                "code": q.get("code", ""),
                "text": q.get("text", ""),
                "type": q.get("type", ""),
                "answers": []
            }
            answers = q.get("answers", q.get("answerChoices", []))
            for ac in answers:
                question_info["answers"].append({
                    "id": str(ac.get("answerID", ac.get("id", ""))),
                    "text": ac.get("text", "")
                })
            if question_info["answers"]:
                result.append(question_info)
        return result

async def fetch_survey_responses(survey_id: str, page: int = 1, per_page: int = 1000) -> list:
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

def extract_segment_value_from_response(
    response: dict, question_id: str, answer_id_map: Optional[dict] = None
) -> Optional[str]:
    """Extraire la valeur d'un segment d'une réponse QP."""
    for question in response.get("responseSet", []):
        if str(question.get("questionID", "")) == str(question_id):
            answers = question.get("answerValues", [])
            if answers:
                answer_id = answers[0].get("answerID")
                if answer_id_map and answer_id in answer_id_map:
                    return normalize_segment_value(answer_id_map[answer_id])
                return normalize_segment_value(answers[0].get("answerText", ""))
    return None

# ══════════════════════════════════════════════════════════════════════════════
# TRACKING CLICS
# ══════════════════════════════════════════════════════════════════════════════

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"

@app.get("/r/{affectation_id}")
async def track_and_redirect(affectation_id: str, request: Request, sb: Client = Depends(get_supabase)):
    aff = sb.table("affectations")\
        .select("id, lien_direct, lien_questionnaire, survey_id, enqueteur_id")\
        .eq("id", affectation_id).execute()
    if not aff.data:
        raise HTTPException(status_code=404, detail="Lien invalide")
    affectation = aff.data[0]
    redirect_url = affectation.get("lien_direct") or affectation.get("lien_questionnaire")
    if not redirect_url:
        raise HTTPException(status_code=404, detail="Aucun lien de questionnaire configuré")

    ip_address = get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")[:500]
    try:
        sb.table("clics").insert({
            "affectation_id": affectation_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "statut": "clique"
        }).execute()
        clics_count = sb.table("clics").select("id", count="exact")\
            .eq("affectation_id", affectation_id).execute()
        sb.table("affectations").update({"clics": clics_count.count})\
            .eq("id", affectation_id).execute()
    except Exception as e:
        if "duplicate" not in str(e).lower() and "unique" not in str(e).lower():
            print(f"Erreur tracking clic: {e}")

    return RedirectResponse(url=redirect_url, status_code=302)

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ENQUETEUR
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/enqueteur/login")
def login_enqueteur(data: LoginEnqueteur, sb: Client = Depends(get_supabase)):
    res = sb.table("enqueteurs").select("*").eq("identifiant", data.identifiant).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")
    enq = res.data[0]
    if enq["mot_de_passe"] != data.mot_de_passe:
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")
    if not enq.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte désactivé")
    try:
        sb.table("enqueteurs").update({"derniere_connexion": datetime.utcnow().isoformat()})\
            .eq("id", enq["id"]).execute()
    except Exception:
        pass
    affectations = sb.table("affectations").select("*, enquetes(*)")\
        .eq("enqueteur_id", enq["id"]).execute()
    return {
        "id": enq["id"], "identifiant": enq["identifiant"],
        "nom": enq["nom"], "prenom": enq["prenom"],
        "telephone": enq["telephone"],
        "is_admin": enq.get("is_admin", False),
        "affectations": affectations.data
    }

@app.get("/enqueteur/{id}")
def get_enqueteur(id: str, sb: Client = Depends(get_supabase)):
    res = sb.table("enqueteurs").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")
    enq = res.data[0]

    affectations = sb.table("affectations").select("*, enquetes(*)")\
        .eq("enqueteur_id", enq["id"]).execute()
    if not affectations.data:
        return {**enq, "affectations": []}

    aff_ids = [aff["id"] for aff in affectations.data]
    enquete_ids = [aff["enquete_id"] for aff in affectations.data if aff.get("enquete_id")]

    # Charger les completions_pays (legacy)
    all_completions_pays = sb.table("completions_pays").select("*, pays(*)")\
        .in_("affectation_id", aff_ids).execute()
    completions_pays_map = {}
    for cp in all_completions_pays.data:
        aid = cp["affectation_id"]
        completions_pays_map.setdefault(aid, []).append(cp)

    # Charger response_counts pour toutes les affectations
    rc_res = sb.table("response_counts").select("affectation_id, answer_option_id, count")\
        .in_("affectation_id", aff_ids).execute()
    rc_by_aff: Dict[str, List[dict]] = {}
    for rc in rc_res.data:
        rc_by_aff.setdefault(rc["affectation_id"], []).append(rc)

    for aff in affectations.data:
        aff_id = aff["id"]
        aff["completions_pays"] = completions_pays_map.get(aff_id, [])
        aff["completions_valides"] = aff.get("completions_total", 0) or 0
        aff["response_counts"] = rc_by_aff.get(aff_id, [])

        if not aff.get("lien_direct"):
            enquete_data = aff.get("enquetes", {})
            enquete_survey_id = enquete_data.get("survey_id") if enquete_data else None
            aff_survey_id = aff.get("survey_id")
            is_individual = aff_survey_id and enquete_survey_id and aff_survey_id != enquete_survey_id
            if not is_individual and enquete_survey_id and enq.get("token"):
                aff["lien_direct"] = f"https://hcakpo.questionpro.com/t/{enquete_survey_id}?custom1={enq['token']}"
        if not aff.get("lien_questionnaire"):
            aff["lien_questionnaire"] = aff.get("lien_direct", "")

    return {**enq, "affectations": affectations.data}

@app.get("/enqueteur/{id}/affectation/{affectation_id}")
def get_affectation_detail(id: str, affectation_id: str, sb: Client = Depends(get_supabase)):
    aff = sb.table("affectations").select("*, enquetes(*)")\
        .eq("id", affectation_id).eq("enqueteur_id", id).execute()
    if not aff.data:
        raise HTTPException(status_code=404, detail="Affectation introuvable")
    return aff.data[0]

@app.post("/enqueteur/{id}/sync")
async def sync_enqueteur(id: str, sb: Client = Depends(get_supabase)):
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")
    affectations = sb.table("affectations").select("id, survey_id")\
        .eq("enqueteur_id", id).execute()
    results = []
    for aff in affectations.data:
        result = await sync_affectation(aff["id"], aff["survey_id"], sb)
        results.append(result)
    return {"synced": len(results), "results": results}

@app.get("/enqueteur/{id}/segmentations")
def get_enqueteur_segmentations(id: str, sb: Client = Depends(get_supabase)):
    """Segmentations et quotas pour un enquêteur (nouveau modèle : response_counts + answer_options)."""
    enq = sb.table("enqueteurs").select("id").eq("id", id).execute()
    if not enq.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    affectations = sb.table("affectations")\
        .select("id, enquete_id, objectif_total, completions_total, enquetes(id, code, nom)")\
        .eq("enqueteur_id", id).execute()

    result = []
    for aff in affectations.data:
        enquete = aff.get("enquetes") or {}
        enquete_id = aff.get("enquete_id")
        if not enquete_id:
            continue
        aff_id = aff["id"]
        objectif_total_aff = aff.get("objectif_total") or 0

        # Segmentations de cette enquête
        segmentations = sb.table("segmentations")\
            .select("id, nom, question_id, question_text")\
            .eq("enquete_id", enquete_id).execute()

        enquete_segs = []
        for seg in segmentations.data:
            seg_id = seg["id"]

            # Quotas globaux avec answer_options
            quotas_res = sb.table("quotas").select("id, answer_option_id, pourcentage")\
                .eq("segmentation_id", seg_id)\
                .is_("affectation_id", "null").execute()

            if not quotas_res.data:
                continue

            ao_ids = [q["answer_option_id"] for q in quotas_res.data if q.get("answer_option_id")]
            if not ao_ids:
                continue

            # Labels
            ao_res = sb.table("answer_options").select("id, valeur")\
                .in_("id", ao_ids).execute()
            ao_labels = {ao["id"]: ao["valeur"] for ao in ao_res.data}

            # Completions pour cette affectation
            rc_res = sb.table("response_counts").select("answer_option_id, count")\
                .in_("answer_option_id", ao_ids)\
                .eq("affectation_id", aff_id).execute()
            rc_map = {rc["answer_option_id"]: (rc.get("count") or 0) for rc in rc_res.data}

            quotas_enriched = []
            total_objectif = 0
            total_completions = 0
            for q in quotas_res.data:
                ao_id = q.get("answer_option_id")
                if not ao_id:
                    continue
                pourcentage = q.get("pourcentage") or 0
                objectif = int(objectif_total_aff * pourcentage / 100)
                completions_brut = rc_map.get(ao_id, 0)
                completions = min(completions_brut, objectif) if objectif > 0 else completions_brut
                total_objectif += objectif
                total_completions += completions
                quotas_enriched.append({
                    "id": q["id"],
                    "answer_option_id": ao_id,
                    "segment_value": ao_labels.get(ao_id, ""),
                    "objectif": objectif,
                    "completions": completions,
                })
            quotas_enriched.sort(key=lambda x: x["objectif"], reverse=True)
            total_completions = min(total_completions, objectif_total_aff)

            enquete_segs.append({
                "id": seg_id,
                "nom": seg["nom"],
                "total_objectif": total_objectif,
                "total_valides": total_completions,
                "quotas": quotas_enriched,
            })

        if enquete_segs:
            result.append({
                "enquete_id": enquete_id,
                "enquete_code": enquete.get("code", ""),
                "enquete_nom": enquete.get("nom", ""),
                "affectation_id": aff_id,
                "segmentations": enquete_segs,
            })

    return result

@app.get("/enqueteur/{id}/historique")
def get_historique_enqueteur(
    id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: int = 30,
    sb: Client = Depends(get_supabase)
):
    from datetime import timedelta
    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    if not to_date:
        to_date = datetime.utcnow().date().isoformat()

    aff_res = sb.table("affectations").select("id")\
        .eq("enqueteur_id", id).execute()
    aff_ids = [a["id"] for a in aff_res.data]
    if not aff_ids:
        return []

    rows = sb.table("historique_completions").select("date, completions, clics")\
        .in_("affectation_id", aff_ids)\
        .gte("date", from_date).lte("date", to_date).order("date").execute()

    daily: Dict[str, dict] = {}
    for r in rows.data:
        d = r["date"]
        if d not in daily:
            daily[d] = {"date": d, "completions": 0, "clics": 0}
        daily[d]["completions"] += r.get("completions") or 0
        daily[d]["clics"] += r.get("clics") or 0
    return sorted(daily.values(), key=lambda x: x["date"])

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - AUTH (legacy)
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
    enquetes = sb.table("enquetes").select("id, code, nom, statut, taille_echantillon").execute()
    enqueteurs = sb.table("enqueteurs").select("id, is_admin, actif").execute()
    affectations = sb.table("affectations")\
        .select("id, enquete_id, objectif_total, completions_total, clics, statut").execute()

    total_objectif = sum(e.get("taille_echantillon", 0) for e in enquetes.data)
    total_completions = sum(a.get("completions_total", 0) or 0 for a in affectations.data)
    total_clics = sum(a.get("clics", 0) or 0 for a in affectations.data)

    nb_enqueteurs = len([e for e in enqueteurs.data if not e.get("is_admin", False)])
    nb_enqueteurs_actifs = len([e for e in enqueteurs.data
                                if e.get("actif", True) and not e.get("is_admin", False)])
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
        "total_valides": total_completions,
        "total_invalides": 0,
        "taux_completion": round(total_completions / total_objectif * 100, 1) if total_objectif > 0 else 0,
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enquetes")
def list_enquetes(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    enquetes = sb.table("enquetes").select("*").order("code").execute()
    all_affectations = sb.table("affectations")\
        .select("id, enquete_id, objectif_total, completions_total, clics").execute()

    enquete_affectations: Dict[str, list] = {}
    for aff in all_affectations.data:
        enquete_affectations.setdefault(aff["enquete_id"], []).append(aff)

    result = []
    for enq in enquetes.data:
        affectations = enquete_affectations.get(enq["id"], [])
        taille_echantillon = enq.get("taille_echantillon", 0)
        total_objectif_aff = sum(a["objectif_total"] or 0 for a in affectations)
        total_completions = sum(a["completions_total"] or 0 for a in affectations)
        total_clics = sum(a["clics"] or 0 for a in affectations)
        result.append({
            **enq,
            "nb_enqueteurs": len(affectations),
            "total_objectif": taille_echantillon if taille_echantillon > 0 else total_objectif_aff,
            "total_objectif_affectations": total_objectif_aff,
            "total_clics": total_clics,
            "total_completions": total_completions,
            "total_valides": total_completions,
        })
    return result

@app.get("/admin/enquetes/{id}")
def get_enquete(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    res = sb.table("enquetes").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enquête introuvable")
    affectations = sb.table("affectations").select("*, enqueteurs(*)")\
        .eq("enquete_id", id).execute()
    for aff in affectations.data:
        aff["completions_valides"] = aff.get("completions_total", 0) or 0

    # Quotas globaux enrichis pour cette enquête
    segs = sb.table("segmentations").select("id").eq("enquete_id", id).execute()
    seg_ids = [s["id"] for s in segs.data]
    aff_ids = [a["id"] for a in affectations.data]
    objectif_total = sum(a.get("objectif_total") or 0 for a in affectations.data)

    quotas_enriched = []
    for seg_id in seg_ids:
        quotas_enriched.extend(compute_quotas_for_segmentation(sb, seg_id, objectif_total, aff_ids))

    return {**res.data[0], "affectations": affectations.data, "quotas": quotas_enriched}

@app.post("/admin/enquetes")
async def create_enquete(data: CreateEnquete, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    existing = sb.table("enquetes").select("id").eq("survey_id", data.survey_id).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Cette enquête existe déjà")

    survey_info = await fetch_survey_stats(data.survey_id)
    if not survey_info:
        raise HTTPException(status_code=404, detail="Survey QuestionPro introuvable")

    questions = await fetch_survey_questions(data.survey_id)

    enquete_data = {
        "survey_id": data.survey_id,
        "code": data.survey_id,
        "nom": survey_info.get("name", f"Survey {data.survey_id}"),
        "description": data.description or survey_info.get("description", ""),
        "cible": data.cible,
        "taille_echantillon": data.taille_echantillon,
        "statut": "en_cours",
        "survey_url": survey_info.get("survey_url", ""),
    }
    res = sb.table("enquetes").insert(enquete_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur création enquête")
    return {**res.data[0], "questions": questions, "survey_info": survey_info}

@app.put("/admin/enquetes/{id}")
def update_enquete(id: str, data: UpdateEnquete, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnée")
    res = sb.table("enquetes").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/enquetes/{id}")
def delete_enquete(id: str, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    sb.table("enquetes").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETEURS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enqueteurs")
def list_enqueteurs(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    enqueteurs = sb.table("enqueteurs").select("*").order("identifiant").execute()
    if not enqueteurs.data:
        return []

    all_affectations = sb.table("affectations")\
        .select("id, enqueteur_id, enquete_id, objectif_total, completions_total, clics, enquetes(code, nom)")\
        .execute()

    affectations_map: Dict[str, list] = {}
    for aff in all_affectations.data:
        affectations_map.setdefault(aff["enqueteur_id"], []).append(aff)

    result = []
    for enq in enqueteurs.data:
        enq_affectations = affectations_map.get(enq["id"], [])
        total_objectif = sum(a["objectif_total"] or 0 for a in enq_affectations)
        total_completions = sum(a["completions_total"] or 0 for a in enq_affectations)
        total_clics = sum(a["clics"] or 0 for a in enq_affectations)
        result.append({
            **enq,
            "nb_enquetes": len(enq_affectations),
            "total_objectif": total_objectif,
            "total_clics": total_clics,
            "total_completions": total_completions,
            "total_completions_valides": total_completions,
            "enquetes": [a["enquetes"] for a in enq_affectations if a.get("enquetes")],
        })
    return result

@app.post("/admin/enqueteurs")
def create_enqueteur(data: CreateEnqueteur, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    if not data.identifiant:
        prefix = "adm" if data.is_admin else "usr"
        existing = sb.table("enqueteurs").select("identifiant").ilike("identifiant", f"{prefix}%").execute()
        next_num = len(existing.data) + 1
        data.identifiant = f"{prefix}{next_num:05d}"
    payload = {k: v for k, v in data.dict().items() if v is not None}
    res = sb.table("enqueteurs").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur création enquêteur")
    return res.data[0]

@app.post("/admin/enqueteurs/migrate-identifiants")
def migrate_identifiants(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    all_users = sb.table("enqueteurs").select("id, is_admin, identifiant").order("created_at").execute()
    adm_count = usr_count = 0
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
        raise HTTPException(status_code=400, detail="Aucune donnée")
    res = sb.table("enqueteurs").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/enqueteurs/{id}")
def delete_enqueteur(id: str, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    sb.table("enqueteurs").delete().eq("id", id).execute()
    return {"ok": True}

@app.put("/admin/enqueteurs/{id}/role")
def update_enqueteur_role(id: str, data: UpdateRoleRequest, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    if data.role not in ["enqueteur", "admin", "super_admin"]:
        raise HTTPException(status_code=400, detail="Role invalide")
    user = sb.table("enqueteurs").select("id, role").eq("id", id).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    is_admin = data.role in ["admin", "super_admin"]
    res = sb.table("enqueteurs").update({"role": data.role, "is_admin": is_admin}).eq("id", id).execute()
    return {"ok": True, "role": data.role, "user": res.data[0] if res.data else None}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - AFFECTATIONS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/affectations")
def list_affectations(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    res = sb.table("affectations").select("*, enquetes(*), enqueteurs(*)").execute()
    return res.data

@app.get("/admin/affectations/by-enquete/{enquete_id}")
def list_affectations_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    affectations = sb.table("affectations").select("*, enqueteurs(*)")\
        .eq("enquete_id", enquete_id).execute()
    for aff in affectations.data:
        aff["completions_valides"] = aff.get("completions_total", 0) or 0
    return affectations.data

@app.post("/admin/affectations")
async def create_affectation(data: CreateAffectation, request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    enquete = sb.table("enquetes").select("id, survey_id, survey_url").eq("id", data.enquete_id).execute()
    if not enquete.data:
        raise HTTPException(status_code=404, detail="Enquête introuvable")
    enq_data = enquete.data[0]
    survey_id = enq_data.get("survey_id")

    enqueteur = sb.table("enqueteurs").select("id, token").eq("id", data.enqueteur_id).execute()
    if not enqueteur.data:
        raise HTTPException(status_code=404, detail="Enquêteur introuvable")
    enqueteur_token = enqueteur.data[0].get("token")

    lien_direct = None
    if survey_id and enqueteur_token:
        survey_url = enq_data.get("survey_url", "")
        if not survey_url:
            survey_info = await fetch_survey_stats(survey_id)
            survey_url = (survey_info or {}).get("survey_url", "")
        if survey_url:
            lien_direct = f"{survey_url}?custom1={enqueteur_token}"
        else:
            lien_direct = f"https://hcakpo.questionpro.com/t/{survey_id}?custom1={enqueteur_token}"

    aff_res = sb.table("affectations").insert({
        "enquete_id": data.enquete_id,
        "enqueteur_id": data.enqueteur_id,
        "survey_id": survey_id,
        "lien_direct": lien_direct,
        "objectif_total": data.objectif_total,
    }).execute()
    if not aff_res.data:
        raise HTTPException(status_code=400, detail="Erreur création affectation")

    aff_id = aff_res.data[0]["id"]
    base_url = str(request.base_url).rstrip('/')
    if base_url.startswith('http://') and 'localhost' not in base_url:
        base_url = 'https://' + base_url[7:]
    sb.table("affectations").update({"lien_questionnaire": f"{base_url}/r/{aff_id}"})\
        .eq("id", aff_id).execute()

    # completions_pays (legacy)
    pays_list = sb.table("pays").select("id, quota").execute()
    for pays in pays_list.data:
        try:
            sb.table("completions_pays").insert({
                "affectation_id": aff_id,
                "pays_id": pays["id"],
                "completions": 0,
                "objectif": pays["quota"]
            }).execute()
        except Exception:
            pass

    return aff_res.data[0]

@app.put("/admin/affectations/{id}")
def update_affectation(id: str, data: UpdateAffectation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnée")
    res = sb.table("affectations").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/affectations/{id}")
def delete_affectation(id: str, admin: dict = Depends(require_super_admin), sb: Client = Depends(get_supabase)):
    sb.table("affectations").delete().eq("id", id).execute()
    return {"ok": True}

@app.get("/admin/affectations/{id}/clics")
def get_affectation_clics(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    clics = sb.table("clics").select("id, ip_address, user_agent, statut, created_at")\
        .eq("affectation_id", id).order("created_at", desc=True).execute()
    data = clics.data or []
    return {
        "affectation_id": id,
        "total_clics": len(data),
        "total_demarre": sum(1 for c in data if c.get("statut") in ("Partial", "Completed")),
        "total_completed": sum(1 for c in data if c.get("statut") == "Completed"),
        "clics": data,
    }

@app.post("/admin/affectations/migrate-links")
async def migrate_affectation_links(request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    affectations = sb.table("affectations")\
        .select("id, survey_id, enquete_id, enqueteur_id, lien_questionnaire, lien_direct, enquetes(survey_id, survey_url), enqueteurs(token)")\
        .execute()
    base_url = str(request.base_url).rstrip('/')
    if base_url.startswith('http://') and 'localhost' not in base_url:
        base_url = 'https://' + base_url[7:]
    updated = 0
    survey_url_cache = {}

    for aff in affectations.data:
        aff_survey_id = aff.get("survey_id")
        enquete_survey_id = (aff.get("enquetes") or {}).get("survey_id")
        enqueteur_token = (aff.get("enqueteurs") or {}).get("token")
        is_individual = aff_survey_id and enquete_survey_id and aff_survey_id != enquete_survey_id

        if is_individual:
            if aff.get("lien_direct"):
                sb.table("affectations").update({"lien_questionnaire": aff["lien_direct"]})\
                    .eq("id", aff["id"]).execute()
                updated += 1
        else:
            updates = {"lien_questionnaire": f"{base_url}/r/{aff['id']}"}
            if aff_survey_id and enqueteur_token:
                cached_url = (aff.get("enquetes") or {}).get("survey_url", "")
                if not cached_url:
                    if aff_survey_id not in survey_url_cache:
                        survey_info = await fetch_survey_stats(aff_survey_id)
                        survey_url_cache[aff_survey_id] = (survey_info or {}).get("survey_url", "")
                    cached_url = survey_url_cache.get(aff_survey_id, "")
                if cached_url:
                    updates["lien_direct"] = f"{cached_url}?custom1={enqueteur_token}"
                else:
                    updates["lien_direct"] = f"https://hcakpo.questionpro.com/t/{aff_survey_id}?custom1={enqueteur_token}"
            sb.table("affectations").update(updates).eq("id", aff["id"]).execute()
            updated += 1

    return {"message": f"{updated} affectations mises à jour", "updated": updated}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - SEGMENTATIONS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/segmentations/by-enquete/{enquete_id}")
def get_segmentations_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    segs = sb.table("segmentations").select("*").eq("enquete_id", enquete_id).execute()
    # Enrichir avec les answer_options depuis la table answer_options
    for seg in segs.data:
        ao_res = sb.table("answer_options").select("id, valeur, valeur_display, qp_answer_id, position")\
            .eq("segmentation_id", seg["id"]).order("position").execute()
        seg["answer_options_list"] = ao_res.data
    return segs.data

@app.post("/admin/segmentations")
def create_segmentation(data: CreateSegmentation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Crée la segmentation + insère les answer_options comme lignes normalisées."""
    payload = {
        "enquete_id": data.enquete_id,
        "question_id": data.question_id,
        "question_text": data.question_text,
        "nom": data.nom,
        "answer_options": data.answer_options or [],  # on garde le JSONB pour compatibilité
    }
    res = sb.table("segmentations").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur création segmentation")

    seg_id = res.data[0]["id"]

    # Insérer les answer_options dans la table normalisée
    if data.answer_options:
        for i, opt in enumerate(data.answer_options):
            text = opt.get("text") or opt.get("value") or ""
            if not text.strip():
                continue
            normalized = normalize_segment_value(text)
            try:
                sb.table("answer_options").insert({
                    "segmentation_id": seg_id,
                    "qp_answer_id": str(opt.get("id", "")),
                    "valeur": normalized,
                    "valeur_display": text,
                    "position": i,
                }).execute()
            except Exception:
                pass  # UNIQUE violation = déjà présente

    return res.data[0]

@app.put("/admin/segmentations/{id}")
def update_segmentation(id: str, data: UpdateSegmentation, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnée")
    res = sb.table("segmentations").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/segmentations/{id}")
def delete_segmentation(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    sb.table("segmentations").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - QUOTAS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/quotas/by-segmentation/{segmentation_id}")
def get_quotas_by_segmentation(segmentation_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Quotas d'une segmentation avec completions agrégées (toute l'enquête)."""
    seg_info = sb.table("segmentations").select("id, enquete_id").eq("id", segmentation_id).execute()
    if not seg_info.data:
        return []
    enquete_id = seg_info.data[0]["enquete_id"]

    affectations = sb.table("affectations").select("id, objectif_total").eq("enquete_id", enquete_id).execute()
    objectif_total_enquete = sum(a.get("objectif_total") or 0 for a in affectations.data)
    aff_ids = [a["id"] for a in affectations.data]

    return compute_quotas_for_segmentation(sb, segmentation_id, objectif_total_enquete, aff_ids)

@app.get("/admin/quotas/by-enquete/{enquete_id}")
def get_quotas_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Tous les quotas d'une enquête groupés par segmentation."""
    segs = sb.table("segmentations").select("id, nom").eq("enquete_id", enquete_id).execute()
    if not segs.data:
        return []

    affectations = sb.table("affectations").select("id, objectif_total").eq("enquete_id", enquete_id).execute()
    objectif_total = sum(a.get("objectif_total") or 0 for a in affectations.data)

    result = []
    for seg in segs.data:
        seg_id = seg["id"]
        quotas_res = sb.table("quotas").select("id, answer_option_id, pourcentage")\
            .eq("segmentation_id", seg_id).is_("affectation_id", "null").execute()

        ao_ids = [q["answer_option_id"] for q in quotas_res.data if q.get("answer_option_id")]
        ao_labels = {}
        if ao_ids:
            ao_res = sb.table("answer_options").select("id, valeur").in_("id", ao_ids).execute()
            ao_labels = {ao["id"]: ao["valeur"] for ao in ao_res.data}

        quotas_liste = []
        total_pourcentage = 0
        for q in quotas_res.data:
            ao_id = q.get("answer_option_id")
            pct = q.get("pourcentage") or 0
            total_pourcentage += pct
            objectif = int(objectif_total * pct / 100)
            quotas_liste.append({
                "id": q["id"],
                "answer_option_id": ao_id,
                "segment_value": ao_labels.get(ao_id, ""),
                "pourcentage": pct,
                "objectif": objectif,
                "segmentation_id": seg_id,
            })
        quotas_liste.sort(key=lambda x: x["pourcentage"], reverse=True)

        result.append({
            "segmentation_id": seg_id,
            "segmentation_nom": seg["nom"],
            "quotas": quotas_liste,
            "total_pourcentage": total_pourcentage,
        })
    return result

@app.get("/admin/quotas/by-affectation/{affectation_id}")
def get_quotas_by_affectation(affectation_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Quotas applicables à une affectation (les quotas globaux de son enquête)."""
    aff = sb.table("affectations").select("enquete_id, objectif_total").eq("id", affectation_id).execute()
    if not aff.data:
        return []
    enquete_id = aff.data[0]["enquete_id"]
    objectif_total_aff = aff.data[0].get("objectif_total") or 0

    segs = sb.table("segmentations").select("id, nom").eq("enquete_id", enquete_id).execute()
    result = []
    for seg in segs.data:
        result.extend(compute_quotas_for_segmentation(sb, seg["id"], objectif_total_aff, [affectation_id]))
    return result

@app.post("/admin/quotas")
def create_quota(data: CreateQuota, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    ao_id = get_answer_option_id(sb, data.segmentation_id, data.segment_value)
    if not ao_id:
        # Créer l'answer_option si elle n'existe pas encore
        normalized = normalize_segment_value(data.segment_value)
        ao_res = sb.table("answer_options").insert({
            "segmentation_id": data.segmentation_id,
            "valeur": normalized,
            "valeur_display": data.segment_value,
        }).execute()
        ao_id = ao_res.data[0]["id"] if ao_res.data else None
        if not ao_id:
            raise HTTPException(status_code=400, detail="Impossible de créer l'answer_option")

    quota_data = {
        "enquete_id": data.enquete_id,
        "segmentation_id": data.segmentation_id,
        "answer_option_id": ao_id,
        "segment_value": normalize_segment_value(data.segment_value),
        "pourcentage": data.pourcentage,
    }
    res = sb.table("quotas").insert(quota_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur création quota")
    return {**res.data[0], "segment_value": normalize_segment_value(data.segment_value)}

@app.post("/admin/quotas/bulk")
def create_quotas_bulk(data: BulkQuotas, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Créer plusieurs quotas d'une segmentation en masse."""
    # Supprimer les quotas globaux existants pour cette segmentation
    sb.table("quotas").delete()\
        .eq("segmentation_id", data.segmentation_id)\
        .is_("affectation_id", "null").execute()

    # Déterminer l'enquête
    seg_info = sb.table("segmentations").select("enquete_id").eq("id", data.segmentation_id).execute()
    enquete_id = seg_info.data[0]["enquete_id"] if seg_info.data else data.enquete_id

    created = []
    for q in data.quotas:
        seg_val = q.get("segment_value", "")
        pourcentage = float(q.get("pourcentage", 0))
        if not seg_val.strip():
            continue

        ao_id = get_answer_option_id(sb, data.segmentation_id, seg_val)
        if not ao_id:
            # Créer l'answer_option si absente
            normalized = normalize_segment_value(seg_val)
            ao_res = sb.table("answer_options").insert({
                "segmentation_id": data.segmentation_id,
                "valeur": normalized,
                "valeur_display": seg_val,
            }).execute()
            ao_id = ao_res.data[0]["id"] if ao_res.data else None
        if not ao_id:
            continue

        res = sb.table("quotas").insert({
            "enquete_id": enquete_id,
            "segmentation_id": data.segmentation_id,
            "answer_option_id": ao_id,
            "segment_value": normalize_segment_value(seg_val),
            "pourcentage": pourcentage,
        }).execute()
        if res.data:
            created.append({**res.data[0], "segment_value": normalize_segment_value(seg_val)})

    return {"created": len(created), "quotas": created}

@app.put("/admin/quotas/{id}")
def update_quota(id: str, data: UpdateQuota, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnée")
    res = sb.table("quotas").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/quotas/{id}")
def delete_quota(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    sb.table("quotas").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - QUOTA GROUPS (quotas croisés)
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/quota-configs")
def create_quota_group(data: CreateQuotaGroup, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Créer un groupe de quotas croisés avec ses combinaisons.
    Accepte les combinations en format texte {nom_seg: valeur} OU UUID {seg_id: ao_id}.
    """
    grp_res = sb.table("quota_groups").insert({
        "enquete_id": data.enquete_id,
        "nom": data.nom,
    }).execute()
    if not grp_res.data:
        raise HTTPException(status_code=400, detail="Erreur création quota group")
    grp = grp_res.data[0]
    grp_id = grp["id"]

    for i, seg_id in enumerate(data.segmentation_ids):
        sb.table("quota_group_segmentations").insert({
            "quota_group_id": grp_id,
            "segmentation_id": seg_id,
            "position": i,
        }).execute()

    # Charger les segmentations pour convertir nom→seg_id (format texte)
    segs_info = sb.table("segmentations").select("id, nom")\
        .in_("id", data.segmentation_ids).execute()
    seg_by_nom = {s["nom"]: s["id"] for s in segs_info.data}
    # Aussi charger toutes les answer_options concernées
    ao_by_seg = load_answer_options_map(sb, data.segmentation_ids)

    for q in data.quotas:
        combination_raw = q.get("combination", {})
        pourcentage = float(q.get("pourcentage", 0))

        # Convertir {nom: valeur_text} → {seg_id: ao_id} si nécessaire
        combination_uuid = {}
        for key, val in combination_raw.items():
            # key peut être un nom de segmentation ou directement un seg_id UUID
            seg_id = seg_by_nom.get(key, key)
            # val peut être une valeur texte ou directement un ao_id UUID
            seg_ao_map = ao_by_seg.get(seg_id, {})
            ao_id = seg_ao_map.get(normalize_segment_value(str(val)), val)
            combination_uuid[seg_id] = ao_id

        try:
            sb.table("quota_group_combinations").insert({
                "quota_group_id": grp_id,
                "combination": combination_uuid,
                "pourcentage": pourcentage,
            }).execute()
        except Exception:
            pass

    return grp

@app.get("/admin/quota-configs/by-enquete/{enquete_id}")
def get_quota_groups_by_enquete(enquete_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Lister les quota groups avec leurs combinaisons et completions."""
    groups = sb.table("quota_groups").select("*").eq("enquete_id", enquete_id).execute()
    if not groups.data:
        return []

    affectations = sb.table("affectations").select("id, objectif_total").eq("enquete_id", enquete_id).execute()
    aff_ids = [a["id"] for a in affectations.data]
    objectif_total_enquete = sum(a.get("objectif_total") or 0 for a in affectations.data)

    result = []
    for grp in groups.data:
        grp_id = grp["id"]

        segs = sb.table("quota_group_segmentations")\
            .select("*, segmentations(id, nom, question_id)")\
            .eq("quota_group_id", grp_id).order("position").execute()

        combinations = sb.table("quota_group_combinations")\
            .select("id, combination, pourcentage")\
            .eq("quota_group_id", grp_id).execute()

        # Completions par combination_id agrégées sur toutes les affectations
        completions_map: Dict[str, int] = {}
        if aff_ids and combinations.data:
            comb_ids = [c["id"] for c in combinations.data]
            rc_res = sb.table("response_combinations")\
                .select("quota_group_combination_id, count")\
                .in_("affectation_id", aff_ids)\
                .in_("quota_group_combination_id", comb_ids)\
                .execute()
            for rc in rc_res.data:
                cid = rc["quota_group_combination_id"]
                completions_map[cid] = completions_map.get(cid, 0) + (rc.get("count") or 0)

        # Enrichir les combinaisons avec labels lisibles
        # Charger tous les answer_options concernés
        all_ao_ids = set()
        for c in combinations.data:
            for ao_id in (c.get("combination") or {}).values():
                all_ao_ids.add(ao_id)
        ao_labels: Dict[str, str] = {}
        if all_ao_ids:
            ao_res = sb.table("answer_options").select("id, valeur").in_("id", list(all_ao_ids)).execute()
            ao_labels = {ao["id"]: ao["valeur"] for ao in ao_res.data}

        quotas_enriched = []
        for c in combinations.data:
            pct = c.get("pourcentage") or 0
            objectif = int(objectif_total_enquete * pct / 100)
            completions = completions_map.get(c["id"], 0)
            # Label lisible de la combinaison
            combo_label = " × ".join(ao_labels.get(v, v) for v in (c.get("combination") or {}).values())
            quotas_enriched.append({
                **c,
                "label": combo_label,
                "objectif": objectif,
                "completions": completions,
                "progression": round(completions / objectif * 100, 1) if objectif > 0 else 0,
            })

        result.append({
            **grp,
            "questions": segs.data,
            "quotas": quotas_enriched,
            "objectif_total": objectif_total_enquete,
        })
    return result

@app.delete("/admin/quota-configs/{id}")
def delete_quota_group(id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    sb.table("quota_groups").delete().eq("id", id).execute()
    return {"ok": True}

@app.post("/admin/quota-configs/{config_id}/generate-combinations")
def generate_combinations(config_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Générer le produit cartésien des answer_options pour un quota group."""
    from itertools import product as itertools_product

    segs = sb.table("quota_group_segmentations")\
        .select("segmentation_id, position, segmentations(id, nom)")\
        .eq("quota_group_id", config_id).order("position").execute()

    if not segs.data:
        return {"combinations": []}

    axes = []
    for s in segs.data:
        seg = s.get("segmentations", {})
        seg_id = seg.get("id") or s["segmentation_id"]
        nom = seg.get("nom", "")
        ao_res = sb.table("answer_options").select("id, valeur").eq("segmentation_id", seg_id)\
            .order("position").execute()
        axes.append({"segmentation_id": seg_id, "nom": nom, "options": ao_res.data})

    if not axes or any(len(a["options"]) == 0 for a in axes):
        return {"combinations": []}

    combinations = []
    for combo in itertools_product(*[a["options"] for a in axes]):
        combination = {axes[i]["segmentation_id"]: combo[i]["id"] for i in range(len(axes))}
        label = " × ".join(combo[i]["valeur"] for i in range(len(axes)))
        combinations.append({"combination": combination, "label": label})

    return {"combinations": combinations, "axes": axes}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - QUESTIONPRO
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/questionpro/survey/{survey_id}")
async def get_survey_info(survey_id: str, admin: dict = Depends(require_admin)):
    stats = await fetch_survey_stats(survey_id)
    if not stats:
        raise HTTPException(status_code=404, detail="Survey introuvable")
    return stats

@app.get("/admin/questionpro/survey/{survey_id}/questions")
async def get_survey_questions(survey_id: str, admin: dict = Depends(require_admin)):
    return await fetch_survey_questions(survey_id)

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - SYNCHRONISATION
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/sync")
async def sync_all(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    affectations = sb.table("affectations")\
        .select("id, survey_id, enquete_id, enquetes!inner(statut)")\
        .eq("enquetes.statut", "en_cours").execute()

    responses_cache: dict = {}
    cache_lock = asyncio.Lock()
    semaphore = asyncio.Semaphore(5)

    async def sync_with_limit(aff):
        async with semaphore:
            return await sync_affectation(aff["id"], aff["survey_id"], sb, responses_cache, cache_lock)

    tasks = [sync_with_limit(aff) for aff in affectations.data]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    success = [r for r in results if not isinstance(r, Exception)]
    return {"synced": len(success), "errors": len(results) - len(success), "results": success}

@app.post("/admin/sync/{affectation_id}")
async def sync_one(affectation_id: str, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    aff = sb.table("affectations").select("id, survey_id").eq("id", affectation_id).execute()
    if not aff.data:
        raise HTTPException(status_code=404, detail="Affectation introuvable")
    return await sync_affectation(aff.data[0]["id"], aff.data[0]["survey_id"], sb)

async def sync_affectation(
    affectation_id: str, survey_id: str, sb: Client,
    responses_cache: dict = None, cache_lock=None
) -> dict:
    """Synchroniser une affectation — écrit dans response_counts (nouveau modèle)."""

    async def _fetch(sid):
        sid = str(sid)
        if responses_cache is None:
            return await fetch_survey_responses(sid)
        if sid not in responses_cache:
            async with cache_lock:
                if sid not in responses_cache:
                    responses_cache[sid] = await fetch_survey_responses(sid)
        return responses_cache[sid]

    # 1. Infos de l'affectation
    aff_info = sb.table("affectations")\
        .select("id, enquete_id, survey_id, enqueteur_id, enqueteurs(token, identifiant), enquetes(survey_id, survey_ids_historique, segmentation_question_id)")\
        .eq("id", affectation_id).execute()
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

    is_ancien_systeme = (survey_id_affectation and survey_id_enquete and
                         str(survey_id_affectation) != str(survey_id_enquete))
    is_fourre_tout = enqueteur_identifiant == "usr00015"
    target_survey_id = survey_id_enquete or survey_id_affectation

    # 2. Récupérer les réponses depuis QP
    STATUS_RANK = {"Completed": 3, "Partial": 2, "Started": 1}
    source_responses = []
    seen_response_ids: set = set()

    async def add_filtered(sid, token):
        if not sid or not token:
            return
        try:
            for r in await _fetch(sid):
                rid = str(r.get("responseID") or r.get("responseId") or "")
                if rid in seen_response_ids:
                    continue
                if r.get("customVariables", {}).get("custom1", "") == token:
                    seen_response_ids.add(rid)
                    source_responses.append(r)
        except Exception as e:
            print(f"[sync] Erreur fetch {sid}: {e}")

    async def add_all(sid):
        if not sid:
            return
        try:
            for r in await _fetch(sid):
                rid = str(r.get("responseID") or r.get("responseId") or "")
                if rid not in seen_response_ids:
                    seen_response_ids.add(rid)
                    source_responses.append(r)
        except Exception as e:
            print(f"[sync] Erreur fetch individuel {sid}: {e}")

    async def add_fourre_tout(sid, known_tokens):
        if not sid:
            return
        try:
            for r in await _fetch(sid):
                rid = str(r.get("responseID") or r.get("responseId") or "")
                if rid in seen_response_ids:
                    continue
                custom1 = r.get("customVariables", {}).get("custom1", "")
                if custom1 == enqueteur_token or custom1 not in known_tokens:
                    seen_response_ids.add(rid)
                    source_responses.append(r)
        except Exception as e:
            print(f"[sync] Erreur fetch fourre-tout {sid}: {e}")

    if is_ancien_systeme:
        await add_all(survey_id_affectation)

    if is_fourre_tout:
        other_tokens_res = sb.table("affectations")\
            .select("enqueteurs(token)")\
            .eq("enquete_id", enquete_id)\
            .neq("enqueteur_id", aff["enqueteur_id"]).execute()
        known_tokens = {(a.get("enqueteurs") or {}).get("token")
                        for a in other_tokens_res.data if (a.get("enqueteurs") or {}).get("token")}
        await add_fourre_tout(survey_id_enquete, known_tokens)
        for old_sid in survey_ids_historique:
            await add_fourre_tout(str(old_sid), known_tokens)
    else:
        await add_filtered(survey_id_enquete, enqueteur_token)
        for old_sid in survey_ids_historique:
            await add_filtered(str(old_sid), enqueteur_token)

    enqueteur_responses = [r for r in source_responses if r.get("responseStatus") == "Completed"]

    # 3. Mettre à jour les statuts de clics
    ip_status: Dict[str, str] = {}
    for r in source_responses:
        ip = r.get("ipAddress")
        status = r.get("responseStatus", "")
        if ip and STATUS_RANK.get(status, 0) > STATUS_RANK.get(ip_status.get(ip, ""), 0):
            ip_status[ip] = status

    if ip_status:
        existing_clics = sb.table("clics").select("ip_address, statut")\
            .eq("affectation_id", affectation_id).execute()
        existing_statuts = {c["ip_address"]: c.get("statut", "clique")
                            for c in (existing_clics.data or [])}
        for ip, status in ip_status.items():
            if STATUS_RANK.get(status, 0) >= STATUS_RANK.get(existing_statuts.get(ip, ""), 0):
                sb.table("clics").upsert({
                    "affectation_id": affectation_id,
                    "ip_address": ip,
                    "statut": status,
                }, on_conflict="affectation_id,ip_address").execute()

    clics_data = sb.table("clics").select("statut").eq("affectation_id", affectation_id).execute()
    clics_count = len(clics_data.data)
    demarre_count = sum(1 for c in clics_data.data if c.get("statut") in ("Partial", "Completed"))

    # 4. Charger les segmentations et leurs answer_options
    segmentations_list = []
    if enquete_id:
        seg_res = sb.table("segmentations")\
            .select("id, question_id, question_text, nom, answer_options")\
            .eq("enquete_id", enquete_id).execute()
        segmentations_list = seg_res.data or []

    if not segmentations_list and segmentation_question_id:
        segmentations_list = [{"id": None, "question_id": segmentation_question_id, "nom": "Segment"}]

    # 5. Charger les questions QP pour mapper answerID → texte
    answer_id_maps: Dict[str, Dict[int, str]] = {}
    target_questions = []
    target_sid = str(survey_id_affectation if is_ancien_systeme else (survey_id_enquete or survey_id_affectation))
    if segmentations_list:
        try:
            target_questions = await fetch_survey_questions(target_sid)
            for q in target_questions:
                aid_map: Dict[int, str] = {}
                for a in q.get("answers", []):
                    aid = a.get("id")
                    if aid:
                        try:
                            aid_map[int(aid)] = a.get("text", "")
                        except (ValueError, TypeError):
                            pass
                answer_id_maps[q["id"]] = aid_map
        except Exception as e:
            print(f"[sync] Erreur fetch questions {target_sid}: {e}")

    # Résolution question_id pour l'ancien système
    if is_ancien_systeme and segmentations_list and target_questions:
        indiv_qid_by_text = {q["text"].strip().lower(): q["id"] for q in target_questions}
        for seg in segmentations_list:
            seg_text = (seg.get("question_text") or seg.get("nom") or "").strip().lower()
            if seg_text in indiv_qid_by_text:
                seg["_resolved_qid"] = indiv_qid_by_text[seg_text]
            else:
                # Match par chevauchement des answer_options
                seg_options = {normalize_segment_value(o.get("text", "")).lower()
                               for o in (seg.get("answer_options") or []) if o.get("text")}
                if seg_options:
                    best_qid, best_overlap = None, 0
                    for q in target_questions:
                        q_options = {a["text"].strip().lower() for a in q.get("answers", [])}
                        overlap = len(seg_options & q_options)
                        if overlap > best_overlap:
                            best_overlap, best_qid = overlap, q["id"]
                    if best_overlap >= 2:
                        seg["_resolved_qid"] = best_qid

    # 6. Compter les réponses par segmentation
    seg_ids = [seg["id"] for seg in segmentations_list if seg.get("id")]
    ao_map = load_answer_options_map(sb, seg_ids)  # {seg_id: {valeur: ao_id}}

    # Pour chaque segmentation : {qid: {valeur: count}}
    segment_counts_by_seg: Dict[str, Dict[str, int]] = {}
    for seg in segmentations_list:
        seg_id = seg.get("id")
        qid = seg.get("_resolved_qid", seg["question_id"])
        aid_map = answer_id_maps.get(str(qid), {})
        seg_ao_map = ao_map.get(seg_id, {}) if seg_id else {}

        # Valeurs connues pour le fallback scan (exclure les clés __qp__)
        known_values_lower = {v.lower() for v in seg_ao_map.keys() if not v.startswith("__qp__")}

        counts: Dict[str, int] = {}
        for resp in enqueteur_responses:
            value = None
            # Priorité 1 : matching par qp_answer_id (robuste, insensible aux variations de texte)
            for question in resp.get("responseSet", []):
                if str(question.get("questionID", "")) == str(qid):
                    for ans in question.get("answerValues", []):
                        ans_id = ans.get("answerID")
                        if ans_id:
                            qp_key = f"__qp__{ans_id}"
                            if qp_key in seg_ao_map:
                                # Trouver la valeur texte correspondante
                                ao_id_direct = seg_ao_map[qp_key]
                                value = next((k for k, v in seg_ao_map.items()
                                              if v == ao_id_direct and not k.startswith("__qp__")), None)
                                break
                    break
            # Priorité 2 : matching par texte (normalize + alias)
            if not value:
                value = extract_segment_value_from_response(resp, qid, aid_map)
            # Priorité 3 : scan fallback sur toutes les questions
            if not value and known_values_lower:
                for question in resp.get("responseSet", []):
                    for ans in question.get("answerValues", []):
                        ans_text = normalize_segment_value((ans.get("answerText") or "").strip())
                        if ans_text and ans_text.lower() in known_values_lower:
                            value = ans_text
                            break
                    if value:
                        break
            if value:
                counts[value] = counts.get(value, 0) + 1

        if seg_id:
            segment_counts_by_seg[seg_id] = counts

    # 7. Écrire dans response_counts (nouveau modèle)
    # Supprimer les anciens compteurs de cette affectation pour les segmentations concernées
    if seg_ids:
        all_ao_ids_for_segs = []
        for seg_id in seg_ids:
            ao_res = sb.table("answer_options").select("id").eq("segmentation_id", seg_id).execute()
            all_ao_ids_for_segs.extend(ao["id"] for ao in ao_res.data)
        if all_ao_ids_for_segs:
            sb.table("response_counts").delete()\
                .eq("affectation_id", affectation_id)\
                .in_("answer_option_id", all_ao_ids_for_segs)\
                .execute()

    segment_counts_normalized: Dict[str, int] = {}
    for seg in segmentations_list:
        seg_id = seg.get("id")
        if not seg_id:
            continue
        counts = segment_counts_by_seg.get(seg_id, {})
        seg_ao_map = ao_map.get(seg_id, {})  # {valeur: ao_id}
        for val, count in counts.items():
            ao_id = seg_ao_map.get(val)
            if not ao_id:
                # Essayer avec normalisation (cas limite)
                ao_id = seg_ao_map.get(normalize_segment_value(val))
            if ao_id and count > 0:
                try:
                    sb.table("response_counts").upsert({
                        "affectation_id": affectation_id,
                        "answer_option_id": ao_id,
                        "count": count,
                        "updated_at": datetime.utcnow().isoformat(),
                    }, on_conflict="affectation_id,answer_option_id").execute()
                except Exception as e:
                    print(f"[sync] Erreur response_counts: {e}")
            segment_counts_normalized[val] = segment_counts_normalized.get(val, 0) + count

    completions_enqueteur = len(enqueteur_responses)

    # 8. Mettre à jour affectations
    sb.table("affectations").update({
        "completions_total": completions_enqueteur,
        "clics": clics_count,
        "demarre_total": demarre_count,
        "invalid_total": 0,
        "derniere_synchro": datetime.utcnow().isoformat(),
    }).eq("id", affectation_id).execute()

    # 9. Historique completions par date
    if enquete_id:
        daily_counts: Dict[str, int] = {}
        for resp in enqueteur_responses:
            utc_ts = resp.get("utctimestamp")
            if utc_ts:
                date = datetime.utcfromtimestamp(utc_ts).date().isoformat()
                daily_counts[date] = daily_counts.get(date, 0) + 1

        sb.table("historique_completions").delete().eq("affectation_id", affectation_id).execute()
        for date, count in daily_counts.items():
            sb.table("historique_completions").upsert({
                "date": date,
                "affectation_id": affectation_id,
                "enquete_id": enquete_id,
                "completions": count,
                "clics": 0,
            }, on_conflict="date,enquete_id,affectation_id").execute()

    # 10. Quotas croisés → response_combinations
    if enquete_id:
        quota_groups_res = sb.table("quota_groups").select("id").eq("enquete_id", enquete_id).execute()
        for grp in quota_groups_res.data:
            grp_id = grp["id"]

            grp_segs = sb.table("quota_group_segmentations")\
                .select("segmentation_id, position, segmentations(question_id, nom)")\
                .eq("quota_group_id", grp_id).order("position").execute()
            if not grp_segs.data:
                continue

            # Charger toutes les combinaisons du groupe
            grp_combos = sb.table("quota_group_combinations")\
                .select("id, combination")\
                .eq("quota_group_id", grp_id).execute()

            # Construire index de matching : combination_json → combo_id
            combo_index: Dict[str, str] = {}
            for c in grp_combos.data:
                key = json.dumps(c["combination"], sort_keys=True)
                combo_index[key] = c["id"]

            # Pour chaque réponse, extraire les valeurs de toutes les questions du groupe
            combo_counts: Dict[str, int] = {}
            for resp in enqueteur_responses:
                current_combo: Dict[str, str] = {}
                valid = True
                for gs in grp_segs.data:
                    seg = gs.get("segmentations", {})
                    seg_id = gs["segmentation_id"]
                    question_id = seg.get("question_id", "")
                    aid_map = answer_id_maps.get(str(question_id), {})
                    value = extract_segment_value_from_response(resp, question_id, aid_map)
                    if not value:
                        valid = False
                        break
                    # Convertir en ao_id
                    seg_ao_map = ao_map.get(seg_id, {})
                    ao_id = seg_ao_map.get(value) or seg_ao_map.get(normalize_segment_value(value))
                    if not ao_id:
                        valid = False
                        break
                    current_combo[seg_id] = ao_id

                if valid and current_combo:
                    combo_key = json.dumps(current_combo, sort_keys=True)
                    combo_counts[combo_key] = combo_counts.get(combo_key, 0) + 1

            # Supprimer les anciennes combinaisons pour ce groupe/affectation
            if grp_combos.data:
                sb.table("response_combinations").delete()\
                    .eq("affectation_id", affectation_id)\
                    .in_("quota_group_combination_id", [c["id"] for c in grp_combos.data])\
                    .execute()

            # Insérer les nouvelles
            for combo_key, count in combo_counts.items():
                combo_id = combo_index.get(combo_key)
                if combo_id and count > 0:
                    try:
                        sb.table("response_combinations").upsert({
                            "affectation_id": affectation_id,
                            "quota_group_combination_id": combo_id,
                            "count": count,
                            "updated_at": datetime.utcnow().isoformat(),
                        }, on_conflict="affectation_id,quota_group_combination_id").execute()
                    except Exception as e:
                        print(f"[sync] Erreur response_combinations: {e}")

    return {
        "affectation_id": affectation_id,
        "survey_id": survey_id,
        "completions": completions_enqueteur,
        "clics": clics_count,
        "segment_counts": segment_counts_normalized,
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - STATS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/stats-pays")
def get_stats_pays(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    res = sb.table("completions_pays").select("completions, objectif, pays(id, nom, code, quota)").execute()
    stats: Dict[str, dict] = {}
    for cp in res.data:
        pays = cp.get("pays", {})
        nom = pays.get("nom", "Inconnu")
        if nom not in stats:
            stats[nom] = {"pays": nom, "code": pays.get("code", ""), "completions": 0, "objectif": 0}
        stats[nom]["completions"] += cp.get("completions", 0)
        stats[nom]["objectif"] += cp.get("objectif", 0)
    result = sorted(stats.values(), key=lambda x: x["completions"], reverse=True)
    return result

@app.get("/admin/stats-segments")
def get_stats_segments(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Stats de completions par segment (depuis response_counts)."""
    rc_res = sb.table("response_counts").select("answer_option_id, count").execute()
    ao_ids = list({rc["answer_option_id"] for rc in rc_res.data})
    ao_labels: Dict[str, str] = {}
    if ao_ids:
        ao_res = sb.table("answer_options").select("id, valeur").in_("id", ao_ids).execute()
        ao_labels = {ao["id"]: ao["valeur"] for ao in ao_res.data}

    stats: Dict[str, dict] = {}
    for rc in rc_res.data:
        ao_id = rc["answer_option_id"]
        label = ao_labels.get(ao_id, ao_id)
        if label not in stats:
            stats[label] = {"segment": label, "completions": 0, "nb_affectations": 0}
        stats[label]["completions"] += rc.get("count") or 0
        stats[label]["nb_affectations"] += 1

    return sorted(stats.values(), key=lambda x: x["completions"], reverse=True)

@app.get("/admin/segmentations-stats")
def get_segmentations_stats(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    """Stats segmentations par enquête avec completions (depuis response_counts)."""
    enquetes = sb.table("enquetes").select("id, code, nom").execute()
    all_affectations = sb.table("affectations").select("id, enquete_id, objectif_total").execute()
    aff_by_enquete: Dict[str, list] = {}
    for a in all_affectations.data:
        aff_by_enquete.setdefault(a["enquete_id"], []).append(a)

    # Charger tous les response_counts en une fois
    all_aff_ids = [a["id"] for a in all_affectations.data]
    all_rc: Dict[str, list] = {}
    if all_aff_ids:
        rc_res = sb.table("response_counts").select("affectation_id, answer_option_id, count")\
            .in_("affectation_id", all_aff_ids).execute()
        for rc in rc_res.data:
            all_rc.setdefault(rc["affectation_id"], []).append(rc)

    result = []
    for enq in enquetes.data:
        enquete_id = enq["id"]
        affectations_enq = aff_by_enquete.get(enquete_id, [])
        objectif_total_enquete = sum(a.get("objectif_total") or 0 for a in affectations_enq)
        aff_ids = [a["id"] for a in affectations_enq]

        # Agréger response_counts par answer_option_id pour cette enquête
        rc_by_ao: Dict[str, int] = {}
        for aff_id in aff_ids:
            for rc in all_rc.get(aff_id, []):
                ao_id = rc["answer_option_id"]
                rc_by_ao[ao_id] = rc_by_ao.get(ao_id, 0) + (rc.get("count") or 0)

        segmentations = sb.table("segmentations").select("id, nom, question_text")\
            .eq("enquete_id", enquete_id).execute()

        enquete_segs = []
        for seg in segmentations.data:
            seg_id = seg["id"]
            quotas_res = sb.table("quotas").select("id, answer_option_id, pourcentage")\
                .eq("segmentation_id", seg_id).is_("affectation_id", "null").execute()

            ao_ids = [q["answer_option_id"] for q in quotas_res.data if q.get("answer_option_id")]
            if not ao_ids:
                continue
            ao_res = sb.table("answer_options").select("id, valeur").in_("id", ao_ids).execute()
            ao_labels_local = {ao["id"]: ao["valeur"] for ao in ao_res.data}

            quotas_liste = []
            for q in quotas_res.data:
                ao_id = q.get("answer_option_id")
                if not ao_id:
                    continue
                pourcentage = q.get("pourcentage") or 0
                objectif = int(objectif_total_enquete * pourcentage / 100)
                completions_brut = rc_by_ao.get(ao_id, 0)
                completions = min(completions_brut, objectif) if objectif > 0 else completions_brut
                quotas_liste.append({
                    "segment_value": ao_labels_local.get(ao_id, ""),
                    "pourcentage": pourcentage,
                    "objectif": objectif,
                    "valides": completions,
                })
            quotas_liste.sort(key=lambda x: x["pourcentage"], reverse=True)

            total_valides = min(sum(q["valides"] for q in quotas_liste), objectif_total_enquete)
            enquete_segs.append({
                "id": seg_id,
                "nom": seg["nom"],
                "question_text": seg.get("question_text", ""),
                "total_valides": total_valides,
                "total_objectif": objectif_total_enquete,
                "quotas": quotas_liste,
            })

        if enquete_segs:
            result.append({
                "enquete_id": enquete_id,
                "enquete_code": enq["code"],
                "enquete_nom": enq["nom"],
                "segmentations": enquete_segs,
            })
    return result

@app.get("/admin/pays")
def list_pays(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    return sb.table("pays").select("*, zones(*)").order("nom").execute().data

@app.get("/admin/zones")
def list_zones(admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    return sb.table("zones").select("*").execute().data

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES - ENQUETES DISPONIBLES ET DEMANDES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/enquetes/disponibles")
def list_enquetes_disponibles(sb: Client = Depends(get_supabase)):
    return sb.table("enquetes").select("id, nom, statut, description, cible").order("nom").execute().data

@app.post("/enqueteur/{enqueteur_id}/demandes")
def creer_demande(enqueteur_id: str, data: dict, sb: Client = Depends(get_supabase)):
    enquete_id = data.get("enquete_id")
    message = data.get("message", "")
    if not enquete_id:
        raise HTTPException(status_code=400, detail="enquete_id requis")
    enquete = sb.table("enquetes").select("id, statut").eq("id", enquete_id).execute()
    if not enquete.data:
        raise HTTPException(status_code=404, detail="Enquête non trouvée")
    existing_aff = sb.table("affectations").select("id")\
        .eq("enqueteur_id", enqueteur_id).eq("enquete_id", enquete_id).execute()
    if existing_aff.data:
        raise HTTPException(status_code=400, detail="Vous êtes déjà affecté à cette enquête")
    try:
        result = sb.table("demandes_affectation").upsert({
            "enqueteur_id": enqueteur_id,
            "enquete_id": enquete_id,
            "statut": "en_attente",
            "message": message,
            "updated_at": datetime.utcnow().isoformat(),
        }, on_conflict="enqueteur_id,enquete_id").execute()
        return {"message": "Demande envoyée", "demande": result.data[0] if result.data else {}}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/enqueteur/{enqueteur_id}/demandes")
def list_demandes_enqueteur(enqueteur_id: str, sb: Client = Depends(get_supabase)):
    return sb.table("demandes_affectation")\
        .select("id, statut, message, commentaire_admin, created_at, enquete_id, enquetes(id, nom, statut)")\
        .eq("enqueteur_id", enqueteur_id).order("created_at", desc=True).execute().data

@app.get("/admin/demandes")
def list_demandes_admin(statut: str = None, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    query = sb.table("demandes_affectation").select(
        "id, statut, message, commentaire_admin, created_at, updated_at, enqueteur_id, enquete_id, "
        "enqueteurs(id, nom, prenom, email), enquetes(id, nom, statut)"
    ).order("created_at", desc=True)
    if statut:
        query = query.eq("statut", statut)
    return query.execute().data

@app.put("/admin/demandes/{demande_id}/accepter")
async def accepter_demande(demande_id: str, request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    try:
        body = await request.json()
        commentaire = body.get("commentaire", "") if body else ""
        objectif_total = int(body.get("objectif_total", 0) or 0) if body else 0
    except Exception:
        commentaire = ""
        objectif_total = 0

    demande = sb.table("demandes_affectation").select("*").eq("id", demande_id).execute()
    if not demande.data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    d = demande.data[0]
    if d["statut"] != "en_attente":
        raise HTTPException(status_code=400, detail="Demande déjà traitée")

    existing = sb.table("affectations").select("id")\
        .eq("enqueteur_id", d["enqueteur_id"]).eq("enquete_id", d["enquete_id"]).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Enquêteur déjà affecté")

    enquete = sb.table("enquetes").select("*").eq("id", d["enquete_id"]).execute()
    enqueteur = sb.table("enqueteurs").select("*").eq("id", d["enqueteur_id"]).execute()
    if not enquete.data or not enqueteur.data:
        raise HTTPException(status_code=404, detail="Enquête ou enquêteur introuvable")

    enq = enquete.data[0]
    enqueteur_data = enqueteur.data[0]
    survey_id = enq["survey_id"]
    token = enqueteur_data.get("token", "")
    lien_direct = f"https://hcakpo.questionpro.com/t/{survey_id}?custom1={token}"

    aff_result = sb.table("affectations").insert({
        "enqueteur_id": d["enqueteur_id"],
        "enquete_id": d["enquete_id"],
        "survey_id": survey_id,
        "lien_direct": lien_direct,
        "objectif_total": objectif_total,
        "completions_total": 0,
        "clics": 0,
        "statut": "en_cours",
    }).execute()
    if not aff_result.data:
        raise HTTPException(status_code=500, detail="Erreur création affectation")

    aff_id = aff_result.data[0]["id"]
    sb.table("affectations").update({"lien_questionnaire": f"{settings.BACKEND_URL}/r/{aff_id}"})\
        .eq("id", aff_id).execute()
    sb.table("demandes_affectation").update({
        "statut": "acceptee",
        "commentaire_admin": commentaire,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", demande_id).execute()
    return {"message": "Demande acceptée, affectation créée", "affectation_id": aff_id}

@app.put("/admin/demandes/{demande_id}/refuser")
async def refuser_demande(demande_id: str, request: Request, admin: dict = Depends(require_admin), sb: Client = Depends(get_supabase)):
    try:
        body = await request.json()
        commentaire = body.get("commentaire", "") if body else ""
    except Exception:
        commentaire = ""
    demande = sb.table("demandes_affectation").select("id, statut").eq("id", demande_id).execute()
    if not demande.data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    if demande.data[0]["statut"] != "en_attente":
        raise HTTPException(status_code=400, detail="Demande déjà traitée")
    sb.table("demandes_affectation").update({
        "statut": "refusee",
        "commentaire_admin": commentaire,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", demande_id).execute()
    return {"message": "Demande refusée"}

# ══════════════════════════════════════════════════════════════════════════════
# HISTORIQUE
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/historique")
def get_historique_global(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: int = 30,
    admin: dict = Depends(require_admin),
    sb: Client = Depends(get_supabase)
):
    from datetime import timedelta
    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    if not to_date:
        to_date = datetime.utcnow().date().isoformat()

    rows = sb.table("historique_completions").select("date, completions, clics")\
        .gte("date", from_date).lte("date", to_date).order("date").execute()

    daily: Dict[str, dict] = {}
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
    from datetime import timedelta
    if not from_date:
        from_date = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    if not to_date:
        to_date = datetime.utcnow().date().isoformat()

    rows = sb.table("historique_completions").select("date, completions, clics")\
        .eq("enquete_id", enquete_id)\
        .gte("date", from_date).lte("date", to_date).order("date").execute()

    daily: Dict[str, dict] = {}
    for r in rows.data:
        d = r["date"]
        if d not in daily:
            daily[d] = {"date": d, "completions": 0, "clics": 0}
        daily[d]["completions"] += r.get("completions") or 0
        daily[d]["clics"] += r.get("clics") or 0
    return sorted(daily.values(), key=lambda x: x["date"])
