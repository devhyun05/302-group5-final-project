# AURA FaceProfile 전체 분석·저장 설계

- 작성일: 2026-07-12
- 상태: 사용자 승인 완료
- 대상: iOS 우선 얼굴 분석 촬영 흐름
- 스키마 버전: `aura-face-profile-v1`

## 1. 목표

얼굴 분석 기능에서 사진을 촬영하면 기존 세로 비율·헤어라인·퍼스널 컬러 분석을 재사용하고, 빠져 있는 얼굴 기하·눈·눈썹·코·입·피부·품질·얼굴형 분류를 모두 계산한다. 계산된 결과는 분석 보고서와 함께 PostgreSQL에 저장하고, 현재 세션과 과거 보고서에서 동일하게 조회한다.

이 설계의 핵심 원칙은 다음과 같다.

- 얼굴 검출은 기존 Unity homuler MediaPipe 478 랜드마크 경로를 재사용한다.
- 숫자 계산과 7종 얼굴형 규칙 분류는 순수 TypeScript로 구현한다.
- 사진 픽셀이 필요한 색상·피부·흐림·조명 분석은 기존 iOS 네이티브 분석기를 확장한다.
- TrueDepth는 지원 기기에서 고신뢰 보조 입력으로 사용하고, 미지원 기기는 2D 랜드마크로 동일한 기능을 제공한다.
- 원본 478 랜드마크, 원본 depth map, semantic matte, 카메라 calibration 원본은 서버에 전송하거나 장기 저장하지 않는다.
- 모든 측정 항목은 값뿐 아니라 신뢰도, 출처, 측정 불가 사유를 가진다.
- AI는 기하 계산을 하지 않고 저장된 FaceProfile을 해석·추천·설명하는 데만 사용한다.
- FaceProfile v1은 업로드 전 media sanitizer가 검증된 iOS에서 우선 활성화하고, 미지원 플랫폼은 원본 사진을 그대로 보내지 않고 fail closed한다.

## 2. 범위

### 2.1 포함

#### 피부·색

- 얼굴 전체 대비
- 눈-피부 대비
- 눈썹-피부 대비
- 입술-피부 대비
- 피부 톤 균일도
- 붉은기
- 황색도
- 피부·머리·입술·눈·눈썹의 색상 신호와 품질
- 기존 퍼스널 컬러 5축과 12톤 결과

#### 얼굴 균형과 윤곽

- 얼굴 세로/가로 비율
- 상안부·중안부·하안부 비율
- 이마·관자·광대·턱·친 너비
- 광대/턱/친 균형
- 광대-턱 비율
- 턱선 길이와 턱 각도
- 턱 부드러움
- 친 뾰족함
- 윤곽 둥근 정도
- 이마 우세도와 하관 무게감
- 좌우 윤곽 비대칭

#### 눈·눈썹

- 좌우 눈 종횡비
- 눈 사이 간격
- 눈꼬리 기울기
- 눈썹-눈 거리
- 눈썹 기울기
- 눈과 눈썹의 좌우 비대칭

#### 코

- 코 길이 비율
- 코 너비 비율
- 코-중안부 비율
- 코끝-입 거리 비율
- 코 중심선 비대칭

#### 입

- 입술 충만도
- 입 너비 비율
- 상·하 입술 비율
- 입꼬리 기울기
- 입 좌우 비대칭

#### 촬영·분석 품질

- 얼굴 수와 필수 랜드마크 가용성
- yaw·pitch·roll
- 정면 점수
- 얼굴 중앙 정렬과 전체 윤곽 프레이밍
- 얼굴 거리 또는 화면 점유율
- 카메라 안정성
- 흐림 점수
- 조명 품질
- 과노출·저노출·색조명 위험
- 중립 표정 점수
- 눈 감김·입 벌림 위험
- 헤어라인 신뢰도
- 가림 위험
- 랜드마크 신뢰도

#### 얼굴형 분류

