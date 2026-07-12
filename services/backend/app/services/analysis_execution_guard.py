from collections.abc import Mapping
from typing import Any

from app.core.errors import AppError
from app.core.settings import Settings
from app.db.session import Database
from app.services.user_consents import (
  AI_PROCESSING_CONSENT_VERSION,
  THIRD_PARTY_AI_CONSENT_VERSION,
  requires_third_party_ai,
)


async def require_execution_allowed(
  db: Database,
  report_id: object,
  settings: Settings,
) -> dict[str, Any]:
  """Recheck report state and current provider consent at an execution boundary."""

  third_party_required = requires_third_party_ai(settings)
  row = await db.fetchrow(
    """
    select
      r.id,
      r.user_id,
      r.status,
      r.deleted_at,
      exists (
        select 1
        from user_consents ai
        where ai.user_id = r.user_id
          and ai.consent_type = 'ai_processing'::consent_type
          and ai.version = $2
          and ai.accepted = true
          and ai.accepted_at is not null
          and ai.revoked_at is null
      ) as ai_processing_active,
      case
        when $3::boolean = false then true
        else exists (
          select 1
          from user_consents third_party
          where third_party.user_id = r.user_id
            and third_party.consent_type = 'third_party_ai'::consent_type
            and third_party.version = $4
            and third_party.accepted = true
            and third_party.accepted_at is not null
            and third_party.revoked_at is null
        )
      end as third_party_ai_active
    from analysis_reports r
    where r.id = $1
    """,
    report_id,
    AI_PROCESSING_CONSENT_VERSION,
    third_party_required,
    THIRD_PARTY_AI_CONSENT_VERSION,
  )

  report = dict(row) if isinstance(row, Mapping) else None
  if (
    report is None
    or report.get("deleted_at") is not None
    or report.get("status") not in {"pending", "processing"}
  ):
    raise AppError(
      409,
      "ANALYSIS_REPORT_CANCELLED",
      "The analysis report is no longer executable.",
    )

  if not report.get("ai_processing_active") or not report.get("third_party_ai_active"):
    await db.execute(
      """
      update analysis_reports
      set status = 'cancelled'::job_status,
          error_message = 'FACE_ANALYSIS_CONSENT_REVOKED'
      where id = $1
        and deleted_at is null
        and status in ('pending', 'processing')
      """,
      report_id,
    )
    raise AppError(
      403,
      "FACE_ANALYSIS_CONSENT_REVOKED",
      "Current AI processing consent is required to continue face analysis.",
    )

  return report
