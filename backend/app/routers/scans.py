"""Multi-Page PDF Scan Upload, AI Vision / Offline Analysis, Ink Eyedropper, and Batch Commit."""

from __future__ import annotations

from datetime import date, timedelta
import json
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Ink, Pen, ScanBatch, ScanPage, WritingSample
from ..schemas import (
    AddEntryOnPageRequest,
    AnalyzeScanRequest,
    CommitScanRequest,
    CropBox,
    ScanBatchOut,
)
from ..serializers import serialize_scan_batch
from ..services.lifecycle import create_usage_session
from ..services.pdf_vision import (
    analyze_scan_page,
    crop_sample_bytes,
    render_document_pages,
    sample_ink_color_from_region,
)
from ..storage import storage

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _batch_query(db: Session):
    return db.query(ScanBatch).options(
        joinedload(ScanBatch.pages).joinedload(ScanPage.samples).joinedload(WritingSample.pen),
        joinedload(ScanBatch.pages).joinedload(ScanPage.samples).joinedload(WritingSample.ink),
        joinedload(ScanBatch.pages).joinedload(ScanPage.samples).joinedload(WritingSample.session),
    )


def _load_batch(db: Session, batch_id: int) -> ScanBatch:
    batch = _batch_query(db).filter(ScanBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Scan batch not found")
    return batch


@router.get("", response_model=list[ScanBatchOut])
def list_scan_batches(db: Session = Depends(get_db)) -> list[ScanBatchOut]:
    batches = _batch_query(db).order_by(ScanBatch.uploaded_at.desc()).all()
    return [serialize_scan_batch(b) for b in batches]


@router.get("/{batch_id}", response_model=ScanBatchOut)
def get_scan_batch(batch_id: int, db: Session = Depends(get_db)) -> ScanBatchOut:
    return serialize_scan_batch(_load_batch(db, batch_id))


@router.post("/upload", response_model=ScanBatchOut)
async def upload_scan_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)) -> ScanBatchOut:
    raw_bytes = await file.read()
    filename = file.filename or "notebook_scan.pdf"
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    pdf_key = storage.save_bytes("pdfs", filename, raw_bytes)
    rendered_pages = render_document_pages(raw_bytes, filename)

    batch = ScanBatch(
        original_filename=filename,
        pdf_storage_key=pdf_key,
        page_count=len(rendered_pages),
        status="uploaded",
        is_demo=False,
    )
    db.add(batch)
    db.flush()

    for idx, (page_bytes, w_px, h_px, meta_json) in enumerate(rendered_pages, start=1):
        img_key = storage.save_bytes("pages", f"batch{batch.id}_p{idx}.webp", page_bytes)
        db.add(
            ScanPage(
                batch_id=batch.id,
                page_number=idx,
                image_storage_key=img_key,
                width_px=w_px,
                height_px=h_px,
                extracted_json=meta_json or "[]",
                processed=False,
            )
        )

    db.commit()
    return serialize_scan_batch(_load_batch(db, batch.id))


