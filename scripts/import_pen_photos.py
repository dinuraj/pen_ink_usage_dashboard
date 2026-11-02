"""Extract pen photos from State of Collection July 15, 2023 blog post,
upload to local & Supabase S3 storage, update local SQLite & cloud PostgreSQL,
and create automated backups.
"""

from __future__ import annotations

import io
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
from PIL import Image
from sqlalchemy import create_engine, text

from app.services.backup import create_database_backup

load_dotenv(ROOT / ".env.render")

# Precise Figure geometry: (file, y_min, y_max, [(pen_idx, x_min, x_max, custom_y_max)])
FIGURES = {
    1: {
        "file": "fig_1.jpeg",
        "y": (25, 725),
        "slots": [(i + 1, 165 + i * 100, 265 + i * 100, None) for i in range(10)]
    },
    2: {
        "file": "fig_2.jpeg",
        "y": (25, 730),
        "slots": [(i + 1, 155 + i * 100, 255 + i * 100, None) for i in range(10)]
    },
    3: {
        "file": "fig_3.jpeg",
        "y": (30, 740),
        "slots": [
            (1, 160, 260, None),
            (2, 260, 360, None),
            (3, 360, 460, None),
            (4, 460, 560, None),
            (5, 560, 660, None),
            (6, 660, 760, None),
            (7, 760, 860, None),
            (8, 860, 960, None),
            (9, 960, 1060, 680),  # shorter pocket pen
            (10, 1060, 1160, 680), # shorter junior pen
        ]
    },
    4: {
        "file": "fig_4.jpeg",
        "y": (30, 740),
        "slots": [
            (1, 160, 260, None),
            (2, 260, 360, 520),   # short Kaweco Sport
            (3, 360, 460, None),
            (4, 460, 560, None),
            (5, 560, 660, None),
            (6, 660, 760, None),
            (7, 760, 860, None),
            (8, 860, 960, None),
            (9, 960, 1060, None),
        ]
    },
    5: {
        "file": "fig_5.jpeg",
        "y": (35, 910),
        "slots": [
            (1, 245, 345, None),
            (2, 345, 435, None),
            (3, 435, 525, None),
            (4, 525, 615, None),
            (5, 615, 705, None),
            (6, 695, 800, None),
        ]
    },
    6: {
        "file": "fig_6.jpeg",
        "y": (40, 905),
        "slots": [
            (1, 215, 320, None),
            (2, 320, 415, None),
            (3, 415, 510, None),
            (4, 510, 600, None),
            (5, 600, 690, None),
            (6, 690, 790, None),
        ]
    },
    7: {
        "file": "fig_7.jpeg",
        "y": (45, 755),
        "slots": [(i + 1, 155 + i * 100, 255 + i * 100, None) for i in range(10)]
    },
    8: {
        "file": "fig_8.jpeg",
        "y": (40, 780),
        "slots": [(i + 1, 155 + i * 100, 255 + i * 100, None) for i in range(10)]
    },
    9: {
        "file": "fig_9.jpeg",
        "y": (35, 755),
        "slots": [(i + 1, 160 + i * 100, 260 + i * 100, None) for i in range(10)]
    },
    10: {
        "file": "fig_10.jpeg",
        "y": (20, 830),
        "slots": [
            (1, 305, 430, None),
            (2, 430, 555, None),
            (3, 675, 800, None),
        ]
    },
    11: {
        "file": "fig_11.jpeg",
        "y": (35, 850),
        "slots": [
            (1, 180, 290, None),
            (2, 290, 410, None),
            (3, 410, 560, None),
            (4, 570, 680, None),
            (5, 680, 800, None),
            (6, 800, 940, None),
        ]
    },
    12: {
        "file": "fig_12.jpeg",
        "y": (30, 1050),
        "slots": [
            (1, 270, 430, None),
            (2, 455, 585, 880),
        ]
    },
}

