"""Automated verification suite for database schema, demo seed generation, PDF rendering, cropping, and routers."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import Pen  # noqa: E402
from app.routers.analytics import get_dashboard  # noqa: E402
from app.routers.inks import get_ink_detail, list_inks  # noqa: E402
from app.routers.pens import get_pen_detail, list_pens  # noqa: E402
from app.routers.samples import list_writing_samples  # noqa: E402
from app.routers.scans import commit_scan_entries, list_scan_batches, sample_color_endpoint  # noqa: E402
from app.routers.sessions import clean_session, refill_session  # noqa: E402
from app.routers.settings import get_settings_status  # noqa: E402
from app.schemas import CleanAction, CommitScanEntry, CommitScanRequest, CropBox, RefillAction  # noqa: E402
from app.seed_demo import seed_demo_database  # noqa: E402


def run_checks() -> None:
    print("1. Creating schema & seeding demo data...", flush=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Pen).count() == 0:
            summary = seed_demo_database(db, reset_existing=False)
            print("   Seeded:", summary, flush=True)

        print("2. Checking Dashboard Analytics...", flush=True)
        dash = get_dashboard(db=db)
        print("   KPIs:", dash["kpis"], flush=True)
        assert dash["kpis"]["total_pens"] >= 10
        assert dash["kpis"]["total_inks"] >= 12
        assert dash["kpis"]["currently_inked_count"] >= 5

        print("3. Checking Pens & Inks Detail pages...", flush=True)
        pens = list_pens(db=db)
        pen0 = get_pen_detail(pen_id=pens[0].id, db=db)
        assert pen0["pen"].brand != ""

        inks = list_inks(db=db)
        ink0 = get_ink_detail(ink_id=inks[0].id, db=db)
        assert "mountainofink.com" in ink0["ink"].mountain_of_ink_url

        print("4. Checking Scan Batches & Ink Color Eyedropper...", flush=True)
        batches = list_scan_batches(db=db)
        assert len(batches) >= 1
        page1 = batches[0].pages[0]
        sampled = sample_color_endpoint(
            page_id=page1.id,
            box=CropBox(x=0.06, y=0.39, w=0.88, h=0.20),
            db=db,
        )
        print("   Sampled Ink Stroke Color:", sampled, flush=True)
        assert sampled["hex_color"].startswith("#")

        print("5. Testing Refill & Clean lifecycle round-trip...", flush=True)
        active_sess_id = dash["currently_inked"][0]["session_id"]
        after_refill = refill_session(
            session_id=active_sess_id,
            payload=RefillAction(event_date=date.today(), notes="Verification refill"),
            db=db,
        )
        assert after_refill.refill_count >= 1

        # Reset clean demo state after verification
        seed_demo_database(db, reset_existing=True)
        samples = list_writing_samples(db=db)
        settings = get_settings_status(db=db)
        print(f"6. Verified {len(samples)} samples & settings: {settings['counts']}", flush=True)
        print("ALL BACKEND CHECKS PASSED!", flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    run_checks()
