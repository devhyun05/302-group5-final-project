# AURA Backend

FastAPI backend for the current Cognito -> photo capture -> AI analysis report flow.

## Run Locally

```bash
cd services/backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

Required production values:

- `DATABASE_URL`
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `S3_BUCKET` for presigned uploads

## First API Flow

All app APIs except health checks expect:

```text
Authorization: Bearer <Cognito ID token>
```

Recommended first integration order:

1. `GET /health/db`
2. `GET /users/me`
3. `POST /media-assets/presigned-upload`
4. Upload the image to S3 with the returned URL
5. `POST /media-assets/{media_asset_id}/complete`
6. `POST /photo-captures`
7. `POST /analysis-reports`
8. `GET /analysis-reports/latest`

`BEDROCK_ENABLED=false` keeps the flow usable with a deterministic development report.
Set `BEDROCK_ENABLED=true` after Bedrock model access and AWS runtime credentials are ready.

