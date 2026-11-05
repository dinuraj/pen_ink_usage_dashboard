import json

content = """<!-- wp:paragraph -->
<p>For years, whenever I inked up a fountain pen, I reached for my paper journal. My current companion is an Endless stationery notebook with dotted Tomoe River paper. Every time a new pen-and-ink pairing came together, I would jot down the date, the pen, the nib size, and the ink. Whenever I was ready to ink up a pen, I’d flip through earlier pages to pick an ink or check how a nib performed. There is something deeply satisfying about writing on Tomoe River paper—the sheen, the shading, the feel of the nib gliding across smooth paper. That ritual isn’t going anywhere; I still log every single fill on paper by hand.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Over time, though, questions kept popping up that paper made tricky to answer: Which inks haven't I inked up in over a year? How many pens are currently inked in the rotation? What was the last pen I paired with that specific bottle of green? And how much paper and notebook inventory do I actually have left in the cabinet? I wanted a quick, effortless way to explore those answers without thumbing back through dozens of notebook pages.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":987,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://inkpensblog.wordpress.com/wp-content/uploads/2026/11/screenshot_dashboard.png" alt="Overview of the digital ink and nib usage dashboard showing collection statistics, active inkings, and recent activity" class="wp-image-987"/><figcaption class="wp-element-caption">The Atelier Ink &amp; Nib dashboard showing collection statistics, active rotations, and recent activity.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Bringing Paper into Pixels</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>So I built <strong>Atelier Ink &amp; Nib</strong>—a dedicated digital companion for my collection. It tracks everything in one place:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><strong>Currently inked pens</strong> (and how long each has been inked)</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Complete pen and nib specs</strong>, alongside photos of my actual pens</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Ink bottles and sample vials</strong>, with color swatches and usage logs</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Notebook and loose-sheet paper inventory</strong></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Historical inking sessions</strong> and handwriting samples</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Uncovering Forgotten Favorites &amp; Collection Stats</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Having all the historical logs digitized surfaced some fascinating insights into my own pen and ink habits over the years:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><strong>All-Time Most-Inked Pens:</strong> The <em>Pilot Vanishing Point (Blue Matte)</em> leads the pack with 14 inking sessions, followed closely by the <em>Canary Yellow Vanishing Point</em> (11 fills) and the classic <em>Lamy 2000</em> (11 fills).</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>My Go-To Workhorse Ink:</strong> <em>Diamine Turquoise</em> took top honors with 8 separate fills across different pens.</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>The Forgotten Favorites:</strong> The data revealed that inks like <em>Diamine Turquoise</em>, <em>Noodler's Black Swan in Australian Roses</em>, and <em>Rohrer &amp; Klingner Salix</em>—along with pens like my <em>Sailor 1911</em> and <em>Pilot Falcon</em>—were in heavy rotation up through mid-2023, but haven't been inked once since! Seeing that clearly in the dashboard gave me the immediate urge to bring them back into the active pen case.</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:image {"id":988,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://inkpensblog.wordpress.com/wp-content/uploads/2026/11/screenshot_ink_detail.png" alt="Ink detail page showing bottle details, Mountain of Ink reference link, and usage history across pens" class="wp-image-988"/><figcaption class="wp-element-caption">Detailed view for Diamine Turquoise, tracking fill history across pens and linking out to Mountain of Ink.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Accurate Ink Colors &amp; Respecting Community Creators</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>One of my favorite touches is how ink shades are represented. Digital swatches rarely do fountain pen inks justice—they can’t easily convey shading, sheen, or wetness. For every ink in my cabinet, I added a direct reference link to its review on the wonderful <a href="https://mountainofink.com/" target="_blank" rel="noreferrer noopener">Mountain of Ink</a> blog by Kelli.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Out of respect for copyright, I haven't scraped or copied any of her swatch images into my tool, but having a one-click jump directly to her exhaustive reviews and writing samples gives me the perfect visual reference whenever I’m deciding what to ink next.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":989,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://inkpensblog.wordpress.com/wp-content/uploads/2026/11/screenshot_pen_detail.png" alt="Pen detail page showing pen specs, photo, and inking history" class="wp-image-989"/><figcaption class="wp-element-caption">Pen detail view showing full specs, pen photography, and historical inking logs.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Pair-Programming with AI as a Software Engineer</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>As a software engineer, I write code every day, but for a personal hobby project, I didn't want to get bogged down in weeks of boilerplate, schema wiring, and data entry. Instead, I used AI as an active pair-programming partner.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>We brainstormed the database structure together, drafted the interface, and rapidly wired up the components. What would have taken weeks of after-hours tinkering came together smoothly in just a few focused sessions—letting me spend less time wrestling with code and more time enjoying the collection.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">The Best of Both Worlds</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The digital dashboard doesn’t replace my paper journal—it enhances it. The analog ritual stays untouched, but now I have an instant bird’s-eye view of my collection whenever I’m planning my next pen-and-ink combination.</p>
<!-- /wp:paragraph -->"""

payload = {
    "title": "From Paper to Pixels: How I Built a Digital Companion for My Fountain Pen & Ink Journal",
    "content": content,
    "status": "publish",
    "featured_media": 987,
    "categories": [5158, 19368, 154992],
    "tags": [52146543, 93501],
    "user_confirmed": True
}

with open("scripts/post_payload.json", "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print("Saved payload successfully.")
