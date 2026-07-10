# AWS Dev API Load Test - 2026-07-10

## Scope

- Region: `ap-northeast-2`
- API: API Gateway -> internal ALB -> one FastAPI ECS task
- Database: RDS PostgreSQL
- Population models: 200, 500, and 1,000 registered users
- Peak active concurrency: 10% (20, 50, and 100 concurrent requests)
- Spike concurrency: 200, 500, and 1,000 simultaneous requests
- AI calls, uploads, and writes were excluded to avoid provider cost and production-like data creation.
- A temporary Cognito user was used for authenticated reads and was deleted from Cognito and RDS after the test.

## Acceptance Criteria

- HTTP success rate: 99% or higher
- No API Gateway or target 5xx responses
- No request timeout in the population model
- ECS and RDS remain available after every stage
- SQS AI queue remains empty

## Authenticated User-Path Results

Endpoint: `GET /api/analysis/reports`

Each request included API Gateway JWT validation, FastAPI authentication, a user lookup, an analysis report query, and response serialization.

| Population | Concurrency | Requests | Success | Client p95 | Client p99 | RPS |
|---:|---:|---:|---:|---:|---:|---:|
| 200 | 20 | 1,000 | 100% | 398 ms | 714 ms | 159 |
| 500 | 50 | 2,500 | 100% | 592 ms | 1,129 ms | 195 |
| 1,000 | 100 | 5,000 | 100% | 1,580 ms | 3,269 ms | 166 |

CloudWatch during the authenticated stages:

- API Gateway 4xx: 0
- API Gateway 5xx: 0
- API Gateway p95: 317 ms at the lower stages and 665 ms during the 1,000-user stage
- API Gateway p99: up to 1,030 ms
- FastAPI ECS CPU maximum: 88.6%
- FastAPI ECS memory maximum: 10.7%
- RDS CPU maximum: 10.5%
- RDS connections: 8

## Lightweight Public-Path Results

Endpoint: `GET /health`

All 8,500 population-model requests and all 1,700 spike requests succeeded. The 1,000 simultaneous-request spike produced no API Gateway 5xx response. API Gateway measured p95 at 269 ms for that spike.

Large client-side spike latency was dominated by opening hundreds of TCP/TLS connections from one Windows load generator. CloudWatch server latency is therefore the authoritative server-side value for those spike stages.

## Database Health-Path Results

Endpoint: internal-only `GET /health/db`, called from a one-off ECS task inside the VPC.

- Population model: 1,700/1,700 succeeded
- Spike model: 1,700/1,700 succeeded
- Target 5xx: 0
- Internal ALB p95: 33 ms during the population stages and 728 ms during the simultaneous spikes
- RDS CPU: approximately 3-4%
- RDS connections: 8

The FastAPI connection pool limited database concurrency and prevented an RDS connection spike. Queueing increased end-to-end latency during 500 and 1,000 simultaneous requests, but RDS remained well below resource limits.

## Decision

- 200 users: pass with comfortable headroom.
- 500 users: pass with acceptable reliability and latency.
- 1,000 users: reliability pass, capacity warning.

One FastAPI task reached 88.6% CPU during the authenticated 1,000-user model. Before treating 1,000 users as a production target, configure FastAPI ECS Auto Scaling with a minimum of one task and a maximum of at least two tasks. A CPU target near 50-60% is an appropriate starting point, followed by another authenticated load test.

Worker capacity is a separate concern. This test did not invoke OpenAI or Bedrock and therefore does not establish AI job completion time. The SQS/ECS Worker failure handling and scaling mechanisms were validated separately.

## Reproduction

The bounded HTTP load generator is `scripts/load_test_http.py`.

```powershell
.\services\backend\.venv\Scripts\python.exe scripts\load_test_http.py `
  --url https://example.execute-api.ap-northeast-2.amazonaws.com/health `
  --requests 1000 `
  --concurrency 20 `
  --output .codex-build/load-tests/users-200.json
```

For authenticated paths, place the token in an environment variable and pass only its variable name:

```powershell
$env:AURA_LOAD_TEST_TOKEN = '<temporary-id-token>'
.\services\backend\.venv\Scripts\python.exe scripts\load_test_http.py `
  --url https://example.execute-api.ap-northeast-2.amazonaws.com/api/analysis/reports `
  --requests 1000 `
  --concurrency 20 `
  --bearer-token-env AURA_LOAD_TEST_TOKEN
Remove-Item Env:AURA_LOAD_TEST_TOKEN
```
