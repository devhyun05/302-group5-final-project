import json
import re
from typing import Any
from uuid import UUID

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import Settings


DEFAULT_FACE_POINT_GUIDE = {
    "brow": "눈썹은 결을 살린 소프트 아치로 정리하면 인상이 부드러워 보여요.",
    "blush": "볼 중앙보다 살짝 바깥쪽에 맑은 컬러를 얇게 연결해 주세요.",
    "highlight": "T존과 눈밑 삼각존에 은은한 광만 더해 입체감을 살려요.",
    "eyeshadow": "베이지 톤을 넓게 깔고 음영은 얇게 쌓는 편이 좋아요.",
    "eyeliner": "블랙보다 브라운 라인으로 점막을 가볍게 채워주세요.",
    "lip": "채도를 과하게 올리기보다 MLBB 계열로 얼굴 전체 균형을 맞춰요.",
}


def build_mock_report(photo_capture: dict[str, Any], model_id: str) -> dict[str, Any]:
    capture_id = str(photo_capture["id"])
    return {
        "status": "completed",
        "ai_provider": "mock",
        "ai_model": model_id,
        "request_id": None,
        "error_message": None,
        "title": "봄웜 라이트, 건성 피부",
        "report_title": "맞춤 분석 보고서",
        "environment_label": "촬영 이미지 기반",
        "personal_color": "봄웜 라이트",
        "face_shape": "부드러운 오벌형",
        "skin_type": "건성 피부",
        "tone_summary": "밝고 맑은 아이보리 톤",
        "recommended_mood": "맑은 코랄 글로우",
        "summary": "코랄 윤광 조합이 가장 안정적으로 어울려요.",
        "short_summary": "맑은 코랄과 얇은 윤광 베이스를 추천해요.",
        "skin_analysis_summary": (
            "현재 촬영 이미지 기준으로는 밝은 피부 톤과 건조해 보이는 피부 결을 고려해 "
            "촉촉한 베이스와 맑은 코랄 포인트가 안정적입니다."
        ),
        "base_makeup_guide": (
            "두꺼운 매트 베이스보다 촉촉한 쿠션을 얇게 올리고, 광은 볼 중심으로 살려주세요."
        ),
        "tags": ["봄웜", "코랄", "윤광"],
        "detail_payload": {
            "photoCaptureId": capture_id,
            "consultants": {
                "personalColorConsultant": {
                    "opinion": "노란 기가 강한 브라운보다 맑은 코랄과 피치 계열이 더 안정적입니다.",
                    "recommendedColors": ["clear coral", "peach pink", "warm ivory"],
                },
                "makeupArtist": {
                    "opinion": "베이스는 얇고 촉촉하게, 립과 블러셔는 같은 계열로 연결하는 편이 좋아요.",
                    "lip": "코랄 MLBB 또는 맑은 피치 글로스",
                    "eye": "라이트 베이지와 소프트 브라운",
                    "blush": "피치 코랄을 넓고 얇게",
                },
                "imageConsultant": {
                    "opinion": "전체 이미지는 깨끗하고 부드러운 데일리 무드가 잘 맞습니다.",
                    "styleKeywords": ["clean", "soft", "glow"],
                },
            },
            "facePointGuide": DEFAULT_FACE_POINT_GUIDE,
            "recommendedMakeups": [
                {
                    "id": f"{capture_id}-clear-gloss",
                    "title": "클리어 & 글로시",
                    "subtitle": "맑은 윤광",
                    "description": "얇은 윤광 베이스와 투명한 립 표현으로 얼굴을 맑게 보여줘요.",
                    "tags": ["윤광", "맑은 립"],
                },
                {
                    "id": f"{capture_id}-fruity-juice",
                    "title": "과즙상",
                    "subtitle": "생기 포인트",
                    "description": "볼과 입술에 같은 계열 색을 낮게 얹어 자연스러운 생기를 더해요.",
                    "tags": ["생기", "톤온톤"],
                },
            ],
            "avoidedMakeups": [
                {
                    "id": f"{capture_id}-avoid-smoky",
                    "title": "너무 진한 스모키",
                    "subtitle": "무거운 음영",
                    "description": "넓은 블랙 음영은 피부 톤을 답답하게 보이게 할 수 있어요.",
                    "tags": ["진한 음영", "매트"],
                },
                {
                    "id": f"{capture_id}-avoid-contour",
                    "title": "과한 컨투어링",
                    "subtitle": "강한 윤곽",
                    "description": "진한 음영 경계는 얼굴의 맑은 분위기를 약하게 만들 수 있어요.",
                    "tags": ["강한 쉐딩", "경계감"],
                },
            ],
            "safetyNotice": "이 결과는 미용 목적의 스타일 추천이며 의료적 피부 진단이 아닙니다.",
        },
    }


