import asyncio
import json
import logging
import time
from uuid import UUID


from fastapi import APIRouter, BackgroundTasks, Depends, Query



from app.core.errors import AppError
from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, database, require_database
from app.schemas.analysis import AnalysisJobCreate, AnalysisJobReplay
from app.schemas.face_analysis_responses import (
  AnalysisJobResponse,
  AnalysisReportResponse,
  AnalysisReportsResponse,
)
from app.services.analysis_face_profiles import (
  compact_face_profile_for_ai,
  insert_analysis_face_profile,
  map_face_profile_detail,
  map_face_profile_summary,
)
from app.services.ai_job_queue import AIJobQueuePublisher
from app.services.analysis_execution_guard import require_execution_allowed
from app.services.embeddings import embed_text, format_pgvector, report_embedding_text
from app.services.media_deletion import (
  MediaObjectRef,
  collect_report_media_refs,
  enqueue_unreferenced_report_media_deletions,
  ensure_media_deletion_schema,
  process_media_deletion_outbox_items,
)
from app.services.openai_analysis import OpenAIAnalysisService
from app.services.owned_media import trusted_media_request_payload
from app.services.user_consents import (
  AI_PROCESSING_CONSENT_VERSION,
  FACE_PROFILE_CONSENT_VERSION,
  THIRD_PARTY_AI_CONSENT_VERSION,
  require_active_consent,
  requires_third_party_ai,
)
from app.services.users import ensure_user


router = APIRouter(prefix="/analysis", tags=["analysis"])
logger = logging.getLogger(__name__)
analysis_image_tasks: set[asyncio.Task] = set()
AnalysisExecutionPayload = AnalysisJobCreate | AnalysisJobReplay


def is_execution_stop_error(exc: AppError) -> bool:
  return exc.code in {
    "ANALYSIS_REPORT_CANCELLED",
    "FACE_ANALYSIS_CONSENT_REVOKED",
  }


async def update_analysis_report_embedding(
  db: Database,
  report: dict,
  settings: Settings,
) -> str:
  try:
    await require_execution_allowed(db, report["id"], settings)
    embedding = await asyncio.to_thread(embed_text, report_embedding_text(report))
    await require_execution_allowed(db, report["id"], settings)
    if embedding is None:
      return "skipped"
    updated = await db.fetchrow(
      """
      update analysis_reports
      set embedding = $2::vector
      where id = $1
        and deleted_at is null
        and status <> 'cancelled'
        and status = 'processing'
      returning id
      """,
      report["id"],
      format_pgvector(embedding),
    )
    return "success" if updated is not None else "cancelled"
  except AppError as exc:
    if is_execution_stop_error(exc):
      return "cancelled"
    return "failed"
  except Exception:
    logger.exception(
      "[aura:analysis-api] embedding:failed reportId=%s",
      report.get("id"),
    )
    return "failed"

ANALYSIS_SUMMARY_SELECT = """
  r.id,
  r.user_id,
  r.photo_capture_id,
  r.source_media_id,
  r.preview_media_id,
  r.status,
  r.ai_provider,
  r.ai_model,
  r.request_id,
  r.error_message,
  r.analyzed_at,
  r.title,
  r.report_title,
  r.environment_label,
  r.personal_color,
  r.face_shape,
  r.skin_type,
  r.tone_summary,
  r.recommended_mood,
  r.summary,
  r.short_summary,
  r.skin_analysis_summary,
  r.base_makeup_guide,
  r.tags,
  r.created_at,
  r.updated_at,
  r.deleted_at,
  afp.status as face_profile_status,
  afp.dominant_shape as face_profile_dominant_shape,
  afp.confidence_gap as face_profile_confidence_gap,
  afp.schema_version as face_profile_schema_version,
  source_media.id as source_media_ref_id,
  source_media.bucket as source_media_ref_bucket,
  source_media.object_key as source_media_ref_object_key,
  source_media.cdn_url as source_media_ref_cdn_url,
  source_media.content_type as source_media_ref_content_type,
  source_media.width as source_media_ref_width,
  source_media.height as source_media_ref_height,
  preview_media.id as preview_media_ref_id,
  preview_media.bucket as preview_media_ref_bucket,
  preview_media.object_key as preview_media_ref_object_key,
  preview_media.cdn_url as preview_media_ref_cdn_url,
  preview_media.content_type as preview_media_ref_content_type,
  preview_media.width as preview_media_ref_width,
  preview_media.height as preview_media_ref_height
"""

