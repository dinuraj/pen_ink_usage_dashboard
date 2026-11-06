"""Consistent ORM-to-DTO serializers for Pens, Inks, Sessions, Samples, and Scans."""

from __future__ import annotations

import json
from datetime import date

from .models import Ink, Notebook, Pen, ScanBatch, ScanPage, UsageSession, WritingSample
from .schemas import (
    ActivePairingSummary,
    CropBox,
    ExtractedEntryCandidate,
    ImportedPageEntryOut,
    InkBrief,
    InkOut,
    LifecycleEventOut,
    NotebookOut,
    PenBrief,
    PenOut,
    PenPhotoOut,
    ScanBatchOut,
    ScanPageOut,
    SessionOut,
    WritingSampleOut,
)
from .services.lifecycle import session_days_active
from .storage import storage


CANONICAL_PEN_TAGS: dict[str, str] = {
    "everyday use": "Everyday Use",
    "everyday-use": "Everyday Use",
    "everyday": "Everyday Use",
    "collectible": "Collectible",
    "vintage": "Vintage",
}

TAG_SORT_ORDER: dict[str, int] = {
    "Everyday Use": 1,
    "Collectible": 2,
    "Vintage": 3,
}


def parse_pen_tags(raw: list[str] | str | None) -> list[str]:
    """Normalize pen tags into deduplicated canonical display strings."""
    if not raw:
        return []
    items = raw.split(",") if isinstance(raw, str) else list(raw)
    seen: set[str] = set()
    normalized: list[str] = []
    for item in items:
        clean = item.strip()
        if not clean:
            continue
        canon = CANONICAL_PEN_TAGS.get(clean.lower(), clean)
        key = canon.lower()
        if key not in seen:
            seen.add(key)
            normalized.append(canon)
    normalized.sort(key=lambda t: (TAG_SORT_ORDER.get(t, 99), t.lower()))
    return normalized


def join_pen_tags(raw: list[str] | str | None) -> str:
    return ",".join(parse_pen_tags(raw))


def serialize_pen_brief(pen: Pen) -> PenBrief:
    return PenBrief(
        id=pen.id,
        brand=pen.brand,
        model=pen.model,
        color_variant=pen.color_variant,
        nib_size=pen.nib_size,
        nib_material=pen.nib_material,
        filling_mechanism=pen.filling_mechanism,
        tags=parse_pen_tags(pen.tags),
        primary_photo_url=storage.get_public_url(pen.primary_photo_key),
    )


def serialize_ink_brief(ink: Ink) -> InkBrief:
    return InkBrief(
        id=ink.id,
        brand=ink.brand,
        name=ink.name,
        color_family=ink.color_family,
        hex_color=ink.hex_color,
        format=ink.format,
        remaining_level=ink.remaining_level,
        mountain_of_ink_url=ink.mountain_of_ink_url,
    )


def serialize_writing_sample(ws: WritingSample) -> WritingSampleOut:
    scan_batch_id = ws.scan_page.batch_id if ws.scan_page is not None else None
    scan_page_num = ws.scan_page.page_number if ws.scan_page is not None else None
    return WritingSampleOut(
        id=ws.id,
        session_id=ws.session_id,
        pen_id=ws.pen_id,
        ink_id=ws.ink_id,
        scan_page_id=ws.scan_page_id,
        scan_batch_id=scan_batch_id,
        scan_page_number=scan_page_num,
        image_url=storage.get_public_url(ws.image_storage_key) or "",
        crop_box_json=ws.crop_box_json,
        sample_date=ws.sample_date,
        rating=getattr(ws, "rating", None),
        transcription=ws.transcription,
        caption=ws.caption,
        pen=serialize_pen_brief(ws.pen),
        ink=serialize_ink_brief(ws.ink),
    )


