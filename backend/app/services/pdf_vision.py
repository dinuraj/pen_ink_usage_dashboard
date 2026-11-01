"""Multi-page PDF rendering (pypdfium2), Pillow cropping/color sampling, and Gemini Vision OCR."""

from __future__ import annotations

import colorsys
import io
import json
import os
import uuid
from datetime import date
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from dotenv import dotenv_values

from ..config import BASE_DIR, GEMINI_MODEL
from ..models import Ink, Pen, ScanPage
from ..schemas import CropBox, ExtractedEntryCandidate
from ..storage import storage
from .matcher import is_duplicate_session, match_ink, match_pen


def get_gemini_api_key(db: Session | None = None) -> str:
    """Resolve Gemini API key from environment or gitignored .env files (never stored in DB)."""
    for env_file in (BASE_DIR / ".env", BASE_DIR / "backend" / ".env"):
        if env_file.exists():
            vals = dotenv_values(env_file)
            file_key = (vals.get("GEMINI_API_KEY") or "").strip()
            if file_key:
                return file_key
    return os.getenv("GEMINI_API_KEY", "").strip()


def render_document_pages(file_bytes: bytes, filename: str, scale: float = 2.2) -> list[tuple[bytes, int, int, str]]:
    """Render a multi-page PDF (or single image) into high-DPI WebP page images.

    Returns list of tuples: (webp_bytes, width_px, height_px, embedded_meta_json).
    """
    ext = Path(filename).suffix.lower()
    results: list[tuple[bytes, int, int, str]] = []

    if ext == ".pdf" or file_bytes[:4] == b"%PDF":
        pdf = pdfium.PdfDocument(file_bytes)
        try:
            n_pages = len(pdf)
            for idx in range(n_pages):
                page = pdf[idx]
                bitmap = page.render(scale=scale)
                pil_img = bitmap.to_pil().convert("RGB")
                buf = io.BytesIO()
                pil_img.save(buf, format="WEBP", quality=90)
                results.append((buf.getvalue(), pil_img.width, pil_img.height, ""))
                page.close()
        finally:
            pdf.close()
    else:
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        buf = io.BytesIO()
        pil_img.save(buf, format="WEBP", quality=90)
        results.append((buf.getvalue(), pil_img.width, pil_img.height, ""))

    return results


def crop_sample_bytes(page_image_path: Path, box: CropBox) -> bytes:
    """Crop normalized CropBox from a rendered page image and return WebP bytes."""
    img = Image.open(page_image_path).convert("RGB")
    w, h = img.size
    left = max(0, min(w - 10, int(round(box.x * w))))
    top = max(0, min(h - 10, int(round(box.y * h))))
    right = max(left + 10, min(w, int(round((box.x + box.w) * w))))
    bottom = max(top + 10, min(h, int(round((box.y + box.h) * h))))

    cropped = img.crop((left, top, right, bottom))
    buf = io.BytesIO()
    cropped.save(buf, format="WEBP", quality=92)
    return buf.getvalue()


def classify_color_family(r: int, g: int, b: int) -> str:
    """Map RGB values of an ink stroke to a standard fountain pen ink color family."""
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, l, s = colorsys.rgb_to_hls(rf, gf, bf)
    deg = h * 360.0

    if l < 0.16 and s < 0.28:
        return "Black"
    if s < 0.14:
        return "Black" if l < 0.28 else "Grey"
    if deg < 16 or deg >= 342:
        return "Brown" if l < 0.28 and s < 0.55 else "Red"
    if 16 <= deg < 44:
        return "Brown" if l < 0.42 else "Orange"
    if 44 <= deg < 72:
        return "Brown" if l < 0.45 else "Orange"
    if 72 <= deg < 162:
        return "Green"
    if 162 <= deg < 202:
        return "Teal"
    if 202 <= deg < 258:
        return "Blue"
    if 258 <= deg < 342:
        return "Purple"
    return "Blue"