ANALYSIS_DETAIL_SELECT = """
  r.*,
  afp.status as face_profile_status,
  afp.dominant_shape as face_profile_dominant_shape,
  afp.confidence_gap as face_profile_confidence_gap,
  afp.schema_version as face_profile_schema_version,
  afp.profile_payload as face_profile,
  source_media.id as source_media_ref_id,
  source_media.bucket as source_media_ref_bucket,
  source_media.object_key as source_media_ref_object_key,
  source_media.cdn_url as source_media_ref_cdn_url,
  source_media.content_type as source_media_ref_content_type,
  source_media.width as source_media_ref_width,
  source_media.height as source_media_ref_height,
  preview_media.id as preview_media_ref_id,
  preview_media.bucket as preview_media_ref_bucket,
  preview_media.object_key as preview_media_ref_object_key,
  preview_media.cdn_url as preview_media_ref_cdn_url,
  preview_media.content_type as preview_media_ref_content_type,
  preview_media.width as preview_media_ref_width,
  preview_media.height as preview_media_ref_height
"""


def decode_json_object(value: object) -> dict:
  if isinstance(value, dict):
    return value

  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return {}

    return decoded if isinstance(decoded, dict) else {}

  return {}


def normalize_analysis_report_row(row: dict | None) -> dict | None:
  if row is None:
    return None

  normalized = dict(row)
  if "detail_payload" in normalized:
    normalized["detail_payload"] = decode_json_object(normalized.get("detail_payload"))
  attach_analysis_media_reference(normalized, "source_media_ref", "source_media")
  attach_analysis_media_reference(normalized, "preview_media_ref", "preview_media")
  profile_mapping = (
    map_face_profile_detail(normalized)
    if "face_profile" in normalized
    else map_face_profile_summary(normalized)
  )
  normalized.update(profile_mapping)

  for key in (
    "face_profile_status",
    "face_profile_dominant_shape",
    "face_profile_confidence_gap",
    "face_profile_schema_version",
    "face_profile",
  ):
    normalized.pop(key, None)

  return normalized


def attach_analysis_media_reference(row: dict, prefix: str, target_key: str) -> None:
  media_id = row.pop(f"{prefix}_id", None)
  bucket = row.pop(f"{prefix}_bucket", None)
  object_key = row.pop(f"{prefix}_object_key", None)
  cdn_url = row.pop(f"{prefix}_cdn_url", None)
  content_type = row.pop(f"{prefix}_content_type", None)
  width = row.pop(f"{prefix}_width", None)
  height = row.pop(f"{prefix}_height", None)

  if media_id is None:
    row[target_key] = None
    return

  row[target_key] = {
    "id": str(media_id),
    "bucket": bucket,
    "object_key": object_key,
    "cdn_url": cdn_url,
    "content_type": content_type,
    "width": width,
    "height": height,
  }


def normalize_analysis_report_rows(rows: list[dict]) -> list[dict]:
  return [
    normalized
    for row in rows
    if (normalized := normalize_analysis_report_row(row)) is not None
  ]


def count_generated_makeup_images(result: dict | None) -> int:
  if not isinstance(result, dict):
    return 0

  recommended_makeups = result.get("recommendedMakeups")

  if not isinstance(recommended_makeups, list):
    return 0

  return sum(
    1
    for card in recommended_makeups
    if isinstance(card, dict)
    and any(
      isinstance(card.get(key), str) and card.get(key, "").strip()
      for key in ("imageUrl", "cdnUrl", "previewUrl")
    )
  )


def require_complete_makeup_recommendations(result: dict | None) -> None:
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None
  recommended_count = len(recommended_makeups) if isinstance(recommended_makeups, list) else 0
  generated_image_count = count_generated_makeup_images(result)

  if recommended_count != 1 or generated_image_count != 1:
    raise AppError(
      502,
      "RECOMMENDED_MAKEUP_IMAGES_REQUIRED",
      "Analysis cannot be completed until exactly 1 recommended makeup image is generated.",
      details={
        "recommendedCount": recommended_count,
        "generatedImageCount": generated_image_count,
      },
    )




def build_analysis_detail_payload(payload: AnalysisExecutionPayload, result: dict) -> dict:
  return {"request": payload.request_payload, "result": result}


def build_analysis_provider_payload(
  payload: AnalysisExecutionPayload,
) -> dict:
  provider_payload = dict(payload.request_payload)
  provider_payload.pop("faceProfile", None)
  provider_payload.pop("faceProfileSummary", None)
  if payload.face_profile is not None:
    provider_payload["faceProfileSummary"] = compact_face_profile_for_ai(
      payload.face_profile,
    )
  return provider_payload


def mark_recommended_makeup_images_failed(result: dict) -> list[dict]:
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None

  if not isinstance(recommended_makeups, list):
    return []

  return [
    {**card, "imageStatus": "failed"}
    for card in recommended_makeups
    if isinstance(card, dict)
  ]


