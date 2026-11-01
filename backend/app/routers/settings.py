"""Settings, Gemini API key management, full backup ZIP export, and Demo Seed reset."""

from __future__ import annotations

import io
import json
import os
import zipfile
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import BASE_DIR, DATA_DIR, GEMINI_MODEL, STORAGE_BACKEND, UPLOADS_DIR
from ..database import get_db
from ..models import AppSetting, Ink, LifecycleEvent, Pen, ScanBatch, UsageSession, WritingSample
from ..services.pdf_vision import get_gemini_api_key

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    gemini_api_key: str | None = None


@router.get("")
def get_settings_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    effective_key = get_gemini_api_key(db)
    env_key_present = bool(os.getenv("GEMINI_API_KEY", "").strip())
    masked = ""
    if effective_key:
        masked = (
            f"{effective_key[:4]}...{effective_key[-4:]}"
            if len(effective_key) > 8
            else "Configured"
        )
    return {
        "gemini_configured": bool(effective_key),
        "gemini_key_masked": masked,
        "from_env": env_key_present,
        "gemini_model": GEMINI_MODEL,
        "storage_backend": STORAGE_BACKEND,
        "counts": {
            "pens": db.query(Pen).count(),
            "inks": db.query(Ink).count(),
            "sessions": db.query(UsageSession).count(),
            "samples": db.query(WritingSample).count(),
            "scans": db.query(ScanBatch).count(),
        },
    }


def _write_key_to_dotenv(key_value: str) -> None:
    """Persist GEMINI_API_KEY in the gitignored root .env file (never inside pen_ink.db)."""
    env_path = BASE_DIR / ".env"
    lines: list[str] = []
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            if not raw_line.strip().startswith("GEMINI_API_KEY="):
                lines.append(raw_line)
    if key_value:
        lines.append(f"GEMINI_API_KEY={key_value}")
    content = ("\n".join(lines).strip() + "\n") if lines else ""
    if content:
        env_path.write_text(content, encoding="utf-8")
    elif env_path.exists():
        env_path.unlink()


@router.put("")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    if payload.gemini_api_key is not None:
        cleaned = payload.gemini_api_key.strip()
        _write_key_to_dotenv(cleaned)
        if cleaned:
            os.environ["GEMINI_API_KEY"] = cleaned
        else:
            os.environ.pop("GEMINI_API_KEY", None)
        # Ensure no API key is ever stored inside pen_ink.db so the DB is safe to commit to Git
        db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").delete()
        db.commit()
    return get_settings_status(db)


@router.post("/reseed-demo")
def reseed_demo_endpoint(db: Session = Depends(get_db)) -> dict[str, Any]:
    from ..seed_demo import seed_demo_database

    summary = seed_demo_database(db, reset_existing=True)
    return {"status": "reseeded", "summary": summary}


@router.get("/export-backup")
def export_backup_zip(db: Session = Depends(get_db)) -> StreamingResponse:
    """Create a portable ZIP containing JSON export, SQLite DB snapshot, and uploaded media."""
    export_payload = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "pens": [
            {
                "id": p.id,
                "brand": p.brand,
                "model": p.model,
                "color_variant": p.color_variant,
                "nib_size": p.nib_size,
                "nib_material": p.nib_material,
                "filling_mechanism": p.filling_mechanism,
                "status": p.status,
                "tags": p.tags,
                "custom_notes": p.custom_notes,
            }
            for p in db.query(Pen).all()
        ],
        "inks": [
            {
                "id": i.id,
                "brand": i.brand,
                "name": i.name,
                "color_family": i.color_family,
                "hex_color": i.hex_color,
                "format": i.format,
                "volume_ml": i.volume_ml,
                "remaining_level": i.remaining_level,
                "quantity": i.quantity,
                "mountain_of_ink_url": i.mountain_of_ink_url,
                "custom_notes": i.custom_notes,
            }
            for i in db.query(Ink).all()
        ],
        "sessions": [
            {
                "id": s.id,
                "pen_id": s.pen_id,
                "ink_id": s.ink_id,
                "date_inked": s.date_inked.isoformat(),
                "date_cleaned": s.date_cleaned.isoformat() if s.date_cleaned else None,
                "end_status": s.end_status,
                "refill_count": s.refill_count,
                "session_notes": s.session_notes,
            }
            for s in db.query(UsageSession).all()
        ],
        "events": [
            {
                "id": e.id,
                "session_id": e.session_id,
                "event_type": e.event_type,
                "event_date": e.event_date.isoformat(),
                "source": e.source,
                "notes": e.notes,
            }
            for e in db.query(LifecycleEvent).all()
        ],
    }

    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("pen_ink_export.json", json.dumps(export_payload, indent=2))
        sqlite_file = DATA_DIR / "pen_ink.db"
        if sqlite_file.exists():
            zf.write(sqlite_file, arcname="pen_ink.db")
        if UPLOADS_DIR.exists():
            for file_path in UPLOADS_DIR.rglob("*"):
                if file_path.is_file():
                    rel = file_path.relative_to(DATA_DIR)
                    zf.write(file_path, arcname=str(rel))

    mem_zip.seek(0)
    stamp = datetime.now().strftime("%Y%m%d")
    return StreamingResponse(
        mem_zip,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="pen_ink_backup_{stamp}.zip"'},
    )
