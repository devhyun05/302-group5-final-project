import asyncio
import json
from datetime import UTC, datetime
from threading import Event
from uuid import UUID, uuid4

import pytest
from fastapi import BackgroundTasks
from pydantic import ValidationError

from app.api import analysis as analysis_api
from app.core.errors import AppError
from app.core.security import AuthContext
from app.core.settings import Settings
from app.schemas.analysis import AnalysisJobCreate
from app.schemas.face_profile import (
  FACE_PROFILE_MAX_BYTES,
  FaceProfileResultModel,
)
from app.services.analysis_face_profiles import (
  build_consent_snapshot,
  compact_face_profile_for_ai,
  decode_analysis_face_profile_row,
  insert_analysis_face_profile,
  map_face_profile_detail,
  map_face_profile_summary,
  serialize_face_profile,
)
from app.services.analysis_execution_guard import require_execution_allowed
from app.services.openai_analysis import OpenAIAnalysisService
from app.services.user_consents import (
  AI_PROCESSING_CONSENT_VERSION,
  FACE_PROFILE_CONSENT_VERSION,
  THIRD_PARTY_AI_CONSENT_VERSION,
)


CAPTURE_ID = UUID("11111111-1111-4111-8111-111111111111")


QUALITY_NUMBER_FIELDS = (
  "faceCount",
  "landmarkCount",
  "yawDeg",
  "pitchDeg",
  "rollDeg",
  "frontalScore",
  "centeredScore",
  "framingScore",
  "cameraDistanceMeters",
  "screenCoverageRatio",
  "cameraStability",
  "blurScore",
  "lightingScore",
  "overexposureRisk",
  "underexposureRisk",
  "coloredLightingRisk",
  "neutralExpressionScore",
  "eyeClosureRisk",
  "mouthOpenRisk",
  "hairlineConfidence",
  "occlusionRisk",
  "landmarkConfidence",
  "depthValidSampleRatio",
  "depthMedianAbsoluteDeviationMeters",
  "depthConfidence",
  "facePlanePitchDeg",
  "facePlaneYawDeg",
  "facePlaneRollDeg",
  "facePlaneConfidence",
)
COLOR_NUMBER_FIELDS = (
  "overallFaceContrast",
  "eyeSkinContrast",
  "browSkinContrast",
  "lipSkinContrast",
  "skinEvenness",
  "redness",
  "yellowness",
)
COLOR_SAMPLE_FIELDS = (
  "skinColor",
  "hairColor",
  "lipColor",
  "leftEyeColor",
  "rightEyeColor",
  "leftBrowColor",
  "rightBrowColor",
)
FACE_BALANCE_FIELDS = (
  "faceLengthToWidth",
  "faceLengthToCheekWidth",
  "upperThirdRatio",
  "middleThirdRatio",
  "lowerThirdRatio",
  "foreheadWidthToCheekWidth",
  "templeWidthToCheekWidth",
  "jawWidthToCheekWidth",
  "chinWidthToCheekWidth",
  "cheekToJawRatio",
  "cheekDominance",
  "jawlineLengthRatio",
  "jawAngleDeg",
  "jawWidthScore",
  "jawAngleScore",
  "jawSoftness",
  "chinPointedness",
  "contourRoundness",
  "foreheadDominance",
  "lowerFaceWeight",
  "contourAsymmetry",
)
EYES_AND_BROWS_FIELDS = (
  "leftEyeAspectRatio",
  "rightEyeAspectRatio",
  "interEyeDistanceRatio",
  "leftEyeCanthalTiltDeg",
  "rightEyeCanthalTiltDeg",
  "leftBrowEyeDistanceRatio",
  "rightBrowEyeDistanceRatio",
  "leftBrowTiltDeg",
  "rightBrowTiltDeg",
  "eyeAsymmetry",
  "browAsymmetry",
)
NOSE_FIELDS = (
  "noseLengthRatio",
  "noseWidthRatio",
  "noseToMidfaceRatio",
  "noseTipToMouthRatio",
  "centerlineAsymmetry",
)
MOUTH_FIELDS = (
  "lipFullnessRatio",
  "mouthWidthRatio",
  "upperToLowerLipRatio",
  "leftCornerTiltDeg",
  "rightCornerTiltDeg",
  "mouthAsymmetry",
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
def measurement(value: object, *, source: str = "derived") -> dict:
  return {
    "value": value,
    "confidence": 0.9,
    "source": source,
    "warnings": [],
  }


def null_measurement(reason: str = "measurement_unavailable") -> dict:
  return {
    "value": None,
    "confidence": 0.0,
    "source": "estimated",
    "nullReason": reason,
    "warnings": [],
  }


def color_sample() -> dict:
  return {
    "hex": "#c89678",
    "lab": {"L": 65.0, "a": 8.0, "b": 12.0},
    "rgb": {"r": 200.0, "g": 150.0, "b": 120.0},
  }


def personal_color_summary() -> dict:
  axes = {
    axis: {"value": None, "confidence": 0.7}
    for axis in ("temperature", "value", "chroma", "clarity", "contrast")
  }
  return {
    "status": "insufficient",
    "measurementConfidence": 0.7,
    "axes": axes,
    "relations": {
      "dLSkinHair": None,
      "dLSkinLip": None,
      "dE00SkinHair": None,
      "dE00SkinLip": None,
    },
    "tone": None,
    "palette": {"bestFamilyIds": [], "worstFamilyIds": []},
    "calibrationApplied": False,
    "calibrationVersion": None,
    "warnings": [],
  }


def ready_face_shape() -> dict:
  scores = {
    "oval": 0.4,
    "round": 0.2,
    "square": 0.1,
    "heart": 0.1,
    "oblong": 0.08,
    "diamond": 0.07,
    "triangle": 0.05,
  }
  return {
    "status": "ready",
    "dominantShape": "oval",
    "faceShapeScores": scores,
    "top2": [
      {"shape": "oval", "score": 0.4},
      {"shape": "round", "score": 0.2},
    ],
    "confidenceGap": 0.2,
    "overallConfidence": 0.9,
    "classifierType": "rule_v1",
    "classifierVersion": "face-shape-rule-v1",
    "explanationTraits": ["balanced_contour"],
    "ruleFeatures": {
      "faceLengthToCheekWidth": 1.4,
      "foreheadWidthToCheekWidth": 0.9,
      "templeWidthToCheekWidth": 0.88,
      "jawWidthToCheekWidth": 0.78,
      "chinWidthToCheekWidth": 0.42,
      "cheekDominance": 0.2,
      "jawWidthScore": 0.4,
      "jawAngleScore": 0.5,
      "chinPointedness": 0.3,
      "contourRoundness": 0.7,
      "foreheadDominance": 0.1,
      "lowerFaceWeight": 0.3,
      "frontalConfidence": 0.95,
      "landmarkConfidence": 0.93,
      "hairlineConfidence": 0.84,
    },
    "warnings": [],
  }


def blocked_face_shape() -> dict:
  return {
    "status": "blocked",
    "dominantShape": None,
    "faceShapeScores": {label: 0.0 for label in FACE_SHAPE_LABELS},
    "top2": [],
    "confidenceGap": None,
    "overallConfidence": 0.0,
    "classifierType": "rule_v1",
    "classifierVersion": "face-shape-rule-v1",
    "explanationTraits": [],
    "ruleFeatures": {
      "faceLengthToCheekWidth": None,
      "foreheadWidthToCheekWidth": None,
      "templeWidthToCheekWidth": None,
      "jawWidthToCheekWidth": None,
      "chinWidthToCheekWidth": None,
      "cheekDominance": None,
      "jawWidthScore": None,
      "jawAngleScore": None,
      "chinPointedness": None,
      "contourRoundness": None,
      "foreheadDominance": None,
      "lowerFaceWeight": None,
      "frontalConfidence": 0.0,
      "landmarkConfidence": 0.0,
      "hairlineConfidence": 0.0,
    },
    "warnings": ["classification_blocked"],
  }


def make_full_profile(*, capture_id: UUID = CAPTURE_ID) -> dict:
  quality = {field: measurement(0.8) for field in QUALITY_NUMBER_FIELDS}
  quality.update({
    "faceCount": measurement(1.0),
    "landmarkCount": measurement(478.0),
    "depthAvailable": measurement(True, source="truedepth_3d"),
    "depthAccuracy": measurement("absolute", source="truedepth_3d"),
    "depthFiltered": measurement(True, source="truedepth_3d"),
    "blockingReasons": [],
  })
  color = {field: measurement(0.5, source="pixel_roi") for field in COLOR_NUMBER_FIELDS}
  color.update({
    field: measurement(color_sample(), source="pixel_roi")
    for field in COLOR_SAMPLE_FIELDS
  })
  color["personalColor"] = measurement(personal_color_summary(), source="pixel_roi")

  return {
    "schemaVersion": "aura-face-profile-v1",
    "status": "full_success",
    "statusReason": None,
    "captureId": str(capture_id),
    "createdAt": "2026-07-12T03:00:00Z",
    "quality": quality,
    "color": color,
    "faceBalance": {field: measurement(0.7) for field in FACE_BALANCE_FIELDS},
    "eyesAndBrows": {field: measurement(0.6) for field in EYES_AND_BROWS_FIELDS},
    "nose": {field: measurement(0.5) for field in NOSE_FIELDS},
    "mouth": {field: measurement(0.5) for field in MOUTH_FIELDS},
    "faceShape": ready_face_shape(),
    "beautyCoreFeatures": {
      "facialContrast": {
        "overall": "medium",
        "eyeSkinContrast": 0.5,
        "browSkinContrast": 0.5,
        "lipSkinContrast": 0.5,
      },
      "skinEvenness": {
        "toneUniformity": 0.8,
        "redness": 0.2,
        "yellowHue": 0.3,
      },
      "faceBalance": {
        "faceLengthWidthRatio": 1.4,
        "midfaceLength": "balanced",
        "lowerFaceLength": "balanced",
        "jawSoftness": 0.7,
        "cheekboneToJawRatio": 1.1,
      },
      "eyesAndBrows": {
        "eyeAspectRatio": 0.3,
        "eyeSpacing": "balanced",
        "eyeTilt": "neutral",
        "browEyeDistance": "balanced",
      },
      "nose": {
        "noseLengthRatio": 0.4,
        "noseWidthRatio": 0.3,
        "noseMidfaceRatio": 0.5,
        "noseTipMouthDistanceRatio": 0.25,
      },
      "mouth": {
        "lipFullness": "medium",
        "mouthWidthRatio": 0.4,
        "upperLowerLipRatio": 0.8,
        "mouthCornerTilt": "neutral",
      },
      "quality": {
        "isFrontal": True,
        "neutralExpression": True,
        "lightingQuality": 0.9,
        "confidence": 0.9,
      },
    },
    "existingAnalysis": {"verticalThirds": None, "personalColor": None},
    "warnings": [],
    "provenance": {
      "landmarkProvider": "unity_homuler_mediapipe",
      "landmarkCount": 478.0,
      "landmarkIndexVersion": "mediapipe-478-v1",
      "classifierVersion": "face-shape-rule-v1",
      "pixelAnalyzerVersion": "pixel-roi-v1",
      "trueDepthUsed": True,
      "trainingUseAllowed": False,
    },
  }


def make_partial_profile() -> dict:
  profile = make_full_profile()
  profile["status"] = "partial_success"
  profile["statusReason"] = "partial_measurements_unavailable"
  profile["mouth"]["mouthAsymmetry"] = null_measurement()
  return profile


def make_blocked_profile() -> dict:
  profile = make_full_profile()
  profile["status"] = "blocked"
  profile["statusReason"] = "multiple_faces"
  profile["quality"]["blockingReasons"] = ["multiple_faces"]
  profile["faceShape"] = blocked_face_shape()
  return profile


def make_failed_profile() -> dict:
  profile = make_full_profile()
  profile["status"] = "failed"
  profile["statusReason"] = "pipeline_failure"
  profile["quality"]["blockingReasons"] = []
  profile["faceShape"] = blocked_face_shape()
  profile["mouth"]["mouthAsymmetry"] = null_measurement("pipeline_failure")
  return profile


@pytest.mark.parametrize(
  "factory,expected_status",
  (
    (make_full_profile, "full_success"),
    (make_partial_profile, "partial_success"),
    (make_blocked_profile, "blocked"),
    (make_failed_profile, "failed"),
  ),
)
def test_valid_profile_states(factory, expected_status: str) -> None:
  model = FaceProfileResultModel.model_validate(factory())
  assert model.status == expected_status
  assert model.model_dump(mode="json", by_alias=True)["schemaVersion"] == (
    "aura-face-profile-v1"
  )


@pytest.mark.parametrize(
  "mutate",
  (
    lambda p: p["mouth"].__setitem__("mouthAsymmetry", null_measurement()),
    lambda p: p.update(status="partial_success", statusReason="partial_measurements_unavailable"),
    lambda p: p.update(status="blocked", statusReason="multiple_faces"),
    lambda p: p.update(status="failed", statusReason=None),
  ),
)
def test_profile_state_mismatches_are_rejected(mutate) -> None:
  profile = make_full_profile()
  mutate(profile)
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(profile)


def test_blocked_requires_reasons_and_forbids_dominant_shape() -> None:
  no_reason = make_blocked_profile()
  no_reason["quality"]["blockingReasons"] = []
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(no_reason)

  dominant = make_blocked_profile()
  dominant["faceShape"]["dominantShape"] = "oval"
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(dominant)


def test_measurement_null_reason_confidence_and_finite_numbers_are_strict() -> None:
  missing_reason = make_partial_profile()
  missing_reason["mouth"]["mouthAsymmetry"].pop("nullReason")
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(missing_reason)

  unexpected_reason = make_full_profile()
  unexpected_reason["mouth"]["mouthAsymmetry"]["nullReason"] = "not_allowed"
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(unexpected_reason)

  for confidence in (-0.1, 1.1):
    invalid = make_full_profile()
    invalid["nose"]["noseLengthRatio"]["confidence"] = confidence
    with pytest.raises(ValidationError):
      FaceProfileResultModel.model_validate(invalid)


def test_vertical_thirds_confidence_and_created_at_match_mobile_wire_contract() -> None:
  for confidence_path in (("confidence",), ("hairline", "confidence")):
    invalid = make_full_profile()
    invalid["existingAnalysis"]["verticalThirds"] = {
      "status": "full_success",
      "confidence": 0.9,
      "displayRatio": {"upper": 1.0, "middle": 1.0, "lower": 1.0},
      "dominantPart": "balanced",
      "hairline": {"confidence": 0.8, "provider": "apple_semantic_matte"},
      "summary": "균형",
    }
    target = invalid["existingAnalysis"]["verticalThirds"]
    for key in confidence_path[:-1]:
      target = target[key]
    target[confidence_path[-1]] = 2.0
    with pytest.raises(ValidationError):
      FaceProfileResultModel.model_validate(invalid)

  numeric_timestamp = make_full_profile()
  numeric_timestamp["createdAt"] = 1_700_000_000
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(numeric_timestamp)

  non_iso_timestamp = make_full_profile()
  non_iso_timestamp["createdAt"] = "2026-07-12 03:00:00+00:00"
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(non_iso_timestamp)

  for non_finite in (float("nan"), float("inf"), float("-inf")):
    invalid = make_full_profile()
    invalid["nose"]["noseLengthRatio"]["value"] = non_finite
    with pytest.raises(ValidationError):
      FaceProfileResultModel.model_validate(invalid)


@pytest.mark.parametrize(
  "key",
  (
    "rawLandmarks",
    "landmarks",
    "depthMap",
    "calibrationData",
    "semanticMatte",
    "roiPixels",
  ),
)
def test_raw_or_unknown_profile_fields_are_forbidden(key: str) -> None:
  profile = make_full_profile()
  profile[key] = [1, 2, 3]
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(profile)

  nested_unknown = make_full_profile()
  nested_unknown["nose"]["clientOverride"] = {"value": 1}
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(nested_unknown)


def test_training_use_schema_version_and_bounds_are_strict() -> None:
  for unsafe_value in (True, 0, None, "false"):
    unsafe = make_full_profile()
    unsafe["provenance"]["trainingUseAllowed"] = unsafe_value
    with pytest.raises(ValidationError):
      FaceProfileResultModel.model_validate(unsafe)

  wrong_version = make_full_profile()
  wrong_version["schemaVersion"] = "aura-face-profile-v2"
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(wrong_version)

  too_many_warnings = make_full_profile()
  too_many_warnings["warnings"] = ["warning"] * 33
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(too_many_warnings)

  long_trait = make_full_profile()
  long_trait["faceShape"]["explanationTraits"] = ["x" * 129]
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(long_trait)

  too_many_traits = make_full_profile()
  too_many_traits["faceShape"]["explanationTraits"] = ["trait"] * 9
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(too_many_traits)

  long_warning = make_full_profile()
  long_warning["warnings"] = ["x" * 129]
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(long_warning)

  long_null_reason = make_partial_profile()
  long_null_reason["mouth"]["mouthAsymmetry"]["nullReason"] = "x" * 129
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(long_null_reason)


def test_face_shape_scores_top2_gap_and_classifier_are_strict() -> None:
  valid_mixed = make_full_profile()
  valid_mixed["faceShape"]["status"] = "mixed"
  assert FaceProfileResultModel.model_validate(valid_mixed).face_shape.status == "mixed"

  wrong_sum = make_full_profile()
  wrong_sum["faceShape"]["faceShapeScores"]["oval"] = 0.5
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(wrong_sum)

  wrong_order = make_full_profile()
  wrong_order["faceShape"]["top2"].reverse()
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(wrong_order)

  wrong_gap = make_full_profile()
  wrong_gap["faceShape"]["confidenceGap"] = 0.19
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(wrong_gap)

  wrong_classifier = make_full_profile()
  wrong_classifier["faceShape"]["classifierType"] = "ml_v1"
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(wrong_classifier)

  unknown_shape = make_full_profile()
  unknown_shape["faceShape"]["dominantShape"] = "rectangle"
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(unknown_shape)


def test_entire_serialized_profile_is_bounded_to_256_kib() -> None:
  profile = make_full_profile()
  warning = "가" * 128
  for group_name in (
    "quality",
    "color",
    "faceBalance",
    "eyesAndBrows",
    "nose",
    "mouth",
  ):
    for candidate in profile[group_name].values():
      if isinstance(candidate, dict) and "value" in candidate:
        candidate["warnings"] = [warning] * 32
  assert len(json.dumps(profile, ensure_ascii=False).encode("utf-8")) > FACE_PROFILE_MAX_BYTES
  with pytest.raises(ValidationError):
    FaceProfileResultModel.model_validate(profile)


def test_public_analysis_request_requires_matching_photo_capture_and_profile() -> None:
  profile = make_full_profile()
  request = AnalysisJobCreate.model_validate({
    "photoCaptureId": str(CAPTURE_ID),
    "faceProfile": profile,
    "requestPayload": {"source": "camera"},
  })
  assert request.photo_capture_id == CAPTURE_ID
  assert request.face_profile.capture_id == CAPTURE_ID

  with pytest.raises(ValidationError):
    AnalysisJobCreate.model_validate({"faceProfile": profile})

  mismatch = make_full_profile(capture_id=uuid4())
  with pytest.raises(ValidationError):
    AnalysisJobCreate.model_validate({
      "photoCaptureId": str(CAPTURE_ID),
      "faceProfile": mismatch,
    })

  with pytest.raises(ValidationError):
    AnalysisJobCreate.model_validate({"photoCaptureId": str(CAPTURE_ID)})

  with pytest.raises(ValidationError):
    AnalysisJobCreate.model_validate({
      "photoCaptureId": str(CAPTURE_ID),
      "faceProfile": profile,
      "allowLegacyFaceProfile": True,
    })


@pytest.mark.parametrize(
  "unsafe_payload",
  (
    {"rawLandmarks": [1, 2, 3]},
    {"nested": {"depthMap": "raw-depth"}},
    {"items": [{"calibrationData": {"fx": 1.0}}]},
    {"nested": {"semanticMatte": "raw-matte"}},
    {"nested": [{"roiPixels": [255, 0, 0]}]},
    {"nested": {"faceProfile": {"status": "forged"}}},
    {"nested": {"faceProfileSummary": {"status": "forged"}}},
    {"nested": {"nativeDepthToken": "device-token"}},
    {"nested": {"nativeMatteToken": "device-token"}},
  ),
)
def test_public_request_payload_recursively_rejects_raw_face_artifacts(
  unsafe_payload: dict,
) -> None:
  with pytest.raises(ValidationError):
    AnalysisJobCreate.model_validate({
      "photoCaptureId": str(CAPTURE_ID),
      "faceProfile": make_full_profile(),
      "requestPayload": unsafe_payload,
    })


def consent_rows() -> dict[str, dict]:
  accepted_at = datetime(2026, 7, 12, 3, 0, tzinfo=UTC)
  return {
    "camera_analysis": {
      "id": UUID("22222222-2222-4222-8222-222222222222"),
      "consent_type": "camera_analysis",
      "version": FACE_PROFILE_CONSENT_VERSION,
      "accepted": True,
      "accepted_at": accepted_at,
      "revoked_at": None,
      "metadata": {
        "surface": "face_analysis",
        "rawSensorArtifactsStored": False,
        "trainingUseAllowed": False,
      },
    },
    "ai_processing": {
      "id": UUID("33333333-3333-4333-8333-333333333333"),
      "consent_type": "ai_processing",
      "version": AI_PROCESSING_CONSENT_VERSION,
      "accepted": True,
      "accepted_at": accepted_at,
      "revoked_at": None,
      "metadata": {"surface": "face_analysis"},
    },
    "third_party_ai": {
      "id": UUID("44444444-4444-4444-8444-444444444444"),
      "consent_type": "third_party_ai",
      "version": THIRD_PARTY_AI_CONSENT_VERSION,
      "accepted": True,
      "accepted_at": accepted_at,
      "revoked_at": None,
      "metadata": {"surface": "face_analysis"},
    },
  }


class RecordingConnection:
  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, args))
    return {
      "report_id": args[0],
      "user_id": args[1],
      "photo_capture_id": args[2],
      "schema_version": args[3],
      "status": args[4],
      "dominant_shape": args[5],
      "confidence_gap": args[6],
      "profile_payload": args[7],
      "camera_consent_id": args[8],
      "consent_version": args[9],
      "consent_accepted_at": args[10],
      "consent_snapshot": args[11],
    }