async def update_analysis_image_progress(
  db: Database,
  report_id: UUID,
  payload: AnalysisExecutionPayload,
  result: dict,
) -> bool:
  updated = await db.fetchrow(
    """
    update analysis_reports
    set detail_payload = $2::jsonb
    where id = $1
      and deleted_at is null
      and status <> 'cancelled'
      and status = 'processing'
    returning id
    """,
    report_id,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )
  return updated is not None


async def finalize_analysis_report(
  db: Database,
  report_id: UUID,
  payload: AnalysisExecutionPayload,
  result: dict,
  settings: Settings,
) -> bool:
  await require_execution_allowed(db, report_id, settings)
  updated = await db.fetchrow(
    """
    update analysis_reports
    set status = 'completed',
        error_message = null,
        detail_payload = $2::jsonb
    where id = $1
      and deleted_at is null
      and status <> 'cancelled'
      and status = 'processing'
    returning id
    """,
    report_id,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )
  return updated is not None


async def enqueue_orphaned_generated_card(
  db: Database,
  settings: Settings,
  report_id: UUID,
  card: dict,
) -> None:
  bucket = card.get("imageBucket")
  object_key = card.get("imageObjectKey")
  if (
    db.pool is None
    or not isinstance(bucket, str)
    or not isinstance(object_key, str)
  ):
    return
  outbox_ids: list[UUID]
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      outbox_ids, _ = await enqueue_unreferenced_report_media_deletions(
        connection,
        report_id=report_id,
        refs=[MediaObjectRef(bucket=bucket, object_key=object_key)],
      )
  if outbox_ids:
    await process_media_deletion_outbox_items(db, settings, outbox_ids)


async def generate_analysis_images_background(
  report_id: UUID,
  payload: AnalysisExecutionPayload,
  initial_result: dict,
  settings: Settings,
  prepared_source: tuple[bytes, str] | None = None,
  db: Database = database,
) -> None:
  try:
    await require_execution_allowed(db, report_id, settings)
  except AppError as exc:
    if is_execution_stop_error(exc):
      return
    raise

  service = OpenAIAnalysisService(settings)
  provider_payload = build_analysis_provider_payload(payload)

  async def execution_guard() -> None:
    await require_execution_allowed(db, report_id, settings)

  async def on_orphaned_card(generated_card: dict) -> None:
    await enqueue_orphaned_generated_card(
      db,
      settings,
      report_id,
      generated_card,
    )

  async def on_card_generated(index: int, generated_card: dict, partial_result: dict) -> None:
    try:
      await require_execution_allowed(db, report_id, settings)
    except AppError:
      await enqueue_orphaned_generated_card(
        db,
        settings,
        report_id,
        generated_card,
      )
      raise
    if not await update_analysis_image_progress(db, report_id, payload, partial_result):
      await enqueue_orphaned_generated_card(
        db,
        settings,
        report_id,
        generated_card,
      )
      raise AppError(
        409,
        "ANALYSIS_REPORT_CANCELLED",
        "The analysis report is no longer executable.",
      )
    logger.info(
      "[aura:analysis-api] image-generation:progress reportId=%s index=%s generatedImageCount=%s",
      report_id,
      index + 1,
      count_generated_makeup_images(partial_result),
    )

  try:
    result = await service.generate_recommended_makeup_images(
      provider_payload,
      initial_result,
      on_card_generated=on_card_generated,
      prepared_source=prepared_source,
      execution_guard=execution_guard,
      on_orphaned_card=on_orphaned_card,
    )
  except AppError as exc:
    if is_execution_stop_error(exc):
      return
    logger.warning(
      "[aura:analysis-api] image-generation:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    result = {
      **initial_result,
      "recommendedMakeups": mark_recommended_makeup_images_failed(initial_result),
      "imageGenerationStatus": "failed",
      "imageGenerationErrors": [
        {"reason": exc.__class__.__name__, "code": exc.code, "message": exc.message}
      ],
      "timing": {
        **(
          initial_result.get("timing")
          if isinstance(initial_result.get("timing"), dict)
          else {}
        ),
        "imageGenerationStatus": "failed",
      },
    }
  except Exception as exc:
    logger.exception(
      "[aura:analysis-api] image-generation:failed reportId=%s",
      report_id,
    )
    result = {
      **initial_result,
      "recommendedMakeups": mark_recommended_makeup_images_failed(initial_result),
      "imageGenerationStatus": "failed",
      "imageGenerationErrors": [{"reason": exc.__class__.__name__}],
      "timing": {
        **(
          initial_result.get("timing")
          if isinstance(initial_result.get("timing"), dict)
          else {}
        ),
        "imageGenerationStatus": "failed",
      },
    }

  generated_image_count = count_generated_makeup_images(result)

  try:
    completed = await finalize_analysis_report(
      db,
      report_id,
      payload,
      result,
      settings,
    )
  except AppError as exc:
    if is_execution_stop_error(exc):
      return
    raise
  if not completed:
    return
  logger.info(
    "[aura:analysis-api] image-generation:finalized reportId=%s jobStatus=%s imageStatus=%s generatedImageCount=%s",
    report_id,
    "completed",
    result.get("imageGenerationStatus"),
    generated_image_count,
  )


