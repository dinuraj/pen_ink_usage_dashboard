"""Pull updates from Supabase Cloud (PostgreSQL + S3 Storage) into local workspace."""

from __future__ import annotations

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import date, datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
import boto3
from botocore.config import Config
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from backend.app.config import BASE_DIR, DATA_DIR, UPLOADS_DIR
from backend.app.database import get_db
from backend.app.models import (
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
from backend.app.services.backup import create_database_backup

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("pull_cloud")

# Tables in forward dependency order
TABLES = [
    ("scan_batches", ScanBatch),
    ("scan_pages", ScanPage),
    ("pens", Pen),
    ("inks", Ink),
    ("notebooks", Notebook),
    ("pen_photos", PenPhoto),
    ("pen_merge_records", PenMergeRecord),
    ("usage_sessions", UsageSession),
    ("writing_samples", WritingSample),
    ("lifecycle_events", LifecycleEvent),
    ("app_settings", AppSetting),
]

CLOUD_DB_URL = "postgresql+pg8000://postgres.zjxyhhgrcvensgeyihnp:datgePhBb5kz2e2e@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

S3_CONFIG = {
    "endpoint_url": "https://zjxyhhgrcvensgeyihnp.storage.supabase.co/storage/v1/s3",
    "aws_access_key_id": "0b0d6ba7913215515867641bad543e2e",
    "aws_secret_access_key": "8db5e3e6619fef78476da2dd455197037fc2fb92504272d1de2a4774bf9d3b75",
    "region_name": "ap-northeast-2",
    "bucket": "pen-ink-uploads",
}


def pull_s3_media() -> list[str]:
    """Download any new or updated media files from S3 to local data/uploads/."""
    logger.info("Connecting to Supabase S3...")
    s3 = boto3.client(
        "s3",
        endpoint_url=S3_CONFIG["endpoint_url"],
        aws_access_key_id=S3_CONFIG["aws_access_key_id"],
        aws_secret_access_key=S3_CONFIG["aws_secret_access_key"],
        region_name=S3_CONFIG["region_name"],
        config=Config(signature_version="s3v4"),
    )

    bucket = S3_CONFIG["bucket"]
    paginator = s3.get_paginator("list_objects_v2")

    downloaded = []
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            s3_size = obj["Size"]

            # Local destination path
            dest_path = UPLOADS_DIR / key.replace("/", os.sep)
            dest_path.parent.mkdir(parents=True, exist_ok=True)

            # Check if file exists with matching size
            if dest_path.exists() and dest_path.stat().st_size == s3_size:
                continue

            logger.info("Downloading %s (%d bytes) to %s", key, s3_size, dest_path.name)
            s3.download_file(bucket, key, str(dest_path))
            downloaded.append(key)

    logger.info("S3 media sync finished. %d new/updated files downloaded.", len(downloaded))
    return downloaded


def pull_database():
    """Backup local DB and synchronize all tables from Supabase PostgreSQL."""
    # 1. Create versioned backup
    logger.info("Creating pre-pull database backup...")
    backup_record = create_database_backup(trigger="sync_pull")
    logger.info("Backup created: %s (v%s)", backup_record["filename"], backup_record["version"])

    # 2. Fetch records from cloud
    logger.info("Connecting to Supabase PostgreSQL...")
    cloud_engine = create_engine(CLOUD_DB_URL, pool_pre_ping=True)
    cloud_session = Session(cloud_engine)

    cloud_data = {}
    for table_name, model in TABLES:
        records = cloud_session.execute(select(model)).scalars().all()
        rows = []
        for rec in records:
            row_dict = {}
            for col in rec.__table__.columns:
                val = getattr(rec, col.name)
                # Convert datetime/date if needed for SQLite raw binding
                if isinstance(val, (datetime, date)):
                    row_dict[col.name] = val.isoformat()
                else:
                    row_dict[col.name] = val
            rows.append(row_dict)
        cloud_data[table_name] = rows
        logger.info("Fetched %d rows for %s from cloud.", len(rows), table_name)

    cloud_session.close()

    # 3. Apply to local SQLite atomically
    local_db_path = DATA_DIR / "pen_ink.db"
    conn = sqlite3.connect(str(local_db_path))
    conn.execute("PRAGMA foreign_keys = OFF")

    try:
        cur = conn.cursor()
        # Delete from tables in reverse order
        for table_name, _ in reversed(TABLES):
            cur.execute(f"DELETE FROM {table_name}")

        # Insert records into tables in forward order
        for table_name, model in TABLES:
            rows = cloud_data[table_name]
            if not rows:
                continue
            cols = [col.name for col in model.__table__.columns]
            placeholders = ", ".join(["?"] * len(cols))
            col_names = ", ".join([f'"{c}"' for c in cols])
            insert_sql = f'INSERT INTO {table_name} ({col_names}) VALUES ({placeholders})'

            val_tuples = [tuple(r.get(c) for c in cols) for r in rows]
            cur.executemany(insert_sql, val_tuples)

        conn.commit()

        # Run integrity & foreign key checks
        integrity = cur.execute("PRAGMA integrity_check").fetchall()
        fk_errors = cur.execute("PRAGMA foreign_key_check").fetchall()
        logger.info("SQLite integrity check: %s", integrity)
        if fk_errors:
            logger.warning("Foreign key errors encountered: %s", fk_errors)
        else:
            logger.info("Foreign key check passed: 0 errors.")

    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.close()

    # 4. Update sync state
    sync_state_file = DATA_DIR / "sync_state.json"
    state = {}
    if sync_state_file.exists():
        try:
            state = json.loads(sync_state_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    state["last_pull"] = datetime.now().isoformat()
    state["last_status"] = "pull_success"
    sync_state_file.write_text(json.dumps(state, indent=2), encoding="utf-8")

    return backup_record, cloud_data


if __name__ == "__main__":
    downloaded_files = pull_s3_media()
    backup_info, cloud_data = pull_database()

    print("\n" + "=" * 60)
    print("SYNC SUMMARY: CLOUD -> LOCAL")
    print("=" * 60)
    print(f"Pre-sync Backup : {backup_info['filename']} (v{backup_info['version']})")
    print(f"Downloaded Files: {len(downloaded_files)} media files from S3")
    for f in downloaded_files:
        print(f"  + {f}")

    print("\nSynchronized Database Tables:")
    for t, rows in cloud_data.items():
        print(f"  - {t:20s}: {len(rows):4d} records")

    # Inspect ratings in local SQLite now
    conn = sqlite3.connect("data/pen_ink.db")
    cur = conn.cursor()
    pen_ratings = cur.execute("SELECT COUNT(*) FROM pens WHERE rating IS NOT NULL").fetchone()[0]
    ink_ratings = cur.execute("SELECT COUNT(*) FROM inks WHERE rating IS NOT NULL").fetchone()[0]
    pen_photos_count = cur.execute("SELECT COUNT(*) FROM pen_photos").fetchone()[0]
    pens_with_photo = cur.execute("SELECT COUNT(*) FROM pens WHERE primary_photo_key IS NOT NULL").fetchone()[0]
    conn.close()

    print(f"\nLocal Collection Statistics:")
    print(f"  - Total active pens in cabinet : {len(cloud_data['pens'])}")
    print(f"  - Pens with ratings            : {pen_ratings}")
    print(f"  - Inks with ratings            : {ink_ratings}")
    print(f"  - Total pen photos registered  : {pen_photos_count}")
    print(f"  - Pens with primary photo      : {pens_with_photo} / {len(cloud_data['pens'])}")
    print("=" * 60)
