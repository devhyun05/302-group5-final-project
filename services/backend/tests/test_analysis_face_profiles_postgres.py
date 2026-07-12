import asyncio
import json
import os
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest

from app.core.settings import Settings
from app.db.init_db import POST_SCHEMA_MIGRATIONS
from app.db.session import Database
from app.schemas.users import FaceAnalysisConsentAcceptance
from app.services.user_consents import (
  AI_PROCESSING_CONSENT_VERSION,
  FACE_PROFILE_CONSENT_VERSION,
  THIRD_PARTY_AI_CONSENT_VERSION,
  accept_user_consent,
)


TEST_DATABASE_URL = os.getenv("AURA_TEST_DATABASE_URL")
SCHEMA_SQL = (
  Path(__file__).resolve().parents[3] / "docs" / "backend" / "schema.sql"
).read_text(encoding="utf-8")


async def _prepare_public_extensions(connection: asyncpg.Connection) -> None:
  await connection.execute(
    """
    create extension if not exists pgcrypto with schema public;
    create extension if not exists citext with schema public;
    create extension if not exists btree_gist with schema public;
    create extension if not exists vector with schema public;
    create extension if not exists pg_trgm with schema public;
    """,
  )


async def _apply_legacy_schema(connection: asyncpg.Connection) -> None:
  await connection.execute(
    """
    create type consent_type as enum (
      'privacy_policy', 'camera_analysis', 'ai_processing', 'third_party_ai', 'marketing'
    );

    create table users (
      id uuid primary key,
      nickname text not null,
      deleted_at timestamptz
    );
    create table media_assets (
      id uuid primary key,
      owner_user_id uuid references users(id) on delete set null,
      media_kind text not null,
      source text not null
    );
    create table photo_captures (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      media_id uuid not null references media_assets(id) on delete restrict,
      capture_type text not null,
      source text not null,
      status text not null,
      device_payload jsonb not null default '{}'::jsonb
    );
    create table analysis_reports (
      id uuid primary key,
      user_id uuid not null references users(id) on delete cascade,
      photo_capture_id uuid references photo_captures(id) on delete set null,
      status text not null,
      title text not null,
      report_title text not null,
      detail_payload jsonb not null default '{}'::jsonb,
      analyzed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table user_consents (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      consent_type consent_type not null,
      version text not null,
      accepted boolean not null,
      accepted_at timestamptz,
      revoked_at timestamptz,
      metadata jsonb not null default '{}'::jsonb
    );
    """,
  )
  await connection.execute(POST_SCHEMA_MIGRATIONS["schema.sql:analysis-face-profiles-v1"])


async def _insert_graph(
  connection: asyncpg.Connection,
  *,
  user_id: UUID | None = None,
  media_id: UUID | None = None,
  photo_id: UUID | None = None,
  report_id: UUID | None = None,
  consent_id: UUID | None = None,
) -> dict[str, UUID]:
  ids = {
    "user_id": user_id or uuid4(),
    "media_id": media_id or uuid4(),
    "photo_id": photo_id or uuid4(),
    "report_id": report_id or uuid4(),
    "consent_id": consent_id or uuid4(),
    "ai_consent_id": uuid4(),
    "third_party_consent_id": uuid4(),
  }
  await connection.execute(
    "insert into users (id, nickname) values ($1, 'FaceProfile Test')",
    ids["user_id"],
  )
  await connection.execute(
    """
    insert into media_assets (id, owner_user_id, media_kind, source)
    values ($1, $2, 'capture', 'camera')
    """,
    ids["media_id"],
    ids["user_id"],
  )
  await connection.execute(
    """
    insert into photo_captures (
      id, user_id, media_id, capture_type, source, status, device_payload
    ) values ($1, $2, $3, 'face_analysis', 'camera', 'completed', '{}'::jsonb)
    """,
    ids["photo_id"],
    ids["user_id"],
    ids["media_id"],
  )
  await connection.execute(
    """
    insert into analysis_reports (
      id, user_id, photo_capture_id, status, title, report_title, detail_payload
    ) values ($1, $2, $3, 'completed', 'Face', 'Face', '{}'::jsonb)
    """,
    ids["report_id"],
    ids["user_id"],
    ids["photo_id"],
  )
  await connection.execute(
    """
    insert into user_consents (
      id, user_id, consent_type, version, accepted, accepted_at, metadata
    ) values (
      $1, $2, 'camera_analysis', $3, true, now(),
      '{"surface":"face_analysis","rawSensorArtifactsStored":false,"trainingUseAllowed":false}'::jsonb
    )
    """,
    ids["consent_id"],
    ids["user_id"],
    FACE_PROFILE_CONSENT_VERSION,
  )
  await connection.execute(
    """
    insert into user_consents (
      id, user_id, consent_type, version, accepted, accepted_at, metadata
    ) values
      ($1, $4, 'ai_processing', $2, true, now(),
       '{"surface":"face_analysis","rawSensorArtifactsStored":false,"trainingUseAllowed":false}'::jsonb),
      ($3, $4, 'third_party_ai', $5, true, now(),
       '{"surface":"face_analysis","rawSensorArtifactsStored":false,"trainingUseAllowed":false}'::jsonb)
    """,
    ids["ai_consent_id"],
    AI_PROCESSING_CONSENT_VERSION,
    ids["third_party_consent_id"],
    ids["user_id"],
    THIRD_PARTY_AI_CONSENT_VERSION,
  )
  return ids


