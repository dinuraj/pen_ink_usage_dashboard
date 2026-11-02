"""Cleanup unreferenced / stale image objects from Supabase S3 and local disk."""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.config import Config
import sqlite3

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.render")

def cleanup():
    conn = sqlite3.connect(ROOT / "data" / "pen_ink.db")
    c = conn.cursor()
    c.execute("SELECT DISTINCT image_storage_key FROM writing_samples WHERE image_storage_key IS NOT NULL")
    db_samples = set(r[0].strip() for r in c.fetchall())
    c.execute("SELECT DISTINCT image_storage_key FROM scan_pages WHERE image_storage_key IS NOT NULL")
    db_pages = set(r[0].strip() for r in c.fetchall())
    active_keys = db_samples | db_pages
    conn.close()

    # Identify the 2 stale superseded sample images
    stale_sample_keys = [
        "samples/journal_p32_L268_s268_02ee6909.webp",
        "samples/recrop_p32_s268_cd1c2ff6.webp",
    ]

    for k in stale_sample_keys:
        assert k not in active_keys, f"Safety check failed: {k} is active in DB!"

    print("Target stale images for cleanup:")
    for k in stale_sample_keys:
        print(f"  - {k}")

    # 1. Clean from Supabase S3
    endpoint = os.getenv("S3_ENDPOINT_URL")
    key_id = os.getenv("S3_ACCESS_KEY_ID")
    secret = os.getenv("S3_SECRET_ACCESS_KEY")
    bucket = os.getenv("S3_BUCKET", "pen-ink-uploads")
    region = os.getenv("S3_REGION", "us-east-1")

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )

    print(f"\nDeleting from Supabase S3 bucket '{bucket}'...")
    for k in stale_sample_keys:
        try:
            s3.delete_object(Bucket=bucket, Key=k)
            print(f"  [S3 Deleted] {k}")
        except Exception as e:
            print(f"  [S3 Error] {k}: {e}")

    # 2. Clean from local disk
    print("\nDeleting from local disk...")
    for k in stale_sample_keys:
        local_p = ROOT / "data" / "uploads" / k
        if local_p.exists():
            local_p.unlink()
            print(f"  [Local Deleted] {local_p}")
        else:
            print(f"  [Local Not Found / Already Cleaned] {local_p}")

    print("\nCleanup complete.")

if __name__ == "__main__":
    cleanup()
