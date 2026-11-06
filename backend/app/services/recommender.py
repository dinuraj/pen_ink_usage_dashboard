"""Intelligent Fountain Pen & Ink Recommendation and Sommelier Engine.

Combines:
1. Active Rotation Palette Harmonizer (palette gaps and chromatic complementary matching)
2. Statistical Collaborative Preferences (learned from user's 4★ and 5★ writing samples)
3. Physical Nib-to-Ink Affinities (nib wetness vs ink shading/sheen/viscosity)
4. Tone-on-Tone and Aesthetic Pen Body Harmonies
5. Time-decay Neglect and Rotation Urgency
6. Optional Gemini 'AI Sommelier' Narrative & Paper Pairing Critic
"""

from __future__ import annotations

from datetime import date, datetime
import json
import logging
import os
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..config import BASE_DIR, GEMINI_MODEL
from ..models import Ink, Pen, UsageSession, WritingSample
from ..serializers import serialize_ink_brief, serialize_pen_brief
from ..storage import storage

logger = logging.getLogger(__name__)

ALL_COLOR_FAMILIES = [
    "Blue",
    "Blue-Black",
    "Black",
    "Brown",
    "Green",
    "Red",
    "Burgundy",
    "Purple",
    "Turquoise",
    "Orange",
    "Yellow",
    "Grey",
]

COMPLEMENTARY_MAP: dict[str, list[str]] = {
    "Blue": ["Orange", "Brown", "Gold", "Yellow", "Copper", "Bronze"],
    "Blue-Black": ["Amber", "Warm Brown", "Gold", "Burgundy"],
    "Black": ["Turquoise", "Golden Yellow", "Crimson", "Emerald Green", "Purple", "Orange"],
    "Grey": ["Burgundy", "Wine", "Amber", "Turquoise", "Vibrant Green"],
    "Brown": ["Teal", "Turquoise", "Sky Blue", "Green", "Cobalt"],
    "Green": ["Burgundy", "Wine", "Plum", "Red", "Terracotta"],
    "Red": ["Emerald Green", "Teal", "Olive Green", "Forest Green"],
    "Burgundy": ["Olive Green", "Sage", "Gold", "Teal"],
    "Purple": ["Yellow", "Gold", "Olive Green", "Amber"],
    "Turquoise": ["Warm Brown", "Terracotta", "Coral", "Orange", "Sepia"],
    "Orange": ["Cobalt Blue", "Deep Navy", "Indigo", "Teal"],
    "Yellow": ["Purple", "Deep Indigo", "Navy Blue", "Dark Plum"],
}

BROAD_NIBS = {
    "b",
    "broad",
    "bb",
    "double broad",
    "stub",
    "1.1",
    "1.5",
    "flex",
    "music",
    "calligraphy",
    "zoom",
    "architect",
}
FINE_NIBS = {
    "ef",
    "extra fine",
    "f",
    "fine",
    "po",
    "posting",
    "needlepoint",
    "ultra fine",
}


def _get_api_key() -> str:
    """Resolve Gemini API key from environment or .env files."""
    for env_file in (BASE_DIR / ".env", BASE_DIR / "backend" / ".env", BASE_DIR / ".env.render"):
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.startswith("GEMINI_API_KEY="):
                    val = line.split("=", 1)[1].strip()
                    if val:
                        return val
    return os.getenv("GEMINI_API_KEY", "").strip()


