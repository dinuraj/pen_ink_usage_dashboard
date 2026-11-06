"""SQLAlchemy 2.0 ORM models for Pens, Inks, Usage Sessions, Lifecycle Events, and Scans."""

from __future__ import annotations

from datetime import date, datetime, timezone
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Pen(Base):
    __tablename__ = "pens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    brand: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    color_variant: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    nib_size: Mapped[str] = mapped_column(String(50), default="M", nullable=False)
    nib_material: Mapped[str] = mapped_column(String(60), default="Steel", nullable=False)
    filling_mechanism: Mapped[str] = mapped_column(String(60), default="Converter", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)  # active, retired, maintenance
    tags: Mapped[str] = mapped_column(String(250), default="", nullable=False)  # comma-separated: Everyday Use, Collectible, Vintage
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5 stars or None
    primary_photo_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    custom_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    photos: Mapped[list[PenPhoto]] = relationship(
        "PenPhoto", back_populates="pen", cascade="all, delete-orphan", order_by="PenPhoto.id.desc()"
    )
    sessions: Mapped[list[UsageSession]] = relationship(
        "UsageSession", back_populates="pen", cascade="all, delete-orphan", order_by="UsageSession.date_inked.desc()"
    )
    writing_samples: Mapped[list[WritingSample]] = relationship(
        "WritingSample", back_populates="pen", cascade="all, delete-orphan", order_by="WritingSample.sample_date.desc()"
    )
    merge_records: Mapped[list[PenMergeRecord]] = relationship(
        "PenMergeRecord",
        back_populates="target_pen",
        cascade="all, delete-orphan",
        order_by="PenMergeRecord.id.desc()",
    )

    @property
    def display_name(self) -> str:
        parts = [self.brand, self.model]
        if self.color_variant:
            parts.append(f"({self.color_variant})")
        return " ".join(parts)


class PenPhoto(Base):
    __tablename__ = "pen_photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pen_id: Mapped[int] = mapped_column(ForeignKey("pens.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    caption: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pen: Mapped[Pen] = relationship("Pen", back_populates="photos")


class Ink(Base):
    __tablename__ = "inks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    brand: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    color_family: Mapped[str] = mapped_column(String(50), default="Blue", nullable=False, index=True)
    hex_color: Mapped[str] = mapped_column(String(16), default="#1e40af", nullable=False)
    format: Mapped[str] = mapped_column(String(30), default="bottle", nullable=False)  # bottle, sample_vial, cartridge
    volume_ml: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    remaining_level: Mapped[str] = mapped_column(
        String(20), default="full", nullable=False
    )  # full, 75_pct, half, low, empty
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5 stars or None
    mountain_of_ink_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    properties_tags: Mapped[str] = mapped_column(String(250), default="", nullable=False)  # comma-separated optional tags
    custom_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    sessions: Mapped[list[UsageSession]] = relationship(
        "UsageSession", back_populates="ink", cascade="all, delete-orphan", order_by="UsageSession.date_inked.desc()"
    )
    writing_samples: Mapped[list[WritingSample]] = relationship(
        "WritingSample", back_populates="ink", cascade="all, delete-orphan", order_by="WritingSample.sample_date.desc()"
    )

    @property
    def display_name(self) -> str:
        return f"{self.brand} {self.name}".strip()


class UsageSession(Base):
    """One fill cycle of a Pen with an Ink (from Date Inked until Cleaned/Emptied)."""

    __tablename__ = "usage_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pen_id: Mapped[int] = mapped_column(ForeignKey("pens.id", ondelete="CASCADE"), nullable=False, index=True)
    ink_id: Mapped[int] = mapped_column(ForeignKey("inks.id", ondelete="CASCADE"), nullable=False, index=True)
    date_inked: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    date_cleaned: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    end_status: Mapped[str] = mapped_column(
        String(30), default="active", nullable=False, index=True
    )  # active, cleaned, emptied
    refill_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5 stars for pairing satisfaction
    session_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pen: Mapped[Pen] = relationship("Pen", back_populates="sessions")
    ink: Mapped[Ink] = relationship("Ink", back_populates="sessions")
    events: Mapped[list[LifecycleEvent]] = relationship(
        "LifecycleEvent",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="LifecycleEvent.event_date.asc(), LifecycleEvent.id.asc()",
    )
    samples: Mapped[list[WritingSample]] = relationship(
        "WritingSample", back_populates="session", cascade="all, delete-orphan"
    )