async def _insert_profile(
  connection: asyncpg.Connection,
  ids: dict[str, UUID],
  *,
  user_id: UUID | None = None,
  photo_id: UUID | None = None,
  payload: object | None = None,
) -> None:
  snapshot = {
    "cameraAnalysis": {
      "consentId": str(ids["consent_id"]),
      "version": FACE_PROFILE_CONSENT_VERSION,
      "acceptedAt": "2026-07-12T02:00:00Z",
    },
    "aiProcessing": {
      "consentId": str(ids["ai_consent_id"]),
      "version": AI_PROCESSING_CONSENT_VERSION,
      "acceptedAt": "2026-07-12T02:00:00Z",
    },
    "thirdPartyAi": {
      "consentId": str(ids["third_party_consent_id"]),
      "version": THIRD_PARTY_AI_CONSENT_VERSION,
      "acceptedAt": "2026-07-12T02:00:00Z",
    },
  }
  await connection.execute(
    """
    insert into analysis_face_profiles (
      report_id, user_id, photo_capture_id, schema_version, status,
      dominant_shape, confidence_gap, profile_payload, camera_consent_id,
      consent_version, consent_accepted_at, consent_snapshot
    ) values (
      $1, $2, $3, 'face-profile-v1', 'full_success',
      'oval', 0.2, $4::jsonb, $5, $6, now(), $7::jsonb
    )
    """,
    ids["report_id"],
    user_id or ids["user_id"],
    photo_id if photo_id is not None else ids["photo_id"],
    json.dumps({"schemaVersion": "face-profile-v1"} if payload is None else payload),
    ids["consent_id"],
    FACE_PROFILE_CONSENT_VERSION,
    json.dumps(snapshot),
  )


def _acceptance() -> FaceAnalysisConsentAcceptance:
  return FaceAnalysisConsentAcceptance.model_validate({
    "version": FACE_PROFILE_CONSENT_VERSION,
    "accepted": True,
    "metadata": {
      "surface": "face_analysis",
      "rawSensorArtifactsStored": False,
      "trainingUseAllowed": False,
    },
  })


