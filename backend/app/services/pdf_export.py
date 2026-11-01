"""Vector PDF exporter for the Home Page (Collection & Rotation Analytics Dashboard)."""

from __future__ import annotations

import io
from datetime import date
from pathlib import Path
from typing import Any

from PIL import Image
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from sqlalchemy.orm import Session, joinedload

from ..models import WritingSample
from ..storage import storage
from .analytics import build_dashboard_analytics

# Palette matching Modern Minimalist Analytics (Tailwind Zinc + Indigo/Sky/Emerald)
ZINC_950 = HexColor("#09090b")
ZINC_900 = HexColor("#18181b")
ZINC_800 = HexColor("#27272a")
ZINC_700 = HexColor("#3f3f46")
ZINC_600 = HexColor("#52525b")
ZINC_500 = HexColor("#71717a")
ZINC_400 = HexColor("#a1a1aa")
ZINC_200 = HexColor("#e4e4e7")
ZINC_100 = HexColor("#f4f4f5")
ZINC_50 = HexColor("#fafafa")
PAGE_BG = HexColor("#f8fafc")
WHITE = HexColor("#ffffff")
IVORY = HexColor("#fcfaf4")

INDIGO_600 = HexColor("#4f46e5")
INDIGO_700 = HexColor("#4338ca")
INDIGO_50 = HexColor("#eef2ff")
SKY_500 = HexColor("#0ea5e9")
SKY_700 = HexColor("#0369a1")
SKY_50 = HexColor("#f0f9ff")
EMERALD_500 = HexColor("#10b981")
EMERALD_700 = HexColor("#047857")
EMERALD_50 = HexColor("#ecfdf5")
AMBER_700 = HexColor("#b45309")
AMBER_100 = HexColor("#fef3c7")
SLATE_400 = HexColor("#94a3b8")

_FONTS_REGISTERED = False
FONT_REG = "Helvetica"
FONT_SEMI = "Helvetica-Bold"
FONT_BOLD = "Helvetica-Bold"
FONT_MONO = "Courier"
FONT_MONO_BOLD = "Courier-Bold"


def _ensure_fonts() -> None:
    """Register crisp Windows/system TrueType fonts with full Unicode support when available."""
    global _FONTS_REGISTERED, FONT_REG, FONT_SEMI, FONT_BOLD, FONT_MONO, FONT_MONO_BOLD
    if _FONTS_REGISTERED:
        return
    win_fonts = Path("C:/Windows/Fonts")
    candidates = [
        ("UI-Reg", win_fonts / "segoeui.ttf"),
        ("UI-Semi", win_fonts / "seguisb.ttf"),
        ("UI-Bold", win_fonts / "segoeuib.ttf"),
        ("Mono-Reg", win_fonts / "consola.ttf"),
        ("Mono-Bold", win_fonts / "consolab.ttf"),
    ]
    if all(p.exists() for _, p in candidates):
        for name, path in candidates:
            pdfmetrics.registerFont(TTFont(name, str(path)))
        FONT_REG = "UI-Reg"
        FONT_SEMI = "UI-Semi"
        FONT_BOLD = "UI-Bold"
        FONT_MONO = "Mono-Reg"
        FONT_MONO_BOLD = "Mono-Bold"
    _FONTS_REGISTERED = True


def _safe_hex(hex_str: str | None, fallback: str = "#3b82f6") -> Color:
    raw = (hex_str or fallback).strip()
    if not raw.startswith("#"):
        raw = f"#{raw}"
    try:
        return HexColor(raw)
    except Exception:
        return HexColor(fallback)


def _fit_text(text: str, font_name: str, font_size: float, max_width: float) -> str:
    """Truncate text cleanly with an ellipsis so it never overflows max_width."""
    if pdfmetrics.stringWidth(text, font_name, font_size) <= max_width:
        return text
    ell = "…" if FONT_REG != "Helvetica" else "..."
    ell_w = pdfmetrics.stringWidth(ell, font_name, font_size)
    trimmed = text
    while trimmed and pdfmetrics.stringWidth(trimmed, font_name, font_size) + ell_w > max_width:
        trimmed = trimmed[:-1]
    return f"{trimmed.rstrip()}{ell}"


def _draw_card(c: Canvas, x: float, y: float, w: float, h: float, radius: float = 8.0) -> None:
    c.saveState()
    c.setFillColor(WHITE)
    c.setStrokeColor(ZINC_200)
    c.setLineWidth(0.75)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)
    c.restoreState()


def _draw_pill(
    c: Canvas,
    x: float,
    y: float,
    text: str,
    *,
    bg: Color,
    fg: Color,
    font_name: str | None = None,
    font_size: float = 7.2,
    pad_x: float = 5.5,
    h: float = 13.0,
    radius: float = 4.5,
) -> float:
    fname = font_name or FONT_SEMI
    tw = pdfmetrics.stringWidth(text, fname, font_size)
    pw = tw + pad_x * 2
    c.saveState()
    c.setFillColor(bg)
    c.roundRect(x, y, pw, h, radius, stroke=0, fill=1)
    c.setFillColor(fg)
    c.setFont(fname, font_size)
    c.drawString(x + pad_x, y + (h - font_size) / 2 + 1.1, text)
    c.restoreState()
    return pw


def _resolve_media_url_to_path(media_url: str | None) -> Path | None:
    if not media_url:
        return None
    prefix = "/media/"
    key = media_url[len(prefix) :] if media_url.startswith(prefix) else media_url.lstrip("/")
    try:
        path = storage.resolve_path(key)
        return path if path.exists() else None
    except Exception:
        return None


