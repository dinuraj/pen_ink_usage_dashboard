"""Rich realistic demo dataset generator (Pens, Inks, History, Samples, and Multi-Page Notebook PDF)."""

from __future__ import annotations

import io
import json
import math
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.orm import Session

from .config import DATA_DIR
from .models import (
    Ink,
    LifecycleEvent,
    Pen,
    PenPhoto,
    ScanBatch,
    ScanPage,
    UsageSession,
    WritingSample,
)
from .schemas import CropBox, ExtractedEntryCandidate
from .services.pdf_vision import render_document_pages
from .storage import storage


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    if len(h) != 6:
        return (30, 58, 138)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _load_handwriting_font(size: int, style: str = "script") -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    win_fonts = Path("C:/Windows/Fonts")
    candidates = (
        ["segoesc.ttf", "Inkfree.ttf", "segoepr.ttf", "Gabriola.ttf", "georgiai.ttf", "arial.ttf"]
        if style == "script"
        else ["consola.ttf", "segoeui.ttf", "arial.ttf"]
    )
    for fname in candidates:
        fpath = win_fonts / fname
        if fpath.exists():
            try:
                return ImageFont.truetype(str(fpath), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def _nib_stroke_width(nib_size: str) -> int:
    ns = nib_size.upper()
    if "STUB" in ns or ns in ("B", "BB", "MUSIC"):
        return 4
    if ns in ("M", "FM", "MF"):
        return 3
    if ns in ("EF",):
        return 1
    return 2


def _draw_notebook_entry_block(
    draw: ImageDraw.ImageDraw,
    *,
    x0: int,
    y0: int,
    width: int,
    entry_date: date,
    pen_line: str,
    ink_line: str,
    quote_line: str,
    ink_hex: str,
    nib_size: str,
) -> int:
    """Draw a single handwritten ink-up notebook entry matching the user's exact format.

    Returns the bottom y coordinate of the drawn entry block.
    """
    r, g, b = _hex_to_rgb(ink_hex)
    ink_dark = (max(0, r - 18), max(0, g - 18), max(0, b - 18))
    ink_mid = (r, g, b)
    ink_shade = (min(255, int(r + (255 - r) * 0.34)), min(255, int(g + (255 - g) * 0.34)), min(255, int(b + (255 - b) * 0.34)))

    stroke_w = _nib_stroke_width(nib_size)
    font_size = 25 if stroke_w <= 2 else (27 if stroke_w == 3 else 29)
    f_hand = _load_handwriting_font(font_size, "script")
    f_small = _load_handwriting_font(max(20, font_size - 4), "script")

    cur_y = y0
    # 1. Date
    draw.text((x0, cur_y), entry_date.isoformat(), fill=ink_dark, font=f_hand)
    cur_y += 42

    # 2. Dashed / handwritten underline -----
    for seg in range(7):
        sx = x0 + seg * 24
        draw.line([(sx, cur_y), (sx + 16, cur_y + (seg % 2))], fill=ink_mid, width=max(2, stroke_w))
    cur_y += 16

    # 3. Fountain pen model + nib + color
    draw.text((x0, cur_y), pen_line, fill=ink_dark, font=f_hand)
    cur_y += 38

    # 4. Ink company + ink name
    draw.text((x0, cur_y), ink_line, fill=ink_mid, font=f_hand)
    cur_y += 42

    # 5. Sample scribbles: pangram/sentence + figure-8 flourish + cross-hatch ink shading patch
    draw.text((x0, cur_y), quote_line, fill=ink_dark, font=f_small)
    cur_y += 42

    # Organic figure-8 loops & wave flourish on left
    pts_wave: list[tuple[float, float]] = []
    for step in range(95):
        t = step / 94.0
        wx = x0 + t * (width * 0.56)
        wy = cur_y + 18 + math.sin(t * math.pi * 7.5) * (11 + stroke_w) + math.cos(t * math.pi * 3.0) * 4
        pts_wave.append((wx, wy))
    draw.line(pts_wave, fill=ink_mid, width=max(2, stroke_w))

    # Cross-hatch & swab rectangle on right showing ink shading!
    swab_x = x0 + int(width * 0.62)
    swab_w = int(width * 0.33)
    swab_y = cur_y + 2
    swab_h = 36
    draw.rounded_rectangle([swab_x, swab_y, swab_x + swab_w, swab_y + swab_h], radius=6, fill=ink_shade)
    draw.rounded_rectangle(
        [swab_x, swab_y, swab_x + int(swab_w * 0.48), swab_y + swab_h], radius=6, fill=ink_mid
    )
    for hx in range(swab_x - 75, swab_x - 12, 9):
        draw.line([(hx, swab_y + 2), (hx + 16, swab_y + swab_h - 2)], fill=ink_dark, width=max(1, stroke_w - 1))
        draw.line([(hx + 16, swab_y + 2), (hx, swab_y + swab_h - 2)], fill=ink_mid, width=max(1, stroke_w - 1))

    return cur_y + 52


def _make_dot_grid_canvas(width: int, height: int) -> Image.Image:
    """Create a warm cream Tomoe River / Midori-inspired dot-grid paper image."""
    img = Image.new("RGB", (width, height), color=(252, 250, 244))
    draw = ImageDraw.Draw(img)
    # Subtle dot grid
    dot_color = (218, 214, 204)
    for gy in range(36, height - 24, 34):
        for gx in range(36, width - 24, 34):
            draw.point((gx, gy), fill=dot_color)
            draw.point((gx + 1, gy), fill=dot_color)
    # Faint left margin line
    draw.line([(48, 0), (48, height)], fill=(238, 226, 220), width=1)
    return img


def _render_single_sample_card(
    *,
    entry_date: date,
    pen: Pen,
    ink: Ink,
    quote: str,
) -> bytes:
    """Generate a crisp cropped writing sample image for a UsageSession."""
    w, h = 980, 290
    img = _make_dot_grid_canvas(w, h)
    draw = ImageDraw.Draw(img)
    pen_str = f"{pen.brand} {pen.model}" + (f" — {pen.color_variant}" if pen.color_variant else "") + f" [{pen.nib_size}]"
    ink_str = f"{ink.brand} {ink.name}"
    _draw_notebook_entry_block(
        draw,
        x0=66,
        y0=20,
        width=w - 110,
        entry_date=entry_date,
        pen_line=pen_str,
        ink_line=ink_str,
        quote_line=quote,
        ink_hex=ink.hex_color,
        nib_size=pen.nib_size,
    )
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=92)
    return buf.getvalue()


