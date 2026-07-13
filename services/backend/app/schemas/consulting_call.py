from pydantic import Field

from app.schemas.base import CamelModel


class ConsultingCallJoinRequest(CamelModel):
  language_code: str = Field(default="ko-KR", alias="languageCode", pattern="^(ko-KR|en-US)$")


class ConsultingCallEndRequest(CamelModel):
  transcript: str | None = Field(default=None, max_length=50000)


class ConsultingTranscriptionStartRequest(CamelModel):
  language_code: str = Field(default="ko-KR", alias="languageCode", pattern="^(ko-KR|en-US)$")
  source_language_code: str | None = Field(default=None, alias="sourceLanguageCode", pattern="^(ko-KR|en-US)$")
  transcription_consent_accepted: bool = Field(default=False, alias="transcriptionConsentAccepted")