def schedule_analysis_images_background(
  report_id: UUID,
  payload: AnalysisExecutionPayload,
  initial_result: dict,
  settings: Settings,
  prepared_source: tuple[bytes, str] | None = None,
  db: Database = database,
) -> None:
  task = asyncio.create_task(
    generate_analysis_images_background(
      report_id,
      payload,
      initial_result,
      settings,
      prepared_source,
      db,
    ),
  )
  analysis_image_tasks.add(task)

  def log_unhandled_error(completed_task: asyncio.Task) -> None:
    analysis_image_tasks.discard(completed_task)

    try:
      completed_task.result()
    except Exception:  # noqa: BLE001 - this is the last safety net for detached work.
      logger.exception(
        "[aura:analysis-api] image-generation:task-crashed reportId=%s",
        report_id,
      )

  task.add_done_callback(log_unhandled_error)
  logger.info("[aura:analysis-api] image-generation:scheduled reportId=%s", report_id)


async def mark_analysis_failed(
  db: Database,
  report_id: UUID,
  message: str,
  payload: AnalysisExecutionPayload,
  details: dict | None = None,
) -> None:
  await db.execute(
    """
    update analysis_reports
    set status = 'failed',
        error_message = $2,
        detail_payload = $3::jsonb
    where id = $1
      and deleted_at is null
      and status <> 'cancelled'
      and status in ('pending', 'processing')
    """,
    report_id,
    message,
    json.dumps(
      {
        "request": payload.request_payload,
        "error": {"message": message, "details": details or {}},
      },
    ),
  )


