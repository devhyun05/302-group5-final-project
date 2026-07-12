import json
import re
from datetime import datetime
from functools import cmp_to_key
from typing import Annotated, Any, Generic, Literal, Mapping, TypeVar
from uuid import UUID

from pydantic import (
  BeforeValidator,
  ConfigDict,
  Field,
  StrictBool,
  StringConstraints,
  field_validator,
  model_serializer,
  model_validator,
)
from pydantic.alias_generators import to_camel

from app.schemas.base import CamelModel


FACE_PROFILE_SCHEMA_VERSION = "aura-face-profile-v1"
FACE_PROFILE_MAX_BYTES = 256 * 1024
FACE_PROFILE_MAX_WARNING_COUNT = 32
FACE_PROFILE_MAX_TRAIT_COUNT = 8
FACE_PROFILE_MAX_SHORT_STRING_LENGTH = 128
FACE_SHAPE_SCORE_TOLERANCE = 1e-6
ISO_TIMESTAMP_PATTERN = re.compile(
  r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$",
)

FACE_SHAPE_LABELS = (
  "oval",
  "round",
  "square",
  "heart",
  "oblong",
  "diamond",
  "triangle",
)

FORBIDDEN_PROFILE_KEYS = frozenset({
  "landmarks",
  "rawlandmarks",
  "depthmap",
  "rawdepth",
  "calibrationdata",
  "pixel",
  "pixels",
  "rawpixel",
  "rawpixels",
  "roipixel",
  "roipixels",
  "polygon",
  "polygons",
  "rawpolygon",
  "rawpolygons",
  "roipolygon",
  "roipolygons",
  "matte",
  "mattes",
  "rawmatte",
  "rawmattes",
  "semanticmatte",
  "semanticmattes",
  "artifacturi",
  "artifacturis",
  "rawartifacturi",
  "rawartifacturis",
  "trainingconsent",
})


def _number_only(value: Any) -> Any:
  if isinstance(value, bool) or not isinstance(value, (int, float)):
    raise ValueError("must be a JSON number")
  return value


FiniteNumber = Annotated[
  float,
  BeforeValidator(_number_only),
  Field(allow_inf_nan=False),
]
UnitNumber = Annotated[
  float,
  BeforeValidator(_number_only),
  Field(ge=0, le=1, allow_inf_nan=False),
]
NonNegativeNumber = Annotated[
  float,
  BeforeValidator(_number_only),
  Field(ge=0, allow_inf_nan=False),
]
ShortString = Annotated[
  str,
  StringConstraints(
    strip_whitespace=False,
    min_length=1,
    max_length=FACE_PROFILE_MAX_SHORT_STRING_LENGTH,
  ),
]
ShortStringAllowEmpty = Annotated[
  str,
  StringConstraints(
    strip_whitespace=False,
    max_length=FACE_PROFILE_MAX_SHORT_STRING_LENGTH,
  ),
]
WarningList = Annotated[
  list[ShortString],
  Field(max_length=FACE_PROFILE_MAX_WARNING_COUNT),
]
TraitList = Annotated[
  list[ShortString],
  Field(max_length=FACE_PROFILE_MAX_TRAIT_COUNT),
]

FaceProfileStatus = Literal[
  "full_success",
  "partial_success",
  "blocked",
  "failed",
]
FaceShapeLabel = Literal[
  "oval",
  "round",
  "square",
  "heart",
  "oblong",
  "diamond",
  "triangle",
]
FaceMeasurementSource = Literal[
  "truedepth_3d",
  "mediapipe_2d",
  "apple_semantic_matte",
  "pixel_roi",
  "camera_metadata",
  "derived",
  "estimated",
]
PersonalColor12Type = Literal[
  "spring_light",
  "spring_bright",
  "spring_true",
  "summer_light",
  "summer_true",
  "summer_muted",
  "autumn_muted",
  "autumn_true",
  "autumn_deep",
  "winter_bright",
  "winter_true",
  "winter_deep",
]


