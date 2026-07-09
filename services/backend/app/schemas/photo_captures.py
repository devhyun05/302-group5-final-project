from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.base import APIModel


class PhotoCaptureCreate(APIModel):
    media_id: UUID
    capture_type: str = "face_analysis"
    source: str = "camera"
    status: str = "completed"
    device_payload: dict[str, Any] = Field(default_factory=dict)


class PhotoCaptureResponse(APIModel):
    id: UUID
    user_id: UUID
    media_id: UUID
    capture_type: str
    source: str
    status: str
    captured_at: datetime
    device_payload: dict[str, Any]
    created_at: datetime
