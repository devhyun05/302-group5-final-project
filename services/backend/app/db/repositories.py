from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.cognito import CognitoPrincipal


def row_to_dict(row: Any | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row._mapping)


def fetch_one(db: Session, statement: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    return row_to_dict(db.execute(text(statement), params or {}).first())


def fetch_all(db: Session, statement: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in db.execute(text(statement), params or {}).all()]


def default_nickname(principal: CognitoPrincipal) -> str:
    if principal.nickname:
        return principal.nickname
    if principal.name:
        return principal.name
    if principal.email and "@" in principal.email:
        return principal.email.split("@", maxsplit=1)[0]
    return "AURA User"


def upsert_user_from_principal(db: Session, principal: CognitoPrincipal) -> dict[str, Any]:
    existing = fetch_one(
        db,
        """
        select *
        from users
        where oauth_sub = :oauth_sub
          and deleted_at is null
        order by created_at asc
        limit 1
        """,
        {"oauth_sub": principal.sub},
    )

    if existing:
        updated = fetch_one(
            db,
            """
            update users
               set email = coalesce(:email, email),
                   name = coalesce(:name, name),
                   nickname = coalesce(nullif(:nickname, ''), nickname),
                   updated_at = now()
             where id = :user_id
             returning *
            """,
            {
                "user_id": existing["id"],
                "email": principal.email,
                "name": principal.name,
                "nickname": principal.nickname,
            },
        )
        db.commit()
        return updated

    created = fetch_one(
        db,
        """
        insert into users (oauth_sub, email, name, nickname)
        values (:oauth_sub, :email, :name, :nickname)
        returning *
        """,
        {
            "oauth_sub": principal.sub,
            "email": principal.email,
            "name": principal.name,
            "nickname": default_nickname(principal),
        },
    )
    db.commit()
    return created


def update_user_profile(db: Session, user_id: UUID, payload: dict[str, Any]) -> dict[str, Any] | None:
    allowed_fields = [
        "nickname",
        "phone",
        "birth_date",
        "gender",
        "interest",
        "personal_color",
        "skin_type",
        "skin_tone",
        "tags",
    ]
    values = {key: payload[key] for key in allowed_fields if key in payload}
    if not values:
        return get_user_by_id(db, user_id)

    assignments = ", ".join(f"{field} = :{field}" for field in values)
    values["user_id"] = user_id
    return fetch_one(
        db,
        f"""
        update users
           set {assignments},
               updated_at = now()
         where id = :user_id
           and deleted_at is null
         returning *
        """,
        values,
    )


def get_user_by_id(db: Session, user_id: UUID) -> dict[str, Any] | None:
    return fetch_one(
        db,
        "select * from users where id = :user_id and deleted_at is null",
        {"user_id": user_id},
    )


def create_media_asset(db: Session, user_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    created = fetch_one(
        db,
        """
        insert into media_assets (
          owner_user_id, media_kind, source, bucket, object_key, cdn_url,
          content_type, byte_size, width, height, checksum_sha256,
          original_filename, is_original, status
        )
        values (
          :owner_user_id, :media_kind, :source, :bucket, :object_key, :cdn_url,
          :content_type, :byte_size, :width, :height, :checksum_sha256,
          :original_filename, :is_original, :status
        )
        returning *
        """,
        {
            "owner_user_id": user_id,
            "media_kind": payload.get("media_kind"),
            "source": payload.get("source"),
            "bucket": payload.get("bucket"),
            "object_key": payload.get("object_key"),
            "cdn_url": payload.get("cdn_url"),
            "content_type": payload.get("content_type"),
            "byte_size": payload.get("byte_size"),
            "width": payload.get("width"),
            "height": payload.get("height"),
            "checksum_sha256": payload.get("checksum_sha256"),
            "original_filename": payload.get("original_filename"),
            "is_original": payload.get("is_original", True),
            "status": payload.get("status", "active"),
        },
    )
    db.commit()
    return created


def get_media_asset_for_user(db: Session, media_asset_id: UUID, user_id: UUID) -> dict[str, Any] | None:
    return fetch_one(
        db,
        """
        select *
        from media_assets
        where id = :media_asset_id
          and owner_user_id = :user_id
          and deleted_at is null
        """,
        {"media_asset_id": media_asset_id, "user_id": user_id},
    )


def complete_media_asset(
    db: Session,
    media_asset_id: UUID,
    user_id: UUID,
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    completed = fetch_one(
        db,
        """
        update media_assets
           set byte_size = coalesce(:byte_size, byte_size),
               width = coalesce(:width, width),
               height = coalesce(:height, height),
               checksum_sha256 = coalesce(:checksum_sha256, checksum_sha256),
               content_type = coalesce(:content_type, content_type),
               status = 'active'
         where id = :media_asset_id
           and owner_user_id = :user_id
           and deleted_at is null
         returning *
        """,
        {
            "media_asset_id": media_asset_id,
            "user_id": user_id,
            "byte_size": payload.get("byte_size"),
            "width": payload.get("width"),
            "height": payload.get("height"),
            "checksum_sha256": payload.get("checksum_sha256"),
            "content_type": payload.get("content_type"),
        },
    )
    db.commit()
    return completed


def create_photo_capture(db: Session, user_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    created = fetch_one(
        db,
        """
        insert into photo_captures (
          user_id, media_id, capture_type, source, status, device_payload
        )
        values (
          :user_id, :media_id, :capture_type, :source, :status, :device_payload
        )
        returning *
        """,
        {
            "user_id": user_id,
            "media_id": payload.get("media_id"),
            "capture_type": payload.get("capture_type", "face_analysis"),
            "source": payload.get("source", "camera"),
            "status": payload.get("status", "completed"),
            "device_payload": Jsonb(payload.get("device_payload") or {}),
        },
    )
    db.commit()
    return created


def get_photo_capture_for_user(db: Session, capture_id: UUID, user_id: UUID) -> dict[str, Any] | None:
    return fetch_one(
        db,
        """
        select pc.*, ma.bucket, ma.object_key, ma.content_type, ma.cdn_url
        from photo_captures pc
        join media_assets ma on ma.id = pc.media_id
        where pc.id = :capture_id
          and pc.user_id = :user_id
        """,
        {"capture_id": capture_id, "user_id": user_id},
    )


def list_analysis_reports(db: Session, user_id: UUID, limit: int = 20) -> list[dict[str, Any]]:
    return fetch_all(
        db,
        """
        select *
        from analysis_reports
        where user_id = :user_id
        order by analyzed_at desc nulls last, created_at desc
        limit :limit
        """,
        {"user_id": user_id, "limit": limit},
    )


def get_latest_analysis_report(db: Session, user_id: UUID) -> dict[str, Any] | None:
    return fetch_one(
        db,
        """
        select *
        from analysis_reports
        where user_id = :user_id
        order by analyzed_at desc nulls last, created_at desc
        limit 1
        """,
        {"user_id": user_id},
    )


def get_analysis_report_for_user(
    db: Session,
    report_id: UUID,
    user_id: UUID,
) -> dict[str, Any] | None:
    return fetch_one(
        db,
        """
        select *
        from analysis_reports
        where id = :report_id
          and user_id = :user_id
        """,
        {"report_id": report_id, "user_id": user_id},
    )


def create_analysis_report(db: Session, user_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    created = fetch_one(
        db,
        """
        insert into analysis_reports (
          user_id, photo_capture_id, source_media_id, preview_media_id,
          status, ai_provider, ai_model, request_id, error_message, analyzed_at,
          title, report_title, environment_label, personal_color, face_shape,
          skin_type, tone_summary, recommended_mood, summary, short_summary,
          skin_analysis_summary, base_makeup_guide, tags, detail_payload
        )
        values (
          :user_id, :photo_capture_id, :source_media_id, :preview_media_id,
          :status, :ai_provider, :ai_model, :request_id, :error_message, now(),
          :title, :report_title, :environment_label, :personal_color, :face_shape,
          :skin_type, :tone_summary, :recommended_mood, :summary, :short_summary,
          :skin_analysis_summary, :base_makeup_guide, :tags, :detail_payload
        )
        returning *
        """,
        {
            "user_id": user_id,
            "photo_capture_id": payload.get("photo_capture_id"),
            "source_media_id": payload.get("source_media_id"),
            "preview_media_id": payload.get("preview_media_id"),
            "status": payload.get("status", "completed"),
            "ai_provider": payload.get("ai_provider"),
            "ai_model": payload.get("ai_model"),
            "request_id": payload.get("request_id"),
            "error_message": payload.get("error_message"),
            "title": payload.get("title"),
            "report_title": payload.get("report_title"),
            "environment_label": payload.get("environment_label"),
            "personal_color": payload.get("personal_color"),
            "face_shape": payload.get("face_shape"),
            "skin_type": payload.get("skin_type"),
            "tone_summary": payload.get("tone_summary"),
            "recommended_mood": payload.get("recommended_mood"),
            "summary": payload.get("summary"),
            "short_summary": payload.get("short_summary"),
            "skin_analysis_summary": payload.get("skin_analysis_summary"),
            "base_makeup_guide": payload.get("base_makeup_guide"),
            "tags": payload.get("tags") or [],
            "detail_payload": Jsonb(payload.get("detail_payload") or {}),
        },
    )
    db.commit()
    return created
