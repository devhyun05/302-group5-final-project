import copy
import json
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from app.schemas.face_profile import (
  FACE_PROFILE_MAX_BYTES,
  FaceProfileResultModel,
)
from app.services.user_consents import (
  AI_PROCESSING_CONSENT_VERSION,
  FACE_PROFILE_CONSENT_VERSION,
  THIRD_PARTY_AI_CONSENT_VERSION,
)


CONSENT_SNAPSHOT_KEYS = {
  "camera_analysis": "cameraAnalysis",
  "ai_processing": "aiProcessing",
  "third_party_ai": "thirdPartyAi",
}
CONSENT_VERSIONS = {
  "camera_analysis": FACE_PROFILE_CONSENT_VERSION,
  "ai_processing": AI_PROCESSING_CONSENT_VERSION,
  "third_party_ai": THIRD_PARTY_AI_CONSENT_VERSION,
}


def _decode_json_object(value: Any, *, field: str) -> dict[str, Any]:
  if isinstance(value, Mapping):
    return copy.deepcopy(dict(value))
  if isinstance(value, str):
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError as exc:
      raise ValueError(f"{field} must contain a JSON object") from exc
    if isinstance(decoded, dict):
      return decoded
  raise ValueError(f"{field} must contain a JSON object")


def _snapshot_timestamp(value: Any) -> str:
  if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
    raise ValueError("consent accepted_at must be a timezone-aware datetime")
  serialized = value.isoformat()
  return serialized[:-6] + "Z" if serialized.endswith("+00:00") else serialized


def _snapshot_metadata(value: Any) -> dict[str, Any]:
  if value is None:
    return {}
  metadata = _decode_json_object(value, field="consent metadata")
  try:
    return json.loads(json.dumps(metadata, ensure_ascii=False, allow_nan=False))
  except (TypeError, ValueError) as exc:
    raise ValueError("consent metadata must be finite JSON") from exc


