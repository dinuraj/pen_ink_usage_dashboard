"""Cloud Synchronization and Versioned Database Backup router."""

from __future__ import annotations

from datetime import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any
import boto3
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
import sqlalchemy
from sqlalchemy import create_engine, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..config import (
    BASE_DIR,
    DATA_DIR,
    S3_ACCESS_KEY_ID,
    S3_BUCKET,
    S3_ENDPOINT_URL,
    S3_REGION,
    S3_SECRET_ACCESS_KEY,
    UPLOADS_DIR,
)
from ..database import Base, get_db, is_sqlite
from ..models import (
    AppSetting,
    Ink,
    LifecycleEvent,
    Notebook,
    Pen,
    PenMergeRecord,
    PenPhoto,
    ScanBatch,
    ScanPage,
    UsageSession,
    WritingSample,
)
from ..services.backup import BACKUP_DIR, create_database_backup, list_backups

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])

SYNC_STATE_FILE = DATA_DIR / "sync_state.json"

MODEL_TABLES = [
    ("pens", Pen),
    ("inks", Ink),
    ("notebooks", Notebook),
    ("pen_photos", PenPhoto),
    ("pen_merge_records", PenMergeRecord),
    ("scan_batches", ScanBatch),
    ("scan_pages", ScanPage),
    ("usage_sessions", UsageSession),
    ("writing_samples", WritingSample),
    ("lifecycle_events", LifecycleEvent),
    ("app_settings", AppSetting),
]


def _get_cloud_db_url() -> str:
    """Resolve cloud PostgreSQL URL from environment or .env.render."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url or url.startswith("sqlite"):
        env_render = BASE_DIR / ".env.render"
        if env_render.exists():
            for line in env_render.read_text(encoding="utf-8").splitlines():
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip()
                    break

    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        url = url.replace("postgresql://", "postgresql+pg8000://", 1)
    elif url.startswith("postgresql+psycopg://"):
        url = url.replace("postgresql+psycopg://", "postgresql+pg8000://", 1)
    return url


def _get_cloud_s3_client():
    endpoint = os.getenv("S3_ENDPOINT_URL", S3_ENDPOINT_URL).strip()
    key_id = os.getenv("S3_ACCESS_KEY_ID", S3_ACCESS_KEY_ID).strip()
    secret = os.getenv("S3_SECRET_ACCESS_KEY", S3_SECRET_ACCESS_KEY).strip()
    bucket = os.getenv("S3_BUCKET", S3_BUCKET).strip()
    region = os.getenv("S3_REGION", S3_REGION).strip()

    if not endpoint or not key_id or not secret:
        env_render = BASE_DIR / ".env.render"
        if env_render.exists():
            for line in env_render.read_text(encoding="utf-8").splitlines():
                if line.startswith("S3_ENDPOINT_URL="):
                    endpoint = line.split("=", 1)[1].strip()
                elif line.startswith("S3_ACCESS_KEY_ID="):
                    key_id = line.split("=", 1)[1].strip()
                elif line.startswith("S3_SECRET_ACCESS_KEY="):
                    secret = line.split("=", 1)[1].strip()
                elif line.startswith("S3_BUCKET="):
                    bucket = line.split("=", 1)[1].strip()
                elif line.startswith("S3_REGION="):
                    region = line.split("=", 1)[1].strip()

    if not endpoint or not key_id or not secret:
        return None, bucket

    try:
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )
        return client, bucket
    except Exception as err:
        logger.warning("Could not initialize S3 client: %s", err)
        return None, bucket


def _load_sync_state() -> dict[str, Any]:
    if SYNC_STATE_FILE.exists():
        try:
            return json.loads(SYNC_STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"last_push": None, "last_pull": None, "last_status": "never_synced"}


def _save_sync_state(state: dict[str, Any]) -> None:
    SYNC_STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


@router.get("/status")
def get_sync_status(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Check cloud connection readiness, last sync times, and backup list."""
    cloud_url = _get_cloud_db_url()
    cloud_configured = bool(cloud_url and not cloud_url.startswith("sqlite"))
    cloud_connected = False
    error_msg = None

    if cloud_configured:
        try:
            eng = create_engine(cloud_url, connect_args={"timeout": 5})
            with eng.connect() as conn:
                conn.execute(text("SELECT 1"))
                cloud_connected = True
        except Exception as e:
            error_msg = str(e)

    state = _load_sync_state()
    backups = list_backups()

    return {
        "is_cloud": not is_sqlite,
        "cloud_configured": cloud_configured,
        "cloud_connected": cloud_connected,
        "connection_error": error_msg,
        "last_push": state.get("last_push"),
        "last_pull": state.get("last_pull"),
        "backups_count": len(backups),
        "recent_backups": backups[:15],
    }


