import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.errors import AppError
from app.core.responses import success
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.schemas.users import FaceAnalysisConsentAcceptance
from app.services.user_consents import (
  AI_PROCESSING_CONSENT_VERSION,
  FACE_PROFILE_CONSENT_VERSION,
  THIRD_PARTY_AI_CONSENT_VERSION,
  accept_user_consent,
  get_user_consent_status,
  require_active_consent,
  required_consent_types,
  revoke_user_consent,
)


NOW = datetime(2026, 7, 12, 2, 0, tzinfo=timezone.utc)


def safe_payload(version: str = FACE_PROFILE_CONSENT_VERSION) -> FaceAnalysisConsentAcceptance:
  return FaceAnalysisConsentAcceptance.model_validate({
    "version": version,
    "accepted": True,
    "metadata": {
      "surface": "face_analysis",
      "rawSensorArtifactsStored": False,
      "trainingUseAllowed": False,
    },
  })


@pytest.mark.parametrize(
  ("field", "value"),
  (("rawSensorArtifactsStored", True), ("trainingUseAllowed", True)),
)
def test_consent_payload_rejects_unsafe_sensor_or_training_flags(field: str, value: bool) -> None:
  body = {
    "version": FACE_PROFILE_CONSENT_VERSION,
    "accepted": True,
    "metadata": {
      "surface": "face_analysis",
      "rawSensorArtifactsStored": False,
      "trainingUseAllowed": False,
    },
  }
  body["metadata"][field] = value

  with pytest.raises(ValidationError):
    FaceAnalysisConsentAcceptance.model_validate(body)


def test_consent_payload_requires_positive_acceptance_and_exact_metadata_surface() -> None:
  with pytest.raises(ValidationError):
    FaceAnalysisConsentAcceptance.model_validate({
      "version": FACE_PROFILE_CONSENT_VERSION,
      "accepted": False,
      "metadata": {
        "surface": "other",
        "rawSensorArtifactsStored": False,
        "trainingUseAllowed": False,
      },
    })


def test_required_consents_are_provider_driven_without_exposing_provider_names() -> None:
  internal = Settings(ai_provider="local", image_generation_provider="local", openai_enabled=False)
  external = Settings(ai_provider="bedrock", image_generation_provider="openai")

  assert required_consent_types(internal) == ("camera_analysis", "ai_processing")
  assert required_consent_types(external) == (
    "camera_analysis",
    "ai_processing",
    "third_party_ai",
  )


class FakeTransaction:
  def __init__(self, connection) -> None:
    self.connection = connection

  async def __aenter__(self):
    self.connection.events.append("transaction:enter")
    return self

  async def __aexit__(self, exc_type, _exc, _tb):
    self.connection.events.append("transaction:rollback" if exc_type else "transaction:commit")
    return False


class FakeConsentConnection:
  def __init__(self, rows: list[dict] | None = None) -> None:
    self.rows = list(rows or [])
    self.events: list[str] = []
    self.insert_count = 0
    self.queries: list[tuple[str, tuple[object, ...]]] = []

  def transaction(self) -> FakeTransaction:
    return FakeTransaction(self)

  async def fetchrow(self, query: str, *args):
    compact = " ".join(query.split())
    self.queries.append((compact, args))
    if "from users" in compact and "for update" in compact:
      self.events.append("user:lock")
      return {"id": args[0]}
    if "from user_consents" in compact and "for share" in compact:
      self.events.append("consent:share")
      matches = [
        row for row in self.rows
        if row["user_id"] == args[0]
        and row["consent_type"] == args[1]
        and row["version"] == args[2]
        and row["accepted"]
        and row["accepted_at"] is not None
        and row["revoked_at"] is None
      ]
      return matches[-1] if matches else None
    if "from user_consents" in compact:
      self.events.append("consent:lookup")
      matches = [
        row for row in self.rows
        if row["user_id"] == args[0]
        and row["consent_type"] == args[1]
        and row["version"] == args[2]
        and row["accepted"]
        and row["accepted_at"] is not None
        and row["revoked_at"] is None
      ]
      return matches[-1] if matches else None
    if "insert into user_consents" in compact:
      self.events.append("consent:insert")
      self.insert_count += 1
      row = {
        "id": f"consent-{len(self.rows) + 1}",
        "user_id": args[0],
        "consent_type": args[1],
        "version": args[2],
        "accepted": True,
        "accepted_at": NOW,
        "revoked_at": None,
        "metadata": json.loads(args[3]),
      }
      self.rows.append(row)
      return row
    raise AssertionError(f"Unexpected fetchrow query: {compact}")

  async def fetch(self, query: str, *args):
    compact = " ".join(query.split())
    self.queries.append((compact, args))
    if compact.startswith("update user_consents"):
      changed = []
      for row in self.rows:
        if (
          row["user_id"] == args[0]
          and row["consent_type"] == args[1]
          and row["accepted_at"] is not None
          and row["revoked_at"] is None
        ):
          row["revoked_at"] = NOW
          changed.append(dict(row))
      return changed
    raise AssertionError(f"Unexpected fetch query: {compact}")


