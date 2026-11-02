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

from .config import APP_ACCESS_TOKEN, FRONTEND_DIST_DIR, STORAGE_BACKEND, UPLOADS_DIR
from .database import Base, SessionLocal, engine, is_sqlite
from .models import Pen
from .routers import analytics, inks, notebooks, pens, samples, scans, sessions, settings
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
    """Protect app with optional APP_ACCESS_TOKEN passcode in cloud deployments."""
    if not APP_ACCESS_TOKEN:
        return await call_next(request)

    path = request.url.path
    if path in ("/api/health", "/healthz") or path.startswith("/assets/"):
        return await call_next(request)

    provided = None
    auth = request.headers.get("Authorization")
    if auth:
        if auth.startswith("Bearer "):
            provided = auth[7:].strip()
        elif auth.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth[6:].strip()).decode("utf-8")
                parts = decoded.split(":", 1)
                provided = parts[1] if len(parts) > 1 and parts[1] else parts[0]
            except Exception:
                pass

    if not provided:
        provided = request.headers.get("X-App-Token")
    if not provided:
        provided = request.cookies.get("app_access_token")
    if not provided:
        provided = request.query_params.get("token")

    if provided == APP_ACCESS_TOKEN:
        response = await call_next(request)
        if request.cookies.get("app_access_token") != APP_ACCESS_TOKEN:
            response.set_cookie(
                key="app_access_token",
                value=APP_ACCESS_TOKEN,
                httponly=True,
                samesite="lax",
                max_age=60 * 60 * 24 * 30,
            )
        return response

    return Response(
        status_code=401,
        content="Unauthorized: Access passcode required for Atelier Ink & Nib.",
        headers={"WWW-Authenticate": 'Basic realm="Atelier Ink & Nib"'},
        media_type="text/plain",
    )


# Register API routers
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
