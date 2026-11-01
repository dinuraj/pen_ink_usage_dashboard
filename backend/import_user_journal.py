"""Imports Dinu's real 32-spread handwritten Ink Log PDF (Nov 2018 – Sept 2026) into SQLite & storage.

Wipes demo seed data cleanly, renders all 32 notebook spreads to high-DPI WebP, creates the full
catalog of Fountain Pens & Inks (with confirmed pen variant merges), crops every handwriting sample
against its exact spread bounding box, and sets ONLY the 5 late-2026 entries on Spread 32 as active.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
import json
from pathlib import Path
import shutil
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.config import UPLOADS_DIR  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Ink,
    LifecycleEvent,
    Pen,
    PenPhoto,
    ScanBatch,
    ScanPage,
    UsageSession,
    WritingSample,
)
from app.schemas import CropBox  # noqa: E402
from app.services.pdf_vision import crop_sample_bytes, render_document_pages  # noqa: E402
from app.storage import storage  # noqa: E402

PDF_SOURCE_PATH = Path(r"C:\Users\dinur\OneDrive\Pen and ink usage- 2026-11-01 00_09_02.pdf")

# Left and Right column horizontal bounds on landscape 2-page notebook spreads
COL_X = {
    "L": (0.025, 0.460),
    "R": (0.510, 0.475),
}

# (brand, model, color_variant, nib_size, nib_material, filling_mechanism, custom_notes)
PENS: dict[str, tuple[str, str, str, str, str, str, str]] = {
    # Confirmed merged pens across naming variations:
    "pilot_vp_yellow": (
        "Pilot",
        "Vanishing Point",
        "Canary Yellow",
        "M",
        "18k Gold",
        "Converter",
        "Also logged as Pilot Capless Canary Yellow / Pilot VP Yellow.",
    ),
    "pilot_vp_blue": (
        "Pilot",
        "Vanishing Point",
        "Blue Matte",
        "M",
        "18k Gold",
        "Converter",
        "Also logged as Pilot VP Matte Blue / Pilot VP Blue.",
    ),
    "asa_azaadi": (
        "ASA",
        "Azaadi",
        "Ancient Gold Acrylic",
        "M",
        "Steel",
        "Converter",
        "Fitted with Visconti nib. Logged as Ancient Gold / Antique Gold Acrylic.",
    ),
    "asa_titanium": (
        "ASA",
        "Titanium",
        "Brushed Titanium",
        "B",
        "Steel",
        "Converter",
        "Fitted with Bock Broad (B) nib. Also logged as ASA Titan.",
    ),
    "kanwrite_desire_blue_stub": (
        "Kanwrite",
        "Desire",
        "Blue Translucent",
        "Stub 1.1",
        "Steel",
        "Converter",
        "Logged as Kanwrite Desire Blue with Stub nib / Blue translucent.",
    ),
    # Distinct ASA Titanium Blue & White:
    "asa_titanium_bw": ("ASA", "Titanium", "Blue & White", "M", "Steel", "Converter", ""),
    # Rest of collection:
    "ranga_bamboo_gy": ("Ranga", "Bamboo", "Green-Yellow Ebonite", "M", "Steel", "Eyedropper", ""),
    "ranga_sugarcane": ("Ranga", "Sugarcane", "Teal-Red Ebonite", "M", "Steel", "Converter", ""),
    "fosfor_kop_ebonite": ("Fosfor", "KOP", "Woodgrain Ebonite", "M", "Steel", "Converter", ""),
    "fosfor_kop_dartmoor": ("Fosfor", "KOP", "Dartmoor Acrylic", "M", "Steel", "Converter", ""),
    "ranga_m8_black": ("Ranga", "Model 8", "Matte Black Ebonite", "M", "Steel", "Eyedropper", ""),
    "krishna_nova_green": ("Krishna", "Nova", "Green Ebonite", "M", "Steel", "Eyedropper", ""),
    "krishna_lyrebird_52": ("Krishna", "Lyrebird 52", "Brown Swirl", "F", "Steel", "Converter", ""),
    "ranga_m8_orange": ("Ranga", "Model 8", "Orange Ebonite", "M", "Steel", "Eyedropper", ""),
    "lamy_2000": ("Lamy", "2000", "Makrolon Black", "M", "14k Gold", "Piston", ""),
    "asa_athlete": ("ASA", "Athlete", "Ebonite", "M", "Steel", "Converter", ""),
    "twsbi_540_clear": ("TWSBI", "Diamond 540", "Clear Transparent", "M", "Steel", "Piston", ""),
    "ranga_m4c_demo": (
        "Ranga",
        "Model 4C",
        "Clear Demonstrator",
        "Stub 1.1",
        "Steel",
        "Converter",
        "Kanwrite Stub nib.",
    ),
    "lotus_vikrant_blue": ("Lotus", "Vikrant", "Blue Mono Acrylic", "M", "Steel", "Converter", ""),
    "lotus_vikrant_red": ("Lotus", "Vikrant", "Red Mono Acrylic", "M", "Steel", "Converter", ""),
    "asa_maya_black": ("ASA", "Maya", "Black Ebonite", "M", "Steel", "Eyedropper", ""),
    "ranga_m5_red": ("Ranga", "Model 5", "Red / Cherry Ebonite", "M", "Steel", "Eyedropper", ""),
    "sailor_1911": ("Sailor", "1911", "Black & Gold", "M", "14k Gold", "Converter", ""),
    "gama_sneaky_bt": ("Gama", "Sneaky", "Blue-Teal Swirl", "M", "Steel", "Eyedropper", ""),
    "pilot_falcon": ("Pilot", "Falcon", "Black & Gold", "SF", "14k Gold", "Converter", "Soft Fine flex nib."),
    "pilot_metro_lizard": ("Pilot", "Metropolitan", "Retro Pop Lizard", "M", "Steel", "Converter", ""),
    "wality_small_grey": ("Airmail Wality", "Small Demonstrator", "Grey", "F", "Steel", "Eyedropper", ""),
    "wality_big_green": ("Airmail Wality", "Big Demonstrator", "Green", "M", "Steel", "Eyedropper", ""),
    "lotus_shikhar_honeydew": ("Lotus", "Shikhar", "Honey Dew Acrylic", "M", "Steel", "Converter", ""),
    "ranga_m8b_redblack": ("Ranga", "Model 8B", "Red-Black Ebonite", "M", "Steel", "Converter", ""),
    "asa_mist_clear": ("ASA", "Mist", "Clear Acrylic", "M", "Steel", "Eyedropper", ""),
    "ranga_m4c_bluepink": ("Ranga", "Model 4C", "Blue-Pink Swirl", "M", "Steel", "Converter", ""),
    "asa_transnauka": ("ASA", "Transnauka", "Clear Acrylic", "M", "Steel", "Eyedropper", ""),
    "pelikan_m200": ("Pelikan", "Classic M200", "Green Marbled", "M", "Steel", "Piston", ""),
    "deccan_advocate_ebonite": ("Deccan", "Advocate", "Black-Brown Ebonite", "M", "Steel", "Eyedropper", ""),
    "asa_transnauka_blue": ("ASA", "Transnauka", "Blue Acrylic", "M", "Steel", "Converter", ""),
    "fosfor_tikona": ("Fosfor", "Tikona", "Faceted Acrylic", "M", "Steel", "Converter", ""),
    "hero_616_red": ("Hero", "616", "Burgundy Red", "F", "Steel", "Lever", "Aerometric filler."),
    "lotus_custom_by": ("Lotus", "Custom", "Blue with Yellow Swirl", "M", "Steel", "Converter", ""),
    "lotus_vikrant_lava": ("Lotus", "Vikrant", "Lava Swirl", "M", "Steel", "Converter", ""),
    "kaweco_sport": ("Kaweco", "Sport", "Classic", "M", "Steel", "Cartridge", ""),
    "twsbi_vac700": ("TWSBI", "Vac 700", "Smoke Grey", "M", "Steel", "Vacuum", ""),
    "gama_sneaky_tb": ("Gama", "Sneaky", "Teal-Brown Swirl", "M", "Steel", "Eyedropper", ""),
    "pilot_metro_silver": ("Pilot", "Metropolitan", "Silver Steel", "M", "Steel", "Converter", ""),
    "guider_egg_red": ("Guider", "Egg", "Red Swirl Acrylic", "M", "Steel", "Eyedropper", ""),
    "pilot_metro_black": ("Pilot", "Metropolitan", "Classic Black", "M", "Steel", "Converter", ""),
    "asa_nauka_black": ("ASA", "Nauka", "Black Ebonite", "M", "Steel", "Converter", ""),
    "kanwrite_desire_demo": ("Kanwrite", "Desire", "Clear Demonstrator", "B", "Steel", "Converter", ""),
    "guider_brown": ("Guider", "Acrylic", "Brown Swirl", "M", "Steel", "Converter", ""),
    "ratnamson_302_brown": ("Ratnamson", "302", "Brown Ebonite", "F", "Steel", "Eyedropper", ""),
    "kanwrite_desire_black": ("Kanwrite", "Desire", "Solid Black", "M", "Steel", "Converter", ""),
    "jinhao_9035": ("Jinhao", "9035", "Reddish Wood", "M", "Steel", "Converter", ""),
    "pilot_ch91": ("Pilot", "Custom Heritage 91", "Black", "FM", "14k Gold", "Converter", ""),
    "asa_nauka_blue": ("ASA", "Nauka", "Translucent Blue", "M", "Steel", "Converter", ""),
    "kaweco_sport_blue": ("Kaweco", "Sport", "Navy Blue", "B", "Steel", "Cartridge", ""),
    "ranga_m5_kanwrite_b": ("Ranga", "Model 5", "Ebonite (Kanwrite B)", "B", "Steel", "Converter", ""),
    "deccan_advocate_olive": ("Deccan", "Advocate", "Olive Green Ebonite", "M", "Steel", "Eyedropper", ""),
    "gama_kuyil": ("Gama", "Kuyil", "Ebonite (Kanwrite Nib)", "M", "Steel", "Eyedropper", ""),
    "asa_maya_brown": ("ASA", "Maya", "Brown Ebonite", "M", "Steel", "Eyedropper", ""),
    "oliver_21": ("Oliver", "21", "Hooded Classic", "F", "Steel", "Lever", "Aerometric filler."),
    "twsbi_540_amber": ("TWSBI", "Diamond 540", "Amber Transparent", "M", "Steel", "Piston", ""),
    "ranga_zeal": ("Ranga", "Zeal", "Blue & Demonstrator", "M", "Steel", "Converter", ""),
    "lotus_shikhar_lava": ("Lotus", "Shikhar", "Lava Acrylic", "M", "Steel", "Converter", ""),
    "lamy_safari_blue": ("Lamy", "Safari", "Blue", "M", "Steel", "Converter", ""),
    "lamy_safari_red": ("Lamy", "Safari", "Red", "M", "Steel", "Converter", ""),
    "lamy_safari_yellow": ("Lamy", "Safari", "Yellow", "M", "Steel", "Converter", ""),
    "asa_durga": ("ASA", "Durga", "Brown Ebonite", "M", "Steel", "Converter", ""),
    "vazir_black": ("Vazir", "Classic", "Black", "M", "Steel", "Converter", ""),
    "lamy_safari_mango": ("Lamy", "Safari", "Mango Special Edition", "M", "Steel", "Converter", ""),
    "kanwrite_heritage_flex": ("Kanwrite", "Heritage", "Ebonite Flex", "Flex", "Steel", "Piston", ""),
    "ranga_bamboo_gbb": ("Ranga", "Bamboo", "Green-Blue-Black Ebonite", "M", "Steel", "Converter", ""),
    "sheaffer_gift_100_red": ("Sheaffer", "100", "Glossy Red", "M", "Steel", "Converter", ""),
    "guider_green": ("Guider", "Acrylic", "Green", "M", "Steel", "Converter", ""),
    "guider_red_capsule": ("Guider", "Capsule", "Red Acrylic", "M", "Steel", "Eyedropper", ""),
    "gama_sneaky_khaki": ("Gama", "Sneaky", "Khaki Green Ebonite Swirl", "M", "Steel", "Eyedropper", ""),
    "deccan_small_black": ("Deccan", "Small Pocket", "Black Ebonite", "F", "Steel", "Eyedropper", ""),
    "asa_nauka_green": ("ASA", "Nauka", "Translucent Green", "M", "Steel", "Converter", ""),
    "kanwrite_heritage_8b": ("Kanwrite", "Heritage 8B", "Ebonite", "B", "Steel", "Piston", ""),
    "kanwrite_heritage_white": ("Kanwrite", "Heritage", "White Marbled", "B", "Steel", "Piston", ""),
    "kanwrite_heritage_blue": (
        "Kanwrite",
        "Heritage",
        "Blue Swirl",
        "BB",
        "Steel",
        "Piston",
        "Nib swapped to BB in May 2024.",
    ),
    "kanwrite_heritage_brown": ("Kanwrite", "Heritage", "Brown Marbled", "M", "Steel", "Piston", ""),
    "asa_bhishma": ("ASA", "Bhishma", "Purple Lava Alumilite", "M", "Steel", "Converter", ""),
    "ranga_bamboo_demo": ("Ranga", "Bamboo", "Clear Demonstrator", "M", "Steel", "Converter", ""),
    "camlin_elegante_blue": ("Camlin", "Elegante", "Blue", "M", "Steel", "Converter", ""),
    "vazir_rosegold_black": ("Vazir", "Rose Gold", "Black & Rose Gold", "M", "Steel", "Converter", ""),
    "asa_advocate_black": ("ASA", "Advocate", "Black Ebonite", "M", "Steel", "Eyedropper", ""),
    "ratnam_blue_ebonite": ("Ratnam", "Supreme", "Blue Ebonite", "M", "Steel", "Eyedropper", ""),
    "asa_elements_blue": ("ASA", "Elements", "Blue Acrylic", "M", "Steel", "Converter", ""),
    "krishna_brown_swirl": ("Krishna", "Handmade", "Brown Swirl", "M", "Steel", "Converter", ""),
    "vazir_black_copper": ("Vazir", "Copper Trim", "Black Copper Finish", "M", "Steel", "Converter", ""),
    "fosfor_islander": ("Fosfor", "Islander", "Custom Acrylic", "M", "Steel", "Converter", ""),
    "wality_71j_blue": ("Airmail Wality", "71J", "Blue", "F", "Steel", "Eyedropper", ""),
    "lotus_vikrant_gb_lava": ("Lotus", "Vikrant", "Green-Blue Lava Acrylic", "M", "Steel", "Converter", ""),
    "wality_small_pen": ("Airmail Wality", "Small Eyedropper", "Classic", "F", "Steel", "Eyedropper", ""),
    "pilot_metro_salamander": ("Pilot", "Metropolitan", "Animal Salamander Grey", "M", "Steel", "Converter", ""),
    "twsbi_540_orange": ("TWSBI", "Diamond 540", "Sunset Orange", "M", "Steel", "Piston", ""),
    "parker_frontier_kw": ("Parker", "Frontier", "Matte Black (Kanwrite Nib)", "M", "Steel", "Converter", ""),
    "vazir_black_acrylic": ("Vazir", "Acrylic", "Solid Black", "M", "Steel", "Converter", ""),
    "asa_yoddha": ("ASA", "Yoddha", "Ebonite / Acrylic", "M", "Steel", "Converter", ""),
    "asvine_v200": ("Asvine", "V200", "Titanium Clear Vacuum", "M", "Steel", "Vacuum", ""),
    "sheaffer_100": ("Sheaffer", "100", "Chrome & Black", "M", "Steel", "Converter", ""),
    "faber_castell_emotion": ("Faber-Castell", "e-motion", "Pearwood Brown", "M", "Steel", "Converter", ""),
    "deccan_black_slim": ("Deccan", "Slim", "Black Ebonite", "F", "Steel", "Eyedropper", ""),
    "wality_71jt_green": ("Airmail Wality", "71JT", "Green Demonstrator", "M", "Steel", "Eyedropper", ""),
    "gama_sneaky_tiger": ("Gama", "Sneaky", "Tiger Ebonite", "M", "Steel", "Eyedropper", ""),
    "asa_jupiter_nauka": ("ASA", "Jupiter Nauka", "Ebonite", "M", "Steel", "Converter", ""),
    "asa_prithvi": ("ASA", "Prithvi", "Handmade Ebonite", "M", "Steel", "Converter", ""),
    "moonman_capless": ("Majohn", "A1 Capless", "Matte Black", "EF", "Steel", "Converter", "Logged as Moonman Capless."),
    "wingsung_699": ("Wing Sung", "699", "Vacuum Smoke", "M", "Steel", "Vacuum", ""),
    "pilot_prera": ("Pilot", "Prera", "Classic", "M", "Steel", "Converter", ""),
    "wality_orange": ("Airmail Wality", "Handmade", "Orange", "M", "Steel", "Eyedropper", ""),
    "guider_bullet": ("Guider", "Bullet", "Acrylic / Ebonite", "M", "Steel", "Converter", ""),
}

# (brand, name, color_family, hex_color, format, volume_ml, moi_url, tags)
INKS: dict[str, tuple[str, str, str, str, str, float, str, str]] = {
    "diamine_deep_magenta": (
        "Diamine", "Deep Magenta", "Pink", "#a21caf", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-deep-magenta", "Vibrant",
    ),
    "diamine_jade_green": (
        "Diamine", "Jade Green", "Green", "#22a06b", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-jade-green", "Shading",
    ),
    "noodlers_apache_sunset": (
        "Noodler's", "Apache Sunset", "Orange", "#ea580c", "bottle", 90.0,
        "https://mountainofink.com/blog/noodlers-apache-sunset", "High Shading",
    ),
    "kwz_ig_turquoise": (
        "KWZ", "IG Turquoise", "Teal", "#0f766e", "bottle", 60.0,
        "https://mountainofink.com/blog/kwz-ig-turquoise", "Iron Gall, Water Resistant",
    ),
    "kwz_honey": (
        "KWZ", "Honey", "Brown", "#b45309", "bottle", 60.0,
        "https://mountainofink.com/blog/kwz-honey", "Heavy Shading",
    ),
    "noodlers_baystate_blue": (
        "Noodler's", "Baystate Blue", "Blue", "#1d4ed8", "bottle", 90.0,
        "https://mountainofink.com/blog/noodlers-baystate-blue", "Electric Blue, Permanent",
    ),
    "waterman_green": (
        "Waterman", "Harmonious Green", "Green", "#15803d", "bottle", 50.0,
        "https://mountainofink.com/blog/waterman-harmonious-green", "Well-Behaved",
    ),
    "kwz_ig_mandarin": (
        "KWZ", "IG Mandarin", "Orange", "#d97706", "bottle", 60.0,
        "https://mountainofink.com/blog/kwz-iron-gall-mandarin", "Iron Gall",
    ),
    "diamine_sunset": (
        "Diamine", "Sunset", "Orange", "#ea580c", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-sunset", "Shading",
    ),
    "diamine_oxblood": (
        "Diamine", "Oxblood", "Red", "#69140e", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-oxblood", "Dark Burgundy",
    ),
    "camlin_black": ("Camlin", "Permanent Black", "Black", "#1e293b", "bottle", 60.0, "", "Everyday"),
    "pr_plum": (
        "Private Reserve", "Plum", "Purple", "#7e22ce", "bottle", 66.0,
        "https://mountainofink.com/blog/private-reserve-plum", "Saturated",
    ),
    "krishna_monsoon_sky": ("Krishna", "Monsoon Sky", "Teal", "#0284c7", "bottle", 20.0, "", "Shading"),
    "iro_asa_gao": (
        "Pilot Iroshizuku", "Asa-gao", "Blue", "#1e40af", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-asa-gao", "Wet Flow",
    ),
    "diamine_wild_strawberry": (
        "Diamine", "Wild Strawberry", "Red", "#dc2626", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-wild-strawberry", "Gold Sheen",
    ),
    "diamine_turquoise": (
        "Diamine", "Turquoise", "Blue", "#0284c7", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-turquoise", "Shading",
    ),
    "diamine_sargasso_sea": (
        "Diamine", "Sargasso Sea", "Blue", "#1e3a8a", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-sargasso-sea", "Copper Sheen",
    ),
    "noodlers_black": (
        "Noodler's", "Black", "Black", "#171717", "bottle", 90.0,
        "https://mountainofink.com/blog/noodlers-black", "Bulletproof, Waterproof",
    ),
    "daytone_red": ("Daytone", "Extra Fine Red", "Red", "#dc2626", "bottle", 60.0, "", ""),
    "herbin_emerald_chivor": (
        "J. Herbin", "1670 Emerald of Chivor", "Teal", "#0d6e6e", "bottle", 50.0,
        "https://mountainofink.com/blog/j-herbin-1670-emerald-of-chivor", "Gold Shimmer, Red Sheen",
    ),
    "herbin_rouge_hematite": (
        "J. Herbin", "1670 Rouge Hematite", "Red", "#991b1b", "bottle", 50.0,
        "https://mountainofink.com/blog/j-herbin-1670-rouge-hematite", "Shimmer, Gold-Green Sheen",
    ),
    "noodlers_54th_mass": (
        "Noodler's", "54th Massachusetts", "Blue", "#334155", "bottle", 90.0,
        "https://mountainofink.com/blog/noodlers-54th-massachusetts", "Blue-Black, Bulletproof",
    ),
    "krishna_ochre": ("Krishna", "Ochre", "Brown", "#b45309", "bottle", 20.0, "", "Shading"),
    "noodlers_libertys_elysium": (
        "Noodler's", "Liberty's Elysium", "Blue", "#2563eb", "bottle", 90.0,
        "https://mountainofink.com/blog/noodlers-libertys-elysium", "Water Resistant",
    ),
    "diamine_eclipse": (
        "Diamine", "Eclipse", "Purple", "#1e1b4b", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-eclipse", "Blue-Black Purple",
    ),
    "kwz_ig_aztec_gold": (
        "KWZ", "IG Aztec Gold", "Brown", "#a16207", "bottle", 60.0,
        "https://mountainofink.com/blog/kwz-iron-gall-aztec-gold", "Iron Gall, Golden Shading",
    ),
    "akkerman_bekakt_haags": (
        "Akkerman", "#23 Bekakt Haags", "Brown", "#5c3a21", "bottle", 60.0,
        "https://mountainofink.com/blog/akkerman-bekakt-haags", "Rich Sepia",
    ),
    "rk_salix": (
        "Rohrer & Klingner", "Salix", "Blue", "#3b5998", "bottle", 50.0,
        "https://mountainofink.com/blog/rohrer-and-klingner-salix", "Iron Gall, Waterproof",
    ),
    "bril_green": ("Bril", "Green", "Green", "#16a34a", "bottle", 60.0, "", ""),
    "diamine_meadow": (
        "Diamine", "Meadow", "Green", "#65a30d", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-meadow", "Bright Shading",
    ),
    "iro_kon_peki": (
        "Pilot Iroshizuku", "Kon-peki", "Blue", "#0369a1", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-kon-peki", "Cerulean, Red Sheen",
    ),
    "diamine_matador": (
        "Diamine", "Matador", "Red", "#b91c1c", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-matador", "Classic Crimson",
    ),
    "sheaffer_skrip_black": (
        "Sheaffer", "Skrip Black", "Black", "#1f2937", "bottle", 50.0,
        "https://mountainofink.com/blog/sheaffer-skrip-black", "Smooth Classic",
    ),
    "ro_peppermint": (
        "Robert Oster", "Peppermint", "Green", "#047857", "sample_vial", 4.0,
        "https://mountainofink.com/blog/robert-oster-peppermint", "Red Sheen",
    ),
    "herbin_eclat_saphir": (
        "J. Herbin", "Éclat de Saphir", "Blue", "#2563eb", "bottle", 30.0,
        "https://mountainofink.com/blog/j-herbin-eclat-de-saphir", "Sapphire Blue",
    ),
    "pr_orange_crush": (
        "Private Reserve", "Orange Crush", "Orange", "#c2410c", "bottle", 66.0,
        "https://mountainofink.com/blog/private-reserve-orange-crush", "Shading",
    ),
    "camlin_blue": ("Camlin", "Royal Blue", "Blue", "#2563eb", "bottle", 60.0, "", ""),
    "diamine_majestic_purple": (
        "Diamine", "Majestic Purple", "Purple", "#6b21a8", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-majestic-purple", "Gold Sheen",
    ),
    "diamine_ochre": (
        "Diamine", "Ochre", "Brown", "#9a5b13", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-ochre", "Warm Earth",
    ),
    "noodlers_bsar": (
        "Noodler's", "Black Swan in Australian Roses", "Purple", "#701a4c", "bottle", 90.0,
        "https://mountainofink.com/blog/noodlers-black-swan-in-australian-roses", "High Shading Burgundy",
    ),
    "lamy_turquoise": (
        "Lamy", "Turquoise", "Blue", "#0284c7", "bottle", 50.0,
        "https://mountainofink.com/blog/lamy-turquoise", "Bright Turquoise",
    ),
    "krishna_jungle_volcano": (
        "Krishna", "Jungle Volcano", "Orange", "#9a3412", "bottle", 20.0,
        "https://mountainofink.com/blog/krishna-jungle-volcano", "Monster Green Sheen",
    ),
    "ro_fire_and_ice": (
        "Robert Oster", "Fire & Ice", "Teal", "#0e7490", "bottle", 50.0,
        "https://mountainofink.com/blog/robert-oster-fire-and-ice", "Heavy Red Sheen",
    ),
    "waterman_mysterious_blue": (
        "Waterman", "Mysterious Blue", "Blue", "#1e3a5f", "bottle", 50.0,
        "https://mountainofink.com/blog/waterman-mysterious-blue", "Blue-Teal Shading",
    ),
    "krishna_thulsi": ("Krishna", "Thulsi", "Green", "#15803d", "bottle", 20.0, "", "Herbal Green"),
    "pr_electric_dc_blue": (
        "Private Reserve", "Electric DC Blue", "Blue", "#1e3a8a", "bottle", 66.0,
        "https://mountainofink.com/blog/private-reserve-electric-dc-blue", "Red Sheen",
    ),
    "iro_fuyu_gaki": (
        "Pilot Iroshizuku", "Fuyu-gaki", "Orange", "#e11d48", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-fuyu-gaki", "Persimmon Red-Orange",
    ),
    "pelikan_royal_blue": (
        "Pelikan", "4001 Royal Blue", "Blue", "#2563eb", "bottle", 62.5,
        "https://mountainofink.com/blog/pelikan-4001-royal-blue", "Dry, Washable",
    ),
    "diamine_marine": (
        "Diamine", "Marine", "Teal", "#0d9488", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-marine", "Turquoise-Teal Shading",
    ),
    "iro_chiku_rin": (
        "Pilot Iroshizuku", "Chiku-rin", "Green", "#65a30d", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-chiku-rin", "Bamboo Green",
    ),
    "pr_ebony_green": (
        "Private Reserve", "Ebony Green", "Green", "#14532d", "bottle", 66.0,
        "https://mountainofink.com/blog/private-reserve-ebony-green", "Deep Forest",
    ),
    "pelikan_violet": (
        "Pelikan", "4001 Violet", "Purple", "#7e22ce", "bottle", 62.5,
        "https://mountainofink.com/blog/pelikan-4001-violet", "Dry Flow",
    ),
    "krishna_ghat_green": (
        "Krishna", "Ghat Green", "Green", "#166534", "bottle", 20.0,
        "https://mountainofink.com/blog/krishna-ghat-green", "Shading",
    ),
    "iro_ku_jaku": (
        "Pilot Iroshizuku", "Ku-jaku", "Teal", "#0f766e", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-ku-jaku", "Peacock Teal",
    ),
    "bril_turquoise": ("Bril", "Turquoise Blue", "Blue", "#0284c7", "bottle", 60.0, "", ""),
    "camlin_royal_blue": ("Camlin", "Kokuyo Royal Blue", "Blue", "#1d4ed8", "bottle", 60.0, "", ""),
    "pelikan_brilliant_red": (
        "Pelikan", "4001 Brilliant Red", "Red", "#dc2626", "bottle", 62.5,
        "https://mountainofink.com/blog/pelikan-4001-brilliant-red", "Warm Coral-Red",
    ),
    "diamine_ancient_copper": (
        "Diamine", "Ancient Copper", "Brown", "#9a3412", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-ancient-copper", "Copper Shading",
    ),
    "pr_american_blue": (
        "Private Reserve", "American Blue", "Blue", "#1e40af", "bottle", 66.0,
        "https://mountainofink.com/blog/private-reserve-american-blue", "Rich Cobalt",
    ),
    "edelstein_star_ruby": (
        "Pelikan Edelstein", "Star Ruby", "Pink", "#be123c", "bottle", 50.0,
        "https://mountainofink.com/blog/pelikan-edelstein-star-ruby", "Ink of the Year",
    ),
    "krishna_bauhinia": ("Krishna", "Bauhinia", "Purple", "#86198f", "bottle", 20.0, "", "Magenta-Violet"),
    "krishna_vaikhari": ("Krishna", "Vaikhari", "Blue", "#1e3a8a", "bottle", 20.0, "", "Saturated"),
    "krishna_iblack4": ("Krishna", "iBlack 4", "Black", "#18181b", "bottle", 30.0, "", "Deep Black"),
    "krishna_sea_and_storm": ("Krishna", "Sea & Storm", "Grey", "#475569", "bottle", 20.0, "", "Stormy Blue-Grey"),
    "krishna_cool_breeze": ("Krishna", "Cool Breeze", "Teal", "#0891b2", "bottle", 20.0, "", ""),
    "iro_ina_ho": (
        "Pilot Iroshizuku", "Ina-ho", "Brown", "#856d28", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-ina-ho", "Discontinued Golden Rice",
    ),
    "herbin_lierre_sauvage": (
        "J. Herbin", "Lierre Sauvage", "Green", "#15803d", "bottle", 30.0,
        "https://mountainofink.com/blog/j-herbin-lierre-sauvage", "Wild Ivy Green",
    ),
    "dominant_glacier": (
        "Dominant Industry", "Glacier", "Blue", "#38bdf8", "bottle", 25.0,
        "https://mountainofink.com/blog/dominant-industry-glacier", "Pearl Shimmer",
    ),
    "pr_spearmint": (
        "Private Reserve", "Spearmint", "Green", "#059669", "bottle", 66.0, "", "Emerald Green",
    ),
    "diamine_hope_pink": (
        "Diamine", "Hope Pink", "Pink", "#ec4899", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-hope-pink", "Bright Pink",
    ),
    "diamine_blue_velvet": (
        "Diamine", "Blue Velvet", "Blue", "#1d4ed8", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-blue-velvet", "150th Anniversary, Sheen",
    ),
    "platinum_carbon_black": (
        "Platinum", "Carbon Black", "Black", "#111827", "bottle", 60.0,
        "https://mountainofink.com/blog/platinum-carbon-black", "Pigment, Waterproof",
    ),
    "daytone_violet": ("Daytone", "Extra Fine Violet", "Purple", "#7c3aed", "bottle", 60.0, "", ""),
    "kwz_grapefruit": (
        "KWZ", "Grapefruit", "Orange", "#ef4444", "bottle", 60.0,
        "https://mountainofink.com/blog/kwz-grapefruit", "Vibrant Coral-Red",
    ),
    "mb_naruto_orange": (
        "Montblanc", "Naruto Uzumaki Orange", "Orange", "#ea580c", "bottle", 50.0, "", "Special Edition",
    ),
    "edelstein_rose_quartz": (
        "Pelikan Edelstein", "Rose Quartz", "Pink", "#db2777", "bottle", 50.0,
        "https://mountainofink.com/blog/pelikan-edelstein-rose-quartz", "Soft Dusty Rose",
    ),
    "diamine_merlot": (
        "Diamine", "Merlot", "Red", "#7f1d1d", "sample_vial", 4.0,
        "https://mountainofink.com/blog/diamine-merlot", "Wine Burgundy",
    ),
    "iro_momiji": (
        "Pilot Iroshizuku", "Momiji", "Red", "#e11d48", "bottle", 50.0,
        "https://mountainofink.com/blog/pilot-iroshizuku-momiji", "Autumn Maple, Gold Sheen",
    ),
    "ro_torquay": (
        "Robert Oster", "Torquay", "Teal", "#0284c7", "bottle", 50.0,
        "https://mountainofink.com/blog/robert-oster-torquay", "Shading",
    ),
    "diamine_green_black": (
        "Diamine", "Green/Black", "Green", "#14532d", "bottle", 80.0,
        "https://mountainofink.com/blog/diamine-green-black", "Dark Pine",
    ),
    "lamy_dark_lilac": (
        "Lamy", "Dark Lilac", "Purple", "#581c87", "bottle", 50.0,
        "https://mountainofink.com/blog/lamy-dark-lilac", "Green-Gold Sheen",
    ),
    "diamine_winter_spice": (
        "Diamine", "Winter Spice", "Brown", "#451a03", "bottle", 50.0,
        "https://mountainofink.com/blog/diamine-winter-spice", "Inkvent Shimmer & Green Sheen",
    ),
    "krishna_verdure_green": ("Krishna", "Verdure Green", "Green", "#16a34a", "bottle", 20.0, "", ""),
    "edelstein_golden_lapis": (
        "Pelikan Edelstein", "Golden Lapis", "Blue", "#1d4ed8", "bottle", 50.0,
        "https://mountainofink.com/blog/pelikan-edelstein-golden-lapis", "Gold Shimmer",
    ),
    "endless_drops_of_mars": ("Endless Alchemy", "Drops of Mars", "Red", "#991b1b", "bottle", 45.0, "", ""),
    "pr_chocolat": (
        "Private Reserve", "Chocolat", "Brown", "#5c3317", "bottle", 66.0,
        "https://mountainofink.com/blog/private-reserve-chocolat", "Warm Cocoa",
    ),
    "krishna_uni_mumbai": ("Krishna", "University of Mumbai", "Blue", "#1e40af", "sample_vial", 4.0, "", "Commemorative"),
    "herbin_parfum_pomme": ("J. Herbin", "Parfum Vert Pomme", "Green", "#22c55e", "bottle", 30.0, "", "Scented Apple"),
    "endless_wizards_pencil": ("Endless Alchemy", "Wizard's Pencil", "Grey", "#52525b", "sample_vial", 4.0, "", "Graphite Grey"),
    "endless_mystic_forest": ("Endless Alchemy", "Mystic Forest", "Green", "#14532d", "sample_vial", 4.0, "", "Deep Forest"),
    "endless_cs_ink": ("Endless Alchemy", "Candy Sea / CS Edition", "Teal", "#0d9488", "bottle", 45.0, "", ""),
}

# (page, side, y_top, y_bot, date_iso, pen_key, ink_key, raw_label, notes, is_active)
JOURNAL_ENTRIES: list[tuple[int, str, float, float, str, str, str, str, str, bool]] = [
    # --- Spread 2 (Right: 10th Nov 2018 initial currently inked inventory) ---
    (2, "R", 0.04, 0.25, "2018-11-10", "asa_azaadi", "diamine_deep_magenta", "ASA Azaadi in ancient gold acrylic · Diamine Deep Magenta", "Initial Ink Log inventory", False),
    (2, "R", 0.25, 0.40, "2018-11-10", "ranga_bamboo_gy", "diamine_jade_green", "Ranga green-yellow bamboo · Diamine Jade Green", "", False),
    (2, "R", 0.40, 0.55, "2018-11-10", "ranga_sugarcane", "noodlers_apache_sunset", "Ranga Sugarcane teal-red ebonite · Noodler's Apache Sunset", "", False),
    (2, "R", 0.55, 0.70, "2018-11-10", "fosfor_kop_ebonite", "kwz_ig_turquoise", "Fosfor KOP in woodgrain ebonite · KWZ IG Turquoise", "", False),
    (2, "R", 0.70, 0.84, "2018-11-10", "fosfor_kop_dartmoor", "kwz_honey", "Fosfor KOP in dartmoor acrylic · KWZ Honey", "", False),
    (2, "R", 0.84, 0.98, "2018-11-10", "ranga_m8_black", "noodlers_baystate_blue", "Ranga model 8 in matte black · Noodler's Bay State Blue", "", False),

    # --- Spread 3 (Left & Right: 10th Nov 2018 continued) ---
    (3, "L", 0.01, 0.18, "2018-11-10", "krishna_nova_green", "waterman_green", "Krishna Nova Green ebonite · Waterman Green", "", False),
    (3, "L", 0.19, 0.34, "2018-11-10", "krishna_lyrebird_52", "kwz_ig_mandarin", "Krishna lyrebird 52 · KWZ IG Mandarin", "", False),
    (3, "L", 0.34, 0.49, "2018-11-10", "ranga_m8_orange", "diamine_sunset", "Ranga model 8 in orange ebonite · Diamine Sunset", "", False),
    (3, "L", 0.49, 0.59, "2018-11-10", "lamy_2000", "diamine_oxblood", "Lamy 2000 · Diamine Oxblood", "", False),
    (3, "L", 0.59, 0.69, "2018-11-10", "asa_athlete", "camlin_black", "Asa Athlete · Camlin black", "", False),
    (3, "L", 0.69, 0.84, "2018-11-10", "twsbi_540_clear", "pr_plum", "TWSBI 540 Transparent · Private Reserve Plum", "", False),
    (3, "L", 0.84, 0.99, "2018-11-10", "ranga_m4c_demo", "krishna_monsoon_sky", "Ranga model 4C demonstrator · Krishna Monsoon sky", "", False),
    (3, "R", 0.03, 0.18, "2018-11-10", "lotus_vikrant_blue", "iro_asa_gao", "Lotus Vikrant in blue mono acrylic · Pilot Iroshizuku Asa Gao", "", False),
    (3, "R", 0.18, 0.33, "2018-11-10", "lotus_vikrant_red", "diamine_wild_strawberry", "Lotus Vikrant in red mono acrylic · Diamine wild strawberry", "", False),
    (3, "R", 0.33, 0.48, "2018-11-10", "pilot_vp_yellow", "diamine_turquoise", "Pilot Vanishing point Canary Yellow · Diamine Turquoise", "", False),
    (3, "R", 0.48, 0.62, "2018-11-10", "pilot_vp_blue", "diamine_sargasso_sea", "Pilot Vanishing point Blue Matte · Diamine Sargasso Sea", "", False),
    (3, "R", 0.62, 0.77, "2018-11-10", "asa_maya_black", "noodlers_black", "Asa maya in black ebonite · Noodler's black", "", False),
    (3, "R", 0.77, 0.94, "2018-11-10", "ranga_m5_red", "daytone_red", "Ranga model 5 - Red ebonite · Daytone red", "", False),

    # --- Spread 4 ---
    (4, "L", 0.02, 0.16, "2018-11-10", "sailor_1911", "diamine_sargasso_sea", "Sailor 1911 · Diamine Sargasso Sea", "", False),
    (4, "L", 0.16, 0.32, "2018-11-10", "gama_sneaky_bt", "herbin_emerald_chivor", "Gama Sneaky - blue teal swirl · J Herbin emerald of Chivor", "", False),
    (4, "R", 0.02, 0.19, "2018-11-15", "pilot_falcon", "herbin_rouge_hematite", "Pilot Falcon · J. Herbin Rouge Hematite", "", False),
    (4, "R", 0.20, 0.38, "2018-11-16", "pilot_metro_lizard", "noodlers_54th_mass", "Pilot Metropolitan Lizard · Noodler's 54th Massachusetts", "", False),
    (4, "R", 0.38, 0.52, "2018-11-26", "lamy_2000", "diamine_oxblood", "Lamy 2000 · Diamine Oxblood", "", False),
    (4, "R", 0.52, 0.71, "2018-11-27", "pilot_vp_blue", "diamine_sargasso_sea", "Pilot Vanishing Point Blue Matte · Diamine Sargasso Sea", "", False),
    (4, "R", 0.71, 0.91, "2018-12-04", "wality_small_grey", "krishna_ochre", "Wality - Small grey demonstrator · Krishna Ochre", "", False),

    # --- Spread 5 ---
    (5, "L", 0.01, 0.24, "2018-12-06", "wality_big_green", "noodlers_libertys_elysium", "Wality - Big demonstrator Green · Noodler's Liberty's Elysium", "", False),
    (5, "L", 0.25, 0.44, "2018-12-07", "pilot_vp_yellow", "diamine_turquoise", "Pilot Vanishing Point Canary Yellow · Diamine Turquoise", "", False),
    (5, "L", 0.44, 0.63, "2018-12-12", "twsbi_540_clear", "diamine_eclipse", "TWSBI 540 Transparent · Diamine Eclipse", "", False),
    (5, "L", 0.63, 0.82, "2018-12-12", "lotus_shikhar_honeydew", "kwz_ig_aztec_gold", "Lotus Shikhar in Honey Dew · KWZ IG Aztec Gold", "", False),
    (5, "L", 0.82, 0.99, "2018-12-16", "ranga_m8b_redblack", "akkerman_bekakt_haags", "Ranga Model 8B - Red Black · Akkerman Bekakt Haags", "", False),
    (5, "R", 0.03, 0.23, "2018-12-17", "asa_mist_clear", "rk_salix", "ASA mist - Clear Acrylic · R&K Salix", "", False),
    (5, "R", 0.23, 0.38, "2018-12-22", "ranga_m4c_bluepink", "bril_green", "Ranga model 4C - Blue-Pink · Bril Green", "", False),
    (5, "R", 0.38, 0.55, "2018-12-22", "asa_transnauka", "diamine_meadow", "ASA Transnauka · Diamine Meadow", "", False),
    (5, "R", 0.55, 0.77, "2019-01-06", "pilot_vp_blue", "iro_kon_peki", "Pilot Vanishing Point Blue Matte · Pilot Iroshizuku Kon-peki", "", False),

    # --- Spread 6 ---
    (6, "L", 0.02, 0.14, "2019-01-26", "pilot_falcon", "diamine_matador", "Pilot Falcon · Diamine Matador", "", False),
    (6, "L", 0.14, 0.25, "2019-01-26", "pilot_metro_lizard", "sheaffer_skrip_black", "Pilot Metropolitan Lizard · Sheaffer Skrip Black", "", False),
    (6, "L", 0.25, 0.35, "2019-01-26", "pelikan_m200", "diamine_meadow", "Pelikan M200 · Diamine Meadow", "", False),
    (6, "L", 0.35, 0.45, "2019-01-26", "lamy_2000", "akkerman_bekakt_haags", "Lamy 2000 · Akkerman Bekakt Haags", "", False),
    (6, "L", 0.45, 0.54, "2019-01-26", "pilot_vp_blue", "diamine_turquoise", "Pilot VP Blue Matte · Diamine Turquoise", "", False),
    (6, "L", 0.54, 0.66, "2019-01-26", "pilot_vp_yellow", "diamine_sunset", "Pilot VP Canary Yellow · Diamine Sunset", "", False),
    (6, "R", 0.03, 0.25, "2019-02-25", "deccan_advocate_ebonite", "ro_peppermint", "Deccan Advocate Ebonite · Robert Oster Peppermint", "Sample", False),
    (6, "R", 0.25, 0.44, "2019-02-26", "asa_transnauka_blue", "herbin_eclat_saphir", "ASA transnauka blue acrylic · J. Herbin Eclat de Saphir", "", False),
    (6, "R", 0.44, 0.63, "2019-03-07", "fosfor_tikona", "pr_orange_crush", "Fosfor Tikona · Private Reserve Orange Crush", "", False),
    (6, "R", 0.63, 0.82, "2019-03-07", "asa_mist_clear", "rk_salix", "ASA Mist Clear Acrylic · R&K Salix", "Refill", False),
    (6, "R", 0.82, 0.98, "2019-03-28", "hero_616_red", "camlin_blue", "Hero 616 Red · Camlin Blue", "", False),

    # --- Spread 7 ---
    (7, "L", 0.02, 0.25, "2019-04-08", "lotus_custom_by", "iro_asa_gao", "Lotus custom pen - blue with yellow swirl · Iroshizuku Asa-gao", "", False),
    (7, "L", 0.25, 0.40, "2019-04-08", "lotus_vikrant_lava", "diamine_majestic_purple", "Lotus Vikrant Lava swirl · Diamine Majestic Purple", "", False),
    (7, "L", 0.40, 0.61, "2019-04-10", "lotus_shikhar_honeydew", "diamine_ochre", "Lotus Shikhar Honey Dew · Diamine Ochre", "", False),
    (7, "L", 0.61, 0.81, "2019-04-24", "kaweco_sport", "noodlers_54th_mass", "Kaweco Sport · Noodler's 54th Massachusetts", "", False),
    (7, "L", 0.81, 0.99, "2019-04-28", "lotus_shikhar_honeydew", "diamine_ochre", "Lotus Shikhar Honey Dew · Diamine Ochre", "", False),
    (7, "R", 0.02, 0.26, "2019-05-30", "pilot_vp_yellow", "noodlers_bsar", "Pilot VP Canary Yellow · Noodler's Black Swan in Australian Roses", "", False),
    (7, "R", 0.27, 0.47, "2019-06-03", "pilot_vp_blue", "diamine_sargasso_sea", "Pilot VP Blue Matte · Diamine Sargasso Sea", "", False),
    (7, "R", 0.48, 0.68, "2019-06-12", "twsbi_vac700", "diamine_jade_green", "TWSBI VAC 700 Smoke Grey · Diamine Jade Green", "", False),
    (7, "R", 0.68, 0.91, "2019-06-25", "gama_sneaky_tb", "lamy_turquoise", "Gama Sneaky Teal brown swirl · Lamy Turquoise", "", False),

    # --- Spread 8 ---
    (8, "L", 0.01, 0.19, "2019-07-09", "pilot_metro_silver", "diamine_majestic_purple", "Pilot metropolitan Steel · Diamine Majestic Purple", "", False),
    (8, "L", 0.19, 0.35, "2019-07-09", "asa_athlete", "kwz_ig_mandarin", "ASA Athlete · KWZ IG Mandarin", "", False),
    (8, "L", 0.36, 0.56, "2019-07-11", "guider_egg_red", "krishna_jungle_volcano", "Guider egg red swirl acrylic · Krishna Jungle Volcano", "", False),
    (8, "L", 0.56, 0.78, "2019-08-08", "pilot_metro_black", "sheaffer_skrip_black", "Pilot Metropolitan Black · Sheaffer Skrip Black", "", False),
    (8, "L", 0.78, 0.99, "2019-08-18", "pilot_vp_yellow", "noodlers_bsar", "Pilot VP Canary Yellow · Noodler's Black Swan in Australian Roses", "", False),
    (8, "R", 0.01, 0.18, "2019-08-18", "pilot_vp_blue", "diamine_sargasso_sea", "Pilot VP Blue Matte · Diamine Sargasso Sea", "", False),
    (8, "R", 0.18, 0.42, "2019-09-10", "asa_azaadi", "ro_fire_and_ice", "ASA azaadi with Visconti nib · Robert Oster Fire & Ice", "", False),
    (8, "R", 0.42, 0.71, "2019-09-12", "asa_nauka_black", "waterman_mysterious_blue", "ASA nauka black ebonite · Waterman Mysterious Blue", "", False),
    (8, "R", 0.71, 0.99, "2019-09-29", "ranga_m8_black", "noodlers_baystate_blue", "Ranga Model 8 Matte Black · Noodler's Baystate Blue", "", False),

    # --- Spread 9 ---
    (9, "L", 0.01, 0.25, "2019-09-30", "kanwrite_desire_demo", "krishna_thulsi", "Kanwrite Desire Demo with B nib · Krishna Thulsi", "", False),
    (9, "L", 0.25, 0.44, "2019-09-30", "guider_brown", "akkerman_bekakt_haags", "Guider brown acrylic pen · Akkerman Bekakt Haags", "", False),
    (9, "L", 0.44, 0.62, "2019-09-30", "ratnamson_302_brown", "pr_electric_dc_blue", "Ratnamson 302 Brown · Private Reserve Electric DC Blue", "", False),
    (9, "L", 0.62, 0.88, "2019-10-29", "kanwrite_desire_blue_stub", "diamine_turquoise", "Kanwrite Desire Blue with Stub nib · Diamine Turquoise", "", False),
    (9, "R", 0.02, 0.23, "2019-10-29", "kanwrite_desire_black", "sheaffer_skrip_black", "Kanwrite Desire - Solid black - 'M' · Sheaffer Skrip Black", "", False),
    (9, "R", 0.24, 0.44, "2019-11-18", "jinhao_9035", "herbin_rouge_hematite", "Jinhao 9035 - redish wooden · J. Herbin Rouge Hematite", "", False),
    (9, "R", 0.45, 0.64, "2019-12-21", "pilot_vp_yellow", "iro_fuyu_gaki", "Pilot capless Canary Yellow · Pilot Iroshizuku Fuyu-gaki", "", False),
    (9, "R", 0.64, 0.80, "2019-12-21", "pilot_vp_blue", "iro_kon_peki", "Pilot VP Matte Blue · Pilot Iroshizuku Kon-peki", "", False),
    (9, "R", 0.80, 0.99, "2020-01-07", "pilot_ch91", "ro_fire_and_ice", "Pilot Custom Heritage 91 · Robert Oster Fire & Ice", "", False),

    # --- Spread 10 ---
    (10, "L", 0.02, 0.24, "2020-01-28", "asa_nauka_blue", "noodlers_54th_mass", "ASA nauka in translucent blue · Noodler's 54th Massachusetts", "", False),
    (10, "L", 0.25, 0.44, "2020-02-26", "lotus_vikrant_red", "iro_fuyu_gaki", "Lotus Vikrant Red · Pilot Iroshizuku Fuyu-gaki", "", False),
    (10, "L", 0.44, 0.59, "2020-02-26", "lotus_vikrant_blue", "pelikan_royal_blue", "Lotus Vikrant Blue · Pelikan 4001 Royal Blue", "", False),
    (10, "L", 0.60, 0.80, "2020-02-27", "pilot_vp_yellow", "diamine_deep_magenta", "Pilot VP canary yellow · Diamine Deep Magenta", "", False),
    (10, "L", 0.80, 0.98, "2020-02-27", "pilot_vp_blue", "diamine_marine", "Pilot VP Blue · Diamine Marine", "", False),
    (10, "R", 0.02, 0.24, "2020-03-11", "asa_titanium_bw", "pr_orange_crush", "ASA Titanium in Blue & white · Private Reserve Orange Crush", "", False),
    (10, "R", 0.25, 0.49, "2020-03-19", "kanwrite_desire_blue_stub", "diamine_turquoise", "Kanwrite Blue with stub nib · Diamine Turquoise", "", False),
    (10, "R", 0.49, 0.66, "2020-03-19", "kanwrite_desire_black", "sheaffer_skrip_black", "Kanwrite Desire Solid Black · Sheaffer Skrip Black", "", False),
    (10, "R", 0.68, 0.96, "2020-03-25", "sailor_1911", "iro_chiku_rin", "Sailor 1911 · Pilot Iroshizuku Chiku-rin", "", False),

    # --- Spread 11 ---
    (11, "L", 0.02, 0.30, "2020-03-25", "asa_nauka_blue", "noodlers_54th_mass", "ASA Nauka Translucent Blue · Noodler's 54th Massachusetts", "", False),
    (11, "L", 0.31, 0.52, "2020-03-30", "kaweco_sport_blue", "pr_ebony_green", "Kaweco Sports - Blue B nib · Private Reserve Ebony Green", "", False),
    (11, "L", 0.52, 0.73, "2020-03-30", "ranga_m5_kanwrite_b", "kwz_ig_turquoise", "Ranga Model 5 with Kanwrite B nib · KWZ IG Turquoise", "", False),
    (11, "L", 0.73, 0.96, "2020-04-22", "kanwrite_desire_demo", "krishna_thulsi", "Kanwrite Desire Demo B nib · Krishna Thulsi", "", False),
    (11, "R", 0.02, 0.28, "2020-05-07", "krishna_lyrebird_52", "pelikan_violet", "Krishna Lyrebird 52 brown swirl · Pelikan 4001 Violet", "", False),
    (11, "R", 0.28, 0.53, "2020-05-10", "lamy_2000", "diamine_jade_green", "Lamy 2000 · Diamine Jade Green", "", False),
    (11, "R", 0.53, 0.85, "2020-05-19", "kanwrite_desire_blue_stub", "diamine_turquoise", "Kanwrite Desire Stub nib Blue translucent · Diamine Turquoise", "", False),

    # --- Spread 12 ---
    (12, "L", 0.03, 0.23, "2020-06-14", "ranga_m8_orange", "camlin_black", "Ranga Model 8 Orange Ebonite · Camlin Black", "", False),
    (12, "L", 0.24, 0.42, "2020-06-15", "deccan_advocate_olive", "krishna_ghat_green", "Deccan advocate olive green · Krishna Ghat Green", "", False),
    (12, "L", 0.42, 0.58, "2020-06-15", "gama_kuyil", "pr_plum", "Gama Kuyil - Kanwrite nib · Private Reserve Plum", "", False),
    (12, "L", 0.59, 0.97, "2020-06-24", "asa_azaadi", "noodlers_bsar", "ASA Aazaadi in Antique Gold Acrylic · Noodler's Black Swan in Australian Roses", "", False),
    (12, "R", 0.02, 0.26, "2020-06-25", "guider_brown", "akkerman_bekakt_haags", "Guider Brown Acrylic · Akkerman Bekakt Haags", "", False),
    (12, "R", 0.28, 0.51, "2020-07-07", "asa_maya_black", "iro_ku_jaku", "ASA Maya Black Ebonite · Pilot Iroshizuku Ku-jaku", "", False),
    (12, "R", 0.51, 0.73, "2020-07-07", "asa_maya_brown", "noodlers_libertys_elysium", "ASA maya brown Ebonite · Noodler's Liberty's Elysium", "", False),
    (12, "R", 0.74, 0.98, "2020-07-21", "ranga_m4c_demo", "bril_turquoise", "Ranga model 4C demonstrator - Kanwrite Stub nib · Bril Turquoise", "", False),

    # --- Spread 13 ---
    (13, "L", 0.01, 0.18, "2020-08-24", "oliver_21", "camlin_royal_blue", "Oliver 21 · Camlin Royal Blue", "", False),
    (13, "L", 0.18, 0.42, "2020-08-24", "asa_titanium", "pelikan_brilliant_red", "ASA Titanium · Pelikan 4001 Brilliant Red", "", False),
    (13, "L", 0.42, 0.64, "2020-09-07", "ranga_m8b_redblack", "diamine_ancient_copper", "Ranga Model 8B Red-Black · Diamine Ancient Copper", "", False),
    (13, "L", 0.65, 0.96, "2020-09-10", "twsbi_540_amber", "diamine_deep_magenta", "TWSBI Diamond 540 Amber · Diamine Deep Magenta", "", False),
    (13, "R", 0.01, 0.22, "2020-09-16", "kanwrite_desire_demo", "diamine_eclipse", "Kanwrite Desire Demo · Diamine Eclipse", "", False),
    (13, "R", 0.22, 0.42, "2020-09-17", "ranga_zeal", "iro_asa_gao", "Ranga Zeal blue & demo · Pilot Iroshizuku Asa-gao", "", False),
    (13, "R", 0.42, 0.62, "2020-10-04", "lamy_2000", "waterman_mysterious_blue", "Lamy 2000 · Waterman Mysterious Blue", "", False),
    (13, "R", 0.63, 0.86, "2020-10-27", "lotus_shikhar_lava", "krishna_jungle_volcano", "Lotus Shikhar Lava acrylic · Krishna Jungle Volcano", "", False),

    # --- Spread 14 ---
    (14, "L", 0.16, 0.26, "2021-08-03", "lamy_safari_blue", "pr_american_blue", "Lamy Safari Blue · Private Reserve American Blue", "Post-lockdown / MUPA batch", False),
    (14, "L", 0.26, 0.32, "2021-08-03", "lamy_safari_red", "edelstein_star_ruby", "Lamy Safari Red · Pelikan Edelstein Star Ruby", "", False),
    (14, "L", 0.32, 0.39, "2021-08-03", "lamy_safari_yellow", "krishna_bauhinia", "Lamy Safari Yellow · Krishna Bauhinia", "", False),
    (14, "L", 0.39, 0.46, "2021-08-03", "asa_durga", "krishna_thulsi", "ASA Durga · Krishna Thulsi", "", False),
    (14, "L", 0.46, 0.54, "2021-08-03", "lamy_2000", "krishna_vaikhari", "Lamy 2000 · Krishna Vaikhari", "", False),
    (14, "L", 0.54, 0.60, "2021-08-03", "vazir_black", "krishna_iblack4", "Vazir Black · Krishna iBlack 4", "", False),
    (14, "L", 0.60, 0.67, "2021-08-03", "twsbi_540_amber", "krishna_sea_and_storm", "TWSBI 540 Amber · Krishna Sea & Storm", "", False),
    (14, "L", 0.67, 0.78, "2021-08-03", "ranga_m8b_redblack", "akkerman_bekakt_haags", "Ranga Model 8B Red-Black · Akkerman Bekakt Haags", "", False),
    (14, "R", 0.01, 0.22, "2021-08-03", "lotus_vikrant_lava", "diamine_sargasso_sea", "Lotus Vikrant Lava · Diamine Sargasso Sea", "", False),
    (14, "R", 0.22, 0.42, "2021-08-10", "lamy_safari_mango", "krishna_bauhinia", "Lamy Safari Mango · Krishna Bauhinia", "", False),
    (14, "R", 0.42, 0.63, "2021-09-17", "lamy_safari_red", "edelstein_star_ruby", "Lamy Safari Red · Pelikan Edelstein Star Ruby", "", False),
    (14, "R", 0.64, 0.82, "2021-09-21", "vazir_black", "krishna_iblack4", "Vazir Black · Krishna iBlack 4", "", False),
    (14, "R", 0.83, 0.99, "2021-09-24", "kanwrite_desire_demo", "krishna_cool_breeze", "Kanwrite Desire Demo · Krishna Cool Breeze", "", False),

    # --- Spread 15 ---
    (15, "L", 0.01, 0.18, "2021-12-05", "kanwrite_heritage_flex", "diamine_sunset", "Kanwrite Heritage Flex · Diamine Sunset", "", False),
    (15, "L", 0.19, 0.41, "2021-12-06", "lamy_safari_blue", "pr_american_blue", "Lamy Safari Blue · Private Reserve American Blue", "", False),
    (15, "L", 0.43, 0.66, "2022-01-06", "pilot_vp_blue", "ro_fire_and_ice", "Pilot VP Blue · Robert Oster Fire & Ice", "", False),
    (15, "L", 0.67, 0.97, "2022-01-09", "ranga_bamboo_gbb", "pr_orange_crush", "Ranga Bamboo Green-Blue-Black Ebonite · Private Reserve Orange Crush", "", False),
    (15, "R", 0.01, 0.21, "2022-01-10", "sheaffer_gift_100_red", "pr_electric_dc_blue", "Sheaffer 100 Red · Private Reserve Electric DC Blue", "", False),
    (15, "R", 0.21, 0.44, "2022-01-13", "guider_green", "herbin_emerald_chivor", "Guider Green Acrylic · J. Herbin Emerald of Chivor", "", False),
    (15, "R", 0.45, 0.62, "2022-01-13", "guider_red_capsule", "herbin_rouge_hematite", "Guider Red Acrylic Capsule · J. Herbin Rouge Hematite", "", False),
    (15, "R", 0.64, 0.97, "2022-01-19", "gama_sneaky_khaki", "diamine_marine", "Gama Sneaky Khaki Green Ebonite Swirls · Diamine Marine", "", False),

    # --- Spread 16 ---
    (16, "L", 0.01, 0.21, "2022-01-25", "pilot_ch91", "noodlers_apache_sunset", "Pilot Custom Heritage 91 · Noodler's Apache Sunset", "", False),
    (16, "L", 0.23, 0.46, "2022-02-05", "lamy_2000", "diamine_oxblood", "Lamy 2000 · Diamine Oxblood", "", False),
    (16, "L", 0.47, 0.97, "2022-02-10", "fosfor_kop_dartmoor", "noodlers_bsar", "Fosfor KOP Dartmoor Acrylic · Noodler's Black Swan in Australian Roses", "Unshaken filling", False),
    (16, "R", 0.01, 0.23, "2022-02-18", "deccan_small_black", "camlin_black", "Deccan small black ebonite · Camlin Black", "", False),
    (16, "R", 0.23, 0.44, "2022-02-18", "wality_big_green", "noodlers_baystate_blue", "Wality Big Green Demonstrator · Noodler's Baystate Blue", "", False),
    (16, "R", 0.44, 0.67, "2022-02-25", "kanwrite_desire_blue_stub", "kwz_ig_aztec_gold", "Kanwrite Desire Blue Stub · KWZ IG Aztec Gold", "", False),
    (16, "R", 0.68, 0.97, "2022-03-10", "asa_nauka_green", "iro_chiku_rin", "ASA Nauka - translucent green · Pilot Iroshizuku Chiku-rin", "", False),

    # --- Spread 17 ---
    (17, "L", 0.03, 0.29, "2022-03-27", "lamy_safari_blue", "pr_american_blue", "Lamy Safari Blue · Private Reserve American Blue", "Refill", False),
    (17, "L", 0.29, 0.48, "2022-03-27", "guider_red_capsule", "herbin_rouge_hematite", "Guider Red Capsule · J. Herbin Rouge Hematite", "Refill", False),
    (17, "L", 0.49, 0.73, "2022-03-31", "kanwrite_heritage_8b", "iro_ina_ho", "Kanwrite Heritage 8B · Pilot Iroshizuku Ina-ho", "", False),
    (17, "L", 0.74, 0.99, "2022-04-01", "kanwrite_heritage_white", "diamine_majestic_purple", "Kanwrite Heritage White B nib · Diamine Majestic Purple", "", False),
    (17, "R", 0.02, 0.29, "2022-04-08", "kanwrite_heritage_blue", "diamine_marine", "Kanwrite Heritage Blue Swirl · Diamine Marine", "", False),
    (17, "R", 0.30, 0.52, "2022-04-08", "pilot_metro_silver", "herbin_lierre_sauvage", "Pilot Metropolitan Silver · J. Herbin Lierre Sauvage", "", False),
    (17, "R", 0.56, 0.82, "2022-06-01", "kanwrite_desire_demo", "pelikan_brilliant_red", "Kanwrite Desire Demo · Pelikan 4001 Brilliant Red", "", False),

    # --- Spread 18 ---
    (18, "L", 0.01, 0.22, "2022-06-02", "kanwrite_desire_black", "sheaffer_skrip_black", "Kanwrite Desire Black · Sheaffer Skrip Black", "", False),
    (18, "L", 0.24, 0.67, "2022-06-08", "fosfor_kop_dartmoor", "noodlers_bsar", "Fosfor KOP Dartmoor Acrylic · Noodler's Black Swan in Australian Roses", "Shaken before filling", False),
    (18, "L", 0.68, 0.96, "2022-06-14", "pilot_vp_yellow", "diamine_marine", "Pilot VP Yellow · Diamine Marine", "", False),
    (18, "R", 0.02, 0.27, "2022-06-28", "lamy_safari_red", "edelstein_star_ruby", "Lamy Safari Red · Pelikan Edelstein Star Ruby", "", False),
    (18, "R", 0.27, 0.48, "2022-07-07", "kanwrite_heritage_brown", "iro_ina_ho", "Kanwrite Heritage Brown · Pilot Iroshizuku Ina-ho", "", False),
    (18, "R", 0.49, 0.77, "2022-07-07", "kanwrite_desire_blue_stub", "noodlers_libertys_elysium", "Kanwrite Desire Blue Stub · Noodler's Liberty's Elysium", "", False),

    # --- Spread 19 ---
    (19, "L", 0.01, 0.29, "2022-07-18", "asa_bhishma", "kwz_honey", "ASA Bhishma purple lava alumilite acrylic · KWZ Honey", "", False),
    (19, "L", 0.30, 0.49, "2022-07-25", "kanwrite_desire_demo", "krishna_ghat_green", "Kanwrite Desire Demo · Krishna Ghat Green", "", False),
    (19, "L", 0.50, 0.72, "2022-08-10", "ranga_m8_orange", "rk_salix", "Ranga Model 8 Orange Ebonite · R&K Salix", "", False),
    (19, "L", 0.73, 0.97, "2022-08-17", "sailor_1911", "sheaffer_skrip_black", "Sailor 1911 · Sheaffer Skrip Black", "", False),
    (19, "R", 0.03, 0.26, "2022-08-23", "pilot_vp_blue", "iro_asa_gao", "Pilot vanishing point Blue · Pilot Iroshizuku Asa-gao", "", False),
    (19, "R", 0.27, 0.47, "2022-09-26", "guider_brown", "kwz_ig_mandarin", "Guider Brown Acrylic · KWZ IG Mandarin", "", False),
    (19, "R", 0.48, 0.68, "2022-10-18", "pilot_vp_blue", "iro_asa_gao", "Pilot VP Blue · Pilot Iroshizuku Asa-gao", "", False),
    (19, "R", 0.68, 0.86, "2022-10-30", "lotus_vikrant_lava", "krishna_thulsi", "Lotus Vikrant Lava · Krishna Thulsi", "", False),
    (19, "R", 0.86, 0.99, "2022-10-30", "lotus_vikrant_red", "diamine_matador", "Lotus Vikrant Red · Diamine Matador", "", False),

    # --- Spread 20 ---
    (20, "L", 0.01, 0.18, "2022-10-30", "ranga_bamboo_demo", "krishna_bauhinia", "Ranga Bamboo Demo · Krishna Bauhinia", "", False),
    (20, "L", 0.19, 0.38, "2022-11-06", "wality_big_green", "noodlers_baystate_blue", "Wality Big Green Demonstrator · Noodler's Baystate Blue", "", False),
    (20, "L", 0.39, 0.63, "2022-11-07", "asa_titanium", "dominant_glacier", "ASA Titan · Dominant Industry Glacier", "", False),
    (20, "L", 0.63, 0.88, "2022-11-16", "pelikan_m200", "pr_spearmint", "Pelikan M200 · Private Reserve Spearmint", "", False),
    (20, "R", 0.02, 0.22, "2022-11-18", "fosfor_kop_dartmoor", "waterman_mysterious_blue", "Fosfor KOP Dartmoor Acrylic · Waterman Mysterious Blue", "", False),
    (20, "R", 0.22, 0.46, "2022-11-18", "asa_azaadi", "diamine_ancient_copper", "ASA Azaadi · Diamine Ancient Copper", "", False),
    (20, "R", 0.47, 0.76, "2022-12-22", "lamy_2000", "pr_electric_dc_blue", "Lamy 2000 · Private Reserve Electric DC Blue", "", False),

    # --- Spread 21 ---
    (21, "L", 0.01, 0.21, "2023-01-16", "twsbi_540_clear", "diamine_hope_pink", "TWSBI 540 Clear · Diamine Hope Pink", "", False),
    (21, "L", 0.21, 0.36, "2023-01-16", "kanwrite_desire_demo", "noodlers_54th_mass", "Kanwrite Desire Demo · Noodler's 54th Massachusetts", "", False),
    (21, "L", 0.36, 0.58, "2023-01-18", "ranga_zeal", "kwz_ig_turquoise", "Ranga Zeal · KWZ IG Turquoise", "", False),
    (21, "L", 0.59, 0.75, "2023-01-18", "camlin_elegante_blue", "diamine_majestic_purple", "Camlin Elegante Blue · Diamine Majestic Purple", "", False),
    (21, "L", 0.76, 0.98, "2023-01-24", "pilot_metro_lizard", "diamine_blue_velvet", "Pilot Metropolitan Lizard · Diamine Blue Velvet", "", False),
    (21, "R", 0.03, 0.23, "2023-01-30", "vazir_rosegold_black", "platinum_carbon_black", "Vazir rose gold black · Platinum Carbon Black", "", False),
    (21, "R", 0.24, 0.45, "2023-02-08", "ranga_m5_red", "pr_orange_crush", "Ranga Model 5 in Cherry Ebonite · Private Reserve Orange Crush", "", False),
    (21, "R", 0.47, 0.70, "2023-02-12", "lotus_custom_by", "diamine_turquoise", "Lotus Custom Blue-Yellow Swirl · Diamine Turquoise", "", False),
    (21, "R", 0.70, 0.97, "2023-02-12", "twsbi_vac700", "krishna_vaikhari", "TWSBI Vac 700 · Krishna Vaikhari", "Wet nib vs Drier nib comparison", False),

    # --- Spread 22 ---
    (22, "L", 0.01, 0.17, "2023-03-25", "pelikan_m200", "pr_spearmint", "Pelikan M200 · Private Reserve Spearmint", "", False),
    (22, "L", 0.17, 0.40, "2023-03-23", "twsbi_vac700", "krishna_vaikhari", "TWSBI Vac 700 · Krishna Vaikhari", "", False),
    (22, "L", 0.41, 0.62, "2023-05-02", "kanwrite_desire_black", "rk_salix", "Kanwrite Desire Black · R&K Salix", "", False),
    (22, "L", 0.63, 0.95, "2023-05-25", "asa_advocate_black", "daytone_violet", "ASA Advocate black ebonite · Daytone Violet", "", False),
    (22, "R", 0.02, 0.22, "2023-05-28", "ratnam_blue_ebonite", "bril_turquoise", "Ratnam Blue Ebonite · Bril Turquoise", "", False),
    (22, "R", 0.22, 0.42, "2023-06-11", "pilot_vp_blue", "diamine_blue_velvet", "Pilot VP Blue · Diamine Blue Velvet", "", False),
    (22, "R", 0.42, 0.59, "2023-06-11", "pilot_vp_yellow", "diamine_oxblood", "Pilot VP Yellow · Diamine Oxblood", "", False),
    (22, "R", 0.61, 0.96, "2023-06-14", "pilot_falcon", "edelstein_star_ruby", "Pilot Falcon · Pelikan Edelstein Star Ruby", "Flex sample", False),

    # --- Spread 23 ---
    (23, "L", 0.02, 0.24, "2023-07-03", "asa_nauka_black", "diamine_eclipse", "ASA Nauka Black Ebonite · Diamine Eclipse", "", False),
    (23, "L", 0.24, 0.43, "2023-07-07", "asa_elements_blue", "diamine_turquoise", "ASA Elements blue Acrylic · Diamine Turquoise", "", False),
    (23, "L", 0.44, 0.62, "2023-07-15", "pilot_ch91", "pr_electric_dc_blue", "Pilot Custom Heritage 91 · Private Reserve Electric DC Blue", "", False),
    (23, "L", 0.62, 0.80, "2023-07-18", "ranga_sugarcane", "akkerman_bekakt_haags", "Ranga Sugarcane · Akkerman Bekakt Haags", "", False),
    (23, "L", 0.80, 0.99, "2023-07-18", "asa_durga", "kwz_grapefruit", "ASA Durga in Brown Ebonite · KWZ Grapefruit", "", False),
    (23, "R", 0.05, 0.24, "2023-08-10", "pelikan_m200", "pr_spearmint", "Pelikan M200 · Private Reserve Spearmint", "Refill", False),
    (23, "R", 0.24, 0.47, "2023-08-15", "pilot_vp_yellow", "diamine_ancient_copper", "Pilot VP Yellow · Diamine Ancient Copper", "", False),
    (23, "R", 0.47, 0.66, "2023-08-15", "pilot_vp_blue", "diamine_blue_velvet", "Pilot VP Blue · Diamine Blue Velvet", "", False),
    (23, "R", 0.66, 0.78, "2023-08-15", "lamy_safari_red", "diamine_matador", "Lamy Safari Red · Diamine Matador", "", False),
    (23, "R", 0.78, 0.94, "2023-08-15", "lamy_safari_yellow", "krishna_bauhinia", "Lamy Safari Yellow · Krishna Bauhinia", "", False),

    # --- Spread 24 ---
    (24, "L", 0.02, 0.25, "2023-08-21", "ranga_m8_orange", "mb_naruto_orange", "Ranga Model 8 Orange Ebonite · Montblanc x Naruto Orange", "", False),
    (24, "L", 0.25, 0.45, "2023-09-14", "ranga_bamboo_demo", "dominant_glacier", "Ranga Bamboo Demo · Dominant Industry Glacier", "", False),
    (24, "L", 0.45, 0.66, "2023-09-20", "asa_durga", "kwz_grapefruit", "ASA Durga · KWZ Grapefruit", "", False),
    (24, "L", 0.66, 0.86, "2023-09-20", "asa_titanium", "kwz_ig_turquoise", "ASA Titanium · KWZ IG Turquoise", "", False),
    (24, "R", 0.02, 0.23, "2023-09-21", "krishna_brown_swirl", "iro_ina_ho", "Krishna Brown swirl pen · Pilot Iroshizuku Ina-ho", "", False),
    (24, "R", 0.23, 0.37, "2023-09-21", "krishna_nova_green", "krishna_thulsi", "Krishna Nova Green · Krishna Thulsi", "", False),
    (24, "R", 0.37, 0.51, "2023-09-21", "vazir_black_copper", "diamine_ochre", "Vazir black copper finish · Diamine Ochre", "", False),
    (24, "R", 0.52, 0.73, "2023-11-20", "pilot_metro_black", "platinum_carbon_black", "Pilot Metropolitan Black · Platinum Carbon Black", "", False),
    (24, "R", 0.73, 0.98, "2023-11-30", "asa_azaadi", "edelstein_rose_quartz", "ASA Azaadi · Pelikan Edelstein Rose Quartz", "", False),

    # --- Spread 25 ---
    (25, "L", 0.01, 0.20, "2023-12-04", "lamy_2000", "ro_fire_and_ice", "Lamy 2000 · Robert Oster Fire & Ice", "", False),
    (25, "L", 0.20, 0.41, "2024-01-10", "asa_bhishma", "diamine_merlot", "ASA Bhishma · Diamine Merlot", "Sample", False),
    (25, "L", 0.41, 0.63, "2024-02-01", "fosfor_islander", "iro_momiji", "Fosfor Islander · Pilot Iroshizuku Momiji", "", False),
    (25, "L", 0.64, 0.88, "2024-02-12", "wality_71j_blue", "noodlers_54th_mass", "Airmail Wality 71J Blue · Noodler's 54th Massachusetts", "", False),
    (25, "R", 0.01, 0.20, "2024-02-14", "lotus_vikrant_red", "diamine_matador", "Lotus Vikrant Red · Diamine Matador", "", False),
    (25, "R", 0.20, 0.33, "2024-02-14", "lotus_vikrant_blue", "pr_american_blue", "Lotus Vikrant Blue · Private Reserve American Blue", "", False),
    (25, "R", 0.33, 0.52, "2024-02-14", "lotus_vikrant_gb_lava", "diamine_meadow", "Lotus Vikrant Green-Blue Lava Acrylic · Diamine Meadow", "", False),
    (25, "R", 0.52, 0.70, "2024-02-26", "wality_small_pen", "pr_ebony_green", "Airmail Wality small pen · Private Reserve Ebony Green", "", False),
    (25, "R", 0.70, 0.93, "2024-03-03", "wality_71j_blue", "ro_torquay", "Airmail Wality 71J Blue · Robert Oster Torquay", "", False),

    # --- Spread 26 ---
    (26, "L", 0.02, 0.19, "2024-04-06", "pilot_metro_silver", "kwz_grapefruit", "Pilot Metropolitan Silver · KWZ Grapefruit", "", False),
    (26, "L", 0.19, 0.30, "2024-04-06", "pilot_metro_salamander", "diamine_ancient_copper", "Pilot Metropolitan Salamander · Diamine Ancient Copper", "", False),
    (26, "L", 0.30, 0.41, "2024-04-06", "pilot_metro_black", "platinum_carbon_black", "Pilot Metropolitan Black · Platinum Carbon Black", "", False),
    (26, "L", 0.41, 0.58, "2024-04-22", "ranga_m4c_bluepink", "noodlers_libertys_elysium", "Ranga Model 4C Blue-Pink · Noodler's Liberty's Elysium", "", False),
    (26, "L", 0.58, 0.73, "2024-04-22", "guider_green", "diamine_green_black", "Guider Green Acrylic · Diamine Green/Black", "", False),
    (26, "L", 0.74, 0.96, "2024-05-22", "twsbi_540_clear", "iro_momiji", "TWSBI 540 Clear · Pilot Iroshizuku Momiji", "", False),
    (26, "R", 0.02, 0.24, "2024-05-22", "twsbi_540_orange", "mb_naruto_orange", "TWSBI 540 Orange · Montblanc x Naruto Orange", "", False),
    (26, "R", 0.25, 0.61, "2024-05-23", "kanwrite_heritage_blue", "iro_chiku_rin", "Kanwrite Heritage Blue Swirl · Pilot Iroshizuku Chiku-rin", "Changed the nib to BB", False),
    (26, "R", 0.62, 0.95, "2024-05-28", "lamy_2000", "lamy_dark_lilac", "Lamy 2000 · Lamy Dark Lilac", "", False),

    # --- Spread 27 ---
    (27, "L", 0.02, 0.24, "2024-07-01", "pilot_metro_black", "sheaffer_skrip_black", "Pilot Metropolitan Black · Sheaffer Skrip Black", "", False),
    (27, "L", 0.24, 0.52, "2024-07-08", "parker_frontier_kw", "akkerman_bekakt_haags", "Parker Frontier with Kanwrite nib · Akkerman Bekakt Haags", "", False),
    (27, "L", 0.53, 0.75, "2024-07-15", "fosfor_islander", "diamine_winter_spice", "Fosfor Islander · Diamine Winter Spice", "", False),
    (27, "L", 0.75, 0.97, "2024-08-19", "krishna_nova_green", "krishna_verdure_green", "Krishna Nova Green · Krishna Verdure Green", "", False),
    (27, "R", 0.02, 0.20, "2024-08-20", "lotus_vikrant_red", "diamine_matador", "Lotus Vikrant Red · Diamine Matador", "", False),
    (27, "R", 0.20, 0.34, "2024-08-20", "lotus_vikrant_blue", "diamine_blue_velvet", "Lotus Vikrant Blue · Diamine Blue Velvet", "", False),
    (27, "R", 0.35, 0.56, "2024-09-05", "kanwrite_desire_blue_stub", "kwz_ig_turquoise", "Kanwrite Desire Blue Stub · KWZ IG Turquoise", "", False),
    (27, "R", 0.57, 0.75, "2024-10-29", "ranga_m8b_redblack", "lamy_dark_lilac", "Ranga Model 8B Red-Black · Lamy Dark Lilac", "", False),
    (27, "R", 0.76, 0.97, "2024-11-04", "asa_elements_blue", "edelstein_golden_lapis", "ASA Elements Blue Acrylic · Pelikan Edelstein Golden Lapis", "", False),

    # --- Spread 28 ---
    (28, "L", 0.01, 0.21, "2024-11-04", "vazir_black_acrylic", "iro_ina_ho", "Vazir black acrylic pen · Pilot Iroshizuku Ina-ho", "", False),
    (28, "L", 0.21, 0.39, "2024-11-04", "asa_durga", "iro_chiku_rin", "ASA Durga · Pilot Iroshizuku Chiku-rin", "", False),
    (28, "L", 0.40, 0.64, "2024-11-11", "asa_yoddha", "endless_drops_of_mars", "ASA Yoddha · Endless Alchemy Drops of Mars", "", False),
    (28, "L", 0.65, 0.90, "2024-12-16", "asvine_v200", "iro_momiji", "Asvine V200 · Pilot Iroshizuku Momiji", "", False),
    (28, "R", 0.03, 0.25, "2025-01-06", "sheaffer_100", "iro_asa_gao", "Sheaffer 100 · Pilot Iroshizuku Asa-gao", "", False),
    (28, "R", 0.29, 0.50, "2025-01-13", "ranga_zeal", "kwz_honey", "Ranga Zeal · KWZ Honey", "", False),
    (28, "R", 0.50, 0.69, "2025-02-18", "faber_castell_emotion", "diamine_sargasso_sea", "Faber-Castell e-motion · Diamine Sargasso Sea", "", False),
    (28, "R", 0.69, 0.83, "2025-02-18", "twsbi_vac700", "diamine_meadow", "TWSBI Vac 700 · Diamine Meadow", "", False),
    (28, "R", 0.83, 0.99, "2025-02-18", "asa_yoddha", "diamine_ancient_copper", "ASA Yoddha · Diamine Ancient Copper", "", False),

    # --- Spread 29 ---
    (29, "L", 0.02, 0.20, "2025-05-08", "faber_castell_emotion", "lamy_dark_lilac", "Faber-Castell e-motion · Lamy Dark Lilac", "", False),
    (29, "L", 0.22, 0.42, "2025-05-15", "ranga_m8_black", "pr_chocolat", "Ranga Model 8 Matte Black · Private Reserve Chocolat", "", False),
    (29, "L", 0.42, 0.56, "2025-05-15", "ranga_m8_orange", "mb_naruto_orange", "Ranga Model 8 Orange · Montblanc x Naruto Orange", "", False),
    (29, "L", 0.56, 0.71, "2025-05-15", "kaweco_sport", "dominant_glacier", "Kaweco Sport · Dominant Industry Glacier", "", False),
    (29, "L", 0.71, 0.94, "2025-06-24", "faber_castell_emotion", "lamy_dark_lilac", "Faber-Castell e-motion · Lamy Dark Lilac", "", False),
    (29, "R", 0.02, 0.25, "2025-06-29", "asa_titanium", "diamine_sargasso_sea", "ASA Titan with bock B nib · Diamine Sargasso Sea", "", False),
    (29, "R", 0.25, 0.40, "2025-06-29", "deccan_black_slim", "noodlers_black", "Deccan Black slim pen · Noodler's Black", "", False),
    (29, "R", 0.40, 0.56, "2025-07-24", "asa_durga", "diamine_ochre", "ASA Durga · Diamine Ochre", "", False),
    (29, "R", 0.56, 0.85, "2025-08-05", "wality_71jt_green", "krishna_uni_mumbai", "Wality Green 71JT · Krishna University of Mumbai", "Sample", False),

    # --- Spread 30 ---
    (30, "L", 0.02, 0.23, "2025-08-18", "asa_azaadi", "diamine_winter_spice", "ASA Azaadi · Diamine Winter Spice", "", False),
    (30, "L", 0.23, 0.39, "2025-08-18", "fosfor_kop_ebonite", "herbin_parfum_pomme", "Fosfor KOP Ebonite · J. Herbin Parfum Pomme", "", False),
    (30, "L", 0.40, 0.66, "2025-09-02", "gama_sneaky_tiger", "endless_wizards_pencil", "Gama Sneaky Tiger Ebonite · Endless Wizard's Pencil", "Sample", False),
    (30, "L", 0.67, 0.94, "2025-09-03", "gama_sneaky_khaki", "endless_mystic_forest", "Gama Sneaky Khaki Green · Endless Mystic Forest", "Sample", False),
    (30, "R", 0.03, 0.23, "2025-10-23", "asa_azaadi", "diamine_winter_spice", "ASA Azaadi · Diamine Winter Spice", "", False),
    (30, "R", 0.23, 0.39, "2025-10-23", "lotus_custom_by", "iro_asa_gao", "Lotus Custom Blue-Yellow Swirl · Pilot Iroshizuku Asa-gao", "", False),
    (30, "R", 0.39, 0.52, "2025-10-23", "asvine_v200", "iro_momiji", "Asvine V200 · Pilot Iroshizuku Momiji", "", False),
    (30, "R", 0.52, 0.67, "2025-10-23", "faber_castell_emotion", "lamy_dark_lilac", "Faber-Castell e-motion · Lamy Dark Lilac", "", False),
    (30, "R", 0.67, 0.85, "2025-11-03", "asa_jupiter_nauka", "diamine_eclipse", "ASA Jupiter Nauka · Diamine Eclipse", "", False),
    (30, "R", 0.85, 0.99, "2025-11-03", "asa_prithvi", "diamine_oxblood", "ASA Prithvi · Diamine Oxblood", "", False),

    # --- Spread 31 ---
    (31, "L", 0.01, 0.20, "2025-11-03", "moonman_capless", "diamine_majestic_purple", "Moonman Capless · Diamine Majestic Purple", "", False),
    (31, "L", 0.21, 0.40, "2025-12-05", "wingsung_699", "diamine_blue_velvet", "Wing Sung 699 · Diamine Blue Velvet", "", False),
    (31, "L", 0.40, 0.50, "2025-12-05", "pilot_prera", "pr_spearmint", "Pilot Prera · Private Reserve Spearmint", "", False),
    (31, "L", 0.50, 0.64, "2025-12-05", "pilot_vp_blue", "ro_fire_and_ice", "Pilot VP Blue · Robert Oster Fire & Ice", "", False),
    (31, "L", 0.64, 0.84, "2025-12-05", "pilot_vp_yellow", "iro_fuyu_gaki", "Pilot VP Yellow · Pilot Iroshizuku Fuyu-gaki", "", False),
    (31, "R", 0.03, 0.24, "2026-02-25", "wality_orange", "endless_cs_ink", "Airmail Wality Orange pen · Endless Alchemy CS Ink", "", False),
    (31, "R", 0.26, 0.46, "2026-03-30", "lamy_2000", "edelstein_rose_quartz", "Lamy 2000 · Pelikan Edelstein Rose Quartz", "", False),
    (31, "R", 0.47, 0.66, "2026-07-27", "wingsung_699", "diamine_blue_velvet", "Wing Sung 699 · Diamine Blue Velvet", "", False),
    (31, "R", 0.66, 0.76, "2026-07-27", "moonman_capless", "sheaffer_skrip_black", "Moonman Capless · Sheaffer Skrip Black", "", False),
    (31, "R", 0.76, 0.91, "2026-07-27", "guider_bullet", "edelstein_star_ruby", "Guider Bullet · Pelikan Edelstein Star Ruby", "", False),

    # --- Spread 32 (ALL 5 LATE-2026 ENTRIES = CURRENTLY INKED / ACTIVE) ---
    (32, "L", 0.01, 0.21, "2026-08-22", "moonman_capless", "platinum_carbon_black", "Moonman Capless · Platinum Carbon Black", "", True),
    (32, "L", 0.21, 0.43, "2026-09-28", "kanwrite_heritage_brown", "kwz_ig_aztec_gold", "Kanwrite Heritage Brown · KWZ IG Aztec Gold", "", True),
    (32, "L", 0.43, 0.59, "2026-09-28", "kanwrite_heritage_white", "kwz_grapefruit", "Kanwrite Heritage White · KWZ Grapefruit", "", True),
    (32, "L", 0.59, 0.77, "2026-09-28", "asa_elements_blue", "kwz_ig_turquoise", "ASA Elements Blue Acrylic · KWZ IG Turquoise", "", True),
    (32, "L", 0.77, 0.99, "2026-09-28", "kanwrite_heritage_blue", "edelstein_golden_lapis", "Kanwrite Heritage Blue · Pelikan Edelstein Golden Lapis", "", True),
]


def main() -> None:
    if not PDF_SOURCE_PATH.exists():
        raise FileNotFoundError(f"Scan PDF not found at {PDF_SOURCE_PATH}")

    # Pre-flight validation of keys
    for idx, entry in enumerate(JOURNAL_ENTRIES, start=1):
        _, side, _, _, _, pen_k, ink_k, _, _, _ = entry
        assert side in COL_X, f"Entry #{idx} invalid side {side}"
        assert pen_k in PENS, f"Entry #{idx} unknown pen_key {pen_k}"
        assert ink_k in INKS, f"Entry #{idx} unknown ink_key {ink_k}"

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print("1. Removing previous demo seed data and old media files...")
        db.query(WritingSample).delete()
        db.query(LifecycleEvent).delete()
        db.query(UsageSession).delete()
        db.query(ScanPage).delete()
        db.query(ScanBatch).delete()
        db.query(PenPhoto).delete()
        db.query(Pen).delete()
        db.query(Ink).delete()
        db.commit()

        for sub in ("pdfs", "pages", "samples", "pens"):
            folder = UPLOADS_DIR / sub
            if folder.exists():
                shutil.rmtree(folder)
            folder.mkdir(parents=True, exist_ok=True)

        print("2. Creating cataloged Fountain Pens & Inks...")
        pen_id_by_key: dict[str, int] = {}
        for p_key, (brand, model, color, nib_sz, nib_mat, mech, notes) in PENS.items():
            p = Pen(
                brand=brand,
                model=model,
                color_variant=color,
                nib_size=nib_sz,
                nib_material=nib_mat,
                filling_mechanism=mech,
                status="active",
                custom_notes=notes,
            )
            db.add(p)
            db.flush()
            pen_id_by_key[p_key] = p.id

        ink_id_by_key: dict[str, int] = {}
        for i_key, (brand, name, family, hex_col, fmt, vol, moi_url, tags) in INKS.items():
            ink = Ink(
                brand=brand,
                name=name,
                color_family=family,
                hex_color=hex_col,
                format=fmt,
                volume_ml=vol,
                remaining_level="75_pct" if fmt == "bottle" else "half",
                quantity=1,
                mountain_of_ink_url=moi_url,
                properties_tags=tags,
                custom_notes="",
            )
            db.add(ink)
            db.flush()
            ink_id_by_key[i_key] = ink.id

        print(f"   -> Created {len(pen_id_by_key)} pens and {len(ink_id_by_key)} inks.")

        print(f"3. Rendering all pages of '{PDF_SOURCE_PATH.name}' at high DPI...")
        raw_pdf_bytes = PDF_SOURCE_PATH.read_bytes()
        pdf_key = storage.save_bytes("pdfs", PDF_SOURCE_PATH.name, raw_pdf_bytes)
        rendered_pages = render_document_pages(raw_pdf_bytes, PDF_SOURCE_PATH.name, scale=2.2)

        batch = ScanBatch(
            original_filename=PDF_SOURCE_PATH.name,
            pdf_storage_key=pdf_key,
            page_count=len(rendered_pages),
            status="committed",
            is_demo=False,
        )
        db.add(batch)
        db.flush()

        page_by_num: dict[int, ScanPage] = {}
        for page_num, (webp_bytes, w_px, h_px, _) in enumerate(rendered_pages, start=1):
            img_key = storage.save_bytes("pages", f"journal_b{batch.id}_p{page_num}.webp", webp_bytes)
            sp = ScanPage(
                batch_id=batch.id,
                page_number=page_num,
                image_storage_key=img_key,
                width_px=w_px,
                height_px=h_px,
                extracted_json="[]",
                processed=True,
            )
            db.add(sp)
            db.flush()
            page_by_num[page_num] = sp

        print(f"   -> Rendered and stored {len(page_by_num)} notebook spread images.")

        # Precompute next ink-up dates per pen so historical cleaned dates never overlap next fills
        dates_by_pen: dict[str, list[date]] = defaultdict(list)
        for _, _, _, _, dt_iso, p_key, _, _, _, _ in JOURNAL_ENTRIES:
            dates_by_pen[p_key].append(date.fromisoformat(dt_iso))
        for p_key in dates_by_pen:
            dates_by_pen[p_key].sort()

        pen_fill_cursor: dict[str, int] = defaultdict(int)

        print(f"4. Importing {len(JOURNAL_ENTRIES)} ink-up sessions & cropping handwriting samples...")
        active_count = 0
        cleaned_count = 0

        for idx, (page_num, side, y_top, y_bot, dt_iso, p_key, i_key, raw_label, notes, is_active) in enumerate(
            JOURNAL_ENTRIES, start=1
        ):
            dt_inked = date.fromisoformat(dt_iso)
            pen_id = pen_id_by_key[p_key]
            ink_id = ink_id_by_key[i_key]
            sp = page_by_num[page_num]

            cur_pos = pen_fill_cursor[p_key]
            pen_fill_cursor[p_key] += 1
            pen_dates = dates_by_pen[p_key]
            next_pen_dt = pen_dates[cur_pos + 1] if (cur_pos + 1) < len(pen_dates) else None

            if is_active:
                end_status = "active"
                dt_cleaned = None
                active_count += 1
            else:
                end_status = "cleaned"
                cleaned_count += 1
                if next_pen_dt is not None and 0 < (next_pen_dt - dt_inked).days <= 35:
                    dt_cleaned = next_pen_dt
                elif next_pen_dt is not None and next_pen_dt == dt_inked:
                    dt_cleaned = dt_inked + timedelta(days=1)
                else:
                    dt_cleaned = min(date(2026, 8, 20), dt_inked + timedelta(days=21))

            sess = UsageSession(
                pen_id=pen_id,
                ink_id=ink_id,
                date_inked=dt_inked,
                date_cleaned=dt_cleaned,
                end_status=end_status,
                refill_count=0,
                session_notes=notes,
            )
            db.add(sess)
            db.flush()

            db.add(
                LifecycleEvent(
                    session_id=sess.id,
                    event_type="inked",
                    event_date=dt_inked,
                    source="pdf_scan",
                    notes=notes or f"Imported from Spread {page_num}",
                )
            )
            if dt_cleaned is not None:
                db.add(
                    LifecycleEvent(
                        session_id=sess.id,
                        event_type="cleaned",
                        event_date=dt_cleaned,
                        source="pdf_scan",
                        notes=f"Historical entry closed (Spread {page_num})",
                    )
                )

            col_x, col_w = COL_X[side]
            box = CropBox(
                x=round(col_x, 3),
                y=round(y_top, 3),
                w=round(col_w, 3),
                h=round(max(0.05, y_bot - y_top), 3),
            )
            page_img_path = storage.resolve_path(sp.image_storage_key)
            sample_bytes = crop_sample_bytes(page_img_path, box)
            sample_key = storage.save_bytes(
                "samples",
                f"journal_p{page_num}_{side}{idx}_s{sess.id}.webp",
                sample_bytes,
            )

            db.add(
                WritingSample(
                    session_id=sess.id,
                    pen_id=pen_id,
                    ink_id=ink_id,
                    scan_page_id=sp.id,
                    image_storage_key=sample_key,
                    crop_box_json=json.dumps(box.model_dump()),
                    sample_date=dt_inked,
                    transcription=notes,
                    caption=raw_label,
                )
            )

        db.commit()
        print("5. Import complete!")
        print(f"   -> Total Spreads Rendered : {len(page_by_num)}")
        print(f"   -> Total Fountain Pens    : {len(pen_id_by_key)}")
        print(f"   -> Total Inks             : {len(ink_id_by_key)}")
        print(f"   -> Total Ink-Up Sessions  : {len(JOURNAL_ENTRIES)} ({active_count} Currently Inked, {cleaned_count} Cleaned)")
        print(f"   -> Total Writing Samples  : {len(JOURNAL_ENTRIES)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
