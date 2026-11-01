"""Pen Cabinet CRUD, photo gallery, reversible duplicate merging, and session splitting."""

from __future__ import annotations

import io
import json
from collections import Counter
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Pen, PenMergeRecord, PenPhoto, UsageSession, WritingSample
from ..schemas import (
    BulkPenMergeRequest,
    MergeTargetRequest,
    PenCreate,
    PenMergeRecordOut,
    PenOut,
    PenUpdate,
    SplitPenSessionsRequest,
)
from ..serializers import (
    join_pen_tags,
    parse_pen_tags,
    serialize_pen,
    serialize_pen_photos,
    serialize_session,
    serialize_writing_sample,
)
from ..storage import storage

router = APIRouter(prefix="/api/pens", tags=["pens"])


def _load_pen_summary(db: Session, pen_id: int) -> Pen:
    pen = (
        db.query(Pen)
        .options(
            joinedload(Pen.sessions).joinedload(UsageSession.ink),
            joinedload(Pen.writing_samples),
        )
        .filter(Pen.id == pen_id)
        .first()
    )
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")
    return pen


def _serialize_merge_record(mr: PenMergeRecord) -> dict[str, Any]:
    snap = json.loads(mr.source_snapshot_json or "{}")
    sess_ids = json.loads(mr.moved_session_ids_json or "[]")
    samp_ids = json.loads(mr.moved_sample_ids_json or "[]")
    brand = snap.get("brand", "Unknown")
    model = snap.get("model", "Pen")
    color = snap.get("color_variant", "")
    nib = snap.get("nib_size", "M")
    label = f"{brand} {model}" + (f" ({color})" if color else "") + f" · {nib}"
    return PenMergeRecordOut(
        id=mr.id,
        target_pen_id=mr.target_pen_id,
        source_label=label,
        source_brand=brand,
        source_model=model,
        source_color_variant=color,
        source_nib_size=nib,
        moved_sessions_count=len(sess_ids),
        moved_samples_count=len(samp_ids),
        created_at=mr.created_at.isoformat() if mr.created_at else "",
    ).model_dump()


def _enforce_single_active_session(db: Session, pen_id: int) -> list[dict[str, Any]]:
    """Ensure at most one UsageSession on pen_id remains 'active'; return auto-closed log."""
    active_sessions = (
        db.query(UsageSession)
        .filter(UsageSession.pen_id == pen_id, UsageSession.end_status == "active")
        .order_by(UsageSession.date_inked.desc(), UsageSession.id.desc())
        .all()
    )
    auto_closed: list[dict[str, Any]] = []
    if len(active_sessions) > 1:
        newest = active_sessions[0]
        for older in active_sessions[1:]:
            auto_closed.append(
                {
                    "session_id": older.id,
                    "prev_end_status": older.end_status,
                    "prev_date_cleaned": older.date_cleaned.isoformat() if older.date_cleaned else None,
                }
            )
            older.end_status = "cleaned"
            older.date_cleaned = older.date_cleaned or newest.date_inked
    return auto_closed


