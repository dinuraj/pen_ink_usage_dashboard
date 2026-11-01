"""Pen Cabinet CRUD, photo gallery uploads, custom notes, and Pen Detail history."""

from __future__ import annotations

import io
from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Pen, PenPhoto, UsageSession, WritingSample
from ..schemas import MergeTargetRequest, PenCreate, PenOut, PenUpdate
from ..serializers import (
    serialize_pen,
    serialize_pen_photos,
    serialize_session,
    serialize_writing_sample,
)
from ..storage import storage

router = APIRouter(prefix="/api/pens", tags=["pens"])


@router.get("", response_model=list[PenOut])
def list_pens(db: Session = Depends(get_db)) -> list[PenOut]:
    pens = (
        db.query(Pen)
        .options(
            joinedload(Pen.sessions).joinedload(UsageSession.ink),
            joinedload(Pen.writing_samples),
        )
        .order_by(Pen.brand.asc(), Pen.model.asc(), Pen.color_variant.asc())
        .all()
    )
    return [serialize_pen(p) for p in pens]


@router.post("", response_model=PenOut)
def create_pen(payload: PenCreate, db: Session = Depends(get_db)) -> PenOut:
    pen = Pen(**payload.model_dump())
    db.add(pen)
    db.commit()
    db.refresh(pen)
    return serialize_pen(pen)


@router.get("/{pen_id}")
def get_pen_detail(pen_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    pen = (
        db.query(Pen)
        .options(
            joinedload(Pen.photos),
            joinedload(Pen.sessions).joinedload(UsageSession.ink),
            joinedload(Pen.sessions).joinedload(UsageSession.pen),
            joinedload(Pen.sessions).joinedload(UsageSession.events),
            joinedload(Pen.sessions).joinedload(UsageSession.samples).joinedload(WritingSample.pen),
            joinedload(Pen.sessions).joinedload(UsageSession.samples).joinedload(WritingSample.ink),
            joinedload(Pen.sessions).joinedload(UsageSession.samples).joinedload(WritingSample.scan_page),
            joinedload(Pen.writing_samples).joinedload(WritingSample.ink),
            joinedload(Pen.writing_samples).joinedload(WritingSample.pen),
            joinedload(Pen.writing_samples).joinedload(WritingSample.scan_page),
        )
        .filter(Pen.id == pen_id)
        .first()
    )
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")

    fav_ink = None
    if pen.sessions:
        counts = Counter(s.ink_id for s in pen.sessions)
        top_ink_id, top_count = counts.most_common(1)[0]
        ink_obj = next((s.ink for s in pen.sessions if s.ink_id == top_ink_id), None)
        if ink_obj:
            fav_ink = {
                "id": ink_obj.id,
                "name": ink_obj.display_name,
                "hex_color": ink_obj.hex_color,
                "count": top_count,
            }

    return {
        "pen": serialize_pen(pen),
        "photos": serialize_pen_photos(pen),
        "favorite_ink": fav_ink,
        "sessions": [serialize_session(s) for s in pen.sessions],
        "samples": [serialize_writing_sample(ws) for ws in pen.writing_samples],
    }


@router.patch("/{pen_id}", response_model=PenOut)
def update_pen(pen_id: int, payload: PenUpdate, db: Session = Depends(get_db)) -> PenOut:
    pen = (
        db.query(Pen)
        .options(joinedload(Pen.sessions).joinedload(UsageSession.ink), joinedload(Pen.writing_samples))
        .filter(Pen.id == pen_id)
        .first()
    )
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(pen, field, val)
    db.commit()
    db.refresh(pen)
    return serialize_pen(pen)


@router.post("/{pen_id}/merge", response_model=PenOut)
def merge_pen_into_target(
    pen_id: int,
    payload: MergeTargetRequest,
    db: Session = Depends(get_db),
) -> PenOut:
    """Merge duplicate Pen into target_id, moving all sessions, writing samples, and photos."""
    if pen_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a pen into itself")

    source = db.query(Pen).filter(Pen.id == pen_id).first()
    target = db.query(Pen).filter(Pen.id == payload.target_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or target pen not found")

    db.query(UsageSession).filter(UsageSession.pen_id == pen_id).update(
        {UsageSession.pen_id: target.id}, synchronize_session=False
    )
    db.query(WritingSample).filter(WritingSample.pen_id == pen_id).update(
        {WritingSample.pen_id: target.id}, synchronize_session=False
    )
    db.query(PenPhoto).filter(PenPhoto.pen_id == pen_id).update(
        {PenPhoto.pen_id: target.id}, synchronize_session=False
    )

    if source.primary_photo_key and not target.primary_photo_key:
        target.primary_photo_key = source.primary_photo_key
    if source.custom_notes.strip():
        target.custom_notes = (
            f"{target.custom_notes}\n\n{source.custom_notes}".strip()
            if target.custom_notes.strip()
            else source.custom_notes.strip()
        )

    db.flush()
    db.expire_all()
    source_reload = db.query(Pen).filter(Pen.id == pen_id).first()
    if source_reload:
        db.delete(source_reload)
    db.commit()

    merged = (
        db.query(Pen)
        .options(joinedload(Pen.sessions).joinedload(UsageSession.ink), joinedload(Pen.writing_samples))
        .filter(Pen.id == target.id)
        .first()
    )
    return serialize_pen(merged)


@router.delete("/{pen_id}")
def delete_pen(pen_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    pen = db.query(Pen).filter(Pen.id == pen_id).first()
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    db.delete(pen)
    db.commit()
    return {"status": "deleted"}


@router.post("/{pen_id}/photos")
async def upload_pen_photo(
    pen_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    set_primary: bool = Form(True),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pen = db.query(Pen).filter(Pen.id == pen_id).first()
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")

    raw = await file.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((1600, 1600))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=90)

    key = storage.save_bytes("pens", f"pen_{pen_id}.webp", buf.getvalue())
    photo = PenPhoto(pen_id=pen_id, storage_key=key, caption=caption)
    db.add(photo)
    if set_primary or not pen.primary_photo_key:
        pen.primary_photo_key = key
    db.commit()
    db.refresh(photo)
    return {
        "id": photo.id,
        "url": storage.get_public_url(key),
        "caption": photo.caption,
        "primary_photo_url": storage.get_public_url(pen.primary_photo_key),
    }
