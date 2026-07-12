from datetime import datetime
from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.schemas.base import CamelModel
from app.schemas.face_profile import (
  FaceProfileResultModel,
  FaceProfileStatus,
  FaceShapeLabel,
  UnitNumber,
)
from app.schemas.users import ConsentType, FaceAnalysisConsentMetadata


DataT = TypeVar("DataT")
ConsentVersionWireKey = Literal[
  "cameraAnalysis",
  "aiProcessing",
  "thirdPartyAi",
]


class ResponseCamelModel(CamelModel):
  model_config = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
  )


class SuccessEnvelope(BaseModel, Generic[DataT]):
  model_config = ConfigDict(extra="forbid")

  data: DataT
  meta: dict[str, Any] = Field(default_factory=dict)
  error: None = None


class FaceAnalysisConsentRecord(ResponseCamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  id: UUID | None = None
  consent_type: ConsentType
  version: str
  active: bool
  accepted_at: datetime | None = None
  revoked_at: datetime | None = None
  metadata: FaceAnalysisConsentMetadata | None = None


class FaceAnalysisConsentStatusData(ResponseCamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  required_consent_types: list[ConsentType]
  consent_versions: dict[ConsentVersionWireKey, str]
  consents: list[FaceAnalysisConsentRecord]
  all_required_active: bool


class FaceAnalysisConsentData(ResponseCamelModel):
  consent: FaceAnalysisConsentRecord


class FaceAnalysisConsentRevocationData(ResponseCamelModel):
  consent_type: ConsentType
  revoked_count: int = Field(ge=0)
  active: Literal[False]


class FaceProfileSummaryResponse(ResponseCamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="forbid")

  status: FaceProfileStatus
  dominant_shape: FaceShapeLabel | None
  confidence_gap: UnitNumber | None
  schema_version: Literal["aura-face-profile-v1"]


class AnalysisReportSummaryResponse(ResponseCamelModel):
  model_config = ConfigDict(populate_by_name=True, extra="allow")

  id: UUID | None = None
  status: str | None = None
  has_face_profile: bool = False
  face_profile_summary: FaceProfileSummaryResponse | None = None


class AnalysisReportDetailResponse(AnalysisReportSummaryResponse):
  face_profile: FaceProfileResultModel | None = None


class AnalysisJobData(ResponseCamelModel):
  job: AnalysisReportDetailResponse


class AnalysisReportsData(ResponseCamelModel):
  reports: list[AnalysisReportSummaryResponse]


class AnalysisReportData(ResponseCamelModel):
  report: AnalysisReportDetailResponse


FaceAnalysisConsentStatusResponse = SuccessEnvelope[FaceAnalysisConsentStatusData]
FaceAnalysisConsentResponse = SuccessEnvelope[FaceAnalysisConsentData]
FaceAnalysisConsentRevocationResponse = SuccessEnvelope[
  FaceAnalysisConsentRevocationData
]
AnalysisJobResponse = SuccessEnvelope[AnalysisJobData]
AnalysisReportsResponse = SuccessEnvelope[AnalysisReportsData]
AnalysisReportResponse = SuccessEnvelope[AnalysisReportData]