@router.post("/{batch_id}/analyze")
def analyze_batch(
    batch_id: int,
    payload: AnalyzeScanRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    batch = _load_batch(db, batch_id)
    target_pages = [
        p
        for p in batch.pages
        if payload.page_numbers is None or p.page_number in payload.page_numbers
    ]
    if not target_pages:
        raise HTTPException(status_code=400, detail="No matching pages selected for analysis")

    mode_used = "offline_layout"
    for page in target_pages:
        _, mode_used = analyze_scan_page(db, page)

    batch.status = "reviewed"
    db.commit()
    return {
        "mode_used": mode_used,
        "batch": serialize_scan_batch(_load_batch(db, batch.id)),
    }


@router.post("/pages/{page_id}/sample-color")
def sample_color_endpoint(page_id: int, box: CropBox, db: Session = Depends(get_db)) -> dict[str, str]:
    page = db.query(ScanPage).filter(ScanPage.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Scan page not found")
    page_path = storage.resolve_path(page.image_storage_key)
    hex_color, family = sample_ink_color_from_region(page_path, box)
    return {"hex_color": hex_color, "color_family": family}


@router.post("/pages/{page_id}/entries", response_model=ScanBatchOut)
def add_entry_on_committed_page(
    page_id: int,
    payload: AddEntryOnPageRequest,
    db: Session = Depends(get_db),
) -> ScanBatchOut:
    """Add a missed or supplementary notebook entry directly onto a ScanPage."""
    page = (
        db.query(ScanPage)
        .options(joinedload(ScanPage.batch))
        .filter(ScanPage.id == page_id)
        .first()
    )
    if not page:
        raise HTTPException(status_code=404, detail="Scan page not found")

    pen_id = payload.pen_id
    if not pen_id and payload.new_pen:
        new_pen = Pen(**payload.new_pen.model_dump())
        db.add(new_pen)
        db.flush()
        pen_id = new_pen.id

    ink_id = payload.ink_id
    if not ink_id and payload.new_ink:
        new_ink = Ink(**payload.new_ink.model_dump())
        db.add(new_ink)
        db.flush()
        ink_id = new_ink.id

    if not pen_id or not ink_id:
        raise HTTPException(status_code=400, detail="Both pen and ink are required")

    cleaned_dt = payload.date_cleaned
    if payload.end_status != "active" and cleaned_dt is None:
        cleaned_dt = min(date.today(), payload.date_inked + timedelta(days=21))

    sess = create_usage_session(
        db,
        pen_id=pen_id,
        ink_id=ink_id,
        date_inked=payload.date_inked,
        date_cleaned=cleaned_dt if payload.end_status != "active" else None,
        end_status=payload.end_status,
        session_notes=payload.session_notes or payload.transcription,
        close_previous_active=(payload.end_status == "active"),
        source="pdf_scan",
    )

    page_path = storage.resolve_path(page.image_storage_key)
    cropped_bytes = crop_sample_bytes(page_path, payload.crop_box)
    sample_key = storage.save_bytes(
        "samples",
        f"scan_b{page.batch_id}_p{page.page_number}_s{sess.id}.webp",
        cropped_bytes,
    )

    db.add(
        WritingSample(
            session_id=sess.id,
            pen_id=pen_id,
            ink_id=ink_id,
            scan_page_id=page.id,
            image_storage_key=sample_key,
            crop_box_json=json.dumps(payload.crop_box.model_dump()),
            sample_date=payload.date_inked,
            transcription=payload.transcription,
            caption=payload.caption or f"Page {page.page_number} · {page.batch.original_filename}",
        )
    )
    page.processed = True
    db.commit()
    db.expire_all()
    return serialize_scan_batch(_load_batch(db, page.batch_id))


@router.post("/{batch_id}/commit")
def commit_scan_entries(
    batch_id: int,
    payload: CommitScanRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    batch = _load_batch(db, batch_id)
    pages_by_id = {p.id: p for p in batch.pages}

    created_sessions = 0
    created_pens = 0
    created_inks = 0

    # Process entries in chronological order so older fills auto-close cleanly before newer fills!
    sorted_entries = sorted(payload.entries, key=lambda item: item.date_inked)

    for entry in sorted_entries:
        page = pages_by_id.get(entry.page_id)
        if not page:
            continue

        pen_id = entry.pen_id
        if not pen_id and entry.new_pen:
            new_pen = Pen(**entry.new_pen.model_dump())
            db.add(new_pen)
            db.flush()
            pen_id = new_pen.id
            created_pens += 1

        ink_id = entry.ink_id
        if not ink_id and entry.new_ink:
            new_ink = Ink(**entry.new_ink.model_dump())
            db.add(new_ink)
            db.flush()
            ink_id = new_ink.id
            created_inks += 1

        if not pen_id or not ink_id:
            continue

        sess = create_usage_session(
            db,
            pen_id=pen_id,
            ink_id=ink_id,
            date_inked=entry.date_inked,
            end_status="active",
            session_notes=entry.session_notes,
            close_previous_active=entry.close_previous_active,
            source="pdf_scan",
        )

        # Crop writing sample from the high-DPI page render
        page_path = storage.resolve_path(page.image_storage_key)
        cropped_bytes = crop_sample_bytes(page_path, entry.crop_box)
        sample_key = storage.save_bytes(
            "samples",
            f"scan_b{batch.id}_p{page.page_number}_s{sess.id}.webp",
            cropped_bytes,
        )

        db.add(
            WritingSample(
                session_id=sess.id,
                pen_id=pen_id,
                ink_id=ink_id,
                scan_page_id=page.id,
                image_storage_key=sample_key,
                crop_box_json=json.dumps(entry.crop_box.model_dump()),
                sample_date=entry.date_inked,
                transcription=entry.transcription,
                caption=entry.caption or f"Page {page.page_number} · {batch.original_filename}",
            )
        )
        page.processed = True
        created_sessions += 1

    batch.status = "committed"
    db.commit()
    return {
        "created_sessions": created_sessions,
        "created_pens": created_pens,
        "created_inks": created_inks,
        "batch": serialize_scan_batch(_load_batch(db, batch.id)),
    }


@router.delete("/{batch_id}")
def delete_scan_batch(batch_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    batch = db.query(ScanBatch).filter(ScanBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Scan batch not found")
    db.delete(batch)
    db.commit()
    return {"status": "deleted"}
