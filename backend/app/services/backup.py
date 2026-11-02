"""Automated database backup manager: snapshots SQLite database with timestamps, versioning, and manifests."""

from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3

from ..config import BASE_DIR, DATA_DIR

BACKUP_DIR = BASE_DIR / "backups" / "db"
MANIFEST_FILE = BACKUP_DIR / "manifest.json"


def _ensure_backup_dir() -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


def load_manifest() -> list[dict]:
    """Load backup history manifest."""
    _ensure_backup_dir()
    if MANIFEST_FILE.exists():
        try:
            return json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def save_manifest(manifest: list[dict]) -> None:
    """Save backup history manifest."""
    _ensure_backup_dir()
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def create_database_backup(trigger: str = "manual") -> dict:
    """Create an atomic timestamped and versioned backup of data/pen_ink.db.

    Returns metadata dict of the created backup.
    """
    _ensure_backup_dir()
    source_db = DATA_DIR / "pen_ink.db"
    if not source_db.exists():
        raise FileNotFoundError(f"Source database not found at {source_db}")

    manifest = load_manifest()
    version = len(manifest) + 1
    timestamp = datetime.now()
    ts_str = timestamp.strftime("%Y%m%d_%H%M%S")
    filename = f"pen_ink_{ts_str}_v{version}.db"
    target_path = BACKUP_DIR / filename

    # Atomic online SQLite backup (handles active WAL cleanly)
    src_conn = sqlite3.connect(str(source_db))
    try:
        dst_conn = sqlite3.connect(str(target_path))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()

        # Query counts from the freshly created backup
        check_conn = sqlite3.connect(str(target_path))
        try:
            c = check_conn.cursor()
            pens_cnt = c.execute("SELECT count(*) FROM pens").fetchone()[0]
            inks_cnt = c.execute("SELECT count(*) FROM inks").fetchone()[0]
            sessions_cnt = c.execute("SELECT count(*) FROM usage_sessions").fetchone()[0]
            samples_cnt = c.execute("SELECT count(*) FROM writing_samples").fetchone()[0]
        finally:
            check_conn.close()
    finally:
        src_conn.close()

    record = {
        "version": version,
        "filename": filename,
        "relative_path": f"backups/db/{filename}",
        "timestamp": timestamp.isoformat(),
        "created_at_formatted": timestamp.strftime("%b %d, %Y %I:%M %p"),
        "trigger": trigger,
        "pens_count": pens_cnt,
        "inks_count": inks_cnt,
        "sessions_count": sessions_cnt,
        "samples_count": samples_cnt,
        "size_bytes": target_path.stat().st_size,
    }

    manifest.insert(0, record)  # latest first
    save_manifest(manifest)
    return record


def list_backups() -> list[dict]:
    """Return all available backups sorted from newest to oldest."""
    return load_manifest()