def build_analysis_prompt() -> str:
    return """
너는 모바일 AI 메이크업/AR 필터 서비스의 분석 엔진이다.
얼굴 이미지를 바탕으로 미용 목적의 퍼스널 컬러, 피부 표현 방향, 추천/비추천 메이크업을 분석한다.

주의:
- 의료 진단, 외모 점수화, 민감한 속성 추정은 하지 않는다.
- 사진에서 확실하지 않은 내용은 단정하지 않는다.
- JSON 외의 설명 문장을 출력하지 않는다.
- 모든 key를 반드시 포함한다.

반드시 아래 JSON 구조로만 응답한다:
{
  "title": "string",
  "report_title": "string",
  "environment_label": "string",
  "personal_color": "string",
  "face_shape": "string",
  "skin_type": "string",
  "tone_summary": "string",
  "recommended_mood": "string",
  "summary": "string",
  "short_summary": "string",
  "skin_analysis_summary": "string",
  "base_makeup_guide": "string",
  "tags": ["string"],
  "detail_payload": {
    "consultants": {
      "personalColorConsultant": {
        "opinion": "string",
        "recommendedColors": ["string"]
      },
      "makeupArtist": {
        "opinion": "string",
        "lip": "string",
        "eye": "string",
        "blush": "string"
      },
      "imageConsultant": {
        "opinion": "string",
        "styleKeywords": ["string"]
      }
    },
    "facePointGuide": {
      "brow": "string",
      "blush": "string",
      "highlight": "string",
      "eyeshadow": "string",
      "eyeliner": "string",
      "lip": "string"
    },
    "recommendedMakeups": [
      {
        "id": "string",
        "title": "string",
        "subtitle": "string",
        "description": "string",
        "tags": ["string"]
      }
    ],
    "avoidedMakeups": [
      {
        "id": "string",
        "title": "string",
        "subtitle": "string",
        "description": "string",
        "tags": ["string"]
      }
    ],
    "safetyNotice": "string"
  }
}
""".strip()


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def normalized_report_payload(payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    result = {**fallback, **payload}
    detail_payload = {
        **fallback.get("detail_payload", {}),
        **(payload.get("detail_payload") or {}),
    }
    detail_payload.setdefault("facePointGuide", DEFAULT_FACE_POINT_GUIDE)
    detail_payload.setdefault("recommendedMakeups", [])
    detail_payload.setdefault("avoidedMakeups", [])
    result["detail_payload"] = detail_payload
    result["tags"] = result.get("tags") or fallback.get("tags") or []
    return result


def s3_image_bytes(settings: Settings, bucket: str, object_key: str) -> tuple[bytes, str] | None:
    client = boto3.client("s3", region_name=settings.aws_region)
    response = client.get_object(Bucket=bucket, Key=object_key)
    content_type = response.get("ContentType", "image/jpeg")
    image_format = {
        "image/jpeg": "jpeg",
        "image/jpg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
    }.get(content_type.lower())
    if image_format is None:
        return None
    return response["Body"].read(), image_format


def generate_bedrock_report(settings: Settings, photo_capture: dict[str, Any]) -> dict[str, Any]:
    client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
    content: list[dict[str, Any]] = [{"text": build_analysis_prompt()}]

    if settings.bedrock_include_image and photo_capture.get("bucket") and photo_capture.get("object_key"):
        image = s3_image_bytes(settings, photo_capture["bucket"], photo_capture["object_key"])
        if image:
            image_bytes, image_format = image
            content.insert(
                0,
                {
                    "image": {
                        "format": image_format,
                        "source": {"bytes": image_bytes},
                    }
                },
            )

    response = client.converse(
        modelId=settings.bedrock_model_id,
        messages=[{"role": "user", "content": content}],
        inferenceConfig={
            "maxTokens": settings.bedrock_max_tokens,
            "temperature": settings.bedrock_temperature,
        },
    )
    text_parts = [
        item.get("text", "")
        for item in response.get("output", {}).get("message", {}).get("content", [])
        if item.get("text")
    ]
    payload = parse_json_object("\n".join(text_parts))
    payload["ai_provider"] = "bedrock"
    payload["ai_model"] = settings.bedrock_model_id
    payload["request_id"] = response.get("ResponseMetadata", {}).get("RequestId")
    payload["status"] = "completed"
    payload["error_message"] = None
    return payload


def generate_analysis_report(
    settings: Settings,
    photo_capture: dict[str, Any],
    force_mock: bool = False,
) -> dict[str, Any]:
    fallback = build_mock_report(photo_capture, settings.bedrock_model_id)
    if force_mock or not settings.bedrock_enabled:
        return fallback

    try:
        bedrock_payload = generate_bedrock_report(settings, photo_capture)
        return normalized_report_payload(bedrock_payload, fallback)
    except (BotoCoreError, ClientError, json.JSONDecodeError, KeyError, ValueError) as exc:
        if not settings.bedrock_fallback_to_mock:
            raise
        fallback["status"] = "completed"
        fallback["detail_payload"]["bedrockFallbackReason"] = str(exc)
        return fallback

