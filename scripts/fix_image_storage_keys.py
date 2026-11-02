"""Fix image_storage_key values in writing_samples and scan_pages.

Matches DB records to the actual WebP files on disk / Supabase Storage.
Creates automated versioned backups before and after modifications.
Updates both local SQLite (data/pen_ink.db) and cloud Supabase PostgreSQL.
"""

from __future__ import annotations

import glob
import os
import re
import sqlite3
import sys
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

from app.services.backup import create_database_backup

load_dotenv(ROOT / ".env.render")


def build_mappings():
    sample_files = [os.path.basename(f) for f in glob.glob(str(ROOT / "data" / "uploads" / "samples" / "*.webp"))]
    page_files = [os.path.basename(f) for f in glob.glob(str(ROOT / "data" / "uploads" / "pages" / "*.webp"))]

    sqlite_path = ROOT / "data" / "pen_ink.db"
    conn = sqlite3.connect(str(sqlite_path))
    c = conn.cursor()

    # 1. Samples mapping
    c.execute("SELECT id, image_storage_key FROM writing_samples ORDER BY id")
    sample_rows = c.fetchall()
    sample_updates = {}
    for sid, old_key in sample_rows:
        if sid == 268:
            sample_updates[sid] = "samples/recrop_p32_s268_d0cf3922.webp"
            continue
        prefix = os.path.basename(old_key).rsplit("_", 1)[0] + "_"
        matches = [f for f in sample_files if f.startswith(prefix)]
        if len(matches) != 1:
            raise ValueError(f"Sample {sid} ({prefix}) had {len(matches)} matches: {matches}")
        sample_updates[sid] = f"samples/{matches[0]}"

    # 2. Pages mapping
    c.execute("SELECT id, page_number, image_storage_key FROM scan_pages ORDER BY id")
    page_rows = c.fetchall()
    page_updates = {}
    for pid, pnum, old_key in page_rows:
        prefix = f"journal_b1_p{pnum}_"
        matches = [f for f in page_files if f.startswith(prefix)]
        if len(matches) != 1:
            raise ValueError(f"Page {pid} ({prefix}) had {len(matches)} matches: {matches}")
        page_updates[pid] = f"pages/{matches[0]}"

    conn.close()
    return sample_updates, page_updates


def update_local_sqlite(sample_updates, page_updates):
    sqlite_path = ROOT / "data" / "pen_ink.db"
    conn = sqlite3.connect(str(sqlite_path))
    c = conn.cursor()

    for sid, new_key in sample_updates.items():
        c.execute("UPDATE writing_samples SET image_storage_key = ? WHERE id = ?", (new_key, sid))

    for pid, new_key in page_updates.items():
        c.execute("UPDATE scan_pages SET image_storage_key = ? WHERE id = ?", (new_key, pid))

    conn.commit()
    conn.close()
    print(f"Updated local SQLite: {len(sample_updates)} samples, {len(page_updates)} scan pages.")


def update_remote_postgres(sample_updates, page_updates):
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        print("[WARN] DATABASE_URL not found, skipping remote PostgreSQL update.")
        return

    # Use pg8000 dialect
    db_url = re.sub(r"^postgresql(\+\w+)?://", "postgresql+pg8000://", raw_url)
    engine = create_engine(db_url)

    with engine.begin() as conn:
        for sid, new_key in sample_updates.items():
            conn.execute(
                text("UPDATE writing_samples SET image_storage_key = :key WHERE id = :id"),
                {"key": new_key, "id": sid},
            )

        for pid, new_key in page_updates.items():
            conn.execute(
                text("UPDATE scan_pages SET image_storage_key = :key WHERE id = :id"),
                {"key": new_key, "id": pid},
            )

    print(f"Updated remote Supabase PostgreSQL: {len(sample_updates)} samples, {len(page_updates)} scan pages.")


def verify_supabase_storage():
    base_url = "https://zjxyhhgrcvensgeyihnp.storage.supabase.co/storage/v1/object/public/pen-ink-uploads/"
    test_keys = [
        "samples/journal_p31_R261_s261_a98ce868.webp",  # Ink 71 sample
        "samples/recrop_p32_s268_d0cf3922.webp",        # Sample 268
        "pages/journal_b1_p1_28067a60.webp",           # Page 1
        "pages/journal_b1_p31_1d029654.webp",          # Page 31
    ]
    print("\nVerifying Supabase Storage public access:")
    for k in test_keys:
        url = base_url + k
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                print(f"  [OK] {k} -> HTTP {resp.status} ({resp.headers.get('Content-Type')})")
        except Exception as e:
            print(f"  [FAIL] {k} -> {e}")


def main():
    print("=" * 60)
    print("Repairing writing_samples and scan_pages image_storage_keys")
    print("=" * 60)

    # 1. Backup before changes
    b1 = create_database_backup(trigger="pre_image_key_fix")
    print(f"Pre-fix backup created: {b1['filename']} (v{b1['version']})")

    # 2. Map keys
    sample_updates, page_updates = build_mappings()
    print(f"Mapped {len(sample_updates)} samples and {len(page_updates)} scan pages.")

    # 3. Update local SQLite
    update_local_sqlite(sample_updates, page_updates)

    # 4. Backup after local changes
    b2 = create_database_backup(trigger="post_image_key_fix")
    print(f"Post-fix backup created: {b2['filename']} (v{b2['version']})")

    # 5. Update remote PostgreSQL (Supabase)
    update_remote_postgres(sample_updates, page_updates)

    # 6. Verify storage access
    verify_supabase_storage()

    print("\n[SUCCESS] Image storage keys successfully fixed across local & cloud databases!")


if __name__ == "__main__":
    main()

