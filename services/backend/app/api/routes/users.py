from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.repositories import update_user_profile
from app.db.session import get_db
from app.schemas.base import serialize_row
from app.schemas.users import UserProfileUpdate, UserResponse


router = APIRouter()


@router.get("/me", response_model=UserResponse)
def read_me(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    return serialize_row(current_user)


@router.post("/me/sync", response_model=UserResponse)
def sync_me(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    return serialize_row(current_user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: UserProfileUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    updated = update_user_profile(
        db,
        current_user["id"],
        payload.model_dump(exclude_unset=True),
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    db.commit()
    return serialize_row(updated)

