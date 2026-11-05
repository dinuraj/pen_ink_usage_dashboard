import json

content = """<!-- wp:paragraph -->
<p>For years, whenever I inked up a fountain pen, I reached for my paper journal. My current companion is an Endless stationery notebook with dotted Tomoe River paper. Every time a new pen-and-ink pairing came together, I would jot down the date, the pen, the nib size, and the ink. Whenever I was ready to ink up a pen, I’d flip through earlier pages to pick an ink or check how a nib performed. There is something deeply satisfying about writing on Tomoe River paper—the sheen, the shading, the feel of the nib gliding across smooth paper. That ritual isn’t going anywhere; I still log every single fill on paper by hand.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Over time, though, questions kept popping up that paper made tricky to answer: Which inks haven't I inked up in over a year? How many pens are currently inked in the rotation? What was the last pen I paired with that specific bottle of green? And how much paper and notebook inventory do I actually have left in the cabinet? I wanted a quick, effortless way to explore those answers without thumbing back through dozens of notebook pages.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":987,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://inkpensblog.wordpress.com/wp-content/uploads/2026/11/screenshot_dashboard.png" alt="Overview of the digital usage dashboard showing collection statistics, active rotations, and recent activity" class="wp-image-987"/><figcaption class="wp-element-caption">Overview of the digital usage dashboard showing collection statistics, active rotations, and recent activity.</figcaption></figure>
<!-- /wp:image -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Bringing Paper into Pixels</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>So I built a dedicated companion for my collection: the <strong>Pen &amp; Ink Usage Dashboard</strong>.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"left"}} -->
<div class="wp-block-buttons"><!-- wp:button {"style":{"color":{"background":"#0073aa","text":"#ffffff"},"typography":{"fontSize":"20px"},"border":{"radius":"6px"}},"className":"is-style-fill"} -->
<div class="wp-block-button has-custom-font-size is-style-fill" style="font-size:20px"><a class="wp-block-button__link has-text-color has-background wp-element-button" href="https://pen-ink-usage-dashboard.onrender.com/" style="border-radius:6px;color:#ffffff;background-color:#0073aa" target="_blank" rel="noreferrer noopener">🔗 Open Pen &amp; Ink Dashboard ↗</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:paragraph {"style":{"typography":{"fontSize":"18px"}}} -->
<p style="font-size:18px">Direct URL: <a href="https://pen-ink-usage-dashboard.onrender.com/" target="_blank" rel="noreferrer noopener"><strong>https://pen-ink-usage-dashboard.onrender.com/</strong></a></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>It brings everything together into one clean, searchable space:</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li><strong>Currently Inked Pens:</strong> Real-time visibility into what is inked up right now and how many days each pen has been in rotation.</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Pen &amp; Nib Specs:</strong> Complete nib sizes, filling systems, and high-resolution photos of the pens in my cabinet.</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Ink Inventory:</strong> Bottles and sample vials, swatch color profiles, and comprehensive fill histories.</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Paper &amp; Notebook Tracker:</strong> Remaining page counts, formats, and stock levels.</li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><strong>Historical Inking Logs:</strong> Every fill dating back through the years, paired with original handwriting sample scans.</li>
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

<!-- wp:image {"id":997,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://inkpensblog.wordpress.com/wp-content/uploads/2026/11/screenshot_ink_turquoise.png" alt="Ink detail page showing bottle details, Mountain of Ink reference link, and usage history across pens for Diamine Turquoise" class="wp-image-997"/><figcaption class="wp-element-caption">Detailed view for Diamine Turquoise, tracking fill history across pens and linking out to Mountain of Ink.</figcaption></figure>
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
<h2 class="wp-block-heading">The Best of Both Worlds &amp; Feedback Welcome</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>The digital dashboard doesn’t replace my paper journal—it enhances it. The analog ritual of putting nib to Tomoe River paper stays untouched, but now I have an instant bird’s-eye view of my collection whenever I’m planning my next pen-and-ink combination.</p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"left"}} -->
<div class="wp-block-buttons"><!-- wp:button {"style":{"color":{"background":"#0073aa","text":"#ffffff"},"typography":{"fontSize":"20px"},"border":{"radius":"6px"}},"className":"is-style-fill"} -->
<div class="wp-block-button has-custom-font-size is-style-fill" style="font-size:20px"><a class="wp-block-button__link has-text-color has-background wp-element-button" href="https://pen-ink-usage-dashboard.onrender.com/" style="border-radius:6px;color:#ffffff;background-color:#0073aa" target="_blank" rel="noreferrer noopener">🔗 Visit Pen &amp; Ink Dashboard ↗</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:paragraph {"style":{"typography":{"fontSize":"18px"}}} -->
<p style="font-size:18px">Live link: <a href="https://pen-ink-usage-dashboard.onrender.com/" target="_blank" rel="noreferrer noopener"><strong>https://pen-ink-usage-dashboard.onrender.com/</strong></a></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p><strong>I’d love to hear your thoughts and feedback!</strong><br>How do you keep track of your inked pens, ink bottles, and notebook stash? Do you stick strictly to paper journals, spreadsheets, or something in between? Drop a comment below with your thoughts or any ideas for features and statistics you’d like to see!</p>
<!-- /wp:paragraph -->"""

payload = {
    "id": 990,
    "title": "From Paper to Pixels: How I Built a Digital Companion for My Fountain Pen & Ink Journal",
    "content": content,
    "status": "publish",
    "featured_media": 993,
    "categories": [5158, 19368, 154992],
    "tags": [52146543, 93501],
    "user_confirmed": True
}

with open("scripts/update_payload.json", "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

print("Generated button payload successfully.")
