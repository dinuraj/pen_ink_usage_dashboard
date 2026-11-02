"""Portable StorageAdapter abstraction (Local filesystem today, S3/R2 ready tomorrow)."""

from __future__ import annotations

import logging
import mimetypes
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from .config import (
    CACHE_DIR,
    S3_ACCESS_KEY_ID,
    S3_BUCKET,
    S3_ENDPOINT_URL,
    S3_PUBLIC_URL_PREFIX,
    S3_REGION,
    S3_SECRET_ACCESS_KEY,
    STORAGE_BACKEND,
    UPLOADS_DIR,
)

logger = logging.getLogger(__name__)


class StorageAdapter(ABC):
    """Interface for storing and resolving uploaded PDFs, page renders, and cropped samples."""

    @abstractmethod
    def save_bytes(self, category: str, filename: str, data: bytes) -> str:
        """Persist bytes and return a relative storage key (e.g. 'samples/abc123.webp')."""

    @abstractmethod
    def resolve_path(self, relative_key: str) -> Path:
        """Resolve a relative storage key to a local Path (when backed by local storage or local cache)."""

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


class S3StorageAdapter(StorageAdapter):
    """Stores files in an S3-compatible bucket (Supabase Storage, Cloudflare R2, AWS S3)."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        session = boto3.session.Session()
        s3_kwargs = {
            "service_name": "s3",
            "region_name": S3_REGION or "us-east-1",
        }
        if S3_ENDPOINT_URL:
            s3_kwargs["endpoint_url"] = S3_ENDPOINT_URL
        if S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY:
            s3_kwargs["aws_access_key_id"] = S3_ACCESS_KEY_ID
            s3_kwargs["aws_secret_access_key"] = S3_SECRET_ACCESS_KEY

        s3_kwargs["config"] = Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        )
        self.s3_client = session.client(**s3_kwargs)
        self.bucket = S3_BUCKET
        self.cache_dir = CACHE_DIR

    def save_bytes(self, category: str, filename: str, data: bytes) -> str:
        ext = Path(filename).suffix.lower() or ".bin"
        safe_stem = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in Path(filename).stem)[:40]
        unique_name = f"{safe_stem}_{uuid.uuid4().hex[:8]}{ext}"
        relative_key = f"{category}/{unique_name}"

        content_type, _ = mimetypes.guess_type(filename)
        if not content_type:
            content_type = "application/octet-stream"

        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=relative_key,
            Body=data,
            ContentType=content_type,
        )

        cached_file = self.cache_dir / relative_key
        cached_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            cached_file.write_bytes(data)
        except OSError:
            pass

        return relative_key

    def resolve_path(self, relative_key: str) -> Path:
        clean_key = relative_key.lstrip("/").replace("..", "")
        cached_file = self.cache_dir / clean_key
        if cached_file.exists() and cached_file.is_file() and cached_file.stat().st_size > 0:
            return cached_file

        cached_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.s3_client.download_file(self.bucket, clean_key, str(cached_file))
        except Exception as e:
            logger.warning("Could not download %s from S3: %s", clean_key, e)
            local_fallback = UPLOADS_DIR / clean_key
            if local_fallback.exists() and local_fallback.is_file():
                return local_fallback
        return cached_file

    def get_public_url(self, relative_key: str | None) -> str | None:
        if not relative_key:
            return None
        if relative_key.startswith(("http://", "https://")):
            return relative_key

        clean_key = relative_key.lstrip("/")

        if S3_PUBLIC_URL_PREFIX:
            return f"{S3_PUBLIC_URL_PREFIX.rstrip('/')}/{clean_key}"

        if S3_ENDPOINT_URL and "supabase.co" in S3_ENDPOINT_URL:
            base = S3_ENDPOINT_URL.split("/storage/v1/s3")[0]
            return f"{base}/storage/v1/object/public/{self.bucket}/{clean_key}"

        return f"/media/{clean_key}"

    def delete(self, relative_key: str | None) -> None:
        if not relative_key:
            return
        clean_key = relative_key.lstrip("/").replace("..", "")
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=clean_key)
        except Exception as e:
            logger.warning("Could not delete %s from S3: %s", clean_key, e)
        cached_file = self.cache_dir / clean_key
        if cached_file.exists():
            cached_file.unlink(missing_ok=True)


def get_storage() -> StorageAdapter:
    """Factory returning configured storage backend."""
    if STORAGE_BACKEND == "s3":
        return S3StorageAdapter()
    return LocalStorageAdapter()


storage = get_storage()

