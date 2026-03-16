"""
Configuration de l'application
Toutes les variables sensibles sont chargees depuis l'environnement
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Configuration centralisee de l'application"""

    # Supabase
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY", "")

    # QuestionPro
    QUESTIONPRO_API_KEY: str = os.environ.get("QUESTIONPRO_API_KEY", "")
    QUESTIONPRO_BASE_URL: str = "https://api.questionpro.com/a/api/v2"

    # Email (Brevo)
    BREVO_API_KEY: str = os.environ.get("BREVO_API_KEY", "")
    EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "noreply@example.com")
    EMAIL_FROM_NAME: str = os.environ.get("EMAIL_FROM_NAME", "Marketym")

    # JWT
    JWT_SECRET_KEY: str = os.environ.get("JWT_SECRET_KEY", "")
    JWT_ALGORITHM: str = os.environ.get("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.environ.get("JWT_EXPIRE_MINUTES", "1440"))

    # OTP
    OTP_EXPIRE_MINUTES: int = int(os.environ.get("OTP_EXPIRE_MINUTES", "5"))
    OTP_MAX_ATTEMPTS: int = int(os.environ.get("OTP_MAX_ATTEMPTS", "3"))
    OTP_LENGTH: int = 6

    # Backend
    BACKEND_URL: str = os.environ.get("BACKEND_URL", "http://localhost:8000")

    # Frontend
    FRONTEND_URL: str = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    # CORS - Origines autorisees
    @property
    def ALLOWED_ORIGINS(self) -> list:
        origins = [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
        # Ajouter l'URL frontend de production si definie
        if self.FRONTEND_URL and self.FRONTEND_URL not in origins:
            origins.append(self.FRONTEND_URL)
        # Ajouter des origines supplementaires depuis l'environnement
        extra = os.environ.get("ALLOWED_ORIGINS", "")
        if extra:
            origins.extend([o.strip() for o in extra.split(",") if o.strip()])
        return origins

    # Sync
    SYNC_INTERVAL_MINUTES: int = int(os.environ.get("SYNC_INTERVAL_MINUTES", "30"))

    def validate(self) -> bool:
        """Verifier que toutes les variables requises sont presentes"""
        required = [
            ("SUPABASE_URL", self.SUPABASE_URL),
            ("SUPABASE_KEY", self.SUPABASE_KEY),
            ("JWT_SECRET_KEY", self.JWT_SECRET_KEY),
        ]

        missing = [name for name, value in required if not value]

        if missing:
            raise ValueError(f"Variables d'environnement manquantes: {', '.join(missing)}")

        return True


settings = Settings()
