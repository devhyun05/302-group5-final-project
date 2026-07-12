import json
from collections.abc import Mapping
from typing import Any

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.schemas.users import ConsentType, FaceAnalysisConsentAcceptance


FACE_PROFILE_CONSENT_VERSION = "face-profile-2026-07-12"
AI_PROCESSING_CONSENT_VERSION = "face-ai-report-2026-07-12"
THIRD_PARTY_AI_CONSENT_VERSION = "face-third-party-ai-2026-07-12"

CONSENT_VERSIONS: dict[ConsentType, str] = {
  "camera_analysis": FACE_PROFILE_CONSENT_VERSION,
  "ai_processing": AI_PROCESSING_CONSENT_VERSION,
  "third_party_ai": THIRD_PARTY_AI_CONSENT_VERSION,
}
EXTERNAL_AI_PROVIDERS = frozenset({"bedrock", "openai"})


def requires_third_party_ai(settings: Settings) -> bool:
  return bool({
    settings.analysis_provider,
    settings.image_generation_provider_normalized,
  } & EXTERNAL_AI_PROVIDERS)


def required_consent_types(settings: Settings) -> tuple[ConsentType, ...]:
  required: tuple[ConsentType, ...] = ("camera_analysis", "ai_processing")

  if requires_third_party_ai(settings):
    return (*required, "third_party_ai")

  return required


def _consent_type_version(consent_type: ConsentType) -> str:
  try:
    return CONSENT_VERSIONS[consent_type]
  except KeyError as exc:
    raise AppError(
      422,
      "CONSENT_TYPE_INVALID",
      "This consent type is not supported for face analysis.",
    ) from exc


def _row_dict(row: Mapping[str, Any] | None) -> dict[str, Any] | None:
  return dict(row) if row is not None else None


def _metadata_dict(value: Any) -> dict[str, Any]:
  if isinstance(value, Mapping):
    return dict(value)

  if isinstance(value, str):
    decoded = json.loads(value)
    return dict(decoded) if isinstance(decoded, Mapping) else {}

  return {}


def _serialize_consent(
  row: Mapping[str, Any] | None,
  *,
  consent_type: ConsentType,
  version: str,
) -> dict[str, Any]:
  data = _row_dict(row)
  active = bool(
    data
    and data.get("accepted") is True
    and data.get("accepted_at") is not None
    and data.get("revoked_at") is None
    and data.get("version") == version
  )

  return {
    "id": data.get("id") if active and data else None,
    "consent_type": consent_type,
    "version": version,
    "active": active,
    "accepted_at": data.get("accepted_at") if active and data else None,
    "revoked_at": data.get("revoked_at") if data else None,
    "metadata": _metadata_dict(data.get("metadata")) if active and data else None,
  }


def _require_pool(db: Database):
  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  return db.pool


async def _lock_user(connection, user_id: object) -> None:
  user = await connection.fetchrow(
    """
    select id
    from users
    where id = $1
      and deleted_at is null
    for update
    """,
    user_id,
  )

  if user is None:
    raise AppError(404, "USER_NOT_FOUND", "User account was not found.")


async def get_user_consent_status(
  db: Database,
  *,
  user_id: object,
  settings: Settings,
) -> dict[str, Any]:
  required = required_consent_types(settings)
  rows = await db.fetch(
    """
    select id, user_id, consent_type, version, accepted, accepted_at, revoked_at, metadata
    from user_consents
    where user_id = $1
      and consent_type = any($2::consent_type[])
    order by accepted_at desc nulls last, id desc
    """,
    user_id,
    list(required),
  )

  active_by_type: dict[str, Mapping[str, Any]] = {}
  for row in rows:
    consent_type = row.get("consent_type")
    expected_version = CONSENT_VERSIONS.get(consent_type)
    if (
      consent_type in required
      and expected_version is not None
      and row.get("version") == expected_version
      and row.get("accepted") is True
      and row.get("accepted_at") is not None
      and row.get("revoked_at") is None
      and consent_type not in active_by_type
    ):
      active_by_type[consent_type] = row

  consents = [
    _serialize_consent(
      active_by_type.get(consent_type),
      consent_type=consent_type,
      version=CONSENT_VERSIONS[consent_type],
    )
    for consent_type in required
  ]

  return {
    "required_consent_types": list(required),
    "consent_versions": {
      consent_type: CONSENT_VERSIONS[consent_type]
      for consent_type in required
    },
    "consents": consents,
    "all_required_active": all(consent["active"] for consent in consents),
  }