class FakePool:
  def __init__(self, connection: FakeConsentConnection) -> None:
    self.connection = connection

  @asynccontextmanager
  async def acquire(self):
    yield self.connection


class FakeDb:
  def __init__(self, connection: FakeConsentConnection) -> None:
    self.connection = connection
    self.pool = FakePool(connection)

  async def fetch(self, query: str, *args):
    compact = " ".join(query.split())
    self.connection.queries.append((compact, args))
    assert "where user_id = $1" in compact
    return [dict(row) for row in self.connection.rows if row["user_id"] == args[0]]


def consent_row(
  *,
  user_id: str = "user-1",
  consent_type: str = "camera_analysis",
  version: str = FACE_PROFILE_CONSENT_VERSION,
  revoked_at=None,
) -> dict:
  return {
    "id": f"{user_id}-{consent_type}-{version}",
    "user_id": user_id,
    "consent_type": consent_type,
    "version": version,
    "accepted": True,
    "accepted_at": NOW,
    "revoked_at": revoked_at,
    "metadata": {
      "surface": "face_analysis",
      "rawSensorArtifactsStored": False,
      "trainingUseAllowed": False,
    },
  }


@pytest.mark.asyncio
async def test_accept_is_idempotent_and_locks_user_before_active_lookup() -> None:
  existing = consent_row()
  connection = FakeConsentConnection([existing])

  result = await accept_user_consent(
    FakeDb(connection),
    user_id="user-1",
    consent_type="camera_analysis",
    payload=safe_payload(),
  )

  assert result["id"] == existing["id"]
  assert connection.insert_count == 0
  assert connection.events == [
    "transaction:enter",
    "user:lock",
    "consent:lookup",
    "transaction:commit",
  ]


@pytest.mark.asyncio
async def test_accept_after_revoke_inserts_a_new_history_row() -> None:
  connection = FakeConsentConnection([consent_row(revoked_at=NOW)])

  result = await accept_user_consent(
    FakeDb(connection),
    user_id="user-1",
    consent_type="camera_analysis",
    payload=safe_payload(),
  )

  assert result["active"] is True
  assert connection.insert_count == 1
  assert len(connection.rows) == 2


@pytest.mark.asyncio
async def test_accept_rejects_stale_or_cross_type_version() -> None:
  connection = FakeConsentConnection()

  with pytest.raises(AppError) as exc_info:
    await accept_user_consent(
      FakeDb(connection),
      user_id="user-1",
      consent_type="camera_analysis",
      payload=safe_payload(AI_PROCESSING_CONSENT_VERSION),
    )

  assert exc_info.value.status_code == 422
  assert exc_info.value.code == "CONSENT_VERSION_INVALID"
  assert connection.events == []


@pytest.mark.asyncio
async def test_revoke_marks_every_active_version_for_only_that_user_and_type() -> None:
  rows = [
    consent_row(version="old-version"),
    consent_row(),
    consent_row(consent_type="ai_processing", version=AI_PROCESSING_CONSENT_VERSION),
    consent_row(user_id="user-2"),
  ]
  connection = FakeConsentConnection(rows)

  result = await revoke_user_consent(
    FakeDb(connection),
    user_id="user-1",
    consent_type="camera_analysis",
  )

  assert result["revoked_count"] == 2
  assert rows[2]["revoked_at"] is None
  assert rows[3]["revoked_at"] is None
  assert connection.events[:2] == ["transaction:enter", "user:lock"]


