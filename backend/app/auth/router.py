"""
Routes d'authentification
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from supabase import Client

from ..config import settings
from .security import (
    hash_code,
    verify_code,
    generate_otp,
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
    generate_password,
    generate_invitation_token,
    generate_token,
)
from .email import send_otp_email, send_welcome_email, send_password_reset_email

router = APIRouter(prefix="/auth", tags=["Authentification"])


# ══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RequestOTPRequest(BaseModel):
    email: EmailStr


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    code: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class SetupPasswordRequest(BaseModel):
    token: str
    password: str


class SendInvitationRequest(BaseModel):
    enqueteur_id: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nom: str
    prenom: str
    telephone: str = ""


class RequestProfileOTPRequest(BaseModel):
    """Demander un OTP pour modifier le profil"""
    pass  # Utilise l'utilisateur connecte


class UpdateProfileRequest(BaseModel):
    """Modifier le profil apres validation OTP"""
    code: str
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    reseau_mobile: Optional[str] = None
    mode_remuneration: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
    requires_password_change: bool = False


class UserResponse(BaseModel):
    id: str
    email: str
    nom: str
    prenom: str
    token: str
    is_admin: bool
    role: str = "enqueteur"


# ══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY: Supabase Client (Singleton)
# ══════════════════════════════════════════════════════════════════════════════

_supabase_client: Client = None

def get_supabase() -> Client:
    """Retourne une connexion Supabase singleton (evite de recreer a chaque requete)"""
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase_client


# ══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY: Current User
# ══════════════════════════════════════════════════════════════════════════════

async def get_current_user(
    authorization: Optional[str] = Header(None),
    sb: Client = Depends(get_supabase)
) -> dict:
    """Extraire et valider l'utilisateur courant depuis le token JWT"""

    if not authorization:
        raise HTTPException(status_code=401, detail="Token manquant")

    # Extraire le token du header "Bearer <token>"
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Schema d'authentification invalide")
    except ValueError:
        raise HTTPException(status_code=401, detail="Header Authorization invalide")

    # Decoder le token
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalide ou expire")

    # Recuperer l'utilisateur
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide")

    res = sb.table("enqueteurs").select("*").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")

    user = res.data[0]
    if not user.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte desactive")

    return user


# ══════════════════════════════════════════════════════════════════════════════
# DEPENDENCY: Require Admin
# ══════════════════════════════════════════════════════════════════════════════

async def require_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Verifier que l'utilisateur est un administrateur (admin ou super_admin)"""
    role = current_user.get("role", "enqueteur")
    is_admin = current_user.get("is_admin", False)

    # Compatibilite: is_admin=True OU role in ['admin', 'super_admin']
    if not is_admin and role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=403,
            detail="Acces reserve aux administrateurs"
        )

    return current_user


