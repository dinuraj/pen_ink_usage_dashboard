"""UsageSession & LifecycleEvent endpoints (Ink Up, Refill, Clean/Empty, Reopen)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Ink, LifecycleEvent, Pen, UsageSession, WritingSample
from ..schemas import CleanAction, RefillAction, SessionCreate, SessionOut, SessionUpdate
from ..serializers import serialize_session
from ..services.lifecycle import create_usage_session, log_clean_or_empty, log_refill

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _load_session(db: Session, session_id: int) -> UsageSession:
    sess = (
        db.query(UsageSession)
        .options(
            joinedload(UsageSession.pen),
            joinedload(UsageSession.ink),
            joinedload(UsageSession.events),
            joinedload(UsageSession.samples).joinedload(WritingSample.pen),
            joinedload(UsageSession.samples).joinedload(WritingSample.ink),
            joinedload(UsageSession.samples).joinedload(WritingSample.scan_page),
        )
        .filter(UsageSession.id == session_id)
        .first()
    )
    if not sess:
        raise HTTPException(status_code=404, detail="Usage session not found")
    return sess


@router.get("", response_model=list[SessionOut])
def list_sessions(
    status: str | None = None,
    pen_id: int | None = None,
    ink_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[SessionOut]:
    q = db.query(UsageSession).options(
        joinedload(UsageSession.pen),
        joinedload(UsageSession.ink),
        joinedload(UsageSession.events),
        joinedload(UsageSession.samples).joinedload(WritingSample.pen),
        joinedload(UsageSession.samples).joinedload(WritingSample.ink),
        joinedload(UsageSession.samples).joinedload(WritingSample.scan_page),
    )
    if status:
        q = q.filter(UsageSession.end_status == status)
    if pen_id:
        q = q.filter(UsageSession.pen_id == pen_id)
    if ink_id:
        q = q.filter(UsageSession.ink_id == ink_id)

    rows = q.order_by(UsageSession.date_inked.desc(), UsageSession.id.desc()).all()
    return [serialize_session(s) for s in rows]


@router.post("", response_model=SessionOut)
def create_session_endpoint(payload: SessionCreate, db: Session = Depends(get_db)) -> SessionOut:
    if not db.query(Pen).filter(Pen.id == payload.pen_id).first():
        raise HTTPException(status_code=404, detail="Pen not found")
    if not db.query(Ink).filter(Ink.id == payload.ink_id).first():
        raise HTTPException(status_code=404, detail="Ink not found")

    sess = create_usage_session(
        db,
        pen_id=payload.pen_id,
        ink_id=payload.ink_id,
        date_inked=payload.date_inked,
        date_cleaned=payload.date_cleaned,
        end_status=payload.end_status,
        session_notes=payload.session_notes,
        close_previous_active=payload.close_previous_active,
        previous_close_date=payload.previous_close_date,
        source=payload.source,
    )
    db.commit()
    return serialize_session(_load_session(db, sess.id))


@router.post("/{session_id}/refill", response_model=SessionOut)
def refill_session(session_id: int, payload: RefillAction, db: Session = Depends(get_db)) -> SessionOut:
    sess = _load_session(db, session_id)
    log_refill(db, sess, event_date=payload.event_date, notes=payload.notes, source="manual_ui")
    db.commit()
    return serialize_session(_load_session(db, session_id))


@router.post("/{session_id}/clean", response_model=SessionOut)
def clean_session(session_id: int, payload: CleanAction, db: Session = Depends(get_db)) -> SessionOut:
    sess = _load_session(db, session_id)
    log_clean_or_empty(
        db,
        sess,
        event_date=payload.event_date,
        end_status=payload.end_status,
        notes=payload.notes,
        source="manual_ui",
    )
    db.commit()
    return serialize_session(_load_session(db, session_id))


@router.post("/{session_id}/reopen", response_model=SessionOut)
def reopen_session(session_id: int, db: Session = Depends(get_db)) -> SessionOut:
    sess = _load_session(db, session_id)
    sess.date_cleaned = None
    sess.end_status = "active"
    db.commit()
    return serialize_session(_load_session(db, session_id))


@router.patch("/{session_id}", response_model=SessionOut)
def update_session_endpoint(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
) -> SessionOut:
    sess = _load_session(db, session_id)

    if payload.pen_id is not None:
        if not db.query(Pen).filter(Pen.id == payload.pen_id).first():
            raise HTTPException(status_code=404, detail="Pen not found")
        sess.pen_id = payload.pen_id
        for ws in sess.samples:
            ws.pen_id = payload.pen_id

    if payload.ink_id is not None:
        if not db.query(Ink).filter(Ink.id == payload.ink_id).first():
            raise HTTPException(status_code=404, detail="Ink not found")
        sess.ink_id = payload.ink_id
        for ws in sess.samples:
            ws.ink_id = payload.ink_id

    if payload.date_inked is not None:
        sess.date_inked = payload.date_inked
        for ws in sess.samples:
            ws.sample_date = payload.date_inked
        inked_ev = (
            db.query(LifecycleEvent)
            .filter(LifecycleEvent.session_id == sess.id, LifecycleEvent.event_type == "inked")
            .first()
        )
        if inked_ev:
            inked_ev.event_date = payload.date_inked

    if payload.end_status is not None:
        sess.end_status = payload.end_status
        if payload.end_status == "active":
            sess.date_cleaned = None

    if "date_cleaned" in payload.model_fields_set and sess.end_status != "active":
        sess.date_cleaned = payload.date_cleaned

    if payload.rating is not None:
        sess.rating = payload.rating

    if payload.session_notes is not None:
        sess.session_notes = payload.session_notes

    db.commit()
    db.expire_all()
    return serialize_session(_load_session(db, session_id))


class SessionRatingUpdate(BaseModel):
    rating: int | None = Field(None, ge=1, le=5)


@router.patch("/{session_id}/rating", response_model=SessionOut)
def rate_usage_session(
    session_id: int,
    payload: SessionRatingUpdate | None = None,
    rating: int | None = Query(None, ge=1, le=5),
    db: Session = Depends(get_db),
) -> SessionOut:
    """Quickly update the 1-5 star satisfaction rating for a usage session/pairing."""
    sess = _load_session(db, session_id)
    final_rating = payload.rating if (payload is not None and payload.rating is not None) else rating
    sess.rating = final_rating
    db.commit()
    db.expire_all()
    return serialize_session(_load_session(db, session_id))


@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    sess = db.query(UsageSession).filter(UsageSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(sess)
    db.commit()
    return {"status": "deleted"}
