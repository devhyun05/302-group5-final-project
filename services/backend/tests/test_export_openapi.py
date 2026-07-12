import json
from pathlib import Path

from app.core.settings import Settings
from app.ops.export_openapi import build_openapi_schema, write_openapi_schema


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def find_nonstandard_numeric_constraint_paths(value: object, path: str = "$") -> list[str]:
  if isinstance(value, dict):
    paths = [
      f"{path}.{key}"
      for key in ("ge", "le")
      if key in value
    ]
    for key, nested in value.items():
      paths.extend(find_nonstandard_numeric_constraint_paths(nested, f"{path}.{key}"))
    return paths

  if isinstance(value, list):
    paths: list[str] = []
    for index, nested in enumerate(value):
      paths.extend(find_nonstandard_numeric_constraint_paths(nested, f"{path}[{index}]"))
    return paths

  return []


def resolve_component_schema(schema: dict, candidate: dict) -> dict:
  reference = candidate.get("$ref")
  if not isinstance(reference, str):
    return candidate
  prefix = "#/components/schemas/"
  assert reference.startswith(prefix)
  return schema["components"]["schemas"][reference.removeprefix(prefix)]


def success_data_schema(schema: dict, path: str, method: str) -> dict:
  response_schema = schema["paths"][path][method]["responses"]["200"]["content"][
    "application/json"
  ]["schema"]
  envelope = resolve_component_schema(schema, response_schema)
  assert {"data", "meta", "error"}.issubset(envelope["properties"])
  return resolve_component_schema(schema, envelope["properties"]["data"])


def assert_face_profile_openapi_contract(schema: dict) -> None:
  paths = schema["paths"]
  assert "get" in paths["/api/users/me/consents"]
  assert {"put", "delete"}.issubset(
    paths["/api/users/me/consents/{consent_type}"],
  )

  components = schema["components"]["schemas"]
  consent_metadata_schema = components["FaceAnalysisConsentMetadata"]
  assert consent_metadata_schema["properties"]["rawSensorArtifactsStored"]["const"] is False
  assert consent_metadata_schema["properties"]["trainingUseAllowed"]["const"] is False

  consent_acceptance_schema = components["FaceAnalysisConsentAcceptance"]
  assert consent_acceptance_schema["properties"]["accepted"]["const"] is True

  job_schema = components["AnalysisJobCreate"]
  assert "faceProfile" in job_schema["required"]
  assert job_schema["properties"]["faceProfile"]["$ref"].endswith(
    "/FaceProfileResultModel-Input",
  )

  profile_schema = resolve_component_schema(
    schema,
    job_schema["properties"]["faceProfile"],
  )
  assert profile_schema["additionalProperties"] is False
  assert {
    "schemaVersion",
    "status",
    "captureId",
    "createdAt",
    "quality",
    "color",
    "faceBalance",
    "eyesAndBrows",
    "nose",
    "mouth",
    "faceShape",
    "beautyCoreFeatures",
    "existingAnalysis",
    "warnings",
    "provenance",
  }.issubset(profile_schema["required"])
  assert profile_schema["properties"]["schemaVersion"]["const"] == "aura-face-profile-v1"

  provenance_schema = components["FaceProfileProvenance"]
  assert provenance_schema["additionalProperties"] is False
  assert provenance_schema["properties"]["trainingUseAllowed"]["const"] is False

  unit_number_schema = components["FaceShapeScores"]["properties"]["oval"]
  assert unit_number_schema["minimum"] == 0
  assert unit_number_schema["maximum"] == 1

  non_negative_schema = provenance_schema["properties"]["landmarkCount"]
  assert non_negative_schema["minimum"] == 0

  assert find_nonstandard_numeric_constraint_paths(schema) == []

  consent_status = success_data_schema(
    schema,
    "/api/users/me/consents",
    "get",
  )
  assert {
    "requiredConsentTypes",
    "consentVersions",
    "consents",
    "allRequiredActive",
  }.issubset(consent_status["properties"])
  consent_acceptance = success_data_schema(
    schema,
    "/api/users/me/consents/{consent_type}",
    "put",
  )
  assert "consent" in consent_acceptance["properties"]
  consent_revocation = success_data_schema(
    schema,
    "/api/users/me/consents/{consent_type}",
    "delete",
  )
  assert {"consentType", "revokedCount", "active"}.issubset(
    consent_revocation["properties"],
  )

  create_job = success_data_schema(schema, "/api/analysis/jobs", "post")
  job_detail = resolve_component_schema(schema, create_job["properties"]["job"])
  assert "faceProfile" in job_detail["properties"]
  assert "faceProfileSummary" in job_detail["properties"]
  fetched_job = success_data_schema(
    schema,
    "/api/analysis/jobs/{job_id}",
    "get",
  )
  fetched_job_detail = resolve_component_schema(
    schema,
    fetched_job["properties"]["job"],
  )
  assert "faceProfile" in fetched_job_detail["properties"]

  report_list = success_data_schema(schema, "/api/analysis/reports", "get")
  report_summary = resolve_component_schema(
    schema,
    report_list["properties"]["reports"]["items"],
  )
  assert "faceProfileSummary" in report_summary["properties"]
  assert "faceProfile" not in report_summary["properties"]

  report_detail_data = success_data_schema(
    schema,
    "/api/analysis/reports/{report_id}",
    "get",
  )
  report_detail = resolve_component_schema(
    schema,
    report_detail_data["properties"]["report"],
  )
  assert "faceProfile" in report_detail["properties"]


def test_build_openapi_schema_contains_core_backend_paths() -> None:
  schema = build_openapi_schema(Settings())

  assert schema["info"]["title"] == "AI AR Makeup Backend"
  assert "/health" in schema["paths"]
  assert "/api/health/config" in schema["paths"]
  assert "/api/media/presigned-upload" in schema["paths"]
  assert "/api/analysis/jobs" in schema["paths"]


def test_build_openapi_schema_contains_strict_face_profile_contract() -> None:
  assert_face_profile_openapi_contract(build_openapi_schema(Settings()))


def test_committed_openapi_contains_current_face_profile_contract() -> None:
  artifact = json.loads(
    (REPOSITORY_ROOT / "docs/backend/openapi.json").read_text(encoding="utf-8"),
  )
  current_schema = build_openapi_schema(Settings())

  assert artifact == current_schema
  assert_face_profile_openapi_contract(artifact)


def test_write_openapi_schema_outputs_json_file(tmp_path) -> None:
  output = tmp_path / "openapi.json"

  result = write_openapi_schema(output, {"openapi": "3.1.0", "info": {"title": "test"}})

  assert result == output
  assert json.loads(output.read_text(encoding="utf-8"))["info"]["title"] == "test"
