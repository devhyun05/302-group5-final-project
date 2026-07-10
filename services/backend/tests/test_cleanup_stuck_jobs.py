import json
from datetime import datetime, timezone

import pytest

from app.ops.cleanup_stuck_jobs import (
  ERROR_CODE,
  cleanup_stuck_jobs,
  find_stuck_jobs,
  parse_args,
)


class FakeDB:
  def __init__(self) -> None:
    self.calls: list[tuple[str, tuple[object, ...]]] = []

  async def fetch(self, query: str, *args: object) -> list[dict[str, str]]:
    normalized = " ".join(query.split())
    self.calls.append((normalized, args))
    if "analysis_reports" in query:
      return [{"id": "analysis-1"}]
    if "makeup_feedback_reports" in query:
      return [{"id": "feedback-1"}]
    return [{"id": "filter-1"}]


@pytest.mark.asyncio
async def test_find_stuck_jobs_only_reads_old_processing_reports() -> None:
  db = FakeDB()
  cutoff = datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc)

  result = await find_stuck_jobs(db, cutoff=cutoff)

  assert result.total == 3
  assert all("status = 'processing'" in query for query, _ in db.calls)
  assert "updated_at < $1" in db.calls[0][0]
  assert "created_at < $1" in db.calls[1][0]
  assert "created_at < $1" in db.calls[2][0]
  assert all(args == (cutoff,) for _, args in db.calls)
  assert all(not query.startswith("update") for query, _ in db.calls)


@pytest.mark.asyncio
async def test_cleanup_is_conditional_and_preserves_existing_payload() -> None:
  db = FakeDB()
  cutoff = datetime(2026, 7, 10, 1, 0, tzinfo=timezone.utc)

  result = await cleanup_stuck_jobs(db, cutoff=cutoff)

  assert result.analysis_report_ids == ("analysis-1",)
  assert result.feedback_report_ids == ("feedback-1",)
  assert result.filter_extraction_report_ids == ("filter-1",)
  assert all(query.startswith("update") for query, _ in db.calls)
  assert all("where status = 'processing'" in query for query, _ in db.calls)
  assert all("coalesce(" in query and "- 'error'" in query for query, _ in db.calls)
  assert all("returning id" in query for query, _ in db.calls)
  assert all(args[0] == cutoff for _, args in db.calls)
  assert all(json.loads(str(args[2]))["code"] == ERROR_CODE for _, args in db.calls)


def test_parse_args_uses_two_hour_default_and_supports_dry_run() -> None:
  defaults = parse_args([])
  custom = parse_args(["--timeout-minutes", "180", "--dry-run"])

  assert defaults.timeout_minutes == 120
  assert defaults.dry_run is False
  assert custom.timeout_minutes == 180
  assert custom.dry_run is True


def test_parse_args_rejects_non_positive_timeout() -> None:
  with pytest.raises(SystemExit):
    parse_args(["--timeout-minutes", "0"])