def serialize_session(sess: UsageSession, today: date | None = None) -> SessionOut:
    ref = today or date.today()
    return SessionOut(
        id=sess.id,
        pen_id=sess.pen_id,
        ink_id=sess.ink_id,
        date_inked=sess.date_inked,
        date_cleaned=sess.date_cleaned,
        end_status=sess.end_status,
        days_active=session_days_active(sess, ref),
        refill_count=sess.refill_count,
        rating=getattr(sess, "rating", None),
        session_notes=sess.session_notes,
        pen=serialize_pen_brief(sess.pen),
        ink=serialize_ink_brief(sess.ink),
        events=[
            LifecycleEventOut(
                id=ev.id,
                session_id=ev.session_id,
                event_type=ev.event_type,
                event_date=ev.event_date,
                source=ev.source,
                notes=ev.notes,
            )
            for ev in (sess.events or [])
        ],
        samples=[serialize_writing_sample(ws) for ws in (sess.samples or [])],
    )


def serialize_pen(pen: Pen, today: date | None = None) -> PenOut:
    ref = today or date.today()
    sessions = pen.sessions or []
    active_sess = next((s for s in sessions if s.end_status == "active"), None)
    active_pairing = None
    if active_sess and active_sess.ink:
        active_pairing = ActivePairingSummary(
            session_id=active_sess.id,
            ink_id=active_sess.ink.id,
            ink_brand=active_sess.ink.brand,
            ink_name=active_sess.ink.name,
            ink_hex=active_sess.ink.hex_color,
            date_inked=active_sess.date_inked,
            days_inked=max(0, (ref - active_sess.date_inked).days),
            refill_count=active_sess.refill_count,
        )

    times_inked = len(sessions)
    total_refills = sum(s.refill_count for s in sessions)
    total_days = sum(session_days_active(s, ref) for s in sessions)
    avg_days = round(total_days / times_inked, 1) if times_inked else 0.0

    last_used: date | None = None
    if active_sess:
        last_used = ref
    elif sessions:
        last_used = max((s.date_cleaned or s.date_inked) for s in sessions)

    cleaned_dates = [s.date_cleaned for s in sessions if s.date_cleaned is not None]
    last_cleaned = max(cleaned_dates) if cleaned_dates else None

    return PenOut(
        id=pen.id,
        brand=pen.brand,
        model=pen.model,
        color_variant=pen.color_variant,
        nib_size=pen.nib_size,
        nib_material=pen.nib_material,
        filling_mechanism=pen.filling_mechanism,
        status=pen.status,
        tags=parse_pen_tags(pen.tags),
        rating=pen.rating,
        primary_photo_url=storage.get_public_url(pen.primary_photo_key),
        custom_notes=pen.custom_notes,
        is_currently_inked=active_sess is not None,
        active_pairing=active_pairing,
        times_inked=times_inked,
        total_refills=total_refills,
        total_days_inked=total_days,
        avg_days_inked=avg_days,
        last_used_date=last_used,
        last_cleaned_date=last_cleaned,
        sample_count=len(pen.writing_samples or []),
    )


def serialize_pen_photos(pen: Pen) -> list[PenPhotoOut]:
    return [
        PenPhotoOut(
            id=ph.id,
            url=storage.get_public_url(ph.storage_key) or "",
            caption=ph.caption,
            created_at=ph.created_at,
        )
        for ph in (pen.photos or [])
    ]


def serialize_ink(ink: Ink, today: date | None = None) -> InkOut:
    ref = today or date.today()
    sessions = ink.sessions or []
    active_count = sum(1 for s in sessions if s.end_status == "active")
    times_inked = len(sessions)
    total_refills = sum(s.refill_count for s in sessions)
    distinct_pens = len({s.pen_id for s in sessions})
    total_days = sum(session_days_active(s, ref) for s in sessions)

    last_used: date | None = None
    if active_count > 0:
        last_used = ref
    elif sessions:
        last_used = max((s.date_cleaned or s.date_inked) for s in sessions)

    return InkOut(
        id=ink.id,
        brand=ink.brand,
        name=ink.name,
        color_family=ink.color_family,
        hex_color=ink.hex_color,
        format=ink.format,
        volume_ml=ink.volume_ml,
        remaining_level=ink.remaining_level,
        quantity=ink.quantity,
        rating=ink.rating,
        mountain_of_ink_url=ink.mountain_of_ink_url,
        properties_tags=ink.properties_tags,
        custom_notes=ink.custom_notes,
        currently_in_pens_count=active_count,
        times_inked=times_inked,
        total_refills=total_refills,
        distinct_pens_count=distinct_pens,
        total_days_inked=total_days,
        last_used_date=last_used,
        sample_count=len(ink.writing_samples or []),
    )