class StrictFaceProfileModel(CamelModel):
  model_config = ConfigDict(
    populate_by_name=True,
    alias_generator=to_camel,
    extra="forbid",
    allow_inf_nan=False,
  )


MeasurementValue = TypeVar("MeasurementValue")


class FaceMeasurementModel(
  StrictFaceProfileModel,
  Generic[MeasurementValue],
):
  value: MeasurementValue | None
  confidence: UnitNumber
  source: FaceMeasurementSource
  null_reason: ShortString | None = Field(default=None, alias="nullReason")
  warnings: WarningList

  @model_validator(mode="after")
  def validate_null_reason(self):
    supplied = "null_reason" in self.model_fields_set
    if self.value is None and not self.null_reason:
      raise ValueError("nullReason is required when measurement value is null")
    if self.value is not None and supplied:
      raise ValueError("nullReason is forbidden when measurement value is present")
    return self

  @model_serializer(mode="wrap")
  def serialize_measurement(self, handler):
    serialized = handler(self)
    if self.value is not None:
      serialized.pop("nullReason", None)
      serialized.pop("null_reason", None)
    return serialized


NumberMeasurement = FaceMeasurementModel[FiniteNumber]
BooleanMeasurement = FaceMeasurementModel[StrictBool]
DepthAccuracyMeasurement = FaceMeasurementModel[Literal["absolute", "relative"]]


class FaceProfileQuality(StrictFaceProfileModel):
  face_count: NumberMeasurement
  landmark_count: NumberMeasurement
  yaw_deg: NumberMeasurement
  pitch_deg: NumberMeasurement
  roll_deg: NumberMeasurement
  frontal_score: NumberMeasurement
  centered_score: NumberMeasurement
  framing_score: NumberMeasurement
  camera_distance_meters: NumberMeasurement
  screen_coverage_ratio: NumberMeasurement
  camera_stability: NumberMeasurement
  blur_score: NumberMeasurement
  lighting_score: NumberMeasurement
  overexposure_risk: NumberMeasurement
  underexposure_risk: NumberMeasurement
  colored_lighting_risk: NumberMeasurement
  neutral_expression_score: NumberMeasurement
  eye_closure_risk: NumberMeasurement
  mouth_open_risk: NumberMeasurement
  hairline_confidence: NumberMeasurement
  occlusion_risk: NumberMeasurement
  landmark_confidence: NumberMeasurement
  depth_available: BooleanMeasurement
  depth_accuracy: DepthAccuracyMeasurement
  depth_filtered: BooleanMeasurement
  depth_valid_sample_ratio: NumberMeasurement
  depth_median_absolute_deviation_meters: NumberMeasurement
  depth_confidence: NumberMeasurement
  face_plane_pitch_deg: NumberMeasurement
  face_plane_yaw_deg: NumberMeasurement
  face_plane_roll_deg: NumberMeasurement
  face_plane_confidence: NumberMeasurement
  blocking_reasons: WarningList


class FaceColorSampleLab(StrictFaceProfileModel):
  lightness: FiniteNumber = Field(alias="L")
  a: FiniteNumber
  b: FiniteNumber


class FaceColorSampleRgb(StrictFaceProfileModel):
  r: FiniteNumber
  g: FiniteNumber
  b: FiniteNumber


class FaceColorSample(StrictFaceProfileModel):
  hex: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
  lab: FaceColorSampleLab
  rgb: FaceColorSampleRgb


ColorSampleMeasurement = FaceMeasurementModel[FaceColorSample]


class PersonalColorAxis(StrictFaceProfileModel):
  value: FiniteNumber | None
  confidence: UnitNumber


class PersonalColorAxes(StrictFaceProfileModel):
  temperature: PersonalColorAxis
  value: PersonalColorAxis
  chroma: PersonalColorAxis
  clarity: PersonalColorAxis
  contrast: PersonalColorAxis