- `oval`
- `round`
- `square`
- `heart`
- `oblong`
- `diamond`
- `triangle`
- 7종 전체 점수
- Top 2
- 1·2위 점수 차이
- 혼합형 여부
- 판정에 기여한 특징
- 분류기 종류와 버전

#### 저장·조회

- 분석 보고서와 FaceProfile의 1:1 저장
- AI 작업 시작 전 FaceProfile 저장
- AI 실패 시에도 FaceProfile 유지
- 과거 보고서 조회 시 FaceProfile 반환
- 보고서 또는 계정 삭제 시 연관 FaceProfile 삭제
- 동의 버전과 분석 엔진 버전 저장

### 2.2 제외

- 원본 478 랜드마크 서버 저장
- 원본 TrueDepth depth map 서버 저장
- semantic matte 원본 저장
- 원본 camera calibration 저장
- 얼굴 데이터 모델 학습 또는 임계값 학습
- 외부 범용 모델 학습 제공
- 새 MediaPipe iOS Pod 또는 두 번째 MediaPipe 런타임 도입
- 얼굴 인식·본인 인증·사용자 식별
- 의학적 피부 진단
- Core ML 얼굴형 모델

제외 항목의 도입 조건은 `docs/faceData_WEI/AURA_FACE_PROFILE_FUTURE_CONSIDERATIONS_KO.md`에 별도로 기록한다.

## 3. 아키텍처

```text
CameraFaceCaptureScreen
  -> 촬영 품질 gate
  -> 사진 + 선택적 TrueDepth 캡처
  -> depth/matte 일회용 메모리 token 소유권 이전
  -> 업로드 전 EXIF-upright sRGB JPEG 재인코딩
       -> depth/matte/calibration/GPS/EXIF auxiliary data 제거 확인
  -> 촬영 직후 로컬 분석과 기존 media upload 병렬 시작
       -> requestFaceLandmarks(sanitizedImageUri) 1회 공유
       -> FaceVerticalThirds 분석
       -> PersonalColor/PixelSignal 분석
       -> 선택적 TrueDepth 3D 샘플링
       -> FaceProfileFeatureExtractor
       -> FaceShapeRuleScorer
       -> 업로드의 photoCaptureId로 FaceProfileBuilder 완료
       -> raw landmark 참조와 depth/matte token 즉시 폐기
  -> FaceAnalysisLoading
       -> 이미 계산된 FaceProfile로 보고서 생성
  -> POST /api/analysis/jobs
       -> FaceProfile 계약 검증
       -> analysis_reports + analysis_face_profiles 원자적 저장
       -> 저장된 FaceProfile을 AI 입력에 포함
  -> FaceAnalysisReportDetail
       -> 현재/과거 보고서에서 동일한 구조 렌더링
```

### 3.1 랜드마크 공급자

기존 `requestFaceLandmarks(imageUri)`가 반환하는 Unity homuler MediaPipe 478개 좌표와 matrix 기반 pose를 단일 공급자로 사용한다. 같은 이미지에 대한 동시 요청은 현재 bridge의 pending promise dedup을 유지한다.

새 iOS MediaPipe 런타임을 추가하지 않는다. 이는 Unity homuler와 CocoaPods MediaPipe의 중복 런타임 충돌을 피하기 위한 결정이다.

### 3.2 TrueDepth 공급자

TrueDepth는 필수 경로가 아니다.

- 지원 기기에서는 촬영된 `AVDepthData`를 네이티브 메모리의 만료형 저장소에 보관한다.
- 촬영 결과는 서버 URI가 아닌 불투명한 `nativeDepthToken`만 React Native에 전달한다.
- 확인 화면이나 업로드 완료를 기다리지 않고 촬영 직후 homuler 랜드마크와 depth sampler를 시작한다.
- 네이티브 depth sampler가 이미지 좌표와 depth를 calibration 기준으로 정렬해 거리·깊이 품질·선택된 3D 측정값을 계산한다.
- 계산 완료, 실패, 타임아웃, 화면 이탈 시 원본 depth는 즉시 메모리에서 제거한다.
- 토큰은 앱 프로세스 밖에서 복원할 수 없고 최대 60초 후 자동 만료한다.
- 미지원 또는 실패 시 모든 기하 항목은 MediaPipe 2D 비율로 계산한다.

