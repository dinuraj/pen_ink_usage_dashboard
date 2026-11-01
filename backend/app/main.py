"""FastAPI entrypoint serving REST APIs, uploaded media, and compiled React SPA."""

from __future__ import annotations

from contextlib import asynccontextmanager
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import text

from .config import FRONTEND_DIST_DIR, UPLOADS_DIR
from .database import Base, SessionLocal, engine
from .models import Pen
from .routers import analytics, inks, pens, samples, scans, sessions, settings


def _ensure_sqlite_schema_migrations() -> None:
    """Apply lightweight additive column migrations for existing SQLite databases."""
    with engine.begin() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(pens)")).fetchall()]
        if cols and "tags" not in cols:
            conn.execute(text("ALTER TABLE pens ADD COLUMN tags VARCHAR(250) NOT NULL DEFAULT ''"))


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001, ARG001
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_schema_migrations()
    if os.getenv("AUTO_SEED_DEMO", "false").lower() == "true":
        db = SessionLocal()
        try:
            if db.query(Pen).count() == 0:
                from .seed_demo import seed_demo_database

                seed_demo_database(db, reset_existing=False)
        finally:
            db.close()
    yield


app = FastAPI(
    title="Atelier Ink & Nib — Fountain Pen Usage Analytics",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(analytics.router)
app.include_router(pens.router)
app.include_router(inks.router)
app.include_router(sessions.router)
app.include_router(scans.router)
app.include_router(samples.router)
app.include_router(settings.router)

# Serve local media uploads (PDFs, rendered scan pages, cropped writing samples, pen photos)
app.mount("/media", StaticFiles(directory=str(UPLOADS_DIR)), name="media")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# Serve compiled Vite + React SPA in single-server mode when frontend/dist exists
if FRONTEND_DIST_DIR.exists() and (FRONTEND_DIST_DIR / "index.html").exists():
    assets_dir = FRONTEND_DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST_DIR / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST_DIR / "index.html"))
