# API Gateway 보안 및 트래픽 정책

최종 업데이트: 2026-07-09

## 문서 목적

이 문서는 Aura 백엔드 dev 배포 환경의 API Gateway 보안 설정과 트래픽 제한 기준을 정리한다. 배포 검토, 팀 인수인계, 추후 운영 튜닝 시 기준 문서로 사용한다.

## 현재 아키텍처

외부 클라이언트는 백엔드에 직접 접근하지 않고 API Gateway를 통해서만 진입한다.

```text
Mobile app / client
-> API Gateway HTTP API
-> VPC Link
-> internal ALB
-> ECS Fargate service
-> FastAPI backend
```

현재 dev API 정보:

```text
API name: aura-api
API ID: zk4m2qahai
Stage: $default
Base URL: https://zk4m2qahai.execute-api.ap-northeast-2.amazonaws.com
```

기존 public ALB 경로는 클라이언트에서 사용하지 않는다. 설정 과정에서 public ALB 직접 접근은 timeout으로 확인했고, API Gateway `/health`는 `200` 응답을 확인했다.

## 인증 정책

API Gateway는 Cognito JWT Authorizer를 사용한다.

```text
Issuer: https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_qmib9SDyS
Audience: Cognito app client ID for aura-mobile
Identity source: $request.header.Authorization
```

라우트 정책:

```text
GET /health       public health check
ANY /{proxy+}     Cognito JWT required
```

route별 throttling을 위해 API Gateway에 더 구체적인 route를 추가할 수 있다. 의도적으로 public route로 두는 경우가 아니라면, 추가 route에도 동일한 Cognito Authorizer를 연결해야 한다.

기대 동작:

```text
GET /health without token         -> 200
Protected route without token     -> 401
Protected route with access_token -> backend response, path가 없으면 404
```

클라이언트는 요청에 다음 헤더를 포함해야 한다.

```http
Authorization: Bearer <Cognito access_token>
```

주의:

- `refresh_token`을 API Gateway에 보내지 않는다.
- 토큰 응답 JSON 전체를 보내지 않는다.
- `access_token`과 `refresh_token`을 함께 붙여 보내지 않는다.
- Bearer 뒤에는 Cognito `access_token` 하나만 들어가야 한다.

## CORS 정책

현재 dev CORS 설정:

```text
Allowed origins: *
Allowed methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Allowed headers: authorization, content-type
Allow credentials: false
Max age: 300 seconds
```

설정 근거:

- React Native 앱은 브라우저 웹 앱과 달리 CORS 제약을 동일하게 받지 않는다.
- 브라우저 기반 테스트와 향후 admin/web 클라이언트를 고려해 CORS를 설정한다.
- credentials를 사용하지 않기 때문에 dev 환경에서는 wildcard origin을 사용할 수 있다.

운영 전에는 `*` 대신 실제 허용 도메인으로 제한한다.

```text
https://admin.example.com
https://app.example.com
```

## Access Logging

`$default` stage에 API Gateway access logging을 활성화했다.

```text
Log group: /aws/apigateway/aura-api
Retention: dev 환경에서는 1개월 권장
```

로그 포맷:

```json
{"requestId":"$context.requestId","ip":"$context.identity.sourceIp","requestTime":"$context.requestTime","httpMethod":"$context.httpMethod","routeKey":"$context.routeKey","status":"$context.status","responseLatency":"$context.responseLatency","integrationStatus":"$context.integrationStatus","integrationLatency":"$context.integrationLatency","error":"$context.error.message"}
```

이 로그로 다음 항목을 확인한다.

```text
401 인증 실패
429 throttling 발생
5xx integration 실패
responseLatency / integrationLatency
routeKey별 트래픽 분포
```

## 기본 Throttling

route별 custom 설정이 없는 route는 기본 throttling을 따른다.

```text
Default rate: 200 requests/second
Default burst: 400 requests
```

설정 근거:

- 사용자 1,000명 규모의 초기 운영/베타 트래픽을 가정한 전체 보호선이다.
- 새로 추가되었지만 route별 제한을 아직 설정하지 않은 API가 무제한으로 열리지 않게 한다.
- 비용이 큰 생성 API는 별도 route 설정으로 더 낮게 제한한다.

