"""Application configuration with seamless Local-to-Cloud portability."""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
UPLOADS_DIR = DATA_DIR / "uploads"

# Load optional .env from workspace root or backend/
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / "backend" / ".env")

DATA_DIR.mkdir(parents=True, exist_ok=True)
for sub in ("pdfs", "pages", "samples", "pens", "swatches", "demo"):
    (UPLOADS_DIR / sub).mkdir(parents=True, exist_ok=True)

DEFAULT_SQLITE_URL = f"sqlite:///{(DATA_DIR / 'pen_ink.db').as_posix()}"
raw_db_url = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL).strip()

# Normalize PostgreSQL URL for SQLAlchemy (support psycopg in Linux Docker, pg8000 fallback)
if raw_db_url.startswith("postgres://") or raw_db_url.startswith("postgresql://"):
    clean_url = raw_db_url
    if clean_url.startswith("postgres://"):
        clean_url = "postgresql://" + clean_url[len("postgres://") :]
    if not clean_url.startswith("postgresql+"):
        try:
            import psycopg  # noqa: F401
            driver = "psycopg"
        except ImportError:
            driver = "pg8000"
        clean_url = clean_url.replace("postgresql://", f"postgresql+{driver}://", 1)
    DATABASE_URL = clean_url
else:
    DATABASE_URL = raw_db_url


# Storage Configuration (local or s3)
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local").lower().strip()  # "local" or "s3"
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "").strip()
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", "").strip()
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", "").strip()
S3_BUCKET = os.getenv("S3_BUCKET", "pen-ink-uploads").strip()
S3_REGION = os.getenv("S3_REGION", "us-east-1").strip()
S3_PUBLIC_URL_PREFIX = os.getenv("S3_PUBLIC_URL_PREFIX", "").strip()

# Local disk cache for temporary S3 reads/crops
CACHE_DIR = DATA_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Access Protection (default from env or .env.render)
APP_ACCESS_TOKEN = os.getenv("APP_ACCESS_TOKEN", "").strip()
if not APP_ACCESS_TOKEN:
    env_render = BASE_DIR / ".env.render"
    if env_render.exists():
        for line in env_render.read_text(encoding="utf-8").splitlines():
            if line.startswith("APP_ACCESS_TOKEN="):
                APP_ACCESS_TOKEN = line.split("=", 1)[1].strip()
                break

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