class PersonalColorRelations(StrictFaceProfileModel):
  d_l_skin_hair: FiniteNumber | None = Field(alias="dLSkinHair")
  d_l_skin_lip: FiniteNumber | None = Field(alias="dLSkinLip")
  d_e00_skin_hair: FiniteNumber | None = Field(alias="dE00SkinHair")
  d_e00_skin_lip: FiniteNumber | None = Field(alias="dE00SkinLip")


class PersonalColorToneScores(StrictFaceProfileModel):
  spring_light: UnitNumber
  spring_bright: UnitNumber
  spring_true: UnitNumber
  summer_light: UnitNumber
  summer_true: UnitNumber
  summer_muted: UnitNumber
  autumn_muted: UnitNumber
  autumn_true: UnitNumber
  autumn_deep: UnitNumber
  winter_bright: UnitNumber
  winter_true: UnitNumber
  winter_deep: UnitNumber


class PersonalColorToneDistances(StrictFaceProfileModel):
  spring_light: FiniteNumber
  spring_bright: FiniteNumber
  spring_true: FiniteNumber
  summer_light: FiniteNumber
  summer_true: FiniteNumber
  summer_muted: FiniteNumber
  autumn_muted: FiniteNumber
  autumn_true: FiniteNumber
  autumn_deep: FiniteNumber
  winter_bright: FiniteNumber
  winter_true: FiniteNumber
  winter_deep: FiniteNumber


class PersonalColorTone(StrictFaceProfileModel):
  top: PersonalColor12Type
  secondary: PersonalColor12Type | None
  season: Literal["spring", "summer", "autumn", "winter"]
  score: UnitNumber
  gap: UnitNumber
  tone_scores: PersonalColorToneScores
  tone_distances: PersonalColorToneDistances


class PersonalColorPalette(StrictFaceProfileModel):
  best_family_ids: Annotated[
    list[ShortString],
    Field(max_length=FACE_PROFILE_MAX_WARNING_COUNT),
  ]
  worst_family_ids: Annotated[
    list[ShortString],
    Field(max_length=FACE_PROFILE_MAX_WARNING_COUNT),
  ]


class PersonalColorSummary(StrictFaceProfileModel):
  status: Literal["definitive", "mixed", "provisional", "insufficient"]
  measurement_confidence: UnitNumber
  axes: PersonalColorAxes
  relations: PersonalColorRelations
  tone: PersonalColorTone | None
  palette: PersonalColorPalette
  calibration_applied: StrictBool
  calibration_version: ShortString | None
  warnings: WarningList

  @model_validator(mode="after")
  def validate_tone_availability(self):
    if self.tone is None and self.status != "insufficient":
      raise ValueError("tone may be null only when personal color is insufficient")
    return self


PersonalColorMeasurement = FaceMeasurementModel[PersonalColorSummary]


class FaceProfileColor(StrictFaceProfileModel):
  overall_face_contrast: NumberMeasurement
  eye_skin_contrast: NumberMeasurement
  brow_skin_contrast: NumberMeasurement
  lip_skin_contrast: NumberMeasurement
  skin_evenness: NumberMeasurement
  redness: NumberMeasurement
  yellowness: NumberMeasurement
  skin_color: ColorSampleMeasurement
  hair_color: ColorSampleMeasurement
  lip_color: ColorSampleMeasurement
  left_eye_color: ColorSampleMeasurement
  right_eye_color: ColorSampleMeasurement
  left_brow_color: ColorSampleMeasurement
  right_brow_color: ColorSampleMeasurement
  personal_color: PersonalColorMeasurement


class FaceProfileBalance(StrictFaceProfileModel):
  face_length_to_width: NumberMeasurement
  face_length_to_cheek_width: NumberMeasurement
  upper_third_ratio: NumberMeasurement
  middle_third_ratio: NumberMeasurement
  lower_third_ratio: NumberMeasurement
  forehead_width_to_cheek_width: NumberMeasurement
  temple_width_to_cheek_width: NumberMeasurement
  jaw_width_to_cheek_width: NumberMeasurement
  chin_width_to_cheek_width: NumberMeasurement
  cheek_to_jaw_ratio: NumberMeasurement
  cheek_dominance: NumberMeasurement
  jawline_length_ratio: NumberMeasurement
  jaw_angle_deg: NumberMeasurement
  jaw_width_score: NumberMeasurement
  jaw_angle_score: NumberMeasurement
  jaw_softness: NumberMeasurement
  chin_pointedness: NumberMeasurement
  contour_roundness: NumberMeasurement
  forehead_dominance: NumberMeasurement
  lower_face_weight: NumberMeasurement
  contour_asymmetry: NumberMeasurement


