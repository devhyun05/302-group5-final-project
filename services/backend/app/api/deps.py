from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.cognito import CognitoPrincipal, CognitoTokenVerifier
from app.core.config import get_settings
from app.db.repositories import upsert_user_from_principal
from app.db.session import get_db


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CognitoPrincipal:
    settings = get_settings()
    if settings.auth_local_bypass:
        return CognitoTokenVerifier(settings).verify("")

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )

    return CognitoTokenVerifier(settings).verify(credentials.credentials)


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    principal: Annotated[CognitoPrincipal, Depends(get_current_principal)],
) -> dict:
    return upsert_user_from_principal(db, principal)

