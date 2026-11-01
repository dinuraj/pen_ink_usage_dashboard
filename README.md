# Nib & Ink — Fountain Pen & Ink Usage Analytics

A personal local-first (and cloud-ready) web application that tracks your fountain pen rotation, ink inventory, refills, cleanings, and handwritten writing samples—with first-class support for uploading **multi-page PDF scans of your physical ink-up notebook**.

---

## Quick Start

### 1. Run the Application (Single Command)
```powershell
.\backend\.venv\Scripts\python.exe run.py
```
Then open **http://127.0.0.1:8000** in your browser.

On first launch, you can optionally populate a **Demo Seed Collection** by setting `AUTO_SEED_DEMO=true` (or from **Settings → Reset to Demo Seed**):
- **10 Fountain Pens** (including duplicate models differentiated by color & nib, e.g., *Pilot Custom 823 Amber M* vs. *Smoke Black F*, and *Lamy Safari Savannah Green M* vs. *Mango Yellow Stub 1.1*) with standalone custom Markdown notes.
- **12 Fountain Pen Inks** (bottles & sample vials across `Full`, `75%`, `Half`, `Low`, and `Empty` levels) with real **`mountainofink.com`** review links and custom notes.
- **22 Usage Sessions** (17 historical + 5 Currently Inked, with refills, cleanings, and handwriting sample cutouts).
- **Ready-to-Review 2-Page Demo Notebook PDF** (`data/demo_notebook_scan.pdf` and pre-loaded in **PDF Scan Studio**) demonstrating multi-entry extraction, duplicate-import detection, interactive drag-and-resize sample cropping, and ink color sampling.

---

## Core Features

- **Modern Minimalist Analytics Dashboard**:
  - Top KPI strip (*Currently Inked Ratio*, *Ink-Ups & Refills*, *Ink Inventory*, *Avg Fill Cycle*, *28-Day Flush Check*).
  - **Currently Inked Command Table** with 1-click **`Refill`** and **`Clean`** actions (supports backdating).
  - Interactive charts: *12-Month Activity Cadence*, *Color Family Stash vs. Usage*, *Most Used Pens & Inks*, *Nib Size Share*, and *Shelf Bench-Warmers*.
  - **Shareable Vector PDF Snapshot**: 1-click **`Share PDF`** export (`/api/analytics/dashboard.pdf`) rendering KPIs, inline handwriting cutouts, rankings, and vector charts into a clean 2-page A4 report.
- **Dedicated Pen & Ink Pages**:
  - Track hardware specs, pen photos, container formats (`Bottle`, `Sample Vial`, `Cartridge`), 1-click remaining levels (`Full` → `Empty`), **`Mountain of Ink`** external review links, **standalone Markdown custom notes**, **Duplicate Pen/Ink Merging**, full lifecycle timelines, and nib-annotated writing sample galleries.
- **Multi-Page Notebook PDF Scan, Crop & OCR Verification Studio**:
  - Upload multi-page PDFs (including 2-column landscape notebook spreads) rendered cleanly via `pypdfium2`.
  - Hybrid **Gemini Vision OCR** (configure `GEMINI_API_KEY` in **Settings** or `.env`) + offline layout band detection.
  - **Post-Import Verification (`Verify Imported`)**: Side-by-side zoomable scan inspector to verify and edit OCR-imported entries directly against original scans, drag/resize bounding boxes to re-crop handwriting cutouts live, split/create pens or inks inline, sample stroke hex colors, or add missed entries onto any spread.
- **Portable Local Storage → Cloud Ready**:
  - Download a complete `.zip` backup (`SQLite DB + JSON + all images/PDFs`) anytime from **Settings**.
  - See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and [`docs/CLOUD_MIGRATION.md`](docs/CLOUD_MIGRATION.md) for architecture and future cloud deployment details.

---

## Frontend Development (Optional)
If you edit React/Tailwind files under `frontend/src/`:
```powershell
cd frontend
npm run dev      # Vite dev server at http://localhost:5173 (proxies /api and /media to :8000)
npm run build    # Compiles production bundle into frontend/dist/ served by run.py
```