class FaceProfileEyesAndBrows(StrictFaceProfileModel):
  left_eye_aspect_ratio: NumberMeasurement
  right_eye_aspect_ratio: NumberMeasurement
  inter_eye_distance_ratio: NumberMeasurement
  left_eye_canthal_tilt_deg: NumberMeasurement
  right_eye_canthal_tilt_deg: NumberMeasurement
  left_brow_eye_distance_ratio: NumberMeasurement
  right_brow_eye_distance_ratio: NumberMeasurement
  left_brow_tilt_deg: NumberMeasurement
  right_brow_tilt_deg: NumberMeasurement
  eye_asymmetry: NumberMeasurement
  brow_asymmetry: NumberMeasurement


class FaceProfileNose(StrictFaceProfileModel):
  nose_length_ratio: NumberMeasurement
  nose_width_ratio: NumberMeasurement
  nose_to_midface_ratio: NumberMeasurement
  nose_tip_to_mouth_ratio: NumberMeasurement
  centerline_asymmetry: NumberMeasurement


class FaceProfileMouth(StrictFaceProfileModel):
  lip_fullness_ratio: NumberMeasurement
  mouth_width_ratio: NumberMeasurement
  upper_to_lower_lip_ratio: NumberMeasurement
  left_corner_tilt_deg: NumberMeasurement
  right_corner_tilt_deg: NumberMeasurement
  mouth_asymmetry: NumberMeasurement


class FaceShapeScores(StrictFaceProfileModel):
  oval: UnitNumber
  round: UnitNumber
  square: UnitNumber
  heart: UnitNumber
  oblong: UnitNumber
  diamond: UnitNumber
  triangle: UnitNumber


class FaceShapeTopItem(StrictFaceProfileModel):
  shape: FaceShapeLabel
  score: FiniteNumber


class FaceShapeRuleFeatureSummary(StrictFaceProfileModel):
  face_length_to_cheek_width: FiniteNumber | None
  forehead_width_to_cheek_width: FiniteNumber | None
  temple_width_to_cheek_width: FiniteNumber | None
  jaw_width_to_cheek_width: FiniteNumber | None
  chin_width_to_cheek_width: FiniteNumber | None
  cheek_dominance: FiniteNumber | None
  jaw_width_score: FiniteNumber | None
  jaw_angle_score: FiniteNumber | None
  chin_pointedness: FiniteNumber | None
  contour_roundness: FiniteNumber | None
  forehead_dominance: FiniteNumber | None
  lower_face_weight: FiniteNumber | None
  frontal_confidence: UnitNumber
  landmark_confidence: UnitNumber
  hairline_confidence: UnitNumber
  face_length_to_width: FiniteNumber | None = None
  jaw_angle_deg: FiniteNumber | None = None
  jaw_softness: FiniteNumber | None = None
  contour_asymmetry: FiniteNumber | None = None


