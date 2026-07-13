from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any

import httpx

from app.core.settings import Settings
from app.db.session import Database


logger = logging.getLogger(__name__)
FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
FCM_TIMEOUT_SECONDS = 8.0

_credentials: Any | None = None
_credentials_fingerprint: str | None = None
_credentials_lock = asyncio.Lock()
_scheduled_tasks: set[asyncio.Task[None]] = set()


async def ensure_push_notification_schema(db: Database) -> None:
  if not db.is_connected:
    return

  await db.execute(
    """
    create table if not exists user_notification_preferences (
      user_id uuid primary key references users(id) on delete cascade,
      push_enabled boolean not null default false,
      consulting_messages boolean not null default true,
      booking_updates boolean not null default true,
      incoming_calls boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists user_push_devices (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      provider text not null default 'fcm',
      platform text not null,
      token text not null unique,
      app_bundle_id text,
      enabled boolean not null default true,
      last_seen_at timestamptz not null default now(),
      revoked_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_user_push_devices_provider check (provider in ('fcm')),
      constraint chk_user_push_devices_platform check (platform in ('ios', 'android'))
    );

    create index if not exists idx_user_push_devices_active_user
      on user_push_devices (user_id, updated_at desc)
      where enabled = true;
    """,
  )


async def get_notification_settings(db: Database, user_id: str) -> dict[str, bool]:
  row = await db.fetchrow(
    """
    insert into user_notification_preferences (user_id)
    values ($1::uuid)
    on conflict (user_id) do update set user_id = excluded.user_id
    returning push_enabled, consulting_messages, booking_updates, incoming_calls
    """,
    user_id,
  )
  return row or {
    "push_enabled": False,
    "consulting_messages": True,
    "booking_updates": True,
    "incoming_calls": True,
  }


async def update_notification_settings(
  db: Database,
  user_id: str,
  *,
  push_enabled: bool,
) -> dict[str, bool]:
  row = await db.fetchrow(
    """
    insert into user_notification_preferences (user_id, push_enabled)
    values ($1::uuid, $2)
    on conflict (user_id) do update
    set push_enabled = excluded.push_enabled,
        updated_at = now()
    returning push_enabled, consulting_messages, booking_updates, incoming_calls
    """,
    user_id,
    push_enabled,
  )
  return row or {"push_enabled": push_enabled}


async def register_push_device(
  db: Database,
  user_id: str,
  *,
  provider: str,
  platform: str,
  token: str,
  app_bundle_id: str | None,
) -> None:
  await db.execute(
    """
    insert into user_push_devices (
      user_id, provider, platform, token, app_bundle_id, enabled, last_seen_at
    )
    values ($1::uuid, $2, $3, $4, $5, true, now())
    on conflict (token) do update
    set user_id = excluded.user_id,
        provider = excluded.provider,
        platform = excluded.platform,
        app_bundle_id = excluded.app_bundle_id,
        enabled = true,
        revoked_at = null,
        last_seen_at = now(),
        updated_at = now()
    """,
    user_id,
    provider,
    platform,
    token,
    app_bundle_id,
  )


async def disable_push_device(db: Database, user_id: str, token: str) -> bool:
  status = await db.execute(
    """
    update user_push_devices
    set enabled = false, revoked_at = now(), updated_at = now()
    where user_id = $1::uuid and token = $2 and enabled = true
    """,
    user_id,
    token,
  )
  return status.endswith(" 1")


def _credential_source(settings: Settings) -> tuple[dict[str, Any], str] | None:
  raw_credentials = (settings.firebase_service_account_json or "").strip()
  if not settings.firebase_push_configured or not raw_credentials:
    return None

  try:
    info = json.loads(raw_credentials)
  except json.JSONDecodeError:
    logger.error("Firebase service account JSON is invalid.")
    return None

  if not isinstance(info, dict):
    logger.error("Firebase service account JSON must be an object.")
    return None

  fingerprint = hashlib.sha256(raw_credentials.encode("utf-8")).hexdigest()
  return info, fingerprint


async def _get_access_token(settings: Settings) -> str | None:
  global _credentials, _credentials_fingerprint

  source = _credential_source(settings)
  if source is None:
    return None
  info, fingerprint = source

  async with _credentials_lock:
    try:
      from google.auth.transport.requests import Request as GoogleAuthRequest
      from google.oauth2 import service_account
    except ImportError:
      logger.exception("google-auth is required for Firebase push delivery.")
      return None

    if _credentials is None or _credentials_fingerprint != fingerprint:
      _credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=[FCM_SCOPE],
      )
      _credentials_fingerprint = fingerprint

    if not _credentials.valid or _credentials.expired:
      await asyncio.to_thread(_credentials.refresh, GoogleAuthRequest())

    return str(_credentials.token) if _credentials.token else None


