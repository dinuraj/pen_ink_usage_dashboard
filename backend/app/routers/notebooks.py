"""Standalone Fountain Pen Notebooks & Paper inventory router."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Notebook
from ..schemas import NotebookCreate, NotebookOut, NotebookUpdate
from ..serializers import serialize_notebook

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])


@router.get("", response_model=list[NotebookOut])
def list_notebooks(db: Session = Depends(get_db)) -> list[NotebookOut]:
    notebooks = (
        db.query(Notebook)
        .order_by(Notebook.brand.asc(), Notebook.name.asc(), Notebook.id.desc())
        .all()
    )
    return [serialize_notebook(nb) for nb in notebooks]


@router.post("", response_model=NotebookOut)
def create_notebook(payload: NotebookCreate, db: Session = Depends(get_db)) -> NotebookOut:
    data = payload.model_dump()
    data["completion_pct"] = max(0, min(100, int(data.get("completion_pct") or 0)))
    nb = Notebook(**data)
    db.add(nb)
    db.commit()
    db.refresh(nb)
    return serialize_notebook(nb)


@router.patch("/{notebook_id}", response_model=NotebookOut)
def update_notebook(
    notebook_id: int,
    payload: NotebookUpdate,
    db: Session = Depends(get_db),
) -> NotebookOut:
    nb = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")

    for field, val in payload.model_dump(exclude_unset=True).items():
        if field == "completion_pct" and val is not None:
            val = max(0, min(100, int(val)))
        setattr(nb, field, val)

    db.commit()
    db.refresh(nb)
    return serialize_notebook(nb)


@router.delete("/{notebook_id}")
def delete_notebook(notebook_id: int, db: Session = Depends(get_db)) -> dict[str, str]:
    nb = db.query(Notebook).filter(Notebook.id == notebook_id).first()
    if not nb:
        raise HTTPException(status_code=404, detail="Notebook not found")
    db.delete(nb)
    db.commit()
    return {"status": "deleted"}
