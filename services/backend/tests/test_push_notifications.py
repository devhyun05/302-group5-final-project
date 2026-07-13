import pytest

from app.core.settings import Settings
from app.schemas.users import PushDeviceRegister
from app.services.push_notifications import (
  disable_push_device,
  ensure_push_notification_schema,
  get_notification_settings,
  register_push_device,
  schedule_consulting_push,
  update_notification_settings,
)


class FakeDatabase:
  def __init__(self, *, connected: bool = True) -> None:
    self.is_connected = connected
    self.executions: list[tuple[str, tuple[object, ...]]] = []
    self.rows: list[dict] = []

  async def execute(self, query: str, *args: object) -> str:
    self.executions.append((query, args))
    return "UPDATE 1"

  async def fetchrow(self, query: str, *args: object) -> dict | None:
    self.executions.append((query, args))
    return self.rows.pop(0) if self.rows else None


@pytest.mark.asyncio
async def test_push_schema_is_idempotent_and_skips_disconnected_db() -> None:
  disconnected = FakeDatabase(connected=False)
  await ensure_push_notification_schema(disconnected)  # type: ignore[arg-type]
  assert disconnected.executions == []

  connected = FakeDatabase()
  await ensure_push_notification_schema(connected)  # type: ignore[arg-type]
  assert "create table if not exists user_push_devices" in connected.executions[0][0]


@pytest.mark.asyncio
async def test_notification_preferences_default_and_update() -> None:
  db = FakeDatabase()
  values = await get_notification_settings(db, "00000000-0000-0000-0000-000000000001")  # type: ignore[arg-type]
  assert values["push_enabled"] is False

  db.rows.append({"push_enabled": True, "consulting_messages": True})
  updated = await update_notification_settings(
    db,  # type: ignore[arg-type]
    "00000000-0000-0000-0000-000000000001",
    push_enabled=True,
  )
  assert updated["push_enabled"] is True


@pytest.mark.asyncio
async def test_device_registration_reassigns_token_and_disable_is_scoped_to_user() -> None:
  db = FakeDatabase()
  await register_push_device(
    db,  # type: ignore[arg-type]
    "00000000-0000-0000-0000-000000000001",
    provider="fcm",
    platform="ios",
    token="fcm-token-with-enough-characters",
    app_bundle_id="com.example.app",
  )
  assert "on conflict (token) do update" in db.executions[0][0]

  disabled = await disable_push_device(
    db,  # type: ignore[arg-type]
    "00000000-0000-0000-0000-000000000001",
    "fcm-token-with-enough-characters",
  )
  assert disabled is True
  assert "where user_id = $1::uuid and token = $2" in db.executions[1][0]


def test_push_device_schema_rejects_short_tokens() -> None:
  with pytest.raises(ValueError):
    PushDeviceRegister(platform="ios", token="short")


def test_push_delivery_stays_disabled_without_server_credentials() -> None:
  db = FakeDatabase()
  schedule_consulting_push(
    db,  # type: ignore[arg-type]
    Settings(firebase_push_enabled=False),
    booking_id="00000000-0000-0000-0000-000000000001",
    event_type="consulting_message",
    title="AURA 상담",
    body="새 메시지가 도착했어요.",
  )
  assert db.executions == []