def _merge_one_pen_into_target(db: Session, source: Pen, target: Pen) -> PenMergeRecord:
    """Move all associated data from source -> target and save a reversible PenMergeRecord."""
    snapshot = {
        "brand": source.brand,
        "model": source.model,
        "color_variant": source.color_variant,
        "nib_size": source.nib_size,
        "nib_material": source.nib_material,
        "filling_mechanism": source.filling_mechanism,
        "status": source.status,
        "tags": source.tags,
        "rating": source.rating,
        "primary_photo_key": source.primary_photo_key,
        "custom_notes": source.custom_notes,
    }

    session_ids = [
        r[0] for r in db.query(UsageSession.id).filter(UsageSession.pen_id == source.id).all()
    ]
    sample_ids = [
        r[0] for r in db.query(WritingSample.id).filter(WritingSample.pen_id == source.id).all()
    ]
    photo_ids = [
        r[0] for r in db.query(PenPhoto.id).filter(PenPhoto.pen_id == source.id).all()
    ]

    # Transfer any prior merge records from source onto target so chained merges stay undoable
    db.query(PenMergeRecord).filter(PenMergeRecord.target_pen_id == source.id).update(
        {PenMergeRecord.target_pen_id: target.id}, synchronize_session=False
    )

    db.query(UsageSession).filter(UsageSession.pen_id == source.id).update(
        {UsageSession.pen_id: target.id}, synchronize_session=False
    )
    db.query(WritingSample).filter(WritingSample.pen_id == source.id).update(
        {WritingSample.pen_id: target.id}, synchronize_session=False
    )
    db.query(PenPhoto).filter(PenPhoto.pen_id == source.id).update(
        {PenPhoto.pen_id: target.id}, synchronize_session=False
    )

    if source.primary_photo_key and not target.primary_photo_key:
        target.primary_photo_key = source.primary_photo_key

    merged_tags = parse_pen_tags(target.tags) + parse_pen_tags(source.tags)
    if merged_tags:
        target.tags = join_pen_tags(merged_tags)

    if target.rating is None and source.rating is not None:
        target.rating = source.rating

    src_notes = (source.custom_notes or "").strip()
    if src_notes and src_notes not in (target.custom_notes or ""):
        target.custom_notes = (
            f"{target.custom_notes.strip()}\n\n{src_notes}"
            if (target.custom_notes or "").strip()
            else src_notes
        )

    db.flush()
    auto_closed = _enforce_single_active_session(db, target.id)

    record = PenMergeRecord(
        target_pen_id=target.id,
        source_snapshot_json=json.dumps(snapshot),
        moved_session_ids_json=json.dumps(session_ids),
        moved_sample_ids_json=json.dumps(sample_ids),
        moved_photo_ids_json=json.dumps(photo_ids),
        auto_closed_sessions_json=json.dumps(auto_closed),
    )
    db.add(record)
    db.flush()

    db.expire(source)
    src_reload = db.query(Pen).filter(Pen.id == source.id).first()
    if src_reload:
        db.delete(src_reload)
    db.flush()
    return record


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
    data = payload.model_dump()
    data["tags"] = join_pen_tags(data.get("tags"))
    pen = Pen(**data)
    db.add(pen)
    db.commit()
    return serialize_pen(_load_pen_summary(db, pen.id))