async def require_super_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Verifier que l'utilisateur est un super administrateur"""
    role = current_user.get("role", "enqueteur")

    if role != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Acces reserve aux super administrateurs"
        )

    return current_user


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/request-otp")
async def request_otp(data: RequestOTPRequest, sb: Client = Depends(get_supabase)):
    """
    Demander un code OTP par email

    1. Verifier que l'email existe
    2. Generer un code OTP
    3. Sauvegarder le hash du code
    4. Envoyer le code par email
    """
    email = data.email.lower().strip()

    # Verifier que l'utilisateur existe
    res = sb.table("enqueteurs").select("id, email, prenom, actif").eq("email", email).execute()

    if not res.data:
        # Ne pas reveler si l'email existe ou non (securite)
        # Mais on peut choisir de le faire pour une meilleure UX
        raise HTTPException(status_code=404, detail="Aucun compte associe a cet email")

    user = res.data[0]

    if not user.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte desactive")

    # Verifier le rate limiting (max OTP par periode)
    recent_codes = sb.table("otp_codes")\
        .select("id")\
        .eq("email", email)\
        .gte("created_at", (datetime.utcnow() - timedelta(minutes=15)).isoformat())\
        .execute()

    if len(recent_codes.data) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Trop de demandes. Veuillez attendre 15 minutes."
        )

    # Generer le code OTP
    code = generate_otp(settings.OTP_LENGTH)
    code_hash = hash_code(code)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    # Invalider les anciens codes non utilises
    sb.table("otp_codes")\
        .update({"used": True})\
        .eq("email", email)\
        .eq("used", False)\
        .execute()

    # Sauvegarder le nouveau code
    sb.table("otp_codes").insert({
        "email": email,
        "code_hash": code_hash,
        "expires_at": expires_at.isoformat(),
        "attempts": 0,
        "used": False
    }).execute()

    # Envoyer l'email
    email_sent = send_otp_email(email, code, user.get("prenom", ""))

    if not email_sent:
        raise HTTPException(status_code=500, detail="Erreur lors de l'envoi de l'email")

    return {
        "message": "Code envoye par email",
        "expires_in": settings.OTP_EXPIRE_MINUTES * 60
    }


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(data: VerifyOTPRequest, sb: Client = Depends(get_supabase)):
    """
    Verifier le code OTP et retourner un JWT token

    1. Verifier le code OTP
    2. Creer un JWT token
    3. Mettre a jour la derniere connexion
    """
    email = data.email.lower().strip()
    code = data.code.strip()

    # Recuperer le code OTP le plus recent non utilise
    res = sb.table("otp_codes")\
        .select("*")\
        .eq("email", email)\
        .eq("used", False)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Aucun code en attente")

    otp_record = res.data[0]

    # Verifier l'expiration
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace("Z", "+00:00"))
    if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
        # Marquer comme utilise
        sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()
        raise HTTPException(status_code=400, detail="Code expire")

    # Verifier le nombre de tentatives
    attempts = otp_record.get("attempts", 0)
    if attempts >= settings.OTP_MAX_ATTEMPTS:
        sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()
        raise HTTPException(status_code=400, detail="Trop de tentatives. Demandez un nouveau code.")

    # Verifier le code
    if not verify_code(code, otp_record["code_hash"]):
        # Incrementer les tentatives
        sb.table("otp_codes")\
            .update({"attempts": attempts + 1})\
            .eq("id", otp_record["id"])\
            .execute()

        remaining = settings.OTP_MAX_ATTEMPTS - attempts - 1
        raise HTTPException(
            status_code=400,
            detail=f"Code incorrect. {remaining} tentative(s) restante(s)."
        )

    # Code valide - marquer comme utilise
    sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()

    # Recuperer l'utilisateur
    user_res = sb.table("enqueteurs").select("*").eq("email", email).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user = user_res.data[0]

    # Mettre a jour la derniere connexion et marquer le compte comme configure
    sb.table("enqueteurs")\
        .update({
            "derniere_connexion": datetime.utcnow().isoformat(),
            "compte_configure": True
        })\
        .eq("id", user["id"])\
        .execute()

    # Creer le token JWT
    token_data = {
        "sub": user["id"],
        "email": user["email"],
        "is_admin": user.get("is_admin", False),
        "role": user.get("role", "enqueteur")
    }
    access_token = create_access_token(token_data)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
        user={
            "id": user["id"],
            "email": user["email"],
            "nom": user["nom"],
            "prenom": user["prenom"],
            "token": user.get("token", ""),
            "is_admin": user.get("is_admin", False),
            "role": user.get("role", "enqueteur")
        }
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Recuperer les informations de l'utilisateur connecte"""
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        nom=current_user["nom"],
        prenom=current_user["prenom"],
        token=current_user.get("token", ""),
        is_admin=current_user.get("is_admin", False),
        role=current_user.get("role", "enqueteur")
    )