# Mapping: (fig_idx, slot_idx) -> (pen_id, caption)
PEN_MAPPING = {
    # Fig 1
    (1, 1): (134, "Parker Vintage (Burgundy & Black — Flex) — July 15, 2023"),
    (1, 2): (135, "Parker Vintage (Burgundy & Black — Non-Flex) — July 15, 2023"),
    (1, 3): (121, "Esterbrook J (Vintage) — July 15, 2023"),
    (1, 4): (122, "Esterbrook SJ (Vintage) — July 15, 2023"),
    (1, 6): (3, "ASA Azaadi with Visconti Nib (Ancient Gold Acrylic) — July 15, 2023"),
    (1, 7): (137, "Ranga Model 3C (Premium Ebonite) — July 15, 2023"),
    (1, 8): (18, "Ranga Model 4C (Clear Demonstrator) — July 15, 2023"),
    (1, 9): (13, "Krishna Lyrebird 52 (Brown Swirl Ebonite) — July 15, 2023"),
    (1, 10): (12, "Krishna Nova (Forest Green Ebonite) — July 15, 2023"),

    # Fig 2
    (2, 1): (49, "Guider Medium Acrylic (Brown Swirl) — July 15, 2023"),
    (2, 2): (138, "Ranga Model 4C (Green Ebonite) — July 15, 2023"),
    (2, 3): (30, "Ranga Model 8B (Red-Black Ebonite) — July 15, 2023"),
    (2, 4): (9, "Fosfor Rajendran KOP (Woodgrain Ebonite) — July 15, 2023"),
    (2, 5): (72, "Sheaffer 100 (Glossy Red) — July 15, 2023"),
    (2, 6): (57, "Deccan Advocate (Olive Green Ebonite with Kanwrite Nib) — July 15, 2023"),
    (2, 7): (126, "Guider Small Acrylic (Amber + Schmidt Nib) — July 15, 2023"),
    (2, 8): (26, "Pilot Metropolitan (Retro Pop Lizard) — July 15, 2023"),
    (2, 9): (46, "Pilot Metropolitan (Classic Black) — July 15, 2023"),
    (2, 10): (44, "Pilot Metropolitan (Silver Steel) — July 15, 2023"),

    # Fig 3
    (3, 1): (58, "Gama Kuyil (Matte Black Ebonite) — July 15, 2023"),
    (3, 3): (28, "Airmail Wality Big Demonstrator (Green Swirl) — July 15, 2023"),
    (3, 4): (37, "Fosfor Tikona (Faceted Teal Acrylic) — July 15, 2023"),
    (3, 5): (120, "Deccan Bullet Senior (Black Ebonite) — July 15, 2023"),
    (3, 6): (7, "Ranga Bamboo (Green-Yellow Swirl Ebonite) — July 15, 2023"),
    (3, 8): (8, "Ranga Sugarcane (Teal-Red Ripple Ebonite) — July 15, 2023"),
    (3, 9): (112, "Guider Pocket Pen (Bullet Ebonite) — July 15, 2023"),
    (3, 10): (119, "Deccan Bullet Junior (Green Ripple Ebonite) — July 15, 2023"),

    # Fig 4
    (4, 1): (73, "Guider Egg (Green Swirl Acrylic) — July 15, 2023"),
    (4, 2): (55, "Kaweco Sport with 2B Nib (Navy Blue) — July 15, 2023"),
    (4, 3): (125, "Guider Classic (Blue-Black) — July 15, 2023"),
    (4, 4): (29, "Lotus Shikhar (Honey Dew Acrylic) — July 15, 2023"),
    (4, 5): (91, "Fosfor Islander (Custom Lava Acrylic) — July 15, 2023"),
    (4, 6): (36, "ASA Transnauka (Blue Acrylic) — July 15, 2023"),
    (4, 7): (113, "ASA Transnauka (Tangerine Acrylic) — July 15, 2023"),
    (4, 8): (33, "ASA Transnauka (Clear Acrylic) — July 15, 2023"),
    (4, 9): (77, "ASA Nauka (Translucent Green) — July 15, 2023"),

    # Fig 5
    (5, 1): (85, "Vazir Rose Gold (Black & Rose Gold Trim) — July 15, 2023"),
    (5, 2): (62, "Ranga Zeal with Bock Nib (Blue Demonstrator) — July 15, 2023"),
    (5, 3): (48, "Kanwrite Desire (Clear Demonstrator) — July 15, 2023"),
    (5, 4): (5, "Kanwrite Desire (Translucent Blue) — July 15, 2023"),
    (5, 5): (83, "Ranga Bamboo (Clear Demonstrator) — July 15, 2023"),
    (5, 6): (117, "Click Aristocrat (Orange) — July 15, 2023"),

    # Fig 6
    (6, 1): (133, "Parker Vector (Classic Green) — July 15, 2023"),
    (6, 2): (139, "Ratnamson 302 (Blue Ebonite Swirl) — July 15, 2023"),
    (6, 3): (50, "Ratnamson 302 (Brick Red / Brown Ripple) — July 15, 2023"),
    (6, 4): (79, "Kanwrite Heritage (White Marbled) — July 15, 2023"),
    (6, 5): (80, "Kanwrite Heritage (Blue Swirl) — July 15, 2023"),
    (6, 6): (81, "Kanwrite Heritage (Brown Marbled) — July 15, 2023"),

    # Fig 7
    (7, 1): (136, "Ranga Bamboo (Blue Ripple Ebonite) — July 15, 2023"),
    (7, 2): (11, "Ranga Model 8 (Matte Black Bakul Ebonite) — July 15, 2023"),
    (7, 3): (14, "Ranga Model 8 (Premium Orange Ebonite) — July 15, 2023"),
    (7, 4): (39, "Lotus Custom (Blue with Yellow Swirl) — July 15, 2023"),
    (7, 5): (20, "Lotus Vikrant (Red Mono Acrylic) — July 15, 2023"),
    (7, 6): (19, "Lotus Vikrant (Blue Mono Acrylic) — July 15, 2023"),
    (7, 7): (93, "Lotus Vikrant (Green-Blue Lava Acrylic) — July 15, 2023"),
    (7, 8): (10, "Fosfor KOP (Conway Stewart Dartmoor Acrylic) — July 15, 2023"),
    (7, 9): (67, "ASA Durga (Brown Ebonite) — July 15, 2023"),

    # Fig 8
    (8, 1): (65, "Lamy Safari (Red) — July 15, 2023"),
    (8, 2): (64, "Lamy Safari (Blue) — July 15, 2023"),
    (8, 3): (69, "Lamy Safari (Mango Special Edition) — July 15, 2023"),
    (8, 4): (15, "Lamy 2000 (Makrolon Black) — July 15, 2023"),
    (8, 5): (59, "ASA Maya (Brown Matte Ebonite) — July 15, 2023"),
    (8, 6): (21, "ASA Maya (Black Matte Ebonite) — July 15, 2023"),
    (8, 7): (6, "ASA Titan (Titanium Nib, Blue & White) — July 15, 2023"),
    (8, 8): (82, "ASA Bhishma (Purple Lava Alumilite) — July 15, 2023"),
    (8, 9): (31, "ASA Mist (Clear Acrylic) — July 15, 2023"),
    (8, 10): (16, "ASA Athlete / Author (Ebonite) — July 15, 2023"),

    # Fig 9
    (9, 1): (110, "Pilot Prera (White / Classic) — July 15, 2023"),
    (9, 2): (52, "Jinhao 9035 (Reddish Wood) — July 15, 2023"),
    (9, 4): (43, "Gama Sneaky (Teal Orange Ripple) — July 15, 2023"),
    (9, 5): (124, "Gama Sneaky (Light Brown Swirl Tiger) — July 15, 2023"),
    (9, 6): (75, "Gama Sneaky (Khaki Green Ebonite Ripple) — July 15, 2023"),
    (9, 7): (74, "Guider Capsule (Red Acrylic) — July 15, 2023"),
    (9, 8): (17, "TWSBI Diamond 540 (Clear Transparent) — July 15, 2023"),
    (9, 9): (42, "TWSBI Vac 700 (Smoke Grey) — July 15, 2023"),
    (9, 10): (96, "TWSBI Diamond 540 (Sunset Orange) — July 15, 2023"),

    # Fig 10
    (10, 1): (142, "Visconti Salvador Dali (Surrealist Resin) — July 15, 2023"),
    (10, 2): (53, "Pilot Custom Heritage 91 (Black) — July 15, 2023"),
    (10, 3): (23, "Sailor 1911 (Black & Gold) — July 15, 2023"),

    # Fig 11
    (11, 1): (25, "Pilot Falcon with Fine Flex Nib (Black & Gold) — July 15, 2023"),
    (11, 2): (34, "Pelikan Classic M200 (Green Marbled) — July 15, 2023"),
    (11, 3): (47, "ASA Nauka (Black Ebonite) — July 15, 2023"),
    (11, 4): (1, "Pilot Vanishing Point (Canary Yellow) — July 15, 2023"),
    (11, 5): (2, "Pilot Vanishing Point (Blue Matte) — July 15, 2023"),
    (11, 6): (88, "ASA Elements (Translucent Blue Acrylic) — July 15, 2023"),

    # Fig 12
    (12, 1): (22, "Ranga Model 5 (Cherry Red Ebonite) — July 15, 2023"),
    (12, 2): (51, "Kanwrite Desire (Solid Black) — July 15, 2023"),
}