async def run_analysis_job_background(
  report_id: UUID,
  payload: AnalysisExecutionPayload,
  settings: Settings,
  *,
  db: Database = database,
  await_image_generation: bool = False,
) -> None:
  started_at = time.monotonic()
  logger.info(
    "[aura:analysis-api] background:start reportId=%s",
    report_id,
  )
  try:
    await require_execution_allowed(db, report_id, settings)
  except AppError as exc:
    if is_execution_stop_error(exc):
      return
    raise

  started = await db.fetchrow(
    """
    update analysis_reports
    set status = 'processing'
    where id = $1
      and deleted_at is null
      and status <> 'cancelled'
      and status in ('pending', 'processing')
    returning id
    """,
    report_id,
  )
  if started is None:
    return

  try:
    await require_execution_allowed(db, report_id, settings)
  except AppError as exc:
    if is_execution_stop_error(exc):
      return
    raise

  generates_images = settings.image_generation_provider_normalized == "openai"
  analysis_service = OpenAIAnalysisService(settings)
  prepare_source_task: asyncio.Task | None = None

  if generates_images:
    # Warm the generation source (S3 read + downscale) while the slower text
    # analysis runs, so image generation starts without that work on its path.
    prepare_source_task = asyncio.create_task(
      analysis_service.prepare_generation_source(
        build_analysis_provider_payload(payload),
      ),
    )

  try:
    logger.info(
      "[aura:analysis-api] text:start reportId=%s provider=%s model=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
    )
    await require_execution_allowed(db, report_id, settings)
    result = await analysis_service.analyze_text(
      build_analysis_provider_payload(payload),
      execution_guard=lambda: require_execution_allowed(
        db,
        report_id,
        settings,
      ),
    )
    await require_execution_allowed(db, report_id, settings)
    image_generation_status = (
      "processing"
      if generates_images
      else "disabled"
    )
    result["imageGenerationStatus"] = image_generation_status
    result["embeddingStatus"] = "processing"
    result["timing"] = {
      **(result.get("timing") if isinstance(result.get("timing"), dict) else {}),
      "imageGenerationStatus": image_generation_status,
      "embeddingStatus": "processing",
    }
    logger.info(
      "[aura:analysis-api] text:success reportId=%s provider=%s model=%s durationMs=%s",
      report_id,
      settings.analysis_provider,
      settings.effective_analysis_model_id,
      round((time.monotonic() - started_at) * 1000),
    )
  except AppError as exc:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    if is_execution_stop_error(exc):
      return
    logger.warning(
      "[aura:analysis-api] text:app-error reportId=%s code=%s details=%s",
      report_id,
      exc.code,
      exc.details,
    )
    try:
      await require_execution_allowed(db, report_id, settings)
    except AppError as guard_exc:
      if is_execution_stop_error(guard_exc):
        return
      raise
    await mark_analysis_failed(db, report_id, exc.message, payload, exc.details)
    return
  except Exception as exc:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    message = "AI analysis invocation failed."
    details = {"reason": exc.__class__.__name__}
    logger.exception("[aura:analysis-api] text:failed reportId=%s", report_id)
    try:
      await require_execution_allowed(db, report_id, settings)
    except AppError as guard_exc:
      if is_execution_stop_error(guard_exc):
        return
      raise
    await mark_analysis_failed(db, report_id, message, payload, details)
    return

  report = await db.fetchrow(
    """
    update analysis_reports
    set ai_provider = $2,
        ai_model = $3,
        analyzed_at = now(),
        personal_color = coalesce($4, personal_color),
        face_shape = coalesce($5, face_shape),
        skin_type = coalesce($6, skin_type),
        tone_summary = coalesce($7, tone_summary),
        recommended_mood = coalesce($8, recommended_mood),
        summary = coalesce($9, summary),
        short_summary = coalesce($10, short_summary),
        skin_analysis_summary = coalesce($11, skin_analysis_summary),
        base_makeup_guide = coalesce($12, base_makeup_guide),
        tags = coalesce($13, tags),
        detail_payload = $14::jsonb
    where id = $1
      and deleted_at is null
      and status <> 'cancelled'
      and status = 'processing'
    returning *
    """,
    report_id,
    settings.analysis_provider,
    settings.effective_analysis_model_id,
    result.get("personalColor") if isinstance(result, dict) else None,
    result.get("faceShape") if isinstance(result, dict) else None,
    result.get("skinType") if isinstance(result, dict) else None,
    result.get("toneSummary") if isinstance(result, dict) else None,
    result.get("recommendedMood") if isinstance(result, dict) else None,
    result.get("summary") if isinstance(result, dict) else None,
    result.get("shortSummary") if isinstance(result, dict) else None,
    result.get("skinAnalysisSummary") if isinstance(result, dict) else None,
    result.get("baseMakeupGuide") if isinstance(result, dict) else None,
    result.get("tags") if isinstance(result, dict) else None,
    json.dumps(build_analysis_detail_payload(payload, result)),
  )

  if report is None:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    logger.warning(
      "[aura:analysis-api] background:missing-report reportId=%s",
      report_id,
    )
    return

  embedding_status = await update_analysis_report_embedding(db, report, settings)
  if embedding_status == "cancelled":
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    return
  result["embeddingStatus"] = embedding_status
  result["timing"] = {
    **(result.get("timing") if isinstance(result.get("timing"), dict) else {}),
    "embeddingStatus": embedding_status,
  }
  try:
    await require_execution_allowed(db, report_id, settings)
  except AppError as exc:
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    if is_execution_stop_error(exc):
      return
    raise
  if not await update_analysis_image_progress(db, report_id, payload, result):
    if prepare_source_task is not None:
      prepare_source_task.cancel()
    return

  if generates_images:
    prepared_source: tuple[bytes, str] | None = None

    if prepare_source_task is not None:
      try:
        prepared_source = await prepare_source_task
      except Exception:  # noqa: BLE001 - fall back to reading inside generation.
        logger.warning(
          "[aura:analysis-api] image-source:prepare-failed reportId=%s",
          report_id,
          exc_info=True,
        )
        prepared_source = None
    if await_image_generation:
      await generate_analysis_images_background(
        report_id,
        payload,
        result,
        settings,
        prepared_source,
        db,
      )
      return

    schedule_analysis_images_background(
      report_id,
      payload,
      result,
      settings,
      prepared_source,
      db,
    )
    return

  try:
    await finalize_analysis_report(db, report_id, payload, result, settings)
  except AppError as exc:
    if is_execution_stop_error(exc):
      return
    raise
  logger.info(
    "[aura:analysis-api] background:completed reportId=%s durationMs=%s",
    report_id,
    round((time.monotonic() - started_at) * 1000),
  )


async def dispatch_analysis_job(
  db: Database,
  background_tasks: BackgroundTasks,
  report_id: UUID,
  user_id: UUID,
  payload: AnalysisJobCreate,
  settings: Settings,
) -> None:
  execution_mode = settings.ai_job_execution_mode_normalized

  if execution_mode == "inline":
    background_tasks.add_task(
      run_analysis_job_background,
      report_id,
      payload,
      settings,
    )
    return

  if execution_mode != "sqs":
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  publisher = AIJobQueuePublisher(settings)

  try:
    result = await asyncio.to_thread(publisher.publish_analysis_job, report_id, user_id)
  except AppError as exc:
    await mark_analysis_failed(db, report_id, exc.message, payload, exc.details)
    raise

  logger.info(
    "[aura:analysis-api] job:queued reportId=%s messageId=%s",
    report_id,
    result.get("messageId"),
  )


