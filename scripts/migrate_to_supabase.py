"""Data migration utility: Copies local SQLite database and uploads to Supabase (PostgreSQL + S3 Storage).

Usage:
    # Option A: With environment variables set in .env or shell:
    python scripts/migrate_to_supabase.py

    # Option B: Passing credentials explicitly:
    python scripts/migrate_to_supabase.py --target-db "postgresql+pg8000://..." --bucket pen-ink-uploads
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")

import boto3
from botocore.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.config import DATA_DIR, UPLOADS_DIR
from app.database import Base
from app.models import (
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


def get_sqlite_session(db_path: Path) -> Session:
    """Create session connected to local SQLite database."""
    if not db_path.exists():
        raise FileNotFoundError(f"Local SQLite database not found at {db_path}")
    url = f"sqlite:///{db_path.as_posix()}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    return Session(engine)


def get_postgres_engine(target_url: str):
    """Create PostgreSQL engine with appropriate dialect."""
    url = target_url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if not url.startswith("postgresql+"):
        try:
            import psycopg  # noqa: F401
            driver = "psycopg"
        except ImportError:
            driver = "pg8000"
        url = url.replace("postgresql://", f"postgresql+{driver}://", 1)

    return create_engine(url, pool_pre_ping=True)


def migrate_database_records(sqlite_session: Session, target_session: Session) -> dict[str, int]:
    """Copy all records from SQLite to PostgreSQL preserving IDs, then sync sequences."""
    stats: dict[str, int] = {}

    model_order = [
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

    for table_name, model in model_order:
        records = sqlite_session.execute(select(model)).scalars().all()
        count = 0
        for rec in records:
            # Recreate model dictionary to ensure clean detach from SQLite session
            data = {c.name: getattr(rec, c.name) for c in rec.__table__.columns}
            target_session.merge(model(**data))
            count += 1
        target_session.commit()
        stats[table_name] = count
        print(f"  [DB] Migrated {count:>4} records into '{table_name}'")

    # Reset PostgreSQL sequences for tables with auto-increment 'id'
    print("\n  [DB] Synchronizing PostgreSQL sequence IDs...")
    conn = target_session.connection()
    for table_name, model in model_order:
        if "id" in [c.name for c in model.__table__.columns]:
            try:
                seq_sql = text(
                    f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table_name}), 1));"
                )
                conn.execute(seq_sql)
            except Exception as e:
                # Some tables may not have sequence or may use different naming
                pass
    target_session.commit()

    return stats


def upload_media_files(
    s3_client,
    bucket: str,
    uploads_dir: Path,
) -> int:
    """Upload all files from data/uploads/ into the S3 bucket with matching keys."""
    if not uploads_dir.exists():
        print(f"  [Storage] Uploads directory {uploads_dir} does not exist. Skipping media upload.")
        return 0

    uploaded_count = 0
    categories = ("pdfs", "pages", "samples", "pens", "swatches", "demo")

    for cat in categories:
        folder = uploads_dir / cat
        if not folder.exists():
            continue

        files = [f for f in folder.glob("*") if f.is_file()]
        for f in files:
            key = f"{cat}/{f.name}"
            content_type, _ = mimetypes.guess_type(f.name)
            if not content_type:
                content_type = "application/octet-stream"

            try:
                with open(f, "rb") as file_data:
                    s3_client.put_object(
                        Bucket=bucket,
                        Key=key,
                        Body=file_data,
                        ContentType=content_type,
                    )
                uploaded_count += 1
                if uploaded_count % 10 == 0:
                    print(f"  [Storage] Uploaded {uploaded_count} files...")
            except Exception as e:
                print(f"  [Storage] ERROR uploading {key}: {e}")

    print(f"  [Storage] Finished! Successfully uploaded {uploaded_count} files to S3 bucket '{bucket}'.")
    return uploaded_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate Atelier Ink & Nib data to Supabase (PostgreSQL + S3).")
    parser.add_argument("--sqlite-db", default=str(DATA_DIR / "pen_ink.db"), help="Path to source SQLite file")
    parser.add_argument("--target-db", default=os.getenv("DATABASE_URL", ""), help="Target PostgreSQL URI")
    parser.add_argument("--s3-endpoint", default=os.getenv("S3_ENDPOINT_URL", ""), help="Supabase S3 endpoint URL")
    parser.add_argument("--s3-key-id", default=os.getenv("S3_ACCESS_KEY_ID", ""), help="S3 Access Key ID")
    parser.add_argument("--s3-secret", default=os.getenv("S3_SECRET_ACCESS_KEY", ""), help="S3 Secret Access Key")
    parser.add_argument("--s3-bucket", default=os.getenv("S3_BUCKET", "pen-ink-uploads"), help="S3 Bucket name")
    parser.add_argument("--s3-region", default=os.getenv("S3_REGION", "us-east-1"), help="S3 Region")
    parser.add_argument("--skip-files", action="store_true", help="Skip uploading media files")
    parser.add_argument("--skip-db", action="store_true", help="Skip migrating database records")

    args = parser.parse_args()

    sqlite_path = Path(args.sqlite_db)
    target_db_url = args.target_db

    print("=" * 65)
    print("  Atelier Ink & Nib — Cloud Migration to Supabase")
    print("=" * 65)

    if not args.skip_db:
        if not target_db_url or target_db_url.startswith("sqlite"):
            print("\n[ERROR] Valid PostgreSQL DATABASE_URL is required.")
            print("Provide it via --target-db or set DATABASE_URL in .env\n")
            sys.exit(1)

        print(f"\n1. Connecting to source SQLite: {sqlite_path}")
        sqlite_sess = get_sqlite_session(sqlite_path)

        print("2. Connecting to target PostgreSQL and initializing tables...")
        pg_engine = get_postgres_engine(target_db_url)
        Base.metadata.create_all(bind=pg_engine)
        target_sess = Session(pg_engine)

        print("3. Copying records...")
        migrate_database_records(sqlite_sess, target_sess)
        sqlite_sess.close()
        target_sess.close()

    if not args.skip_files:
        print("\n4. Configuring S3 client for Supabase Storage...")
        if not args.s3_endpoint or not args.s3_key_id or not args.s3_secret:
            print("[WARN] S3 credentials missing (S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).")
            print("Skipping media files. You can rerun with credentials once generated in Supabase.")
        else:
            s3_client = boto3.client(
                "s3",
                endpoint_url=args.s3_endpoint,
                aws_access_key_id=args.s3_key_id,
                aws_secret_access_key=args.s3_secret,
                region_name=args.s3_region,
                config=Config(signature_version="s3v4"),
            )
            print(f"5. Uploading files from {UPLOADS_DIR} to bucket '{args.s3_bucket}'...")
            upload_media_files(s3_client, args.s3_bucket, UPLOADS_DIR)

    print("\n[SUCCESS] Cloud migration complete!")
    print("=" * 65)


if __name__ == "__main__":
    main()