def serialize_notebook(nb: Notebook) -> NotebookOut:
    return NotebookOut(
        id=nb.id,
        brand=nb.brand,
        name=nb.name,
        page_count=nb.page_count,
        binding_type=nb.binding_type,
        size=nb.size,
        ruling=nb.ruling,
        paper_type=nb.paper_type,
        paper_gsm=nb.paper_gsm,
        usage_type=nb.usage_type,
        status=nb.status,
        start_date=nb.start_date,
        end_date=nb.end_date,
        completion_pct=nb.completion_pct,
        rating=nb.rating,
        custom_notes=nb.custom_notes,
        created_at=nb.created_at,
        updated_at=nb.updated_at,
    )


def _parse_crop_box(crop_json: str) -> CropBox:
    if crop_json:
        try:
            data = json.loads(crop_json)
            if isinstance(data, dict):
                return CropBox(**data)
        except Exception:
            pass
    return CropBox(x=0.05, y=0.05, w=0.45, h=0.22)


def serialize_scan_page(page: ScanPage) -> ScanPageOut:
    candidates: list[ExtractedEntryCandidate] = []
    if page.extracted_json:
        try:
            raw = json.loads(page.extracted_json)
            if isinstance(raw, list):
                candidates = [ExtractedEntryCandidate(**item) for item in raw]
        except Exception:
            candidates = []

    imported_entries: list[ImportedPageEntryOut] = []
    for ws in (page.samples or []):
        if not ws.pen or not ws.ink:
            continue
        box = _parse_crop_box(ws.crop_box_json)
        sess = ws.session
        imported_entries.append(
            ImportedPageEntryOut(
                sample_id=ws.id,
                session_id=ws.session_id,
                page_id=page.id,
                page_number=page.page_number,
                pen_id=ws.pen_id,
                ink_id=ws.ink_id,
                sample_date=ws.sample_date,
                date_cleaned=sess.date_cleaned if sess else None,
                end_status=sess.end_status if sess else "cleaned",
                image_url=storage.get_public_url(ws.image_storage_key) or "",
                crop_box=box,
                transcription=ws.transcription,
                caption=ws.caption,
                session_notes=sess.session_notes if sess else "",
                pen=serialize_pen_brief(ws.pen),
                ink=serialize_ink_brief(ws.ink),
            )
        )

    # Sort left column first (x < 0.48), then right column, ordered top-to-bottom by y
    imported_entries.sort(key=lambda item: (0 if item.crop_box.x < 0.48 else 1, item.crop_box.y, item.sample_id))

    return ScanPageOut(
        id=page.id,
        batch_id=page.batch_id,
        page_number=page.page_number,
        image_url=storage.get_public_url(page.image_storage_key) or "",
        width_px=page.width_px,
        height_px=page.height_px,
        processed=page.processed,
        candidates=candidates,
        imported_entries=imported_entries,
    )


def serialize_scan_batch(batch: ScanBatch) -> ScanBatchOut:
    return ScanBatchOut(
        id=batch.id,
        original_filename=batch.original_filename,
        pdf_url=storage.get_public_url(batch.pdf_storage_key) or "",
        page_count=batch.page_count,
        status=batch.status,
        is_demo=batch.is_demo,
        uploaded_at=batch.uploaded_at,
        pages=[serialize_scan_page(p) for p in (batch.pages or [])],
    )
