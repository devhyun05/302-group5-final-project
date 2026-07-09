import json
from uuid import UUID

import pytest
from fastapi import BackgroundTasks

from app.api import analysis as analysis_api
from app.core.errors import AppError
from app.core.settings import Settings
from app.schemas.analysis import AnalysisJobCreate
from app.services.ai_job_queue import AIJobQueuePublisher


REPORT_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")
QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/123456789012/aura-ai-jobs"


def test_ai_job_queue_publisher_sends_analysis_job_message(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakeSQSClient:
    def send_message(self, **kwargs):
      calls["send_message"] = kwargs
      return {"MessageId": "msg-123"}

  def fake_boto3_client(service_name: str, **kwargs):
    calls["service_name"] = service_name
    calls["client_kwargs"] = kwargs
    return FakeSQSClient()

  monkeypatch.setattr("app.services.ai_job_queue.boto3.client", fake_boto3_client)

  result = AIJobQueuePublisher(
    Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  ).publish_analysis_job(REPORT_ID, USER_ID)

  send_message = calls["send_message"]
  body = json.loads(send_message["MessageBody"])

  assert calls["service_name"] == "sqs"
  assert calls["client_kwargs"]["region_name"] == "ap-northeast-2"
  assert send_message["QueueUrl"] == QUEUE_URL
  assert body == {
    "version": 1,
    "jobType": "analysis",
    "jobId": str(REPORT_ID),
    "userId": str(USER_ID),
  }
  assert "requestPayload" not in body
  assert send_message["MessageAttributes"]["jobType"]["StringValue"] == "analysis"
  assert send_message["MessageAttributes"]["jobId"]["StringValue"] == str(REPORT_ID)
  assert result["messageId"] == "msg-123"


def test_ai_job_queue_publisher_adds_fifo_options(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakeSQSClient:
    def send_message(self, **kwargs):
      calls["send_message"] = kwargs
      return {"MessageId": "fifo-msg-123"}

  monkeypatch.setattr("app.services.ai_job_queue.boto3.client", lambda *_args, **_kwargs: FakeSQSClient())

  AIJobQueuePublisher(
    Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=f"{QUEUE_URL}.fifo"),
  ).publish_analysis_job(REPORT_ID, USER_ID)

  send_message = calls["send_message"]

  assert send_message["MessageGroupId"] == "analysis"
  assert send_message["MessageDeduplicationId"] == f"analysis:{REPORT_ID}"


def test_ai_job_queue_publisher_requires_queue_url() -> None:
  with pytest.raises(AppError) as exc_info:
    AIJobQueuePublisher(Settings(ai_job_execution_mode="sqs")).publish_analysis_job(REPORT_ID, USER_ID)

  assert exc_info.value.code == "AI_JOB_QUEUE_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_dispatch_analysis_job_inline_adds_background_task() -> None:
  background_tasks = BackgroundTasks()

  await analysis_api.dispatch_analysis_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    payload=AnalysisJobCreate(requestPayload={"source": "test"}),
    settings=Settings(ai_job_execution_mode="inline"),
  )

  assert len(background_tasks.tasks) == 1
  assert background_tasks.tasks[0].func is analysis_api.run_analysis_job_background


@pytest.mark.asyncio
async def test_dispatch_analysis_job_sqs_publishes_without_background_task(monkeypatch: pytest.MonkeyPatch) -> None:
  calls: dict[str, object] = {}

  class FakePublisher:
    def __init__(self, settings: Settings) -> None:
      calls["settings"] = settings

    def publish_analysis_job(self, report_id: UUID, user_id: UUID):
      calls["report_id"] = report_id
      calls["user_id"] = user_id
      return {"messageId": "msg-123"}

  monkeypatch.setattr(analysis_api, "AIJobQueuePublisher", FakePublisher)
  background_tasks = BackgroundTasks()

  await analysis_api.dispatch_analysis_job(
    db=object(),
    background_tasks=background_tasks,
    report_id=REPORT_ID,
    user_id=USER_ID,
    payload=AnalysisJobCreate(requestPayload={"source": "test"}),
    settings=Settings(ai_job_execution_mode="sqs", sqs_ai_job_queue_url=QUEUE_URL),
  )

  assert len(background_tasks.tasks) == 0
  assert calls["report_id"] == REPORT_ID
  assert calls["user_id"] == USER_ID


@pytest.mark.asyncio
async def test_dispatch_analysis_job_sqs_failure_marks_report_failed(monkeypatch: pytest.MonkeyPatch) -> None:
  class FakeDB:
    def __init__(self) -> None:
      self.executed = []

    async def execute(self, *args):
      self.executed.append(args)
      return "UPDATE 1"

  class FakePublisher:
    def __init__(self, _settings: Settings) -> None:
      pass

    def publish_analysis_job(self, _report_id: UUID, _user_id: UUID):
      raise AppError(503, "AI_JOB_QUEUE_NOT_CONFIGURED", "Queue missing.")

  monkeypatch.setattr(analysis_api, "AIJobQueuePublisher", FakePublisher)
  fake_db = FakeDB()

  with pytest.raises(AppError) as exc_info:
    await analysis_api.dispatch_analysis_job(
      db=fake_db,
      background_tasks=BackgroundTasks(),
      report_id=REPORT_ID,
      user_id=USER_ID,
      payload=AnalysisJobCreate(requestPayload={"source": "test"}),
      settings=Settings(ai_job_execution_mode="sqs"),
    )

  assert exc_info.value.code == "AI_JOB_QUEUE_NOT_CONFIGURED"
  assert fake_db.executed
  assert "update analysis_reports" in fake_db.executed[0][0]
