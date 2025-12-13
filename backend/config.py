"""
Application configuration and environment settings.

Author: Richard Stoker <richard.stoker@usda.gov>
        IT Specialist, Agricultural Research Service, USDA
"""
import os
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


def _generate_dev_key() -> str:
    """Generate a random key for local development only."""
    return secrets.token_urlsafe(32)


class Settings(BaseSettings):
    # App settings
    app_name: str = "CSG Flux Dashboard"
    debug: bool = False

    # Deployment mode - set to True for demo/read-only deployment
    demo_mode: bool = False

    # Splash screen - disabled by default, enable for branded deployments
    enable_splash_screen: bool = False

    # Security - these MUST be set via environment variables in production.
    # Random keys are generated for local dev convenience but will change on restart.
    secret_key: str = ""
    refresh_secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30  # 30 minutes
    refresh_token_expire_days: int = 7     # 7 days

    # Cookie settings for httpOnly token storage
    cookie_secure: bool = False  # Set to True in production (HTTPS only)
    cookie_samesite: str = "lax"  # 'lax' or 'strict' - 'none' requires secure=True
    cookie_domain: str | None = None  # None = current domain only

    # Database
    database_url: str = "sqlite:///./data/crop_dashboard.db"
    db_encryption_key: str | None = None  # SQLCipher encryption key - REQUIRED for production

    # Paths
    base_dir: Path = Path(__file__).parent.parent
    data_dir: Path = base_dir / "data"
    uploads_dir: Path = base_dir / "uploads"
    archives_dir: Path = base_dir / "archives"

    # Initial admin (created on first run)
    admin_email: str = "admin@cropdash.dev"
    admin_password: str = "changeme123"

    # CORS - parse from comma-separated env var if provided
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def all_cors_origins(self) -> list[str]:
        """Return all CORS origins."""
        return list(self.cors_origins)

    # Box OAuth Configuration
    # Get these from https://app.box.com/developers/console
    box_client_id: str = ""
    box_client_secret: str = ""
    box_redirect_uri: str = "http://localhost:5173/admin/box/callback"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from comma-separated string if needed."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    # Generate random keys for local dev if not provided via env vars.
    # These will change on each restart - set SECRET_KEY and REFRESH_SECRET_KEY in .env for persistence.
    if not s.secret_key:
        s.secret_key = _generate_dev_key()
    if not s.refresh_secret_key:
        s.refresh_secret_key = _generate_dev_key()
    return s


settings = get_settings()

# Ensure directories exist
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
settings.archives_dir.mkdir(parents=True, exist_ok=True)