중요: API Gateway throttling은 route/stage 단위 제한에 가깝다. 사용자별 정확한 quota가 아니다. 예를 들어 "사용자별 하루 리포트 3개" 같은 정책은 FastAPI/DB에서 Cognito user id 기준으로 구현해야 한다.

## Route별 Throttling

현재 dev 백엔드는 `api_prefix = "/api"`를 사용한다. 따라서 API Gateway route key에도 `/api` prefix를 포함한다.

| Route | Rate | Burst | 설정 근거 |
| --- | ---: | ---: | --- |
| `POST /api/media/presigned-upload` | 100 | 200 | S3 업로드 URL 발급 API다. 실제 이미지 업로드는 S3로 직접 가므로 API Gateway에서는 URL 발급 트래픽만 보호한다. 사용자 1,000명 기준 사진 촬영/재시도/동시 업로드 준비를 고려해 생성 API보다 높게 둔다. |
| `POST /api/media/complete-upload` | 100 | 200 | 업로드 완료 메타데이터를 DB에 저장한다. 이미지 처리 자체는 아니지만 DB write API이므로 기본 route보다 낮고 생성 API보다 높게 둔다. |
| `POST /api/photo-captures` | 100 | 200 | 촬영 메타데이터 생성 API다. 업로드 완료 후 이어지는 정상 흐름을 막지 않도록 업로드 계열과 같은 수준으로 둔다. |
| `POST /api/analysis/jobs` | 20 | 50 | AI 분석/보고서 생성을 시작한다. 사용자 1,000명 중 일부가 동시에 분석을 시작하는 상황을 허용하되, 비정상 폭주와 중복 job 생성을 막기 위해 조회/업로드보다 낮게 둔다. |
| `POST /api/feedback/jobs` | 10 | 30 | AI 피드백 작업을 시작한다. 분석 job보다 더 보수적으로 시작하고, 실제 사용량과 worker 처리량을 보고 조정한다. |
| `POST /api/filter-extractions/jobs` | 10 | 30 | 필터 추출 job 생성 API다. 이미지/AI 처리 경로 보호를 위해 분석 조회보다 낮게 둔다. |
| `POST /api/filter-extractions/analyze` | 10 | 30 | 즉시 분석 성격의 API다. 비용이 큰 처리로 이어질 수 있어 feedback/filter 생성 계열과 같은 수준으로 제한한다. |
| `GET /api/analysis/jobs/{job_id}` | 200 | 400 | job 상태 조회 API다. 화면 polling과 새로고침이 발생할 수 있으므로 생성 API보다 높게 둔다. |
| `GET /api/analysis/reports` | 200 | 400 | 분석 리포트 목록 조회 API다. 화면 진입과 새로고침을 고려해 조회 API는 넉넉하게 둔다. |
| `GET /api/analysis/reports/{report_id}` | 200 | 400 | 분석 리포트 상세 조회 API다. 일반적인 화면 이동을 허용한다. |
| `GET /api/feedback/reports` | 200 | 400 | 피드백 리포트 목록 조회 API다. 조회 API 기준으로 설정한다. |
| `GET /api/feedback/reports/{report_id}` | 200 | 400 | 피드백 리포트 상세 조회 API다. 조회 API 기준으로 설정한다. |
| `GET /api/filter-extractions/{report_id}` | 200 | 400 | 필터 추출 결과 조회 API다. 조회 API 기준으로 설정한다. |

### 생성 API를 전체 기준으로 너무 낮게 두지 않는 이유

API Gateway route throttling은 사용자별 제한이 아니라 stage/route 전체에 가까운 제한이다. 따라서 사용자 1,000명 기준 운영을 고려하면 `POST /api/analysis/jobs`를 `Rate 1 / Burst 3`처럼 낮게 두는 것은 적절하지 않다.

