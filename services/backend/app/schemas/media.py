from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.base import APIModel


class MediaAssetCreate(APIModel):
    media_kind: str = Field(default="face_photo", min_length=1)
    source: str = "camera"
    bucket: str | None = None
    object_key: str | None = None
    cdn_url: str | None = None
    content_type: str | None = None
    byte_size: int | None = None
    width: int | None = None
    height: int | None = None
    checksum_sha256: str | None = None
    original_filename: str | None = None
    is_original: bool = True
    status: str = "active"


class PresignedUploadCreate(APIModel):
    media_kind: str = "face_photo"
    source: str = "camera"
    content_type: str = "image/jpeg"
    original_filename: str | None = None
    byte_size: int | None = None


class MediaAssetComplete(APIModel):
    content_type: str | None = None
    byte_size: int | None = None
    width: int | None = None
    height: int | None = None
    checksum_sha256: str | None = None


class MediaAssetResponse(APIModel):
    id: UUID
    owner_user_id: UUID | None = None
    media_kind: str
    source: str
    bucket: str | None = None
    object_key: str | None = None
    cdn_url: str | None = None
    content_type: str | None = None
    byte_size: int | None = None
    width: int | None = None
    height: int | None = None
    checksum_sha256: str | None = None
    original_filename: str | None = None
    is_original: bool
    status: str
    created_at: datetime


class PresignedUploadResponse(APIModel):
    media_asset: MediaAssetResponse
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str]
    expires_in: int