FaceProfile에는 원본 depth가 아니라 다음 파생값만 남긴다.

- 얼굴-카메라 거리
- depth 품질·정확도
- 얼굴 평면 기울기
- 필요한 기준점의 3D 거리에서 계산한 비율
- 측정 출처 `truedepth_3d` 또는 fallback 출처

### 3.3 픽셀 신호 공급자

기존 `AURAPersonalColorAnalyzer` 흐름을 확장한다.

- 얼굴 분석 촬영의 hair/skin semantic matte는 사진에 임베드하지 않고 최대 60초의 `nativeMatteToken`으로만 두 분석기에 공유한다. 기존 hair/personal-color lab의 별도 호환 경로는 이 범위에서 변경하지 않는다.

- 피부: 좌우 볼, 이마
- 머리
- 입술
- 좌우 눈 또는 홍채 주변
- 좌우 눈썹
- RGB 평균·분산, Lab/LCh
- 과노출·저노출·정반사 제거 비율
- 영역 커버리지와 신뢰도
- 피부 패치 간 편차
- 이미지 blur score
- 전역·좌우 lighting score

원본 ROI 픽셀이나 mask는 결과 계약에 포함하지 않는다. 촬영 파일과 gallery 파일은 업로드 전에 다시 rasterize하여 depth, disparity, portrait-effects matte, semantic matte, calibration, GPS/EXIF auxiliary data를 제거한다. FaceProfile production 경로는 matte/debug PNG나 분석용 사진 복사본을 장기 artifact로 만들지 않는다.

### 3.4 TypeScript Feature Extractor

478 랜드마크와 네이티브 파생 신호를 입력으로 받아 순수 함수로 계산한다.

- EXIF upright 좌표와 mirror 상태를 먼저 정규화한다.
- roll 보정 후 거리와 각도를 계산한다.
- 크기 독립 비율은 cheek width, face length, IPD 중 의미에 맞는 기준으로 정규화한다.
- 좌우 값은 개별 값과 평균, 비대칭 값을 함께 계산한다.
- 헤어라인이 불확실하면 이마 관련 값은 추정하지 않고 `nullReason`을 기록한다.
- 2D와 3D가 모두 있으면 품질이 높은 공급자를 선택하고 선택 이유를 기록한다.

## 4. 데이터 계약

모든 측정값은 같은 wrapper를 사용한다.

```ts
type FaceMeasurementSource =
  | 'truedepth_3d'
  | 'mediapipe_2d'
  | 'apple_semantic_matte'
  | 'pixel_roi'
  | 'camera_metadata'
  | 'derived'
  | 'estimated';

type FaceMeasurement<T> = {
  value: T | null;
  confidence: number;
  source: FaceMeasurementSource;
  nullReason?: string;
  warnings: string[];
};
```

최상위 계약은 다음 영역을 가진다.

```ts
type FaceProfileResult = {
  schemaVersion: 'aura-face-profile-v1';
  status: 'full_success' | 'partial_success' | 'blocked' | 'failed';
  statusReason: string | null;
  captureId: string;
  createdAt: string;
  quality: FaceProfileQuality;
  color: FaceProfileColor;
  faceBalance: FaceProfileBalance;
  eyesAndBrows: FaceProfileEyesAndBrows;
  nose: FaceProfileNose;
  mouth: FaceProfileMouth;
  faceShape: FaceShapeRuleResult;
  beautyCoreFeatures: BeautyCoreFeatures;
  existingAnalysis: {
    verticalThirds: FaceVerticalThirdsSummary | null;
    personalColor: PersonalColorSummary | null;
  };
  warnings: string[];
  provenance: {
    landmarkProvider: 'unity_homuler_mediapipe';
    landmarkCount: number;
    landmarkIndexVersion: string;
    classifierVersion: string;
    pixelAnalyzerVersion: string;
    trueDepthUsed: boolean;
  };
};
```

