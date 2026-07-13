import pytest
from fastapi.testclient import TestClient

from app.core.settings import Settings
from app.api.consulting_realtime import (
  _authorize_socket,
  _booking_accepts_new_messages,
  _booking_chat_is_visible,
  _handle_client_event,
  _parse_client_datetime,
)
from app.core.security import AuthContext
from app.db.session import database
from app.main import create_app
from app.services.consulting_message_store import (
  create_consulting_message,
  list_consulting_conversation_messages,
  message_row_to_event,
)
from app.services.consulting_realtime import ConsultingRealtimeManager, RealtimeConnection


class FakeWebSocket:
  def __init__(self) -> None:
    self.accepted = False
    self.sent: list[dict] = []

  async def accept(self) -> None:
    self.accepted = True

  async def send_json(self, payload: dict) -> None:
    self.sent.append(payload)


class ToggleFakeWebSocket(FakeWebSocket):
  closed = False

  async def send_json(self, payload: dict) -> None:
    if self.closed:
      raise RuntimeError("socket already closed")
    await super().send_json(payload)


def _drain_connected(socket) -> None:
  assert socket.receive_json()["type"] == "connected"
  assert socket.receive_json()["type"] == "presence"
  history = socket.receive_json()
  assert history["type"] == "message.history"
  assert history["messages"] == []


@pytest.mark.asyncio
async def test_realtime_manager_broadcasts_only_within_booking_room() -> None:
  manager = ConsultingRealtimeManager()
  booking_a_user = FakeWebSocket()
  booking_a_expert = FakeWebSocket()
  booking_b_expert = FakeWebSocket()

  room_a_user = await manager.connect(
    booking_a_user,
    booking_id="booking-a",
    participant_name="고객",
    participant_type="user",
  )
  await manager.connect(
    booking_a_expert,
    booking_id="booking-a",
    participant_name="상담사",
    participant_type="expert",
  )
  await manager.connect(
    booking_b_expert,
    booking_id="booking-b",
    participant_name="다른 상담사",
    participant_type="expert",
  )

  await manager.accept_message_send(
    room_a_user,
    body="안녕하세요",
    client_message_id="client-1",
    media_ids=[],
  )

  assert any(event["type"] == "message.new" and event["body"] == "안녕하세요" for event in booking_a_user.sent)
  assert any(event["type"] == "message.new" and event["body"] == "안녕하세요" for event in booking_a_expert.sent)
  assert not any(event["type"] == "message.new" for event in booking_b_expert.sent)


@pytest.mark.asyncio
async def test_realtime_manager_acknowledges_duplicate_without_rebroadcast() -> None:
  manager = ConsultingRealtimeManager()
  sender_socket = FakeWebSocket()
  receiver_socket = FakeWebSocket()
  sender = await manager.connect(
    sender_socket,
    booking_id="booking-dup",
    participant_name="고객",
    participant_type="user",
  )
  await manager.connect(
    receiver_socket,
    booking_id="booking-dup",
    participant_name="상담사",
    participant_type="expert",
  )

  await manager.accept_message_send(sender, body="한 번만", client_message_id="same-id", media_ids=[])
  await manager.accept_message_send(sender, body="한 번만", client_message_id="same-id", media_ids=[])

  receiver_messages = [event for event in receiver_socket.sent if event["type"] == "message.new"]
  sender_acks = [event for event in sender_socket.sent if event["type"] == "message.ack"]
  assert len(receiver_messages) == 1
  assert len(sender_acks) == 2
  assert sender_acks[0]["messageId"] == sender_acks[1]["messageId"]


@pytest.mark.asyncio
async def test_realtime_manager_removes_closed_connection_during_broadcast() -> None:
  manager = ConsultingRealtimeManager()
  open_socket = FakeWebSocket()
  open_connection = await manager.connect(
    open_socket,
    booking_id="booking-stale",
    participant_name="고객",
    participant_type="user",
  )
  closed_socket = ToggleFakeWebSocket()
  closed_connection = await manager.connect(
    closed_socket,
    booking_id="booking-stale",
    participant_name="상담사",
    participant_type="expert",
  )
  closed_socket.closed = True

  await manager.broadcast("booking-stale", {"type": "typing"})

  assert manager.room_size("booking-stale") == 1
  assert open_connection is not closed_connection


