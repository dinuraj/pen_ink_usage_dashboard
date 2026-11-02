import glob
import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.config import Config

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.render")

# 1. Gather all active keys from local SQLite & verify with Supabase Postgres
conn = sqlite3.connect(ROOT / "data" / "pen_ink.db")
c = conn.cursor()

c.execute("SELECT DISTINCT image_storage_key FROM writing_samples WHERE image_storage_key IS NOT NULL")
db_sample_keys = set(r[0].strip() for r in c.fetchall())

c.execute("SELECT DISTINCT image_storage_key FROM scan_pages WHERE image_storage_key IS NOT NULL")
db_page_keys = set(r[0].strip() for r in c.fetchall())

active_keys = db_sample_keys | db_page_keys
print(f"Active DB keys: {len(active_keys)} (samples: {len(db_sample_keys)}, pages: {len(db_page_keys)})")

# 2. Check local disk files
local_samples = set("samples/" + os.path.basename(f) for f in glob.glob(str(ROOT / "data" / "uploads" / "samples" / "*")))
local_pages = set("pages/" + os.path.basename(f) for f in glob.glob(str(ROOT / "data" / "uploads" / "pages" / "*")))
local_all = local_samples | local_pages
print(f"Local files on disk: {len(local_all)} (samples: {len(local_samples)}, pages: {len(local_pages)})")

local_missing = active_keys - local_all
local_stale = local_all - active_keys
print(f"Local missing (referenced in DB but not on disk): {len(local_missing)}")
print(f"Local stale (on disk but not referenced in DB): {len(local_stale)}")
if local_stale:
    for s in sorted(local_stale):
        print(f"   - {s}")

# 3. Connect to Supabase S3
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

# Paginate all S3 objects
paginator = s3.get_paginator("list_objects_v2")
s3_keys = set()
for page in paginator.paginate(Bucket=bucket):
    for obj in page.get("Contents", []):
        s3_keys.add(obj["Key"])

print(f"\nS3 objects in bucket '{bucket}': {len(s3_keys)}")
s3_samples = set(k for k in s3_keys if k.startswith("samples/"))
s3_pages = set(k for k in s3_keys if k.startswith("pages/"))
s3_other = s3_keys - s3_samples - s3_pages
print(f"   samples/: {len(s3_samples)}")
print(f"   pages/: {len(s3_pages)}")
if s3_other:
    print(f"   other prefixes: {s3_other}")

s3_missing = active_keys - s3_keys
s3_stale = s3_keys - active_keys

print(f"\nS3 missing (referenced in DB but not in S3): {len(s3_missing)}")
if s3_missing:
    for m in sorted(s3_missing):
        print(f"   - {m}")

print(f"\nS3 stale (in S3 but NOT referenced in DB): {len(s3_stale)}")
if s3_stale:
    for s in sorted(s3_stale):
        print(f"   - {s}")
