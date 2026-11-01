"""Import missing owned Pens & Inks from the user's Google Sheet collection tracker.

Source Google Sheet:
https://docs.google.com/spreadsheets/d/1WnLL6riUU7pnQ9Z6taBkRVkxfB7-J7_s1JuijNDmtlE/edit?gid=0

User rules confirmed:
1. Skip Sold, PIF / Gifted, and Lost items — only import pens & inks currently in possession.
2. Catalogue-only import: add missing pens & inks (plus bottle quantities like x2 / 2 bottles
   and finished/dried-out bottle levels) without altering Currently Inked sessions.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import Ink, Pen  # noqa: E402

# (brand, model, color_variant, nib_size, nib_material, filling_mechanism, status, custom_notes)
MISSING_OWNED_PENS: list[tuple[str, str, str, str, str, str, str, str]] = [
    ("ASA", "Transnauka", "Tangerine Acrylic", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Bookworm", "685", "Classic", "M", "Steel", "Converter", "maintenance", "Nib broken (imported from Google Sheet catalogue)."),
    ("Camlin", "Elegante", "Red", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Camlin", "Elegante", "Red — Versace Nib", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Click", "Aristocrat", "Orange", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Click", "Aristocrat", "Red", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Deccan", "Bullet Junior", "Ebonite", "F", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Deccan", "Bullet Senior", "Ebonite", "M", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Esterbrook", "J", "Vintage", "M", "Steel", "Lever", "active", "Imported from Google Sheet catalogue."),
    ("Esterbrook", "SJ", "Vintage", "M", "Steel", "Lever", "active", "Imported from Google Sheet catalogue."),
    ("Fosfor", "Rajendran", "Custom", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Gama", "Sneaky", "Light Brown Swirl", "M", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Guider", "Classic", "Blue-Black", "M", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Guider", "Small Acrylic", "Amber — Schmidt Nib", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Hero", "330", "Black", "F", "Steel", "Aerometric", "active", "Imported from Google Sheet catalogue."),
    ("Hero", "330", "Green", "F", "Steel", "Aerometric", "active", "Imported from Google Sheet catalogue."),
    ("Hero", "330", "Red", "F", "Steel", "Aerometric", "active", "Imported from Google Sheet catalogue."),
    ("Hero", "616", "Black", "F", "Steel", "Aerometric", "active", "Imported from Google Sheet catalogue."),
    ("Noodler's", "Ahab", "Flex", "Flex", "Steel", "Piston", "active", "Imported from Google Sheet catalogue."),
    ("Oliver", "Demonstrator", "Clear", "M", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Parker", "Vector", "Classic", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Parker", "Vintage", "Burgundy & Black — Flex", "Flex", "Gold", "Aerometric", "active", "Imported from Google Sheet catalogue."),
    ("Parker", "Vintage", "Burgundy & Black — Non-Flex", "M", "Gold", "Aerometric", "active", "Imported from Google Sheet catalogue."),
    ("Ranga", "Bamboo", "Blue Ripple Ebonite", "M", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Ranga", "Model 3C", "Premium Ebonite", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Ranga", "Model 4C", "Green Ebonite", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Ratnamson", "302", "Blue Ebonite", "F", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Ratnamson", "302", "Brick Red Ebonite", "F", "Steel", "Eyedropper", "active", "Imported from Google Sheet catalogue."),
    ("Reynolds", "Baoer", "Classic", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
    ("Visconti", "Salvador Dali", "Surrealist Resin", "M", "Steel", "Converter", "active", "Imported from Google Sheet catalogue."),
]

# (brand, name, color_family, hex_color, format, volume_ml, remaining_level, quantity, moi_url, tags, notes)
MISSING_OWNED_INKS: list[tuple[str, str, str, str, str, float, str, int, str, str, str]] = [
    ("Bril", "Royal Blue", "Blue", "#1d4ed8", "bottle", 60.0, "full", 1, "", "", "Listed as 'Bril Blue' in Google Sheet catalogue."),
    ("Bril", "Black", "Black", "#18181b", "bottle", 60.0, "full", 1, "", "", "Imported from Google Sheet catalogue."),
    ("Bril", "Red", "Red", "#dc2626", "bottle", 60.0, "full", 1, "", "", "Imported from Google Sheet catalogue."),
    ("Camlin", "Red", "Red", "#e11d48", "bottle", 60.0, "full", 1, "", "", "Imported from Google Sheet catalogue."),
    ("Diamine", "Burnt Sienna", "Brown", "#9a3412", "bottle", 80.0, "empty", 1, "https://mountainofink.com/blog/diamine-burnt-sienna", "shading", "Marked 'Dried out' in Google Sheet catalogue."),
    ("Diamine", "Deep Dark Orange", "Orange", "#c2410c", "bottle", 80.0, "full", 1, "https://mountainofink.com/blog/diamine-deep-dark-orange", "shading", "Cult Pens exclusive; imported from Google Sheet catalogue."),
    ("J. Herbin", "1670 Stormy Grey", "Grey", "#475569", "bottle", 50.0, "full", 1, "https://mountainofink.com/blog/j-herbin-stormy-grey", "shimmer", "Imported from Google Sheet catalogue."),
    ("Krishna", "Yellow Valley", "Brown", "#ca8a04", "bottle", 20.0, "full", 1, "", "shading", "Imported from Google Sheet catalogue."),
    ("Krishna", "Goldrush", "Brown", "#b45309", "bottle", 20.0, "full", 1, "", "shading", "Imported from Google Sheet catalogue."),
    ("Parker", "Quink Blue", "Blue", "#2563eb", "bottle", 57.0, "full", 1, "https://mountainofink.com/blog/parker-quink-blue", "", "Imported from Google Sheet catalogue."),
    ("Parker", "Quink Black", "Black", "#1f2937", "bottle", 57.0, "full", 1, "https://mountainofink.com/blog/parker-quink-black", "", "Imported from Google Sheet catalogue."),
    ("Pelikan", "Highlighter", "Green", "#84cc16", "bottle", 30.0, "full", 1, "", "highlighter", "Imported from Google Sheet catalogue."),
    ("Pilot Iroshizuku", "Tsutsuji", "Pink", "#db2777", "bottle", 50.0, "full", 2, "https://mountainofink.com/blog/pilot-iroshizuku-tsutsuji", "sheen", "2 bottles noted in Google Sheet catalogue."),
    ("Waterman", "Florida Blue", "Blue", "#1d4ed8", "bottle", 50.0, "full", 1, "https://mountainofink.com/blog/waterman-serenity-blue", "", "Classic Serenity / Florida Blue; imported from Google Sheet catalogue."),
    ("Waterman", "Havana Brown", "Brown", "#6b3e26", "bottle", 50.0, "full", 1, "https://mountainofink.com/blog/waterman-absolute-brown", "", "Classic Absolute / Havana Brown; imported from Google Sheet catalogue."),
    ("Dominant Industry", "Periwinkle Twinkle", "Purple", "#818cf8", "bottle", 25.0, "full", 1, "https://mountainofink.com/blog/dominant-industry-periwinkle-twinkle", "shimmer", "Imported from Google Sheet catalogue."),
    ("Private Reserve", "Avacado", "Green", "#3f6212", "bottle", 66.0, "full", 1, "https://mountainofink.com/blog/private-reserve-avacado", "shading", "Listed on Pens tab (Krishna Nova pairing) in Google Sheet catalogue."),
]


def main() -> None:
    db = SessionLocal()
    try:
        added_pens: list[str] = []
        for brand, model, color, nib, mat, mech, status, notes in MISSING_OWNED_PENS:
            exists = (
                db.query(Pen)
                .filter(
                    Pen.brand.ilike(brand),
                    Pen.model.ilike(model),
                    Pen.color_variant.ilike(color),
                )
                .first()
            )
            if exists:
                continue
            p = Pen(
                brand=brand,
                model=model,
                color_variant=color,
                nib_size=nib,
                nib_material=mat,
                filling_mechanism=mech,
                status=status,
                custom_notes=notes,
            )
            db.add(p)
            added_pens.append(p.display_name)

        added_inks: list[str] = []
        for brand, name, fam, hex_c, fmt, vol, lvl, qty, moi, tags, notes in MISSING_OWNED_INKS:
            exists = (
                db.query(Ink)
                .filter(Ink.brand.ilike(brand), Ink.name.ilike(name))
                .first()
            )
            if exists:
                continue
            ink = Ink(
                brand=brand,
                name=name,
                color_family=fam,
                hex_color=hex_c,
                format=fmt,
                volume_ml=vol,
                remaining_level=lvl,
                quantity=qty,
                mountain_of_ink_url=moi,
                properties_tags=tags,
                custom_notes=notes,
            )
            db.add(ink)
            added_inks.append(ink.display_name + (f" (x{qty})" if qty > 1 else ""))

        # Enrich existing inks with sheet bottle counts / finished status
        updated_inks: list[str] = []
        ancient_copper = (
            db.query(Ink)
            .filter(Ink.brand.ilike("Diamine"), Ink.name.ilike("Ancient Copper"))
            .first()
        )
        if ancient_copper and ancient_copper.quantity < 2:
            ancient_copper.quantity = 2
            note = "2 bottles noted in Google Sheet catalogue."
            if note not in (ancient_copper.custom_notes or ""):
                ancient_copper.custom_notes = (
                    f"{ancient_copper.custom_notes}\n{note}".strip()
                    if ancient_copper.custom_notes
                    else note
                )
            updated_inks.append("Diamine Ancient Copper -> quantity=2")

        lamy_turq = (
            db.query(Ink)
            .filter(Ink.brand.ilike("Lamy"), Ink.name.ilike("Turquoise"))
            .first()
        )
        if lamy_turq and lamy_turq.remaining_level != "empty":
            lamy_turq.remaining_level = "empty"
            note = "Marked 'finished' in Google Sheet catalogue."
            if note not in (lamy_turq.custom_notes or ""):
                lamy_turq.custom_notes = (
                    f"{lamy_turq.custom_notes}\n{note}".strip()
                    if lamy_turq.custom_notes
                    else note
                )
            updated_inks.append("Lamy Turquoise -> remaining_level='empty' (finished)")

        db.commit()

        total_pens = db.query(Pen).count()
        active_pens = db.query(Pen).filter(Pen.status == "active").count()
        maint_pens = db.query(Pen).filter(Pen.status == "maintenance").count()
        total_inks = db.query(Ink).count()

        print(f"Added {len(added_pens)} missing owned pens:")
        for item in added_pens:
            print(f"  + {item}")
        print(f"\nAdded {len(added_inks)} missing owned inks:")
        for item in added_inks:
            print(f"  + {item}")
        print(f"\nUpdated {len(updated_inks)} existing inks from sheet notes:")
        for item in updated_inks:
            print(f"  * {item}")
        print(
            f"\nNew Catalogue Totals: {total_pens} Pens ({active_pens} active, {maint_pens} maintenance) | {total_inks} Inks"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
