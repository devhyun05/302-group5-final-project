from typing import Any

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient
from pydantic import BaseModel

from app.core.config import Settings


class CognitoPrincipal(BaseModel):
    sub: str
    email: str | None = None
    name: str | None = None
    nickname: str | None = None
    token_use: str | None = None
    claims: dict[str, Any]


class CognitoTokenVerifier:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._jwks_client: PyJWKClient | None = None

    def verify(self, token: str) -> CognitoPrincipal:
        if self.settings.auth_local_bypass:
            return CognitoPrincipal(
                sub=self.settings.auth_local_sub,
                email=self.settings.auth_local_email,
                name=self.settings.auth_local_name,
                nickname=self.settings.auth_local_name,
                token_use="local",
                claims={"sub": self.settings.auth_local_sub, "token_use": "local"},
            )

        if not self.settings.cognito_issuer or not self.settings.cognito_jwks_url:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Cognito settings are not configured.",
            )

        try:
            unverified_claims = jwt.decode(token, options={"verify_signature": False})
            signing_key = self._get_jwks_client().get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                issuer=self.settings.cognito_issuer,
                options={"verify_aud": False},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Cognito token.",
            ) from exc

        token_use = claims.get("token_use") or unverified_claims.get("token_use")
        self._validate_token_use(token_use)
        self._validate_client_id(claims, token_use)

        sub = claims.get("sub")
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cognito token does not include sub.",
            )

        return CognitoPrincipal(
            sub=sub,
            email=claims.get("email"),
            name=claims.get("name"),
            nickname=claims.get("nickname") or claims.get("cognito:username"),
            token_use=token_use,
            claims=claims,
        )

    def _get_jwks_client(self) -> PyJWKClient:
        if self._jwks_client is None:
            self._jwks_client = PyJWKClient(self.settings.cognito_jwks_url)
        return self._jwks_client

    def _validate_token_use(self, token_use: str | None) -> None:
        required = self.settings.cognito_required_token_use
        if required == "any":
            return
        if token_use != required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Expected Cognito {required} token.",
            )

    def _validate_client_id(self, claims: dict[str, Any], token_use: str | None) -> None:
        app_client_id = self.settings.cognito_app_client_id
        if not app_client_id:
            return

        if token_use == "id" and claims.get("aud") != app_client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cognito token audience does not match app client.",
            )

        if token_use == "access" and claims.get("client_id") != app_client_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Cognito access token client_id does not match app client.",
            )

