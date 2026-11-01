"""Portable StorageAdapter abstraction (Local filesystem today, S3/R2 ready tomorrow)."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from .config import STORAGE_BACKEND, UPLOADS_DIR


class StorageAdapter(ABC):
    """Interface for storing and resolving uploaded PDFs, page renders, and cropped samples."""

    @abstractmethod
    def save_bytes(self, category: str, filename: str, data: bytes) -> str:
        """Persist bytes and return a relative storage key (e.g. 'samples/abc123.webp')."""

    @abstractmethod
    def resolve_path(self, relative_key: str) -> Path:
        """Resolve a relative storage key to a local Path (when backed by local storage)."""

    @abstractmethod
    def get_public_url(self, relative_key: str | None) -> str | None:
        """Return URL consumable by the browser UI."""

    @abstractmethod
    def delete(self, relative_key: str | None) -> None:
        """Delete stored object if present."""


class LocalStorageAdapter(StorageAdapter):
    """Stores files on local disk under data/uploads/<category>/."""

    def __init__(self, root_dir: Path = UPLOADS_DIR) -> None:
        self.root_dir = root_dir
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def save_bytes(self, category: str, filename: str, data: bytes) -> str:
        ext = Path(filename).suffix.lower() or ".bin"
        safe_stem = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in Path(filename).stem)[:40]
        unique_name = f"{safe_stem}_{uuid.uuid4().hex[:8]}{ext}"
        folder = self.root_dir / category
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / unique_name
        target.write_bytes(data)
        return f"{category}/{unique_name}"

    def resolve_path(self, relative_key: str) -> Path:
        clean_key = relative_key.lstrip("/").replace("..", "")
        return self.root_dir / clean_key

    def get_public_url(self, relative_key: str | None) -> str | None:
        if not relative_key:
            return None
        if relative_key.startswith(("http://", "https://", "/media/")):
            return relative_key
        return f"/media/{relative_key.lstrip('/')}"

    def delete(self, relative_key: str | None) -> None:
        if not relative_key:
            return
        path = self.resolve_path(relative_key)
        if path.exists() and path.is_file():
            path.unlink(missing_ok=True)


def get_storage() -> StorageAdapter:
    """Factory returning configured storage backend."""
    if STORAGE_BACKEND == "local":
        return LocalStorageAdapter()
    # Cloud extension point: return S3StorageAdapter() when STORAGE_BACKEND == "s3"
    return LocalStorageAdapter()


storage = get_storage()
