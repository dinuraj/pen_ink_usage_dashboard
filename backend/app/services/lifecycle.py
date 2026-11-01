"""Lifecycle management for UsageSessions and LifecycleEvents (Inked, Refilled, Cleaned)."""

from __future__ import annotations

from datetime import date
from sqlalchemy.orm import Session

from ..models import LifecycleEvent, UsageSession


def session_days_active(session: UsageSession, today: date | None = None) -> int:
    """Compute how many days a fill stayed inked (min 1 day for display clarity)."""
    ref_end = session.date_cleaned or (today or date.today())
    delta = (ref_end - session.date_inked).days
    return max(1, delta + 1) if delta >= 0 else 1


def create_usage_session(
    db: Session,
    *,
    pen_id: int,
    ink_id: int,
    date_inked: date,
    date_cleaned: date | None = None,
    end_status: str = "active",
    session_notes: str = "",
    close_previous_active: bool = True,
    previous_close_date: date | None = None,
    source: str = "manual_ui",
) -> UsageSession:
    """Create a UsageSession, optionally closing any prior open session on the same pen."""
    if close_previous_active and end_status == "active":
        open_sessions = (
            db.query(UsageSession)
            .filter(
                UsageSession.pen_id == pen_id,
                UsageSession.end_status == "active",
                UsageSession.date_inked <= date_inked,
            )
            .all()
        )
        for prev in open_sessions:
            close_dt = previous_close_date or date_inked
            if close_dt < prev.date_inked:
                close_dt = prev.date_inked
            prev.date_cleaned = close_dt
            prev.end_status = "cleaned"
            db.add(
                LifecycleEvent(
                    session_id=prev.id,
                    event_type="cleaned",
                    event_date=close_dt,
                    source=source,
                    notes="Auto-closed upon subsequent ink-up",
                )
            )

    # Also check if there is already a MORE RECENT session for this pen when importing older historical scans!
    newer_session = (
        db.query(UsageSession)
        .filter(UsageSession.pen_id == pen_id, UsageSession.date_inked > date_inked)
        .order_by(UsageSession.date_inked.asc())
        .first()
    )
    if end_status == "active" and newer_session is not None and date_cleaned is None:
        # Historical import prior to a newer fill: auto-archive it on the newer fill's date
        date_cleaned = newer_session.date_inked
        end_status = "cleaned"

    new_sess = UsageSession(
        pen_id=pen_id,
        ink_id=ink_id,
        date_inked=date_inked,
        date_cleaned=date_cleaned,
        end_status=end_status,
        refill_count=0,
        session_notes=session_notes,
    )
    db.add(new_sess)
    db.flush()

    db.add(
        LifecycleEvent(
            session_id=new_sess.id,
            event_type="inked",
            event_date=date_inked,
            source=source,
            notes=session_notes or "Initial ink-up",
        )
    )

    if date_cleaned and end_status in ("cleaned", "emptied"):
        db.add(
            LifecycleEvent(
                session_id=new_sess.id,
                event_type=end_status,
                event_date=date_cleaned,
                source=source,
                notes="Closed fill cycle",
            )
        )

    db.flush()
    return new_sess


def log_refill(db: Session, session: UsageSession, event_date: date, notes: str = "", source: str = "manual_ui") -> UsageSession:
    """Record a refill event on a session and increment its refill counter."""
    session.refill_count = (session.refill_count or 0) + 1
    db.add(
        LifecycleEvent(
            session_id=session.id,
            event_type="refilled",
            event_date=event_date,
            source=source,
            notes=notes or f"Refill #{session.refill_count}",
        )
    )
    db.flush()
    return session


def log_clean_or_empty(
    db: Session,
    session: UsageSession,
    event_date: date,
    end_status: str = "cleaned",
    notes: str = "",
    source: str = "manual_ui",
) -> UsageSession:
    """Close an active UsageSession as cleaned or emptied."""
    clean_dt = max(event_date, session.date_inked)
    session.date_cleaned = clean_dt
    session.end_status = end_status if end_status in ("cleaned", "emptied") else "cleaned"
    db.add(
        LifecycleEvent(
            session_id=session.id,
            event_type=session.end_status,
            event_date=clean_dt,
            source=source,
            notes=notes or f"Pen {session.end_status}",
        )
    )
    db.flush()
    return session
