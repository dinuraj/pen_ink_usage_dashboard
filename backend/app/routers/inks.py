"""Ink Library CRUD, remaining volume levels, Mountain of Ink links, notes, and Ink Detail."""

from __future__ import annotations

from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Ink, UsageSession, WritingSample
from ..schemas import InkCreate, InkOut, InkUpdate, MergeTargetRequest
from ..serializers import serialize_ink, serialize_session, serialize_writing_sample

router = APIRouter(prefix="/api/inks", tags=["inks"])


@router.get("", response_model=list[InkOut])
def list_inks(db: Session = Depends(get_db)) -> list[InkOut]:
    inks = (
        db.query(Ink)
        .options(joinedload(Ink.sessions), joinedload(Ink.writing_samples))
        .order_by(Ink.brand.asc(), Ink.name.asc())
        .all()
    )
    return [serialize_ink(i) for i in inks]


@router.post("", response_model=InkOut)
def create_ink(payload: InkCreate, db: Session = Depends(get_db)) -> InkOut:
    ink = Ink(**payload.model_dump())
    db.add(ink)
    db.commit()
    db.refresh(ink)
    return serialize_ink(ink)


@router.get("/{ink_id}")
def get_ink_detail(ink_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    ink = (
        db.query(Ink)
        .options(
            joinedload(Ink.sessions).joinedload(UsageSession.pen),
            joinedload(Ink.sessions).joinedload(UsageSession.ink),
            joinedload(Ink.sessions).joinedload(UsageSession.events),
            joinedload(Ink.sessions).joinedload(UsageSession.samples).joinedload(WritingSample.pen),
            joinedload(Ink.sessions).joinedload(UsageSession.samples).joinedload(WritingSample.ink),
            joinedload(Ink.sessions).joinedload(UsageSession.samples).joinedload(WritingSample.scan_page),
            joinedload(Ink.writing_samples).joinedload(WritingSample.pen),
            joinedload(Ink.writing_samples).joinedload(WritingSample.ink),
            joinedload(Ink.writing_samples).joinedload(WritingSample.scan_page),
        )
        .filter(Ink.id == ink_id)
        .first()
    )
    if not ink:
        raise HTTPException(status_code=404, detail="Ink not found")

    fav_pen = None
    if ink.sessions:
        counts = Counter(s.pen_id for s in ink.sessions)
        top_pen_id, top_count = counts.most_common(1)[0]
        pen_obj = next((s.pen for s in ink.sessions if s.pen_id == top_pen_id), None)
        if pen_obj:
            fav_pen = {
                "id": pen_obj.id,
                "name": pen_obj.display_name,
                "nib_size": pen_obj.nib_size,
                "count": top_count,
            }

    return {
        "ink": serialize_ink(ink),
        "favorite_pen": fav_pen,
        "sessions": [serialize_session(s) for s in ink.sessions],
        "samples": [serialize_writing_sample(ws) for ws in ink.writing_samples],
    }


@router.patch("/{ink_id}", response_model=InkOut)
def update_ink(ink_id: int, payload: InkUpdate, db: Session = Depends(get_db)) -> InkOut:
    ink = (
        db.query(Ink)
        .options(joinedload(Ink.sessions), joinedload(Ink.writing_samples))
        .filter(Ink.id == ink_id)
        .first()
    )
    if not ink:
        raise HTTPException(status_code=404, detail="Ink not found")

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(ink, field, val)
    db.commit()
    db.refresh(ink)
    return serialize_ink(ink)


@router.post("/{ink_id}/merge", response_model=InkOut)
def merge_ink_into_target(
    ink_id: int,
    payload: MergeTargetRequest,
    db: Session = Depends(get_db),
) -> InkOut:
    """Merge duplicate Ink into target_id, moving all sessions and writing samples."""
    if ink_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Cannot merge an ink into itself")

    source = db.query(Ink).filter(Ink.id == ink_id).first()
    target = db.query(Ink).filter(Ink.id == payload.target_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or target ink not found")

    db.query(UsageSession).filter(UsageSession.ink_id == ink_id).update(
        {UsageSession.ink_id: target.id}, synchronize_session=False
    )
    db.query(WritingSample).filter(WritingSample.ink_id == ink_id).update(
        {WritingSample.ink_id: target.id}, synchronize_session=False
    )

    if source.mountain_of_ink_url and not target.mountain_of_ink_url:
        target.mountain_of_ink_url = source.mountain_of_ink_url
    if source.custom_notes.strip():
        target.custom_notes = (
            f"{target.custom_notes}\n\n{source.custom_notes}".strip()
            if target.custom_notes.strip()
            else source.custom_notes.strip()
        )

    db.flush()
    db.expire_all()
    source_reload = db.query(Ink).filter(Ink.id == ink_id).first()
    if source_reload:
        db.delete(source_reload)
    db.commit()

    merged = (
        db.query(Ink)
        .options(joinedload(Ink.sessions), joinedload(Ink.writing_samples))
        .filter(Ink.id == target.id)
        .first()
    )
    return serialize_ink(merged)


@router.delete("/{ink_id}")
def delete_ink(ink_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    ink = db.query(Ink).filter(Ink.id == ink_id).first()
    if not ink:
        raise HTTPException(status_code=404, detail="Ink not found")
    db.delete(ink)
    db.commit()
    return {"status": "deleted"}
