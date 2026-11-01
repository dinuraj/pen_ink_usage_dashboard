# Technical Architecture & Developer Reference

This document details the codebase organization, REST API contracts, database schema, and PDF Vision pipeline for the **Nib & Ink Usage Tracker**.

---

## 1. Repository Layout

```text
pen_ink_usage/
├── run.py                         # Single-command launcher (serves API + compiled SPA)
├── backend/
│   ├── requirements.txt           # Python dependencies (FastAPI, SQLAlchemy, pypdfium2, Pillow, google-genai)
│   ├── verify_backend.py          # Automated API & seed verification suite
│   └── app/
│       ├── config.py              # Paths, DATABASE_URL, STORAGE_BACKEND, GEMINI_MODEL
│       ├── database.py            # SQLAlchemy 2.0 engine & session management (WAL enabled for SQLite)
│       ├── storage.py             # StorageAdapter interface + LocalStorageAdapter
│       ├── models.py              # ORM entities: Pen, PenPhoto, Ink, UsageSession, LifecycleEvent, ScanBatch, ScanPage, WritingSample, AppSetting
│       ├── schemas.py             # Pydantic v2 DTOs & validation schemas
│       ├── serializers.py         # Computed entity metrics & response serializers
│       ├── seed_demo.py           # Realistic demo seed generator + synthetic handwritten samples & 2-page PDF
│       ├── main.py                # FastAPI app, media mount (/media), SPA static mount
│       ├── services/
│       │   ├── analytics.py       # KPIs, Currently Inked aging, monthly cadence, rankings, bench-warmers
│       │   ├── lifecycle.py       # Ink-Up, Refill, Clean/Empty transitions & auto-closing prior sessions
│       │   ├── matcher.py         # Fuzzy matching (handles duplicate pen models via color & nib) + duplicate guard
│       │   └── pdf_vision.py      # pypdfium2 PDF page rendering, Pillow cropping/ink color sampler, Gemini Vision OCR
│       └── routers/
│           ├── analytics.py       # GET /api/analytics/dashboard
│           ├── pens.py            # CRUD /api/pens, pen photos, standalone custom notes
│           ├── inks.py            # CRUD /api/inks, remaining levels, mountainofink.com URL, custom notes
│           ├── sessions.py        # POST /api/sessions, /refill, /clean, /reopen
│           ├── scans.py           # POST /api/scans/upload, /analyze, /sample-color, /commit
│           ├── samples.py         # GET/POST /api/samples
│           └── settings.py        # Gemini key config, .zip backup export, demo reset
├── frontend/                      # React 19 + Vite 6 + TypeScript + Tailwind CSS v4 + Recharts
│   └── src/
│       ├── api.ts                 # Typed REST client
│       ├── types.ts               # Shared TypeScript interfaces
│       ├── App.tsx                # Sidebar layout, hash router, Light/Dark theme toggle
│       ├── components/            # ActionModals, SampleLightbox, MarkdownNotes
│       └── views/                 # DashboardView, PensView, PenDetailView, InksView, InkDetailView, ScanStudioView, SamplesView, SettingsView
└── docs/
    ├── IMPLEMENTATION_PLAN.md     # Product & landscape research + implementation plan
    ├── ARCHITECTURE.md            # Developer & API architecture guide
    └── CLOUD_MIGRATION.md         # Step-by-step local-to-cloud hosting promotion guide
```

---

## 2. Key Engineering Flows

### A. Multi-Page Notebook PDF Ingestion & Ink Color Sampling
1. Uploading a `.pdf` to `POST /api/scans/upload` invokes `pypdfium2` to render each page at `2.2×` scale into crisp WebP page images under `data/uploads/pages/`.
2. Calling `POST /api/scans/{batch_id}/analyze`:
   - **When `GEMINI_API_KEY` is configured**: Sends each page image to Gemini (`gemini-2.5-flash`) with a strict Pydantic JSON response schema (`_GeminiPageExtraction`) along with your existing Pen & Ink names as context hints. Returns `date_inked`, `pen_brand`, `pen_model`, `pen_color`, `nib_size`, `ink_brand`, `ink_name`, `scribble_transcription`, and `[ymin, xmin, ymax, xmax]` crop coordinates for every entry on the page.
   - **Offline Fallback**: Segments horizontal ink-density bands on the page so crop boxes are pre-positioned for manual review even offline.
3. `sample_ink_color_from_region()` uses `Pillow` to filter out bright/low-chroma paper pixels and extract the core RGB hex color and color family (`Blue`, `Teal`, `Red`, `Green`, `Purple`, `Brown`, `Black`, `Orange`, `Grey`) directly from your handwritten strokes.
4. `POST /api/scans/{batch_id}/commit` processes confirmed entries chronologically, creates any inline new `Pen` or `Ink` records, auto-closes prior open sessions on re-inked pens, and crops full-resolution WebP cutouts into `data/uploads/samples/`.

### B. Pen & Ink Lifecycle Accounting
- Every ink-up opens a `UsageSession` (`end_status="active"`, `date_cleaned=NULL`) and writes an `inked` `LifecycleEvent`.
- Clicking **Refill** appends a `refilled` `LifecycleEvent` (with backdate picker) and increments `refill_count`.
- Clicking **Clean** appends a `cleaned` or `emptied` `LifecycleEvent` and sets `date_cleaned`, archiving the fill into historical duration and rotation metrics.