def _draw_sample_cutout(
    c: Canvas,
    img_path: Path | None,
    x: float,
    y: float,
    w: float,
    h: float,
    radius: float = 4.0,
) -> None:
    """Draw a handwriting sample image inside a warm ivory rounded frame."""
    c.saveState()
    c.setFillColor(IVORY)
    c.setStrokeColor(ZINC_200)
    c.setLineWidth(0.55)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)

    if img_path and img_path.exists():
        try:
            with Image.open(img_path) as im:
                rgb = im.convert("RGB")
                iw, ih = rgb.size
                pad = 2.5
                avail_w = max(8.0, w - pad * 2)
                avail_h = max(8.0, h - pad * 2)
                scale = min(avail_w / iw, avail_h / ih)
                dw = iw * scale
                dh = ih * scale
                dx = x + (w - dw) / 2
                dy = y + (h - dh) / 2

                buf = io.BytesIO()
                rgb.save(buf, format="JPEG", quality=92)
                buf.seek(0)
                c.drawImage(ImageReader(buf), dx, dy, width=dw, height=dh, mask="auto")
        except Exception:
            c.setFillColor(ZINC_400)
            c.setFont(FONT_REG, 6.5)
            c.drawCentredString(x + w / 2, y + h / 2 - 2, "Sample unavailable")
    else:
        c.setFillColor(ZINC_400)
        c.setFont(FONT_REG, 6.5)
        c.drawCentredString(x + w / 2, y + h / 2 - 2, "No sample")
    c.restoreState()


def _draw_swatch_dot(c: Canvas, cx: float, cy: float, r: float, hex_color: str) -> None:
    c.saveState()
    c.setFillColor(_safe_hex(hex_color))
    c.setStrokeColor(Color(0, 0, 0, alpha=0.18))
    c.setLineWidth(0.5)
    c.circle(cx, cy, r, stroke=1, fill=1)
    c.restoreState()


def _draw_footer(c: Canvas, page_num: int, total_pages: int, page_w: float, margin: float) -> None:
    c.saveState()
    c.setStrokeColor(ZINC_200)
    c.setLineWidth(0.5)
    c.line(margin, 26, page_w - margin, 26)
    c.setFillColor(ZINC_400)
    c.setFont(FONT_REG, 7.2)
    c.drawString(margin, 15, "Nib & Ink · Fountain Pen & Ink Usage Tracker — Dashboard Snapshot")
    c.setFont(FONT_MONO, 7.2)
    c.drawRightString(page_w - margin, 15, f"Page {page_num} of {total_pages}")
    c.restoreState()