def get_active_palette(db: Session) -> dict[str, Any]:
    """Retrieve all currently active inked pens and inks, computing palette gaps and complements."""
    active_sessions = (
        db.query(UsageSession)
        .options(joinedload(UsageSession.pen), joinedload(UsageSession.ink))
        .filter(UsageSession.end_status == "active")
        .order_by(UsageSession.date_inked.desc())
        .all()
    )

    active_items: list[dict[str, Any]] = []
    active_families: set[str] = set()

    for s in active_sessions:
        if s.ink:
            fam = s.ink.color_family.strip().title()
            active_families.add(fam)
            active_items.append(
                {
                    "session_id": s.id,
                    "pen_id": s.pen_id,
                    "pen_name": s.pen.display_name if s.pen else f"Pen #{s.pen_id}",
                    "ink_id": s.ink_id,
                    "ink_name": s.ink.name,
                    "ink_brand": s.ink.brand,
                    "hex_color": s.ink.hex_color,
                    "color_family": fam,
                    "date_inked": s.date_inked.isoformat() if s.date_inked else None,
                }
            )

    missing_families = [f for f in ALL_COLOR_FAMILIES if f not in active_families]

    # Generate complementary suggestions based on active families
    complementary_set: set[str] = set()
    for fam in active_families:
        for comp in COMPLEMENTARY_MAP.get(fam, []):
            if comp not in active_families:
                complementary_set.add(comp)

    return {
        "active_count": len(active_items),
        "active_items": active_items,
        "active_color_families": sorted(list(active_families)),
        "missing_color_families": missing_families,
        "recommended_complements": sorted(list(complementary_set)),
    }


def get_learned_preferences(db: Session) -> dict[str, Any]:
    """Extract patterns from the user's past 4★ and 5★ writing samples and sessions."""
    high_rated_samples = (
        db.query(WritingSample)
        .options(joinedload(WritingSample.pen), joinedload(WritingSample.ink))
        .filter(WritingSample.rating.isnot(None), WritingSample.rating >= 4)
        .all()
    )

    high_rated_sessions = (
        db.query(UsageSession)
        .options(joinedload(UsageSession.pen), joinedload(UsageSession.ink))
        .filter(UsageSession.rating.isnot(None), UsageSession.rating >= 4)
        .all()
    )

    favorite_pairs: set[tuple[int, int]] = set()
    fav_nib_color: dict[tuple[str, str], int] = {}
    fav_nib_brand: dict[tuple[str, str], int] = {}

    for s in high_rated_samples:
        if s.pen and s.ink:
            favorite_pairs.add((s.pen_id, s.ink_id))
            nib = s.pen.nib_size.lower().strip()
            color = s.ink.color_family.lower().strip()
            fav_nib_color[(nib, color)] = fav_nib_color.get((nib, color), 0) + 1
            fav_nib_brand[(nib, s.ink.brand.lower().strip())] = fav_nib_brand.get((nib, s.ink.brand.lower().strip()), 0) + 1

    for sess in high_rated_sessions:
        if sess.pen and sess.ink:
            favorite_pairs.add((sess.pen_id, sess.ink_id))

    return {
        "favorite_pairs": favorite_pairs,
        "fav_nib_color": fav_nib_color,
        "fav_nib_brand": fav_nib_brand,
    }


