"""
Fonctions de securite: hashing, JWT, generation de tokens
"""
import secrets
import string
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt

from ..config import settings


def hash_code(code: str) -> str:
    """Hasher un code OTP avec bcrypt"""
    return bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_code(code: str, hashed: str) -> bool:
    """Verifier un code OTP contre son hash"""
    try:
        return bcrypt.checkpw(code.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def generate_otp(length: int = 6) -> str:
    """Generer un code OTP numerique aleatoire"""
    return "".join(secrets.choice(string.digits) for _ in range(length))


def generate_token(length: int = 6) -> str:
    """Generer un token alphanumerique aleatoire (pour tracking enqueteur)"""
    chars = string.ascii_uppercase + string.digits
    # Eviter les caracteres ambigus (0, O, I, L)
    chars = chars.replace("0", "").replace("O", "").replace("I", "").replace("L", "")
    return "".join(secrets.choice(chars) for _ in range(length))


def generate_invitation_token() -> str:
    """Generer un token d'invitation securise (64 caracteres)"""
    return secrets.token_urlsafe(48)


def generate_password(length: int = 10) -> str:
    """Generer un mot de passe aleatoire securise"""
    # Au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 special
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    special = "!@#$%&*"

    password = [
        secrets.choice(lowercase),
        secrets.choice(uppercase),
        secrets.choice(digits),
        secrets.choice(special),
    ]

    # Completer avec des caracteres aleatoires
    all_chars = lowercase + uppercase + digits + special
    password += [secrets.choice(all_chars) for _ in range(length - 4)]

    # Melanger
    secrets.SystemRandom().shuffle(password)

    return "".join(password)


def hash_password(password: str) -> str:
    """Hasher un mot de passe avec bcrypt"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verifier un mot de passe contre son hash"""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creer un JWT token"""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": datetime.utcnow()})

    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decoder et verifier un JWT token"""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