class LifecycleEvent(Base):
    """Granular events inside a UsageSession: inked, refilled, cleaned, emptied."""

    __tablename__ = "lifecycle_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("usage_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True
    )  # inked, refilled, cleaned, emptied
    event_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(30), default="manual_ui", nullable=False)  # pdf_scan, manual_ui, seed
    notes: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped[UsageSession] = relationship("UsageSession", back_populates="events")


class ScanBatch(Base):
    """An uploaded multi-page PDF scan (or image batch) of the physical notebook."""

    __tablename__ = "scan_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    pdf_storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="uploaded", nullable=False)  # uploaded, reviewed, committed
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    pages: Mapped[list[ScanPage]] = relationship(
        "ScanPage", back_populates="batch", cascade="all, delete-orphan", order_by="ScanPage.page_number.asc()"
    )


class ScanPage(Base):
    """Rendered high-DPI image of an individual page from a ScanBatch."""

    __tablename__ = "scan_pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("scan_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-based
    image_storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    extracted_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    batch: Mapped[ScanBatch] = relationship("ScanBatch", back_populates="pages")
    samples: Mapped[list[WritingSample]] = relationship("WritingSample", back_populates="scan_page")


class WritingSample(Base):
    """Cropped handwriting / scribble cutout associated with an Ink, Pen, and UsageSession."""

    __tablename__ = "writing_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("usage_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pen_id: Mapped[int] = mapped_column(ForeignKey("pens.id", ondelete="CASCADE"), nullable=False, index=True)
    ink_id: Mapped[int] = mapped_column(ForeignKey("inks.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_page_id: Mapped[int | None] = mapped_column(
        ForeignKey("scan_pages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    image_storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    crop_box_json: Mapped[str] = mapped_column(
        String(255), default="", nullable=False
    )  # JSON {"x":0..1, "y":0..1, "w":0..1, "h":0..1}
    sample_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5 stars for writing sample satisfaction
    transcription: Mapped[str] = mapped_column(Text, default="", nullable=False)
    caption: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session: Mapped[UsageSession | None] = relationship("UsageSession", back_populates="samples")
    pen: Mapped[Pen] = relationship("Pen", back_populates="writing_samples")
    ink: Mapped[Ink] = relationship("Ink", back_populates="writing_samples")
    scan_page: Mapped[ScanPage | None] = relationship("ScanPage", back_populates="samples")


class PenMergeRecord(Base):
    """Reversible audit log of merged duplicate Pens so merges can be undone later."""

    __tablename__ = "pen_merge_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    target_pen_id: Mapped[int] = mapped_column(
        ForeignKey("pens.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_snapshot_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    moved_session_ids_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    moved_sample_ids_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    moved_photo_ids_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    auto_closed_sessions_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    target_pen: Mapped[Pen] = relationship("Pen", back_populates="merge_records")


class Notebook(Base):
    """Standalone Fountain Pen Notebook & Paper tracker."""

    __tablename__ = "notebooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    brand: Mapped[str] = mapped_column(String(120), nullable=False, index=True)  # Name of company
    name: Mapped[str] = mapped_column(String(180), nullable=False, index=True)  # Book name
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    binding_type: Mapped[str] = mapped_column(String(80), default="Thread-Bound", nullable=False)
    size: Mapped[str] = mapped_column(String(50), default="A5", nullable=False)
    ruling: Mapped[str] = mapped_column(String(50), default="Dot Grid", nullable=False)
    paper_type: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    paper_gsm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_type: Mapped[str] = mapped_column(String(80), default="Daily Journal", nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="in_use", nullable=False, index=True
    )  # in_use, stash, finished
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completion_pct: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0..100
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..5 stars or None
    custom_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AppSetting(Base):
    """Key-value store for local app configuration (e.g., Gemini API key, preferences)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