def _render_pen_card_illustration(pen: Pen, accent_hex: str) -> bytes:
    """Generate a sleek minimalist studio card photo for each demo pen."""
    w, h = 900, 420
    img = Image.new("RGB", (w, h), color=(248, 250, 252))
    draw = ImageDraw.Draw(img)
    r, g, b = _hex_to_rgb(accent_hex)

    # Subtle grid
    for gx in range(0, w, 40):
        draw.line([(gx, 0), (gx, h)], fill=(241, 245, 249), width=1)
    for gy in range(0, h, 40):
        draw.line([(0, gy), (w, gy)], fill=(241, 245, 249), width=1)

    # Stylized fountain pen silhouette + nib
    cy = 195
    # Nib triangle + breather hole
    draw.polygon([(145, cy), (235, cy - 22), (235, cy + 22)], fill=(212, 175, 55) if "Gold" in pen.nib_material else (148, 163, 184))
    draw.line([(145, cy), (205, cy)], fill=(51, 65, 85), width=2)
    draw.ellipse([198, cy - 5, 208, cy + 5], fill=(51, 65, 85))
    # Section + Barrel + Cap band
    draw.rounded_rectangle([235, cy - 20, 305, cy + 20], radius=6, fill=(30, 41, 59))
    draw.rounded_rectangle([302, cy - 26, 745, cy + 26], radius=18, fill=(r, g, b))
    draw.rectangle([490, cy - 26, 506, cy + 26], fill=(226, 192, 92) if "Gold" in pen.nib_material else (203, 213, 225))
    # Clip
    draw.rounded_rectangle([540, cy - 36, 715, cy - 26], radius=4, fill=(226, 192, 92) if "Gold" in pen.nib_material else (148, 163, 184))

    f_title = _load_handwriting_font(26, "sans")
    f_sub = _load_handwriting_font(18, "sans")
    draw.text((64, 315), f"{pen.brand} {pen.model}", fill=(15, 23, 42), font=f_title)
    spec_line = f"{pen.color_variant}  ·  {pen.nib_size} ({pen.nib_material})  ·  {pen.filling_mechanism}"
    draw.text((64, 352), spec_line, fill=(100, 116, 139), font=f_sub)

    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=90)
    return buf.getvalue()