@router.post("/merge-bulk", response_model=PenOut)
def merge_pens_bulk(
    payload: BulkPenMergeRequest,
    db: Session = Depends(get_db),
) -> PenOut:
    """Merge one or more duplicate Pens into target_pen_id with full undo records."""
    target = db.query(Pen).filter(Pen.id == payload.target_pen_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target pen not found")

    unique_sources = [sid for sid in dict.fromkeys(payload.source_pen_ids) if sid != target.id]
    if not unique_sources:
        raise HTTPException(status_code=400, detail="Select at least one duplicate pen to merge")

    if payload.updated_target is not None:
        for field, val in payload.updated_target.model_dump(exclude_unset=True).items():
            if val is not None:
                setattr(target, field, join_pen_tags(val) if field == "tags" else val)

    for sid in unique_sources:
        source = db.query(Pen).filter(Pen.id == sid).first()
        if source:
            _merge_one_pen_into_target(db, source, target)

    db.commit()
    db.expire_all()
    return serialize_pen(_load_pen_summary(db, target.id))


@router.post("/merges/{merge_id}/undo")
def undo_pen_merge(merge_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Undo a previous Pen merge, recreating the original pen and restoring its sessions & samples."""
    mr = db.query(PenMergeRecord).filter(PenMergeRecord.id == merge_id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Merge record not found")

    target_id = mr.target_pen_id
    snap = json.loads(mr.source_snapshot_json or "{}")
    session_ids: list[int] = json.loads(mr.moved_session_ids_json or "[]")
    sample_ids: list[int] = json.loads(mr.moved_sample_ids_json or "[]")
    photo_ids: list[int] = json.loads(mr.moved_photo_ids_json or "[]")
    auto_closed: list[dict[str, Any]] = json.loads(mr.auto_closed_sessions_json or "[]")

    restored = Pen(
        brand=snap.get("brand", "Restored"),
        model=snap.get("model", "Pen"),
        color_variant=snap.get("color_variant", ""),
        nib_size=snap.get("nib_size", "M"),
        nib_material=snap.get("nib_material", "Steel"),
        filling_mechanism=snap.get("filling_mechanism", "Converter"),
        status=snap.get("status", "active"),
        tags=snap.get("tags", ""),
        rating=snap.get("rating"),
        primary_photo_key=snap.get("primary_photo_key"),
        custom_notes=snap.get("custom_notes", ""),
    )
    db.add(restored)
    db.flush()

    if session_ids:
        db.query(UsageSession).filter(
            UsageSession.id.in_(session_ids),
            UsageSession.pen_id == target_id,
        ).update({UsageSession.pen_id: restored.id}, synchronize_session=False)
        # Also move any writing samples attached to those restored sessions
        db.query(WritingSample).filter(
            WritingSample.session_id.in_(session_ids),
            WritingSample.pen_id == target_id,
        ).update({WritingSample.pen_id: restored.id}, synchronize_session=False)

    if sample_ids:
        db.query(WritingSample).filter(
            WritingSample.id.in_(sample_ids),
            WritingSample.pen_id == target_id,
        ).update({WritingSample.pen_id: restored.id}, synchronize_session=False)

    if photo_ids:
        db.query(PenPhoto).filter(
            PenPhoto.id.in_(photo_ids),
            PenPhoto.pen_id == target_id,
        ).update({PenPhoto.pen_id: restored.id}, synchronize_session=False)

    db.flush()

    # Restore any active status that was auto-closed when two active pens were merged
    for item in auto_closed:
        sess = db.query(UsageSession).filter(UsageSession.id == item.get("session_id")).first()
        if sess:
            sess.end_status = item.get("prev_end_status", "active")
            prev_dc = item.get("prev_date_cleaned")
            sess.date_cleaned = date.fromisoformat(prev_dc) if prev_dc else None

    _enforce_single_active_session(db, restored.id)
    _enforce_single_active_session(db, target_id)

    db.delete(mr)
    db.commit()
    db.expire_all()

    return {
        "restored_pen": serialize_pen(_load_pen_summary(db, restored.id)),
        "target_pen": serialize_pen(_load_pen_summary(db, target_id)),
    }


@router.get("/{pen_id}")
def get_pen_detail(pen_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    pen = (
        db.query(Pen)
        .options(
            joinedload(Pen.photos),
            joinedload(Pen.merge_records),
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
        "merge_history": [_serialize_merge_record(mr) for mr in pen.merge_records],
    }


@router.patch("/{pen_id}", response_model=PenOut)
def update_pen(pen_id: int, payload: PenUpdate, db: Session = Depends(get_db)) -> PenOut:
    pen = _load_pen_summary(db, pen_id)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(pen, field, join_pen_tags(val) if field == "tags" else val)
    db.commit()
    db.expire_all()
    return serialize_pen(_load_pen_summary(db, pen_id))


@router.post("/{pen_id}/merge", response_model=PenOut)
def merge_pen_into_target(
    pen_id: int,
    payload: MergeTargetRequest,
    db: Session = Depends(get_db),
) -> PenOut:
    """Merge duplicate Pen into target_id, recording a reversible PenMergeRecord."""
    if pen_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a pen into itself")

    source = db.query(Pen).filter(Pen.id == pen_id).first()
    target = db.query(Pen).filter(Pen.id == payload.target_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or target pen not found")

    _merge_one_pen_into_target(db, source, target)
    db.commit()
    db.expire_all()
    return serialize_pen(_load_pen_summary(db, target.id))


@router.post("/{pen_id}/split")
def split_pen_sessions(
    pen_id: int,
    payload: SplitPenSessionsRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Split selected fill sessions (and their samples/dates) into a new or existing Pen."""
    source = db.query(Pen).filter(Pen.id == pen_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source pen not found")

    if not payload.session_ids and not payload.standalone_sample_ids:
        raise HTTPException(status_code=400, detail="Select at least one fill session or sample to split")

    if payload.new_pen is not None:
        new_data = payload.new_pen.model_dump()
        new_data["tags"] = join_pen_tags(new_data.get("tags"))
        dest = Pen(**new_data)
        db.add(dest)
        db.flush()
    elif payload.target_pen_id is not None:
        if payload.target_pen_id == pen_id:
            raise HTTPException(status_code=400, detail="Destination pen must be different from current pen")
        dest = db.query(Pen).filter(Pen.id == payload.target_pen_id).first()
        if not dest:
            raise HTTPException(status_code=404, detail="Destination pen not found")
    else:
        raise HTTPException(status_code=400, detail="Provide either new_pen or target_pen_id")

    if payload.session_ids:
        db.query(UsageSession).filter(
            UsageSession.id.in_(payload.session_ids),
            UsageSession.pen_id == pen_id,
        ).update({UsageSession.pen_id: dest.id}, synchronize_session=False)

        db.query(WritingSample).filter(
            WritingSample.session_id.in_(payload.session_ids),
            WritingSample.pen_id == pen_id,
        ).update({WritingSample.pen_id: dest.id}, synchronize_session=False)

    if payload.standalone_sample_ids:
        db.query(WritingSample).filter(
            WritingSample.id.in_(payload.standalone_sample_ids),
            WritingSample.pen_id == pen_id,
        ).update({WritingSample.pen_id: dest.id}, synchronize_session=False)

    db.flush()
    _enforce_single_active_session(db, dest.id)
    _enforce_single_active_session(db, pen_id)
    db.commit()
    db.expire_all()

    return {
        "destination_pen": serialize_pen(_load_pen_summary(db, dest.id)),
        "source_pen": serialize_pen(_load_pen_summary(db, pen_id)),
    }


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
