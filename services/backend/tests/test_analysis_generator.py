from app.core.config import Settings
from app.services.analysis_generator import generate_analysis_report, parse_json_object


def test_parse_json_object_from_wrapped_text():
    payload = parse_json_object('result:\n{"summary": "ok", "tags": ["a"]}\nend')

    assert payload == {"summary": "ok", "tags": ["a"]}


def test_generate_analysis_report_uses_mock_when_bedrock_disabled():
    settings = Settings(database_url="", bedrock_enabled=False)
    photo_capture = {"id": "capture-001", "media_id": "media-001"}

    report = generate_analysis_report(settings, photo_capture)

    assert report["status"] == "completed"
    assert report["ai_provider"] == "mock"
    assert report["title"]
    assert report["detail_payload"]["facePointGuide"]
    assert report["detail_payload"]["recommendedMakeups"]

