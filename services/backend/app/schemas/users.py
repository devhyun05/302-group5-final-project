from datetime import date, datetime
from uuid import UUID

from app.schemas.base import APIModel


class UserProfileUpdate(APIModel):
    nickname: str | None = None
    phone: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    interest: str | None = None
    personal_color: str | None = None
    skin_type: str | None = None
    skin_tone: str | None = None
    tags: list[str] | None = None


class UserResponse(APIModel):
    id: UUID
    oauth_sub: str | None = None
    email: str | None = None
    name: str | None = None
    nickname: str
    phone: str | None = None
    birth_date: date | None = None
    gender: str
    interest: str | None = None
    personal_color: str | None = None
    skin_type: str | None = None
    skin_tone: str | None = None
    tags: list[str] | None = None
    avatar_media_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