def build_consent_snapshot(
  consent_rows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
  """Copy only active, current, server-read consent rows into history JSON."""

  if not isinstance(consent_rows, Mapping):
    raise TypeError("consent_rows must be a mapping of verified server rows")
  unknown = set(consent_rows) - set(CONSENT_SNAPSHOT_KEYS)
  if unknown:
    raise ValueError("consent_rows contains an unsupported consent type")
  if "camera_analysis" not in consent_rows:
    raise ValueError("camera_analysis consent is required for every face profile")

  snapshot: dict[str, Any] = {}
  for consent_type in (
    "camera_analysis",
    "ai_processing",
    "third_party_ai",
  ):
    if consent_type not in consent_rows:
      continue
    row = consent_rows[consent_type]
    if not isinstance(row, Mapping):
      raise TypeError("consent row must be a server mapping")
    expected_version = CONSENT_VERSIONS[consent_type]
    if (
      row.get("consent_type") != consent_type
      or row.get("version") != expected_version
      or row.get("accepted") is not True
      or row.get("revoked_at") is not None
      or row.get("id") is None
      or row.get("accepted_at") is None
    ):
      raise ValueError(f"{consent_type} consent row is not active and current")
    snapshot[CONSENT_SNAPSHOT_KEYS[consent_type]] = {
      "consentId": str(row["id"]),
      "version": expected_version,
      "acceptedAt": _snapshot_timestamp(row["accepted_at"]),
      "metadata": _snapshot_metadata(row.get("metadata")),
    }
  return snapshot


def serialize_face_profile(profile: FaceProfileResultModel) -> str:
  if not isinstance(profile, FaceProfileResultModel):
    raise TypeError("profile must be a validated FaceProfileResultModel")
  # Re-validate a detached JSON representation so nested mutable containers
  # cannot bypass validation after the original model was constructed.
  validated = FaceProfileResultModel.model_validate(
    profile.model_dump(mode="json", by_alias=True),
  )
  serialized = json.dumps(
    validated.model_dump(mode="json", by_alias=True),
    ensure_ascii=False,
    separators=(",", ":"),
    allow_nan=False,
  )
  if len(serialized.encode("utf-8")) > FACE_PROFILE_MAX_BYTES:
    raise ValueError("validated face profile exceeds 256 KiB")
  return serialized


def _derived_profile_columns(
  profile: FaceProfileResultModel,
) -> tuple[str, str, str | None, float | None]:
  return (
    profile.schema_version,
    profile.status,
    profile.face_shape.dominant_shape,
    profile.face_shape.confidence_gap,
  )


def compact_face_profile_for_ai(
  profile: FaceProfileResultModel,
) -> dict[str, Any]:
  """Return a small, validated, derived-only provider context."""

  if not isinstance(profile, FaceProfileResultModel):
    raise TypeError("profile must be a validated FaceProfileResultModel")
  validated = FaceProfileResultModel.model_validate(
    profile.model_dump(mode="json", by_alias=True),
  )
  shape = validated.face_shape
  beauty = validated.beauty_core_features
  vertical_thirds = validated.existing_analysis.vertical_thirds
  personal_color = (
    validated.existing_analysis.personal_color
    or validated.color.personal_color.value
  )
  personal_color_summary: dict[str, Any]
  if personal_color is None:
    personal_color_summary = {
      "status": "unavailable",
      "measurementConfidence": 0.0,
      "axes": None,
      "tone": None,
      "palette": {"bestFamilyIds": [], "worstFamilyIds": []},
      "calibrationApplied": False,
      "warnings": ["personal_color_unavailable"],
    }
  else:
    personal_color_summary = {
      "status": personal_color.status,
      "measurementConfidence": personal_color.measurement_confidence,
      "axes": personal_color.axes.model_dump(mode="json", by_alias=True),
      "tone": (
        {
          "top": personal_color.tone.top,
          "secondary": personal_color.tone.secondary,
          "season": personal_color.tone.season,
          "score": personal_color.tone.score,
          "gap": personal_color.tone.gap,
        }
        if personal_color.tone is not None
        else None
      ),
      "palette": personal_color.palette.model_dump(mode="json", by_alias=True),
      "calibrationApplied": personal_color.calibration_applied,
      "warnings": list(personal_color.warnings),
    }

  warnings = [
    *validated.warnings,
    *shape.warnings,
    *validated.quality.blocking_reasons,
    *personal_color_summary["warnings"],
  ]
  if validated.status == "partial_success":
    warnings.append("partial_measurements")
  if validated.status in {"blocked", "failed"}:
    warnings.append("retake_required")
  if beauty.quality.confidence < 0.6:
    warnings.append("low_overall_confidence")
  bounded_warnings = list(dict.fromkeys(warnings))[:32]

  return {
    "schemaVersion": validated.schema_version,
    "status": validated.status,
    "statusReason": validated.status_reason,
    "overallConfidence": beauty.quality.confidence,
    "faceShape": {
      "status": shape.status,
      "dominantShape": shape.dominant_shape,
      "confidenceGap": shape.confidence_gap,
      "overallConfidence": shape.overall_confidence,
      "top2": [
        item.model_dump(mode="json", by_alias=True)
        for item in shape.top2
      ],
      "explanationTraits": list(shape.explanation_traits),
      "warnings": list(shape.warnings),
    },
    "beautyCoreFeatures": beauty.model_dump(mode="json", by_alias=True),
    "personalColor": personal_color_summary,
    "verticalThirds": (
      vertical_thirds.model_dump(mode="json", by_alias=True)
      if vertical_thirds is not None
      else None
    ),
    "quality": {
      "confidence": beauty.quality.confidence,
      "isFrontal": beauty.quality.is_frontal,
      "neutralExpression": beauty.quality.neutral_expression,
      "lightingQuality": beauty.quality.lighting_quality,
      "blockingReasons": list(validated.quality.blocking_reasons),
    },
    "warnings": bounded_warnings,
  }


async def insert_analysis_face_profile(
  connection,
  *,
  report_id: object,
  user_id: object,
  photo_capture_id: object,
  profile: FaceProfileResultModel,
  consent_rows: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
  if not isinstance(profile, FaceProfileResultModel):
    raise TypeError("profile must be a validated FaceProfileResultModel")

  profile_json = serialize_face_profile(profile)
  snapshot = build_consent_snapshot(consent_rows)
  camera_consent = consent_rows["camera_analysis"]
  schema_version, status, dominant_shape, confidence_gap = (
    _derived_profile_columns(profile)
  )
  snapshot_json = json.dumps(
    snapshot,
    ensure_ascii=False,
    separators=(",", ":"),
    allow_nan=False,
  )

  row = await connection.fetchrow(
    """
    insert into analysis_face_profiles (
      report_id,
      user_id,
      photo_capture_id,
      schema_version,
      status,
      dominant_shape,
      confidence_gap,
      profile_payload,
      camera_consent_id,
      consent_version,
      consent_accepted_at,
      consent_snapshot
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb)
    returning report_id, user_id, photo_capture_id, schema_version, status,
              dominant_shape, confidence_gap, profile_payload,
              camera_consent_id, consent_version, consent_accepted_at,
              consent_snapshot, analyzed_at, created_at, updated_at
    """,
    report_id,
    user_id,
    photo_capture_id,
    schema_version,
    status,
    dominant_shape,
    confidence_gap,
    profile_json,
    camera_consent["id"],
    camera_consent["version"],
    camera_consent["accepted_at"],
    snapshot_json,
  )
  if row is None:
    raise RuntimeError("analysis face profile insert returned no row")
  return decode_analysis_face_profile_row(row)


def decode_analysis_face_profile_row(
  row: Mapping[str, Any],
) -> dict[str, Any]:
  if not isinstance(row, Mapping):
    raise TypeError("analysis face profile row must be a mapping")
  normalized = dict(row)
  profile_object = _decode_json_object(
    normalized.get("profile_payload"),
    field="profile_payload",
  )
  profile = FaceProfileResultModel.model_validate(profile_object)
  payload = profile.model_dump(mode="json", by_alias=True)
  schema_version, status, dominant_shape, confidence_gap = (
    _derived_profile_columns(profile)
  )
  expected_columns = {
    "schema_version": schema_version,
    "status": status,
    "dominant_shape": dominant_shape,
    "confidence_gap": confidence_gap,
  }
  for key, expected in expected_columns.items():
    if key in normalized and normalized[key] != expected:
      raise ValueError(f"stored {key} does not match validated profile_payload")

  normalized.update(expected_columns)
  normalized["profile_payload"] = payload
  normalized["consent_snapshot"] = _decode_json_object(
    normalized.get("consent_snapshot"),
    field="consent_snapshot",
  )
  return normalized


def map_face_profile_summary(
  row: Mapping[str, Any] | None,
) -> dict[str, Any]:
  if row is None:
    return {"hasFaceProfile": False, "faceProfileSummary": None}
  joined = "face_profile_status" in row
  direct_profile = all(
    key in row
    for key in ("schema_version", "status", "profile_payload")
  )
  if not joined and not direct_profile:
    return {"hasFaceProfile": False, "faceProfileSummary": None}
  status = row.get("face_profile_status" if joined else "status")
  if status is None:
    return {"hasFaceProfile": False, "faceProfileSummary": None}
  return {
    "hasFaceProfile": True,
    "faceProfileSummary": {
      "status": status,
      "dominantShape": row.get(
        "face_profile_dominant_shape" if joined else "dominant_shape",
      ),
      "confidenceGap": row.get(
        "face_profile_confidence_gap" if joined else "confidence_gap",
      ),
      "schemaVersion": row[
        "face_profile_schema_version" if joined else "schema_version"
      ],
    },
  }


def map_face_profile_detail(
  row: Mapping[str, Any] | None,
) -> dict[str, Any]:
  summary = map_face_profile_summary(row)
  payload: dict[str, Any] | None = None
  if row is not None and summary["hasFaceProfile"]:
    candidate = row.get("face_profile") if "face_profile" in row else row.get("profile_payload")
    profile = FaceProfileResultModel.model_validate(
      _decode_json_object(candidate, field="face_profile"),
    )
    payload = profile.model_dump(mode="json", by_alias=True)
    derived = {
      "status": profile.status,
      "dominantShape": profile.face_shape.dominant_shape,
      "confidenceGap": profile.face_shape.confidence_gap,
      "schemaVersion": profile.schema_version,
    }
    if summary["faceProfileSummary"] != derived:
      raise ValueError("face profile summary columns do not match the validated payload")
  return {
    **summary,
    "faceProfile": payload,
  }