@pytest.mark.skipif(not TEST_DATABASE_URL, reason="AURA_TEST_DATABASE_URL is not configured")
@pytest.mark.parametrize("schema_mode", ("fresh", "post_migration"))
@pytest.mark.asyncio
async def test_face_profile_schema_lifecycle_consistency_and_consent_history(schema_mode: str) -> None:
  connection = await asyncpg.connect(TEST_DATABASE_URL)
  schema = f"face_profiles_{schema_mode}_{uuid4().hex}"
  pool = None
  lock_writer = None
  try:
    if schema_mode == "fresh":
      await _prepare_public_extensions(connection)
    await connection.execute(f'create schema "{schema}"')
    await connection.execute(f'set search_path to "{schema}", public')
    if schema_mode == "fresh":
      await connection.execute(SCHEMA_SQL)
    else:
      await _apply_legacy_schema(connection)

    report_graph = await _insert_graph(connection)
    await _insert_profile(connection, report_graph)
    await connection.execute("delete from analysis_reports where id = $1", report_graph["report_id"])
    assert await connection.fetchval(
      "select count(*) from analysis_face_profiles where report_id = $1",
      report_graph["report_id"],
    ) == 0

    soft_delete_graph = await _insert_graph(connection)
    await _insert_profile(connection, soft_delete_graph)
    await connection.execute(
      "alter table analysis_reports add column if not exists deleted_at timestamptz",
    )
    async with connection.transaction():
      locked = await connection.fetchrow(
        "select id from analysis_reports where id = $1 for update",
        soft_delete_graph["report_id"],
      )
      assert locked is not None
      await connection.execute(
        "delete from analysis_face_profiles where report_id = $1 and user_id = $2",
        soft_delete_graph["report_id"],
        soft_delete_graph["user_id"],
      )
      await connection.execute(
        """
        update analysis_reports
        set deleted_at = now(), status = 'cancelled'
        where id = $1 and user_id = $2
        """,
        soft_delete_graph["report_id"],
        soft_delete_graph["user_id"],
      )
    soft_deleted = await connection.fetchrow(
      "select status, deleted_at from analysis_reports where id = $1",
      soft_delete_graph["report_id"],
    )
    assert soft_deleted["status"] == "cancelled"
    assert soft_deleted["deleted_at"] is not None
    assert await connection.fetchval(
      "select count(*) from analysis_face_profiles where report_id = $1",
      soft_delete_graph["report_id"],
    ) == 0

    lock_graph = await _insert_graph(connection)
    lock_writer = await asyncpg.connect(TEST_DATABASE_URL)
    await lock_writer.execute(f'set search_path to "{schema}", public')
    async with connection.transaction():
      await connection.fetchrow(
        """
        select capture.id, media.id
        from photo_captures capture
        join media_assets media on media.id = capture.media_id
        where capture.id = $1 and capture.user_id = $2
        for share of capture, media
        """,
        lock_graph["photo_id"],
        lock_graph["user_id"],
      )
      for update_query, row_id in (
        ("update media_assets set media_kind = media_kind where id = $1", lock_graph["media_id"]),
        ("update photo_captures set status = status where id = $1", lock_graph["photo_id"]),
      ):
        with pytest.raises(asyncpg.exceptions.LockNotAvailableError):
          async with lock_writer.transaction():
            await lock_writer.execute("set local lock_timeout = '100ms'")
            await lock_writer.execute(update_query, row_id)
    await lock_writer.execute(
      "update media_assets set media_kind = media_kind where id = $1",
      lock_graph["media_id"],
    )
    await lock_writer.execute(
      "update photo_captures set status = status where id = $1",
      lock_graph["photo_id"],
    )
    await lock_writer.close()
    lock_writer = None

    user_graph = await _insert_graph(connection)
    await _insert_profile(connection, user_graph)
    await connection.execute("delete from users where id = $1", user_graph["user_id"])
    assert await connection.fetchval(
      "select count(*) from analysis_reports where id = $1",
      user_graph["report_id"],
    ) == 0
    assert await connection.fetchval(
      "select count(*) from analysis_face_profiles where report_id = $1",
      user_graph["report_id"],
    ) == 0

    photo_graph = await _insert_graph(connection)
    await _insert_profile(connection, photo_graph)
    await connection.execute("delete from photo_captures where id = $1", photo_graph["photo_id"])
    photo_links = await connection.fetchrow(
      """
      select report.photo_capture_id as report_photo_id,
             profile.photo_capture_id as profile_photo_id
      from analysis_reports report
      join analysis_face_profiles profile on profile.report_id = report.id
      where report.id = $1
      """,
      photo_graph["report_id"],
    )
    assert dict(photo_links) == {"report_photo_id": None, "profile_photo_id": None}

    consent_graph = await _insert_graph(connection)
    await _insert_profile(connection, consent_graph)
    original_snapshot = await connection.fetchval(
      "select consent_snapshot from analysis_face_profiles where report_id = $1",
      consent_graph["report_id"],
    )
    consent_ids = [
      consent_graph["consent_id"],
      consent_graph["ai_consent_id"],
      consent_graph["third_party_consent_id"],
    ]
    await connection.execute(
      "update user_consents set revoked_at = now() where id = any($1::uuid[])",
      consent_ids,
    )
    assert await connection.fetchval(
      "select consent_snapshot from analysis_face_profiles where report_id = $1",
      consent_graph["report_id"],
    ) == original_snapshot
    await connection.execute(
      "delete from user_consents where id = any($1::uuid[])",
      consent_ids,
    )
    consent_state = await connection.fetchrow(
      """
      select camera_consent_id, consent_snapshot
      from analysis_face_profiles where report_id = $1
      """,
      consent_graph["report_id"],
    )
    assert consent_state["camera_consent_id"] is None
    assert consent_state["consent_snapshot"] == original_snapshot

    mismatch_graph = await _insert_graph(connection)
    other_user = uuid4()
    await connection.execute(
      "insert into users (id, nickname) values ($1, 'Other')",
      other_user,
    )
    with pytest.raises(asyncpg.CheckViolationError):
      await _insert_profile(connection, mismatch_graph, user_id=other_user)

    other_media = uuid4()
    other_photo = uuid4()
    await connection.execute(
      """
      insert into media_assets (id, owner_user_id, media_kind, source)
      values ($1, $2, 'capture', 'camera')
      """,
      other_media,
      mismatch_graph["user_id"],
    )
    await connection.execute(
      """
      insert into photo_captures (
        id, user_id, media_id, capture_type, source, status, device_payload
      ) values ($1, $2, $3, 'face_analysis', 'camera', 'completed', '{}'::jsonb)
      """,
      other_photo,
      mismatch_graph["user_id"],
      other_media,
    )
    with pytest.raises(asyncpg.CheckViolationError):
      await _insert_profile(connection, mismatch_graph, photo_id=other_photo)

    rollback_graph = await _insert_graph(connection)
    await connection.execute(
      "delete from analysis_reports where id = $1",
      rollback_graph["report_id"],
    )
    with pytest.raises(asyncpg.CheckViolationError):
      async with connection.transaction():
        await connection.execute(
          """
          insert into analysis_reports (
            id, user_id, photo_capture_id, status, title, report_title, detail_payload
          ) values ($1, $2, $3, 'completed', 'Atomic', 'Atomic', '{}'::jsonb)
          """,
          rollback_graph["report_id"],
          rollback_graph["user_id"],
          rollback_graph["photo_id"],
        )
        await _insert_profile(connection, rollback_graph, payload=[])
    assert await connection.fetchval(
      "select count(*) from analysis_reports where id = $1",
      rollback_graph["report_id"],
    ) == 0

    concurrent_user = uuid4()
    await connection.execute(
      "insert into users (id, nickname) values ($1, 'Concurrent')",
      concurrent_user,
    )
    pool = await asyncpg.create_pool(
      dsn=TEST_DATABASE_URL,
      min_size=2,
      max_size=2,
      server_settings={"search_path": f'"{schema}", public'},
    )
    db = Database()
    db.pool = pool
    await asyncio.gather(
      accept_user_consent(
        db,
        user_id=concurrent_user,
        consent_type="camera_analysis",
        payload=_acceptance(),
      ),
      accept_user_consent(
        db,
        user_id=concurrent_user,
        consent_type="camera_analysis",
        payload=_acceptance(),
      ),
    )
    assert await connection.fetchval(
      """
      select count(*)
      from user_consents
      where user_id = $1
        and consent_type = 'camera_analysis'
        and version = $2
        and accepted = true
        and accepted_at is not null
        and revoked_at is null
      """,
      concurrent_user,
      FACE_PROFILE_CONSENT_VERSION,
    ) == 1
  finally:
    if lock_writer is not None:
      await lock_writer.close()
    if pool is not None:
      await pool.close()
    await connection.execute("set search_path to public")
    await connection.execute(f'drop schema if exists "{schema}" cascade')
    await connection.close()