def compute_pairing_match(
    pen: Pen,
    ink: Ink,
    active_palette: dict[str, Any],
    learned_prefs: dict[str, Any],
    today: date | None = None,
) -> dict[str, Any]:
    """Calculate the 0-100% compatibility Match Score, badges, and human-readable rationale."""
    ref_date = today or date.today()
    score = 50.0  # neutral starting baseline
    badges: list[str] = []
    reasons: list[str] = []

    # 1. Active Rotation Palette Synergy (Weight: ~25%)
    ink_family = ink.color_family.strip().title()
    active_families = set(active_palette.get("active_color_families", []))
    missing_families = set(active_palette.get("missing_color_families", []))
    complements = set(active_palette.get("recommended_complements", []))

    if active_families:
        if ink_family in complements:
            score += 18.0
            badges.append("🎨 Chromatic Complement")
            reasons.append(f"Complements your active {' / '.join(list(active_families)[:3])} rotation")
        elif ink_family in missing_families:
            score += 14.0
            badges.append("🌈 Palette Diversity")
            reasons.append(f"Fills missing {ink_family} color gap in your active rotation")
        elif ink_family in active_families:
            score -= 6.0  # slight deduction if you already have 2+ pens with this same color
    else:
        # First pen in rotation gets full baseline
        score += 10.0

    # 2. Nib-to-Ink Physical Affinity (Weight: ~25%)
    nib = pen.nib_size.lower().strip()
    props = (ink.properties_tags or "").lower()
    ink_name = ink.name.lower()

    has_shading = "shading" in props or "shading" in ink_name
    has_sheen = "sheen" in props or "sheening" in props or "sheen" in ink_name
    has_shimmer = "shimmer" in props or "sparkle" in props or "glitter" in ink_name

    if any(bn in nib for bn in BROAD_NIBS):
        if has_shading or has_sheen or has_shimmer:
            score += 20.0
            badges.append("✨ Broad Nib + Rich Shading")
            reasons.append(f"{pen.nib_size} nib delivers wet flow to showcase {ink.name}'s shading and sheen")
        else:
            score += 10.0
    elif any(fn in nib for fn in FINE_NIBS):
        if has_shimmer:
            score -= 10.0  # shimmer can clog fine nib feeds
            reasons.append(f"Caution: shimmer in {ink.name} may require wet feed or frequent cleaning in {pen.nib_size}")
        elif ink.brand.lower() in ("pilot", "sailor", "diamine", "waterman", "aurora", "kwz"):
            score += 15.0
            badges.append("🖋️ Smooth Fine-Nib Flow")
            reasons.append(f"Lubricated, well-behaved {ink.brand} formula ensures smooth glide on {pen.nib_size} nib")
    else:
        # Medium / other nibs
        score += 10.0

    # 3. Learned User Preferences from 4★/5★ ratings (Weight: ~20%)
    if (pen.id, ink.id) in learned_prefs.get("favorite_pairs", set()):
        score += 20.0
        badges.append("⭐ Top-Rated Historic Pair")
        reasons.append("You previously awarded this pairing high satisfaction ratings")
    else:
        nib_col_key = (nib, ink_family.lower())
        if nib_col_key in learned_prefs.get("fav_nib_color", {}):
            score += 12.0
            badges.append("💡 Matches Learned Favorite Style")
            reasons.append(f"You consistently rate {pen.nib_size} nibs with {ink_family} inks highly")

    # 4. Pen-Body to Ink Color Harmony (Weight: ~15%)
    pen_variant = (pen.color_variant or "").lower()
    pen_model = (pen.model or "").lower()
    pen_color_str = f"{pen_variant} {pen_model}"

    if "amber" in pen_color_str or "tortoise" in pen_color_str:
        if ink_family in ("Brown", "Orange", "Yellow", "Burgundy"):
            score += 15.0
            badges.append("🍂 Warm Amber Harmony")
            reasons.append("Tone-on-tone warmth matching amber/tortoise pen finish")
    elif "blue" in pen_color_str:
        if ink_family in ("Blue", "Blue-Black", "Turquoise"):
            score += 14.0
            badges.append("🌊 Classic Blue-on-Blue")
            reasons.append("Cohesive blue body and ink harmony")
    elif "green" in pen_color_str:
        if ink_family in ("Green", "Brown"):
            score += 14.0
            badges.append("🌿 Botanical Green Harmony")
            reasons.append("Harmonious botanical earth tones")
    elif "black" in pen_color_str or "silver" in pen_color_str or "demonstrator" in pen_color_str or "clear" in pen_color_str:
        score += 10.0  # Universal neutral match

    # 5. Individual Quality Baseline (Weight: ~10%)
    pen_rt = pen.rating or 3
    ink_rt = ink.rating or 3
    if pen_rt >= 4 and ink_rt >= 4:
        score += 10.0
        badges.append("🏆 5-Star Duo")

    # 6. Neglect & Rotation Urgency (Weight: ~5%)
    # Pen neglect
    latest_sess = max((s.date_cleaned or s.date_inked for s in pen.sessions if s.date_inked), default=None)
    if latest_sess:
        days_neglected = (ref_date - latest_sess).days
        if days_neglected > 90:
            score += 8.0
            badges.append("⏳ Ready for Rotation")
            reasons.append(f"Pen has rested for {days_neglected} days")

    final_score = int(max(20, min(100, round(score))))
    explanation = "; ".join(reasons[:2]) if reasons else f"Solid all-around pairing for {pen.display_name} and {ink.name}."

    return {
        "score": final_score,
        "badges": badges[:3],
        "explanation": explanation,
    }