def crop_pens():
    """Crop all mapped pens and return dict: pen_id -> (bytes, caption, storage_key)."""
    results = {}
    pens_upload_dir = ROOT / "data" / "uploads" / "pens"
    pens_upload_dir.mkdir(parents=True, exist_ok=True)

    for (fig_idx, slot_idx), (pen_id, caption) in PEN_MAPPING.items():
        conf = FIGURES[fig_idx]
        im_path = ROOT / "scripts" / "blog_images" / conf["file"]
        im = Image.open(im_path)
        y1, y2 = conf["y"]
        # Find slot bounds
        match_slot = next(s for s in conf["slots"] if s[0] == slot_idx)
        _, x1, x2, custom_y2 = match_slot
        cur_y2 = custom_y2 if custom_y2 else y2

        crop = im.crop((x1, y1, x2, cur_y2))
        buf = io.BytesIO()
        crop.save(buf, format="WEBP", quality=92)
        webp_bytes = buf.getvalue()

        # Deterministic unique hash based on content
        content_hash = uuid.uuid5(uuid.NAMESPACE_DNS, f"pen_{pen_id}_s{slot_idx}_f{fig_idx}").hex[:8]
        filename = f"pen_{pen_id}_{content_hash}.webp"
        storage_key = f"pens/{filename}"

        # Write locally
        (pens_upload_dir / filename).write_bytes(webp_bytes)

        results[pen_id] = {
            "bytes": webp_bytes,
            "caption": caption,
            "storage_key": storage_key,
            "fig": fig_idx,
            "slot": slot_idx,
        }

    return results