def test_consent_snapshot_is_server_verified_and_detached_from_rows() -> None:
  rows = consent_rows()
  snapshot = build_consent_snapshot(rows)
  assert snapshot["cameraAnalysis"] == {
    "consentId": "22222222-2222-4222-8222-222222222222",
    "version": FACE_PROFILE_CONSENT_VERSION,
    "acceptedAt": "2026-07-12T03:00:00Z",
    "metadata": {
      "surface": "face_analysis",
      "rawSensorArtifactsStored": False,
      "trainingUseAllowed": False,
    },
  }
  assert snapshot["aiProcessing"]["version"] == AI_PROCESSING_CONSENT_VERSION
  assert snapshot["thirdPartyAi"]["version"] == THIRD_PARTY_AI_CONSENT_VERSION

  rows["camera_analysis"]["metadata"]["trainingUseAllowed"] = True
  assert snapshot["cameraAnalysis"]["metadata"]["trainingUseAllowed"] is False

  stale = consent_rows()
  stale["camera_analysis"]["revoked_at"] = datetime.now(UTC)
  with pytest.raises(ValueError):
    build_consent_snapshot(stale)


@pytest.mark.asyncio
async def test_insert_derives_columns_from_validated_profile_and_snapshot() -> None:
  profile = FaceProfileResultModel.model_validate(make_full_profile())
  connection = RecordingConnection()
  report_id = uuid4()
  user_id = uuid4()

  inserted = await insert_analysis_face_profile(
    connection,
    report_id=report_id,
    user_id=user_id,
    photo_capture_id=CAPTURE_ID,
    profile=profile,
    consent_rows=consent_rows(),
  )

  assert len(connection.calls) == 1
  query, args = connection.calls[0]
  assert "insert into analysis_face_profiles" in query.lower()
  assert args[3:7] == (
    "aura-face-profile-v1",
    "full_success",
    "oval",
    0.2,
  )
  serialized = json.loads(args[7])
  assert serialized == profile.model_dump(mode="json", by_alias=True)
  assert "rawLandmarks" not in serialized
  assert args[8] == consent_rows()["camera_analysis"]["id"]
  assert args[9] == FACE_PROFILE_CONSENT_VERSION
  assert json.loads(args[11])["cameraAnalysis"]["consentId"] == str(args[8])
  assert inserted["profile_payload"]["captureId"] == str(CAPTURE_ID)