class GeminiSommelierCritique(BaseModel):
    headline: str = Field(description="Catchy 4-8 word title for this pen & ink pairing")
    sommelier_notes: str = Field(description="Evocative 2-3 sentence connoisseur critique of how this pen nib and ink perform together")
    palette_role: str = Field(description="1-2 sentences explaining how this ink complements the user's active inked rotation")
    recommended_paper: str = Field(description="Ideal fountain pen paper types, e.g. Tomoe River 52gsm, Midori MD, Clairefontaine")
    ideal_use_case: str = Field(description="Best writing scenario, e.g. Evening journaling, formal correspondence, margin notes")


def generate_sommelier_critique(
    pen: Pen,
    ink: Ink,
    active_palette: dict[str, Any],
    pairing_stats: dict[str, Any],
    sample_transcriptions: list[str] | None = None,
) -> dict[str, Any]:
    """Invoke Gemini API to generate tailored sommelier commentary, falling back gracefully to heuristic notes."""
    api_key = _get_api_key()

    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            active_info = ", ".join(
                f"{item['pen_name']} with {item['ink_name']} ({item['color_family']})"
                for item in active_palette.get("active_items", [])
            ) or "None currently active"

            sample_context = "; ".join(sample_transcriptions[:3]) if sample_transcriptions else "No prior samples"

            prompt = f"""You are an expert Fountain Pen Sommelier and Master Calligrapher.
Evaluate this fountain pen and ink pairing for a collector:

PEN:
- Brand & Model: {pen.brand} {pen.model}
- Color Variant: {pen.color_variant or 'Standard'}
- Nib: {pen.nib_size} ({pen.nib_material})
- Filling Mechanism: {pen.filling_mechanism}
- Rating: {pen.rating or 'Unrated'}/5 stars
- Notes: {pen.custom_notes or 'None'}

INK:
- Brand & Name: {ink.brand} {ink.name}
- Color Family: {ink.color_family} (Hex: {ink.hex_color})
- Format: {ink.format} ({ink.volume_ml}ml, remaining level: {ink.remaining_level})
- Properties / Tags: {ink.properties_tags or 'Standard'}
- Rating: {ink.rating or 'Unrated'}/5 stars
- Mountain of Ink Link: {ink.mountain_of_ink_url or 'None'}

CONTEXT:
- Currently Inked Pens & Inks in Collection: {active_info}
- Prior Times Paired Together: {pairing_stats.get('times_paired', 0)}
- Previous Writing Sample Snippets: {sample_context}

Provide an evocative, connoisseur critique in JSON. Be specific about nib wetness, shading, sheen, paper interaction, and aesthetic balance."""

            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GeminiSommelierCritique,
                    temperature=0.3,
                ),
            )

            if response.text:
                parsed = json.loads(response.text)
                return {
                    "source": "gemini_ai",
                    "model": GEMINI_MODEL,
                    **parsed,
                }
        except Exception as err:
            logger.warning("Gemini sommelier generation failed, using heuristic fallback: %s", err)

    # Heuristic fallback if offline or no API key
    fam = ink.color_family
    nib = pen.nib_size
    return {
        "source": "heuristic_sommelier",
        "headline": f"Harmonious {nib} Nib Pairing with {ink.name}",
        "sommelier_notes": (
            f"The {pen.brand} {pen.model}'s {nib} nib pairs exceptionally well with {ink.brand} {ink.name}. "
            f"Its ink flow brings out {fam.lower()} depth and subtle characteristics while ensuring smooth, reliable feedback."
        ),
        "palette_role": (
            f"Adds a balanced {fam.lower()} voice to your active desk rotation, providing visual distinction from your other inked pens."
        ),
        "recommended_paper": "Tomoe River 52gsm, Midori MD, or Rhodia 80g/m²",
        "ideal_use_case": "Daily reflective journaling, notebook entries, and personal correspondence",
    }