def upload_to_supabase_s3(pen_crops):
    import boto3
    from botocore.config import Config

    endpoint = os.getenv("S3_ENDPOINT_URL")
    key_id = os.getenv("S3_ACCESS_KEY_ID")
    secret = os.getenv("S3_SECRET_ACCESS_KEY")
    bucket = os.getenv("S3_BUCKET", "pen-ink-uploads")
    region = os.getenv("S3_REGION", "us-east-1")

    if not endpoint or not key_id or not secret:
        print("[WARN] S3 credentials missing, skipping S3 upload.")
        return

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name=region,
        config=Config(signature_version="s3v4"),
    )

    print(f"Uploading {len(pen_crops)} pen photos to Supabase S3 bucket '{bucket}'...")
    uploaded = 0
    for pid, data in pen_crops.items():
        s3.put_object(
            Bucket=bucket,
            Key=data["storage_key"],
            Body=data["bytes"],
            ContentType="image/webp",
        )
        uploaded += 1
        if uploaded % 20 == 0 or uploaded == len(pen_crops):
            print(f"  [S3] Uploaded {uploaded}/{len(pen_crops)} photos...")
    print("S3 upload complete.")


def update_local_sqlite(pen_crops):
    sqlite_path = ROOT / "data" / "pen_ink.db"
    conn = sqlite3.connect(str(sqlite_path))
    c = conn.cursor()

    now = datetime.now().isoformat()
    for pid, data in pen_crops.items():
        # Insert into pen_photos
        c.execute(
            "INSERT INTO pen_photos (pen_id, storage_key, caption, created_at) VALUES (?, ?, ?, ?)",
            (pid, data["storage_key"], data["caption"], now)
        )
        # Update pen primary_photo_key
        c.execute(
            "UPDATE pens SET primary_photo_key = ?, updated_at = ? WHERE id = ?",
            (data["storage_key"], now, pid)
        )

    conn.commit()
    conn.close()
    print(f"Updated local SQLite: {len(pen_crops)} pens with photos.")