class FaceShapeRuleResult(StrictFaceProfileModel):
  status: Literal["ready", "mixed", "blocked"]
  dominant_shape: FaceShapeLabel | None
  face_shape_scores: FaceShapeScores
  top2: Annotated[list[FaceShapeTopItem], Field(max_length=2)]
  confidence_gap: UnitNumber | None
  overall_confidence: UnitNumber
  classifier_type: Literal["rule_v1"]
  classifier_version: ShortString
  explanation_traits: TraitList
  rule_features: FaceShapeRuleFeatureSummary
  warnings: WarningList

  @model_validator(mode="after")
  def validate_shape_state(self):
    scores = {
      label: getattr(self.face_shape_scores, label)
      for label in FACE_SHAPE_LABELS
    }
    if self.status == "blocked":
      if (
        self.dominant_shape is not None
        or self.confidence_gap is not None
        or self.top2
        or any(abs(score) > FACE_SHAPE_SCORE_TOLERANCE for score in scores.values())
      ):
        raise ValueError("blocked face shape must not contain a classification")
      return self

    score_sum = sum(scores.values())
    if abs(score_sum - 1.0) > FACE_SHAPE_SCORE_TOLERANCE:
      raise ValueError("face shape scores must sum to one")
    if self.dominant_shape is None or self.confidence_gap is None or len(self.top2) != 2:
      raise ValueError("classified face shape requires dominantShape, confidenceGap, and top2")

    def compare(left: str, right: str) -> int:
      difference = scores[right] - scores[left]
      if abs(difference) <= FACE_SHAPE_SCORE_TOLERANCE:
        return FACE_SHAPE_LABELS.index(left) - FACE_SHAPE_LABELS.index(right)
      return -1 if scores[left] > scores[right] else 1

    sorted_labels = sorted(FACE_SHAPE_LABELS, key=cmp_to_key(compare))
    for index, item in enumerate(self.top2):
      expected = sorted_labels[index]
      if item.shape != expected or abs(item.score - scores[expected]) > FACE_SHAPE_SCORE_TOLERANCE:
        raise ValueError("top2 must match the deterministic face shape score order")

    expected_gap = scores[sorted_labels[0]] - scores[sorted_labels[1]]
    if self.dominant_shape != sorted_labels[0]:
      raise ValueError("dominantShape must match the highest face shape score")
    if abs(self.confidence_gap - expected_gap) > FACE_SHAPE_SCORE_TOLERANCE:
      raise ValueError("confidenceGap must equal the top-two score difference")
    return self


class BeautyCoreFacialContrast(StrictFaceProfileModel):
  overall: ShortString
  eye_skin_contrast: FiniteNumber | None
  brow_skin_contrast: FiniteNumber | None
  lip_skin_contrast: FiniteNumber | None


class BeautyCoreSkinEvenness(StrictFaceProfileModel):
  tone_uniformity: FiniteNumber | None
  redness: FiniteNumber | None
  yellow_hue: FiniteNumber | None


class BeautyCoreFaceBalance(StrictFaceProfileModel):
  face_length_width_ratio: FiniteNumber | None
  midface_length: ShortString
  lower_face_length: ShortString
  jaw_softness: FiniteNumber | None
  cheekbone_to_jaw_ratio: FiniteNumber | None


class BeautyCoreEyesAndBrows(StrictFaceProfileModel):
  eye_aspect_ratio: FiniteNumber | None
  eye_spacing: ShortString
  eye_tilt: ShortString
  brow_eye_distance: ShortString


class BeautyCoreNose(StrictFaceProfileModel):
  nose_length_ratio: FiniteNumber | None
  nose_width_ratio: FiniteNumber | None
  nose_midface_ratio: FiniteNumber | None
  nose_tip_mouth_distance_ratio: FiniteNumber | None


class BeautyCoreMouth(StrictFaceProfileModel):
  lip_fullness: ShortString
  mouth_width_ratio: FiniteNumber | None
  upper_lower_lip_ratio: FiniteNumber | None
  mouth_corner_tilt: ShortString


class BeautyCoreQuality(StrictFaceProfileModel):
  is_frontal: StrictBool | Literal["unavailable"]
  neutral_expression: StrictBool | Literal["unavailable"]
  lighting_quality: FiniteNumber | None
  confidence: UnitNumber


class BeautyCoreFeatures(StrictFaceProfileModel):
  facial_contrast: BeautyCoreFacialContrast
  skin_evenness: BeautyCoreSkinEvenness
  face_balance: BeautyCoreFaceBalance
  eyes_and_brows: BeautyCoreEyesAndBrows
  nose: BeautyCoreNose
  mouth: BeautyCoreMouth
  quality: BeautyCoreQuality