def test_persistence_serializes_models_only_and_maps_summary_and_detail() -> None:
  profile = FaceProfileResultModel.model_validate(make_full_profile())
  serialized = serialize_face_profile(profile)
  assert json.loads(serialized)["faceShape"]["dominantShape"] == "oval"
  with pytest.raises(TypeError):
    serialize_face_profile(make_full_profile())  # type: ignore[arg-type]

  row = decode_analysis_face_profile_row({
    "schema_version": "aura-face-profile-v1",
    "status": "full_success",
    "dominant_shape": "oval",
    "confidence_gap": 0.2,
    "profile_payload": serialized,
    "consent_snapshot": json.dumps({"cameraAnalysis": {"consentId": "safe"}}),
  })
  assert row["profile_payload"]["captureId"] == str(CAPTURE_ID)
  assert row["consent_snapshot"]["cameraAnalysis"]["consentId"] == "safe"

  summary = map_face_profile_summary(row)
  assert summary == {
    "hasFaceProfile": True,
    "faceProfileSummary": {
      "status": "full_success",
      "dominantShape": "oval",
      "confidenceGap": 0.2,
      "schemaVersion": "aura-face-profile-v1",
    },
  }
  detail = map_face_profile_detail(row)
  assert detail["faceProfile"] == row["profile_payload"]
  assert detail["faceProfileSummary"] == summary["faceProfileSummary"]

  joined = {
    "face_profile_status": "full_success",
    "face_profile_dominant_shape": "oval",
    "face_profile_confidence_gap": 0.2,
    "face_profile_schema_version": "aura-face-profile-v1",
    "face_profile": serialized,
  }
  assert map_face_profile_summary(joined) == summary
  assert map_face_profile_detail(joined)["faceProfile"] == row["profile_payload"]

  assert map_face_profile_summary(None) == {
    "hasFaceProfile": False,
    "faceProfileSummary": None,
  }
  assert map_face_profile_detail(None)["faceProfile"] is None

  legacy_report = {
    "id": uuid4(),
    "status": "completed",
    "detail_payload": {"result": {"summary": "legacy"}},
  }
  assert map_face_profile_summary(legacy_report) == {
    "hasFaceProfile": False,
    "faceProfileSummary": None,
  }
  assert map_face_profile_detail(legacy_report)["faceProfile"] is None