def update_remote_postgres(pen_crops):
    raw_url = os.getenv("DATABASE_URL")
    if not raw_url:
        print("[WARN] DATABASE_URL missing, skipping PostgreSQL update.")
        return

    db_url = re.sub(r"^postgresql(\+\w+)?://", "postgresql+pg8000://", raw_url)
    engine = create_engine(db_url)

    now = datetime.now()
    with engine.begin() as conn:
        for pid, data in pen_crops.items():
            conn.execute(
                text(
                    "INSERT INTO pen_photos (pen_id, storage_key, caption, created_at) "
                    "VALUES (:pen_id, :key, :caption, :created_at)"
                ),
                {
                    "pen_id": pid,
                    "key": data["storage_key"],
                    "caption": data["caption"],
                    "created_at": now,
                }
            )
            conn.execute(
                text("UPDATE pens SET primary_photo_key = :key, updated_at = :now WHERE id = :pen_id"),
                {"key": data["storage_key"], "now": now, "pen_id": pid}
            )

    print(f"Updated remote Supabase PostgreSQL: {len(pen_crops)} pens with photos.")


def verify_supabase_access(pen_crops):
    base_url = "https://zjxyhhgrcvensgeyihnp.storage.supabase.co/storage/v1/object/public/pen-ink-uploads/"
    sample_pids = [1, 2, 15, 25, 65, 142]
    print("\nVerifying Supabase Storage public access:")
    for pid in sample_pids:
        if pid in pen_crops:
            k = pen_crops[pid]["storage_key"]
            url = base_url + k
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    print(f"  [OK] Pen {pid:3d} ({k}) -> HTTP {resp.status} ({resp.headers.get('Content-Type')})")
            except Exception as e:
                print(f"  [FAIL] Pen {pid:3d} -> {e}")


def main():
    print("=" * 65)
    print("  Importing Pen Collection Photos (July 15, 2023 Blog Post)")
    print("=" * 65)

    # 1. Pre-backup
    b1 = create_database_backup(trigger="pre_pen_photos_import")
    print(f"Pre-import backup created: {b1['filename']} (v{b1['version']})")

    # 2. Crop pens
    pen_crops = crop_pens()
    print(f"Cropped and prepared {len(pen_crops)} pen photos.")

    # 3. Save to local SQLite
    update_local_sqlite(pen_crops)

    # 4. Post-backup
    b2 = create_database_backup(trigger="post_pen_photos_import")
    print(f"Post-import backup created: {b2['filename']} (v{b2['version']})")

    # 5. Upload to Supabase S3
    upload_to_supabase_s3(pen_crops)

    # 6. Update cloud Supabase PostgreSQL
    update_remote_postgres(pen_crops)

    # 7. Verify public S3 storage access
    verify_supabase_access(pen_crops)

    print("\n[SUCCESS] Successfully imported photos for 87 pens across local & cloud!")


if __name__ == "__main__":
    main()

