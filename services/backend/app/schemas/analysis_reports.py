from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from app.schemas.base import APIModel, serialize_row


class AnalysisReportCreate(APIModel):
    photo_capture_id: UUID
    force_mock: bool = False


class ImageAnalysisFacePointGuide(APIModel):
    brow: str
    blush: str
    highlight: str
    eyeshadow: str
    eyeliner: str
    lip: str


class ImageAnalysisMakeupCard(APIModel):
    id: str
    title: str
    subtitle: str
    description: str
    image_url: str | None = None
    tags: list[str]


class AnalysisReportResponse(APIModel):
    id: UUID
    user_id: UUID
    photo_capture_id: UUID | None = None
    source_media_id: UUID | None = None
    preview_media_id: UUID | None = None
    status: str
    ai_provider: str | None = None
    ai_model: str | None = None
    request_id: str | None = None
    error_message: str | None = None
    analyzed_at: datetime | None = None
    title: str
    report_title: str
    environment_label: str | None = None
    personal_color: str | None = None
    face_shape: str | None = None
    skin_type: str | None = None
    tone_summary: str | None = None
    recommended_mood: str | None = None
    summary: str | None = None
    short_summary: str | None = None
    skin_analysis_summary: str | None = None
    base_makeup_guide: str | None = None
    tags: list[str] | None = None
    detail_payload: dict[str, Any]
    face_point_guide: dict[str, Any] | None = None
    recommended_makeups: list[dict[str, Any]] = Field(default_factory=list)
    avoided_makeups: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


def serialize_analysis_report(row: dict[str, Any]) -> dict[str, Any]:
    serialized = serialize_row(row)
    detail_payload = serialized.get("detail_payload") or {}
    serialized["face_point_guide"] = detail_payload.get("facePointGuide")
    serialized["recommended_makeups"] = detail_payload.get("recommendedMakeups") or []
    serialized["avoided_makeups"] = detail_payload.get("avoidedMakeups") or []
    return serialized