class GuardDatabase:
  def __init__(self, rows: list[dict | None]) -> None:
    self.rows = list(rows)
    self.execute_calls: list[tuple[str, tuple]] = []

  async def fetchrow(self, _query: str, *_args):
    return self.rows.pop(0)

  async def execute(self, query: str, *args):
    self.execute_calls.append((query, args))
    return "UPDATE 1"


@pytest.mark.asyncio
async def test_execution_guard_cancels_when_current_ai_consent_is_missing() -> None:
  db = GuardDatabase([
    {
      "id": uuid4(),
      "user_id": uuid4(),
      "status": "processing",
      "deleted_at": None,
      "ai_processing_active": False,
      "third_party_ai_active": True,
    },
  ])

  with pytest.raises(AppError) as exc_info:
    await require_execution_allowed(db, uuid4(), Settings())

  assert exc_info.value.code == "FACE_ANALYSIS_CONSENT_REVOKED"
  assert len(db.execute_calls) == 1
  assert "status = 'cancelled'" in db.execute_calls[0][0]
  assert "deleted_at is null" in db.execute_calls[0][0]
  assert "status in ('pending', 'processing')" in db.execute_calls[0][0]


@pytest.mark.asyncio
async def test_execution_guard_rejects_deleted_or_cancelled_report_without_overwrite() -> None:
  db = GuardDatabase([
    {
      "id": uuid4(),
      "user_id": uuid4(),
      "status": "cancelled",
      "deleted_at": datetime.now(UTC),
      "ai_processing_active": True,
      "third_party_ai_active": True,
    },
  ])

  with pytest.raises(AppError) as exc_info:
    await require_execution_allowed(db, uuid4(), Settings())

  assert exc_info.value.code == "ANALYSIS_REPORT_CANCELLED"
  assert db.execute_calls == []


ATOMIC_USER_ID = UUID("55555555-5555-4555-8555-555555555555")
ATOMIC_MEDIA_ID = UUID("66666666-6666-4666-8666-666666666666")
ATOMIC_REPORT_ID = UUID("77777777-7777-4777-8777-777777777777")


def atomic_auth() -> AuthContext:
  return AuthContext(
    subject="atomic-face-user",
    provider="cognito",
    email="atomic@example.com",
    name="Atomic Face",
    claims={"sub": "atomic-face-user"},
  )


def atomic_payload(profile: dict | None = None) -> AnalysisJobCreate:
  return AnalysisJobCreate.model_validate({
    "photoCaptureId": str(CAPTURE_ID),
    "faceProfile": profile or make_full_profile(),
    "runImmediately": True,
    "requestPayload": {"task": "face_makeup_recommendation_report_v1"},
  })


class AtomicTransaction:
  def __init__(self, events: list[str]) -> None:
    self.events = events

  async def __aenter__(self):
    self.events.append("transaction_enter")
    return self

  async def __aexit__(self, exc_type, _exc, _traceback):
    self.events.append("rollback" if exc_type is not None else "commit")
    return False


class AtomicAcquire:
  def __init__(self, connection, events: list[str]) -> None:
    self.connection = connection
    self.events = events

  async def __aenter__(self):
    self.events.append("acquire")
    return self.connection

  async def __aexit__(self, _exc_type, _exc, _traceback):
    self.events.append("release")


class AtomicPool:
  def __init__(self, connection, events: list[str]) -> None:
    self.connection = connection
    self.events = events

  def acquire(self):
    return AtomicAcquire(self.connection, self.events)