class _ConnectionDatabase:
  """Narrow adapter so the existing user upsert uses the held connection."""

  def __init__(self, connection) -> None:
    self.connection = connection

  async def fetchrow(self, query: str, *args):
    row = await self.connection.fetchrow(query, *args)
    return dict(row) if row is not None else None


async def _ensure_and_lock_analysis_user(connection, auth: AuthContext) -> dict:
  user = await ensure_user(_ConnectionDatabase(connection), auth)
  locked = await connection.fetchrow(
    """
    select *
    from users
    where id = $1
      and deleted_at is null
    for key share
    """,
    user["id"],
  )
  if locked is None:
    raise AppError(404, "USER_NOT_FOUND", "User account was not found.")
  return dict(locked)


async def _lock_owned_media(connection, *, media_id: UUID, user_id: UUID) -> dict:
  row = await connection.fetchrow(
    """
    select id, bucket, object_key, cdn_url, content_type, width, height
    from media_assets
    where id = $1
      and owner_user_id = $2
      and status = 'active'
      and deleted_at is null
    for share
    """,
    media_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "MEDIA_NOT_FOUND", "The media asset was not found for this user.")
  return dict(row)


async def _lock_owned_capture_media(
  connection,
  *,
  photo_capture_id: UUID,
  user_id: UUID,
) -> dict:
  row = await connection.fetchrow(
    """
    select
      capture.id as capture_id,
      media.id,
      media.bucket,
      media.object_key,
      media.cdn_url,
      media.content_type,
      media.width,
      media.height
    from photo_captures capture
    join media_assets media on media.id = capture.media_id
    where capture.id = $1
      and capture.user_id = $2
      and capture.status not in ('failed', 'cancelled')
      and media.owner_user_id = $2
      and media.status = 'active'
      and media.deleted_at is null
    for share of capture, media
    """,
    photo_capture_id,
    user_id,
  )
  if row is None:
    raise AppError(
      404,
      "PHOTO_CAPTURE_NOT_FOUND",
      "The photo capture was not found for this user.",
    )
  return dict(row)


async def _resolve_locked_analysis_media(
  connection,
  *,
  user_id: UUID,
  payload: AnalysisJobCreate,
) -> tuple[dict, dict | None]:
  capture_media = await _lock_owned_capture_media(
    connection,
    photo_capture_id=payload.photo_capture_id,
    user_id=user_id,
  )
  source_media = capture_media

  if payload.source_media_id is not None:
    direct_media = await _lock_owned_media(
      connection,
      media_id=payload.source_media_id,
      user_id=user_id,
    )
    if direct_media["id"] != capture_media["id"]:
      raise AppError(
        409,
        "MEDIA_CAPTURE_MISMATCH",
        "The media asset does not match the supplied photo capture.",
      )
    source_media = direct_media

  preview_media = None
  if payload.preview_media_id is not None:
    preview_media = (
      source_media
      if payload.preview_media_id == source_media["id"]
      else await _lock_owned_media(
        connection,
        media_id=payload.preview_media_id,
        user_id=user_id,
      )
    )

  return source_media, preview_media


