from pathlib import PurePosixPath
from uuid import uuid4

import boto3
from fastapi import HTTPException, status

from app.core.config import Settings


def extension_for_content_type(content_type: str) -> str:
    mapping = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    return mapping.get(content_type.lower(), "jpg")


def build_capture_object_key(user_id: str, content_type: str) -> str:
    extension = extension_for_content_type(content_type)
    return str(PurePosixPath("users", user_id, "captures", f"{uuid4()}.{extension}"))


def build_cdn_url(settings: Settings, object_key: str) -> str | None:
    if not settings.cloudfront_base_url:
        return None
    return f"{settings.cloudfront_base_url.rstrip('/')}/{object_key}"


def create_presigned_upload_url(settings: Settings, object_key: str, content_type: str) -> str:
    if not settings.s3_bucket:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="S3_BUCKET is not configured.",
        )

    client = boto3.client("s3", region_name=settings.aws_region)
    return client.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": object_key,
            "ContentType": content_type,
        },
        ExpiresIn=settings.presigned_upload_expires_seconds,
    )