class FaceVerticalThirdsDisplayRatio(StrictFaceProfileModel):
  lower: FiniteNumber
  middle: FiniteNumber
  upper: FiniteNumber | None


class FaceVerticalThirdsHairline(StrictFaceProfileModel):
  confidence: UnitNumber | None
  provider: ShortString | None


class FaceVerticalThirdsSummary(StrictFaceProfileModel):
  status: FaceProfileStatus
  confidence: UnitNumber | None
  display_ratio: FaceVerticalThirdsDisplayRatio
  dominant_part: Literal["upper", "middle", "lower", "balanced", "unknown"] | None
  hairline: FaceVerticalThirdsHairline
  summary: ShortStringAllowEmpty


class FaceProfileExistingAnalysis(StrictFaceProfileModel):
  vertical_thirds: FaceVerticalThirdsSummary | None
  personal_color: PersonalColorSummary | None


class FaceProfileProvenance(StrictFaceProfileModel):
  landmark_provider: Literal["unity_homuler_mediapipe"]
  landmark_count: NonNegativeNumber
  landmark_index_version: ShortString
  classifier_version: ShortString
  pixel_analyzer_version: ShortString
  true_depth_used: StrictBool
  training_use_allowed: Literal[False]

  @field_validator("training_use_allowed", mode="before")
  @classmethod
  def validate_training_use_allowed(cls, value: Any):
    if value is not False:
      raise ValueError("trainingUseAllowed must be literal false")
    return value


REQUIRED_MEASUREMENT_FIELDS: tuple[tuple[str, str], ...] = (
  *(("quality", field) for field in (
    "face_count", "landmark_count", "yaw_deg", "pitch_deg", "roll_deg",
    "frontal_score", "centered_score", "framing_score", "screen_coverage_ratio",
    "camera_stability", "blur_score", "lighting_score", "overexposure_risk",
    "underexposure_risk", "colored_lighting_risk", "neutral_expression_score",
    "eye_closure_risk", "mouth_open_risk", "hairline_confidence",
    "occlusion_risk", "landmark_confidence", "depth_available",
  )),
  *(("color", field) for field in (
    "overall_face_contrast", "eye_skin_contrast", "brow_skin_contrast",
    "lip_skin_contrast", "skin_evenness", "redness", "yellowness",
    "skin_color", "hair_color", "lip_color", "left_eye_color", "right_eye_color",
    "left_brow_color", "right_brow_color", "personal_color",
  )),
  *(("face_balance", field) for field in (
    "face_length_to_width", "face_length_to_cheek_width", "upper_third_ratio",
    "middle_third_ratio", "lower_third_ratio", "forehead_width_to_cheek_width",
    "temple_width_to_cheek_width", "jaw_width_to_cheek_width",
    "chin_width_to_cheek_width", "cheek_to_jaw_ratio", "cheek_dominance",
    "jawline_length_ratio", "jaw_angle_deg", "jaw_width_score", "jaw_angle_score",
    "jaw_softness", "chin_pointedness", "contour_roundness",
    "forehead_dominance", "lower_face_weight", "contour_asymmetry",
  )),
  *(("eyes_and_brows", field) for field in (
    "left_eye_aspect_ratio", "right_eye_aspect_ratio", "inter_eye_distance_ratio",
    "left_eye_canthal_tilt_deg", "right_eye_canthal_tilt_deg",
    "left_brow_eye_distance_ratio", "right_brow_eye_distance_ratio",
    "left_brow_tilt_deg", "right_brow_tilt_deg", "eye_asymmetry", "brow_asymmetry",
  )),
  *(("nose", field) for field in (
    "nose_length_ratio", "nose_width_ratio", "nose_to_midface_ratio",
    "nose_tip_to_mouth_ratio", "centerline_asymmetry",
  )),
  *(("mouth", field) for field in (
    "lip_fullness_ratio", "mouth_width_ratio", "upper_to_lower_lip_ratio",
    "left_corner_tilt_deg", "right_corner_tilt_deg", "mouth_asymmetry",
  )),
)