@router.post("/backup", dependencies=[Depends(require_admin)])
def trigger_backup(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Create a standalone timestamped backup of the database (SQLite or PostgreSQL)."""
    try:
        backup_record = create_database_backup(trigger="manual_backup", db_session=db)
        return {"status": "ok", "backup": backup_record}
    except Exception as err:
        logger.exception("Failed to create database backup")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create database backup: {err}",
        )


@router.get("/backups/{filename}/download")
def download_backup(filename: str) -> FileResponse:
    """Download a versioned database backup .db file."""
    safe_name = os.path.basename(filename)
    if not safe_name.endswith(".db"):
        raise HTTPException(status_code=400, detail="Invalid backup file name")

    file_path = BACKUP_DIR / safe_name
    if not file_path.exists():
        # Check if stored in S3
        s3_client, bucket = _get_cloud_s3_client()
        if s3_client:
            try:
                BACKUP_DIR.mkdir(parents=True, exist_ok=True)
                s3_client.download_file(bucket, f"backups/db/{safe_name}", str(file_path))
            except Exception as err:
                logger.warning("Could not download %s from S3: %s", safe_name, err)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Backup file {safe_name} not found")

    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/x-sqlite3",
    )


@router.get("/export/sqlite")
def export_sqlite(db: Session = Depends(get_db)) -> FileResponse:
    """Export current active database as a fresh downloadable SQLite file."""
    try:
        backup_record = create_database_backup(trigger="export_sqlite", db_session=db)
        file_path = BACKUP_DIR / backup_record["filename"]
        download_name = f"pen_ink_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        return FileResponse(
            path=str(file_path),
            filename=download_name,
            media_type="application/x-sqlite3",
        )
    except Exception as err:
        logger.exception("Failed to export database as SQLite")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export SQLite database: {err}",
        )


@router.post("/push", dependencies=[Depends(require_admin)])
def push_to_cloud(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Take an atomic backup, then push local tables and media files to Supabase."""
    if not is_sqlite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Push is only supported when running the local SQLite instance. The cloud instance is already using Supabase PostgreSQL.",
        )

    cloud_url = _get_cloud_db_url()
    if not cloud_url or cloud_url.startswith("sqlite"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloud database is not configured. Check .env or .env.render.",
        )

    # 1. Create versioned backup before modifying/uploading anything
    backup_record = create_database_backup(trigger="sync_push", db_session=db)

    # 2. Push database records
    stats = {}
    try:
        cloud_engine = create_engine(cloud_url, pool_pre_ping=True)
        Base.metadata.create_all(bind=cloud_engine)
        cloud_session = Session(cloud_engine)

        for table_name, model in MODEL_TABLES:
            records = db.execute(select(model)).scalars().all()
            if not records:
                stats[table_name] = 0
                continue
            rows = [{c.name: getattr(rec, c.name) for c in rec.__table__.columns} for rec in records]
            has_id = "id" in [c.name for c in model.__table__.columns]
            for i in range(0, len(rows), 100):
                chunk = rows[i : i + 100]
                stmt = pg_insert(model).values(chunk)
                if has_id:
                    update_cols = {c.name: c for c in stmt.excluded if c.name != "id"}
                    stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_cols)
                else:
                    stmt = stmt.on_conflict_do_nothing()
                cloud_session.execute(stmt)
            cloud_session.commit()
            stats[table_name] = len(rows)

        # Reset Postgres sequences
        conn = cloud_session.connection()
        for table_name, model in MODEL_TABLES:
            if "id" in [c.name for c in model.__table__.columns]:
                try:
                    conn.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {table_name}), 1));"
                        )
                    )
                except Exception:
                    pass
        cloud_session.commit()
        cloud_session.close()
    except Exception as e:
        logger.exception("Error pushing records to cloud")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database push error: {e}")

    # 3. Push media files to S3 bucket (differential upload: skips existing files)
    s3_client, bucket = _get_cloud_s3_client()
    uploaded_files_count = 0
    if s3_client and UPLOADS_DIR.exists():
        existing_keys = set()
        try:
            paginator = s3_client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket):
                for obj in page.get("Contents", []):
                    existing_keys.add(obj["Key"])
        except Exception as err:
            logger.warning("Could not list existing S3 keys: %s", err)

        for cat in ("pdfs", "pages", "samples", "pens", "swatches", "demo"):
            folder = UPLOADS_DIR / cat
            if not folder.exists():
                continue
            for f in folder.glob("*"):
                if f.is_file():
                    key = f"{cat}/{f.name}"
                    if key in existing_keys:
                        continue
                    try:
                        with open(f, "rb") as fd:
                            s3_client.put_object(Bucket=bucket, Key=key, Body=fd)
                        uploaded_files_count += 1
                    except Exception as err:
                        logger.warning("Error uploading %s to S3: %s", key, err)

    state = _load_sync_state()
    state["last_push"] = datetime.now().isoformat()
    state["last_status"] = "push_success"
    _save_sync_state(state)

    return {
        "status": "success",
        "backup": backup_record,
        "synced_tables": stats,
        "uploaded_media_count": uploaded_files_count,
        "message": f"Cloud push complete. Versioned backup saved as {backup_record['filename']}.",
    }


