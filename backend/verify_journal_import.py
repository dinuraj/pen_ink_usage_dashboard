"""Verifies the imported 32-page user ink journal and all OCR correction / re-crop / merge endpoints."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal  # noqa: E402
from app.models import Pen  # noqa: E402
from app.routers.analytics import get_dashboard  # noqa: E402
from app.routers.pens import create_pen, merge_pen_into_target  # noqa: E402
from app.routers.samples import list_writing_samples, update_and_correct_sample  # noqa: E402
from app.routers.scans import list_scan_batches  # noqa: E402
from app.routers.sessions import update_session_endpoint  # noqa: E402
from app.schemas import CropBox, MergeTargetRequest, PenCreate, SampleCorrectionUpdate, SessionUpdate  # noqa: E402
from app.storage import storage  # noqa: E402


def verify() -> None:
    db = SessionLocal()
    try:
        dash = get_dashboard(db=db)
        kpis = dash["kpis"]
        print("1. Dashboard KPIs:", kpis)
        assert kpis["total_pens"] == 112, f"Expected 112 pens, got {kpis['total_pens']}"
        assert kpis["total_inks"] == 91, f"Expected 91 inks, got {kpis['total_inks']}"
        assert kpis["total_sessions"] == 268, f"Expected 268 sessions, got {kpis['total_sessions']}"
        assert kpis["currently_inked_count"] == 5, f"Expected 5 active, got {kpis['currently_inked_count']}"
        assert kpis["total_writing_samples"] == 268, f"Expected 268 samples, got {kpis['total_writing_samples']}"

        print("2. Active (Currently Inked) pens:")
        for row in dash["currently_inked"]:
            print(f"   - {row['pen_brand']} {row['pen_model']} ({row['pen_color']}) x {row['ink_brand']} {row['ink_name']} [{row['date_inked']}]")

        batches = list_scan_batches(db=db)
        assert len(batches) == 1, f"Expected 1 scan batch, got {len(batches)}"
        b0 = batches[0]
        assert b0.page_count == 32, f"Expected 32 pages, got {b0.page_count}"
        assert b0.is_demo is False
        total_imp = sum(len(p.imported_entries) for p in b0.pages)
        assert total_imp == 268, f"Expected 268 imported entries across pages, got {total_imp}"
        assert len(b0.pages[0].imported_entries) == 0  # Title page
        assert len(b0.pages[31].imported_entries) == 5  # Spread 32

        print("3. Verifying all 268 cropped sample files exist on disk...")
        samples = list_writing_samples(db=db)
        assert len(samples) == 268
        for ws in samples:
            assert ws.scan_batch_id == b0.id
            assert ws.scan_page_number is not None
            rel_key = ws.image_url.removeprefix("/media/")
            disk_path = storage.resolve_path(rel_key)
            assert disk_path.exists() and disk_path.stat().st_size > 100, f"Missing sample file: {disk_path}"

        print("4. Testing Sample OCR Correction & Re-Crop round-trip...")
        target_ws = samples[0]
        orig_box = CropBox(**json.loads(target_ws.crop_box_json))
        orig_notes = target_ws.transcription

        tweaked_box = CropBox(
            x=orig_box.x,
            y=orig_box.y,
            w=orig_box.w,
            h=round(max(0.06, orig_box.h - 0.01), 3),
        )
        updated_ws = update_and_correct_sample(
            sample_id=target_ws.id,
            payload=SampleCorrectionUpdate(transcription="Verified OCR test", crop_box=tweaked_box),
            db=db,
        )
        assert updated_ws.transcription == "Verified OCR test"

        # Restore exact original crop & transcription
        restored_ws = update_and_correct_sample(
            sample_id=target_ws.id,
            payload=SampleCorrectionUpdate(transcription=orig_notes, crop_box=orig_box),
            db=db,
        )
        assert restored_ws.transcription == orig_notes

        print("5. Testing Session Update & Duplicate Pen Merge round-trip...")
        if restored_ws.session_id:
            s_out = update_session_endpoint(
                session_id=restored_ws.session_id,
                payload=SessionUpdate(session_notes=orig_notes),
                db=db,
            )
            assert s_out.id == restored_ws.session_id

        # Create temporary duplicate pen and merge it into an existing pen (0 net change!)
        existing_pen = db.query(Pen).first()
        temp_dup = create_pen(
            payload=PenCreate(brand="TempDup", model="TestMerge", color_variant="Demo"),
            db=db,
        )
        merged_pen = merge_pen_into_target(
            pen_id=temp_dup.id,
            payload=MergeTargetRequest(target_id=existing_pen.id),
            db=db,
        )
        assert merged_pen.id == existing_pen.id
        assert db.query(Pen).count() == 112

        print("ALL JOURNAL IMPORT & OCR CORRECTION VERIFICATIONS PASSED!")
    finally:
        db.close()


if __name__ == "__main__":
    verify()