class AtomicConnection:
  def __init__(
    self,
    *,
    active_consents: dict[str, dict] | None = None,
    capture_owned: bool = True,
    profile_insert_error: Exception | None = None,
  ) -> None:
    self.events: list[str] = []
    self.active_consents = active_consents if active_consents is not None else consent_rows()
    self.capture_owned = capture_owned
    self.profile_insert_error = profile_insert_error
    self.report_insert_count = 0
    self.profile_insert_count = 0
    self.consent_types: list[str] = []
    self.report_detail_payload: dict | None = None
    self.queries: list[str] = []

  def transaction(self):
    return AtomicTransaction(self.events)

  async def fetchrow(self, query: str, *args):
    normalized = " ".join(query.lower().split())
    self.queries.append(normalized)
    if "insert into users" in normalized:
      return {"id": ATOMIC_USER_ID}
    if "from users" in normalized and "for key share" in normalized:
      return {"id": ATOMIC_USER_ID}
    if "from photo_captures" in normalized:
      if not self.capture_owned:
        return None
      return {
        "capture_id": CAPTURE_ID,
        "id": ATOMIC_MEDIA_ID,
        "bucket": "media-bucket",
        "object_key": "uploads/photo-captures/atomic.jpg",
        "cdn_url": "https://cdn.example.com/uploads/photo-captures/atomic.jpg",
        "content_type": "image/jpeg",
        "width": 1200,
        "height": 1600,
      }
    if "from media_assets" in normalized:
      if args[0] != ATOMIC_MEDIA_ID:
        return None
      return {
        "id": ATOMIC_MEDIA_ID,
        "bucket": "media-bucket",
        "object_key": "uploads/photo-captures/atomic.jpg",
        "cdn_url": "https://cdn.example.com/uploads/photo-captures/atomic.jpg",
        "content_type": "image/jpeg",
        "width": 1200,
        "height": 1600,
      }
    if "from user_consents" in normalized:
      consent_type = str(args[1])
      self.consent_types.append(consent_type)
      row = self.active_consents.get(consent_type)
      if row is None:
        return None
      if (
        row.get("version") != args[2]
        or row.get("accepted") is not True
        or row.get("accepted_at") is None
        or row.get("revoked_at") is not None
      ):
        return None
      return row
    if "insert into analysis_reports" in normalized:
      self.report_insert_count += 1
      self.events.append("report_insert")
      self.report_detail_payload = json.loads(args[9])
      return {
        "id": ATOMIC_REPORT_ID,
        "user_id": ATOMIC_USER_ID,
        "photo_capture_id": CAPTURE_ID,
        "source_media_id": ATOMIC_MEDIA_ID,
        "preview_media_id": None,
        "status": args[4],
        "error_message": args[8],
        "detail_payload": args[9],
      }
    if "insert into analysis_face_profiles" in normalized:
      self.profile_insert_count += 1
      self.events.append("profile_insert")
      if self.profile_insert_error is not None:
        raise self.profile_insert_error
      return {
        "report_id": args[0],
        "user_id": args[1],
        "photo_capture_id": args[2],
        "schema_version": args[3],
        "status": args[4],
        "dominant_shape": args[5],
        "confidence_gap": args[6],
        "profile_payload": args[7],
        "camera_consent_id": args[8],
        "consent_version": args[9],
        "consent_accepted_at": args[10],
        "consent_snapshot": args[11],
      }
    raise AssertionError(f"Unexpected query: {query}")


class AtomicDatabase:
  def __init__(self, connection: AtomicConnection) -> None:
    self.connection = connection
    self.pool = AtomicPool(connection, connection.events)


@pytest.mark.parametrize(
  ("invalid_type", "invalid_state"),
  (
    ("camera_analysis", "missing"),
    ("ai_processing", "revoked"),
    ("third_party_ai", "stale"),
  ),
)
@pytest.mark.asyncio
async def test_atomic_create_requires_consents_before_report_insert(
  invalid_type: str,
  invalid_state: str,
) -> None:
  active = consent_rows()
  if invalid_state == "missing":
    active.pop(invalid_type)
  elif invalid_state == "revoked":
    active[invalid_type]["revoked_at"] = datetime.now(UTC)
  else:
    active[invalid_type]["version"] = "stale-version"
  connection = AtomicConnection(active_consents=active)

  with pytest.raises(AppError) as exc_info:
    await analysis_api.create_analysis_job(
      atomic_payload(),
      BackgroundTasks(),
      auth=atomic_auth(),
      db=AtomicDatabase(connection),
      settings=Settings(s3_bucket_name="media-bucket"),
    )

  assert exc_info.value.status_code == 403
  assert connection.report_insert_count == 0
  assert connection.profile_insert_count == 0
  assert connection.events[-2:] == ["rollback", "release"]


