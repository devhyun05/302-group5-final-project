from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import analysis as analysis_api
from app.core import security
from app.core.errors import AppError
from app.core.security import get_current_user, verify_cognito_token
from app.core.settings import Settings
from app.db.session import require_database
from app.main import create_app
from app.schemas.face_profile import FACE_PROFILE_MAX_BYTES, FaceProfileResultModel


@pytest.mark.asyncio
async def test_get_current_user_uses_dev_context_when_auth_is_not_required() -> None:
  auth = await get_current_user(None, Settings(dev_user_sub="dev-sub", dev_user_email="dev@example.com"))

  assert auth.subject == "dev-sub"
  assert auth.provider == "google"
  assert auth.email == "dev@example.com"
  assert auth.claims["token_use"] == "dev"


@pytest.mark.asyncio
async def test_get_current_user_requires_bearer_token_when_auth_is_required() -> None:
  with pytest.raises(AppError) as exc_info:
    await get_current_user(None, Settings(auth_required=True))

  assert exc_info.value.status_code == 401
  assert exc_info.value.code == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_verify_cognito_token_maps_google_id_token_claims(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_get_jwks(_: Settings) -> list[dict]:
    return [{"kid": "key-1"}]

  def fake_header(_: str) -> dict:
    return {"kid": "key-1"}

  def fake_decode(*args, **kwargs) -> dict:
    assert kwargs["issuer"] == "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool"
    assert kwargs["options"] == {"verify_at_hash": False, "verify_aud": False}
    return {
      "aud": "client-id",
      "email": "jun@example.com",
      "identities": '[{"providerName":"Google"}]',
      "name": "Jun",
      "sub": "google-sub",
      "token_use": "id",
    }

  monkeypatch.setattr(security, "_get_jwks", fake_get_jwks)
  monkeypatch.setattr(security.jwt, "get_unverified_header", fake_header)
  monkeypatch.setattr(security.jwt, "decode", fake_decode)

  auth = await verify_cognito_token(
    "jwt-token",
    Settings(
      auth_required=True,
      aws_region="ap-northeast-2",
      cognito_user_pool_id="ap-northeast-2_pool",
      cognito_app_client_id="client-id",
    ),
  )

  assert auth.subject == "google-sub"
  assert auth.provider == "google"
  assert auth.email == "jun@example.com"
  assert auth.name == "Jun"


@pytest.mark.asyncio
async def test_verify_cognito_token_accepts_access_token_client_id(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_get_jwks(_: Settings) -> list[dict]:
    return [{"kid": "key-1"}]

  monkeypatch.setattr(security, "_get_jwks", fake_get_jwks)
  monkeypatch.setattr(security.jwt, "get_unverified_header", lambda _: {"kid": "key-1"})
  monkeypatch.setattr(
    security.jwt,
    "decode",
    lambda *args, **kwargs: {
      "client_id": "client-id",
      "cognito:username": "Google_google-sub",
      "sub": "google-sub",
      "token_use": "access",
    },
  )

  auth = await verify_cognito_token(
    "jwt-token",
    Settings(cognito_user_pool_id="ap-northeast-2_pool", cognito_app_client_id="client-id"),
  )

  assert auth.subject == "google-sub"
  assert auth.provider == "google"


@pytest.mark.asyncio
async def test_verify_cognito_token_rejects_wrong_app_client(monkeypatch: pytest.MonkeyPatch) -> None:
  async def fake_get_jwks(_: Settings) -> list[dict]:
    return [{"kid": "key-1"}]

  monkeypatch.setattr(security, "_get_jwks", fake_get_jwks)
  monkeypatch.setattr(security.jwt, "get_unverified_header", lambda _: {"kid": "key-1"})
  monkeypatch.setattr(
    security.jwt,
    "decode",
    lambda *args, **kwargs: {"aud": "other-client", "sub": "google-sub", "token_use": "id"},
  )

  with pytest.raises(AppError) as exc_info:
    await verify_cognito_token(
      "jwt-token",
      Settings(cognito_user_pool_id="ap-northeast-2_pool", cognito_app_client_id="client-id"),
    )

  assert exc_info.value.status_code == 401
  assert exc_info.value.code == "INVALID_TOKEN"


def test_face_profile_rejects_payload_larger_than_256_kib() -> None:
  with pytest.raises(ValidationError, match="faceProfile exceeds 256 KiB"):
    FaceProfileResultModel.model_validate({
      "padding": "x" * (FACE_PROFILE_MAX_BYTES + 1),
    })


def test_face_profile_rejects_raw_landmarks() -> None:
  with pytest.raises(ValidationError, match="forbidden raw face profile field: rawLandmarks"):
    FaceProfileResultModel.model_validate({"rawLandmarks": []})


def test_face_profile_rejects_non_finite_numbers() -> None:
  with pytest.raises(ValidationError, match="faceProfile must be finite and JSON serializable"):
    FaceProfileResultModel.model_validate({"probe": float("nan")})


class CrossUserReportDatabase:
  def __init__(self) -> None:
    self.query: str | None = None
    self.args: tuple[object, ...] | None = None

  async def fetchrow(self, query: str, *args: object):
    self.query = query
    self.args = args
    return None


def test_analysis_report_detail_is_scoped_to_current_user(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  current_user_id = UUID("c795a365-ef54-4472-919c-30cd4b830d62")
  other_user_report_id = UUID("13f22fa8-1493-4b34-a8eb-39f09184e118")
  db = CrossUserReportDatabase()

  async def fake_ensure_user(_db, _auth):
    return {"id": current_user_id}

  monkeypatch.setattr(analysis_api, "ensure_user", fake_ensure_user)
  app = create_app(Settings())
  app.dependency_overrides[require_database] = lambda: db

  response = TestClient(app).get(f"/api/analysis/reports/{other_user_report_id}")

  assert response.status_code == 404
  assert response.json()["error"]["code"] == "ANALYSIS_REPORT_NOT_FOUND"
  assert db.query is not None
  assert "where r.id = $1 and r.user_id = $2" in db.query
  assert db.args == (other_user_report_id, current_user_id)