원본 랜드마크 배열, 원본 depth map, ROI 좌표 배열은 포함하지 않는다.

`beautyCoreFeatures`는 엔진 제안서 §3.4의 facialContrast, skinEvenness, faceBalance, eyesAndBrows, nose, mouth, quality 구조를 같은 측정값에서 결정론적으로 만든 호환 projection이다. 숫자 원본과 categorical 요약을 함께 저장하고, 추정 불가 항목은 임의 label 대신 `unavailable`을 사용한다.

상태는 측정 completeness에서 결정한다. TrueDepth 전용 값과 물리 거리만 optional이다. full_success는 모든 required measurement가 있고 blocking reason이 없을 때만, partial_success는 적어도 하나의 core group이 usable이지만 required measurement가 빠졌을 때만 허용한다. blocked/failed는 non-empty statusReason과 blocked 얼굴형을 가져야 한다.

### 4.1 얼굴형 결과

```ts
type FaceShapeLabel =
  | 'oval'
  | 'round'
  | 'square'
  | 'heart'
  | 'oblong'
  | 'diamond'
  | 'triangle';

type FaceShapeRuleResult = {
  status: 'ready' | 'mixed' | 'blocked';
  dominantShape: FaceShapeLabel | null;
  faceShapeScores: Record<FaceShapeLabel, number>;
  top2: Array<{shape: FaceShapeLabel; score: number}>;
  confidenceGap: number | null;
  overallConfidence: number;
  classifierType: 'rule_v1';
  classifierVersion: string;
  explanationTraits: string[];
  ruleFeatures: FaceShapeRuleFeatureSummary;
  warnings: string[];
};
```

ready/mixed의 7종 점수는 합이 1이 되도록 정규화하되, 학습된 확률로 표현하지 않고 규칙 점수로 명시한다. blocked는 추측을 피하기 위해 7종 모두 0, top2 빈 배열, dominantShape와 confidenceGap null을 사용한다. 점수 차이가 0.10 미만이면 혼합형, 0.10 이상 0.20 미만이면 완곡한 우세 표현, 0.20 이상이면 dominant 표현을 허용한다.

`ruleFeatures`에는 faceLengthToCheekWidth, forehead/jaw/chin/temple 비율, cheekDominance, jawWidthScore, jawAngleScore, chinPointedness, contourRoundness, foreheadDominance, lowerFaceWeight와 frontal/landmark/hairline confidence를 저장한다. 이는 원본 contour가 아니라 재현 가능한 파생 scalar다.

## 5. DB 설계

전용 1:1 테이블을 사용한다.

