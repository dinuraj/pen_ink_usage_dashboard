# Cloud Migration & Deployment Guide

This application was architected so you can run it **100% locally as a personal web app** today, and promote it to a **private cloud-hosted web app** later with zero refactoring of your domain models, analytics, or UI.

---

## 1. Local Architecture vs. Cloud Architecture

| Layer | Local Personal Mode (Default) | Cloud Hosted Mode (Future) | Configuration Seam |
| :--- | :--- | :--- | :--- |
| **Application Runtime** | `uvicorn app.main:app` on `127.0.0.1:8000` serving both `/api/*` and frontend SPA | Single Docker container on Railway, Render, Fly.io, or Google Cloud Run | `Dockerfile` (single service) |
| **Database** | Local SQLite file (`data/pen_ink.db`) | Managed PostgreSQL (Supabase, Neon, Railway Postgres) | `DATABASE_URL` env var (`backend/app/database.py`) |
| **Media & PDFs** | Local filesystem (`data/uploads/{pdfs,pages,samples,pens}`) | S3-compatible bucket (Cloudflare R2, AWS S3, Supabase Storage) | `STORAGE_BACKEND=s3` + `S3_*` env vars (`backend/app/storage.py`) |
| **AI Vision Key** | Stored locally in `.env` or Settings DB | Environment secret `GEMINI_API_KEY` on cloud host | `GEMINI_API_KEY` env var |
| **Authentication** | Disabled on `localhost` (`AUTH_REQUIRED=false`) | HTTP Bearer / Password / OAuth proxy (Cloudflare Zero Trust or built-in Passcode middleware) | `APP_ACCESS_TOKEN` env var |

---

## 2. Step-by-Step Promotion Checklist (When Ready)

1. **Export Your Local Data**:
   - Open **Settings → Data & Backup** in your local app and click **Download Full Backup Archive (`.zip`)**, or copy `data/pen_ink.db` + `data/uploads/`.
2. **Provision Managed Database & Object Storage**:
   - Create a free/hobby PostgreSQL database (e.g., Neon or Supabase) and grab the `postgresql+psycopg://...` connection string.
   - Create a private Cloudflare R2 or S3 bucket for `pdfs/`, `pages/`, `samples/`, and `pens/`.
3. **Set Cloud Environment Variables**:
   ```env
   DATABASE_URL=postgresql+psycopg://user:pass@host:5432/pen_ink
   STORAGE_BACKEND=s3
   S3_BUCKET=my-pen-ink-uploads
   S3_ENDPOINT_URL=https://<account>.r2.cloudflarestorage.com
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   GEMINI_API_KEY=...
   APP_ACCESS_TOKEN=<strong-passphrase>
   ```
4. **Protect Access**:
   - For a personal single-user app, placing **Cloudflare Access (Zero Trust)** in front of your domain (free up to 50 users, supports Google/GitHub OTP login before traffic even hits your container) or setting `APP_ACCESS_TOKEN` keeps your notebook scans and collection completely private.
