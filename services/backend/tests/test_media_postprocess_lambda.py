import io

import pytest
from PIL import Image

from app.lambdas.media_postprocess import (
  AURA_POSTPROCESSED_METADATA_KEY,
  S3ObjectRef,
  handle_s3_event,
  iter_s3_object_created_records,
  process_image_bytes,
  process_s3_object,
  should_process_object_key,
  thumbnail_key_for,
  update_media_asset_postprocess_metadata,
)


def _jpeg_with_exif(width: int = 1200, height: int = 800) -> bytes:
  image = Image.new("RGB", (width, height), color=(240, 120, 80))
  exif = Image.Exif()
  exif[0x010F] = "AURA test camera"
  output = io.BytesIO()
  image.save(output, format="JPEG", exif=exif)
  return output.getvalue()


def test_iter_s3_object_created_records_decodes_s3_keys() -> None:
  event = {
    "Records": [
      {
        "eventSource": "aws:s3",
        "s3": {
          "bucket": {"name": "aura-dev-bucket"},
          "object": {"key": "uploads/capture/face+one%20two.jpg"},
        },
      },
      {"eventSource": "aws:sqs"},
    ],
  }

  refs = iter_s3_object_created_records(event)

  assert refs == [
    S3ObjectRef(
      bucket="aura-dev-bucket",
      object_key="uploads/capture/face one two.jpg",
    ),
  ]


def test_should_process_object_key_skips_thumbnails_and_non_images() -> None:
  assert should_process_object_key("uploads/capture/photo.jpg") is True
  assert should_process_object_key("uploads/capture/photo.webp") is True
  assert should_process_object_key("uploads/capture/thumbnails/photo.jpg") is False
  assert should_process_object_key("uploads/capture/readme.txt") is False


def test_thumbnail_key_for_preserves_directory() -> None:
  assert thumbnail_key_for("uploads/capture/photo.jpg") == "uploads/capture/thumbnails/photo.jpg"
  assert thumbnail_key_for("photo.png") == "thumbnails/photo.jpg"


def test_process_image_bytes_removes_exif_and_creates_thumbnail() -> None:
  processed = process_image_bytes(_jpeg_with_exif())

  sanitized = Image.open(io.BytesIO(processed.body))
  thumbnail = Image.open(io.BytesIO(processed.thumbnail_body))

  assert processed.content_type == "image/jpeg"
  assert processed.width == 1200
  assert processed.height == 800
  assert processed.exif_removed is True
  assert not sanitized.getexif()
  assert max(thumbnail.size) <= 512
  assert processed.thumbnail_content_type == "image/jpeg"


class FakeBody:
  def __init__(self, body: bytes) -> None:
    self.body = body

  def read(self) -> bytes:
    return self.body


class FakeS3Client:
  def __init__(
    self,
    *,
    body: bytes | None = None,
    content_type: str = "image/jpeg",
    metadata: dict | None = None,
  ) -> None:
    self.body = body or _jpeg_with_exif()
    self.content_type = content_type
    self.metadata = metadata or {}
    self.puts: list[dict] = []

  def get_object(self, **kwargs):
    self.get_object_kwargs = kwargs
    return {
      "Body": FakeBody(self.body),
      "ContentType": self.content_type,
      "Metadata": self.metadata,
    }

  def put_object(self, **kwargs):
    self.puts.append(kwargs)
    return {}


def test_process_s3_object_overwrites_original_and_writes_thumbnail() -> None:
  s3_client = FakeS3Client(metadata={"existing": "value"})

  result = process_s3_object(
    s3_client,
    S3ObjectRef("aura-dev-bucket", "uploads/capture/photo.jpg"),
  )

  assert result is not None
  assert s3_client.get_object_kwargs == {
    "Bucket": "aura-dev-bucket",
    "Key": "uploads/capture/photo.jpg",
  }
  assert len(s3_client.puts) == 2
  assert s3_client.puts[0]["Key"] == "uploads/capture/photo.jpg"
  assert s3_client.puts[0]["ContentType"] == "image/jpeg"
  assert s3_client.puts[0]["Metadata"]["existing"] == "value"
  assert s3_client.puts[0]["Metadata"][AURA_POSTPROCESSED_METADATA_KEY] == "true"
  assert s3_client.puts[1]["Key"] == "uploads/capture/thumbnails/photo.jpg"
  assert result.thumbnail_object_key == "uploads/capture/thumbnails/photo.jpg"
  assert result.width == 1200
  assert result.height == 800


def test_process_s3_object_skips_already_processed_object() -> None:
  s3_client = FakeS3Client(metadata={AURA_POSTPROCESSED_METADATA_KEY: "true"})

  result = process_s3_object(
    s3_client,
    S3ObjectRef("aura-dev-bucket", "uploads/capture/photo.jpg"),
  )

  assert result is None
  assert s3_client.puts == []


def test_handle_s3_event_returns_processed_results() -> None:
  event = {
    "Records": [
      {
        "eventSource": "aws:s3",
        "s3": {
          "bucket": {"name": "aura-dev-bucket"},
          "object": {"key": "uploads/capture/photo.jpg"},
        },
      },
    ],
  }

  results = handle_s3_event(event, s3_client=FakeS3Client())

  assert len(results) == 1
  assert results[0].object_key == "uploads/capture/photo.jpg"


class FakeDB:
  def __init__(self, row: dict | None = None) -> None:
    self.row = row or {"id": "media-id"}
    self.calls: list[tuple] = []

  async def fetchrow(self, query: str, *args):
    self.calls.append((query, *args))
    return self.row


@pytest.mark.asyncio
async def test_update_media_asset_postprocess_metadata_updates_thumbnail_fields() -> None:
  result = process_s3_object(
    FakeS3Client(),
    S3ObjectRef("aura-dev-bucket", "uploads/capture/photo.jpg"),
  )
  db = FakeDB()

  updated = await update_media_asset_postprocess_metadata(
    db,
    result,
    cdn_base_url="https://cdn.example.com",
  )

  call = db.calls[0]

  assert updated is True
  assert "update media_assets" in call[0]
  assert call[1] == "aura-dev-bucket"
  assert call[2] == "uploads/capture/photo.jpg"
  assert call[8] == "uploads/capture/thumbnails/photo.jpg"
  assert call[9] == "https://cdn.example.com/uploads/capture/thumbnails/photo.jpg"