def test_parse_client_datetime_returns_utc_datetime_for_database_binding() -> None:
  parsed = _parse_client_datetime("2026-07-11T03:15:00Z")

  assert parsed is not None
  assert parsed.isoformat() == "2026-07-11T03:15:00+00:00"
  assert _parse_client_datetime("not-a-date") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("row", "expected"),
  [
    ({"status": "requested", "confirmed_at": None, "customer_left_at": None, "expert_left_at": None}, False),
    ({"status": "confirmed", "confirmed_at": "2026-07-13", "customer_left_at": None, "expert_left_at": None}, True),
    ({"status": "completed", "confirmed_at": "2026-07-13", "customer_left_at": None, "expert_left_at": None}, True),
    ({"status": "cancelled", "confirmed_at": "2026-07-13", "customer_left_at": None, "expert_left_at": None}, True),
    ({"status": "cancelled", "confirmed_at": None, "customer_left_at": None, "expert_left_at": None}, False),
    ({"status": "confirmed", "confirmed_at": "2026-07-13", "customer_left_at": "2026-07-13", "expert_left_at": None}, False),
  ],
)
async def test_booking_chat_visibility_matches_confirmation_flow(
  monkeypatch: pytest.MonkeyPatch,
  row: dict,
  expected: bool,
) -> None:
  async def fake_fetchrow(*_args, **_kwargs):
    return row

  monkeypatch.setattr(database, "pool", object())
  monkeypatch.setattr(database, "fetchrow", fake_fetchrow)

  assert await _booking_chat_is_visible("booking-1") is expected


@pytest.mark.asyncio
@pytest.mark.parametrize(
  ("row", "expected"),
  [
    ({"status": "requested", "customer_left_at": None, "expert_left_at": None}, False),
    ({"status": "confirmed", "customer_left_at": None, "expert_left_at": None}, True),
    ({"status": "completed", "customer_left_at": None, "expert_left_at": None}, True),
    ({"status": "cancelled", "customer_left_at": None, "expert_left_at": None}, False),
  ],
)
async def test_booking_message_writes_require_open_confirmed_conversation(
  monkeypatch: pytest.MonkeyPatch,
  row: dict,
  expected: bool,
) -> None:
  async def fake_fetchrow(*_args, **_kwargs):
    return row

  monkeypatch.setattr(database, "pool", object())
  monkeypatch.setattr(database, "fetchrow", fake_fetchrow)

  assert await _booking_accepts_new_messages("booking-1") is expected


def test_consulting_websocket_relays_messages_in_both_directions(monkeypatch: pytest.MonkeyPatch) -> None:
  # These are in-memory protocol tests.  Other tests can leave the shared
  # database singleton connected, which would otherwise turn this into an
  # accidental database authorization/persistence integration test.
  monkeypatch.setattr(database, "pool", None)
  client = TestClient(create_app(Settings(auth_required=False)))

  with client.websocket_connect("/api/consulting/ws/bookings/booking-1?participantType=user") as user_socket:
    _drain_connected(user_socket)

    with client.websocket_connect("/api/consulting/ws/bookings/booking-1?participantType=expert") as expert_socket:
      _drain_connected(expert_socket)
      assert user_socket.receive_json()["type"] == "presence"

      user_socket.send_json(
        {
          "type": "message.send",
          "bookingId": "booking-1",
          "clientMessageId": "mobile-1",
          "body": "상담 전에 질문 있어요.",
        },
      )

      ack = user_socket.receive_json()
      echoed = user_socket.receive_json()
      received = expert_socket.receive_json()

      assert ack["type"] == "message.ack"
      assert ack["clientMessageId"] == "mobile-1"
      assert echoed["type"] == "message.new"
      assert received["type"] == "message.new"
      assert received["body"] == "상담 전에 질문 있어요."
      assert received["senderType"] == "user"

      expert_socket.send_json(
        {
          "type": "message.send",
          "bookingId": "booking-1",
          "clientMessageId": "web-1",
          "body": "네, 확인해서 안내드릴게요.",
        },
      )

      expert_ack = expert_socket.receive_json()
      expert_echoed = expert_socket.receive_json()
      user_received = user_socket.receive_json()

      assert expert_ack["type"] == "message.ack"
      assert expert_ack["clientMessageId"] == "web-1"
      assert expert_echoed["type"] == "message.new"
      assert user_received["type"] == "message.new"
      assert user_received["body"] == "네, 확인해서 안내드릴게요."
      assert user_received["senderType"] == "expert"


