from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import httpx
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client

# Charger les variables d'environnement
load_dotenv()

app = FastAPI(title="Suivi Enqueteurs API v3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
QUESTIONPRO_API_KEY = os.environ.get("QUESTIONPRO_API_KEY", "")
QUESTIONPRO_BASE_URL = "https://api.questionpro.com/a/api/v2"

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

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
    telephone: Optional[str] = None
    reseau_mobile: Optional[str] = None
    mode_remuneration: Optional[str] = None
    mot_de_passe: str = "1234"

class UpdateEnqueteur(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    telephone: Optional[str] = None
    reseau_mobile: Optional[str] = None
    mode_remuneration: Optional[str] = None
    mot_de_passe: Optional[str] = None
    actif: Optional[bool] = None

# ══════════════════════════════════════════════════════════════════════════════
# FONCTIONS QUESTIONPRO
# ══════════════════════════════════════════════════════════════════════════════

async def fetch_survey_stats(survey_id: str) -> dict:
    """Recuperer les stats d'un survey QuestionPro"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}",
            headers={"api-key": QUESTIONPRO_API_KEY}
        )
        if response.status_code != 200:
            return None
        data = response.json()
        survey = data.get("response", {})
        return {
            "completions": survey.get("completedResponses", 0),
            "clics": survey.get("viewedResponses", 0),
            "started": survey.get("startedResponses", 0),
        }

async def fetch_survey_responses(survey_id: str, page: int = 1, per_page: int = 100) -> list:
    """Recuperer les reponses d'un survey QuestionPro"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(
            f"{QUESTIONPRO_BASE_URL}/surveys/{survey_id}/responses",
            params={"page": page, "perPage": per_page},
            headers={"api-key": QUESTIONPRO_API_KEY}
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
    sb.table("enqueteurs").update({
        "derniere_connexion": datetime.utcnow().isoformat()
    }).eq("id", enq["id"]).execute()

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
        "affectations": affectations.data
    }

@app.get("/enqueteur/{id}")
def get_enqueteur(id: str, sb: Client = Depends(get_supabase)):
    """Recuperer un enqueteur avec ses affectations et completions par pays"""
    res = sb.table("enqueteurs").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")
    enq = res.data[0]

    affectations = sb.table("affectations")\
        .select("*, enquetes(*)")\
        .eq("enqueteur_id", enq["id"])\
        .execute()

    # Ajouter les completions_pays pour chaque affectation
    for aff in affectations.data:
        completions_pays = sb.table("completions_pays")\
            .select("*, pays(*)")\
            .eq("affectation_id", aff["id"])\
            .execute()
        aff["completions_pays"] = completions_pays.data

    return {**enq, "affectations": affectations.data}

@app.get("/enqueteur/{id}/affectation/{affectation_id}/pays")
def get_completions_pays(id: str, affectation_id: str, sb: Client = Depends(get_supabase)):
    """Recuperer les completions par pays pour une affectation"""
    res = sb.table("completions_pays")\
        .select("*, pays(*)")\
        .eq("affectation_id", affectation_id)\
        .execute()
    return res.data

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
def get_dashboard(sb: Client = Depends(get_supabase)):
    """Stats globales"""
    enquetes = sb.table("enquetes").select("id, code, nom, statut").execute()
    enqueteurs = sb.table("enqueteurs").select("id, actif").execute()
    affectations = sb.table("affectations").select("objectif_total, completions_total, clics, statut").execute()

    total_objectif = sum(a["objectif_total"] for a in affectations.data)
    total_completions = sum(a["completions_total"] for a in affectations.data)
    total_clics = sum(a["clics"] for a in affectations.data)

    return {
        "nb_enquetes": len(enquetes.data),
        "nb_enquetes_en_cours": len([e for e in enquetes.data if e["statut"] == "en_cours"]),
        "nb_enqueteurs": len(enqueteurs.data),
        "nb_enqueteurs_actifs": len([e for e in enqueteurs.data if e.get("actif", True)]),
        "nb_affectations": len(affectations.data),
        "total_objectif": total_objectif,
        "total_clics": total_clics,
        "total_completions": total_completions,
        "taux_completion": round((total_completions / total_objectif * 100), 1) if total_objectif > 0 else 0
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enquetes")
def list_enquetes(sb: Client = Depends(get_supabase)):
    """Liste des enquetes avec stats"""
    enquetes = sb.table("enquetes").select("*").order("code").execute()
    result = []

    for enq in enquetes.data:
        affectations = sb.table("affectations")\
            .select("objectif_total, completions_total, clics")\
            .eq("enquete_id", enq["id"])\
            .execute()

        total_objectif = sum(a["objectif_total"] for a in affectations.data)
        total_completions = sum(a["completions_total"] for a in affectations.data)
        total_clics = sum(a["clics"] for a in affectations.data)

        result.append({
            **enq,
            "nb_enqueteurs": len(affectations.data),
            "total_objectif": total_objectif,
            "total_clics": total_clics,
            "total_completions": total_completions
        })

    return result

@app.get("/admin/enquetes/{id}")
def get_enquete(id: str, sb: Client = Depends(get_supabase)):
    """Detail d'une enquete"""
    res = sb.table("enquetes").select("*").eq("id", id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Enquete introuvable")

    affectations = sb.table("affectations")\
        .select("*, enqueteurs(*)")\
        .eq("enquete_id", id)\
        .execute()

    return {**res.data[0], "affectations": affectations.data}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - ENQUETEURS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/enqueteurs")
def list_enqueteurs(sb: Client = Depends(get_supabase)):
    """Liste des enqueteurs avec stats"""
    enqueteurs = sb.table("enqueteurs").select("*").order("identifiant").execute()
    result = []

    for enq in enqueteurs.data:
        affectations = sb.table("affectations")\
            .select("objectif_total, completions_total, clics, enquetes(code, nom)")\
            .eq("enqueteur_id", enq["id"])\
            .execute()

        total_objectif = sum(a["objectif_total"] for a in affectations.data)
        total_completions = sum(a["completions_total"] for a in affectations.data)
        total_clics = sum(a["clics"] for a in affectations.data)

        result.append({
            **enq,
            "nb_enquetes": len(affectations.data),
            "total_objectif": total_objectif,
            "total_clics": total_clics,
            "total_completions": total_completions,
            "enquetes": [a["enquetes"] for a in affectations.data]
        })

    return result

@app.post("/admin/enqueteurs")
def create_enqueteur(data: CreateEnqueteur, sb: Client = Depends(get_supabase)):
    res = sb.table("enqueteurs").insert(data.dict()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erreur creation enqueteur")
    return res.data[0]

@app.put("/admin/enqueteurs/{id}")
def update_enqueteur(id: str, data: UpdateEnqueteur, sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("enqueteurs").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

@app.delete("/admin/enqueteurs/{id}")
def delete_enqueteur(id: str, sb: Client = Depends(get_supabase)):
    sb.table("enqueteurs").delete().eq("id", id).execute()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - AFFECTATIONS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/affectations/by-enquete/{enquete_id}")
def list_affectations_by_enquete(enquete_id: str, sb: Client = Depends(get_supabase)):
    res = sb.table("affectations")\
        .select("*, enqueteurs(*)")\
        .eq("enquete_id", enquete_id)\
        .execute()
    return res.data

@app.put("/admin/affectations/{id}")
def update_affectation(id: str, data: UpdateAffectation, sb: Client = Depends(get_supabase)):
    payload = {k: v for k, v in data.dict().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="Aucune donnee")
    res = sb.table("affectations").update(payload).eq("id", id).execute()
    return res.data[0] if res.data else {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN - SYNCHRONISATION QUESTIONPRO
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/sync")
async def sync_all(sb: Client = Depends(get_supabase)):
    """Synchroniser toutes les affectations avec QuestionPro"""
    affectations = sb.table("affectations").select("id, survey_id").execute()
    results = []

    for aff in affectations.data:
        result = await sync_affectation(aff["id"], aff["survey_id"], sb)
        results.append(result)

    return {"synced": len(results), "results": results}

@app.post("/admin/sync/{affectation_id}")
async def sync_one(affectation_id: str, sb: Client = Depends(get_supabase)):
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

    # 2. Mettre a jour l'affectation
    sb.table("affectations").update({
        "completions_total": stats["completions"],
        "clics": stats["clics"],
        "derniere_synchro": datetime.utcnow().isoformat()
    }).eq("id", affectation_id).execute()

    # 3. Recuperer les reponses pour compter par pays
    responses = await fetch_survey_responses(survey_id)
    pays_counts = {}

    for resp in responses:
        if resp.get("responseStatus") == "Completed":
            country = extract_country_from_response(resp)
            pays_counts[country] = pays_counts.get(country, 0) + 1

    # 4. Mettre a jour completions_pays
    pays_list = sb.table("pays").select("id, nom").execute()
    pays_map = {p["nom"]: p["id"] for p in pays_list.data}

    for pays_nom, count in pays_counts.items():
        # Trouver le pays_id correspondant
        pays_id = None
        for db_nom, db_id in pays_map.items():
            if pays_nom.lower() in db_nom.lower() or db_nom.lower() in pays_nom.lower():
                pays_id = db_id
                break

        if pays_id:
            sb.table("completions_pays").update({
                "completions": count
            }).eq("affectation_id", affectation_id).eq("pays_id", pays_id).execute()

    return {
        "affectation_id": affectation_id,
        "survey_id": survey_id,
        "completions": stats["completions"],
        "clics": stats["clics"],
        "pays_counts": pays_counts
    }

# ══════════════════════════════════════════════════════════════════════════════
# ROUTES PAYS & ZONES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/admin/pays")
def list_pays(sb: Client = Depends(get_supabase)):
    """Liste des pays avec zones"""
    res = sb.table("pays").select("*, zones(*)").order("nom").execute()
    return res.data

@app.get("/admin/zones")
def list_zones(sb: Client = Depends(get_supabase)):
    """Liste des zones"""
    res = sb.table("zones").select("*").execute()
    return res.data

# ══════════════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    return {"status": "ok", "version": "3.0"}

@app.get("/")
def root():
    return {"message": "Suivi Enqueteurs API v3", "docs": "/docs"}