def seed_demo_database(db: Session, *, reset_existing: bool = False) -> dict[str, Any]:
    """Populate realistic pens, inks, usage sessions, writing samples, and a multi-page demo PDF scan."""
    if reset_existing:
        db.query(WritingSample).delete()
        db.query(LifecycleEvent).delete()
        db.query(UsageSession).delete()
        db.query(ScanPage).delete()
        db.query(ScanBatch).delete()
        db.query(PenPhoto).delete()
        db.query(Pen).delete()
        db.query(Ink).delete()
        db.commit()
        for folder_name in ("pdfs", "pages", "samples", "pens"):
            folder_path = DATA_DIR / "uploads" / folder_name
            if folder_path.exists():
                for old_f in folder_path.glob("*"):
                    if old_f.is_file():
                        old_f.unlink(missing_ok=True)

    today = date.today()

    pens_spec = [
        ("Pilot", "Custom 823", "Amber", "M", "14k Gold", "Vacuum", "#78350f",
         "### Notes & Setup\n- **Feed & Flow**: Wet, glassy smooth #15 nib; inner seal o-ring kept intact for flights.\n- **Best Pairings**: Shines with shading blues and teals (`Tsuki-yo`, `Kon-peki`).\n- **Capacity**: ~2.2 ml full vacuum fill — my primary long-form journal writer."),
        ("Pilot", "Custom 823", "Smoke Black", "F", "14k Gold", "Vacuum", "#1e293b",
         "### Notes & Setup\n- Purchased as a dedicated fine-nib counterpart to the Amber 823.\n- Ideal for dense work notes and marginalia on standard office paper."),
        ("Lamy", "2000", "Makrolon Black", "EF", "14k Gold", "Piston", "#27272a",
         "### Notes & Setup\n- Classic Bauhaus hooded nib; sweet spot is generous once muscle memory locks in.\n- Quick snap cap makes it unbeatable for rapid meeting bullet points."),
        ("Lamy", "Safari", "Savannah Green", "M", "Steel", "Converter", "#3f6212",
         "### Notes & Setup\n- Limited edition matte finish with Z28 converter.\n- Swappable Z50 nib unit; easy 2-minute bulb-syringe flush when testing darker inks."),
        ("Lamy", "Safari", "Mango Yellow", "Stub 1.1", "Steel", "Converter", "#ca8a04",
         "### Notes & Setup\n- Fitted with a **Lamy Z50 1.1mm Stub** nib to bring out dramatic line variation, sheen, and shading.\n- Dedicated ink-testing & header pen."),
        ("Sailor", "Pro Gear", "Imperial Black", "MF", "21k Gold", "Converter", "#18181b",
         "### Notes & Setup\n- Signature Sailor pencil-like feedback on ruthenium-plated 21k nib.\n- Prefers lubricated Japanese inks (`Iroshizuku`, `Sailor Shikiori`)."),
        ("Platinum", "3776 Century", "Chartres Blue", "SF", "14k Gold", "Converter", "#1d4ed8",
         "### Notes & Setup\n- **Slip & Seal** cap mechanism prevents dry-out for months — safe home for pigment ink.\n- Soft Fine (`SF`) nib offers pleasant bounce on downstrokes."),
        ("TWSBI", "Eco", "Clear Demonstrator", "B", "Steel", "Piston", "#0284c7",
         "### Notes & Setup\n- High-capacity demonstrator reserved for shimmer, heavy-sheen, and multishading inks.\n- Broad nib lays down generous pools of ink on Tomoe River paper."),
        ("Pelikan", "Souverän M800", "Green Black Stripe", "M", "18k Gold", "Piston", "#14532d",
         "### Notes & Setup\n- Brass piston mechanism gives ideal back-weighted balance unposted.\n- Typical Pelikan generous Western Medium width (closer to a Japanese Broad)."),
        ("Kaweco", "Brass Sport", "Raw Brass", "F", "Steel", "Cartridge", "#92400e",
         "### Notes & Setup\n- Everyday pocket carry; developing a warm patina.\n- Refilled short international cartridges via blunt-tip syringe."),
    ]

    pens: list[Pen] = []
    for brand, model, color_var, nib, mat, mech, body_hex, notes in pens_spec:
        pen = Pen(
            brand=brand,
            model=model,
            color_variant=color_var,
            nib_size=nib,
            nib_material=mat,
            filling_mechanism=mech,
            status="active",
            custom_notes=notes,
        )
        db.add(pen)
        db.flush()
        card_bytes = _render_pen_card_illustration(pen, body_hex)
        photo_key = storage.save_bytes("pens", f"demo_pen_{pen.id}.webp", card_bytes)
        pen.primary_photo_key = photo_key
        db.add(PenPhoto(pen_id=pen.id, storage_key=photo_key, caption=f"{brand} {model} ({color_var})"))
        pens.append(pen)

    inks_spec = [
        ("Pilot Iroshizuku", "Tsuki-yo", "Teal", "#1b506b", "bottle", 50.0, "half",
         "https://mountainofink.com/blog/pilot-iroshizuku-tsuki-yo", "Shading, Red Sheen, Wet",
         "My desert-island blue-teal. Effortless flow in every pen, subtle red edge sheen on Tomoe River, and cleans out with plain water."),
        ("Pilot Iroshizuku", "Kon-peki", "Blue", "#0e74bc", "bottle", 50.0, "75_pct",
         "https://mountainofink.com/blog/pilot-iroshizuku-kon-peki", "Vibrant, Shading, Wet",
         "Bright cerulean sky blue that pops off cream paper. Great contrast alongside darker inks."),
        ("Pilot Iroshizuku", "Yama-budo", "Purple", "#881c5e", "bottle", 50.0, "75_pct",
         "https://mountainofink.com/blog/pilot-iroshizuku-yama-budo", "Gold Sheen, Wet",
         "Rich crimson-berry magenta that flashes golden sheen in medium and broad nibs."),
        ("Diamine", "Writer's Blood", "Red", "#5b1220", "bottle", 80.0, "full",
         "https://mountainofink.com/blog/diamine-writers-blood", "Very Wet, Dark Burgundy",
         "Exceptionally wet flow — tames dry EF/SF nibs immediately. Deep oxblood/black-cherry tone suitable for long journaling sessions."),
        ("Diamine", "Ancient Copper", "Brown", "#9a3b1b", "bottle", 30.0, "low",
         "https://mountainofink.com/blog/diamine-ancient-copper", "High Shading, Warm",
         "Gorgeous Burnished copper shading! Note: can form harmless nib creep crystals if left idle >3 weeks, so flush promptly."),
        ("Diamine", "Aurora Borealis", "Teal", "#0d5c63", "bottle", 30.0, "half",
         "https://mountainofink.com/blog/diamine-aurora-borealis", "Shading, Red Sheen",
         "Community collaboration teal-green; slightly greener than Tsuki-yo with crisp shading."),
        ("Sailor Manyo", "Haha", "Blue", "#5f88ad", "bottle", 50.0, "full",
         "https://mountainofink.com/blog/sailor-manyo-haha", "Dual-Shading, Pastel",
         "Famous multishader showing pale misty blue with pink/green halos. Needs a **Broad** or **Stub** nib — too pale in EF/F."),
        ("Sailor Shikiori", "Tokiwa-matsu", "Green", "#2d5432", "bottle", 20.0, "75_pct",
         "https://mountainofink.com/blog/sailor-jentle-tokiwa-matsu", "Copper Sheen, Shading",
         "Deep pine needle green that dries with a subtle coppery-rust sheen."),
        ("Platinum", "Carbon Black", "Black", "#1f2428", "bottle", 60.0, "half",
         "https://mountainofink.com/blog/platinum-carbon-black", "Waterproof, Pigment, Archival",
         "100% waterproof nano-pigment black for addressing envelopes and ink+watercolor sketches. Keep in Slip & Seal or daily-use pens."),
        ("Jacques Herbin", "Émeraude de Chivor", "Teal", "#0f6669", "sample_vial", 4.0, "low",
         "https://mountainofink.com/blog/j-herbin-1670-emerald-of-chivor", "Gold Shimmer, Red Sheen",
         "Spectacular emerald teal with gold shimmer and red sheen. Agitate pen gently while writing; load in TWSBI Eco B or Lamy Stub."),
        ("KWZ", "Honey", "Brown", "#9e6916", "sample_vial", 4.0, "empty",
         "https://mountainofink.com/blog/kwz-honey", "Heavy Shading, Vanilla Scent",
         "Finished the entire 4ml sample vial! Incredible golden-amber to dark espresso shading — planning to order a full bottle."),
        ("Rohrer & Klingner", "Alt-Goldgrün", "Green", "#5d6f24", "bottle", 50.0, "full",
         "https://mountainofink.com/blog/rohrer-and-klingner-alt-goldgrun", "High Shading, Vintage Olive",
         "Muted antique olive-moss green with dramatic shading even in medium nibs."),
    ]

    inks: list[Ink] = []
    for brand, name, fam, hex_c, fmt, vol, lvl, moi_url, tags, notes in inks_spec:
        ink = Ink(
            brand=brand,
            name=name,
            color_family=fam,
            hex_color=hex_c,
            format=fmt,
            volume_ml=vol,
            remaining_level=lvl,
            quantity=1,
            mountain_of_ink_url=moi_url,
            properties_tags=tags,
            custom_notes=notes,
        )
        db.add(ink)
        inks.append(ink)
    db.flush()

    quotes = [
        "Smooth effortless ink flow on cream 52gsm Tomoe River paper.",
        "Quick brown fox jumps over the lazy dog — crisp shading on loops.",
        "Morning reflection notes: steady wet line with zero hard starts.",
        "Testing downstroke bounce & cross-hatch saturation at desk.",
        " crisp hairlines on cross-strokes; rich dark pooling at letter ends.",
        "Lovely lubricated feel — zero feathering or bleedthrough today.",
    ]

    # Historical closed sessions: (pen_idx, ink_idx, start_days_ago, duration_days, refills, quote_idx)
    historical_plan = [
        (0, 0, 310, 26, 2, 0),
        (2, 8, 295, 32, 1, 1),
        (4, 4, 275, 19, 0, 2),
        (5, 2, 255, 22, 1, 3),
        (7, 9, 238, 16, 0, 4),
        (8, 7, 220, 24, 1, 5),
        (0, 1, 198, 28, 2, 1),
        (3, 5, 182, 21, 0, 0),
        (1, 3, 165, 25, 1, 2),
        (4, 10, 148, 18, 1, 3),
        (7, 6, 132, 20, 0, 4),
        (6, 8, 118, 35, 2, 5),
        (0, 0, 96, 27, 2, 0),
        (5, 7, 84, 21, 0, 1),
        (8, 11, 70, 23, 1, 2),
        (3, 4, 56, 18, 0, 3),
        (9, 3, 44, 19, 1, 4),
    ]

    for pen_i, ink_i, ago, dur, n_refills, q_i in historical_plan:
        pen = pens[pen_i]
        ink = inks[ink_i]
        d_inked = today - timedelta(days=ago)
        d_cleaned = d_inked + timedelta(days=dur)

        sess = UsageSession(
            pen_id=pen.id,
            ink_id=ink.id,
            date_inked=d_inked,
            date_cleaned=d_cleaned,
            end_status="cleaned",
            refill_count=n_refills,
            session_notes=quotes[q_i],
        )
        db.add(sess)
        db.flush()

        db.add(LifecycleEvent(session_id=sess.id, event_type="inked", event_date=d_inked, source="seed", notes="Notebook ink-up entry"))
        for r_idx in range(n_refills):
            r_date = d_inked + timedelta(days=max(4, int((dur / (n_refills + 1)) * (r_idx + 1))))
            db.add(
                LifecycleEvent(
                    session_id=sess.id,
                    event_type="refilled",
                    event_date=r_date,
                    source="seed",
                    notes=f"Topped up converter/reservoir (#{r_idx + 1})",
                )
            )
        db.add(LifecycleEvent(session_id=sess.id, event_type="cleaned", event_date=d_cleaned, source="seed", notes="Flushed & dried"))

        sample_bytes = _render_single_sample_card(entry_date=d_inked, pen=pen, ink=ink, quote=quotes[q_i])
        s_key = storage.save_bytes("samples", f"seed_s{sess.id}.webp", sample_bytes)
        db.add(
            WritingSample(
                session_id=sess.id,
                pen_id=pen.id,
                ink_id=ink.id,
                image_storage_key=s_key,
                sample_date=d_inked,
                transcription=quotes[q_i],
                caption=f"{pen.brand} {pen.model} ({pen.nib_size}) × {ink.brand} {ink.name}",
            )
        )

    # Currently Inked sessions (5 active pens — including 1 aged 34 days to highlight flush reminder!)
    active_plan = [
        (6, 8, 34, 1, "Archival pocket & desk waterproof writer — due for routine flush soon.", 5),
        (0, 0, 19, 1, "Daily long-form journal carry; topped up once last week.", 0),
        (2, 1, 14, 0, "Work sprint notes & architecture diagrams.", 1),
        (5, 2, 9, 0, "Evening reading annotations; gorgeous gold sheen on headings.", 2),
        (4, 5, 4, 0, "Fresh 1.1mm stub fill for expressive headers & correspondence.", 3),
    ]

    for pen_i, ink_i, ago, n_refills, note, q_i in active_plan:
        pen = pens[pen_i]
        ink = inks[ink_i]
        d_inked = today - timedelta(days=ago)
        sess = UsageSession(
            pen_id=pen.id,
            ink_id=ink.id,
            date_inked=d_inked,
            date_cleaned=None,
            end_status="active",
            refill_count=n_refills,
            session_notes=note,
        )
        db.add(sess)
        db.flush()

        db.add(LifecycleEvent(session_id=sess.id, event_type="inked", event_date=d_inked, source="seed", notes="Notebook ink-up entry"))
        if n_refills > 0:
            r_date = d_inked + timedelta(days=max(2, ago // 2))
            db.add(LifecycleEvent(session_id=sess.id, event_type="refilled", event_date=r_date, source="seed", notes="Refilled reservoir"))

        sample_bytes = _render_single_sample_card(entry_date=d_inked, pen=pen, ink=ink, quote=quotes[q_i])
        s_key = storage.save_bytes("samples", f"seed_active_s{sess.id}.webp", sample_bytes)
        db.add(
            WritingSample(
                session_id=sess.id,
                pen_id=pen.id,
                ink_id=ink.id,
                image_storage_key=s_key,
                sample_date=d_inked,
                transcription=quotes[q_i],
                caption=f"{pen.brand} {pen.model} ({pen.nib_size}) × {ink.brand} {ink.name}",
            )
        )

    # ---------- Build Multi-Page Demo Notebook Scan PDF (2 pages, 4 entries) ----------
    # Includes 1 already-imported entry (demonstrating Duplicate Guard!) + 3 ready-to-import entries!
    pw, ph = 1240, 1754  # ~150 DPI A4 portrait
    page1 = _make_dot_grid_canvas(pw, ph)
    d1 = ImageDraw.Draw(page1)
    f_hdr = _load_handwriting_font(20, "sans")
    d1.text((76, 26), "INK LOGBOOK  ·  PAGE 14", fill=(148, 163, 184), font=f_hdr)

    # Page 1, Entry 1: Duplicate of active session (Lamy Safari Mango Yellow Stub 1.1 + Aurora Borealis)
    dup_date = today - timedelta(days=4)
    y_end_1 = _draw_notebook_entry_block(
        d1,
        x0=78,
        y0=95,
        width=pw - 150,
        entry_date=dup_date,
        pen_line="Lamy Safari - Mango Yellow - Stub 1.1",
        ink_line="Diamine Aurora Borealis",
        quote_line="Fresh 1.1mm stub fill — crisp line variation & deep teal shading.",
        ink_hex=inks[5].hex_color,
        nib_size="Stub 1.1",
    )

    # Page 1, Entry 2: New unimported ink-up! (TWSBI Eco Clear Demonstrator B + Sailor Manyo Haha)
    new_d1 = today - timedelta(days=2)
    y_end_2 = _draw_notebook_entry_block(
        d1,
        x0=78,
        y0=680,
        width=pw - 150,
        entry_date=new_d1,
        pen_line="TWSBI Eco - Clear Demonstrator - Broad",
        ink_line="Sailor Manyo Haha",
        quote_line="Dreamy dual-shading blue with soft pink-green halo on broad wet strokes!",
        ink_hex=inks[6].hex_color,
        nib_size="B",
    )

    page2 = _make_dot_grid_canvas(pw, ph)
    d2 = ImageDraw.Draw(page2)
    d2.text((76, 26), "INK LOGBOOK  ·  PAGE 15", fill=(148, 163, 184), font=f_hdr)

    # Page 2, Entry 1: New unimported ink-up! (Pelikan Souverän M800 Green Black Stripe M + R&K Alt-Goldgrün)
    new_d2 = today - timedelta(days=1)
    y_end_3 = _draw_notebook_entry_block(
        d2,
        x0=78,
        y0=95,
        width=pw - 150,
        entry_date=new_d2,
        pen_line="Pelikan Souveran M800 - Green Black Stripe - Medium",
        ink_line="Rohrer & Klingner Alt-Goldgrun",
        quote_line="Warm vintage olive green; generous wet Pelikan M nib glides effortlessly.",
        ink_hex=inks[11].hex_color,
        nib_size="M",
    )

    # Page 2, Entry 2: New unimported ink-up! (Pilot Custom 823 Smoke Black F + Diamine Writer's Blood)
    new_d3 = today
    y_end_4 = _draw_notebook_entry_block(
        d2,
        x0=78,
        y0=680,
        width=pw - 150,
        entry_date=new_d3,
        pen_line="Pilot Custom 823 - Smoke Black - Fine",
        ink_line="Diamine Writer's Blood",
        quote_line="Ultra-smooth burgundy ink flow makes this Fine nib write without zero pressure.",
        ink_hex=inks[3].hex_color,
        nib_size="F",
    )

    pdf_buf = io.BytesIO()
    page1.save(pdf_buf, format="PDF", resolution=150.0, save_all=True, append_images=[page2])
    pdf_bytes = pdf_buf.getvalue()

    # Save a convenient copy at data/demo_notebook_scan.pdf for manual drag-and-drop testing too!
    (DATA_DIR / "demo_notebook_scan.pdf").write_bytes(pdf_bytes)

    pdf_key = storage.save_bytes("pdfs", "Oct_Notebook_Scan_Update.pdf", pdf_bytes)
    rendered = render_document_pages(pdf_bytes, "Oct_Notebook_Scan_Update.pdf")

    demo_batch = ScanBatch(
        original_filename="Oct_Notebook_Scan_Update.pdf",
        pdf_storage_key=pdf_key,
        page_count=len(rendered),
        status="reviewed",
        is_demo=True,
    )
    db.add(demo_batch)
    db.flush()

    p1_bytes, p1_w, p1_h, _ = rendered[0]
    p1_key = storage.save_bytes("pages", f"demo_b{demo_batch.id}_p1.webp", p1_bytes)
    sp1 = ScanPage(
        batch_id=demo_batch.id,
        page_number=1,
        image_storage_key=p1_key,
        width_px=p1_w,
        height_px=p1_h,
        processed=False,
    )
    db.add(sp1)

    p2_bytes, p2_w, p2_h, _ = rendered[1]
    p2_key = storage.save_bytes("pages", f"demo_b{demo_batch.id}_p2.webp", p2_bytes)
    sp2 = ScanPage(
        batch_id=demo_batch.id,
        page_number=2,
        image_storage_key=p2_key,
        width_px=p2_w,
        height_px=p2_h,
        processed=False,
    )
    db.add(sp2)
    db.flush()

    p1_cands = [
        ExtractedEntryCandidate(
            entry_uid=uuid.uuid4().hex[:10],
            page_id=sp1.id,
            page_number=1,
            date_inked=dup_date,
            raw_pen_text="Lamy Safari - Mango Yellow - Stub 1.1",
            pen_brand="Lamy",
            pen_model="Safari",
            pen_color="Mango Yellow",
            nib_size="Stub 1.1",
            matched_pen_id=pens[4].id,
            pen_match_confidence=0.98,
            raw_ink_text="Diamine Aurora Borealis",
            ink_brand="Diamine",
            ink_name="Aurora Borealis",
            suggested_hex=inks[5].hex_color,
            suggested_color_family="Teal",
            matched_ink_id=inks[5].id,
            ink_match_confidence=0.99,
            transcription="Fresh 1.1mm stub fill — crisp line variation & deep teal shading.",
            crop_box=CropBox(x=0.05, y=round(82 / ph, 3), w=0.90, h=round((y_end_1 - 70) / ph, 3)),
            is_duplicate=True,
            skip=True,
        ),
        ExtractedEntryCandidate(
            entry_uid=uuid.uuid4().hex[:10],
            page_id=sp1.id,
            page_number=1,
            date_inked=new_d1,
            raw_pen_text="TWSBI Eco - Clear Demonstrator - Broad",
            pen_brand="TWSBI",
            pen_model="Eco",
            pen_color="Clear Demonstrator",
            nib_size="B",
            matched_pen_id=pens[7].id,
            pen_match_confidence=0.96,
            raw_ink_text="Sailor Manyo Haha",
            ink_brand="Sailor Manyo",
            ink_name="Haha",
            suggested_hex=inks[6].hex_color,
            suggested_color_family="Blue",
            matched_ink_id=inks[6].id,
            ink_match_confidence=0.99,
            transcription="Dreamy dual-shading blue with soft pink-green halo on broad wet strokes!",
            crop_box=CropBox(x=0.05, y=round(665 / ph, 3), w=0.90, h=round((y_end_2 - 650) / ph, 3)),
            is_duplicate=False,
            skip=False,
        ),
    ]

    p2_cands = [
        ExtractedEntryCandidate(
            entry_uid=uuid.uuid4().hex[:10],
            page_id=sp2.id,
            page_number=2,
            date_inked=new_d2,
            raw_pen_text="Pelikan Souveran M800 - Green Black Stripe - Medium",
            pen_brand="Pelikan",
            pen_model="Souverän M800",
            pen_color="Green Black Stripe",
            nib_size="M",
            matched_pen_id=pens[8].id,
            pen_match_confidence=0.95,
            raw_ink_text="Rohrer & Klingner Alt-Goldgrun",
            ink_brand="Rohrer & Klingner",
            ink_name="Alt-Goldgrün",
            suggested_hex=inks[11].hex_color,
            suggested_color_family="Green",
            matched_ink_id=inks[11].id,
            ink_match_confidence=0.96,
            transcription="Warm vintage olive green; generous wet Pelikan M nib glides effortlessly.",
            crop_box=CropBox(x=0.05, y=round(82 / ph, 3), w=0.90, h=round((y_end_3 - 70) / ph, 3)),
            is_duplicate=False,
            skip=False,
        ),
        ExtractedEntryCandidate(
            entry_uid=uuid.uuid4().hex[:10],
            page_id=sp2.id,
            page_number=2,
            date_inked=new_d3,
            raw_pen_text="Pilot Custom 823 - Smoke Black - Fine",
            pen_brand="Pilot",
            pen_model="Custom 823",
            pen_color="Smoke Black",
            nib_size="F",
            matched_pen_id=pens[1].id,
            pen_match_confidence=0.99,
            raw_ink_text="Diamine Writer's Blood",
            ink_brand="Diamine",
            ink_name="Writer's Blood",
            suggested_hex=inks[3].hex_color,
            suggested_color_family="Red",
            matched_ink_id=inks[3].id,
            ink_match_confidence=0.99,
            transcription="Ultra-smooth burgundy ink flow makes this Fine nib write without zero pressure.",
            crop_box=CropBox(x=0.05, y=round(665 / ph, 3), w=0.90, h=round((y_end_4 - 650) / ph, 3)),
            is_duplicate=False,
            skip=False,
        ),
    ]

    sp1.extracted_json = json.dumps([c.model_dump(mode="json") for c in p1_cands])
    sp2.extracted_json = json.dumps([c.model_dump(mode="json") for c in p2_cands])
    db.commit()

    return {
        "pens": len(pens),
        "inks": len(inks),
        "sessions": len(historical_plan) + len(active_plan),
        "demo_pdf": str(DATA_DIR / "demo_notebook_scan.pdf"),
    }