def generate_dashboard_pdf(db: Session) -> bytes:
    """Render a crisp 2-page vector A4 PDF snapshot of the Home Page dashboard."""
    _ensure_fonts()
    data = build_dashboard_analytics(db)
    kpis: dict[str, Any] = data["kpis"]
    today_str = date.today().strftime("%d %b %Y")

    # Fetch 4 varied recent writing samples for Page 2's showcase gallery
    showcase_samples = (
        db.query(WritingSample)
        .options(joinedload(WritingSample.pen), joinedload(WritingSample.ink))
        .order_by(WritingSample.sample_date.desc(), WritingSample.id.desc())
        .limit(24)
        .all()
    )
    picked_showcase: list[WritingSample] = []
    seen_combos: set[tuple[int, int]] = set()
    # Skip the 5 active ones shown on Page 1 if we have plenty of historical ones so Page 2 shows extra variety
    active_pen_ids = {r["pen_id"] for r in data["currently_inked"]}
    for ws in showcase_samples:
        if ws.pen_id in active_pen_ids and len(showcase_samples) > 8:
            continue
        combo = (ws.pen_id, ws.ink_id)
        if combo in seen_combos:
            continue
        if storage.resolve_path(ws.image_storage_key).exists():
            picked_showcase.append(ws)
            seen_combos.add(combo)
        if len(picked_showcase) == 4:
            break
    if len(picked_showcase) < 4:
        for ws in showcase_samples:
            if ws not in picked_showcase and storage.resolve_path(ws.image_storage_key).exists():
                picked_showcase.append(ws)
            if len(picked_showcase) == 4:
                break

    buf = io.BytesIO()
    page_w, page_h = A4  # 595.28 x 841.89 pt
    margin = 26.0
    content_w = page_w - 2 * margin  # 543.28 pt

    c = Canvas(buf, pagesize=A4)
    c.setTitle("Nib & Ink — Fountain Pen & Ink Usage Dashboard")
    c.setAuthor("Nib & Ink Usage Analytics")
    c.setSubject("Collection & Rotation Analytics Overview")

    # =========================================================================
    # PAGE 1: Header, 5 KPI Cards, Currently Inked Table (with Samples), Row 1 Charts
    # =========================================================================
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, page_w, page_h, stroke=0, fill=1)

    y_cursor = page_h - margin

    # 1. Header Banner Card
    header_h = 46.0
    header_y = y_cursor - header_h
    _draw_card(c, margin, header_y, content_w, header_h, radius=9.0)

    # Dark logo square with stylized nib diamond
    logo_sz = 26.0
    logo_x = margin + 12.0
    logo_y = header_y + (header_h - logo_sz) / 2
    c.setFillColor(ZINC_900)
    c.roundRect(logo_x, logo_y, logo_sz, logo_sz, 6.0, stroke=0, fill=1)
    # Nib vector mark inside logo square
    c.saveState()
    c.setStrokeColor(WHITE)
    c.setFillColor(WHITE)
    c.setLineWidth(1.2)
    cx_l, cy_l = logo_x + logo_sz / 2, logo_y + logo_sz / 2
    p_nib = c.beginPath()
    p_nib.moveTo(cx_l, cy_l + 7)
    p_nib.lineTo(cx_l + 5, cy_l - 1)
    p_nib.lineTo(cx_l + 2.5, cy_l - 6.5)
    p_nib.lineTo(cx_l - 2.5, cy_l - 6.5)
    p_nib.lineTo(cx_l - 5, cy_l - 1)
    p_nib.close()
    c.drawPath(p_nib, stroke=1, fill=0)
    c.line(cx_l, cy_l + 7, cx_l, cy_l + 0.5)
    c.circle(cx_l, cy_l - 0.5, 1.1, stroke=0, fill=1)
    c.restoreState()

    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 13.0)
    c.drawString(logo_x + logo_sz + 10, header_y + 25.5, "Collection & Rotation Analytics")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 8.0)
    c.drawString(
        logo_x + logo_sz + 10,
        header_y + 12.5,
        "Nib & Ink Usage Dashboard  ·  Currently inked rotation, fill cadence, ink stash & handwriting samples",
    )

    # Right snapshot pill
    snap_label = f"Snapshot · {today_str}"
    _draw_pill(
        c,
        page_w - margin - pdfmetrics.stringWidth(snap_label, FONT_MONO_BOLD, 7.4) - 24,
        header_y + 16.5,
        snap_label,
        bg=INDIGO_50,
        fg=INDIGO_700,
        font_name=FONT_MONO_BOLD,
        font_size=7.4,
        pad_x=7.0,
        h=15.0,
    )

    y_cursor = header_y - 10.0

    # 2. Top 5 KPI Strip
    kpi_gap = 6.5
    kpi_w = (content_w - 4 * kpi_gap) / 5.0
    kpi_h = 64.0
    kpi_y = y_cursor - kpi_h

    flush_alert = kpis["due_for_flush_count"] > 0
    kpi_specs = [
        {
            "title": "Currently Inked",
            "accent": INDIGO_600,
            "big": f"{kpis['currently_inked_count']}",
            "big_suffix": f"/{kpis['active_collection_pens']}",
            "pill": (f"{kpis['rotation_pct']}% active", INDIGO_50, INDIGO_700),
            "sub": f"{kpis['total_pens']} total pens in cabinet",
        },
        {
            "title": "Ink-Ups & Refills",
            "accent": EMERALD_500,
            "big": f"{kpis['total_sessions'] + kpis['total_refills']}",
            "big_suffix": f" ({kpis['total_sessions']} fills)",
            "pill": None,
            "sub": f"{kpis['ytd_sessions']} YTD · {kpis['total_writing_samples']} samples",
        },
        {
            "title": "Ink Inventory",
            "accent": SKY_500,
            "big": f"{kpis['total_inks']}",
            "big_suffix": "",
            "pill": (f"{kpis['bottles_count']}b · {kpis['samples_vial_count']}s", SKY_50, SKY_700),
            "sub": f"{kpis['low_or_empty_inks']} low or finished containers",
        },
        {
            "title": "Avg Fill Cycle",
            "accent": HexColor("#8b5cf6"),
            "big": f"{kpis['avg_fill_days']}",
            "big_suffix": " days/fill",
            "pill": None,
            "sub": f"{kpis['total_cleanings']} completed cleanings",
        },
        {
            "title": "Maintenance Check",
            "accent": AMBER_700 if flush_alert else EMERALD_500,
            "big": f"{kpis['due_for_flush_count']}",
            "big_suffix": "",
            "pill": (
                "28d+ inked" if flush_alert else "All fresh",
                AMBER_100 if flush_alert else EMERALD_50,
                AMBER_700 if flush_alert else EMERALD_700,
            ),
            "sub": "Flush nudge threshold: 28d",
        },
    ]

    for idx, spec in enumerate(kpi_specs):
        kx = margin + idx * (kpi_w + kpi_gap)
        _draw_card(c, kx, kpi_y, kpi_w, kpi_h, radius=8.0)
        # Top accent dot + title
        c.setFillColor(ZINC_500)
        c.setFont(FONT_SEMI, 7.6)
        c.drawString(kx + 9, kpi_y + kpi_h - 15, spec["title"])
        c.setFillColor(spec["accent"])
        c.circle(kx + kpi_w - 11, kpi_y + kpi_h - 12, 2.8, stroke=0, fill=1)

        # Big KPI number
        c.setFillColor(ZINC_900)
        c.setFont(FONT_MONO_BOLD, 15.0)
        big_str = spec["big"]
        c.drawString(kx + 9, kpi_y + 24, big_str)
        bw = pdfmetrics.stringWidth(big_str, FONT_MONO_BOLD, 15.0)

        if spec["big_suffix"]:
            c.setFillColor(ZINC_400)
            c.setFont(FONT_REG, 7.5)
            c.drawString(kx + 9 + bw + 1.5, kpi_y + 25, spec["big_suffix"])

        if spec["pill"]:
            ptext, pbg, pfg = spec["pill"]
            _draw_pill(
                c,
                kx + 9 + bw + (24 if spec["big_suffix"] else 5),
                kpi_y + 23.5,
                ptext,
                bg=pbg,
                fg=pfg,
                font_name=FONT_MONO_BOLD,
                font_size=6.5,
                pad_x=4.5,
                h=12.0,
            )

        c.setFillColor(ZINC_400)
        c.setFont(FONT_REG, 6.8)
        c.drawString(kx + 9, kpi_y + 8.5, _fit_text(spec["sub"], FONT_REG, 6.8, kpi_w - 16))

    y_cursor = kpi_y - 11.0

    # 3. Currently Inked Rotation Command Table (with inline handwriting sample cutouts!)
    active_rows = sorted(data["currently_inked"], key=lambda r: r["days_inked"], reverse=True)
    shown_active = active_rows[:7]
    row_h = 45.0
    tbl_header_h = 30.0
    col_header_h = 18.0
    tbl_body_h = max(36.0, len(shown_active) * row_h + 4.0)
    tbl_card_h = tbl_header_h + col_header_h + tbl_body_h
    tbl_y = y_cursor - tbl_card_h

    _draw_card(c, margin, tbl_y, content_w, tbl_card_h, radius=8.5)

    # Card title bar
    title_bar_y = tbl_y + tbl_card_h - tbl_header_h
    c.setStrokeColor(ZINC_200)
    c.setLineWidth(0.6)
    c.line(margin, title_bar_y, margin + content_w, title_bar_y)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.5)
    c.drawString(margin + 12, title_bar_y + 10, "Currently Inked Rotation")
    _draw_pill(
        c,
        margin + 138,
        title_bar_y + 8.5,
        f"{len(active_rows)} active",
        bg=ZINC_100,
        fg=ZINC_700,
        font_name=FONT_MONO_BOLD,
        font_size=7.0,
        pad_x=6.0,
        h=13.0,
    )
    c.setFillColor(ZINC_400)
    c.setFont(FONT_REG, 7.2)
    c.drawRightString(
        margin + content_w - 12,
        title_bar_y + 10.5,
        "Sorted by Days Inked · Includes scanned handwriting cutouts",
    )

    # Column header strip
    col_y = title_bar_y - col_header_h
    c.setFillColor(ZINC_50)
    c.rect(margin + 0.5, col_y, content_w - 1.0, col_header_h, stroke=0, fill=1)
    c.setStrokeColor(ZINC_200)
    c.line(margin, col_y, margin + content_w, col_y)

    # Column X offsets (total = 543.28pt)
    cx_pen = margin + 12
    cx_nib = margin + 168
    cx_ink = margin + 204
    cx_date = margin + 334
    cx_age = margin + 388
    cx_sample = margin + 424

    c.setFillColor(ZINC_500)
    c.setFont(FONT_SEMI, 6.6)
    c.drawString(cx_pen, col_y + 5.5, "FOUNTAIN PEN")
    c.drawString(cx_nib, col_y + 5.5, "NIB")
    c.drawString(cx_ink, col_y + 5.5, "LOADED INK")
    c.drawString(cx_date, col_y + 5.5, "INKED")
    c.drawString(cx_age, col_y + 5.5, "AGE")
    c.drawString(cx_sample, col_y + 5.5, "HANDWRITING SAMPLE")

    if not shown_active:
        c.setFillColor(ZINC_400)
        c.setFont(FONT_REG, 8.5)
        c.drawCentredString(margin + content_w / 2, tbl_y + 14, "No pens currently inked.")
    else:
        for i, row in enumerate(shown_active):
            ry = col_y - (i + 1) * row_h
            if i < len(shown_active) - 1:
                c.setStrokeColor(ZINC_100)
                c.setLineWidth(0.5)
                c.line(margin + 8, ry, margin + content_w - 8, ry)

            # Pen name + color + mechanism
            pen_main = f"{row['pen_brand']} {row['pen_model']}"
            if row.get("pen_color"):
                pen_main += f" ({row['pen_color']})"
            c.setFillColor(ZINC_900)
            c.setFont(FONT_SEMI, 8.0)
            c.drawString(cx_pen, ry + 25, _fit_text(pen_main, FONT_SEMI, 8.0, 150))
            c.setFillColor(ZINC_400)
            c.setFont(FONT_REG, 6.8)
            mech_txt = row.get("filling_mechanism") or "Converter / Piston"
            if row.get("refill_count", 0) > 0:
                mech_txt += f" · {row['refill_count']}x refilled"
            c.drawString(cx_pen, ry + 13, _fit_text(mech_txt, FONT_REG, 6.8, 150))

            # Nib pill
            _draw_pill(
                c,
                cx_nib,
                ry + 16.5,
                str(row["nib_size"]),
                bg=ZINC_100,
                fg=ZINC_800,
                font_name=FONT_MONO_BOLD,
                font_size=7.2,
                pad_x=5.0,
                h=13.0,
            )

            # Loaded ink swatch + name
            _draw_swatch_dot(c, cx_ink + 4.5, ry + 23.5, 4.2, row["ink_hex"])
            c.setFillColor(ZINC_800)
            c.setFont(FONT_SEMI, 7.8)
            ink_full = f"{row['ink_brand']} {row['ink_name']}"
            c.drawString(cx_ink + 13, ry + 21, _fit_text(ink_full, FONT_SEMI, 7.8, 112))
            c.setFillColor(ZINC_400)
            c.setFont(FONT_REG, 6.6)
            c.drawString(cx_ink + 13, ry + 11, row.get("ink_color_family", ""))

            # Date inked
            c.setFillColor(ZINC_600)
            c.setFont(FONT_MONO, 7.3)
            c.drawString(cx_date, ry + 19.5, row["date_inked"])

            # Days inked pill
            aging = row.get("aging", "fresh")
            age_bg = AMBER_100 if aging == "attention" else (SKY_50 if aging == "moderate" else EMERALD_50)
            age_fg = AMBER_700 if aging == "attention" else (SKY_700 if aging == "moderate" else EMERALD_700)
            _draw_pill(
                c,
                cx_age,
                ry + 16.5,
                f"{row['days_inked']}d",
                bg=age_bg,
                fg=age_fg,
                font_name=FONT_MONO_BOLD,
                font_size=7.0,
                pad_x=4.8,
                h=13.0,
            )

            # Handwriting sample cutout (generous wide frame!)
            sample_path = _resolve_media_url_to_path(row.get("sample_url"))
            _draw_sample_cutout(c, sample_path, cx_sample, ry + 4.5, 108.0, row_h - 9.0, radius=4.0)

    y_cursor = tbl_y - 11.0

    # 4. Row 1 Charts: 12-Month Activity Cadence (left) + Ink Color Families: Stash vs Usage (right)
    charts_h = max(210.0, y_cursor - 36.0)
    charts_h = min(charts_h, 290.0)
    charts_y = y_cursor - charts_h
    chart_gap = 9.0
    left_w = round(content_w * 0.56, 2)
    right_w = content_w - left_w - chart_gap

    # Left Card: 12-Month Activity Cadence
    _draw_card(c, margin, charts_y, left_w, charts_h, radius=8.5)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.2)
    c.drawString(margin + 12, charts_y + charts_h - 17, "12-Month Activity Cadence")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 7.0)
    c.drawString(margin + 12, charts_y + charts_h - 27.5, "Monthly ink-ups, reservoir refills, and cleanings")

    # Legend (top right of left card)
    leg_items = [("Ink-Ups", INDIGO_600), ("Refills", SKY_500), ("Cleaned", EMERALD_500)]
    lx = margin + left_w - 132
    ly = charts_y + charts_h - 16.5
    for lname, lcol in leg_items:
        c.setFillColor(lcol)
        c.roundRect(lx, ly - 0.5, 6.0, 6.0, 1.5, stroke=0, fill=1)
        c.setFillColor(ZINC_600)
        c.setFont(FONT_REG, 6.6)
        c.drawString(lx + 8, ly, lname)
        lx += pdfmetrics.stringWidth(lname, FONT_REG, 6.6) + 15

    # Plot area for 12-month bar chart
    monthly = data["monthly_activity"]
    plot_x = margin + 28.0
    plot_y = charts_y + 26.0
    plot_w = left_w - 40.0
    plot_h = charts_h - 66.0

    max_m = max(
        [4] + [max(m["inked"], m["refilled"], m["cleaned"]) for m in monthly]
    )
    # Round max_m up to clean tick step
    y_step = 1 if max_m <= 5 else (2 if max_m <= 12 else max(5, (max_m + 3) // 4))
    y_top = ((max_m + y_step - 1) // y_step) * y_step

    c.saveState()
    for tick_v in range(0, y_top + 1, y_step):
        ty = plot_y + (tick_v / y_top) * plot_h
        c.setStrokeColor(ZINC_200)
        c.setLineWidth(0.5)
        if tick_v > 0:
            c.setDash(2, 2)
        else:
            c.setDash()
        c.line(plot_x, ty, plot_x + plot_w, ty)
        c.setDash()
        c.setFillColor(ZINC_400)
        c.setFont(FONT_MONO, 6.6)
        c.drawRightString(plot_x - 5, ty - 2.2, str(tick_v))

    slot_w = plot_w / max(1, len(monthly))
    bar_w = min(5.4, (slot_w - 6.0) / 3.0)
    for idx, m in enumerate(monthly):
        gx = plot_x + idx * slot_w + (slot_w - (bar_w * 3 + 2.0)) / 2
        series = [
            (m["inked"], INDIGO_600),
            (m["refilled"], SKY_500),
            (m["cleaned"], EMERALD_500),
        ]
        for s_idx, (val, scol) in enumerate(series):
            if val <= 0:
                continue
            bh = max(2.0, (val / y_top) * plot_h)
            bx = gx + s_idx * (bar_w + 1.0)
            c.setFillColor(scol)
            c.roundRect(bx, plot_y, bar_w, bh, 1.5, stroke=0, fill=1)

        # Month label
        c.setFillColor(ZINC_500)
        c.setFont(FONT_REG, 6.2)
        c.drawCentredString(plot_x + (idx + 0.5) * slot_w, plot_y - 11.0, m["label"])
    c.restoreState()

    # Right Card: Ink Color Families: Stash vs. Usage
    rx_card = margin + left_w + chart_gap
    _draw_card(c, rx_card, charts_y, right_w, charts_h, radius=8.5)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.2)
    c.drawString(rx_card + 12, charts_y + charts_h - 17, "Ink Color Families: Stash vs. Usage")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 7.0)
    c.drawString(rx_card + 12, charts_y + charts_h - 27.5, "Total fills written (color) vs. inks owned (slate)")

    colors_list = data["color_distribution"][:10]
    max_color_val = max(
        [1] + [max(item["usage_fills"], item["inventory_count"]) for item in colors_list]
    )
    c_area_top = charts_y + charts_h - 38.0
    c_area_bottom = charts_y + 12.0
    c_row_h = (c_area_top - c_area_bottom) / max(1, len(colors_list))
    bar_x0 = rx_card + 52.0
    bar_max_w = right_w - 104.0

    for idx, fam in enumerate(colors_list):
        cy_top = c_area_top - idx * c_row_h
        cy_mid = cy_top - c_row_h / 2

        c.setFillColor(ZINC_700)
        c.setFont(FONT_SEMI, 6.9)
        c.drawRightString(bar_x0 - 6, cy_mid - 2.3, fam["color_family"])

        # Top sub-bar: Total Fills (family hex)
        fills_v = fam["usage_fills"]
        owned_v = fam["inventory_count"]
        fw = max(2.0, (fills_v / max_color_val) * bar_max_w) if fills_v > 0 else 0.0
        ow = max(2.0, (owned_v / max_color_val) * bar_max_w) if owned_v > 0 else 0.0

        sub_h = min(5.2, c_row_h * 0.34)
        if fw > 0:
            c.setFillColor(_safe_hex(fam["hex"]))
            c.roundRect(bar_x0, cy_mid + 0.6, fw, sub_h, 1.8, stroke=0, fill=1)
        if ow > 0:
            c.setFillColor(SLATE_400)
            c.roundRect(bar_x0, cy_mid - sub_h - 0.8, ow, sub_h, 1.8, stroke=0, fill=1)

        # Compact numbers at right
        c.setFillColor(ZINC_600)
        c.setFont(FONT_MONO, 6.3)
        c.drawRightString(rx_card + right_w - 10, cy_mid - 2.2, f"{fills_v}f/{owned_v}i")

    _draw_footer(c, 1, 2, page_w, margin)
    c.showPage()

    # =========================================================================
    # PAGE 2: Most Frequently Used Pens & Inks, Nib Share, Bench, Events, Samples
    # =========================================================================
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, page_w, page_h, stroke=0, fill=1)

    p2_y = page_h - margin

    # Compact Page 2 Top Strip
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 10.5)
    c.drawString(margin, p2_y - 10, "Collection & Rotation Analytics — Rankings, Rotation & Handwriting Samples")
    c.setFillColor(ZINC_400)
    c.setFont(FONT_MONO, 7.5)
    c.drawRightString(
        page_w - margin,
        p2_y - 10,
        f"{kpis['total_pens']} Pens · {kpis['total_inks']} Inks · {kpis['total_sessions']} Fills",
    )
    p2_y -= 20.0

    # 1. Most Frequently Used Pens & Inks Card
    freq_h = 248.0
    freq_y = p2_y - freq_h
    _draw_card(c, margin, freq_y, content_w, freq_h, radius=8.5)

    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.5)
    c.drawString(margin + 12, freq_y + freq_h - 17, "Most Frequently Used Pens & Inks")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 7.2)
    c.drawString(margin + 12, freq_y + freq_h - 28, "Top workhorse fountain pens and favorite inks ranked by total logged fills")
    _draw_pill(
        c,
        margin + content_w - 118,
        freq_y + freq_h - 22,
        "Metric: Ink-Ups + Refills",
        bg=ZINC_100,
        fg=ZINC_700,
        font_name=FONT_SEMI,
        font_size=6.8,
        pad_x=6.0,
        h=13.0,
    )

    col_w = (content_w - 36.0) / 2.0
    left_col_x = margin + 12.0
    right_col_x = margin + 24.0 + col_w
    list_top = freq_y + freq_h - 45.0

    # Column subheaders
    c.setFillColor(ZINC_400)
    c.setFont(FONT_BOLD, 6.8)
    c.drawString(left_col_x, list_top, "TOP FOUNTAIN PENS")
    c.drawString(right_col_x, list_top, "TOP INKS")

    top_pens = data["top_pens"][:7]
    top_inks = data["top_inks"][:7]
    max_pen_fills = max([1] + [p["total_fills"] for p in top_pens])
    max_ink_fills = max([1] + [i["total_fills"] for i in top_inks])

    item_step = 26.5
    for idx, p in enumerate(top_pens):
        iy = list_top - 16.0 - idx * item_step
        rank_txt = f"{idx + 1}."
        c.setFillColor(ZINC_400)
        c.setFont(FONT_MONO, 7.2)
        c.drawString(left_col_x, iy + 6, rank_txt)

        val_txt = f"{p['total_fills']} fills · {p['total_days_inked']}d"
        val_w = pdfmetrics.stringWidth(val_txt, FONT_MONO_BOLD, 7.0)
        nib_txt = f"[{p['nib_size']}]"
        nib_w = pdfmetrics.stringWidth(nib_txt, FONT_MONO, 6.6)

        avail_lbl = col_w - 18.0 - val_w - nib_w - 10.0
        lbl = _fit_text(p["label"], FONT_SEMI, 7.6, avail_lbl)
        c.setFillColor(ZINC_800)
        c.setFont(FONT_SEMI, 7.6)
        c.drawString(left_col_x + 14, iy + 6, lbl)
        lw = pdfmetrics.stringWidth(lbl, FONT_SEMI, 7.6)

        c.setFillColor(ZINC_500)
        c.setFont(FONT_MONO, 6.6)
        c.drawString(left_col_x + 14 + lw + 4, iy + 6, nib_txt)

        c.setFillColor(ZINC_700)
        c.setFont(FONT_MONO_BOLD, 7.0)
        c.drawRightString(left_col_x + col_w, iy + 6, val_txt)

        # Progress bar
        c.setFillColor(ZINC_100)
        c.roundRect(left_col_x, iy - 2.0, col_w, 4.6, 2.2, stroke=0, fill=1)
        pw = max(6.0, (p["total_fills"] / max_pen_fills) * col_w)
        c.setFillColor(INDIGO_600)
        c.roundRect(left_col_x, iy - 2.0, pw, 4.6, 2.2, stroke=0, fill=1)

    for idx, ink in enumerate(top_inks):
        iy = list_top - 16.0 - idx * item_step
        rank_txt = f"{idx + 1}."
        c.setFillColor(ZINC_400)
        c.setFont(FONT_MONO, 7.2)
        c.drawString(right_col_x, iy + 6, rank_txt)

        _draw_swatch_dot(c, right_col_x + 18, iy + 8.5, 3.3, ink["hex_color"])

        val_txt = f"{ink['total_fills']} fills · {ink['total_days_inked']}d"
        val_w = pdfmetrics.stringWidth(val_txt, FONT_MONO_BOLD, 7.0)
        avail_lbl = col_w - 28.0 - val_w - 6.0
        lbl = _fit_text(ink["label"], FONT_SEMI, 7.6, avail_lbl)

        c.setFillColor(ZINC_800)
        c.setFont(FONT_SEMI, 7.6)
        c.drawString(right_col_x + 25, iy + 6, lbl)

        c.setFillColor(ZINC_700)
        c.setFont(FONT_MONO_BOLD, 7.0)
        c.drawRightString(right_col_x + col_w, iy + 6, val_txt)

        # Progress bar colored in the actual ink hex!
        c.setFillColor(ZINC_100)
        c.roundRect(right_col_x, iy - 2.0, col_w, 4.6, 2.2, stroke=0, fill=1)
        iw = max(6.0, (ink["total_fills"] / max_ink_fills) * col_w)
        c.setFillColor(_safe_hex(ink["hex_color"]))
        c.roundRect(right_col_x, iy - 2.0, iw, 4.6, 2.2, stroke=0, fill=1)

    p2_y = freq_y - 11.0

    # 2. Row 3 Three-Column Grid: Nib Share | Ready for Next Rotation | Recent Lifecycle Events
    row3_h = 250.0
    row3_y = p2_y - row3_h
    col3_gap = 8.5
    col3_w = (content_w - 2 * col3_gap) / 3.0

    # Card A: Nib Size Usage Share
    ax = margin
    _draw_card(c, ax, row3_y, col3_w, row3_h, radius=8.5)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.0)
    c.drawString(ax + 11, row3_y + row3_h - 17, "Nib Size Usage Share")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 6.9)
    c.drawString(ax + 11, row3_y + row3_h - 27, "Total fills across nib grinds")

    nibs = data["nib_distribution"][:9]
    nib_top = row3_y + row3_h - 43.0
    nib_step = 22.0
    for idx, n in enumerate(nibs):
        ny = nib_top - idx * nib_step
        c.setFillColor(ZINC_50)
        c.setStrokeColor(ZINC_200)
        c.setLineWidth(0.45)
        c.roundRect(ax + 10, ny - 4, col3_w - 20, 18.0, 4.0, stroke=1, fill=1)

        pill_w = _draw_pill(
            c,
            ax + 14,
            ny - 1.5,
            str(n["nib_size"]),
            bg=ZINC_200,
            fg=ZINC_900,
            font_name=FONT_MONO_BOLD,
            font_size=6.7,
            pad_x=4.5,
            h=12.5,
        )
        c.setFillColor(ZINC_500)
        c.setFont(FONT_REG, 6.8)
        c.drawString(ax + 18 + pill_w, ny + 1.5, f"{n['pens']} pens")

        c.setFillColor(ZINC_900)
        c.setFont(FONT_MONO_BOLD, 7.1)
        c.drawRightString(ax + col3_w - 15, ny + 1.5, f"{n['fills']} fills")

    # Card B: Ready for Next Rotation
    bx = margin + col3_w + col3_gap
    _draw_card(c, bx, row3_y, col3_w, row3_h, radius=8.5)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.0)
    c.drawString(bx + 11, row3_y + row3_h - 17, "Ready for Next Rotation")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 6.9)
    c.drawString(bx + 11, row3_y + row3_h - 27, "Uninked pens & inks longest waiting")

    ry_cur = row3_y + row3_h - 42.0
    c.setFillColor(ZINC_400)
    c.setFont(FONT_BOLD, 6.5)
    c.drawString(bx + 11, ry_cur, "LONGEST IDLE PENS")
    ry_cur -= 13.0
    for p in data["neglected_pens"][:4]:
        idle_txt = "Never" if p["days_since_used"] is None else f"{p['days_since_used']}d idle"
        iw = pdfmetrics.stringWidth(idle_txt, FONT_MONO, 6.6)
        plbl = _fit_text(f"{p['label']} [{p['nib_size']}]", FONT_REG, 7.0, col3_w - 28 - iw)
        c.setFillColor(ZINC_700)
        c.setFont(FONT_REG, 7.0)
        c.drawString(bx + 11, ry_cur, plbl)
        c.setFillColor(ZINC_400)
        c.setFont(FONT_MONO, 6.6)
        c.drawRightString(bx + col3_w - 11, ry_cur, idle_txt)
        ry_cur -= 16.5

    ry_cur -= 4.0
    c.setStrokeColor(ZINC_100)
    c.setLineWidth(0.6)
    c.line(bx + 11, ry_cur + 7, bx + col3_w - 11, ry_cur + 7)

    c.setFillColor(ZINC_400)
    c.setFont(FONT_BOLD, 6.5)
    c.drawString(bx + 11, ry_cur - 4, "LONGEST IDLE INKS")
    ry_cur -= 17.5
    for i_row in data["neglected_inks"][:4]:
        idle_txt = "Untested" if i_row["days_since_used"] is None else f"{i_row['days_since_used']}d ago"
        iw = pdfmetrics.stringWidth(idle_txt, FONT_MONO, 6.6)
        _draw_swatch_dot(c, bx + 14.5, ry_cur + 2.4, 2.8, i_row["hex_color"])
        ilbl = _fit_text(i_row["label"], FONT_REG, 7.0, col3_w - 36 - iw)
        c.setFillColor(ZINC_700)
        c.setFont(FONT_REG, 7.0)
        c.drawString(bx + 20.5, ry_cur, ilbl)
        c.setFillColor(ZINC_400)
        c.setFont(FONT_MONO, 6.6)
        c.drawRightString(bx + col3_w - 11, ry_cur, idle_txt)
        ry_cur -= 16.5

    # Card C: Recent Lifecycle Events
    cx_card = margin + 2 * (col3_w + col3_gap)
    _draw_card(c, cx_card, row3_y, col3_w, row3_h, radius=8.5)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.0)
    c.drawString(cx_card + 11, row3_y + row3_h - 17, "Recent Lifecycle Events")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 6.9)
    c.drawString(cx_card + 11, row3_y + row3_h - 27, "Latest ink-ups, refills, and cleanings")

    ev_list = data["recent_events"][:7]
    ev_top = row3_y + row3_h - 43.0
    ev_step = 28.0
    for idx, ev in enumerate(ev_list):
        ey = ev_top - idx * ev_step
        etype = ev["event_type"]
        ebg = INDIGO_50 if etype == "inked" else (SKY_50 if etype == "refilled" else EMERALD_50)
        efg = INDIGO_700 if etype == "inked" else (SKY_700 if etype == "refilled" else EMERALD_700)
        pw = _draw_pill(
            c,
            cx_card + 11,
            ey + 3.5,
            etype.upper(),
            bg=ebg,
            fg=efg,
            font_name=FONT_BOLD,
            font_size=5.8,
            pad_x=4.0,
            h=10.5,
            radius=3.0,
        )
        dt_str = ev["event_date"]
        dtw = pdfmetrics.stringWidth(dt_str, FONT_MONO, 6.3)

        pen_lbl = _fit_text(ev["pen_label"], FONT_SEMI, 6.9, col3_w - 26 - pw - dtw)
        c.setFillColor(ZINC_800)
        c.setFont(FONT_SEMI, 6.9)
        c.drawString(cx_card + 14 + pw, ey + 5.2, pen_lbl)

        c.setFillColor(ZINC_400)
        c.setFont(FONT_MONO, 6.3)
        c.drawRightString(cx_card + col3_w - 11, ey + 5.2, dt_str)

        _draw_swatch_dot(c, cx_card + 14, ey - 3.5, 2.5, ev["ink_hex"])
        c.setFillColor(ZINC_500)
        c.setFont(FONT_REG, 6.5)
        c.drawString(cx_card + 20, ey - 5.8, _fit_text(ev["ink_label"], FONT_REG, 6.5, col3_w - 32))

        if idx < len(ev_list) - 1:
            c.setStrokeColor(ZINC_100)
            c.setLineWidth(0.45)
            c.line(cx_card + 11, ey - 10.5, cx_card + col3_w - 11, ey - 10.5)

    p2_y = row3_y - 11.0

    # 3. Bottom Showcase Card: Featured Journal Handwriting Samples
    gal_h = max(145.0, p2_y - 36.0)
    gal_y = p2_y - gal_h
    _draw_card(c, margin, gal_y, content_w, gal_h, radius=8.5)
    c.setFillColor(ZINC_900)
    c.setFont(FONT_BOLD, 9.2)
    c.drawString(margin + 12, gal_y + gal_h - 17, "Recent Handwriting Samples from Scanned Journal")
    c.setFillColor(ZINC_500)
    c.setFont(FONT_REG, 7.0)
    c.drawString(
        margin + 12,
        gal_y + gal_h - 27.5,
        f"Cropped ink log entries ({kpis['total_writing_samples']} total samples archived across 32 notebook spreads)",
    )

    if picked_showcase:
        sgap_x = 10.0
        sgap_y = 8.0
        sw = (content_w - 24.0 - sgap_x) / 2.0
        avail_grid_h = gal_h - 46.0
        cell_h = (avail_grid_h - sgap_y) / 2.0
        thumb_h = max(48.0, cell_h - 17.0)
        for idx, ws in enumerate(picked_showcase[:4]):
            col_i = idx % 2
            row_i = idx // 2
            sx = margin + 12.0 + col_i * (sw + sgap_x)
            cell_bottom = gal_y + 8.0 + (1 - row_i) * (cell_h + sgap_y)
            img_p = storage.resolve_path(ws.image_storage_key)
            _draw_sample_cutout(c, img_p, sx, cell_bottom + 15.0, sw, thumb_h, radius=5.0)

            pen_txt = f"{ws.pen.brand} {ws.pen.model} [{ws.pen.nib_size}]"
            ink_txt = f"{ws.ink.brand} {ws.ink.name} · {ws.sample_date.isoformat()}"
            c.setFillColor(ZINC_800)
            c.setFont(FONT_SEMI, 6.8)
            p_fit = _fit_text(pen_txt, FONT_SEMI, 6.8, sw * 0.50)
            c.drawString(sx + 2, cell_bottom + 4.5, p_fit)

            ink_fit = _fit_text(ink_txt, FONT_REG, 6.5, sw * 0.46)
            iw_txt = pdfmetrics.stringWidth(ink_fit, FONT_REG, 6.5)
            ix_right = sx + sw - 2
            c.setFillColor(ZINC_500)
            c.setFont(FONT_REG, 6.5)
            c.drawRightString(ix_right, cell_bottom + 4.5, ink_fit)
            _draw_swatch_dot(c, ix_right - iw_txt - 5.5, cell_bottom + 6.8, 2.5, ws.ink.hex_color)

    _draw_footer(c, 2, 2, page_w, margin)
    c.showPage()
    c.save()

    return buf.getvalue()
