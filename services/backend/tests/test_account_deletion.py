from uuid import uuid4

import pytest
from fastapi import BackgroundTasks

from app.api import users as users_api
from app.core.errors import AppError
from app.core.security import AuthContext
from app.core.settings import REPO_ROOT, Settings
from app.schemas.users import AccountDeletionRequest
from app.services.account_deletion import (
  AccountDeletionResult,
  delete_cognito_identity,
  delete_user_account,
)
from app.services.account_identity import hash_auth_subject
from app.services.users import ensure_user


def build_auth_context() -> AuthContext:
  return AuthContext(
    subject="cognito-user-subject",
    provider="google",
    email="user@example.com",
    name="AURA User",
    claims={"sub": "cognito-user-subject", "token_use": "access"},
  )


class DeletedIdentityDatabase:
  async def fetchrow(self, query: str, *args):
    assert "insert into users" in query
    assert "from account_deletion_tombstones" in query
    assert args[-1] == hash_auth_subject("google", "cognito-user-subject")
    return None


def test_auth_subject_hash_is_stable_and_does_not_store_raw_identity() -> None:
  digest = hash_auth_subject("google", "cognito-user-subject")

  assert digest == hash_auth_subject("google", "cognito-user-subject")
  assert len(digest) == 64
  assert "cognito-user-subject" not in digest


@pytest.mark.asyncio
async def test_deleted_identity_cannot_be_recreated_by_a_still_valid_token() -> None:
  with pytest.raises(AppError) as exc_info:
    await ensure_user(DeletedIdentityDatabase(), build_auth_context())

  assert exc_info.value.status_code == 403
  assert exc_info.value.code == "ACCOUNT_DELETED"


@pytest.mark.asyncio
async def test_cognito_deletion_is_skipped_when_pool_is_not_configured() -> None:
  deleted = await delete_cognito_identity(build_auth_context(), Settings(cognito_user_pool_id=None))

  assert deleted is False


@pytest.mark.asyncio
async def test_delete_account_response_and_media_cleanup_task(monkeypatch) -> None:
  outbox_id = uuid4()

  async def fake_ensure_user(_db, _auth):
    return {"id": uuid4()}

  async def fake_delete_user_account(_db, *, auth, reason, user_id):
    assert auth.subject == "cognito-user-subject"
    assert reason == "privacy_concerns"
    assert user_id is not None
    return AccountDeletionResult(media_count=1, outbox_ids=(outbox_id,))

  async def fake_delete_cognito_identity(_auth, _settings):
    return True

  monkeypatch.setattr(users_api, "ensure_user", fake_ensure_user)
  monkeypatch.setattr(users_api, "delete_user_account", fake_delete_user_account)
  monkeypatch.setattr(users_api, "delete_cognito_identity", fake_delete_cognito_identity)

  background_tasks = BackgroundTasks()
  response = await users_api.delete_my_account(
    background_tasks,
    payload=AccountDeletionRequest(reason="privacy_concerns"),
    auth=build_auth_context(),
    db=object(),
    settings=Settings(cognito_user_pool_id="ap-northeast-2_example"),
  )

  assert response["data"] == {
    "deleted": True,
    "identityDeleted": True,
    "mediaDeletionPending": 1,
  }
  assert len(background_tasks.tasks) == 1


class AccountDeleteTransaction:
  def __init__(self, events: list[str]) -> None:
    self.events = events

  async def __aenter__(self):
    self.events.append("transaction_enter")

  async def __aexit__(self, exc_type, _exc, _traceback):
    self.events.append("rollback" if exc_type else "commit")


class AccountDeleteConnection:
  def __init__(self, user_id) -> None:
    self.user_id = user_id
    self.events: list[str] = []
    self.queries: list[str] = []

  def transaction(self):
    return AccountDeleteTransaction(self.events)

  async def fetchrow(self, query: str, *_args):
    normalized = " ".join(query.lower().split())
    self.queries.append(normalized)
    if "from users" in normalized:
      return {"id": self.user_id}
    raise AssertionError(f"Unexpected fetchrow query: {query}")

  async def fetch(self, query: str, *_args):
    normalized = " ".join(query.lower().split())
    self.queries.append(normalized)
    if "from media_assets" in normalized:
      return []
    raise AssertionError(f"Unexpected fetch query: {query}")

  async def execute(self, query: str, *_args):
    normalized = " ".join(query.lower().split())
    self.queries.append(normalized)
    if normalized == "delete from users where id = $1":
      self.events.append("hard_delete_user")
    return "DELETE 1"


class AccountDeleteAcquire:
  def __init__(self, connection: AccountDeleteConnection) -> None:
    self.connection = connection

  async def __aenter__(self):
    return self.connection

  async def __aexit__(self, _exc_type, _exc, _traceback):
    return None


class AccountDeletePool:
  def __init__(self, connection: AccountDeleteConnection) -> None:
    self.connection = connection

  def acquire(self):
    return AccountDeleteAcquire(self.connection)


@pytest.mark.asyncio
async def test_hard_account_delete_relies_on_profile_user_cascade_in_same_transaction() -> None:
  user_id = uuid4()
  connection = AccountDeleteConnection(user_id)
  db = type("AccountDeleteDatabase", (), {"pool": AccountDeletePool(connection)})()

  result = await delete_user_account(
    db,
    auth=build_auth_context(),
    user_id=user_id,
  )

  assert result.media_count == 0
  assert connection.events == ["transaction_enter", "hard_delete_user", "commit"]
  assert not any("delete from analysis_face_profiles" in query for query in connection.queries)

  schema = (REPO_ROOT / "docs" / "backend" / "schema.sql").read_text()
  profile_fk_section = schema.split("alter table analysis_face_profiles", 1)[1]
  profile_fk_section = profile_fk_section.split(";", 1)[0]
  assert "foreign key (user_id) references users(id) on delete cascade" in profile_fk_section