class FaceProfileResultModel(StrictFaceProfileModel):
  schema_version: Literal["aura-face-profile-v1"]
  status: FaceProfileStatus
  status_reason: ShortString | None
  capture_id: UUID
  created_at: Annotated[datetime, Field()]
  quality: FaceProfileQuality
  color: FaceProfileColor
  face_balance: FaceProfileBalance
  eyes_and_brows: FaceProfileEyesAndBrows
  nose: FaceProfileNose
  mouth: FaceProfileMouth
  face_shape: FaceShapeRuleResult
  beauty_core_features: BeautyCoreFeatures
  existing_analysis: FaceProfileExistingAnalysis
  warnings: WarningList
  provenance: FaceProfileProvenance

  @field_validator("created_at", mode="before")
  @classmethod
  def require_iso_created_at_wire_string(cls, value: Any):
    if not isinstance(value, str) or ISO_TIMESTAMP_PATTERN.fullmatch(value) is None:
      raise ValueError("createdAt must be an ISO-8601 timestamp string")
    return value

  @model_validator(mode="before")
  @classmethod
  def validate_raw_profile(cls, value: Any):
    if isinstance(value, cls):
      return value
    if not isinstance(value, Mapping):
      raise ValueError("faceProfile must be an object")
    try:
      serialized = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
        default=str,
      )
    except (TypeError, ValueError, RecursionError) as exc:
      raise ValueError("faceProfile must be finite and JSON serializable") from exc
    if len(serialized.encode("utf-8")) > FACE_PROFILE_MAX_BYTES:
      raise ValueError("faceProfile exceeds 256 KiB")

    def inspect(candidate: Any) -> None:
      if isinstance(candidate, Mapping):
        for key, child in candidate.items():
          if str(key).lower() in FORBIDDEN_PROFILE_KEYS:
            raise ValueError(f"forbidden raw face profile field: {key}")
          inspect(child)
      elif isinstance(candidate, list):
        for child in candidate:
          inspect(child)

    inspect(value)
    return value

  @field_validator("created_at")
  @classmethod
  def validate_created_at_timezone(cls, value: datetime):
    if value.tzinfo is None or value.utcoffset() is None:
      raise ValueError("createdAt must include a timezone")
    return value

  @model_validator(mode="after")
  def validate_profile_state(self):
    required = [
      getattr(getattr(self, group), field)
      for group, field in REQUIRED_MEASUREMENT_FIELDS
    ]
    all_required_available = all(item.value is not None for item in required)
    has_geometry_core = any(
      item.value is not None
      for item in (
        self.face_balance.face_length_to_width,
        self.eyes_and_brows.left_eye_aspect_ratio,
        self.nose.nose_length_ratio,
        self.mouth.mouth_width_ratio,
      )
    )
    has_color_core = any(
      item.value is not None
      for item in (
        self.color.overall_face_contrast,
        self.color.skin_evenness,
        self.color.skin_color,
        self.color.personal_color,
      )
    )
    blocking_reasons = self.quality.blocking_reasons

    if blocking_reasons:
      if (
        self.status != "blocked"
        or not self.status_reason
        or self.face_shape.status != "blocked"
        or self.face_shape.dominant_shape is not None
      ):
        raise ValueError("blocking reasons require a blocked profile and face shape")
      return self

    if all_required_available:
      if (
        self.status != "full_success"
        or self.status_reason is not None
        or self.face_shape.status == "blocked"
      ):
        raise ValueError("complete required measurements require full_success")
      return self

    if self.status_reason == "pipeline_failure":
      if self.status != "failed" or self.face_shape.status != "blocked":
        raise ValueError("pipeline failure requires failed status and blocked face shape")
      return self

    if has_geometry_core or has_color_core:
      if (
        self.status != "partial_success"
        or self.status_reason != "partial_measurements_unavailable"
        or self.face_shape.status == "blocked"
      ):
        raise ValueError("partial measurements require partial_success")
      return self

    raise ValueError("face profile state is inconsistent with its measurements")
