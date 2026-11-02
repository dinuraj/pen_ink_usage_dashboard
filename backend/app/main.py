"""FastAPI entrypoint serving REST APIs, uploaded media, and compiled React SPA."""

from __future__ import annotations

import base64
from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import text

from .auth import is_authenticated_admin, router as auth_router
from .config import APP_ACCESS_TOKEN, FRONTEND_DIST_DIR, STORAGE_BACKEND, UPLOADS_DIR
from .database import Base, SessionLocal, engine, is_sqlite
from .models import Pen
from .routers import analytics, inks, notebooks, pens, samples, scans, sessions, settings, sync
from .storage import storage




def _ensure_sqlite_schema_migrations() -> None:
    """Apply lightweight additive column migrations for existing SQLite databases."""
    with engine.begin() as conn:
        pen_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(pens)")).fetchall()]
        if pen_cols:
            if "tags" not in pen_cols:
                conn.execute(text("ALTER TABLE pens ADD COLUMN tags VARCHAR(250) NOT NULL DEFAULT ''"))
            if "rating" not in pen_cols:
                conn.execute(text("ALTER TABLE pens ADD COLUMN rating INTEGER"))

        ink_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(inks)")).fetchall()]
        if ink_cols and "rating" not in ink_cols:
            conn.execute(text("ALTER TABLE inks ADD COLUMN rating INTEGER"))


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN001, ARG001
    Base.metadata.create_all(bind=engine)
    if is_sqlite:
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


@app.middleware("http")
async def access_token_middleware(request: Request, call_next):  # noqa: ANN001
    """Smart access middleware:

    - Public Read-Only: All GET, HEAD, OPTIONS requests (browsing pens, inks, stats, samples) are public!
    - Mutation Protection: POST, PUT, PATCH, DELETE require valid Admin session.
    """
    if not APP_ACCESS_TOKEN:
        return await call_next(request)

    path = request.url.path

    # Always exempt static bundle assets and health checks
    if path in ("/api/health", "/healthz") or path.startswith("/assets/"):
        return await call_next(request)

    # Safe read-only HTTP methods are accessible to all visitors
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return await call_next(request)

    # Auth endpoints (login/logout/status) must be accessible
    if path.startswith("/api/auth/"):
        return await call_next(request)

    # State-changing operations (POST / PUT / PATCH / DELETE) require Admin authorization
    if is_authenticated_admin(request):
        return await call_next(request)

    import json
    return Response(
        status_code=401,
        content=json.dumps({"detail": "Admin passcode required to modify data or perform actions."}),
        media_type="application/json",
    )


# Register API routers
app.include_router(auth_router)
app.include_router(sync.router)
app.include_router(analytics.router)
app.include_router(pens.router)
app.include_router(inks.router)
app.include_router(notebooks.router)
app.include_router(sessions.router)
app.include_router(scans.router)
app.include_router(samples.router)
app.include_router(settings.router)


# Serve media uploads (StaticFiles in local mode, S3 redirect/stream in S3 mode)
if STORAGE_BACKEND == "s3":
    @app.get("/media/{file_path:path}", include_in_schema=False)
    async def serve_s3_media(file_path: str):
        url = storage.get_public_url(file_path)
        if url and url.startswith("http"):
            return RedirectResponse(url=url, status_code=307)
        path = storage.resolve_path(file_path)
        if path.exists() and path.is_file():
            return FileResponse(str(path))
        return Response(status_code=404, content="Media not found")
else:
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
