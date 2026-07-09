# Async AI Worker Deployment Runbook

이 문서는 AURA 백엔드의 장시간 AI 작업을 AWS 배포 환경에 연결할 때 따라가는 실행 순서다.

핵심은 다음이다.

```text
Mobile App
-> CloudFront / API Gateway or ALB
-> ECS FastAPI API service
-> SQS
-> ECS AI Worker service
-> RDS / S3 / Bedrock / OpenAI

S3 ObjectCreated
-> Media Postprocess Lambda
-> S3 thumbnail / EXIF-free object
```

## 1. Runtime Modes

로컬 개발 기본값은 `inline`이다.

```env
AI_JOB_EXECUTION_MODE=inline
SQS_AI_JOB_QUEUE_URL=
```

이 모드에서는 FastAPI 서버 안에서 얼굴진단 분석을 실행한다. SQS/ECS Worker 없이 모바일 앱 기능을 확인하기 위한 모드다.

배포 운영 모드는 `sqs`다.

```env
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=https://sqs.ap-northeast-2.amazonaws.com/<account-id>/<queue-name>
```

이 모드에서는 FastAPI가 job row를 만들고 SQS 메시지만 발행한다. 얼굴진단 분석과 추천 이미지 생성은 ECS Worker가 처리한다.

## 2. AWS Resources

필수 리소스는 다음이다.

- ECS service: FastAPI API
- ECS service: AI Worker
- SQS queue: AI job queue
- SQS DLQ: failed AI job messages
- RDS PostgreSQL
- S3 media bucket
- Lambda: media postprocess
- CloudWatch log groups
- Secrets Manager values for DB/OpenAI/provider secrets

## 3. ECS FastAPI API Service

API service는 모바일 요청을 받는다.

Command:

```text
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Required env/secrets:

```env
ENVIRONMENT=dev
AUTH_REQUIRED=true
AWS_REGION=ap-northeast-2
AWS_USE_IAM_ROLE=true

DATABASE_URL=...
S3_BUCKET_NAME=...
CLOUDFRONT_DOMAIN=...
CDN_BASE_URL=...

AI_PROVIDER=bedrock
IMAGE_GENERATION_PROVIDER=openai
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=...

OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL_ID=...
OPENAI_IMAGE_MODEL_ID=...
```

API task role permissions:

```text
sqs:SendMessage on AI job queue
s3:PutObject/GetObject/DeleteObject on media bucket paths used by the API
secretsmanager:GetSecretValue for configured secrets
bedrock:InvokeModel when Bedrock analysis/embedding is used
bedrock:InvokeModelWithResponseStream if a selected model path requires it
logs:CreateLogStream / logs:PutLogEvents through the ECS execution role
```

## 4. SQS Queue

Start with one standard queue and one DLQ.

Recommended starting values:

```text
queue type: Standard
visibility timeout: 15 minutes
message retention: 4 days or longer
receive wait time: 20 seconds
max receive count before DLQ: 3
```

Why 15 minutes visibility timeout: a face analysis plus generated recommendation image can take longer than a normal HTTP request. The worker deletes the message only after the handler succeeds.

## 5. ECS AI Worker Service

Worker service reuses the same backend image as FastAPI, but overrides the command.

Command:

```text
python -m app.workers.ai_job_worker
```

The worker is not an HTTP server. Do not attach the API `/health` check to this service.

Required env/secrets are mostly the same as the API service:

```env
ENVIRONMENT=dev
AWS_REGION=ap-northeast-2
AWS_USE_IAM_ROLE=true

DATABASE_URL=...
S3_BUCKET_NAME=...
CLOUDFRONT_DOMAIN=...
CDN_BASE_URL=...

AI_PROVIDER=bedrock
IMAGE_GENERATION_PROVIDER=openai
AI_JOB_EXECUTION_MODE=sqs
SQS_AI_JOB_QUEUE_URL=...

OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL_ID=...
OPENAI_IMAGE_MODEL_ID=...
```

Worker task role permissions:

```text
sqs:ReceiveMessage on AI job queue
sqs:DeleteMessage on AI job queue
sqs:ChangeMessageVisibility on AI job queue
sqs:GetQueueAttributes on AI job queue
s3:GetObject/PutObject on media bucket paths used by source and generated images
secretsmanager:GetSecretValue for configured secrets
bedrock:InvokeModel when Bedrock analysis/embedding is used
logs:CreateLogStream / logs:PutLogEvents through the ECS execution role
```

Start with:

```text
desired count: 1
```

Scale later by queue depth, processing time, OpenAI/Bedrock rate limits, and RDS connection capacity.

## 6. Media Postprocess Lambda

Handler:

```text
app.lambdas.media_postprocess.lambda_handler
```

Trigger:

```text
s3:ObjectCreated:* on uploads/
```

Lambda permissions:

```text
s3:GetObject on media bucket uploads/*
s3:PutObject on media bucket uploads/*
logs:CreateLogGroup
logs:CreateLogStream
logs:PutLogEvents
```

Behavior:

- Skips keys under `/thumbnails/`.
- Skips objects with metadata `aura-postprocessed=true`.
- Rewrites the original object without EXIF.
- Creates `<original-dir>/thumbnails/<name>.jpg`.
- Provides a DB update helper for `media_assets`, but direct DB update should be connected only after the `complete-upload` timing/race strategy is finalized.

## 7. Deployment Order

Recommended order:

1. Deploy/confirm RDS schema.
2. Deploy FastAPI API service with `AI_JOB_EXECUTION_MODE=inline`.
3. Confirm mobile API path through CloudFront/API Gateway or ALB.
4. Create SQS queue and DLQ.
5. Deploy AI Worker ECS service with desired count `1`.
6. Change FastAPI API service to `AI_JOB_EXECUTION_MODE=sqs`.
7. Run an analysis job and watch job status move through `pending -> processing -> completed`.
8. Add S3 ObjectCreated trigger for media postprocess Lambda.
9. Upload an image and confirm thumbnail object creation.

This order keeps the API usable while the queue and worker are being attached.

## 8. Verification

From `services/backend`, run before deployment:

```powershell
python -m pytest tests/test_ai_job_queue.py tests/test_ai_job_worker.py tests/test_media_postprocess_lambda.py -q
python -m pytest tests/test_settings_and_services.py tests/test_setup_status.py -q
python -m pytest tests/test_route_contract.py tests/test_export_openapi.py tests/test_validation_contract.py -q
```

After deployment:

```text
GET /api/health
GET /api/health/config
GET /api/health/db
POST /api/media/presigned-upload
POST /api/media/complete-upload
POST /api/analysis/jobs
GET /api/analysis/jobs/{jobId}
```

CloudWatch checks:

- FastAPI logs show `job:queued`.
- Worker logs show `analysis:received`.
- Worker logs show SQS message deletion only after handler success.
- SQS visible messages return to zero after processing.
- DLQ remains empty during successful smoke tests.
- S3 thumbnail object appears under `/thumbnails/`.

## 9. Rollback

Fast rollback:

```env
AI_JOB_EXECUTION_MODE=inline
```

Redeploy the FastAPI API service with that value. This sends new jobs back through the local FastAPI execution path.

Then:

- Keep worker desired count at `0` if it is causing failures.
- Inspect SQS queue and DLQ before deleting messages.
- Do not delete pending messages unless the related `analysis_reports` rows are already terminal or intentionally abandoned.

## 10. Open Decisions

These are intentionally not locked by this branch:

- Whether `media_assets` thumbnail metadata is updated by Lambda directly, by a retry queue, or by `complete-upload`.
- Whether analysis and image generation should eventually split into separate worker services.
- Autoscaling policy based on SQS queue depth.
- RDS Proxy need if worker count grows.
- Exact DLQ redrive policy and alert threshold.
