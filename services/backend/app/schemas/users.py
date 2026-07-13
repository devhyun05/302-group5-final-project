from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


AccountDeletionReason = Literal[
  "low_usage",
  "missing_features",
  "difficult_to_use",
  "privacy_concerns",
  "restart_account",
  "other",
]

PushPlatform = Literal["ios", "android"]
PushProvider = Literal["fcm"]


class AccountDeletionRequest(CamelModel):
  reason: AccountDeletionReason | None = None


class ProfileUpdate(CamelModel):
  avatar_media_id: UUID | None = Field(default=None, alias="avatarMediaId")
  nickname: str | None = None
  phone: str | None = None
  birth_date: date | None = Field(default=None, alias="birthDate")
  gender: str | None = None
  interest: str | None = None
  personal_color: str | None = Field(default=None, alias="personalColor")
  skin_type: str | None = Field(default=None, alias="skinType")
  skin_tone: str | None = Field(default=None, alias="skinTone")
  tags: list[str] | None = None


class NotificationSettingsUpdate(CamelModel):
  push_enabled: bool = Field(alias="pushEnabled")


class PushDeviceRegister(CamelModel):
  app_bundle_id: str | None = Field(default=None, alias="appBundleId", max_length=255)
  platform: PushPlatform
  provider: PushProvider = "fcm"
  token: str = Field(min_length=20, max_length=4096)


class PushDeviceDisable(CamelModel):
  token: str = Field(min_length=20, max_length=4096)