예를 들어 서로 다른 사용자 10명이 거의 동시에 분석을 시작해도 API Gateway는 이를 "같은 route로 들어온 총 10개 요청"으로 합산한다. 사용자별 공정한 제한은 API Gateway가 아니라 FastAPI/DB/Redis에서 처리해야 한다.

현재 값은 다음 기준의 운영 초안이다.

```text
Default route: Rate 200 / Burst 400
업로드 준비/완료: Rate 100 / Burst 200
AI 분석 생성: Rate 20 / Burst 50
피드백/필터 생성: Rate 10 / Burst 30
조회 API: Rate 200 / Burst 400
```

운영 중 CloudWatch에서 정상 사용자의 `429`가 자주 보이면 API Gateway 값을 올린다. 반대로 worker backlog, AI provider rate limit, 비용 증가가 보이면 사용자별 quota와 worker concurrency를 먼저 조정하고, 필요한 경우 API Gateway 값도 낮춘다.

## Worker 및 백엔드 제한과의 역할 차이

API Gateway throttling은 백엔드/worker 제한을 대체하지 않는다.

권장 역할 분리:

```text
API Gateway
- 외부 요청 입구 제한
- 과도한 요청을 FastAPI 전에 차단

FastAPI / DB
- 사용자별 quota
- 중복 job 생성 방지
- job 생성 API idempotency key 처리

ECS worker
- 실제 job 동시 처리 수 제한
- AI provider별 retry/backoff
- queue depth 모니터링
```

AI, 이미지, 보고서 생성 기능은 세 레이어를 함께 둔다. API Gateway는 요청 폭주를 막고, 백엔드는 제품 정책을 적용하며, worker는 실제 모델 호출과 처리 동시성을 제어한다.

## FastAPI 사용자별 제한 구현 방향

API Gateway 제한은 전체 route 기준이므로, 비용이 큰 생성 API에는 FastAPI에서 사용자별 제한을 추가한다.

권장 정책 예시:

```text
POST /api/analysis/jobs
- 사용자별 10초에 1회
- 사용자별 하루 10회
- 동일 photoCaptureId 또는 sourceMediaId로 중복 pending/processing job 생성 방지

POST /api/feedback/jobs
- 사용자별 10초에 1회
- 사용자별 하루 10회

POST /api/filter-extractions/analyze
- 사용자별 10초에 1회
- 사용자별 하루 10회
```

현재 백엔드는 `get_current_user` dependency가 `AuthContext`를 반환하며, 여기의 `subject`가 Cognito 사용자 식별자다. FastAPI route에서는 이 값을 기준으로 quota를 체크한다.

```python
auth: AuthContext = Depends(get_current_user)
user_key = auth.subject
```

### DB 기반 구현

Redis가 없는 초기 단계에서는 PostgreSQL 테이블로 구현할 수 있다.

```sql
create table if not exists api_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_sub text not null,
  action text not null,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_events_user_action_created_at
  on api_usage_events (user_sub, action, created_at desc);

create unique index if not exists idx_api_usage_events_idempotency
  on api_usage_events (user_sub, action, idempotency_key)
  where idempotency_key is not null;
```

요청 처리 흐름:

```text
1. Cognito access_token 검증 후 AuthContext.subject 획득
2. action 이름 결정
   예: analysis_job_create, feedback_job_create, filter_extraction_analyze
3. 최근 10초 내 같은 action 요청 수 확인
4. 오늘 같은 action 요청 수 확인
5. 제한 초과 시 429 반환
6. 제한 통과 시 usage event 기록
7. 실제 job 생성 진행
```

예시 dependency:

```python
from fastapi import Depends

from app.core.errors import AppError
from app.core.security import AuthContext, get_current_user
from app.db.session import Database, require_database


async def enforce_user_quota(
  *,
  db: Database,
  auth: AuthContext,
  action: str,
  per_10_seconds: int,
  per_day: int,
  idempotency_key: str | None = None,
) -> None:
  recent = await db.fetchrow(
    """
    select count(*) as count
    from api_usage_events
    where user_sub = $1
      and action = $2
      and created_at >= now() - interval '10 seconds'
    """,
    auth.subject,
    action,
  )

  if recent and recent["count"] >= per_10_seconds:
    raise AppError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.")

  daily = await db.fetchrow(
    """
    select count(*) as count
    from api_usage_events
    where user_sub = $1
      and action = $2
      and created_at >= date_trunc('day', now())
    """,
    auth.subject,
    action,
  )

  if daily and daily["count"] >= per_day:
    raise AppError(429, "DAILY_LIMIT_EXCEEDED", "Daily request limit exceeded.")

  await db.execute(
    """
    insert into api_usage_events (user_sub, action, idempotency_key)
    values ($1, $2, $3)
    on conflict do nothing
    """,
    auth.subject,
    action,
    idempotency_key,
  )
```

