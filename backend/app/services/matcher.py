"""Fuzzy matching against existing Pens and Inks + duplicate session detection."""

from __future__ import annotations

import re
from datetime import date
from difflib import SequenceMatcher
from sqlalchemy.orm import Session

from ..models import Ink, Pen, UsageSession


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9.\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _token_similarity(query: str, target: str) -> float:
    q_norm = _normalize(query)
    t_norm = _normalize(target)
    if not q_norm or not t_norm:
        return 0.0
    if q_norm == t_norm:
        return 1.0

    seq_ratio = SequenceMatcher(None, q_norm, t_norm).ratio()
    q_tokens = set(q_norm.split())
    t_tokens = set(t_norm.split())
    if not q_tokens or not t_tokens:
        return seq_ratio

    overlap = len(q_tokens & t_tokens) / max(len(q_tokens), len(t_tokens))
    subset_bonus = 0.12 if q_tokens.issubset(t_tokens) or t_tokens.issubset(q_tokens) else 0.0
    return min(1.0, (0.55 * seq_ratio) + (0.45 * overlap) + subset_bonus)


def match_pen(
    db: Session,
    brand: str,
    model: str,
    color_variant: str = "",
    nib_size: str = "",
    raw_text: str = "",
) -> tuple[int | None, float]:
    """Find best matching Pen ID, accounting for nib size and color variant when duplicates exist."""
    pens = db.query(Pen).all()
    if not pens:
        return None, 0.0

    query_base = " ".join(filter(None, [brand, model])).strip() or raw_text
    nib_norm = _normalize(nib_size)
    color_norm = _normalize(color_variant)

    best_id: int | None = None
    best_score = 0.0

    for pen in pens:
        candidate_base = f"{pen.brand} {pen.model}"
        score = _token_similarity(query_base, candidate_base)
        if raw_text:
            full_target = f"{pen.brand} {pen.model} {pen.color_variant} {pen.nib_size}"
            score = max(score, _token_similarity(raw_text, full_target))

        # Distinguish multiple pens of the same model via color and nib!
        if color_norm and pen.color_variant:
            color_sim = _token_similarity(color_norm, pen.color_variant)
            score = (0.78 * score) + (0.22 * color_sim)
        elif color_norm and not pen.color_variant:
            score -= 0.05

        if nib_norm and pen.nib_size:
            pen_nib_norm = _normalize(pen.nib_size)
            if nib_norm == pen_nib_norm or nib_norm in pen_nib_norm.split():
                score = min(1.0, score + 0.08)
            else:
                score -= 0.08

        if score > best_score:
            best_score = score
            best_id = pen.id

    if best_score >= 0.62:
        return best_id, round(best_score, 3)
    return None, round(best_score, 3)


def match_ink(
    db: Session,
    brand: str,
    name: str,
    raw_text: str = "",
) -> tuple[int | None, float]:
    """Find best matching Ink ID in the user's Ink Library."""
    inks = db.query(Ink).all()
    if not inks:
        return None, 0.0

    query = " ".join(filter(None, [brand, name])).strip() or raw_text
    name_only = _normalize(name)

    best_id: int | None = None
    best_score = 0.0

    for ink in inks:
        target_full = f"{ink.brand} {ink.name}"
        score = _token_similarity(query, target_full)
        if raw_text:
            score = max(score, _token_similarity(raw_text, target_full))
        # Handle shorthand where user writes "Iroshizuku Tsuki-yo" vs "Pilot Iroshizuku" + "Tsuki-yo"
        if name_only and name_only == _normalize(ink.name):
            score = max(score, 0.88)

        if score > best_score:
            best_score = score
            best_id = ink.id

    if best_score >= 0.62:
        return best_id, round(best_score, 3)
    return None, round(best_score, 3)


def is_duplicate_session(db: Session, pen_id: int | None, ink_id: int | None, date_inked: date) -> bool:
    """Return True if an identical (pen_id, ink_id, date_inked) session already exists."""
    if not pen_id or not ink_id:
        return False
    existing = (
        db.query(UsageSession)
        .filter(
            UsageSession.pen_id == pen_id,
            UsageSession.ink_id == ink_id,
            UsageSession.date_inked == date_inked,
        )
        .first()
    )
    return existing is not None
