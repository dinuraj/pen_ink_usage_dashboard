"""Pydantic v2 request and response schemas for the REST API."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# ---------- Shared Summaries ----------

class PenBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    brand: str
    model: str
    color_variant: str
    nib_size: str
    nib_material: str
    filling_mechanism: str
    tags: list[str] = []
    primary_photo_url: str | None = None


class InkBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    brand: str
    name: str
    color_family: str
    hex_color: str
    format: str
    remaining_level: str
    mountain_of_ink_url: str = ""


class ActivePairingSummary(BaseModel):
    session_id: int
    ink_id: int
    ink_brand: str
    ink_name: str
    ink_hex: str
    date_inked: date
    days_inked: int
    refill_count: int


# ---------- Pen Schemas ----------

class PenCreate(BaseModel):
    brand: str = Field(..., min_length=1, max_length=120)
    model: str = Field(..., min_length=1, max_length=160)
    color_variant: str = ""
    nib_size: str = "M"
    nib_material: str = "Steel"
    filling_mechanism: str = "Converter"
    status: str = "active"
    tags: list[str] | str = []
    rating: int | None = Field(default=None, ge=1, le=5)
    custom_notes: str = ""


class PenUpdate(BaseModel):
    brand: str | None = None
    model: str | None = None
    color_variant: str | None = None
    nib_size: str | None = None
    nib_material: str | None = None
    filling_mechanism: str | None = None
    status: str | None = None
    tags: list[str] | str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    custom_notes: str | None = None


class PenPhotoOut(BaseModel):
    id: int
    url: str
    caption: str
    created_at: datetime


class PenOut(BaseModel):
    id: int
    brand: str
    model: str
    color_variant: str
    nib_size: str
    nib_material: str
    filling_mechanism: str
    status: str
    tags: list[str] = []
    rating: int | None = None
    primary_photo_url: str | None = None
    custom_notes: str
    is_currently_inked: bool = False
    active_pairing: ActivePairingSummary | None = None
    times_inked: int = 0
    total_refills: int = 0
    total_days_inked: int = 0
    avg_days_inked: float = 0.0
    last_used_date: date | None = None
    last_cleaned_date: date | None = None
    sample_count: int = 0


# ---------- Ink Schemas ----------

class InkCreate(BaseModel):
    brand: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=160)
    color_family: str = "Blue"
    hex_color: str = "#1e40af"
    format: str = "bottle"
    volume_ml: float = 50.0
    remaining_level: str = "full"
    quantity: int = 1
    rating: int | None = Field(default=None, ge=1, le=5)
    mountain_of_ink_url: str = ""
    properties_tags: str = ""
    custom_notes: str = ""


class InkUpdate(BaseModel):
    brand: str | None = None
    name: str | None = None
    color_family: str | None = None
    hex_color: str | None = None
    format: str | None = None
    volume_ml: float | None = None
    remaining_level: str | None = None
    quantity: int | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    mountain_of_ink_url: str | None = None
    properties_tags: str | None = None
    custom_notes: str | None = None


class InkOut(BaseModel):
    id: int
    brand: str
    name: str
    color_family: str
    hex_color: str
    format: str
    volume_ml: float
    remaining_level: str
    quantity: int
    rating: int | None = None
    mountain_of_ink_url: str
    properties_tags: str
    custom_notes: str
    currently_in_pens_count: int = 0
    times_inked: int = 0
    total_refills: int = 0
    distinct_pens_count: int = 0
    total_days_inked: int = 0
    last_used_date: date | None = None
    sample_count: int = 0


# ---------- Notebook Schemas ----------

class NotebookCreate(BaseModel):
    brand: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=180)
    page_count: int | None = Field(default=None, ge=1, le=5000)
    binding_type: str = "Thread-Bound"
    size: str = "A5"
    ruling: str = "Dot Grid"
    paper_type: str = ""
    paper_gsm: int | None = Field(default=None, ge=20, le=600)
    usage_type: str = "Daily Journal"
    status: str = "in_use"  # in_use, stash, finished
    start_date: date | None = None
    end_date: date | None = None
    completion_pct: int = Field(default=0, ge=0, le=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    custom_notes: str = ""


class NotebookUpdate(BaseModel):
    brand: str | None = None
    name: str | None = None
    page_count: int | None = Field(default=None, ge=1, le=5000)
    binding_type: str | None = None
    size: str | None = None
    ruling: str | None = None
    paper_type: str | None = None
    paper_gsm: int | None = Field(default=None, ge=20, le=600)
    usage_type: str | None = None
    status: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    completion_pct: int | None = Field(default=None, ge=0, le=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    custom_notes: str | None = None


class NotebookOut(BaseModel):
    id: int
    brand: str
    name: str
    page_count: int | None = None
    binding_type: str
    size: str
    ruling: str
    paper_type: str
    paper_gsm: int | None = None
    usage_type: str
    status: str
    start_date: date | None = None
    end_date: date | None = None
    completion_pct: int = 0
    rating: int | None = None
    custom_notes: str = ""
    created_at: datetime
    updated_at: datetime


# ---------- Sessions, Lifecycle & Samples ----------

class LifecycleEventOut(BaseModel):
    id: int
    session_id: int
    event_type: str
    event_date: date
    source: str
    notes: str


class WritingSampleOut(BaseModel):
    id: int
    session_id: int | None = None
    pen_id: int
    ink_id: int
    scan_page_id: int | None = None
    scan_batch_id: int | None = None
    scan_page_number: int | None = None
    image_url: str
    crop_box_json: str = ""
    sample_date: date
    transcription: str = ""
    caption: str = ""
    pen: PenBrief
    ink: InkBrief


class SessionCreate(BaseModel):
    pen_id: int
    ink_id: int
    date_inked: date
    date_cleaned: date | None = None
    end_status: Literal["active", "cleaned", "emptied"] = "active"
    session_notes: str = ""
    close_previous_active: bool = True
    previous_close_date: date | None = None
    source: str = "manual_ui"


class RefillAction(BaseModel):
    event_date: date
    notes: str = ""


class CleanAction(BaseModel):
    event_date: date
    end_status: Literal["cleaned", "emptied"] = "cleaned"
    notes: str = ""


class SessionOut(BaseModel):
    id: int
    pen_id: int
    ink_id: int
    date_inked: date
    date_cleaned: date | None
    end_status: str
    days_active: int
    refill_count: int
    session_notes: str
    pen: PenBrief
    ink: InkBrief
    events: list[LifecycleEventOut] = []
    samples: list[WritingSampleOut] = []


# ---------- Scan Studio Schemas ----------

class CropBox(BaseModel):
    """Normalized [0..1] crop rectangle relative to page width/height."""

    x: float = Field(0.05, ge=0.0, le=1.0)
    y: float = Field(0.05, ge=0.0, le=1.0)
    w: float = Field(0.90, ge=0.01, le=1.0)
    h: float = Field(0.28, ge=0.01, le=1.0)


class ExtractedEntryCandidate(BaseModel):
    entry_uid: str
    page_id: int
    page_number: int
    date_inked: date
    raw_pen_text: str = ""
    pen_brand: str = ""
    pen_model: str = ""
    pen_color: str = ""
    nib_size: str = "M"
    matched_pen_id: int | None = None
    pen_match_confidence: float = 0.0
    raw_ink_text: str = ""
    ink_brand: str = ""
    ink_name: str = ""
    suggested_hex: str = "#1e3a8a"
    suggested_color_family: str = "Blue"
    matched_ink_id: int | None = None
    ink_match_confidence: float = 0.0
    transcription: str = ""
    crop_box: CropBox
    is_duplicate: bool = False
    skip: bool = False


class SessionUpdate(BaseModel):
    pen_id: int | None = None
    ink_id: int | None = None
    date_inked: date | None = None
    date_cleaned: date | None = None
    end_status: Literal["active", "cleaned", "emptied"] | None = None
    session_notes: str | None = None


class SampleCorrectionUpdate(BaseModel):
    pen_id: int | None = None
    new_pen: PenCreate | None = None
    ink_id: int | None = None
    new_ink: InkCreate | None = None
    sample_date: date | None = None
    date_cleaned: date | None = None
    clear_date_cleaned: bool = False
    end_status: Literal["active", "cleaned", "emptied"] | None = None
    transcription: str | None = None
    caption: str | None = None
    session_notes: str | None = None
    crop_box: CropBox | None = None


class AddEntryOnPageRequest(BaseModel):
    date_inked: date
    date_cleaned: date | None = None
    pen_id: int | None = None
    new_pen: PenCreate | None = None
    ink_id: int | None = None
    new_ink: InkCreate | None = None
    end_status: Literal["active", "cleaned", "emptied"] = "cleaned"
    crop_box: CropBox
    transcription: str = ""
    caption: str = ""
    session_notes: str = ""


class MergeTargetRequest(BaseModel):
    target_id: int


class PenMergeRecordOut(BaseModel):
    id: int
    target_pen_id: int
    source_label: str
    source_brand: str
    source_model: str
    source_color_variant: str = ""
    source_nib_size: str = "M"
    moved_sessions_count: int = 0
    moved_samples_count: int = 0
    created_at: str


class BulkPenMergeRequest(BaseModel):
    target_pen_id: int
    source_pen_ids: list[int]
    updated_target: PenUpdate | None = None


class SplitPenSessionsRequest(BaseModel):
    session_ids: list[int] = []
    standalone_sample_ids: list[int] = []
    target_pen_id: int | None = None
    new_pen: PenCreate | None = None


class ImportedPageEntryOut(BaseModel):
    sample_id: int
    session_id: int | None = None
    page_id: int
    page_number: int
    pen_id: int
    ink_id: int
    sample_date: date
    date_cleaned: date | None = None
    end_status: str = "cleaned"
    image_url: str
    crop_box: CropBox
    transcription: str = ""
    caption: str = ""
    session_notes: str = ""
    pen: PenBrief
    ink: InkBrief


class ScanPageOut(BaseModel):
    id: int
    batch_id: int
    page_number: int
    image_url: str
    width_px: int
    height_px: int
    processed: bool
    candidates: list[ExtractedEntryCandidate] = []
    imported_entries: list[ImportedPageEntryOut] = []


class ScanBatchOut(BaseModel):
    id: int
    original_filename: str
    pdf_url: str
    page_count: int
    status: str
    is_demo: bool
    uploaded_at: datetime
    pages: list[ScanPageOut] = []


class AnalyzeScanRequest(BaseModel):
    page_numbers: list[int] | None = None  # None = all pages


class CommitScanEntry(BaseModel):
    page_id: int
    date_inked: date
    pen_id: int | None = None
    new_pen: PenCreate | None = None
    ink_id: int | None = None
    new_ink: InkCreate | None = None
    crop_box: CropBox
    transcription: str = ""
    caption: str = ""
    session_notes: str = ""
    close_previous_active: bool = True


class CommitScanRequest(BaseModel):
    entries: list[CommitScanEntry]
