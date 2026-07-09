import json

from fastapi import APIRouter, Depends

from app.core.responses import success
from app.core.security import AuthContext, get_current_user
from app.core.settings import Settings, get_settings
from app.db.session import Database, require_database
from app.schemas.media import CompleteUploadRequest, PhotoCaptureCreate, PresignedUploadRequest
from app.services.media_thumbnail_metadata import (
  ThumbnailMetadata,
  expected_postprocessed_thumbnail_metadata,
  resolve_postprocessed_thumbnail_metadata,
)
from app.services.s3 import S3Service
from app.services.users import ensure_user


router = APIRouter(tags=["media"])


async def update_media_thumbnail_metadata(
  db: Database,
  media_id: object,
  thumbnail: ThumbnailMetadata,
) -> dict | None:
  return await db.fetchrow(
    """
    update media_assets
    set thumbnail_bucket = $2,
        thumbnail_object_key = $3,
        thumbnail_cdn_url = $4,
        thumbnail_content_type = $5,
        thumbnail_byte_size = $6,
        thumbnail_width = $7,
        thumbnail_height = $8
    where id = $1
      and deleted_at is null
    returning *
    """,
    media_id,
    thumbnail.bucket,
    thumbnail.object_key,
    thumbnail.cdn_url,
    thumbnail.content_type,
    thumbnail.byte_size,
    thumbnail.width,
    thumbnail.height,
  )


@router.post("/media/presigned-upload")
async def create_presigned_upload(
  payload: PresignedUploadRequest,
  _: AuthContext = Depends(get_current_user),
  settings: Settings = Depends(get_settings),
) -> dict:
  presigned = S3Service(settings).create_presigned_upload(
    media_kind=payload.media_kind,
    content_type=payload.content_type,
    original_filename=payload.original_filename,
  )

  return success({"upload": presigned})


@router.post("/media/complete-upload")
async def complete_upload(
  payload: CompleteUploadRequest,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  user = await ensure_user(db, auth)
  media = await db.fetchrow(
    """
    insert into media_assets (
      owner_user_id,
      media_kind,
      source,
      bucket,
      object_key,
      cdn_url,
      thumbnail_bucket,
      thumbnail_object_key,
      thumbnail_cdn_url,
      thumbnail_content_type,
      thumbnail_byte_size,
      thumbnail_width,
      thumbnail_height,
      content_type,
      byte_size,
      width,
      height,
      checksum_sha256,
      original_filename
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    returning *
    """,
    user["id"],
    payload.media_kind,
    payload.source,
    payload.bucket,
    payload.object_key,
    payload.cdn_url,
    payload.thumbnail_bucket,
    payload.thumbnail_object_key,
    payload.thumbnail_cdn_url,
    payload.thumbnail_content_type,
    payload.thumbnail_byte_size,
    payload.thumbnail_width,
    payload.thumbnail_height,
    payload.content_type,
    payload.byte_size,
    payload.width,
    payload.height,
    payload.checksum_sha256,
    payload.original_filename,
  )

  if not payload.thumbnail_object_key:
    thumbnail = await resolve_postprocessed_thumbnail_metadata(
      S3Service(settings).client(),
      bucket=payload.bucket,
      source_object_key=payload.object_key,
      cdn_base_url=settings.effective_cdn_base_url,
    )

    if thumbnail is None:
      thumbnail = expected_postprocessed_thumbnail_metadata(
        bucket=payload.bucket,
        source_object_key=payload.object_key,
        cdn_base_url=settings.effective_cdn_base_url,
      )

    if thumbnail is not None:
      media = await update_media_thumbnail_metadata(db, media["id"], thumbnail) or media

  return success({"media": media})


@router.post("/photo-captures")
async def create_photo_capture(
  payload: PhotoCaptureCreate,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
) -> dict:
  user = await ensure_user(db, auth)
  capture = await db.fetchrow(
    """
    insert into photo_captures (user_id, media_id, capture_type, source, device_payload)
    values ($1, $2, $3, $4, $5::jsonb)
    returning *
    """,
    user["id"],
    payload.media_id,
    payload.capture_type,
    payload.source,
    json.dumps(payload.device_payload),
  )

  return success({"photoCapture": capture})
