import os
import sqlite3
import sqlalchemy
from sqlalchemy import create_engine, text
import boto3
from botocore.config import Config

cloud_url = "postgresql+pg8000://postgres.zjxyhhgrcvensgeyihnp:datgePhBb5kz2e2e@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
cloud_engine = create_engine(cloud_url)

local_conn = sqlite3.connect("data/pen_ink.db")
local_conn.row_factory = sqlite3.Row
local_cur = local_conn.cursor()

print("=== CHECKING RATINGS IN CLOUD PENS ===")
with cloud_engine.connect() as c_conn:
    cloud_pens = {row._mapping['id']: dict(row._mapping) for row in c_conn.execute(text("SELECT * FROM pens"))}
    cloud_photos = [dict(row._mapping) for row in c_conn.execute(text("SELECT * FROM pen_photos ORDER BY id"))]
    cloud_merges = [dict(row._mapping) for row in c_conn.execute(text("SELECT * FROM pen_merge_records ORDER BY id"))]

local_pens = {row['id']: dict(row) for row in local_cur.execute("SELECT * FROM pens")}
local_photos = [dict(row) for row in local_cur.execute("SELECT * FROM pen_photos ORDER BY id")]
local_merges = [dict(row) for row in local_cur.execute("SELECT * FROM pen_merge_records ORDER BY id")]

print(f"Cloud pens: {len(cloud_pens)}, Local pens: {len(local_pens)}")
local_only_pids = set(local_pens.keys()) - set(cloud_pens.keys())
cloud_only_pids = set(cloud_pens.keys()) - set(local_pens.keys())
print(f"Local only pen IDs: {sorted(local_only_pids)}")
print(f"Cloud only pen IDs: {sorted(cloud_only_pids)}")

# Check ratings
rated_cloud = {pid: p for pid, p in cloud_pens.items() if p.get('rating') is not None}
rated_local = {pid: p for pid, p in local_pens.items() if p.get('rating') is not None}
print(f"\nRated pens in Cloud: {len(rated_cloud)}")
print(f"Rated pens in Local: {len(rated_local)}")

for pid, p in rated_cloud.items():
    l_rating = local_pens.get(pid, {}).get('rating')
    if l_rating != p.get('rating'):
        print(f"  Pen #{pid} ({p.get('brand')} {p.get('model')}): local={l_rating} -> cloud={p.get('rating')}")

# Check pen photos
print("\n=== PEN PHOTOS ===")
print(f"Cloud photos: {len(cloud_photos)}, Local photos: {len(local_photos)}")
if cloud_photos:
    print("Cloud photo cols:", list(cloud_photos[0].keys()))

cloud_photo_ids = {p['id'] for p in cloud_photos}
local_photo_ids = {p['id'] for p in local_photos}
new_photos = [p for p in cloud_photos if p['id'] not in local_photo_ids]
print(f"New photos in cloud: {len(new_photos)}")
for p in new_photos:
    key = p.get('storage_key') or p.get('file_path') or p.get('url') or p
    print(f"  Photo id={p['id']}, pen_id={p['pen_id']}, key={key}")

# Check primary photo key differences
photo_diffs = []
for pid, c_pen in cloud_pens.items():
    l_pen = local_pens.get(pid)
    if l_pen and l_pen.get('primary_photo_key') != c_pen.get('primary_photo_key'):
        photo_diffs.append((pid, c_pen.get('brand') + ' ' + c_pen.get('model'), l_pen.get('primary_photo_key'), c_pen.get('primary_photo_key')))

print(f"\nPens with primary_photo_key diffs: {len(photo_diffs)}")
for pid, name, old, new in photo_diffs:
    print(f"  Pen #{pid} ({name}): local={old} -> cloud={new}")

# Check S3
print("\n=== CHECKING S3 BUCKET ===")
s3 = boto3.client(
    "s3",
    endpoint_url="https://zjxyhhgrcvensgeyihnp.storage.supabase.co/storage/v1/s3",
    aws_access_key_id="0b0d6ba7913215515867641bad543e2e",
    aws_secret_access_key="8db5e3e6619fef78476da2dd455197037fc2fb92504272d1de2a4774bf9d3b75",
    region_name="ap-northeast-2",
    config=Config(signature_version="s3v4")
)

paginator = s3.get_paginator("list_objects_v2")
s3_objs = []
for page in paginator.paginate(Bucket="pen-ink-uploads"):
    for obj in page.get("Contents", []):
        s3_objs.append((obj["Key"], obj["Size"], obj["LastModified"]))

print(f"Total objects in S3: {len(s3_objs)}")
for prefix in ["pens/", "samples/", "pages/", "swatches/"]:
    matching = [x for x in s3_objs if x[0].startswith(prefix)]
    print(f"  {prefix}: {len(matching)} objects")

# Check which S3 files are missing locally across ALL categories
uploads_dir = os.path.abspath("data/uploads")
missing_files = []
for key, size, mtime in s3_objs:
    local_path = os.path.join(uploads_dir, key.replace('/', os.sep))
    if not os.path.exists(local_path):
        missing_files.append((key, size, mtime))

print(f"\nTotal S3 files missing locally: {len(missing_files)}")
for key, size, mtime in missing_files:
    print(f"  Missing locally: {key} ({size} bytes, modified: {mtime})")
