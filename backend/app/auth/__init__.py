"""Module d'authentification"""
from .security import (
    hash_code,
    verify_code,
    generate_otp,
    create_access_token,
    decode_token,
    generate_token,
    generate_password,
    hash_password,
    verify_password,
    generate_invitation_token,
)
from .email import send_otp_email, send_welcome_email, send_password_reset_email
from .router import router as auth_router, get_current_user, require_admin, require_super_admin

__all__ = [
    "hash_code",
    "verify_code",
    "generate_otp",
    "create_access_token",
    "decode_token",
    "generate_token",
    "generate_password",
    "hash_password",
    "verify_password",
    "generate_invitation_token",
    "send_otp_email",
    "send_welcome_email",
    "send_password_reset_email",
    "auth_router",
    "get_current_user",
    "require_admin",
    "require_super_admin",
]
