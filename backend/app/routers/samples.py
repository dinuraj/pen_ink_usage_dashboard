"""Writing Samples Explorer, Standalone Sample Upload, and Post-OCR Sample Correction API."""

from __future__ import annotations

import io
import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Ink, LifecycleEvent, Pen, WritingSample
from ..schemas import SampleCorrectionUpdate, WritingSampleOut
from ..serializers import serialize_writing_sample
from ..services.pdf_vision import crop_sample_bytes
from ..storage import storage

router = APIRouter(prefix="/api/samples", tags=["samples"])


def _load_sample(db: Session, sample_id: int) -> WritingSample:
    ws = (
        db.query(WritingSample)
        .options(
            joinedload(WritingSample.pen),
            joinedload(WritingSample.ink),
            joinedload(WritingSample.scan_page),
            joinedload(WritingSample.session),
        )
        .filter(WritingSample.id == sample_id)
        .first()
    )
    if not ws:
        raise HTTPException(status_code=404, detail="Writing sample not found")
    return ws


@router.get("", response_model=list[WritingSampleOut])
def list_writing_samples(
    pen_id: int | None = None,
    ink_id: int | None = None,
    color_family: str | None = None,
    nib_size: str | None = None,
    db: Session = Depends(get_db),
) -> list[WritingSampleOut]:
    q = db.query(WritingSample).options(
        joinedload(WritingSample.pen),
        joinedload(WritingSample.ink),
        joinedload(WritingSample.scan_page),
    )
    if pen_id:
        q = q.filter(WritingSample.pen_id == pen_id)
    if ink_id:
        q = q.filter(WritingSample.ink_id == ink_id)
    if color_family:
        q = q.join(WritingSample.ink).filter(Ink.color_family == color_family)
    if nib_size:
        q = q.join(WritingSample.pen).filter(Pen.nib_size == nib_size)

    rows = q.order_by(WritingSample.sample_date.desc(), WritingSample.id.desc()).all()
    return [serialize_writing_sample(ws) for ws in rows]


@router.post("/upload", response_model=WritingSampleOut)
async def upload_standalone_sample(
    pen_id: int = Form(...),
    ink_id: int = Form(...),
    sample_date: str = Form(...),
    caption: str = Form(""),
    transcription: str = Form(""),
    session_id: int | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> WritingSampleOut:
    pen = db.query(Pen).filter(Pen.id == pen_id).first()
    ink = db.query(Ink).filter(Ink.id == ink_id).first()
    if not pen or not ink:
        raise HTTPException(status_code=404, detail="Pen or Ink not found")

    raw = await file.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((2200, 2200))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=92)

    key = storage.save_bytes("samples", f"sample_p{pen_id}_i{ink_id}.webp", buf.getvalue())
    dt = date.fromisoformat(sample_date[:10])

    ws = WritingSample(
        session_id=session_id,
        pen_id=pen_id,
        ink_id=ink_id,
        image_storage_key=key,
        sample_date=dt,
        caption=caption,
        transcription=transcription,
    )
    db.add(ws)
    db.commit()
    return serialize_writing_sample(_load_sample(db, ws.id))


@router.patch("/{sample_id}", response_model=WritingSampleOut)
def update_and_correct_sample(
    sample_id: int,
    payload: SampleCorrectionUpdate,
    db: Session = Depends(get_db),
) -> WritingSampleOut:
    """Correct OCR-imported sample metadata, linked UsageSession, and/or re-crop bounding box."""
    ws = _load_sample(db, sample_id)

    # 1. Resolve Pen reassignment or inline creation
    if payload.new_pen is not None:
        new_pen = Pen(**payload.new_pen.model_dump())
        db.add(new_pen)
        db.flush()
        ws.pen_id = new_pen.id
    elif payload.pen_id is not None:
        if not db.query(Pen).filter(Pen.id == payload.pen_id).first():
            raise HTTPException(status_code=404, detail="Target pen not found")
        ws.pen_id = payload.pen_id

    # 2. Resolve Ink reassignment or inline creation
    if payload.new_ink is not None:
        new_ink = Ink(**payload.new_ink.model_dump())
        db.add(new_ink)
        db.flush()
        ws.ink_id = new_ink.id
    elif payload.ink_id is not None:
        if not db.query(Ink).filter(Ink.id == payload.ink_id).first():
            raise HTTPException(status_code=404, detail="Target ink not found")
        ws.ink_id = payload.ink_id

    # 3. Sample metadata updates
    if payload.sample_date is not None:
        ws.sample_date = payload.sample_date
    if payload.rating is not None:
        ws.rating = payload.rating
    if payload.transcription is not None:
        ws.transcription = payload.transcription
    if payload.caption is not None:
        ws.caption = payload.caption

    # 4. Sync linked UsageSession so dashboard analytics & rotation stay 100% consistent
    if ws.session is not None:
        sess = ws.session
        sess.pen_id = ws.pen_id
        sess.ink_id = ws.ink_id
        if payload.sample_date is not None:
            sess.date_inked = payload.sample_date
            inked_ev = (
                db.query(LifecycleEvent)
                .filter(LifecycleEvent.session_id == sess.id, LifecycleEvent.event_type == "inked")
                .first()
            )
            if inked_ev:
                inked_ev.event_date = payload.sample_date

        if payload.session_notes is not None:
            sess.session_notes = payload.session_notes
        elif payload.transcription is not None:
            sess.session_notes = payload.transcription

        if payload.end_status is not None:
            sess.end_status = payload.end_status
            if payload.end_status == "active":
                sess.date_cleaned = None
            elif sess.date_cleaned is None:
                sess.date_cleaned = payload.date_cleaned or min(date.today(), sess.date_inked + timedelta(days=21))

        if payload.clear_date_cleaned:
            sess.date_cleaned = None
        elif payload.date_cleaned is not None:
            sess.date_cleaned = payload.date_cleaned

    # 5. Re-crop image from source scan page if crop_box was adjusted
    if payload.crop_box is not None:
        new_box_json = json.dumps(payload.crop_box.model_dump())
        if new_box_json != ws.crop_box_json and ws.scan_page is not None:
            page_path = storage.resolve_path(ws.scan_page.image_storage_key)
            if page_path.exists():
                cropped_bytes = crop_sample_bytes(page_path, payload.crop_box)
                ws.image_storage_key = storage.save_bytes(
                    "samples",
                    f"recrop_p{ws.scan_page.page_number}_s{ws.id}.webp",
                    cropped_bytes,
                )
        ws.crop_box_json = new_box_json

    db.commit()
    db.expire_all()
    return serialize_writing_sample(_load_sample(db, sample_id))


class SampleRatingUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)


@router.patch("/{sample_id}/rating", response_model=WritingSampleOut)
def rate_writing_sample(
    sample_id: int,
    payload: SampleRatingUpdate,
    db: Session = Depends(get_db),
) -> WritingSampleOut:
    """Quickly update the 1-5 star satisfaction rating for a writing sample."""
    ws = _load_sample(db, sample_id)
    ws.rating = payload.rating
    db.commit()
    db.expire_all()
    return serialize_writing_sample(_load_sample(db, sample_id))


@router.delete("/{sample_id}")
def delete_sample(
    sample_id: int,
    delete_session: bool = Query(False),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    ws = _load_sample(db, sample_id)
    linked_sess = ws.session if delete_session else None
    db.delete(ws)
    if linked_sess is not None:
        db.delete(linked_sess)
    db.commit()
    return {"status": "deleted"}
