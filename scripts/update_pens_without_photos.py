import sqlite3

conn = sqlite3.connect("data/pen_ink.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

pens = cur.execute("""
    SELECT id, brand, model, color_variant, nib_size, primary_photo_key
    FROM pens
    WHERE primary_photo_key IS NULL
    ORDER BY brand, model, id
""").fetchall()

print(f"Pens without photos: {len(pens)}")
lines = [f"# Pens Without Photos ({len(pens)} remaining)\n", "| ID | Brand | Model | Color | Nib |", "|---|---|---|---|---|"]
for p in pens:
    color = p["color_variant"] or "-"
    nib = p["nib_size"] or "-"
    lines.append(f"| {p['id']} | {p['brand']} | {p['model']} | {color} | {nib} |")

with open("PENS_WITHOUT_PHOTOS.md", "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

print("Updated PENS_WITHOUT_PHOTOS.md")
