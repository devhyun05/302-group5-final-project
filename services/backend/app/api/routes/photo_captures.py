from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.repositories import (
    create_photo_capture,
    get_media_asset_for_user,
    get_photo_capture_for_user,
)
from app.db.session import get_db
from app.schemas.base import serialize_row
from app.schemas.photo_captures import PhotoCaptureCreate, PhotoCaptureResponse


router = APIRouter()


@router.post("", response_model=PhotoCaptureResponse)
def create_capture(
    payload: PhotoCaptureCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    media_asset = get_media_asset_for_user(db, payload.media_id, current_user["id"])
    if not media_asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media asset not found.")

    created = create_photo_capture(
        db,
        current_user["id"],
        payload.model_dump(),
    )
    return serialize_row(created)


@router.get("/{photo_capture_id}", response_model=PhotoCaptureResponse)
def read_capture(
    photo_capture_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    capture = get_photo_capture_for_user(db, photo_capture_id, current_user["id"])
    if not capture:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo capture not found.")
    return serialize_row(capture)

