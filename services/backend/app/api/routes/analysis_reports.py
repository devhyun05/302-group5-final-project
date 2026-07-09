from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.repositories import (
    create_analysis_report,
    get_analysis_report_for_user,
    get_latest_analysis_report,
    get_photo_capture_for_user,
    list_analysis_reports,
)
from app.db.session import get_db
from app.schemas.analysis_reports import (
    AnalysisReportCreate,
    AnalysisReportResponse,
    serialize_analysis_report,
)
from app.services.analysis_generator import generate_analysis_report


router = APIRouter()


@router.post("", response_model=AnalysisReportResponse)
def create_report(
    payload: AnalysisReportCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    capture = get_photo_capture_for_user(db, payload.photo_capture_id, current_user["id"])
    if not capture:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo capture not found.")

    settings = get_settings()
    generated = generate_analysis_report(
        settings,
        capture,
        force_mock=payload.force_mock,
    )
    generated["photo_capture_id"] = capture["id"]
    generated["source_media_id"] = capture["media_id"]
    generated["preview_media_id"] = capture["media_id"]

    created = create_analysis_report(db, current_user["id"], generated)
    return serialize_analysis_report(created)


@router.get("", response_model=list[AnalysisReportResponse])
def list_reports(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    limit: int = Query(default=20, ge=1, le=100),
) -> list[dict]:
    reports = list_analysis_reports(db, current_user["id"], limit=limit)
    return [serialize_analysis_report(report) for report in reports]


@router.get("/latest", response_model=AnalysisReportResponse | None)
def read_latest_report(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict | None:
    report = get_latest_analysis_report(db, current_user["id"])
    return serialize_analysis_report(report) if report else None


@router.get("/{report_id}", response_model=AnalysisReportResponse)
def read_report(
    report_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    report = get_analysis_report_for_user(db, report_id, current_user["id"])
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis report not found.")
    return serialize_analysis_report(report)
