"""Match every blog pen to its exact pen in data/pen_ink.db and identify pens without photos."""

from bs4 import BeautifulSoup
from pathlib import Path
import sqlite3
import re

ROOT = Path(__file__).resolve().parent.parent

# 1. Parse blog pens
with open(ROOT / "scripts" / "scratch_blog_post.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f.read(), "html.parser")

entry = soup.find("div", class_="entry-content")
blog_pens = []
fig_num = 1
for el in entry.children:
    if el.name == "figure":
        pass
    elif el.name == "ol":
        for idx, li in enumerate(el.find_all("li")):
            blog_pens.append((fig_num, idx + 1, li.get_text(strip=True)))
        fig_num += 1

# 2. Query DB pens
conn = sqlite3.connect(ROOT / "data" / "pen_ink.db")
c = conn.cursor()
c.execute("SELECT id, brand, model, color_variant FROM pens")
db_pens = {r[0]: (r[1], r[2], r[3]) for r in c.fetchall()}
conn.close()

# Precise manual verification & matching dictionary:
# (fig, idx) -> pen_id in database
# If a blog pen does NOT exist in the database (or was a gift/unnamed not in DB), set to None.
EXACT_MAPPING = {
    # Figure 1 (10 pens)
    (1, 1): 134,  # Vintage Parker Burgundy & Black (flex) -> Parker Vintage Burgundy & Black - Flex
    (1, 2): 135,  # Vintage Parker Burgundy & Black (non-flex) -> Parker Vintage Burgundy & Black - Non-Flex
    (1, 3): 121,  # Esterbrook J -> Esterbrook J Vintage
    (1, 4): 122,  # Esterbrook SJ -> Esterbrook SJ Vintage
    (1, 5): None, # Vintage Parker Vacumatic -> (only 134 & 135 Vintage Parkers in DB, no separate Vacumatic)
    (1, 6): 3,    # ADA Aazaadi with Visconti Nib (custom acrylic) -> ASA Azaadi Ancient Gold Acrylic
    (1, 7): 137,  # Ranga model 3c Premium Ebonite -> Ranga Model 3C Premium Ebonite
    (1, 8): 18,   # Ranga model 4c Demonstrator -> Ranga Model 4C Clear Demonstrator
    (1, 9): 13,   # Krishna Lyrebird 52 Brown swirl ebnite -> Krishna Lyrebird 52 Brown Swirl
    (1, 10): 12,  # Krishna Nova Forrest Green ebonite -> Krishna Nova Green Ebonite

    # Figure 2 (10 pens)
    (2, 1): 49,   # Guider Medium Acrylic - Brown -> Guider Acrylic Brown Swirl
    (2, 2): 138,  # Ranga model 4c Green -> Ranga Model 4C Green Ebonite
    (2, 3): 30,   # Ranga model 8B ??? -> Ranga Model 8B Red-Black Ebonite
    (2, 4): 9,    # Fosfor Rajendran (KOP) woodgrain acrylic -> Fosfor KOP Woodgrain Ebonite (or 123)
    (2, 5): 72,   # Sheaffer Gift 100 -> Sheaffer 100 Glossy Red
    (2, 6): 57,   # Deccan advocate olive ebonite with Kanwrite nib -> Deccan Advocate Olive Green Ebonite
    (2, 7): 126,  # Guider Small Acrylic - Amber +schmidt nib -> Guider Small Acrylic Amber - Schmidt Nib
    (2, 8): 26,   # Pilot Metropolitan Lizard -> Pilot Metropolitan Retro Pop Lizard
    (2, 9): 46,   # Pilot Metropolitan Black -> Pilot Metropolitan Classic Black
    (2, 10): 44,  # Pilot Metropolitan Silver -> Pilot Metropolitan Silver Steel

    # Figure 3 (10 pens)
    (3, 1): 58,   # Gama Kuyil -> Gama Kuyil Ebonite
    (3, 2): None, # Gift pen from Sanjay Saraf sir -> (gift pen not in database)
    (3, 3): 28,   # Wality Big Green Swirl - Kanwrite nib -> Airmail Wality Big Demonstrator Green
    (3, 4): 37,   # Fosfor Tikona -> Fosfor Tikona Faceted Acrylic
    (3, 5): 120,  # Deccan bullet senior -> Deccan Bullet Senior Ebonite
    (3, 6): 7,    # Ranga Bamboo in Green Swirl -> Ranga Bamboo Green-Yellow Ebonite
    (3, 7): None, # Jinhao x450 -> (only Jinhao in DB is 52 Jinhao 9035)
    (3, 8): 8,    # Ranga Sugarcane -> Ranga Sugarcane Teal-Red Ebonite
    (3, 9): 112,  # Guider pocket pen -> Guider Bullet Acrylic / Ebonite
    (3, 10): 119, # Deccan bullet junior -> Deccan Bullet Junior Ebonite

    # Figure 4 (9 pens)
    (4, 1): 73,   # Guider egg Green swirl acrylic -> Guider Acrylic Green (or 45 Guider Egg Red Swirl)
    (4, 2): 55,   # Kaweco sport with 2B nib -> Kaweco Sport Navy Blue
    (4, 3): 125,  # Guider Blue black -> Guider Classic Blue-Black
    (4, 4): 29,   # Lotus Shikhar in Honey Dew Acrylic -> Lotus Shikhar Honey Dew Acrylic
    (4, 5): 91,   # Fosfor Islander in Lava acrylic -> Fosfor Islander Custom Acrylic
    (4, 6): 36,   # ASA TransNauka Blue -> ASA Transnauka Blue Acrylic
    (4, 7): 113,  # ASA TransNauka Tangerine -> ASA Transnauka Tangerine Acrylic
    (4, 8): 33,   # ASA TransNauka Clear -> ASA Transnauka Clear Acrylic
    (4, 9): 77,   # ASA TransNauka Green -> ASA Nauka Translucent Green

    # Figure 5 (6 pens)
    (5, 1): 85,   # Vazir in rose gold trim -> Vazir Rose Gold Black & Rose Gold
    (5, 2): 62,   # Ranga Zeal with Bock nib -> Ranga Zeal Blue & Demonstrator
    (5, 3): 48,   # Kanwrite desire clear -> Kanwrite Desire Clear Demonstrator
    (5, 4): 5,    # Kanwrite desire translucent Blue -> Kanwrite Desire Blue Translucent
    (5, 5): 83,   # Ranga Bamboo demonstrator -> Ranga Bamboo Clear Demonstrator
    (5, 6): 117,  # Click Aristocrat -> Click Aristocrat Orange

    # Figure 6 (6 pens)
    (6, 1): 133,  # Parker vector -> Parker Vector Classic
    (6, 2): 139,  # Ratnamsons 302 Blue -> Ratnamson 302 Blue Ebonite
    (6, 3): 50,   # Ratnamsons 302 Brick Red -> Ratnamson 302 Brown Ebonite
    (6, 4): 79,   # Kanwrite Heritage White -> Kanwrite Heritage White Marbled
    (6, 5): 80,   # Kanwrite Heritage Blue Swirl -> Kanwrite Heritage Blue Swirl
    (6, 6): 81,   # Kanwrite Heritage Brown -> Kanwrite Heritage Brown Marbled

    # Figure 7 (10 pens)
    (7, 1): 136,  # Ranga Bamboo Blue swirl ebonite -> Ranga Bamboo Blue Ripple Ebonite
    (7, 2): 11,   # Ranga model 8 Black Bakul -> Ranga Model 8 Matte Black Ebonite
    (7, 3): 14,   # Ranga model 8 Premium Orange -> Ranga Model 8 Orange Ebonite
    (7, 4): 39,   # Lotus custom pen -> Lotus Custom Blue with Yellow Swirl
    (7, 5): 20,   # Lotus Vikrant Red -> Lotus Vikrant Red Mono Acrylic
    (7, 6): 19,   # Lotus Vikrant Blue -> Lotus Vikrant Blue Mono Acrylic
    (7, 7): 93,   # Lotus Vikrant Lava Acrylic -> Lotus Vikrant Green-Blue Lava Acrylic
    (7, 8): 10,   # Forsfor KOP in CS Dartmoor -> Fosfor KOP Dartmoor Acrylic
    (7, 9): 67,   # ASA Durga -> ASA Durga Brown Ebonite
    (7, 10): None,# Pierre Cardin (Gift) -> (gift pen not in DB)

    # Figure 8 (10 pens)
    (8, 1): 65,   # Lamy Safari Red -> Lamy Safari Red
    (8, 2): 64,   # Lamy Safari Blue -> Lamy Safari Blue
    (8, 3): 69,   # Lamy Safari Mango -> Lamy Safari Mango Special Edition
    (8, 4): 15,   # Lamy 2000 -> Lamy 2000 Makrolon Black
    (8, 5): 59,   # ASA Maya Brown Matte Ebonite -> ASA Maya Brown Ebonite
    (8, 6): 21,   # ASA Maya Black Matte Ebonite -> ASA Maya Black Ebonite
    (8, 7): 6,    # ASA Titan with Titanium nib -> ASA Titanium Blue & White
    (8, 8): 82,   # ASA Bheeshma in Lava Acrylic -> ASA Bhishma Purple Lava Alumilite
    (8, 9): 31,   # ASA Mist in clear -> ASA Mist Clear Acrylic
    (8, 10): 16,  # ASA Author with Kanwrite nib -> ASA Athlete Ebonite (or unlisted)

    # Figure 9 (10 pens)
    (9, 1): 110,  # Pilor Prera -> Pilot Prera Classic
    (9, 2): 52,   # Jinhao Wooden pen red -> Jinhao 9035 Reddish Wood
    (9, 3): None, # Jinhao Wooden pen brown -> (second wooden Jinhao not in DB)
    (9, 4): 43,   # Gama Sneaky Teal Orange Ripple -> Gama Sneaky Teal-Brown Swirl
    (9, 5): 105,  # Gama Sneaky Light Brown Swirl (Tiger ??) -> Gama Sneaky Tiger Ebonite (or 124)
    (9, 6): 75,   # Gama Sneaky Forest Green Khakhi ripple -> Gama Sneaky Khaki Green Ebonite Swirl
    (9, 7): 74,   # Guider Capsule Red -> Guider Capsule Red Acrylic
    (9, 8): 17,   # TWSBI 540 Clear -> TWSBI Diamond 540 Clear Transparent
    (9, 9): 42,   # TWSBI VAC 700 Smoke -> TWSBI Vac 700 Smoke Grey
    (9, 10): 96,  # TWSBI 540 Orange -> TWSBI Diamond 540 Sunset Orange

    # Figure 10 (3 pens)
    (10, 1): 142, # Visconti Salvador Dali -> Visconti Salvador Dali Surrealist Resin
    (10, 2): 53,  # Pilot custom heritage 91 -> Pilot Custom Heritage 91 Black
    (10, 3): 23,  # Sailor 1911 -> Sailor 1911 Black & Gold

    # Figure 11 (6 pens)
    (11, 1): 25,  # Pilot Falcon with Fine flex nib -> Pilot Falcon Black & Gold
    (11, 2): 34,  # Pilot m200 (Pelikan M200) -> Pelikan Classic M200 Green Marbled
    (11, 3): 47,  # ASA Nauka black Ebonite -> ASA Nauka Black Ebonite
    (11, 4): 1,   # Pilot Vanishing point Canary Yellow -> Pilot Vanishing Point Canary Yellow
    (11, 5): 2,   # Pilot Vanishing point blue matte -> Pilot Vanishing Point Blue Matte
    (11, 6): 88,  # ASA Elements Translucent Blue -> ASA Elements Blue Acrylic

    # Figure 12 (2 pens)
    (12, 1): 22,  # Ranga model 5 with Kanwrite B nib - cherry red -> Ranga Model 5 Red / Cherry Ebonite
    (12, 2): 51,  # Kanwrite desire black -> Kanwrite Desire Solid Black
}

matched_pens = {}
unmatched_blog_pens = []
for (fig, idx, btext) in blog_pens:
    pid = EXACT_MAPPING.get((fig, idx))
    if pid is not None:
        db_info = db_pens[pid]
        matched_pens[pid] = {
            "fig": fig,
            "idx": idx,
            "blog_text": btext,
            "db_name": f"{db_info[0]} {db_info[1]} ({db_info[2]})"
        }
    else:
        unmatched_blog_pens.append((fig, idx, btext))

all_db_ids = set(db_pens.keys())
matched_db_ids = set(matched_pens.keys())
pens_without_photo = all_db_ids - matched_db_ids

print("=" * 70)
print(f"Total pens in blog post: {len(blog_pens)}")
print(f"Successfully mapped to DB pens: {len(matched_pens)}")
print(f"Blog pens not in DB (gifts / variants not in collection DB): {len(unmatched_blog_pens)}")
print(f"DB pens WITHOUT photo in the July 15th 2023 blog post: {len(pens_without_photo)} (out of {len(all_db_ids)})")
print("=" * 70)

print("\n--- Blog items not in database ---")
for f, i, t in unmatched_blog_pens:
    print(f"  Fig {f:02d} #{i:02d}: {t}")

print(f"\n--- {len(pens_without_photo)} DB Pens that DO NOT have a photo on that webpage ---")
for pid in sorted(pens_without_photo):
    brand, model, color = db_pens[pid]
    print(f"  [ID {pid:3d}] {brand} | {model} | {color or 'Standard'}")

