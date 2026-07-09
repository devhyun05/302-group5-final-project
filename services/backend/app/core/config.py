from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AURA Backend"
    app_env: str = "local"
    log_level: str = "INFO"
    cors_allow_origins: list[str] = ["*"]

    database_url: str = Field(default="", alias="DATABASE_URL")

    aws_region: str = "ap-northeast-2"
    cognito_user_pool_id: str | None = None
    cognito_app_client_id: str | None = None
    cognito_required_token_use: str = "id"

    auth_local_bypass: bool = False
    auth_local_sub: str = "local-user-sub"
    auth_local_email: str = "local@example.com"
    auth_local_name: str = "Local User"

    s3_bucket: str | None = None
    cloudfront_base_url: str | None = None
    presigned_upload_expires_seconds: int = 900

    bedrock_enabled: bool = False
    bedrock_model_id: str = "global.amazon.nova-2-lite-v1:0"
    bedrock_max_tokens: int = 2200
    bedrock_temperature: float = 0.2
    bedrock_include_image: bool = True
    bedrock_fallback_to_mock: bool = True

    @computed_field
    @property
    def cognito_issuer(self) -> str | None:
        if not self.cognito_user_pool_id:
            return None
        return f"https://cognito-idp.{self.aws_region}.amazonaws.com/{self.cognito_user_pool_id}"

    @computed_field
    @property
    def cognito_jwks_url(self) -> str | None:
        if not self.cognito_issuer:
            return None
        return f"{self.cognito_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
