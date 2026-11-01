"""Dashboard analytics and shareable PDF export endpoints."""

from __future__ import annotations

from datetime import date
from typing import Any
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.analytics import build_dashboard_analytics
from ..services.pdf_export import generate_dashboard_pdf

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    return build_dashboard_analytics(db)


@router.get("/dashboard.pdf")
def export_dashboard_pdf(db: Session = Depends(get_db)) -> Response:
    """Generate a shareable 2-page vector PDF snapshot of the Home Page dashboard."""
    pdf_bytes = generate_dashboard_pdf(db)
    filename = f"Nib_and_Ink_Dashboard_{date.today().isoformat()}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
