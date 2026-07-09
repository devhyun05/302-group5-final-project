from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.repositories import (
    complete_media_asset,
    create_media_asset,
    get_media_asset_for_user,
)
from app.db.session import get_db
from app.schemas.base import serialize_row
from app.schemas.media import (
    MediaAssetComplete,
    MediaAssetCreate,
    MediaAssetResponse,
    PresignedUploadCreate,
    PresignedUploadResponse,
)
from app.services.s3_uploads import (
    build_capture_object_key,
    build_cdn_url,
    create_presigned_upload_url,
)


router = APIRouter()


@router.post("", response_model=MediaAssetResponse)
def register_media_asset(
    payload: MediaAssetCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    created = create_media_asset(
        db,
        current_user["id"],
        payload.model_dump(),
    )
    return serialize_row(created)


@router.post("/presigned-upload", response_model=PresignedUploadResponse)
def create_presigned_upload(
    payload: PresignedUploadCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    settings = get_settings()
    object_key = build_capture_object_key(str(current_user["id"]), payload.content_type)
    upload_url = create_presigned_upload_url(settings, object_key, payload.content_type)
    media_asset = create_media_asset(
        db,
        current_user["id"],
        {
            "media_kind": payload.media_kind,
            "source": payload.source,
            "bucket": settings.s3_bucket,
            "object_key": object_key,
            "cdn_url": build_cdn_url(settings, object_key),
            "content_type": payload.content_type,
            "byte_size": payload.byte_size,
            "original_filename": payload.original_filename,
            "is_original": True,
            "status": "pending_upload",
        },
    )
    return {
        "mediaAsset": serialize_row(media_asset),
        "uploadUrl": upload_url,
        "method": "PUT",
        "headers": {"Content-Type": payload.content_type},
        "expiresIn": settings.presigned_upload_expires_seconds,
    }


@router.get("/{media_asset_id}", response_model=MediaAssetResponse)
def read_media_asset(
    media_asset_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    media_asset = get_media_asset_for_user(db, media_asset_id, current_user["id"])
    if not media_asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media asset not found.")
    return serialize_row(media_asset)


@router.post("/{media_asset_id}/complete", response_model=MediaAssetResponse)
def mark_media_asset_complete(
    media_asset_id: UUID,
    payload: MediaAssetComplete,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    media_asset = complete_media_asset(
        db,
        media_asset_id,
        current_user["id"],
        payload.model_dump(exclude_unset=True),
    )
    if not media_asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media asset not found.")
    return serialize_row(media_asset)