def _fcm_error_code(response: httpx.Response) -> str | None:
  try:
    payload = response.json()
  except ValueError:
    return None

  error = payload.get("error") if isinstance(payload, dict) else None
  if not isinstance(error, dict):
    return None

  for detail in error.get("details") or []:
    if isinstance(detail, dict) and detail.get("errorCode"):
      return str(detail["errorCode"])

  status = error.get("status")
  return str(status) if status else None


async def _disable_invalid_token(db: Database, token: str) -> None:
  await db.execute(
    """
    update user_push_devices
    set enabled = false, revoked_at = now(), updated_at = now()
    where token = $1
    """,
    token,
  )


async def _send_to_token(
  client: httpx.AsyncClient,
  db: Database,
  settings: Settings,
  *,
  access_token: str,
  token: str,
  title: str,
  body: str,
  data: dict[str, str],
  collapse_key: str,
) -> None:
  response = await client.post(
    f"https://fcm.googleapis.com/v1/projects/{settings.firebase_project_id}/messages:send",
    headers={"Authorization": f"Bearer {access_token}"},
    json={
      "message": {
        "token": token,
        "notification": {"title": title, "body": body},
        "data": data,
        "android": {
          "collapse_key": collapse_key,
          "priority": "high",
          "notification": {"channel_id": "consulting"},
        },
        "apns": {
          "headers": {
            "apns-collapse-id": collapse_key[:64],
            "apns-priority": "10",
          },
          "payload": {
            "aps": {
              "sound": "default",
              "thread-id": "consulting",
            }
          },
        },
      }
    },
  )

  if response.is_success:
    return

  error_code = _fcm_error_code(response)
  token_fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
  logger.warning(
    "FCM delivery failed status=%s code=%s token=%s",
    response.status_code,
    error_code,
    token_fingerprint,
  )
  if error_code in {"UNREGISTERED", "NOT_FOUND"}:
    await _disable_invalid_token(db, token)


async def send_consulting_push(
  db: Database,
  settings: Settings,
  *,
  booking_id: str,
  event_type: str,
  title: str,
  body: str,
) -> None:
  if not settings.firebase_push_configured or not getattr(db, "is_connected", False):
    return

  try:
    rows = await db.fetch(
      """
      select d.token, b.expert_id, coalesce(b.duration_code, 'd30') as duration_id
      from consulting_bookings b
      join user_notification_preferences p
        on p.user_id = b.user_id and p.push_enabled = true
      join user_push_devices d
        on d.user_id = b.user_id and d.enabled = true and d.provider = 'fcm'
      where b.id = $1::uuid
        and case
          when $2 = 'consulting_message' then p.consulting_messages
          when $2 = 'consulting_call' then p.incoming_calls
          else p.booking_updates
        end
      """,
      booking_id,
      event_type,
    )
    if not rows:
      return

    access_token = await _get_access_token(settings)
    if not access_token:
      return

    async with httpx.AsyncClient(timeout=FCM_TIMEOUT_SECONDS) as client:
      await asyncio.gather(*(
        _send_to_token(
          client,
          db,
          settings,
          access_token=access_token,
          token=str(row["token"]),
          title=title,
          body=body,
          data={
            "bookingId": booking_id,
            "durationId": str(row["duration_id"]),
            "expertId": str(row["expert_id"]),
            "type": event_type,
          },
          collapse_key=f"{event_type}:{booking_id}",
        )
        for row in rows
      ))
  except Exception:
    logger.exception("Consulting push delivery failed for booking %s.", booking_id)


def schedule_consulting_push(
  db: Database,
  settings: Settings,
  *,
  booking_id: str,
  event_type: str,
  title: str,
  body: str,
) -> None:
  if not settings.firebase_push_configured or not getattr(db, "is_connected", False):
    return

  task = asyncio.create_task(
    send_consulting_push(
      db,
      settings,
      booking_id=booking_id,
      event_type=event_type,
      title=title,
      body=body,
    )
  )
  _scheduled_tasks.add(task)
  task.add_done_callback(_scheduled_tasks.discard)
