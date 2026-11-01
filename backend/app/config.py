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
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)

STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")  # "local" or "s3"
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