```sql
create table if not exists analysis_face_profiles (
  report_id uuid primary key,
  user_id uuid not null,
  photo_capture_id uuid,
  schema_version text not null,
  status text not null,
  dominant_shape text,
  confidence_gap double precision,
  profile_payload jsonb not null,
  consent_version text not null,
  consent_accepted_at timestamptz not null,
  consent_snapshot jsonb not null,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

필수 제약:

- `report_id -> analysis_reports.id on delete cascade`
- `user_id -> users.id on delete cascade`
- `photo_capture_id -> photo_captures.id on delete set null`
- `status` 허용값 check
- `dominant_shape` 7종 또는 null check
- `confidence_gap between 0 and 1` check
- `jsonb_typeof(profile_payload) = 'object'` check
- `jsonb_typeof(consent_snapshot) = 'object'` check
- `(user_id, analyzed_at desc)` index
- `(dominant_shape, analyzed_at desc)` partial index

`docs/backend/schema.sql`, `docs/backend/aws-postgresql-schema.dbml`, schema checker, post-schema migration을 함께 갱신한다.

### 5.1 저장 순서

1. 모바일이 자체 schemaVersion을 가진 FaceProfile을 포함한 분석 작업을 요청한다. 별도 client-controlled legacy version이나 동의 증거는 보내지 않는다.
2. 백엔드가 nested Pydantic schema로 전체 계약을 검증한다.
3. 백엔드가 camera/AI 및 배포 환경에 필요한 third-party 동의의 id·version·acceptedAt을 immutable consent snapshot으로 만든다.
4. `analysis_reports`와 `analysis_face_profiles`를 하나의 transaction에서 저장한다.
5. 두 저장 중 하나라도 실패하면 AI 작업을 시작하지 않고 전체 transaction을 rollback한다.
6. full_success/partial_success만 저장 성공 후 inline 또는 SQS AI 작업을 시작한다. blocked/failed는 profile을 저장하고 재촬영을 안내하되 외부 AI를 호출하지 않는다.
7. inline/worker 공용 guard는 text, embedding, image 각각의 외부 호출 직전과 결과 persist 직전에 동의와 report deleted/cancelled 상태를 다시 확인한다.
8. report는 필수 provider 단계가 모두 끝날 때까지 processing을 유지하고 마지막에만 completed가 된다. 중간 철회 결과는 저장하지 않고 생성 object를 정리한다.
9. AI 결과는 `analysis_reports`를 갱신하되 FaceProfile 행은 변경하지 않는다.

### 5.2 조회와 삭제

- 분석 작업 단건·목록 API는 FaceProfile 요약을 반환한다.
- 상세 API는 전체 FaceProfile을 반환한다.
- 모바일은 현재 세션 상태가 아니라 서버 응답을 우선해 과거 보고서도 동일하게 렌더링한다.
- 보고서 API의 soft delete 시 같은 transaction에서 FaceProfile을 명시 삭제하고, hard delete·계정 삭제 시 FK cascade로 삭제한다.
- 계정 삭제 시 사진, 보고서, FaceProfile, 동의 이력의 기존 삭제 흐름을 검증한다.

## 6. 동의와 개인정보 경계

기존 `user_consents` 테이블의 다음 유형을 재사용한다.

- `camera_analysis`: 얼굴 사진 촬영과 파생 FaceProfile 생성·저장
- `ai_processing`: 저장된 사진과 FaceProfile을 이용한 보고서·추천 생성
- `third_party_ai`: 실제 외부 AI 공급자에게 사진을 전송하는 배포 구성에서만 요구

동의 UI에는 목적, 수집 항목, 보유기간, 거부 시 영향, 삭제 방법을 표시한다. 수락 시 서버 동의 이력과 로컬 캐시를 함께 갱신하며, 분석 요청은 서버 동의 이력을 기준으로 검증한다.

MVP 데이터 경계:

- 사진은 auxiliary depth/matte/metadata를 제거한 정화 JPEG만 기존 `media_assets`에 한 번 저장하고 FaceProfile에 복제하지 않는다.
- 파생 FaceProfile은 보고서 삭제 또는 계정 탈퇴 시까지 저장한다.
- 원본 랜드마크·depth·matte·calibration은 네이티브 메모리에서만 처리한다.
- 모델 학습 플래그는 항상 false이며 학습 파이프라인으로 연결하지 않는다.
- 퍼스널 컬러 계약은 `rawAnalyzerArtifactsLocalOnly: true`, `additionalRawFrameUpload: false`, `derivedProfileUploadAllowed: true`, `longTermRawAnalyzerArtifactStored: false`로 역할을 분리한다. 얼굴 분석 사진의 기존 서버 저장과 퍼스널 컬러 분석기가 만드는 추가 원본 아티팩트의 로컬 전용 정책을 혼동하지 않는다.

## 7. AI 입력

AI 요청에는 원본 랜드마크 대신 다음 압축 정보를 포함한다.

- 측정 성공 상태와 전체 confidence
- 7종 얼굴형 Top 2와 점수 차이
- 얼굴 균형·눈·코·입의 뷰티 해석용 핵심 값
- 피부·대비·퍼스널 컬러 요약
- 재촬영 또는 낮은 신뢰도 경고

AI prompt는 FaceProfile 값을 우선 사실로 취급하고 사진만 보고 다른 수치를 발명하지 않도록 수정한다. 현재 `faceShape` 문자열은 AI의 자유 판정값이 아니라 deterministic faceShape 결과를 자연어로 설명한 호환 필드가 된다.

## 8. 오류 처리

- no face: `blocked`, 모든 필드에 `face_not_detected` 사유 저장
- multiple face: `blocked`; 정지영상 공급자가 실제 다중 얼굴 수를 반환하도록 구성
- pose 불량: `blocked`, 재촬영 안내
- TrueDepth 미지원/실패: 2D fallback, 전체 실패로 처리하지 않음
- 헤어라인 불확실: 이마 관련 값만 null, 나머지는 partial success
- pixel analyzer 실패: 색·피부 항목만 null, geometry 결과 유지
- homuler timeout: failed wrapper를 저장하고 분석 재시도 제공
- 서버 계약 오류: AI 작업 시작 전 422
- DB 저장 오류: transaction rollback 후 재시도 가능한 오류 반환
- AI 실패: FaceProfile 유지, 보고서 상태와 오류만 갱신

누락값을 0이나 평균값으로 채우지 않는다. 항상 `nullReason`을 기록한다.

## 9. UI

결과 화면은 숫자 덤프가 아니라 섹션별 요약을 제공한다.

- 얼굴형: dominant 또는 혼합형, Top 2, 근거 특징
- 얼굴 균형: 세로 비율, 광대·턱·친 균형
- 눈·눈썹
- 코·입
- 피부·컬러
- 분석 품질과 재촬영 필요 여부

상세 보기에서만 주요 비율과 confidence를 노출한다. 과거 보고서도 서버에 저장된 동일 FaceProfile로 렌더링한다.

## 10. 테스트 전략

### 10.1 TypeScript

- landmark index map 계약 테스트
- 거리·각도·roll 보정 수학 테스트
- 좌우 대칭·비대칭 fixture
- 얼굴 부위별 measurement fixture
- 7종 각 클래스 golden fixture
- 점수 합, Top 2, 동점, gap 경계 테스트
- hairline null과 2D/3D provider 선택 테스트
- 부분 성공과 nullReason 테스트
- AI payload에 raw landmark가 포함되지 않는 테스트

### 10.2 iOS/native

- depth/matte token 생성·소비·만료·삭제 계약
- TrueDepth 미지원 fallback
- pixel ROI 및 blur/lighting output 계약
- EXIF orientation과 mirror fixture
- 업로드 JPEG ImageIO read-back에서 depth/matte/calibration/GPS/EXIF auxiliary data가 없는 검증
- depth/calibration 원본과 token이 네트워크 payload에 포함되지 않는 검증

### 10.3 모바일 통합

- 동의 gate
- 얼굴 분석 로딩에서 병렬 분석 완료/부분 실패/timeout
- 생성 요청에 FaceProfile 포함
- 결과 섹션과 과거 보고서 렌더링
- 보고서 삭제 후 로컬 상태 정리
- typecheck와 route 계약 테스트

### 10.4 백엔드/DB

- FaceProfile schema validation
- report/profile transaction 원자성
- partial/blocked profile 저장
- AI 실패 후 profile 유지
- 상세/목록 응답 매핑
- 사용자 소유권 격리
- report/account cascade delete
- DB 미구성 시 write 실패
- schema SQL/DBML/checker 일치

## 11. 완료 기준

- 얼굴 분석 촬영 1회로 범위에 명시한 모든 항목을 계산 시도한다.
- 모든 항목은 값 또는 명시적인 nullReason을 가진다.
- 7종 얼굴형 점수, Top 2, confidence gap이 생성된다.
- TrueDepth 지원 여부와 관계없이 분석 흐름이 완료된다.
- 원본 랜드마크와 depth map이 네트워크 payload·DB·로그에 남지 않는다.
- AI 작업 전에 FaceProfile이 DB에 저장된다.
- 과거 보고서에서 FaceProfile 전체를 다시 조회할 수 있다.
- 보고서 삭제와 계정 삭제가 FaceProfile을 제거한다.
- 모바일 typecheck, 관련 모바일 테스트, 백엔드 테스트, schema 검증이 통과한다.
- 기존 iOS signing 설정과 관련 없는 기능을 변경하지 않는다.