route 적용 예시:

```python
@router.post("/jobs")
async def create_analysis_job(
  payload: AnalysisJobCreate,
  background_tasks: BackgroundTasks,
  auth: AuthContext = Depends(get_current_user),
  db: Database = Depends(require_database),
  settings: Settings = Depends(get_settings),
) -> dict:
  await enforce_user_quota(
    db=db,
    auth=auth,
    action="analysis_job_create",
    per_10_seconds=1,
    per_day=10,
    idempotency_key=str(payload.photo_capture_id or payload.source_media_id or ""),
  )

  # 기존 job 생성 로직 수행
```

### Redis 기반 구현

트래픽이 늘면 Redis 방식이 더 적합하다.

```text
key: rate:{action}:{user_sub}:10s
ttl: 10 seconds
limit: 1

key: rate:{action}:{user_sub}:day:{YYYYMMDD}
ttl: 다음 자정까지
limit: 10
```

Redis는 `INCR` + `EXPIRE`를 원자적으로 처리할 수 있어 고트래픽에서 DB보다 효율적이다. 다만 운영 복잡도가 늘어나므로 초기에는 DB 기반으로 시작하고, 실제 트래픽과 비용을 보고 Redis로 옮긴다.

## CLI 확인 명령

API Gateway route 목록 확인:

```bash
aws apigatewayv2 get-routes \
  --api-id zk4m2qahai \
  --query 'Items[].RouteKey' \
  --output table
```

stage throttling 및 access log 설정 확인:

```bash
aws apigatewayv2 get-stage \
  --api-id zk4m2qahai \
  --stage-name '$default' \
  --query '{DefaultRouteSettings:DefaultRouteSettings,RouteSettings:RouteSettings,AccessLogSettings:AccessLogSettings}' \
  --output json
```

주요 기대값:

```text
DefaultRouteSettings.ThrottlingRateLimit = 200
DefaultRouteSettings.ThrottlingBurstLimit = 400
POST /api/analysis/jobs rate = 20, burst = 50
POST /api/feedback/jobs rate = 10, burst = 30
POST /api/filter-extractions/analyze rate = 10, burst = 30
AccessLogSettings.DestinationArn exists
```

## 검증 체크리스트

- API Gateway를 통한 `GET /health`가 `200`을 반환한다.
- token 없이 보호 route를 호출하면 `401`을 반환한다.
- 유효한 Cognito `access_token`으로 보호 route를 호출하면 `401`이 아니다.
- public ALB 직접 접근은 차단되어 있거나 클라이언트에서 사용하지 않는다.
- CloudWatch `/aws/apigateway/aura-api` 로그 그룹에 access log가 기록된다.
- `$default` stage의 `RouteSettings`에 route별 throttling이 보인다.
- 앱 base URL이 기존 public ALB가 아니라 API Gateway URL을 바라본다.

## 운영 전 후속 작업

- CORS wildcard origin을 실제 web/admin origin으로 제한한다.
- `api.<domain>` 형태의 custom domain을 붙인다.
- public ALB와 사용하지 않는 target group을 제거하거나 접근을 확실히 차단한다.
- 비용이 큰 API에 백엔드 사용자별 quota를 추가한다.
- job 생성 route에 idempotency 처리를 추가한다.
- CloudWatch alarm을 추가한다.
  - 4xx
  - 5xx
  - 429
  - latency
  - integration error
- 실제 트래픽 데이터를 보고 API Gateway route limit을 재조정한다.