async def accept_user_consent(
  db: Database,
  *,
  user_id: object,
  consent_type: ConsentType,
  payload: FaceAnalysisConsentAcceptance,
) -> dict[str, Any]:
  expected_version = _consent_type_version(consent_type)
  if payload.version != expected_version:
    raise AppError(
      422,
      "CONSENT_VERSION_INVALID",
      "The requested consent version is not current.",
      {"consent_type": consent_type, "required_version": expected_version},
    )

  pool = _require_pool(db)
  async with pool.acquire() as connection:
    async with connection.transaction():
      await _lock_user(connection, user_id)
      existing = await connection.fetchrow(
        """
        select id, user_id, consent_type, version, accepted, accepted_at, revoked_at, metadata
        from user_consents
        where user_id = $1
          and consent_type = $2::consent_type
          and version = $3
          and accepted = true
          and accepted_at is not null
          and revoked_at is null
        order by accepted_at desc, id desc
        limit 1
        """,
        user_id,
        consent_type,
        expected_version,
      )
      if existing is None:
        metadata_json = json.dumps(
          payload.metadata.model_dump(by_alias=True),
          ensure_ascii=False,
          separators=(",", ":"),
        )
        existing = await connection.fetchrow(
          """
          insert into user_consents (
            user_id,
            consent_type,
            version,
            accepted,
            accepted_at,
            revoked_at,
            metadata
          )
          values ($1, $2::consent_type, $3, true, now(), null, $4::jsonb)
          returning id, user_id, consent_type, version, accepted, accepted_at, revoked_at, metadata
          """,
          user_id,
          consent_type,
          expected_version,
          metadata_json,
        )

  return _serialize_consent(
    existing,
    consent_type=consent_type,
    version=expected_version,
  )


async def revoke_user_consent(
  db: Database,
  *,
  user_id: object,
  consent_type: ConsentType,
) -> dict[str, Any]:
  _consent_type_version(consent_type)
  pool = _require_pool(db)

  async with pool.acquire() as connection:
    async with connection.transaction():
      await _lock_user(connection, user_id)
      revoked = await connection.fetch(
        """
        update user_consents
        set revoked_at = now()
        where user_id = $1
          and consent_type = $2::consent_type
          and accepted = true
          and accepted_at is not null
          and revoked_at is null
        returning id
        """,
        user_id,
        consent_type,
      )

  return {
    "consent_type": consent_type,
    "revoked_count": len(revoked),
    "active": False,
  }


async def require_active_consent(
  connection,
  user_id: object,
  consent_type: ConsentType,
  version: str,
) -> dict[str, Any]:
  row = await connection.fetchrow(
    """
    select id, user_id, consent_type, version, accepted, accepted_at, revoked_at, metadata
    from user_consents
    where user_id = $1
      and consent_type = $2::consent_type
      and version = $3
      and accepted = true
      and accepted_at is not null
      and revoked_at is null
    order by accepted_at desc, id desc
    limit 1
    for share
    """,
    user_id,
    consent_type,
    version,
  )
  if row is None:
    raise AppError(
      403,
      "FACE_PROFILE_CONSENT_REQUIRED",
      "Current consent is required before face analysis can continue.",
      {"consent_type": consent_type, "required_version": version},
    )

  return dict(row)
