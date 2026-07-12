from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import CamelModel


AccountDeletionReason = Literal[
  "low_usage",
  "missing_features",
  "difficult_to_use",
  "privacy_concerns",
  "restart_account",
  "other",
]


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


ConsentType = Literal["camera_analysis", "ai_processing", "third_party_ai"]


class FaceAnalysisConsentMetadata(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  surface: Literal["face_analysis"]
  raw_sensor_artifacts_stored: Literal[False] = Field(alias="rawSensorArtifactsStored")
  training_use_allowed: Literal[False] = Field(alias="trainingUseAllowed")

  @field_validator("raw_sensor_artifacts_stored", "training_use_allowed", mode="before")
  @classmethod
  def require_literal_false(cls, value):
    if value is not False:
      raise ValueError("Consent safety flags must be literal false.")
    return value

  @model_validator(mode="after")
  def reject_raw_sensor_storage_and_training(self):
    if self.raw_sensor_artifacts_stored:
      raise ValueError("Raw sensor artifacts must not be stored.")

    if self.training_use_allowed:
      raise ValueError("Face analysis data is not allowed for model training.")

    return self


class FaceAnalysisConsentAcceptance(CamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  version: str = Field(min_length=1, max_length=100)
  accepted: Literal[True]
  metadata: FaceAnalysisConsentMetadata

  @field_validator("accepted", mode="before")
  @classmethod
  def require_literal_true(cls, value):
    if value is not True:
      raise ValueError("Consent acceptance must be literal true.")
    return value

  @model_validator(mode="after")
  def require_positive_acceptance(self):
    if self.accepted is not True:
      raise ValueError("Consent acceptance must be true.")

    return self
