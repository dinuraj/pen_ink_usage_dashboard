"""Pairing Studio & Ink-Up Assistant API Router.

Provides:
- Active Rotation Palette & Complementary Color Suggestions
- Candidate Pens (clean/uninked) and Inks (available) with Neglect Metrics
- Real-time Pairing Comparison (Together vs. Separately) & Tri-Tab Writing Samples
- Compatibility Match Score (0-100%) and Dynamic Rationale Badges
- Optional Gemini AI 'Fountain Pen Sommelier' Insights
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Ink, Pen, UsageSession, WritingSample
from ..serializers import (
    serialize_ink_brief,
    serialize_pen_brief,
    serialize_session,
    serialize_writing_sample,
)
from ..services.recommender import (
    compute_pairing_match,
    generate_sommelier_critique,
    get_active_palette,
    get_learned_preferences,
)
from ..storage import storage

router = APIRouter(prefix="/api/pairing", tags=["pairing"])


class SommelierRequest(BaseModel):
    pen_id: int
    ink_id: int


@router.get("/active-palette")
def get_palette(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retrieve the colors and pens currently in active rotation, plus palette gap suggestions."""
    return get_active_palette(db)


@router.get("/candidates")
def get_candidates(
    clean_pens_only: bool = Query(True, description="Filter pens to clean/uninked pens only"),
    exclude_empty_inks: bool = Query(True, description="Exclude empty inks from selection"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve clean candidate pens and available candidate inks annotated with pairing metadata."""
    ref_date = date.today()
    palette = get_active_palette(db)
    prefs = get_learned_preferences(db)

    # 1. Fetch Pens
    pens_query = (
        db.query(Pen)
        .options(
            joinedload(Pen.sessions),
            joinedload(Pen.photos),
        )
        .filter(Pen.status == "active")
        .all()
    )

    candidate_pens: list[dict[str, Any]] = []
    for p in pens_query:
        active_sess = next((s for s in p.sessions if s.end_status == "active"), None)
        is_inked = active_sess is not None

        if clean_pens_only and is_inked:
            continue

        latest_cleaned = max((s.date_cleaned for s in p.sessions if s.date_cleaned), default=None)
        latest_inked = max((s.date_inked for s in p.sessions if s.date_inked), default=None)
        ref_event = latest_cleaned or latest_inked
        days_neglected = (ref_date - ref_event).days if ref_event else 999

        candidate_pens.append(
            {
                "id": p.id,
                "brand": p.brand,
                "model": p.model,
                "color_variant": p.color_variant,
                "display_name": p.display_name,
                "nib_size": p.nib_size,
                "nib_material": p.nib_material,
                "filling_mechanism": p.filling_mechanism,
                "status": p.status,
                "tags": [t.strip() for t in p.tags.split(",") if t.strip()] if p.tags else [],
                "rating": p.rating,
                "primary_photo_url": storage.get_public_url(p.primary_photo_key),
                "is_currently_inked": is_inked,
                "active_ink_name": active_sess.ink.display_name if (active_sess and active_sess.ink) else None,
                "last_inked_date": latest_inked.isoformat() if latest_inked else None,
                "last_cleaned_date": latest_cleaned.isoformat() if latest_cleaned else None,
                "days_neglected": days_neglected,
                "total_lifetime_fills": len(p.sessions),
            }
        )

    # Sort candidate pens: most neglected first, then highest rating
    candidate_pens.sort(key=lambda x: (-x["days_neglected"], -(x["rating"] or 0), x["brand"]))

    # 2. Fetch Inks
    inks_query = (
        db.query(Ink)
        .options(joinedload(Ink.sessions))
        .all()
    )

    candidate_inks: list[dict[str, Any]] = []
    for i in inks_query:
        if exclude_empty_inks and (i.remaining_level or "").lower() == "empty":
            continue

        active_count = sum(1 for s in i.sessions if s.end_status == "active")
        latest_used = max((s.date_inked for s in i.sessions if s.date_inked), default=None)
        days_neglected = (ref_date - latest_used).days if latest_used else 999

        candidate_inks.append(
            {
                "id": i.id,
                "brand": i.brand,
                "name": i.name,
                "display_name": i.display_name,
                "color_family": i.color_family,
                "hex_color": i.hex_color,
                "format": i.format,
                "volume_ml": i.volume_ml,
                "remaining_level": i.remaining_level,
                "rating": i.rating,
                "properties_tags": [t.strip() for t in i.properties_tags.split(",") if t.strip()] if i.properties_tags else [],
                "mountain_of_ink_url": i.mountain_of_ink_url,
                "is_currently_inked": active_count > 0,
                "active_pens_count": active_count,
                "last_used_date": latest_used.isoformat() if latest_used else None,
                "days_neglected": days_neglected,
                "total_lifetime_fills": len(i.sessions),
            }
        )

    # Sort candidate inks: palette complements / gaps first, then days neglected
    complements = set(palette.get("recommended_complements", []))
    gaps = set(palette.get("missing_color_families", []))

    def ink_sort_key(item: dict[str, Any]) -> tuple[int, int, int]:
        fam = item["color_family"]
        priority = 0 if fam in complements else (1 if fam in gaps else 2)
        return (priority, -item["days_neglected"], -(item["rating"] or 0))

    candidate_inks.sort(key=ink_sort_key)

    # 3. Smart Prompts: Top Neglected Duo & Brand-New Discovery
    neglected_duo = None
    if candidate_pens and candidate_inks:
        top_pen = candidate_pens[0]
        top_ink = candidate_inks[0]
        neglected_duo = {
            "pen_id": top_pen["id"],
            "pen_name": top_pen["display_name"],
            "ink_id": top_ink["id"],
            "ink_name": top_ink["display_name"],
            "rationale": f"Pen rested {top_pen['days_neglected']} days; Ink unused {top_ink['days_neglected']} days.",
        }

    # Brand new duo (never paired before)
    brand_new_duo = None
    all_sessions_pairs = set(
        db.query(UsageSession.pen_id, UsageSession.ink_id).all()
    )
    for p in candidate_pens[:10]:
        for i in candidate_inks[:15]:
            if (p["id"], i["id"]) not in all_sessions_pairs:
                brand_new_duo = {
                    "pen_id": p["id"],
                    "pen_name": p["display_name"],
                    "ink_id": i["id"],
                    "ink_name": i["display_name"],
                    "rationale": f"Untried combination with high compatibility.",
                }
                break
        if brand_new_duo:
            break

    return {
        "candidate_pens_count": len(candidate_pens),
        "candidate_inks_count": len(candidate_inks),
        "pens": candidate_pens,
        "inks": candidate_inks,
        "active_palette": palette,
        "neglected_duo": neglected_duo,
        "brand_new_duo": brand_new_duo,
    }


@router.get("/compare")
def compare_pairing(
    pen_id: int = Query(..., description="ID of selected pen"),
    ink_id: int = Query(..., description="ID of selected ink"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Calculate full pairing analytics, chronology comparison, match score, and tri-view writing samples."""
    ref_date = date.today()
    pen = (
        db.query(Pen)
        .options(
            joinedload(Pen.sessions).joinedload(UsageSession.ink),
            joinedload(Pen.photos),
        )
        .filter(Pen.id == pen_id)
        .first()
    )
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")

    ink = (
        db.query(Ink)
        .options(
            joinedload(Ink.sessions).joinedload(UsageSession.pen),
        )
        .filter(Ink.id == ink_id)
        .first()
    )
    if not ink:
        raise HTTPException(status_code=404, detail="Ink not found")

    palette = get_active_palette(db)
    prefs = get_learned_preferences(db)
    match_result = compute_pairing_match(pen, ink, palette, prefs, ref_date)

    # 1. Pairing History (Together)
    sessions_together = [s for s in pen.sessions if s.ink_id == ink_id]
    sessions_together.sort(key=lambda s: s.date_inked, reverse=True)

    times_paired = len(sessions_together)
    first_paired = min((s.date_inked for s in sessions_together), default=None)
    last_paired = max((s.date_inked for s in sessions_together), default=None)
    is_currently_paired = any(s.end_status == "active" for s in sessions_together)
    days_since_paired = (ref_date - last_paired).days if last_paired else None

    # 2. Pen History (Separately)
    active_pen_sess = next((s for s in pen.sessions if s.end_status == "active"), None)
    latest_pen_cleaned = max((s.date_cleaned for s in pen.sessions if s.date_cleaned), default=None)
    latest_pen_inked = max((s.date_inked for s in pen.sessions if s.date_inked), default=None)

    # 3. Ink History (Separately)
    active_ink_pens_count = sum(1 for s in ink.sessions if s.end_status == "active")
    latest_ink_used = max((s.date_inked for s in ink.sessions if s.date_inked), default=None)

    # 4. Writing Samples (Tri-View)
    # Samples Together
    samples_together_query = (
        db.query(WritingSample)
        .options(
            joinedload(WritingSample.pen),
            joinedload(WritingSample.ink),
            joinedload(WritingSample.scan_page),
        )
        .filter(WritingSample.pen_id == pen_id, WritingSample.ink_id == ink_id)
        .order_by(WritingSample.sample_date.desc(), WritingSample.id.desc())
        .all()
    )

    # Samples of this Pen with other inks
    samples_pen_query = (
        db.query(WritingSample)
        .options(
            joinedload(WritingSample.pen),
            joinedload(WritingSample.ink),
            joinedload(WritingSample.scan_page),
        )
        .filter(WritingSample.pen_id == pen_id, WritingSample.ink_id != ink_id)
        .order_by(WritingSample.sample_date.desc(), WritingSample.id.desc())
        .limit(16)
        .all()
    )

    # Samples of this Ink with other pens
    samples_ink_query = (
        db.query(WritingSample)
        .options(
            joinedload(WritingSample.pen),
            joinedload(WritingSample.ink),
            joinedload(WritingSample.scan_page),
        )
        .filter(WritingSample.ink_id == ink_id, WritingSample.pen_id != pen_id)
        .order_by(WritingSample.sample_date.desc(), WritingSample.id.desc())
        .limit(16)
        .all()
    )

    return {
        "pen": {
            **serialize_pen_brief(pen).model_dump(),
            "rating": pen.rating,
            "custom_notes": pen.custom_notes,
            "is_currently_inked": active_pen_sess is not None,
            "active_ink_name": active_pen_sess.ink.display_name if (active_pen_sess and active_pen_sess.ink) else None,
            "last_cleaned_date": latest_pen_cleaned.isoformat() if latest_pen_cleaned else None,
            "last_inked_date": latest_pen_inked.isoformat() if latest_pen_inked else None,
            "days_since_cleaned": (ref_date - latest_pen_cleaned).days if latest_pen_cleaned else None,
            "total_lifetime_fills": len(pen.sessions),
        },
        "ink": {
            **serialize_ink_brief(ink).model_dump(),
            "rating": ink.rating,
            "volume_ml": ink.volume_ml,
            "properties_tags": [t.strip() for t in ink.properties_tags.split(",") if t.strip()] if ink.properties_tags else [],
            "custom_notes": ink.custom_notes,
            "active_pens_count": active_ink_pens_count,
            "last_used_date": latest_ink_used.isoformat() if latest_ink_used else None,
            "days_since_used": (ref_date - latest_ink_used).days if latest_ink_used else None,
            "total_lifetime_fills": len(ink.sessions),
        },
        "match_analysis": match_result,
        "pairing_history": {
            "times_paired": times_paired,
            "first_paired_date": first_paired.isoformat() if first_paired else None,
            "last_paired_date": last_paired.isoformat() if last_paired else None,
            "days_since_paired": days_since_paired,
            "is_currently_paired": is_currently_paired,
            "is_brand_new_pairing": times_paired == 0,
            "past_sessions": [serialize_session(s, ref_date).model_dump() for s in sessions_together[:10]],
        },
        "samples_together": [serialize_writing_sample(ws).model_dump() for ws in samples_together_query],
        "samples_pen": [serialize_writing_sample(ws).model_dump() for ws in samples_pen_query],
        "samples_ink": [serialize_writing_sample(ws).model_dump() for ws in samples_ink_query],
    }


@router.post("/sommelier")
def consult_sommelier(
    payload: SommelierRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Generate connoisseur AI sommelier commentary for a selected pen & ink pairing."""
    pen = db.query(Pen).filter(Pen.id == payload.pen_id).first()
    if not pen:
        raise HTTPException(status_code=404, detail="Pen not found")

    ink = db.query(Ink).filter(Ink.id == payload.ink_id).first()
    if not ink:
        raise HTTPException(status_code=404, detail="Ink not found")

    palette = get_active_palette(db)

    # Gather past sample transcriptions for context
    samples = (
        db.query(WritingSample.transcription)
        .filter(WritingSample.pen_id == payload.pen_id, WritingSample.ink_id == payload.ink_id)
        .limit(4)
        .all()
    )
    transcriptions = [s[0] for s in samples if s[0]]

    pairing_count = db.query(UsageSession).filter(
        UsageSession.pen_id == payload.pen_id,
        UsageSession.ink_id == payload.ink_id,
    ).count()

    return generate_sommelier_critique(
        pen=pen,
        ink=ink,
        active_palette=palette,
        pairing_stats={"times_paired": pairing_count},
        sample_transcriptions=transcriptions,
    )
