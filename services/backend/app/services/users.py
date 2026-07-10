from typing import Any

from app.core.security import AuthContext
from app.db.session import Database


SUPPORTED_PROVIDERS = {"google", "kakao", "naver", "apple"}


def normalize_provider(provider: str) -> str:
  return provider if provider in SUPPORTED_PROVIDERS else "google"


def default_nickname(auth: AuthContext) -> str:
  return auth.name or auth.email or "AURA User"


async def ensure_user(db: Database, auth: AuthContext) -> dict[str, Any]:
  provider = normalize_provider(auth.provider)
  return await db.fetchrow(
    """
    insert into users (auth_provider, oauth_sub, email, name, nickname)
    values ($1, $2, $3, $4, $5)
    on conflict (auth_provider, oauth_sub)
      where oauth_sub is not null and deleted_at is null
    do update set
      email = coalesce(excluded.email, users.email),
      name = coalesce(excluded.name, users.name),
      nickname = coalesce(nullif(users.nickname, ''), excluded.nickname)
    returning *
    """,
    provider,
    auth.subject,
    auth.email,
    auth.name,
    default_nickname(auth),
  ) or {}