"""Automated database backup manager: snapshots SQLite and PostgreSQL databases with timestamps, versioning, S3 persistence, and manifests."""

from __future__ import annotations

from datetime import datetime
import json
import logging
import os
from pathlib import Path
import shutil
import sqlite3
from typing import Any
import boto3
from botocore.config import Config
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from ..config import (
    BASE_DIR,
    DATA_DIR,
    S3_ACCESS_KEY_ID,
    S3_BUCKET,
    S3_ENDPOINT_URL,
    S3_REGION,
    S3_SECRET_ACCESS_KEY,
)
from ..database import Base, SessionLocal, is_sqlite
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

logger = logging.getLogger(__name__)

BACKUP_DIR = BASE_DIR / "backups" / "db"
MANIFEST_FILE = BACKUP_DIR / "manifest.json"

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


def _ensure_backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


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


def load_manifest() -> list[dict]:
    """Load backup history manifest from local disk or S3."""
    _ensure_backup_dir()
    if MANIFEST_FILE.exists():
        try:
            return json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Try downloading manifest from S3 if local file missing (e.g. fresh Render container)
    s3_client, bucket = _get_cloud_s3_client()
    if s3_client:
        try:
            resp = s3_client.get_object(Bucket=bucket, Key="backups/db/manifest.json")
            data = json.loads(resp["Body"].read().decode("utf-8"))
            MANIFEST_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
            return data
        except Exception:
            pass

    return []


def save_manifest(manifest: list[dict]) -> None:
    """Save backup history manifest locally and upload to S3."""
    _ensure_backup_dir()
    manifest_json = json.dumps(manifest, indent=2)
    MANIFEST_FILE.write_text(manifest_json, encoding="utf-8")

    s3_client, bucket = _get_cloud_s3_client()
    if s3_client:
        try:
            s3_client.put_object(
                Bucket=bucket,
                Key="backups/db/manifest.json",
                Body=manifest_json.encode("utf-8"),
                ContentType="application/json",
            )
        except Exception as err:
            logger.warning("Could not upload manifest.json to S3: %s", err)


def create_database_backup(trigger: str = "manual", db_session: Session | None = None) -> dict[str, Any]:
    """Create an atomic timestamped and versioned backup of the database.

    Works for both local SQLite databases and PostgreSQL (e.g. Supabase on Render).
    Uploads backup snapshot to S3 if available to survive cloud container redeployments.
    """
    _ensure_backup_dir()
    source_db = DATA_DIR / "pen_ink.db"

    manifest = load_manifest()
    version = len(manifest) + 1
    timestamp = datetime.now()
    ts_str = timestamp.strftime("%Y%m%d_%H%M%S")
    filename = f"pen_ink_{ts_str}_v{version}.db"
    target_path = BACKUP_DIR / filename

    if is_sqlite and source_db.exists():
        # Fast online SQLite backup (handles active WAL cleanly)
        src_conn = sqlite3.connect(str(source_db))
        try:
            dst_conn = sqlite3.connect(str(target_path))
            try:
                src_conn.backup(dst_conn)
            finally:
                dst_conn.close()
        finally:
            src_conn.close()
    else:
        # Non-sqlite (PostgreSQL) or missing local source_db:
        # Export active database session to a brand-new SQLite target file!
        should_close = False
        if db_session is None:
            session = SessionLocal()
            should_close = True
        else:
            session = db_session

        try:
            target_engine = create_engine(f"sqlite:///{target_path.as_posix()}", future=True)
            Base.metadata.create_all(bind=target_engine)
            with Session(target_engine) as dst_session:
                for table_name, model in MODEL_TABLES:
                    records = session.execute(select(model)).scalars().all()
                    for rec in records:
                        row_data = {c.name: getattr(rec, c.name) for c in rec.__table__.columns}
                        dst_session.merge(model(**row_data))
                dst_session.commit()
            target_engine.dispose()
        finally:
            if should_close:
                session.close()

        # Keep a local SQLite snapshot at data/pen_ink.db as well
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target_path, source_db)
        except Exception as err:
            logger.warning("Could not sync backup to %s: %s", source_db, err)

    # Query record counts from the freshly created SQLite backup
    check_conn = sqlite3.connect(str(target_path))
    try:
        c = check_conn.cursor()
        pens_cnt = c.execute("SELECT count(*) FROM pens").fetchone()[0]
        inks_cnt = c.execute("SELECT count(*) FROM inks").fetchone()[0]
        sessions_cnt = c.execute("SELECT count(*) FROM usage_sessions").fetchone()[0]
        samples_cnt = c.execute("SELECT count(*) FROM writing_samples").fetchone()[0]
        notebooks_cnt = c.execute("SELECT count(*) FROM notebooks").fetchone()[0]
        scans_cnt = c.execute("SELECT count(*) FROM scan_batches").fetchone()[0]
    finally:
        check_conn.close()

    # Upload backup snapshot to S3 bucket for persistent storage in cloud environments
    s3_client, bucket = _get_cloud_s3_client()
    if s3_client:
        try:
            with open(target_path, "rb") as fd:
                s3_client.put_object(
                    Bucket=bucket,
                    Key=f"backups/db/{filename}",
                    Body=fd,
                    ContentType="application/x-sqlite3",
                )
            logger.info("Successfully uploaded backup %s to S3 bucket %s", filename, bucket)
        except Exception as err:
            logger.warning("Could not upload backup %s to S3: %s", filename, err)

    record = {
        "version": version,
        "filename": filename,
        "relative_path": f"backups/db/{filename}",
        "download_url": f"/api/sync/backups/{filename}/download",
        "timestamp": timestamp.isoformat(),
        "created_at": timestamp.isoformat(),
        "created_at_formatted": timestamp.strftime("%b %d, %Y %I:%M %p"),
        "trigger": trigger,
        "pens_count": pens_cnt,
        "inks_count": inks_cnt,
        "sessions_count": sessions_cnt,
        "samples_count": samples_cnt,
        "size_bytes": target_path.stat().st_size,
        "counts": {
            "pens": pens_cnt,
            "inks": inks_cnt,
            "notebooks": notebooks_cnt,
            "sessions": sessions_cnt,
            "samples": samples_cnt,
            "scans": scans_cnt,
        },
    }

    manifest.insert(0, record)  # latest first
    save_manifest(manifest)
    return record


def list_backups() -> list[dict]:
    """Return all available backups sorted from newest to oldest."""
    return load_manifest()
