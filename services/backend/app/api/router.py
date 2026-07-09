from fastapi import APIRouter

from app.api.routes import analysis_reports, health, media_assets, photo_captures, users


api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(media_assets.router, prefix="/media-assets", tags=["media-assets"])
api_router.include_router(photo_captures.router, prefix="/photo-captures", tags=["photo-captures"])
api_router.include_router(
    analysis_reports.router,
    prefix="/analysis-reports",
    tags=["analysis-reports"],
)