@router.post("/pull", dependencies=[Depends(require_admin)])
def pull_from_cloud(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Pull changes from Supabase into local database, or snapshot cloud if running in cloud mode."""
    if not is_sqlite:
        # Running on Render/Cloud: snapshot cloud database to SQLite for local download
        backup_record = create_database_backup(trigger="cloud_snapshot", db_session=db)
        return {
            "status": "success",
            "backup": backup_record,
            "download_url": f"/api/sync/backups/{backup_record['filename']}/download",
            "message": f"Cloud database snapshot {backup_record['filename']} created! You can download it directly below to copy to your local machine.",
        }

    # Running in local SQLite mode
    cloud_url = _get_cloud_db_url()
    if not cloud_url or cloud_url.startswith("sqlite"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloud database is not configured. Check .env or .env.render.",
        )

    # 1. Create versioned backup before pulling
    backup_record = create_database_backup(trigger="sync_pull", db_session=db)

    # 2. Pull records from cloud into local SQLite
    stats = {}
    try:
        cloud_engine = create_engine(cloud_url, pool_pre_ping=True)
        cloud_session = Session(cloud_engine)

        # Disable foreign keys temporarily during bulk sync to prevent FK constraint failures on merges/deletes
        db.execute(text("PRAGMA foreign_keys = OFF;"))

        for table_name, model in MODEL_TABLES:
            records = cloud_session.execute(select(model)).scalars().all()
            cloud_ids = set()
            count = 0
            for rec in records:
                data = {c.name: getattr(rec, c.name) for c in rec.__table__.columns}
                if "id" in data:
                    cloud_ids.add(data["id"])
                db.merge(model(**data))
                count += 1

            # Remove records deleted or merged away in the cloud
            if "id" in [c.name for c in model.__table__.columns] and cloud_ids:
                local_records = db.execute(select(model)).scalars().all()
                for l_rec in local_records:
                    if getattr(l_rec, "id") not in cloud_ids:
                        db.delete(l_rec)

            db.commit()
            stats[table_name] = count

        db.execute(text("PRAGMA foreign_keys = ON;"))
        cloud_session.close()
    except Exception as e:
        logger.exception("Error pulling records from cloud")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database pull error: {e}")

    # 3. Pull media files from S3 bucket (differential download)
    s3_client, bucket = _get_cloud_s3_client()
    downloaded_files_count = 0
    if s3_client and UPLOADS_DIR.exists():
        try:
            paginator = s3_client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    # Only download media folders into uploads directory
                    if not any(key.startswith(f"{cat}/") for cat in ("pens", "samples", "pages", "pdfs", "swatches", "demo")):
                        continue
                    dest = UPLOADS_DIR / key.replace("/", os.sep)
                    if dest.exists() and dest.stat().st_size == obj["Size"]:
                        continue
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    s3_client.download_file(bucket, key, str(dest))
                    downloaded_files_count += 1
        except Exception as err:
            logger.warning("Error syncing S3 media files during pull: %s", err)

    state = _load_sync_state()
    state["last_pull"] = datetime.now().isoformat()
    state["last_status"] = "pull_success"
    _save_sync_state(state)

    return {
        "status": "success",
        "backup": backup_record,
        "synced_tables": stats,
        "downloaded_media_count": downloaded_files_count,
        "message": f"Cloud pull complete. Local database and {downloaded_files_count} media files updated. Versioned backup saved as {backup_record['filename']}.",
    }