@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Deconnexion

    Note: Avec JWT stateless, on ne peut pas vraiment invalider le token cote serveur.
    Le frontend doit supprimer le token de son storage.
    Pour une vraie invalidation, il faudrait une blacklist de tokens (Redis).
    """
    return {"message": "Deconnexion reussie"}


@router.post("/login")
async def login(data: LoginRequest, sb: Client = Depends(get_supabase)):
    """
    Connexion avec email et mot de passe

    - Si premiere connexion (compte_configure = false) → envoie OTP
    - Si compte deja valide → connexion directe avec JWT
    """
    email = data.email.lower().strip()

    # Verifier que l'utilisateur existe
    res = sb.table("enqueteurs").select("*").eq("email", email).execute()

    if not res.data:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    user = res.data[0]

    if not user.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte desactive")

    # Verifier le mot de passe
    stored_password = user.get("mot_de_passe")
    if not stored_password:
        raise HTTPException(status_code=401, detail="Mot de passe non configure")

    if not verify_password(data.password, stored_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    # Si compte deja configure → connexion directe
    if user.get("compte_configure", False):
        # Mettre a jour la derniere connexion
        sb.table("enqueteurs")\
            .update({"derniere_connexion": datetime.utcnow().isoformat()})\
            .eq("id", user["id"])\
            .execute()

        # Creer le token JWT
        token_data = {
            "sub": user["id"],
            "email": user["email"],
            "is_admin": user.get("is_admin", False),
            "role": user.get("role", "enqueteur")
        }
        access_token = create_access_token(token_data)

        return {
            "status": "authenticated",
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_EXPIRE_MINUTES * 60,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "nom": user["nom"],
                "prenom": user["prenom"],
                "token": user.get("token", ""),
                "is_admin": user.get("is_admin", False),
                "role": user.get("role", "enqueteur")
            }
        }

    # Premiere connexion → envoyer OTP
    # Verifier le rate limiting
    recent_codes = sb.table("otp_codes")\
        .select("id")\
        .eq("email", email)\
        .gte("created_at", (datetime.utcnow() - timedelta(minutes=15)).isoformat())\
        .execute()

    if len(recent_codes.data) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Trop de demandes. Veuillez attendre 15 minutes."
        )

    # Generer le code OTP
    code = generate_otp(settings.OTP_LENGTH)
    code_hash = hash_code(code)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    # Invalider les anciens codes
    sb.table("otp_codes")\
        .update({"used": True})\
        .eq("email", email)\
        .eq("used", False)\
        .execute()

    # Sauvegarder le nouveau code
    sb.table("otp_codes").insert({
        "email": email,
        "code_hash": code_hash,
        "expires_at": expires_at.isoformat(),
        "attempts": 0,
        "used": False
    }).execute()

    # Envoyer l'email
    email_sent = send_otp_email(email, code, user.get("prenom", ""))

    if not email_sent:
        raise HTTPException(status_code=500, detail="Erreur lors de l'envoi de l'email")

    return {
        "status": "otp_required",
        "message": "Code de verification envoye par email",
        "expires_in": settings.OTP_EXPIRE_MINUTES * 60
    }


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    sb: Client = Depends(get_supabase)
):
    """
    Changer le mot de passe de l'utilisateur connecte

    1. Verifier le mot de passe actuel
    2. Valider le nouveau mot de passe
    3. Mettre a jour le mot de passe
    4. Mettre doit_changer_mdp a False
    """
    # Verifier le mot de passe actuel
    stored_password = current_user.get("mot_de_passe")
    if not stored_password:
        raise HTTPException(status_code=400, detail="Mot de passe non configure")

    if not verify_password(data.current_password, stored_password):
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect")

    # Valider le nouveau mot de passe
    new_password = data.new_password.strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")

    if new_password == data.current_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit etre different de l'ancien")

    # Hasher et sauvegarder le nouveau mot de passe
    hashed_password = hash_password(new_password)

    sb.table("enqueteurs")\
        .update({
            "mot_de_passe": hashed_password,
            "doit_changer_mdp": False
        })\
        .eq("id", current_user["id"])\
        .execute()

    return {"message": "Mot de passe modifie avec succes"}


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, sb: Client = Depends(get_supabase)):
    """
    Demander un code de verification pour reinitialiser le mot de passe

    1. Verifier que l'email existe
    2. Envoyer un code OTP par email
    """
    email = data.email.lower().strip()

    # Verifier que l'utilisateur existe
    res = sb.table("enqueteurs").select("id, email, prenom, actif").eq("email", email).execute()

    if not res.data:
        # Pour des raisons de securite, ne pas reveler si l'email existe
        return {"message": "Si cet email existe, un code de verification a ete envoye"}

    user = res.data[0]

    if not user.get("actif", True):
        return {"message": "Si cet email existe, un code de verification a ete envoye"}

    # Verifier le rate limiting
    recent_codes = sb.table("otp_codes")\
        .select("id")\
        .eq("email", email)\
        .gte("created_at", (datetime.utcnow() - timedelta(minutes=15)).isoformat())\
        .execute()

    if len(recent_codes.data) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Trop de demandes. Veuillez attendre 15 minutes."
        )

    # Generer le code OTP
    code = generate_otp(settings.OTP_LENGTH)
    code_hash = hash_code(code)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    # Invalider les anciens codes
    sb.table("otp_codes")\
        .update({"used": True})\
        .eq("email", email)\
        .eq("used", False)\
        .execute()

    # Sauvegarder le nouveau code
    sb.table("otp_codes").insert({
        "email": email,
        "code_hash": code_hash,
        "expires_at": expires_at.isoformat(),
        "attempts": 0,
        "used": False
    }).execute()

    # Envoyer l'email
    email_sent = send_otp_email(email, code, user.get("prenom", ""))

    if not email_sent:
        raise HTTPException(status_code=500, detail="Erreur lors de l'envoi de l'email")

    return {
        "message": "Code de verification envoye par email",
        "expires_in": settings.OTP_EXPIRE_MINUTES * 60
    }


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, sb: Client = Depends(get_supabase)):
    """
    Reinitialiser le mot de passe avec un code OTP

    1. Verifier le code OTP
    2. Valider le nouveau mot de passe
    3. Mettre a jour le mot de passe
    """
    email = data.email.lower().strip()
    code = data.code.strip()
    new_password = data.new_password.strip()

    # Valider le nouveau mot de passe
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")

    # Recuperer le code OTP le plus recent
    res = sb.table("otp_codes")\
        .select("*")\
        .eq("email", email)\
        .eq("used", False)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Aucun code en attente")

    otp_record = res.data[0]

    # Verifier l'expiration
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace("Z", "+00:00"))
    if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
        sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()
        raise HTTPException(status_code=400, detail="Code expire")

    # Verifier le nombre de tentatives
    attempts = otp_record.get("attempts", 0)
    if attempts >= settings.OTP_MAX_ATTEMPTS:
        sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()
        raise HTTPException(status_code=400, detail="Trop de tentatives. Demandez un nouveau code.")

    # Verifier le code
    if not verify_code(code, otp_record["code_hash"]):
        sb.table("otp_codes")\
            .update({"attempts": attempts + 1})\
            .eq("id", otp_record["id"])\
            .execute()

        remaining = settings.OTP_MAX_ATTEMPTS - attempts - 1
        raise HTTPException(
            status_code=400,
            detail=f"Code incorrect. {remaining} tentative(s) restante(s)."
        )

    # Code valide - marquer comme utilise
    sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()

    # Recuperer l'utilisateur
    user_res = sb.table("enqueteurs").select("id").eq("email", email).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    user = user_res.data[0]

    # Hasher et sauvegarder le nouveau mot de passe
    hashed_password = hash_password(new_password)

    sb.table("enqueteurs")\
        .update({"mot_de_passe": hashed_password})\
        .eq("id", user["id"])\
        .execute()

    return {"message": "Mot de passe modifie avec succes"}


@router.post("/setup-password")
async def setup_password(data: SetupPasswordRequest, sb: Client = Depends(get_supabase)):
    """
    Configurer le mot de passe lors de l'activation du compte

    1. Verifier le token d'invitation
    2. Valider le mot de passe
    3. Sauvegarder le mot de passe
    4. Marquer le compte comme configure
    """
    token = data.token.strip()
    password = data.password.strip()

    # Valider le mot de passe
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")

    # Verifier le token d'invitation
    res = sb.table("invitation_tokens")\
        .select("*, enqueteurs(*)")\
        .eq("token", token)\
        .eq("used", False)\
        .execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Lien d'activation invalide ou expire")

    invitation = res.data[0]
    enqueteur = invitation.get("enqueteurs")

    if not enqueteur:
        raise HTTPException(status_code=400, detail="Utilisateur introuvable")

    # Verifier l'expiration
    expires_at = datetime.fromisoformat(invitation["expires_at"].replace("Z", "+00:00"))
    if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
        sb.table("invitation_tokens").update({"used": True}).eq("id", invitation["id"]).execute()
        raise HTTPException(status_code=400, detail="Lien d'activation expire. Contactez l'administrateur.")

    # Hasher et sauvegarder le mot de passe
    hashed_password = hash_password(password)

    sb.table("enqueteurs")\
        .update({
            "mot_de_passe": hashed_password,
            "compte_configure": True,
            "doit_changer_mdp": False
        })\
        .eq("id", enqueteur["id"])\
        .execute()

    # Marquer le token comme utilise
    sb.table("invitation_tokens")\
        .update({
            "used": True,
            "used_at": datetime.utcnow().isoformat()
        })\
        .eq("id", invitation["id"])\
        .execute()

    return {
        "message": "Compte active avec succes",
        "email": enqueteur["email"]
    }


@router.post("/send-invitation")
async def send_invitation(
    data: SendInvitationRequest,
    current_user: dict = Depends(get_current_user),
    sb: Client = Depends(get_supabase)
):
    """
    Envoyer (ou renvoyer) une invitation a un enqueteur

    Seuls les admins peuvent utiliser cet endpoint.
    """
    # Verifier que l'utilisateur est admin
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Acces reserve aux administrateurs")

    # Recuperer l'enqueteur
    res = sb.table("enqueteurs").select("*").eq("id", data.enqueteur_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Enqueteur introuvable")

    enqueteur = res.data[0]

    # Verifier si le compte est deja configure
    if enqueteur.get("compte_configure", False):
        raise HTTPException(status_code=400, detail="Ce compte est deja active")

    # Invalider les anciennes invitations
    sb.table("invitation_tokens")\
        .update({"used": True})\
        .eq("enqueteur_id", enqueteur["id"])\
        .eq("used", False)\
        .execute()

    # Generer un nouveau token d'invitation
    token = generate_invitation_token()
    expires_at = datetime.utcnow() + timedelta(hours=48)

    sb.table("invitation_tokens").insert({
        "enqueteur_id": enqueteur["id"],
        "token": token,
        "expires_at": expires_at.isoformat(),
        "used": False
    }).execute()

    # Construire le lien d'activation
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    activation_link = f"{frontend_url}/activer-compte?token={token}"

    # Envoyer l'email
    email_sent = send_welcome_email(
        enqueteur["email"],
        enqueteur.get("prenom", ""),
        activation_link
    )

    if not email_sent:
        raise HTTPException(status_code=500, detail="Erreur lors de l'envoi de l'email")

    return {
        "message": "Invitation envoyee",
        "email": enqueteur["email"]
    }


@router.post("/request-profile-otp")
async def request_profile_otp(
    current_user: dict = Depends(get_current_user),
    sb: Client = Depends(get_supabase)
):
    """
    Demander un code OTP pour modifier le profil

    1. L'utilisateur doit etre connecte
    2. Generer et envoyer un code OTP a son email
    """
    email = current_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email non configure")

    # Verifier le rate limiting
    recent_codes = sb.table("otp_codes")\
        .select("id")\
        .eq("email", email)\
        .gte("created_at", (datetime.utcnow() - timedelta(minutes=15)).isoformat())\
        .execute()

    if len(recent_codes.data) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Trop de demandes. Veuillez attendre 15 minutes."
        )

    # Generer le code OTP
    code = generate_otp(settings.OTP_LENGTH)
    code_hash = hash_code(code)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    # Invalider les anciens codes
    sb.table("otp_codes")\
        .update({"used": True})\
        .eq("email", email)\
        .eq("used", False)\
        .execute()

    # Sauvegarder le nouveau code
    sb.table("otp_codes").insert({
        "email": email,
        "code_hash": code_hash,
        "expires_at": expires_at.isoformat(),
        "attempts": 0,
        "used": False
    }).execute()

    # Envoyer l'email
    email_sent = send_otp_email(email, code, current_user.get("prenom", ""))

    if not email_sent:
        raise HTTPException(status_code=500, detail="Erreur lors de l'envoi de l'email")

    return {
        "message": "Code de verification envoye par email",
        "expires_in": settings.OTP_EXPIRE_MINUTES * 60
    }


@router.post("/update-profile")
async def update_profile(
    data: UpdateProfileRequest,
    current_user: dict = Depends(get_current_user),
    sb: Client = Depends(get_supabase)
):
    """
    Modifier le profil apres validation du code OTP

    1. Verifier le code OTP
    2. Mettre a jour les champs du profil
    """
    email = current_user.get("email")
    code = data.code.strip()

    # Recuperer le code OTP le plus recent
    res = sb.table("otp_codes")\
        .select("*")\
        .eq("email", email)\
        .eq("used", False)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Aucun code en attente. Demandez un nouveau code.")

    otp_record = res.data[0]

    # Verifier l'expiration
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace("Z", "+00:00"))
    if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
        sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()
        raise HTTPException(status_code=400, detail="Code expire. Demandez un nouveau code.")

    # Verifier le nombre de tentatives
    attempts = otp_record.get("attempts", 0)
    if attempts >= settings.OTP_MAX_ATTEMPTS:
        sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()
        raise HTTPException(status_code=400, detail="Trop de tentatives. Demandez un nouveau code.")

    # Verifier le code
    if not verify_code(code, otp_record["code_hash"]):
        sb.table("otp_codes")\
            .update({"attempts": attempts + 1})\
            .eq("id", otp_record["id"])\
            .execute()

        remaining = settings.OTP_MAX_ATTEMPTS - attempts - 1
        raise HTTPException(
            status_code=400,
            detail=f"Code incorrect. {remaining} tentative(s) restante(s)."
        )

    # Code valide - marquer comme utilise
    sb.table("otp_codes").update({"used": True}).eq("id", otp_record["id"]).execute()

    # Preparer les donnees a mettre a jour
    update_data = {}

    if data.nom is not None:
        update_data["nom"] = data.nom.strip().upper()

    if data.prenom is not None:
        update_data["prenom"] = data.prenom.strip().title()

    if data.email is not None:
        new_email = data.email.lower().strip()
        # Verifier que le nouvel email n'est pas deja utilise
        if new_email != email:
            existing = sb.table("enqueteurs").select("id").eq("email", new_email).execute()
            if existing.data:
                raise HTTPException(status_code=400, detail="Cet email est deja utilise")
            update_data["email"] = new_email

    if data.telephone is not None:
        update_data["telephone"] = data.telephone.strip() if data.telephone else None

    if data.reseau_mobile is not None:
        if data.reseau_mobile not in ["wave", "orange_money", "free_money", ""]:
            raise HTTPException(status_code=400, detail="Reseau mobile invalide")
        update_data["reseau_mobile"] = data.reseau_mobile if data.reseau_mobile else None

    if data.mode_remuneration is not None:
        if data.mode_remuneration not in ["virement", "espece", "espece_virement", "cheque", ""]:
            raise HTTPException(status_code=400, detail="Mode de remuneration invalide")
        update_data["mode_remuneration"] = data.mode_remuneration if data.mode_remuneration else None

    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune modification a effectuer")

    # Mettre a jour le profil
    sb.table("enqueteurs")\
        .update(update_data)\
        .eq("id", current_user["id"])\
        .execute()

    # Recuperer le profil mis a jour
    updated = sb.table("enqueteurs").select("*").eq("id", current_user["id"]).execute()

    return {
        "message": "Profil mis a jour avec succes",
        "user": {
            "id": updated.data[0]["id"],
            "email": updated.data[0]["email"],
            "nom": updated.data[0]["nom"],
            "prenom": updated.data[0]["prenom"],
            "telephone": updated.data[0].get("telephone"),
            "reseau_mobile": updated.data[0].get("reseau_mobile"),
            "mode_remuneration": updated.data[0].get("mode_remuneration"),
            "is_admin": updated.data[0].get("is_admin", False)
        }
    }


@router.post("/register")
async def register(data: RegisterRequest, sb: Client = Depends(get_supabase)):
    """
    Inscription d'un nouvel utilisateur

    1. Verifier que l'email n'existe pas
    2. Valider le mot de passe
    3. Creer le compte
    4. Retourner succes (l'utilisateur devra se connecter et valider par OTP)
    """
    email = data.email.lower().strip()

    # Verifier que l'email n'existe pas deja
    existing = sb.table("enqueteurs").select("id").eq("email", email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Cet email est deja utilise")

    # Valider le mot de passe
    password = data.password.strip()
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caracteres")

    # Hasher le mot de passe
    hashed_password = hash_password(password)

    # Generer un identifiant unique
    import random
    identifiant = f"USR{random.randint(1000, 9999)}"

    # Verifier unicite de l'identifiant
    while True:
        check = sb.table("enqueteurs").select("id").eq("identifiant", identifiant).execute()
        if not check.data:
            break
        identifiant = f"USR{random.randint(1000, 9999)}"

    # Creer le compte
    user_data = {
        "email": email,
        "nom": data.nom.strip().upper(),
        "prenom": data.prenom.strip().title(),
        "telephone": data.telephone.strip() if data.telephone else None,
        "identifiant": identifiant,
        "mot_de_passe": hashed_password,
        "actif": True,
        "is_admin": False,
        "compte_configure": False,  # Sera True apres la premiere connexion avec OTP
        "doit_changer_mdp": False
    }

    result = sb.table("enqueteurs").insert(user_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Erreur lors de la creation du compte")

    return {
        "message": "Compte cree avec succes. Connectez-vous pour activer votre compte.",
        "email": email
    }
