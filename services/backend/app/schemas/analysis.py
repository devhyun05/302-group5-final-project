from collections.abc import Mapping
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
  BeforeValidator,
  ConfigDict,
  Field,
  StrictInt,
  StrictStr,
  field_validator,
  model_validator,
)
from pydantic.alias_generators import to_camel

from app.schemas.base import CamelModel
from app.schemas.face_profile import FaceProfileResultModel


FORBIDDEN_RAW_FACE_ARTIFACT_KEYS = frozenset({
  "calibration",
  "calibrationdata",
  "cameracalibration",
  "depthmap",
  "disparitymap",
  "faceprofile",
  "faceprofilesummary",
  "landmarks",
  "matte",
  "mattes",
  "pointcloud",
  "rawcalibration",
  "rawdepth",
  "rawdepthmap",
  "rawlandmarks",
  "rawmatte",
  "rawmattes",
  "roicoordinates",
  "roipixels",
  "roipolygon",
  "roipolygons",
  "semanticmatte",
  "semanticmattes",
  "trainingconsent",
  "traininguse",
  "traininguseallowed",
  "usefortraining",
})
FORBIDDEN_RAW_FACE_ARTIFACT_KEY_FRAGMENTS = (
  "calibration",
  "depth",
  "landmark",
  "matte",
  "pointcloud",
  "rawsensor",
  "training",
)


def _json_number(value: Any) -> Any:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    raise ValueError("must be a JSON number")
  return value


UnitNumber = Annotated[
  float,
  Field(ge=0, le=1, allow_inf_nan=False),
  BeforeValidator(_json_number),
]
VerticalRatioNumber = Annotated[
  float,
  Field(ge=0, le=10, allow_inf_nan=False),
  BeforeValidator(_json_number),
]
AnalysisLabel = Annotated[StrictStr, Field(min_length=1, max_length=128)]
AnalysisSummary = Annotated[StrictStr, Field(min_length=1, max_length=512)]
MediaText = Annotated[StrictStr, Field(min_length=1, max_length=4096)]
MediaDimension = Annotated[StrictInt, Field(ge=1, le=100_000)]


class StrictAnalysisRequestModel(CamelModel):
  model_config = ConfigDict(
    populate_by_name=True,
    extra="forbid",
    allow_inf_nan=False,
    alias_generator=to_camel,
  )


class FaceVerticalThirdsDisplayRatio(StrictAnalysisRequestModel):
  lower: VerticalRatioNumber
  middle: VerticalRatioNumber
  upper: VerticalRatioNumber | None


class FaceVerticalThirdsHairline(StrictAnalysisRequestModel):
  confidence: UnitNumber | None
  provider: AnalysisLabel | None


class FaceVerticalThirdsRequestPayload(StrictAnalysisRequestModel):
  confidence: UnitNumber | None
  display_ratio: FaceVerticalThirdsDisplayRatio
  dominant_part: AnalysisLabel | None
  hairline: FaceVerticalThirdsHairline
  status: Literal["full_success", "partial_success"]
  summary: AnalysisSummary


class PublicAnalysisRequestPayload(StrictAnalysisRequestModel):
  bucket: MediaText | None = None
  cdn_url: MediaText | None = None
  content_type: MediaText | None = None
  face_vertical_thirds: FaceVerticalThirdsRequestPayload | None = None
  height: MediaDimension | None = None
  image_url: MediaText | None = None
  media_id: MediaText | None = None
  object_key: MediaText | None = None
  preview_url: MediaText | None = None
  source: AnalysisLabel | None = None
  source_uri: MediaText | None = None
  source_url: MediaText | None = None
  task: AnalysisLabel | None = None
  width: MediaDimension | None = None


def _normalized_request_key(key: object) -> str:
  return "".join(
    character
    for character in str(key).casefold()
    if character.isalnum()
  )


def _is_forbidden_request_key(normalized: str) -> bool:
  return (
    normalized in FORBIDDEN_RAW_FACE_ARTIFACT_KEYS
    or any(
      fragment in normalized
      for fragment in FORBIDDEN_RAW_FACE_ARTIFACT_KEY_FRAGMENTS
    )
    or "token" in normalized
    or "roi" in normalized
    or "regionofinterest" in normalized
  )


def _reject_sensitive_request_content(value: Any) -> None:
  def visit(candidate: Any) -> None:
    if isinstance(candidate, Mapping):
      for key, nested in candidate.items():
        normalized = _normalized_request_key(key)
        if _is_forbidden_request_key(normalized):
          raise ValueError(
            "requestPayload must not contain raw face artifacts, tokens, "
            "or training aliases",
          )
        visit(nested)
    elif isinstance(candidate, (list, tuple)):
      for nested in candidate:
        visit(nested)

  visit(value)


def _reject_duplicate_request_aliases(value: Mapping) -> None:
  observed: set[str] = set()
  for key in value:
    normalized = _normalized_request_key(key)
    if normalized in observed:
      raise ValueError("requestPayload contains duplicate field aliases")
    observed.add(normalized)


def _canonical_public_request_payload(value: Any) -> dict:
  if not isinstance(value, Mapping):
    raise ValueError("requestPayload must be a JSON object")
  _reject_duplicate_request_aliases(value)
  validated = PublicAnalysisRequestPayload.model_validate(value)
  return validated.model_dump(
    mode="json",
    by_alias=True,
    exclude_unset=True,
  )


def validate_analysis_request_payload(
  value: Any,
) -> Any:
  _reject_sensitive_request_content(value)
  return _canonical_public_request_payload(value)


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
    return validate_analysis_request_payload(value)

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

  @field_validator("request_payload", mode="before")
  @classmethod
  def reject_legacy_raw_face_artifacts(cls, value: Any) -> Any:
    return validate_analysis_request_payload(value)


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