@pytest.mark.asyncio
async def test_status_scopes_rows_to_user_and_stale_version_is_not_active() -> None:
  rows = [
    consent_row(version="old-version"),
    consent_row(user_id="user-2"),
    consent_row(
      consent_type="ai_processing",
      version=AI_PROCESSING_CONSENT_VERSION,
    ),
  ]
  connection = FakeConsentConnection(rows)

  result = await get_user_consent_status(
    FakeDb(connection),
    user_id="user-1",
    settings=Settings(ai_provider="local", image_generation_provider="local"),
  )

  assert result["required_consent_types"] == ["camera_analysis", "ai_processing"]
  assert result["consent_versions"] == {
    "camera_analysis": FACE_PROFILE_CONSENT_VERSION,
    "ai_processing": AI_PROCESSING_CONSENT_VERSION,
  }
  assert result["all_required_active"] is False
  by_type = {item["consent_type"]: item for item in result["consents"]}
  assert by_type["camera_analysis"]["active"] is False
  assert by_type["ai_processing"]["active"] is True
  assert all(item["id"] != rows[1]["id"] for item in result["consents"])


@pytest.mark.asyncio
async def test_external_status_requires_third_party_without_naming_provider() -> None:
  rows = [
    consent_row(),
    consent_row(consent_type="ai_processing", version=AI_PROCESSING_CONSENT_VERSION),
    consent_row(consent_type="third_party_ai", version=THIRD_PARTY_AI_CONSENT_VERSION),
  ]

  result = await get_user_consent_status(
    FakeDb(FakeConsentConnection(rows)),
    user_id="user-1",
    settings=Settings(ai_provider="bedrock", image_generation_provider="openai"),
  )

  assert result["all_required_active"] is True
  assert result["required_consent_types"][-1] == "third_party_ai"
  assert "provider" not in json.dumps(result, default=str).lower()


@pytest.mark.asyncio
async def test_status_wire_envelope_camelizes_version_map_keys() -> None:
  rows = [
    consent_row(),
    consent_row(consent_type="ai_processing", version=AI_PROCESSING_CONSENT_VERSION),
    consent_row(consent_type="third_party_ai", version=THIRD_PARTY_AI_CONSENT_VERSION),
  ]
  status = await get_user_consent_status(
    FakeDb(FakeConsentConnection(rows)),
    user_id="user-1",
    settings=Settings(ai_provider="bedrock", image_generation_provider="openai"),
  )

  wire = success(status)["data"]

  assert wire["requiredConsentTypes"] == [
    "camera_analysis",
    "ai_processing",
    "third_party_ai",
  ]
  assert wire["consentVersions"] == {
    "cameraAnalysis": FACE_PROFILE_CONSENT_VERSION,
    "aiProcessing": AI_PROCESSING_CONSENT_VERSION,
    "thirdPartyAi": THIRD_PARTY_AI_CONSENT_VERSION,
  }


@pytest.mark.asyncio
async def test_require_active_consent_uses_exact_version_and_share_lock() -> None:
  connection = FakeConsentConnection([consent_row(version="old-version")])

  with pytest.raises(AppError) as exc_info:
    await require_active_consent(
      connection,
      "user-1",
      "camera_analysis",
      FACE_PROFILE_CONSENT_VERSION,
    )

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "FACE_PROFILE_CONSENT_REQUIRED"
  query, args = connection.queries[-1]
  assert "for share" in query
  assert args == ("user-1", "camera_analysis", FACE_PROFILE_CONSENT_VERSION)


def test_consent_api_rejects_unsafe_metadata_and_unknown_type_before_db_write() -> None:
  app = create_app(Settings())
  app.dependency_overrides[require_database] = lambda: object()
  client = TestClient(app)
  body = {
    "version": FACE_PROFILE_CONSENT_VERSION,
    "accepted": True,
    "metadata": {
      "surface": "face_analysis",
      "rawSensorArtifactsStored": False,
      "trainingUseAllowed": True,
    },
  }

  unsafe = client.put("/api/users/me/consents/camera_analysis", json=body)
  unknown = client.delete("/api/users/me/consents/marketing")

  assert unsafe.status_code == 422
  assert unsafe.json()["error"]["code"] == "VALIDATION_ERROR"
  assert unknown.status_code == 422
  assert unknown.json()["error"]["code"] == "VALIDATION_ERROR"
