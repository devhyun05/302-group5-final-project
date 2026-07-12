from collections.abc import Mapping
from typing import Any
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.schemas.base import CamelModel
from app.schemas.face_profile import FaceProfileResultModel


class AnalysisJobCreate(CamelModel):
  model_config = ConfigDict(
    populate_by_name=True,
    extra="forbid",
    allow_inf_nan=False,
  )

  photo_capture_id: UUID = Field(alias="photoCaptureId")
  face_profile: FaceProfileResultModel = Field(alias="faceProfile")
  source_media_id: UUID | None = Field(default=None, alias="sourceMediaId")
  preview_media_id: UUID | None = Field(default=None, alias="previewMediaId")
  title: str = "AI makeup analysis"
  report_title: str | None = Field(default=None, alias="reportTitle")
  environment_label: str | None = Field(default=None, alias="environmentLabel")
  run_immediately: bool = Field(default=False, alias="runImmediately")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")

  @field_validator("request_payload", mode="before")
  @classmethod
  def reject_raw_face_artifacts(cls, value: Any) -> Any:
    forbidden_keys = {
      "rawlandmarks",
      "landmarks",
      "depthmap",
      "rawdepth",
      "calibrationdata",
      "semanticmatte",
      "semanticmattes",
      "roipixels",
      "faceprofile",
      "faceprofilesummary",
    }

    def visit(candidate: Any) -> None:
      if isinstance(candidate, Mapping):
        for key, nested in candidate.items():
          normalized = "".join(
            character
            for character in str(key).casefold()
            if character.isalnum()
          )
          is_native_token = (
            normalized.startswith("native")
            and normalized.endswith("token")
          )
          if normalized in forbidden_keys or is_native_token:
            raise ValueError(
              "requestPayload must not contain raw face artifacts or native tokens",
            )
          visit(nested)
      elif isinstance(candidate, (list, tuple)):
        for nested in candidate:
          visit(nested)

    visit(value)
    return value

  @model_validator(mode="after")
  def validate_face_profile_capture(self):
    if self.face_profile.capture_id != self.photo_capture_id:
      raise ValueError("faceProfile.captureId must match photoCaptureId")
    return self


class AnalysisJobReplay(CamelModel):
  """Internal-only shape for legacy queue/report restoration during migration."""

  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  face_profile: FaceProfileResultModel | None = Field(default=None, alias="faceProfile")
  source_media_id: UUID | None = Field(default=None, alias="sourceMediaId")
  preview_media_id: UUID | None = Field(default=None, alias="previewMediaId")
  title: str = "AI makeup analysis"
  report_title: str | None = Field(default=None, alias="reportTitle")
  environment_label: str | None = Field(default=None, alias="environmentLabel")
  run_immediately: bool = Field(default=False, alias="runImmediately")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")


class FeedbackJobCreate(CamelModel):
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  uploaded_media_id: UUID | None = Field(default=None, alias="uploadedMediaId")
  source: str = "camera"
  source_label: str | None = Field(default=None, alias="sourceLabel")
  run_immediately: bool = Field(default=False, alias="runImmediately")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")


class FeedbackConferenceMessagesCreate(CamelModel):
  result: dict = Field(default_factory=dict)
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")


class FilterExtractionJobCreate(CamelModel):
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  result_media_id: UUID | None = Field(default=None, alias="resultMediaId")
  title: str = "Extracted makeup filter"
  subtitle: str | None = None
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")

class FilterExtractionAnalyzeRequest(CamelModel):
  photo_capture_id: UUID | None = Field(default=None, alias="photoCaptureId")
  result_media_id: UUID | None = Field(default=None, alias="resultMediaId")
  reference_image_id: str | None = Field(default=None, alias="referenceImageId")
  title: str = "Reference makeup"
  subtitle: str | None = None
  run_ai: bool = Field(default=False, alias="runAi")
  request_payload: dict = Field(default_factory=dict, alias="requestPayload")