@pytest.mark.asyncio
async def test_atomic_create_rolls_back_report_when_profile_insert_fails(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  connection = AtomicConnection(profile_insert_error=RuntimeError("profile insert failed"))
  dispatches: list[UUID] = []

  async def record_dispatch(_db, _background, report_id, *_args):
    dispatches.append(report_id)

  monkeypatch.setattr(analysis_api, "dispatch_analysis_job", record_dispatch)

  with pytest.raises(RuntimeError, match="profile insert failed"):
    await analysis_api.create_analysis_job(
      atomic_payload(),
      BackgroundTasks(),
      auth=atomic_auth(),
      db=AtomicDatabase(connection),
      settings=Settings(s3_bucket_name="media-bucket"),
    )

  assert connection.report_insert_count == 1
  assert connection.profile_insert_count == 1
  assert dispatches == []
  assert connection.events[-2:] == ["rollback", "release"]


@pytest.mark.parametrize("ownership_failure", ("capture", "media"))
@pytest.mark.asyncio
async def test_ownership_failure_prevents_report_and_profile_insert(
  ownership_failure: str,
) -> None:
  connection = AtomicConnection(capture_owned=ownership_failure != "capture")
  payload = atomic_payload()
  if ownership_failure == "media":
    payload = payload.model_copy(update={"source_media_id": uuid4()})

  with pytest.raises(AppError) as exc_info:
    await analysis_api.create_analysis_job(
      payload,
      BackgroundTasks(),
      auth=atomic_auth(),
      db=AtomicDatabase(connection),
      settings=Settings(s3_bucket_name="media-bucket"),
    )

  assert exc_info.value.code in {"PHOTO_CAPTURE_NOT_FOUND", "MEDIA_NOT_FOUND"}
  assert connection.report_insert_count == 0
  assert connection.profile_insert_count == 0
  assert "rollback" in connection.events


@pytest.mark.asyncio
async def test_atomic_create_commits_report_and_profile_before_dispatch(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  connection = AtomicConnection()

  async def record_dispatch(_db, _background, report_id, *_args):
    assert connection.events[-2:] == ["commit", "release"]
    connection.events.append(f"dispatch:{report_id}")

  monkeypatch.setattr(analysis_api, "dispatch_analysis_job", record_dispatch)

  response = await analysis_api.create_analysis_job(
    atomic_payload(),
    BackgroundTasks(),
    auth=atomic_auth(),
    db=AtomicDatabase(connection),
    settings=Settings(s3_bucket_name="media-bucket"),
  )

  assert response["data"]["job"]["status"] == "pending"
  assert response["data"]["job"]["hasFaceProfile"] is True
  assert "faceProfile" not in response["data"]["job"]["detailPayload"]
  assert connection.report_detail_payload is not None
  stored_request = connection.report_detail_payload["request"]
  assert "faceProfile" not in stored_request
  assert "faceProfileSummary" not in stored_request
  assert connection.consent_types == [
    "camera_analysis",
    "ai_processing",
    "third_party_ai",
  ]
  assert connection.events[-1] == f"dispatch:{ATOMIC_REPORT_ID}"
  assert any("from users" in query and "for key share" in query for query in connection.queries)
  assert any(
    "from photo_captures" in query and "for share of capture, media" in query
    for query in connection.queries
  )
  assert all(
    "for share" in query
    for query in connection.queries
    if "from user_consents" in query
  )


@pytest.mark.asyncio
async def test_dispatch_failure_happens_after_profile_commit(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  connection = AtomicConnection()

  async def fail_dispatch(*_args, **_kwargs):
    assert connection.events[-2:] == ["commit", "release"]
    raise AppError(502, "AI_DISPATCH_FAILED", "queue unavailable")

  monkeypatch.setattr(analysis_api, "dispatch_analysis_job", fail_dispatch)

  with pytest.raises(AppError) as exc_info:
    await analysis_api.create_analysis_job(
      atomic_payload(),
      BackgroundTasks(),
      auth=atomic_auth(),
      db=AtomicDatabase(connection),
      settings=Settings(s3_bucket_name="media-bucket"),
    )

  assert exc_info.value.code == "AI_DISPATCH_FAILED"
  assert connection.profile_insert_count == 1
  assert "commit" in connection.events
  assert "rollback" not in connection.events


@pytest.mark.parametrize("profile_factory", (make_blocked_profile, make_failed_profile))
@pytest.mark.asyncio
async def test_blocked_or_failed_profile_is_saved_for_retake_without_ai_dispatch(
  monkeypatch: pytest.MonkeyPatch,
  profile_factory,
) -> None:
  connection = AtomicConnection(active_consents={
    "camera_analysis": consent_rows()["camera_analysis"],
  })

  async def fail_dispatch(*_args, **_kwargs):
    raise AssertionError("blocked face profiles must never dispatch")

  monkeypatch.setattr(analysis_api, "dispatch_analysis_job", fail_dispatch)
  response = await analysis_api.create_analysis_job(
    atomic_payload(profile_factory()),
    BackgroundTasks(),
    auth=atomic_auth(),
    db=AtomicDatabase(connection),
    settings=Settings(s3_bucket_name="media-bucket"),
  )

  job = response["data"]["job"]
  assert job["status"] == "failed"
  assert job["retakeRequired"] is True
  assert job["error"]["code"] == "FACE_PROFILE_RETAKE_REQUIRED"
  assert connection.report_detail_payload is not None
  assert connection.report_detail_payload["error"]["code"] == (
    "FACE_PROFILE_RETAKE_REQUIRED"
  )
  assert connection.consent_types == ["camera_analysis"]
  assert connection.events[-2:] == ["commit", "release"]


def test_provider_context_and_prompt_are_compact_derived_only() -> None:
  profile = make_full_profile()
  profile["existingAnalysis"]["verticalThirds"] = {
    "status": "full_success",
    "confidence": 0.91,
    "displayRatio": {"upper": 0.96, "middle": 1.0, "lower": 1.08},
    "dominantPart": "lower",
    "hairline": {"confidence": 0.84, "provider": "apple_semantic_matte"},
    "summary": "하안부가 조금 길어요",
  }
  model = FaceProfileResultModel.model_validate(profile)
  summary = compact_face_profile_for_ai(model)
  serialized = json.dumps(summary)

  assert set(summary) == {
    "schemaVersion",
    "status",
    "statusReason",
    "overallConfidence",
    "faceShape",
    "beautyCoreFeatures",
    "personalColor",
    "verticalThirds",
    "quality",
    "warnings",
  }
  assert set(summary["faceShape"]) == {
    "status",
    "dominantShape",
    "confidenceGap",
    "overallConfidence",
    "top2",
    "explanationTraits",
    "warnings",
  }
  assert set(summary["beautyCoreFeatures"]) == {
    "facialContrast",
    "skinEvenness",
    "faceBalance",
    "eyesAndBrows",
    "nose",
    "mouth",
    "quality",
  }
  assert set(summary["personalColor"]) == {
    "status",
    "measurementConfidence",
    "axes",
    "tone",
    "palette",
    "calibrationApplied",
    "warnings",
  }
  assert set(summary["quality"]) == {
    "confidence",
    "isFrontal",
    "neutralExpression",
    "lightingQuality",
    "blockingReasons",
  }
  assert summary["verticalThirds"] == {
    "status": "full_success",
    "confidence": 0.91,
    "displayRatio": {"upper": 0.96, "middle": 1.0, "lower": 1.08},
    "dominantPart": "lower",
    "hairline": {"confidence": 0.84, "provider": "apple_semantic_matte"},
    "summary": "하안부가 조금 길어요",
  }
  assert len(serialized.encode("utf-8")) < 32 * 1024
  observed_keys: set[str] = set()

  def collect_keys(value: object) -> None:
    if isinstance(value, dict):
      for key, nested in value.items():
        observed_keys.add("".join(character for character in key.casefold() if character.isalnum()))
        collect_keys(nested)
    elif isinstance(value, list):
      for nested in value:
        collect_keys(nested)

  collect_keys(summary)
  assert observed_keys.isdisjoint({
    "rawlandmarks",
    "landmarks",
    "depthmap",
    "calibrationdata",
    "semanticmatte",
    "roipixels",
  })

  prompt = OpenAIAnalysisService(Settings())._build_analysis_prompt({
    "faceProfileSummary": summary,
    "objectKey": "uploads/private/raw-photo.jpg",
    "clientClaim": "invent a new jaw ratio",
  })
  assert "uploads/private/raw-photo.jpg" not in prompt
  assert "invent a new jaw ratio" not in prompt
  assert "faceProfileSummary" in prompt
  assert "faceProfileSummary.verticalThirds" in prompt
  assert "faceVerticalThirds" not in prompt
  assert "하안부가 조금 길어요" in prompt
  assert "기하" in prompt
  assert "랜드마크" in prompt
  assert "depth" in prompt.casefold()


class BackgroundGuardDatabase:
  def __init__(self) -> None:
    self.execute_calls: list[tuple[str, tuple]] = []
    self.fetchrow_calls: list[tuple[str, tuple]] = []

  async def execute(self, query: str, *args):
    self.execute_calls.append((query, args))
    return "UPDATE 1"

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, args))
    return None


@pytest.mark.asyncio
async def test_text_provider_rechecks_consent_after_slow_source_read(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  source_read_started = Event()
  release_source_read = Event()
  revoked = False
  provider_calls = 0
  guard_calls = 0

  def slow_source_read(_payload):
    source_read_started.set()
    assert release_source_read.wait(timeout=2)
    return b"source-face"

  def provider_must_not_run(*_args, **_kwargs):
    nonlocal provider_calls
    provider_calls += 1
    raise AssertionError("text provider must not run after consent revocation")

  async def guard():
    nonlocal guard_calls
    guard_calls += 1
    if revoked:
      raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")

  service = OpenAIAnalysisService(Settings())
  monkeypatch.setattr(service, "_read_source_image_bytes", slow_source_read)
  monkeypatch.setattr(service, "_analyze_image_sync", provider_must_not_run)

  analysis = asyncio.create_task(
    service.analyze_text({}, execution_guard=guard),
  )
  assert await asyncio.to_thread(source_read_started.wait, 2)
  revoked = True
  release_source_read.set()

  with pytest.raises(AppError) as exc_info:
    await analysis

  assert exc_info.value.code == "FACE_ANALYSIS_CONSENT_REVOKED"
  assert guard_calls == 1
  assert provider_calls == 0


@pytest.mark.parametrize("worker_mode", (False, True), ids=("inline", "sqs-worker"))
@pytest.mark.asyncio
async def test_background_job_checks_guard_before_text_provider(
  monkeypatch: pytest.MonkeyPatch,
  worker_mode: bool,
) -> None:
  calls: list[str] = []

  async def revoked_guard(*_args, **_kwargs):
    calls.append("guard")
    raise AppError(
      403,
      "FACE_ANALYSIS_CONSENT_REVOKED",
      "revoked",
    )

  class ProviderMustNotRun:
    def __init__(self, _settings):
      calls.append("provider_init")

    async def analyze_text(self, _payload, *, execution_guard=None):
      calls.append("provider_call")
      raise AssertionError("provider must not run after consent revocation")

  monkeypatch.setattr(
    analysis_api,
    "require_execution_allowed",
    revoked_guard,
    raising=False,
  )
  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", ProviderMustNotRun)

  await analysis_api.run_analysis_job_background(
    ATOMIC_REPORT_ID,
    atomic_payload(),
    Settings(image_generation_provider="disabled"),
    db=BackgroundGuardDatabase(),
    await_image_generation=worker_mode,
  )

  assert calls == ["guard"]


def test_report_selects_keep_list_summary_scalar_and_detail_full() -> None:
  summary_select = " ".join(analysis_api.ANALYSIS_SUMMARY_SELECT.split()).lower()
  detail_select = " ".join(analysis_api.ANALYSIS_DETAIL_SELECT.split()).lower()

  assert "afp.profile_payload" not in summary_select
  assert "r.detail_payload" not in summary_select
  assert "afp.status as face_profile_status" in summary_select
  assert "afp.profile_payload as face_profile" in detail_select
  assert "r.*" in detail_select
  normalized_summary = analysis_api.normalize_analysis_report_row({
    "id": ATOMIC_REPORT_ID,
    "status": "completed",
    "face_profile_status": "full_success",
    "face_profile_dominant_shape": "oval",
    "face_profile_confidence_gap": 0.2,
    "face_profile_schema_version": "aura-face-profile-v1",
  })
  assert normalized_summary is not None
  assert "detail_payload" not in normalized_summary


class DeleteConnection:
  def __init__(self) -> None:
    self.events: list[str] = []

  def transaction(self):
    return AtomicTransaction(self.events)

  async def fetchrow(self, query: str, *_args):
    assert "for update of r" in query.lower()
    return {
      "id": ATOMIC_REPORT_ID,
      "user_id": ATOMIC_USER_ID,
      "status": "processing",
      "deleted_at": None,
      "detail_payload": {},
      "source_media_bucket": None,
      "source_media_object_key": None,
      "preview_media_bucket": None,
      "preview_media_object_key": None,
      "capture_media_bucket": None,
      "capture_media_object_key": None,
    }

  async def execute(self, query: str, *_args):
    normalized = " ".join(query.lower().split())
    if "delete from analysis_face_profiles" in normalized:
      self.events.append("profile_delete")
    elif "update analysis_reports" in normalized:
      self.events.append("report_soft_delete")
    return "DELETE 1"


@pytest.mark.asyncio
async def test_soft_delete_removes_profile_before_parent_report_update(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  connection = DeleteConnection()
  db = AtomicDatabase(connection)  # type: ignore[arg-type]

  async def no_schema(_db):
    return None

  async def current_user(_db, _auth):
    return {"id": ATOMIC_USER_ID}

  async def no_media_deletions(*_args, **_kwargs):
    return [], 0

  monkeypatch.setattr(analysis_api, "ensure_media_deletion_schema", no_schema)
  monkeypatch.setattr(analysis_api, "ensure_user", current_user)
  monkeypatch.setattr(
    analysis_api,
    "enqueue_unreferenced_report_media_deletions",
    no_media_deletions,
  )

  response = await analysis_api.delete_analysis_report(
    ATOMIC_REPORT_ID,
    BackgroundTasks(),
    auth=atomic_auth(),
    db=db,
    settings=Settings(s3_bucket_name="media-bucket"),
  )

  assert response["data"]["deleted"] is True
  assert connection.events.index("profile_delete") < connection.events.index(
    "report_soft_delete",
  )


class ConcurrentShareTransaction:
  def __init__(self, connection) -> None:
    self.connection = connection

  async def __aenter__(self):
    self.connection.in_transaction = True

  async def __aexit__(self, _exc_type, _exc, _traceback):
    self.connection.in_transaction = False
    if self.connection.share_lock_held:
      self.connection.share_lock_held = False
      self.connection.row_lock.release()


class ConcurrentCaptureConnection:
  def __init__(self) -> None:
    self.row_lock = asyncio.Lock()
    self.share_lock_held = False
    self.in_transaction = False
    self.writer_started = asyncio.Event()

  def transaction(self):
    return ConcurrentShareTransaction(self)

  async def fetchrow(self, query: str, *_args):
    normalized = " ".join(query.lower().split())
    assert self.in_transaction
    if "for share of capture, media" in normalized:
      await self.row_lock.acquire()
      self.share_lock_held = True
    return {
      "capture_id": CAPTURE_ID,
      "id": ATOMIC_MEDIA_ID,
      "bucket": "media-bucket",
      "object_key": "uploads/photo-captures/atomic.jpg",
      "cdn_url": None,
      "content_type": "image/jpeg",
      "width": 1200,
      "height": 1600,
    }

  async def soft_delete_media_or_capture(self) -> None:
    self.writer_started.set()
    async with self.row_lock:
      return None


@pytest.mark.asyncio
async def test_capture_and_media_share_lock_serializes_concurrent_soft_delete() -> None:
  connection = ConcurrentCaptureConnection()

  async with connection.transaction():
    await analysis_api._lock_owned_capture_media(
      connection,
      photo_capture_id=CAPTURE_ID,
      user_id=ATOMIC_USER_ID,
    )
    writer = asyncio.create_task(connection.soft_delete_media_or_capture())
    await connection.writer_started.wait()
    await asyncio.sleep(0)
    assert writer.done() is False

  await asyncio.wait_for(writer, timeout=1)
  assert writer.done() is True


class PipelineDatabase:
  def __init__(self) -> None:
    self.fetchrow_calls: list[tuple[str, tuple]] = []
    self.execute_calls: list[tuple[str, tuple]] = []
    self.pool = None

  async def fetchrow(self, query: str, *args):
    self.fetchrow_calls.append((query, args))
    normalized = " ".join(query.lower().split())
    if "set status = 'processing'" in normalized:
      return {"id": ATOMIC_REPORT_ID}
    if "set ai_provider" in normalized:
      return {
        "id": ATOMIC_REPORT_ID,
        "status": "processing",
        "summary": "text complete",
      }
    if "set embedding" in normalized:
      return {"id": ATOMIC_REPORT_ID}
    if "set detail_payload" in normalized:
      return {"id": ATOMIC_REPORT_ID}
    if "set status = 'completed'" in normalized:
      return {"id": ATOMIC_REPORT_ID}
    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def execute(self, query: str, *args):
    self.execute_calls.append((query, args))
    return "UPDATE 1"


@pytest.mark.asyncio
async def test_text_response_is_not_persisted_when_post_provider_guard_fails(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  guard_calls = 0
  provider_calls = 0

  async def guard(*_args, **_kwargs):
    nonlocal guard_calls
    guard_calls += 1
    if guard_calls == 4:
      raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")
    return {"status": "processing"}

  class TextProvider:
    def __init__(self, _settings):
      pass

    async def analyze_text(self, _payload, *, execution_guard=None):
      nonlocal provider_calls
      provider_calls += 1
      return {"summary": "must not persist", "recommendedMakeups": []}

  db = PipelineDatabase()
  monkeypatch.setattr(analysis_api, "require_execution_allowed", guard)
  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", TextProvider)

  await analysis_api.run_analysis_job_background(
    ATOMIC_REPORT_ID,
    atomic_payload(),
    Settings(image_generation_provider="disabled"),
    db=db,
  )

  assert provider_calls == 1
  assert guard_calls == 4
  assert not any("set ai_provider" in query.lower() for query, _ in db.fetchrow_calls)
  assert db.execute_calls == []


@pytest.mark.asyncio
async def test_embedding_response_is_not_persisted_when_post_provider_guard_fails(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  guard_calls = 0
  provider_calls = 0

  async def guard(*_args, **_kwargs):
    nonlocal guard_calls
    guard_calls += 1
    if guard_calls == 2:
      raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")
    return {"status": "processing"}

  def embedding_provider(_text):
    nonlocal provider_calls
    provider_calls += 1
    return [0.1, 0.2]

  db = PipelineDatabase()
  monkeypatch.setattr(analysis_api, "require_execution_allowed", guard)
  monkeypatch.setattr(analysis_api, "embed_text", embedding_provider)

  status = await analysis_api.update_analysis_report_embedding(
    db,
    {"id": ATOMIC_REPORT_ID, "summary": "safe"},
    Settings(),
  )

  assert status == "cancelled"
  assert provider_calls == 1
  assert db.fetchrow_calls == []


@pytest.mark.asyncio
async def test_image_post_provider_guard_prevents_s3_upload_and_reference(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  guard_calls = 0
  provider_calls = 0
  orphaned: list[dict] = []
  progress: list[dict] = []

  class RecordingS3:
    def __init__(self) -> None:
      self.put_calls: list[dict] = []

    def put_object(self, **kwargs):
      self.put_calls.append(kwargs)

  async def guard():
    nonlocal guard_calls
    guard_calls += 1
    if guard_calls == 2:
      raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")

  async def orphan(card):
    orphaned.append(card)

  async def on_progress(_index, card, _partial):
    progress.append(card)

  def provider(*_args, **_kwargs):
    nonlocal provider_calls
    provider_calls += 1
    return b"generated-image"

  s3 = RecordingS3()
  service = OpenAIAnalysisService(
    Settings(s3_bucket_name="media-bucket", image_generation_provider="openai"),
  )
  monkeypatch.setattr(service, "_invoke_single_makeup_image_provider", provider)
  monkeypatch.setattr(service, "_s3_client", lambda: s3)

  result = await service.generate_recommended_makeup_images(
    {},
    {"recommendedMakeups": [{"title": "look"}]},
    on_card_generated=on_progress,
    prepared_source=(b"source", "image/jpeg"),
    execution_guard=guard,
    on_orphaned_card=orphan,
  )

  assert result["imageGenerationStatus"] == "failed"
  assert provider_calls == 1
  assert s3.put_calls == []
  assert orphaned == []
  assert progress == []


@pytest.mark.asyncio
async def test_image_post_upload_guard_enqueues_orphan_and_skips_reference(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  guard_calls = 0
  orphaned: list[dict] = []
  progress: list[dict] = []
  outbox_records: list[tuple[UUID, list]] = []
  processed_outbox_ids: list[UUID] = []

  class RecordingS3:
    def __init__(self) -> None:
      self.put_calls: list[dict] = []

    def put_object(self, **kwargs):
      self.put_calls.append(kwargs)

  async def guard():
    nonlocal guard_calls
    guard_calls += 1
    if guard_calls == 3:
      raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")

  connection = AtomicConnection()
  db = AtomicDatabase(connection)

  async def enqueue_outbox(_connection, *, report_id, refs):
    outbox_records.append((report_id, list(refs)))
    return [uuid4()], 0

  settings = Settings(
    s3_bucket_name="media-bucket",
    image_generation_provider="openai",
  )

  async def process_outbox(_db, received_settings, outbox_ids):
    assert received_settings is settings
    processed_outbox_ids.extend(outbox_ids)

  async def orphan(card):
    orphaned.append(card)
    await analysis_api.enqueue_orphaned_generated_card(
      db,
      settings,
      ATOMIC_REPORT_ID,
      card,
    )

  async def on_progress(_index, card, _partial):
    progress.append(card)

  s3 = RecordingS3()
  service = OpenAIAnalysisService(settings)
  monkeypatch.setattr(
    analysis_api,
    "enqueue_unreferenced_report_media_deletions",
    enqueue_outbox,
  )
  monkeypatch.setattr(
    analysis_api,
    "process_media_deletion_outbox_items",
    process_outbox,
  )
  monkeypatch.setattr(
    service,
    "_invoke_single_makeup_image_provider",
    lambda *_args, **_kwargs: b"generated-image",
  )
  monkeypatch.setattr(service, "_s3_client", lambda: s3)

  result = await service.generate_recommended_makeup_images(
    {},
    {"recommendedMakeups": [{"title": "look"}]},
    on_card_generated=on_progress,
    prepared_source=(b"source", "image/jpeg"),
    execution_guard=guard,
    on_orphaned_card=orphan,
  )

  assert result["imageGenerationStatus"] == "failed"
  assert len(s3.put_calls) == 1
  assert len(orphaned) == 1
  assert orphaned[0]["imageObjectKey"].startswith("uploads/generated-makeup/")
  assert len(outbox_records) == 1
  assert outbox_records[0][0] == ATOMIC_REPORT_ID
  assert len(processed_outbox_ids) == 1
  assert progress == []


@pytest.mark.asyncio
async def test_image_pre_provider_guard_stops_provider_call(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  provider_calls = 0

  async def guard():
    raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")

  def provider(*_args, **_kwargs):
    nonlocal provider_calls
    provider_calls += 1
    raise AssertionError("image provider must not run")

  service = OpenAIAnalysisService(
    Settings(s3_bucket_name="media-bucket", image_generation_provider="openai"),
  )
  monkeypatch.setattr(service, "_invoke_single_makeup_image_provider", provider)

  result = await service.generate_recommended_makeup_images(
    {},
    {"recommendedMakeups": [{"title": "look"}]},
    prepared_source=(b"source", "image/jpeg"),
    execution_guard=guard,
  )

  assert provider_calls == 0
  assert result["imageGenerationStatus"] == "failed"


@pytest.mark.asyncio
async def test_report_completes_only_after_embedding_reaches_terminal_state(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def guard(*_args, **_kwargs):
    return {"status": "processing"}

  class TextProvider:
    def __init__(self, _settings):
      pass

    async def analyze_text(self, provider_payload, *, execution_guard=None):
      assert "faceProfileSummary" in provider_payload
      return {"summary": "complete", "recommendedMakeups": []}

  db = PipelineDatabase()
  monkeypatch.setattr(analysis_api, "require_execution_allowed", guard)
  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", TextProvider)
  monkeypatch.setattr(analysis_api, "embed_text", lambda _text: None)

  await analysis_api.run_analysis_job_background(
    ATOMIC_REPORT_ID,
    atomic_payload(),
    Settings(image_generation_provider="disabled"),
    db=db,
  )

  normalized_queries = [
    " ".join(query.lower().split())
    for query, _ in db.fetchrow_calls
  ]
  text_index = next(
    index for index, query in enumerate(normalized_queries) if "set ai_provider" in query
  )
  complete_index = next(
    index
    for index, query in enumerate(normalized_queries)
    if "set status = 'completed'" in query
  )
  assert text_index < complete_index
  assert "status = 'processing'" in normalized_queries[text_index]
  assert "deleted_at is null" in normalized_queries[complete_index]
  assert "status <> 'cancelled'" in normalized_queries[complete_index]
  final_args = db.fetchrow_calls[complete_index][1]
  assert json.loads(final_args[1])["result"]["embeddingStatus"] == "skipped"


@pytest.mark.asyncio
async def test_revocation_after_text_stops_embedding_and_image_providers(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  guard_calls = 0
  calls = {"text": 0, "embedding": 0, "image": 0}

  async def guard(*_args, **_kwargs):
    nonlocal guard_calls
    guard_calls += 1
    if guard_calls == 5:
      raise AppError(403, "FACE_ANALYSIS_CONSENT_REVOKED", "revoked")
    return {"status": "processing"}

  class TextProvider:
    def __init__(self, _settings):
      pass

    async def prepare_generation_source(self, _payload):
      return b"source", "image/jpeg"

    async def analyze_text(self, _payload, *, execution_guard=None):
      calls["text"] += 1
      return {
        "summary": "text complete",
        "recommendedMakeups": [{"title": "look"}],
      }

  def embedding_provider(_text):
    calls["embedding"] += 1
    return [0.1]

  def schedule_image(*_args, **_kwargs):
    calls["image"] += 1

  db = PipelineDatabase()
  monkeypatch.setattr(analysis_api, "require_execution_allowed", guard)
  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", TextProvider)
  monkeypatch.setattr(analysis_api, "embed_text", embedding_provider)
  monkeypatch.setattr(
    analysis_api,
    "schedule_analysis_images_background",
    schedule_image,
  )

  await analysis_api.run_analysis_job_background(
    ATOMIC_REPORT_ID,
    atomic_payload(),
    Settings(image_generation_provider="openai"),
    db=db,
  )

  assert calls == {"text": 1, "embedding": 0, "image": 0}


@pytest.mark.asyncio
async def test_text_and_embedding_leave_report_processing_until_image_terminal(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  scheduled: list[dict] = []

  async def guard(*_args, **_kwargs):
    return {"status": "processing"}

  class TextProvider:
    def __init__(self, _settings):
      pass

    async def prepare_generation_source(self, _payload):
      return b"source", "image/jpeg"

    async def analyze_text(self, _payload, *, execution_guard=None):
      return {
        "summary": "text complete",
        "recommendedMakeups": [{"title": "look"}],
      }

  def schedule(_report_id, _payload, result, *_args, **_kwargs):
    scheduled.append(result)

  db = PipelineDatabase()
  monkeypatch.setattr(analysis_api, "require_execution_allowed", guard)
  monkeypatch.setattr(analysis_api, "OpenAIAnalysisService", TextProvider)
  monkeypatch.setattr(analysis_api, "embed_text", lambda _text: None)
  monkeypatch.setattr(analysis_api, "schedule_analysis_images_background", schedule)

  await analysis_api.run_analysis_job_background(
    ATOMIC_REPORT_ID,
    atomic_payload(),
    Settings(image_generation_provider="openai"),
    db=db,
  )

  assert len(scheduled) == 1
  assert scheduled[0]["embeddingStatus"] == "skipped"
  assert scheduled[0]["imageGenerationStatus"] == "processing"
  assert not any(
    "set status = 'completed'" in query.lower()
    for query, _ in db.fetchrow_calls
  )