@pytest.mark.asyncio
async def test_expert_socket_authorization_does_not_create_customer_user(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_fetchrow(*_args, **_kwargs):
    return {
      "id": "booking-1",
      "user_id": "customer-1",
      "expert_id": "expert-1",
    }

  async def fail_ensure_user(*_args, **_kwargs):
    raise AssertionError("expert authentication must not create a customer user")

  monkeypatch.setattr(database, "pool", object())
  monkeypatch.setattr(database, "fetchrow", fake_fetchrow)
  monkeypatch.setattr("app.api.consulting_realtime.ensure_user", fail_ensure_user)

  participant_type = await _authorize_socket(
    auth=AuthContext(
      subject="partner-account-1",
      provider="google",
      email="expert@example.com",
      name="상담사",
      claims={"custom:expert_id": "expert-1"},
    ),
    booking_id="booking-1",
    participant_type="expert",
    settings=Settings(auth_required=True),
  )

  assert participant_type == "expert"


@pytest.mark.asyncio
async def test_expert_socket_message_does_not_create_customer_user(
  monkeypatch: pytest.MonkeyPatch,
) -> None:
  async def fake_fetchrow(*_args, **_kwargs):
    return {
      "status": "confirmed",
      "customer_left_at": None,
      "expert_left_at": None,
    }

  async def fail_ensure_user(*_args, **_kwargs):
    raise AssertionError("expert messages must not create a customer user")

  async def fake_create_message(_db, **kwargs):
    assert kwargs["sender_type"] == "expert"
    assert kwargs["sender_user_id"] is None
    return (
      {
        "type": "message.new",
        "id": "message-1",
        "bookingId": kwargs["booking_id"],
        "clientMessageId": kwargs["client_message_id"],
        "senderType": kwargs["sender_type"],
        "senderName": kwargs["sender_name"],
        "body": kwargs["body"],
        "media": [],
        "mediaIds": [],
        "sentAt": "2026-07-13T00:00:00Z",
      },
      True,
    )

  monkeypatch.setattr(database, "pool", object())
  monkeypatch.setattr(database, "fetchrow", fake_fetchrow)
  monkeypatch.setattr("app.api.consulting_realtime.ensure_user", fail_ensure_user)
  monkeypatch.setattr("app.api.consulting_realtime.create_consulting_message", fake_create_message)

  socket = FakeWebSocket()
  await _handle_client_event(
    auth=AuthContext(
      subject="partner-account-1",
      provider="google",
      email="expert@example.com",
      name="상담사",
      claims={"custom:expert_id": "expert-1"},
    ),
    connection=RealtimeConnection(
      websocket=socket,
      booking_id="booking-1",
      participant_type="expert",
      participant_name="상담사",
    ),
    payload={
      "type": "message.send",
      "clientMessageId": "web-1",
      "body": "실시간 답변입니다.",
    },
    settings=Settings(auth_required=True),
  )

  assert socket.sent[0]["type"] == "message.ack"


def test_consulting_websocket_reports_invalid_json_event(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(database, "pool", None)
  client = TestClient(create_app(Settings(auth_required=False)))

  with client.websocket_connect("/api/consulting/ws/bookings/booking-1") as socket:
    _drain_connected(socket)
    socket.send_text("not-json")

    error = socket.receive_json()
    assert error["type"] == "error"
    assert error["code"] == "INVALID_EVENT"


def test_message_row_to_event_maps_persisted_message_contract() -> None:
  event = message_row_to_event(
    {
      "id": "message-1",
      "booking_id": "booking-1",
      "client_message_id": "client-1",
      "sender_type": "user",
      "sender_name": "고객",
      "body": "사진 확인 부탁드려요.",
      "created_at": "2026-07-08T00:00:00Z",
      "media": [
        {
          "id": "media-1",
          "cdnUrl": "https://cdn.example.com/image.jpg",
          "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
          "contentType": "image/jpeg",
        },
      ],
    },
  )

  assert event == {
    "type": "message.new",
    "id": "message-1",
    "bookingId": "booking-1",
    "clientMessageId": "client-1",
    "senderType": "user",
    "senderName": "고객",
    "body": "사진 확인 부탁드려요.",
    "media": [
      {
        "id": "media-1",
        "cdnUrl": "https://cdn.example.com/image.jpg",
        "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
        "contentType": "image/jpeg",
      },
    ],
    "mediaIds": ["media-1"],
    "sentAt": "2026-07-08T00:00:00Z",
  }


class FakeConversationHistoryDatabase:
  async def fetchrow(self, query: str, *_args):
    if "select coalesce(conversation_id, id) as conversation_id" in query:
      return {"conversation_id": "conversation-1"}
    return None

  async def fetch(self, query: str, *args):
    if "select id::text as id" in query and "from consulting_bookings" in query:
      return [{"id": "booking-new"}, {"id": "booking-old"}]
    if "from consulting_messages m" in query:
      assert args[0] == ["booking-new", "booking-old"]
      return [
        {
          "id": "message-new",
          "booking_id": "booking-new",
          "client_message_id": "client-new",
          "sender_type": "expert",
          "sender_name": "상담사",
          "body": "새 예약 안내",
          "created_at": "2026-07-13T00:00:00Z",
          "media": [],
        },
        {
          "id": "message-old",
          "booking_id": "booking-old",
          "client_message_id": "client-old",
          "sender_type": "user",
          "sender_name": "고객",
          "body": "이전 상담 질문",
          "created_at": "2026-07-01T00:00:00Z",
          "media": [],
        },
      ]
    return []


@pytest.mark.asyncio
async def test_conversation_history_combines_only_bookings_in_same_conversation() -> None:
  history = await list_consulting_conversation_messages(
    FakeConversationHistoryDatabase(),
    booking_id="booking-new",
  )

  assert [message["body"] for message in history] == ["이전 상담 질문", "새 예약 안내"]
  assert [message["bookingId"] for message in history] == ["booking-old", "booking-new"]


class FakeConsultingMessageDatabase:
  is_connected = True

  def __init__(self) -> None:
    self.executed: list[tuple[str, tuple]] = []

  async def fetchrow(self, query: str, *args):
    if "insert into consulting_messages" in query:
      return {
        "id": "11111111-1111-1111-1111-111111111111",
        "booking_id": args[0],
        "client_message_id": args[1],
        "sender_type": args[2],
        "sender_name": args[4],
        "body": args[5],
        "created_at": "2026-07-08T00:00:00Z",
        "inserted": True,
      }

    if "from consulting_messages m" in query:
      return {
        "id": args[0],
        "booking_id": "22222222-2222-2222-2222-222222222222",
        "client_message_id": "client-1",
        "sender_type": "user",
        "sender_name": "고객",
        "body": "저장되는 메시지",
        "created_at": "2026-07-08T00:00:00Z",
        "media": [
          {
            "id": "33333333-3333-3333-3333-333333333333",
            "cdnUrl": "https://cdn.example.com/image.jpg",
            "thumbnailUrl": None,
            "contentType": "image/jpeg",
          },
        ],
      }

    return None

  async def execute(self, query: str, *args):
    self.executed.append((query, args))
    return "INSERT 0 1"


@pytest.mark.asyncio
async def test_create_consulting_message_persists_media_links() -> None:
  db = FakeConsultingMessageDatabase()

  message, was_inserted = await create_consulting_message(
    db,
    booking_id="22222222-2222-2222-2222-222222222222",
    body="저장되는 메시지",
    client_message_id="client-1",
    media=[
      {
        "id": "33333333-3333-3333-3333-333333333333",
        "cdnUrl": "https://cdn.example.com/image.jpg",
      },
    ],
    sender_name="고객",
    sender_type="user",
    sender_user_id=None,
  )

  assert was_inserted is True
  assert message["id"] == "11111111-1111-1111-1111-111111111111"
  assert message["mediaIds"] == ["33333333-3333-3333-3333-333333333333"]
  assert len(db.executed) == 1
  assert db.executed[0][1] == (
    "11111111-1111-1111-1111-111111111111",
    "33333333-3333-3333-3333-333333333333",
    0,
  )
