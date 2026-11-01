"""Analytics aggregation engine for the Modern Minimalist Analytics dashboard."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any
from sqlalchemy.orm import Session, joinedload

from ..models import Ink, LifecycleEvent, Pen, UsageSession, WritingSample
from ..storage import storage
from .lifecycle import session_days_active

COLOR_FAMILY_HEX: dict[str, str] = {
    "Blue": "#2563eb",
    "Teal": "#0d9488",
    "Green": "#16a34a",
    "Red": "#dc2626",
    "Purple": "#7c3aed",
    "Brown": "#92400e",
    "Orange": "#ea580c",
    "Black": "#18181b",
    "Grey": "#64748b",
    "Pink": "#db2777",
}


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    total = (year * 12 + (month - 1)) + delta
    return total // 12, (total % 12) + 1


def build_dashboard_analytics(db: Session) -> dict[str, Any]:
    """Compute comprehensive KPIs, Currently Inked command table, and chart series."""
    today = date.today()
    pens = db.query(Pen).options(joinedload(Pen.sessions)).all()
    inks = db.query(Ink).options(joinedload(Ink.sessions)).all()
    sessions = (
        db.query(UsageSession)
        .options(
            joinedload(UsageSession.pen),
            joinedload(UsageSession.ink),
            joinedload(UsageSession.samples),
        )
        .order_by(UsageSession.date_inked.desc())
        .all()
    )
    events = (
        db.query(LifecycleEvent)
        .options(joinedload(LifecycleEvent.session).joinedload(UsageSession.pen), joinedload(LifecycleEvent.session).joinedload(UsageSession.ink))
        .order_by(LifecycleEvent.event_date.desc(), LifecycleEvent.id.desc())
        .all()
    )
    total_samples = db.query(WritingSample).count()

    active_pens_pool = [p for p in pens if p.status == "active"]
    active_sessions = [s for s in sessions if s.end_status == "active"]
    currently_inked_pen_ids = {s.pen_id for s in active_sessions}

    # Currently Inked Command Table
    currently_inked_rows: list[dict[str, Any]] = []
    due_for_flush_count = 0
    for s in sorted(active_sessions, key=lambda item: item.date_inked):
        days_inked = max(0, (today - s.date_inked).days)
        if days_inked >= 28:
            aging = "attention"
            due_for_flush_count += 1
        elif days_inked >= 14:
            aging = "moderate"
        else:
            aging = "fresh"

        sample_url = storage.get_public_url(s.samples[0].image_storage_key) if s.samples else None
        currently_inked_rows.append(
            {
                "session_id": s.id,
                "pen_id": s.pen.id,
                "pen_brand": s.pen.brand,
                "pen_model": s.pen.model,
                "pen_color": s.pen.color_variant,
                "nib_size": s.pen.nib_size,
                "filling_mechanism": s.pen.filling_mechanism,
                "ink_id": s.ink.id,
                "ink_brand": s.ink.brand,
                "ink_name": s.ink.name,
                "ink_hex": s.ink.hex_color,
                "ink_color_family": s.ink.color_family,
                "date_inked": s.date_inked.isoformat(),
                "days_inked": days_inked,
                "aging": aging,
                "refill_count": s.refill_count,
                "sample_url": sample_url,
                "session_notes": s.session_notes,
            }
        )

    # Top-level KPIs
    closed_sessions = [s for s in sessions if s.end_status != "active" and s.date_cleaned]
    avg_fill_days = (
        round(sum(session_days_active(s, today) for s in closed_sessions) / len(closed_sessions), 1)
        if closed_sessions
        else (round(sum(session_days_active(s, today) for s in sessions) / len(sessions), 1) if sessions else 0.0)
    )

    ytd_sessions = sum(1 for s in sessions if s.date_inked.year == today.year)
    total_refills = sum(1 for e in events if e.event_type == "refilled")
    total_cleanings = sum(1 for e in events if e.event_type in ("cleaned", "emptied"))

    bottles_count = sum(i.quantity for i in inks if i.format == "bottle")
    samples_vial_count = sum(i.quantity for i in inks if i.format == "sample_vial")
    cartridges_count = sum(i.quantity for i in inks if i.format == "cartridge")
    low_or_empty_inks = sum(1 for i in inks if i.remaining_level in ("low", "empty"))

    rotation_pct = (
        round((len(currently_inked_pen_ids) / len(active_pens_pool)) * 100, 1) if active_pens_pool else 0.0
    )

    # Monthly Cadence (last 12 months)
    month_keys: list[str] = []
    month_labels: dict[str, str] = {}
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for offset in range(-11, 1):
        y, m = _add_months(today.year, today.month, offset)
        key = f"{y:04d}-{m:02d}"
        month_keys.append(key)
        month_labels[key] = f"{month_names[m - 1]} '{str(y)[2:]}"

    monthly_buckets: dict[str, dict[str, int]] = {
        k: {"inked": 0, "refilled": 0, "cleaned": 0} for k in month_keys
    }
    for e in events:
        mkey = f"{e.event_date.year:04d}-{e.event_date.month:02d}"
        if mkey in monthly_buckets:
            if e.event_type == "inked":
                monthly_buckets[mkey]["inked"] += 1
            elif e.event_type == "refilled":
                monthly_buckets[mkey]["refilled"] += 1
            elif e.event_type in ("cleaned", "emptied"):
                monthly_buckets[mkey]["cleaned"] += 1

    monthly_activity = [
        {
            "month": k,
            "label": month_labels[k],
            "inked": monthly_buckets[k]["inked"],
            "refilled": monthly_buckets[k]["refilled"],
            "cleaned": monthly_buckets[k]["cleaned"],
        }
        for k in month_keys
    ]

    # Top Pens Ranking
    pen_rankings: list[dict[str, Any]] = []
    neglected_pens: list[dict[str, Any]] = []
    for p in pens:
        p_sessions = p.sessions
        times_inked = len(p_sessions)
        refills = sum(s.refill_count for s in p_sessions)
        days_total = sum(session_days_active(s, today) for s in p_sessions)
        is_inked = p.id in currently_inked_pen_ids

        last_dt: date | None = None
        if is_inked:
            last_dt = today
        elif p_sessions:
            last_dt = max((s.date_cleaned or s.date_inked) for s in p_sessions)

        days_idle = 0 if is_inked else ((today - last_dt).days if last_dt else 9999)
        short_label = f"{p.brand} {p.model}" + (f" ({p.color_variant})" if p.color_variant else "")
        row = {
            "id": p.id,
            "label": short_label,
            "brand": p.brand,
            "model": p.model,
            "color_variant": p.color_variant,
            "nib_size": p.nib_size,
            "times_inked": times_inked,
            "total_refills": refills,
            "total_fills": times_inked + refills,
            "total_days_inked": days_total,
            "is_currently_inked": is_inked,
            "last_used_date": last_dt.isoformat() if last_dt else None,
            "days_since_used": None if days_idle == 9999 else days_idle,
        }
        pen_rankings.append(row)
        if not is_inked and p.status == "active":
            neglected_pens.append((days_idle, row))

    pen_rankings.sort(key=lambda r: (r["total_fills"], r["total_days_inked"]), reverse=True)
    neglected_pens.sort(key=lambda pair: pair[0], reverse=True)

    # Top Inks Ranking
    ink_rankings: list[dict[str, Any]] = []
    neglected_inks: list[dict[str, Any]] = []
    active_ink_ids = {s.ink_id for s in active_sessions}
    for i in inks:
        i_sessions = i.sessions
        times_inked = len(i_sessions)
        refills = sum(s.refill_count for s in i_sessions)
        days_total = sum(session_days_active(s, today) for s in i_sessions)
        in_rotation = i.id in active_ink_ids

        last_dt = today if in_rotation else (max((s.date_cleaned or s.date_inked) for s in i_sessions) if i_sessions else None)
        days_idle = 0 if in_rotation else ((today - last_dt).days if last_dt else 9999)
        row = {
            "id": i.id,
            "label": f"{i.brand} {i.name}",
            "brand": i.brand,
            "name": i.name,
            "hex_color": i.hex_color,
            "color_family": i.color_family,
            "format": i.format,
            "remaining_level": i.remaining_level,
            "times_inked": times_inked,
            "total_refills": refills,
            "total_fills": times_inked + refills,
            "total_days_inked": days_total,
            "in_rotation": in_rotation,
            "last_used_date": last_dt.isoformat() if last_dt else None,
            "days_since_used": None if days_idle == 9999 else days_idle,
        }
        ink_rankings.append(row)
        if not in_rotation and i.remaining_level != "empty":
            neglected_inks.append((days_idle, row))

    ink_rankings.sort(key=lambda r: (r["total_fills"], r["total_days_inked"]), reverse=True)
    neglected_inks.sort(key=lambda pair: pair[0], reverse=True)

    # Color Family Breakdown (Inventory vs Usage)
    inv_by_color: dict[str, int] = defaultdict(int)
    use_by_color: dict[str, int] = defaultdict(int)
    for i in inks:
        inv_by_color[i.color_family] += 1
    for s in sessions:
        use_by_color[s.ink.color_family] += 1 + s.refill_count

    all_families = sorted(
        set(inv_by_color.keys()) | set(use_by_color.keys()),
        key=lambda fam: (use_by_color[fam], inv_by_color[fam]),
        reverse=True,
    )
    color_distribution = [
        {
            "color_family": fam,
            "hex": COLOR_FAMILY_HEX.get(fam, "#3b82f6"),
            "inventory_count": inv_by_color[fam],
            "usage_fills": use_by_color[fam],
        }
        for fam in all_families
    ]

    # Nib Size & Brand Distributions
    nib_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"pens": 0, "fills": 0})
    for p in pens:
        nib_counts[p.nib_size]["pens"] += 1
    for s in sessions:
        nib_counts[s.pen.nib_size]["fills"] += 1 + s.refill_count
    nib_distribution = [
        {"nib_size": nib, "pens": vals["pens"], "fills": vals["fills"]}
        for nib, vals in sorted(nib_counts.items(), key=lambda kv: kv[1]["fills"], reverse=True)
    ]

    filling_counts: dict[str, int] = defaultdict(int)
    for p in pens:
        filling_counts[p.filling_mechanism] += 1
    filling_distribution = [
        {"mechanism": k, "count": v}
        for k, v in sorted(filling_counts.items(), key=lambda kv: kv[1], reverse=True)
    ]

    # Recent Lifecycle Feed
    recent_events = []
    for ev in events[:14]:
        sess = ev.session
        if not sess:
            continue
        recent_events.append(
            {
                "id": ev.id,
                "event_type": ev.event_type,
                "event_date": ev.event_date.isoformat(),
                "source": ev.source,
                "notes": ev.notes,
                "pen_id": sess.pen.id,
                "pen_label": sess.pen.display_name,
                "nib_size": sess.pen.nib_size,
                "ink_id": sess.ink.id,
                "ink_label": sess.ink.display_name,
                "ink_hex": sess.ink.hex_color,
            }
        )

    return {
        "kpis": {
            "total_pens": len(pens),
            "active_collection_pens": len(active_pens_pool),
            "currently_inked_count": len(currently_inked_pen_ids),
            "rotation_pct": rotation_pct,
            "total_inks": len(inks),
            "bottles_count": bottles_count,
            "samples_vial_count": samples_vial_count,
            "cartridges_count": cartridges_count,
            "low_or_empty_inks": low_or_empty_inks,
            "total_sessions": len(sessions),
            "ytd_sessions": ytd_sessions,
            "total_refills": total_refills,
            "total_cleanings": total_cleanings,
            "total_writing_samples": total_samples,
            "avg_fill_days": avg_fill_days,
            "due_for_flush_count": due_for_flush_count,
        },
        "currently_inked": currently_inked_rows,
        "monthly_activity": monthly_activity,
        "top_pens": pen_rankings[:10],
        "top_inks": ink_rankings[:10],
        "color_distribution": color_distribution,
        "nib_distribution": nib_distribution,
        "filling_distribution": filling_distribution,
        "neglected_pens": [r for _, r in neglected_pens[:6]],
        "neglected_inks": [r for _, r in neglected_inks[:6]],
        "recent_events": recent_events,
    }