@router.post("/jobs", response_model=AnalysisJobResponse)
async def create_analysis_job(
  payload: AnalysisJobCreate,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  execution_mode = settings.ai_job_execution_mode_normalized
  profile_is_ai_eligible = payload.face_profile.status in {
    "full_success",
    "partial_success",
  }
  should_dispatch = payload.run_immediately and profile_is_ai_eligible

  if should_dispatch and execution_mode not in {"inline", "sqs"}:
    raise AppError(
      500,
      "AI_JOB_EXECUTION_MODE_INVALID",
      "AI_JOB_EXECUTION_MODE must be either inline or sqs.",
      {"executionMode": execution_mode},
    )

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  logger.info(
    "[aura:analysis-api] job:create-start userSub=%s runImmediately=%s executionMode=%s",
    auth.subject,
    payload.run_immediately,
    execution_mode,
  )
  report: dict
  stored_profile: dict
  user: dict
  async with db.pool.acquire() as connection:
    async with connection.transaction():
      user = await _ensure_and_lock_analysis_user(connection, auth)
      source_media, preview_media = await _resolve_locked_analysis_media(
        connection,
        user_id=user["id"],
        payload=payload,
      )
      consent_rows = {
        "camera_analysis": await require_active_consent(
          connection,
          user["id"],
          "camera_analysis",
          FACE_PROFILE_CONSENT_VERSION,
        ),
      }
      if should_dispatch:
        consent_rows["ai_processing"] = await require_active_consent(
          connection,
          user["id"],
          "ai_processing",
          AI_PROCESSING_CONSENT_VERSION,
        )
        if requires_third_party_ai(settings):
          consent_rows["third_party_ai"] = await require_active_consent(
            connection,
            user["id"],
            "third_party_ai",
            THIRD_PARTY_AI_CONSENT_VERSION,
          )

      trusted_request = trusted_media_request_payload(
        settings,
        payload.request_payload,
        source_media,
      )
      trusted_request.pop("faceProfile", None)
      trusted_request.pop("faceProfileSummary", None)
      payload = payload.model_copy(
        update={
          "source_media_id": source_media["id"],
          "request_payload": trusted_request,
        },
      )
      report_status = "pending" if profile_is_ai_eligible else "failed"
      retake_error = None if profile_is_ai_eligible else "FACE_PROFILE_RETAKE_REQUIRED"
      detail_payload = {"request": payload.request_payload}
      if retake_error is not None:
        detail_payload["error"] = {
          "code": retake_error,
          "message": "Please retake the face photo before AI analysis.",
          "profileStatus": payload.face_profile.status,
        }

      inserted_report = await connection.fetchrow(
        """
        insert into analysis_reports (
          user_id,
          photo_capture_id,
          source_media_id,
          preview_media_id,
          status,
          title,
          report_title,
          environment_label,
          error_message,
          detail_payload
        )
        values ($1, $2, $3, $4, $5::job_status, $6, $7, $8, $9, $10::jsonb)
        returning *
        """,
        user["id"],
        payload.photo_capture_id,
        source_media["id"],
        preview_media["id"] if preview_media is not None else None,
        report_status,
        payload.title,
        payload.report_title or payload.title,
        payload.environment_label,
        retake_error,
        json.dumps(detail_payload),
      )
      if inserted_report is None:
        raise RuntimeError("analysis report insert returned no row")
      report = dict(inserted_report)
      stored_profile = await insert_analysis_face_profile(
        connection,
        report_id=report["id"],
        user_id=user["id"],
        photo_capture_id=payload.photo_capture_id,
        profile=payload.face_profile,
        consent_rows=consent_rows,
      )

  if should_dispatch:
    await dispatch_analysis_job(
      db,
      background_tasks,
      report["id"],
      user["id"],
      payload,
      settings,
    )

  response_row = {
    **report,
    "face_profile_status": stored_profile["status"],
    "face_profile_dominant_shape": stored_profile["dominant_shape"],
    "face_profile_confidence_gap": stored_profile["confidence_gap"],
    "face_profile_schema_version": stored_profile["schema_version"],
    "face_profile": stored_profile["profile_payload"],
  }
  normalized = normalize_analysis_report_row(response_row)
  if not profile_is_ai_eligible and normalized is not None:
    normalized.update({
      "retake_required": True,
      "error": {
        "code": "FACE_PROFILE_RETAKE_REQUIRED",
        "message": "Please retake the face photo before AI analysis.",
      },
    })
  return success({"job": normalized})


@router.get("/jobs/{job_id}", response_model=AnalysisJobResponse)
async def get_analysis_job(
  job_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  job = await db.fetchrow(
    f"""
    select {ANALYSIS_DETAIL_SELECT}
    from analysis_reports r
    left join analysis_face_profiles afp on afp.report_id = r.id
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    job_id,
    user["id"],
  )

  if not job:
    raise AppError(404, "ANALYSIS_JOB_NOT_FOUND", "Analysis job was not found.")

  return success({"job": normalize_analysis_report_row(job)})


@router.get("/reports", response_model=AnalysisReportsResponse)
async def list_analysis_reports(
  with_recommended_makeups: bool = Query(False, alias="withRecommendedMakeups"),
  limit: int | None = Query(None, ge=1, le=200),
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  filters = ["r.user_id = $1"]
  values: list[object] = [user["id"]]

  if with_recommended_makeups:
    filters.append(
      """
      jsonb_typeof(r.detail_payload->'result'->'recommendedMakeups') = 'array'
      and jsonb_array_length(r.detail_payload->'result'->'recommendedMakeups') > 0
      """,
    )

  query = f"""
    select {ANALYSIS_SUMMARY_SELECT}
    from analysis_reports r
    left join analysis_face_profiles afp on afp.report_id = r.id
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where {' and '.join(filters)}
      and r.deleted_at is null
    order by r.created_at desc
  """

  if limit is not None:
    values.append(limit)
    query += f" limit ${len(values)}"

  reports = await db.fetch(
    query,
    *values,
  )

  return success({"reports": normalize_analysis_report_rows(reports)})


@router.get("/reports/{report_id}", response_model=AnalysisReportResponse)
async def get_analysis_report(
  report_id: UUID,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    f"""
    select {ANALYSIS_DETAIL_SELECT}
    from analysis_reports r
    left join analysis_face_profiles afp on afp.report_id = r.id
    left join media_assets source_media on source_media.id = r.source_media_id
    left join media_assets preview_media on preview_media.id = r.preview_media_id
    where r.id = $1 and r.user_id = $2 and r.deleted_at is null
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  return success({"report": normalize_analysis_report_row(report)})


@router.delete("/reports/{report_id}")
async def delete_analysis_report(
  report_id: UUID,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  await ensure_media_deletion_schema(db)
  user = await ensure_user(db, auth)

  if db.pool is None:
    raise AppError(503, "DATABASE_NOT_CONFIGURED", "Database is not connected.")

  outbox_ids: list[UUID] = []
  skipped_referenced_count = 0
  already_deleted = False

  async with db.pool.acquire() as connection:
    async with connection.transaction():
      report = await connection.fetchrow(
        """
        select
          r.*,
          source_media.bucket as source_media_bucket,
          source_media.object_key as source_media_object_key,
          preview_media.bucket as preview_media_bucket,
          preview_media.object_key as preview_media_object_key,
          capture_media.id as capture_media_id,
          capture_media.bucket as capture_media_bucket,
          capture_media.object_key as capture_media_object_key
        from analysis_reports r
        left join media_assets source_media on source_media.id = r.source_media_id
        left join media_assets preview_media on preview_media.id = r.preview_media_id
        left join photo_captures pc on pc.id = r.photo_capture_id
        left join media_assets capture_media on capture_media.id = pc.media_id
        where r.id = $1 and r.user_id = $2
        for update of r
        """,
        report_id,
        user["id"],
      )

      if not report:
        raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

      already_deleted = report["deleted_at"] is not None
      refs = collect_report_media_refs(
        dict(report),
        cdn_base_url=settings.effective_cdn_base_url,
        default_bucket=settings.s3_bucket_name,
      )

      await connection.execute(
        """
        delete from analysis_face_profiles
        where report_id = $1 and user_id = $2
        """,
        report_id,
        user["id"],
      )
      await connection.execute(
        """
        update analysis_reports
        set deleted_at = coalesce(deleted_at, now()),
            status = case
              when status in ('pending', 'processing') then 'cancelled'::job_status
              else status
            end
        where id = $1 and user_id = $2
        """,
        report_id,
        user["id"],
      )

      outbox_ids, skipped_referenced_count = (
        await enqueue_unreferenced_report_media_deletions(
          connection,
          report_id=report_id,
          refs=refs,
        )
      )

  if outbox_ids:
    background_tasks.add_task(
      process_media_deletion_outbox_items,
      database,
      settings,
      outbox_ids,
    )

  return success({
    "alreadyDeleted": already_deleted,
    "deleted": True,
    "outboxCount": len(outbox_ids),
    "reportId": str(report_id),
    "skippedReferencedCount": skipped_referenced_count,
  })


@router.delete("/reports/{report_id}/recommended-makeups/{makeup_index}")
async def delete_analysis_report_recommended_makeup(
  report_id: UUID,
  makeup_index: int,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  if makeup_index < 0:
    raise AppError(
      400,
      "INVALID_RECOMMENDED_MAKEUP_INDEX",
      "Recommended makeup index must be zero or greater.",
    )

  user = await ensure_user(db, auth)
  report = await db.fetchrow(
    """
    select detail_payload
    from analysis_reports
    where id = $1 and user_id = $2 and deleted_at is null
    """,
    report_id,
    user["id"],
  )

  if not report:
    raise AppError(404, "ANALYSIS_REPORT_NOT_FOUND", "Analysis report was not found.")

  detail_payload = decode_json_object(report.get("detail_payload"))
  result = detail_payload.get("result")
  recommended_makeups = result.get("recommendedMakeups") if isinstance(result, dict) else None

  if not isinstance(recommended_makeups, list) or makeup_index >= len(recommended_makeups):
    raise AppError(
      404,
      "RECOMMENDED_MAKEUP_NOT_FOUND",
      "Recommended makeup was not found.",
      details={"makeupIndex": makeup_index},
    )

  updated_makeups = [
    makeup
    for index, makeup in enumerate(recommended_makeups)
    if index != makeup_index
  ]
  result["recommendedMakeups"] = updated_makeups
  detail_payload["result"] = result

  updated_report = await db.fetchrow(
    """
    update analysis_reports
    set detail_payload = $3::jsonb
    where id = $1 and user_id = $2 and deleted_at is null
    returning *
    """,
    report_id,
    user["id"],
    json.dumps(detail_payload),
  )

  return success({"report": normalize_analysis_report_row(updated_report)})