def sample_ink_color_from_region(page_image_path: Path, box: CropBox) -> tuple[str, str]:
    """Extract representative ink stroke hex color and color family, ignoring paper background."""
    img = Image.open(page_image_path).convert("RGB")
    w, h = img.size
    left = max(0, min(w - 2, int(round(box.x * w))))
    top = max(0, min(h - 2, int(round(box.y * h))))
    right = max(left + 2, min(w, int(round((box.x + box.w) * w))))
    bottom = max(top + 2, min(h, int(round((box.y + box.h) * h))))

    region = img.crop((left, top, right, bottom))
    region.thumbnail((180, 180))
    pixels = list(region.getdata())

    # Filter out paper background (high brightness, low saturation)
    ink_pixels: list[tuple[int, int, int]] = []
    for r, g, b in pixels:
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        chroma = max(r, g, b) - min(r, g, b)
        if lum < 195 or chroma > 28:
            ink_pixels.append((r, g, b))

    if not ink_pixels:
        ink_pixels = sorted(pixels, key=lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])[: max(1, len(pixels) // 10)]

    # Sort by darkness/saturation to capture rich ink core rather than anti-aliased edge
    ink_pixels.sort(key=lambda p: (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) - 0.6 * (max(p) - min(p)))
    core = ink_pixels[: max(1, len(ink_pixels) // 2)]

    avg_r = int(sum(p[0] for p in core) / len(core))
    avg_g = int(sum(p[1] for p in core) / len(core))
    avg_b = int(sum(p[2] for p in core) / len(core))

    hex_code = f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}"
    family = classify_color_family(avg_r, avg_g, avg_b)
    return hex_code, family


# ---------- Gemini Structured Vision Schema ----------

class _GeminiEntryItem(BaseModel):
    date_inked_iso: str = Field(..., description="ISO date YYYY-MM-DD read from entry header")
    raw_pen_line: str = Field("", description="Exact handwritten line describing pen, nib, and color")
    pen_brand: str = Field("", description="Fountain pen manufacturer/company name")
    pen_model: str = Field("", description="Fountain pen model name")
    pen_color: str = Field("", description="Pen body color or finish if written")
    nib_size: str = Field("M", description="Nib specification e.g. EF, F, FM, M, B, Stub 1.1")
    raw_ink_line: str = Field("", description="Exact handwritten line describing ink company and name")
    ink_brand: str = Field("", description="Ink manufacturer/company name")
    ink_name: str = Field("", description="Ink color/product name")
    scribble_transcription: str = Field("", description="Brief transcription of sample scribbles")
    ymin: int = Field(..., description="Top of writing sample / entry block (0 to 1000)")
    xmin: int = Field(..., description="Left of writing sample / entry block (0 to 1000)")
    ymax: int = Field(..., description="Bottom of writing sample / entry block (0 to 1000)")
    xmax: int = Field(..., description="Right of writing sample / entry block (0 to 1000)")


class _GeminiPageExtraction(BaseModel):
    entries: list[_GeminiEntryItem] = Field(default_factory=list)


def _parse_safe_date(iso_str: str) -> date:
    try:
        return date.fromisoformat(iso_str.strip()[:10])
    except Exception:
        return date.today()


def _offline_band_candidates(db: Session, page: ScanPage, page_path: Path) -> list[ExtractedEntryCandidate]:
    """Fallback layout segmentation when no GEMINI_API_KEY is configured."""
    # If page already has pre-populated JSON (e.g. demo notebook PDF), hydrate and re-match!
    if page.extracted_json and page.extracted_json not in ("", "[]"):
        try:
            stored = json.loads(page.extracted_json)
            if isinstance(stored, list) and stored:
                hydrated: list[ExtractedEntryCandidate] = []
                for item in stored:
                    cand = ExtractedEntryCandidate(**item)
                    pen_id, pen_conf = match_pen(
                        db, cand.pen_brand, cand.pen_model, cand.pen_color, cand.nib_size, cand.raw_pen_text
                    )
                    ink_id, ink_conf = match_ink(db, cand.ink_brand, cand.ink_name, cand.raw_ink_text)
                    cand.matched_pen_id = pen_id
                    cand.pen_match_confidence = pen_conf
                    cand.matched_ink_id = ink_id
                    cand.ink_match_confidence = ink_conf
                    cand.is_duplicate = is_duplicate_session(db, pen_id, ink_id, cand.date_inked)
                    cand.skip = cand.is_duplicate
                    hydrated.append(cand)
                return hydrated
        except Exception:
            pass

    # Otherwise detect horizontal ink-activity bands (supports both single pages and 2-page landscape spreads)
    img = Image.open(page_path).convert("L")
    is_landscape_spread = img.width > img.height * 1.15
    col_specs = (
        [(0.025, 0.460), (0.510, 0.475)]
        if is_landscape_spread
        else [(0.050, 0.900)]
    )

    candidates: list[ExtractedEntryCandidate] = []
    for col_x, col_w in col_specs:
        small_w, small_h = 180, 280
        c_left = int(col_x * img.width)
        c_right = int((col_x + col_w) * img.width)
        col_img = img.crop((c_left, 0, c_right, img.height)).resize((small_w, small_h))
        px = col_img.load()

        row_ink_density: list[float] = []
        for y in range(small_h):
            dark = sum(1 for x in range(10, small_w - 10) if px[x, y] < 195)
            row_ink_density.append(dark / (small_w - 20))

        bands: list[tuple[int, int]] = []
        in_band = False
        start_y = 0
        gap_run = 0
        for y, dens in enumerate(row_ink_density):
            if dens > 0.025:
                if not in_band:
                    in_band = True
                    start_y = y
                gap_run = 0
            elif in_band:
                gap_run += 1
                if gap_run >= 10:
                    end_y = y - gap_run
                    if end_y - start_y >= 15:
                        bands.append((start_y, end_y))
                    in_band = False
                    gap_run = 0
        if in_band and (small_h - start_y) >= 15:
            bands.append((start_y, small_h - 4))

        for b_top, b_bot in bands[:6]:
            y_norm = max(0.015, (b_top / small_h) - 0.012)
            h_norm = min(0.98 - y_norm, ((b_bot - b_top) / small_h) + 0.028)
            box = CropBox(x=round(col_x, 3), y=round(y_norm, 3), w=round(col_w, 3), h=round(max(0.10, h_norm), 3))
            hex_col, family = sample_ink_color_from_region(page_path, box)
            candidates.append(
                ExtractedEntryCandidate(
                    entry_uid=uuid.uuid4().hex[:10],
                    page_id=page.id,
                    page_number=page.page_number,
                    date_inked=date.today(),
                    suggested_hex=hex_col,
                    suggested_color_family=family,
                    crop_box=box,
                )
            )
    return candidates


def analyze_scan_page(db: Session, page: ScanPage) -> tuple[list[ExtractedEntryCandidate], str]:
    """Extract notebook ink-up entries from a ScanPage using Gemini Vision (or offline band fallback).

    Returns (candidates, mode_used) where mode_used is 'gemini_vision' or 'offline_layout'.
    """
    page_path = storage.resolve_path(page.image_storage_key)
    api_key = get_gemini_api_key(db)

    if not api_key:
        cands = _offline_band_candidates(db, page, page_path)
        page.extracted_json = json.dumps([c.model_dump(mode="json") for c in cands])
        return cands, "offline_layout"

    from google import genai
    from google.genai import types

    pens = db.query(Pen).all()
    inks = db.query(Ink).all()
    known_pens_hint = ", ".join(
        f"{p.brand} {p.model} ({p.color_variant or 'standard'}, {p.nib_size})" for p in pens[:60]
    )
    known_inks_hint = ", ".join(f"{i.brand} {i.name}" for i in inks[:80])

    prompt = f"""You are analyzing a scanned page (or two-page landscape spread) from a fountain pen user's handwritten ink-up log notebook.
Each entry follows this handwritten structure:
  Date (note: multiple entries stacked below a single Date header share that Date!)
  -----
  Fountain pen model (company name, model name, nib specification, and pen body color if written)
  Ink company and ink name
  Sample scribbles / handwriting sample written with that pen and ink.

IMPORTANT:
- If this image is a landscape two-page notebook spread, inspect BOTH the LEFT page (xmin ~20..485) and the RIGHT page (xmin ~510..985) separately — never draw one bounding box spanning across the center spine!
- Entries without their own date line inherit the nearest Date header above them (in reading order: Left page top-to-bottom, then Right page top-to-bottom).
- Known pens in the user's collection (match spelling if close, otherwise transcribe what is written):
[{known_pens_hint}]

Known inks in the user's collection (match spelling if close, otherwise transcribe what is written):
[{known_inks_hint}]

For EVERY ink-up entry on the page/spread:
1. Extract date_inked_iso (YYYY-MM-DD), raw_pen_line, pen_brand, pen_model, pen_color, nib_size, raw_ink_line, ink_brand, ink_name, and scribble_transcription.
2. Provide bounding box coordinates (ymin, xmin, ymax, xmax scaled 0..1000) tightly framing that single entry's handwritten block / sample scribbles on its respective page side so we can crop it as a visual writing sample.
"""

    img_bytes = page_path.read_bytes()
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=img_bytes, mime_type="image/webp"),
            prompt,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_GeminiPageExtraction,
            temperature=0.1,
        ),
    )

    parsed: dict[str, Any] = json.loads(response.text or '{"entries": []}')
    raw_entries = parsed.get("entries", [])

    candidates: list[ExtractedEntryCandidate] = []
    for item in raw_entries:
        dt = _parse_safe_date(item.get("date_inked_iso", ""))
        ymin = max(0, min(980, int(item.get("ymin", 50))))
        xmin = max(0, min(980, int(item.get("xmin", 40))))
        ymax = max(ymin + 40, min(1000, int(item.get("ymax", 350))))
        xmax = max(xmin + 80, min(1000, int(item.get("xmax", 960))))

        box = CropBox(
            x=round(xmin / 1000.0, 3),
            y=round(ymin / 1000.0, 3),
            w=round((xmax - xmin) / 1000.0, 3),
            h=round((ymax - ymin) / 1000.0, 3),
        )
        hex_col, family = sample_ink_color_from_region(page_path, box)

        p_brand = item.get("pen_brand", "").strip()
        p_model = item.get("pen_model", "").strip()
        p_color = item.get("pen_color", "").strip()
        p_nib = item.get("nib_size", "M").strip() or "M"
        raw_pen = item.get("raw_pen_line", "").strip()

        i_brand = item.get("ink_brand", "").strip()
        i_name = item.get("ink_name", "").strip()
        raw_ink = item.get("raw_ink_line", "").strip()

        matched_pen_id, pen_conf = match_pen(db, p_brand, p_model, p_color, p_nib, raw_pen)
        matched_ink_id, ink_conf = match_ink(db, i_brand, i_name, raw_ink)
        dup = is_duplicate_session(db, matched_pen_id, matched_ink_id, dt)

        candidates.append(
            ExtractedEntryCandidate(
                entry_uid=uuid.uuid4().hex[:10],
                page_id=page.id,
                page_number=page.page_number,
                date_inked=dt,
                raw_pen_text=raw_pen,
                pen_brand=p_brand,
                pen_model=p_model,
                pen_color=p_color,
                nib_size=p_nib,
                matched_pen_id=matched_pen_id,
                pen_match_confidence=pen_conf,
                raw_ink_text=raw_ink,
                ink_brand=i_brand,
                ink_name=i_name,
                suggested_hex=hex_col,
                suggested_color_family=family,
                matched_ink_id=matched_ink_id,
                ink_match_confidence=ink_conf,
                transcription=item.get("scribble_transcription", "").strip(),
                crop_box=box,
                is_duplicate=dup,
                skip=dup,
            )
        )

    page.extracted_json = json.dumps([c.model_dump(mode="json") for c in candidates])
    return candidates, "gemini_vision"
