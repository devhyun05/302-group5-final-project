# AURA FaceProfile Full Analysis and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 한 번의 얼굴 분석 촬영으로 승인된 모든 색·피부·얼굴 균형·눈·눈썹·코·입·촬영 품질·7종 얼굴형 항목을 계산 시도하고, 원본 생체 입력은 기기 메모리에서 폐기하면서 계산된 FaceProfile과 동의 증거를 보고서와 함께 DB에 저장·조회·삭제한다.

**Architecture:** 기존 Unity homuler MediaPipe 정지사진 478 랜드마크 공급자를 공유하고, 순수 TypeScript 엔진이 2D 기하와 규칙 기반 얼굴형 점수를 만든다. 기존 iOS 픽셀 분석기는 색·피부·흐림·조명 신호를 확장하고, TrueDepth와 semantic matte는 60초 이하의 일회용 네이티브 토큰으로만 보관해 파생 스칼라를 계산한다. 업로드 사진은 auxiliary sensor data를 제거해 재인코딩한다. FastAPI는 중첩 계약과 서버 동의를 검증한 뒤 analysis_reports와 analysis_face_profiles를 한 트랜잭션으로 저장하며, 모바일은 현재 촬영과 과거 보고서 모두 서버 FaceProfile을 렌더링한다.

**Tech Stack:** Expo React Native, TypeScript, React Navigation, Tamagui, Objective-C/AVFoundation, Unity C#/homuler MediaPipe, FastAPI/Pydantic v2, asyncpg/PostgreSQL JSONB, pytest, Node 기반 TypeScript 계약 테스트.

## Global Constraints

- 원본 478 랜드마크 배열, 원본 depth map, semantic matte, calibration matrix, ROI 픽셀·좌표는 네트워크 요청·DB·로그·AI 입력에 넣지 않는다.
- 얼굴 분석 사진은 auxiliary depth/matte/calibration/GPS/EXIF를 제거한 정화 JPEG만 기존 media_assets 경로로 한 번 저장한다. FaceProfile은 사진 복사본을 포함하지 않는다.
- nativeDepthToken과 nativeMatteToken은 앱 프로세스 안에서만 유효하고 최대 60초 안에 만료하며, 촬영 직후 분석 소유권을 넘기고 성공·실패·취소·화면 이탈 모두에서 소비 또는 폐기한다.
- TrueDepth가 없거나 실패해도 2D 분석으로 완료한다. 누락값을 0으로 만들지 않고 nullReason을 기록한다.
- ready/mixed 얼굴형은 학습 확률이 아니라 합이 1인 rule score로 표시하고, blocked는 전부 0으로 추측을 피한다. 현재 단계에서는 어떤 얼굴 데이터도 모델 학습에 사용하지 않는다.
- 얼굴 분석은 camera_analysis, ai_processing, 실제 외부 AI 사용 시 third_party_ai의 활성 서버 동의를 확인한다.
- apps/mobile/ios/AURA.xcodeproj/project.pbxproj의 기존 Development Team 사용자 변경을 보존한다. 새 소스 등록과 현재 scheme이 참조하지만 누락된 AURATests target 복구 부분만 최소 수정한다.
- 새 MediaPipe iOS Pod, Core ML 얼굴형 모델, 새 UI·아이콘 라이브러리를 추가하지 않는다.
- FaceProfile v1은 업로드 전 media sanitizer가 확인된 플랫폼에서만 활성화한다. 이번 범위의 iOS sanitizer가 없는 Android/기타 플랫폼은 원본을 그대로 보내지 않고 촬영 진입에서 지원 예정 안내로 fail closed한다.
- 각 구현 작업은 먼저 실패 테스트를 추가하고, 최소 구현으로 통과시킨 뒤 관련 테스트와 typecheck를 다시 실행한다.
- 체크박스는 구현과 검증이 실제로 끝난 뒤에만 완료로 바꾼다.

---

## Task 1: FaceProfile 단일 계약과 전용 테스트 러너를 만든다

**Files:**

- Create: apps/mobile/src/shared/types/faceProfile.ts
- Create: apps/mobile/src/shared/contracts/faceAnalysisQuality.ts
- Create: apps/mobile/src/features/face-profile/constants/faceShapeLandmarks.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileContract.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileContract.test.ts
- Create: scripts/mobile/run-face-profile-contract.mjs
- Modify: scripts/mobile/run-personal-color-contract.mjs
- Modify: scripts/mobile/run-face-ratio-distortion-contract.mjs
- Modify: apps/mobile/package.json
- Modify: package.json
- Modify: apps/mobile/src/features/face-ratio/services/faceVerticalThirdsQualityGate.ts
- Modify: apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.ts
- Modify: apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.test.ts
- Modify: apps/mobile/src/features/face-capture/services/faceCapturePitchGate.ts
- Modify: apps/mobile/src/features/face-capture/services/faceCapturePitchGate.test.ts
- Modify: apps/mobile/src/features/face-capture/screens/CameraFaceCaptureScreen.tsx

- [ ] **Step 1: 공통 측정 wrapper와 전체 FaceProfile 타입의 실패 테스트를 작성한다**

faceProfileContract.test.ts에서 다음을 고정한다.

    assert.equal(FACE_PROFILE_SCHEMA_VERSION, 'aura-face-profile-v1');
    assert.equal(FACE_SHAPE_LABELS.length, 7);
    assert.equal(sumScores(validReadyProfile.faceShape.faceShapeScores), 1);
    assert.equal(parseFaceProfile(validProfile)?.schemaVersion, 'aura-face-profile-v1');
    assert.equal(parseFaceProfile({...validProfile, landmarks: []}), null);
    assert.equal(parseFaceProfile({...validProfile, schemaVersion: 'unknown'}), null);

계약의 최상위 모양은 다음과 같이 고정한다.

    export type FaceMeasurementSource =
      | 'truedepth_3d'
      | 'mediapipe_2d'
      | 'apple_semantic_matte'
      | 'pixel_roi'
      | 'camera_metadata'
      | 'derived'
      | 'estimated';

    export type FaceMeasurement<T> = {
      value: T | null;
      confidence: number;
      source: FaceMeasurementSource;
      nullReason?: string;
      warnings: string[];
    };

    export type FaceProfileResult = {
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
        trainingUseAllowed: false;
      };
    };

각 영역에는 아래 키를 빠짐없이 선언한다.

- quality: faceCount, landmarkCount, yawDeg, pitchDeg, rollDeg, frontalScore, centeredScore, framingScore, cameraDistanceMeters, screenCoverageRatio, cameraStability, blurScore, lightingScore, overexposureRisk, underexposureRisk, coloredLightingRisk, neutralExpressionScore, eyeClosureRisk, mouthOpenRisk, hairlineConfidence, occlusionRisk, landmarkConfidence, depthAvailable, depthAccuracy, depthFiltered, depthValidSampleRatio, depthMedianAbsoluteDeviationMeters, depthConfidence, facePlanePitchDeg, facePlaneYawDeg, facePlaneRollDeg, facePlaneConfidence, blockingReasons.
- color: overallFaceContrast, eyeSkinContrast, browSkinContrast, lipSkinContrast, skinEvenness, redness, yellowness, skinColor, hairColor, lipColor, leftEyeColor, rightEyeColor, leftBrowColor, rightBrowColor, personalColor.
- faceBalance: faceLengthToWidth, faceLengthToCheekWidth, upperThirdRatio, middleThirdRatio, lowerThirdRatio, foreheadWidthToCheekWidth, templeWidthToCheekWidth, jawWidthToCheekWidth, chinWidthToCheekWidth, cheekToJawRatio, cheekDominance, jawlineLengthRatio, jawAngleDeg, jawWidthScore, jawAngleScore, jawSoftness, chinPointedness, contourRoundness, foreheadDominance, lowerFaceWeight, contourAsymmetry.
- eyesAndBrows: leftEyeAspectRatio, rightEyeAspectRatio, interEyeDistanceRatio, leftEyeCanthalTiltDeg, rightEyeCanthalTiltDeg, leftBrowEyeDistanceRatio, rightBrowEyeDistanceRatio, leftBrowTiltDeg, rightBrowTiltDeg, eyeAsymmetry, browAsymmetry.
- nose: noseLengthRatio, noseWidthRatio, noseToMidfaceRatio, noseTipToMouthRatio, centerlineAsymmetry.
- mouth: lipFullnessRatio, mouthWidthRatio, upperToLowerLipRatio, leftCornerTiltDeg, rightCornerTiltDeg, mouthAsymmetry.
- faceShape: oval, round, square, heart, oblong, diamond, triangle 전체 점수, top2, confidenceGap, mixed 상태, overallConfidence, classifierType, classifierVersion, explanationTraits, ruleFeatures, warnings. ruleFeatures에는 faceLengthToCheekWidth, forehead/jaw/chin/temple 비율, cheekDominance, jawWidthScore, jawAngleScore, chinPointedness, contourRoundness, foreheadDominance, lowerFaceWeight와 frontal/landmark/hairline confidence를 저장한다.
- beautyCoreFeatures: §3.4 호환 projection으로 facialContrast(overall, eyeSkinContrast, browSkinContrast, lipSkinContrast), skinEvenness(toneUniformity, redness, yellowHue), faceBalance(faceLengthWidthRatio, midfaceLength, lowerFaceLength, jawSoftness, cheekboneToJawRatio), eyesAndBrows(eyeAspectRatio, eyeSpacing, eyeTilt, browEyeDistance), nose(noseLengthRatio, noseWidthRatio, noseMidfaceRatio, noseTipMouthDistanceRatio), mouth(lipFullness, mouthWidthRatio, upperLowerLipRatio, mouthCornerTilt), quality(isFrontal, neutralExpression, lightingQuality, confidence)를 가진다. categorical 값도 추정 불가 시 unavailable을 사용한다.
- existingAnalysis.verticalThirds는 현재 AI용 압축 계약의 status, confidence, displayRatio, dominantPart, hairline confidence/provider, summary를 저장한다.
- existingAnalysis.personalColor는 원본 region pixel/artifact URI 없이 status, measurementConfidence, 5축 값·confidence, within-frame relations, 12-tone top/secondary/season/score/gap과 12종 전체 toneScores/toneDistances, palette best/worst family IDs, calibrationApplied/version, warnings를 저장한다.

- [ ] **Step 2: 전용 러너를 추가하고 실패를 확인한다**

run-face-profile-contract.mjs는 apps/mobile/node_modules/typescript/bin/tsc를 사용해 face-profile 순수 TS 소스와 테스트를 임시 디렉터리로 컴파일하고 실행한다. 설치된 TypeScript의 파일 목록 모드 충돌을 피하도록 --ignoreConfig를 포함한다.

같은 파일 목록 방식인 기존 personal-color와 face-ratio 러너에도 --ignoreConfig를 넣어 현재 설치된 TypeScript의 TS5112 실패를 먼저 제거한다.

package scripts:

    "test:face-profile": "node ../../scripts/mobile/run-face-profile-contract.mjs"
    "mobile:test:face-profile": "npm --prefix apps/mobile run test:face-profile"

Run:

    npm run mobile:test:face-profile

Expected: 타입과 parser가 아직 없어 컴파일 실패.

- [ ] **Step 3: 계약, runtime parser, 버전 상수를 구현한다**

faceProfileContract.ts는 unknown을 받아 객체·UUID captureId·유효한 ISO createdAt·유한수·0..1 confidence·7개 점수 키·top2 정렬·nullReason 규칙을 검사한다. ready/mixed 결과만 점수 합계 허용 오차 1e-6과 top2 2개를 요구한다. blocked 결과는 7개 점수가 모두 0, top2 빈 배열, dominantShape/confidenceGap null이어야 하므로 특징이 부족한 얼굴형을 추측하지 않는다. 다음 키가 최상위나 하위 어디에 있어도 거부한다.

    landmarks
    rawLandmarks
    depthMap
    rawDepth
    calibrationData
    semanticMatte
    roiPixels
    trainingConsent

모든 warning 배열은 최대 32개, explanationTraits는 최대 8개, 개별 warning/nullReason/trait 문자열은 최대 128자, 전체 직렬화 FaceProfile은 UTF-8 기준 256 KiB 이하로 제한한다. provenance.trainingUseAllowed는 리터럴 false만 허용한다.

FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS와 FACE_PROFILE_OPTIONAL_MEASUREMENT_PATHS를 상수로 고정한다. cameraDistanceMeters와 TrueDepth 전용 값만 optional이며, hairline 의존 상안부/FHW는 required라서 측정 불가 시 partial_success가 된다.

상태 불변식:

- full_success: 모든 required path가 non-null, blockingReasons 빈 배열, statusReason null.
- partial_success: blockingReasons는 비어 있고 required path 중 하나 이상이 null이면서 geometry/color 중 적어도 한 core group은 usable, statusReason은 partial_measurements_unavailable.
- blocked: quality.blockingReasons와 statusReason이 non-empty, faceShape.status blocked/0점/빈 top2.
- failed: statusReason이 pipeline failure code이고 faceShape.status blocked이며 required measurement가 ready 값처럼 채워져 있지 않음.

parser와 backend Pydantic은 payload.status를 그대로 믿지 않고 required path completeness에서 기대 상태를 계산해 불일치하면 거부한다. full인데 null, partial인데 누락 없음, blocked인데 dominant shape가 있는 fixture를 모두 실패시킨다.

faceAnalysisQuality.ts에는 정지사진 기준을 한 곳에 둔다.

    export const FACE_ANALYSIS_POSE_LIMITS = {
      yawAbsMaxDeg: 8,
      pitchAbsMaxDeg: 8,
      rollAbsMaxDeg: 5,
    } as const;

vertical-thirds 품질 gate도 이 상수를 import하도록 바꾼다. pose가 없으면 0으로 치환하지 않고 pose_unavailable을 반환한다.

faceCaptureGreenlight와 faceCapturePitchGate는 optional poseLimits 인자를 받고, face_analysis 모드의 CameraFaceCaptureScreen만 FACE_ANALYSIS_POSE_LIMITS 8/8/5를 전달한다. 다른 capture mode의 기존 10/12/8 동작은 보존한다. 경계 test는 8/8/5는 통과하고 그보다 큰 값은 촬영 전 UI에서 차단되어 촬영 직후 post gate와 모순되지 않는지 검증한다. run-face-ratio-distortion-contract.mjs에 greenlight test도 추가한다.

- [ ] **Step 4: 계약 테스트와 기존 비율 테스트를 통과시킨다**

Run:

    npm run mobile:test:face-profile
    npm run mobile:test:face-ratio-distortion
    npm run mobile:typecheck

Expected: 모두 exit 0.

- [ ] **Step 5: 커밋한다**

    git add apps/mobile/src/shared/types/faceProfile.ts apps/mobile/src/shared/contracts/faceAnalysisQuality.ts apps/mobile/src/features/face-profile/constants/faceShapeLandmarks.ts apps/mobile/src/features/face-profile/services/faceProfileContract.ts apps/mobile/src/features/face-profile/services/faceProfileContract.test.ts scripts/mobile/run-face-profile-contract.mjs scripts/mobile/run-personal-color-contract.mjs scripts/mobile/run-face-ratio-distortion-contract.mjs apps/mobile/package.json package.json apps/mobile/src/features/face-ratio/services/faceVerticalThirdsQualityGate.ts apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.ts apps/mobile/src/features/face-capture/services/faceCaptureGreenlight.test.ts apps/mobile/src/features/face-capture/services/faceCapturePitchGate.ts apps/mobile/src/features/face-capture/services/faceCapturePitchGate.test.ts apps/mobile/src/features/face-capture/screens/CameraFaceCaptureScreen.tsx
    git commit -m "feat: 얼굴 프로필 공통 계약 추가"

---

## Task 2: 478 랜드마크 기반 전체 2D 기하·품질 추출기를 만든다

**Files:**

- Create: apps/mobile/src/features/face-profile/services/faceProfileMath.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileMath.test.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileGeometry.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileGeometry.test.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileQualityGate.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileQualityGate.test.ts
- Modify: apps/mobile/src/features/face-profile/constants/faceShapeLandmarks.ts
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: 수학·대칭·mirror·roll fixture 테스트를 먼저 작성한다**

테스트는 distance, midpoint, angleDeg, rotateAround, polygon perimeter/area, robust mean, normalized asymmetry를 검증한다.

    const assertCloseTo = (actual: number, expected: number, epsilon: number) =>
      assert.ok(Math.abs(actual - expected) <= epsilon);
    assertCloseTo(distance({x: 0, y: 0}, {x: 3, y: 4}), 5, 1e-9);
    assertCloseTo(normalizedAsymmetry(0.3, 0.3), 0, 1e-9);
    assert.deepEqual(extractGeometry(mirrorFixture(baseFixture)), mirrorGeometry(baseResult));
    assertCloseTo(
      extractGeometry(rollFixture(baseFixture, 7)).faceLengthToWidth,
      baseResult.faceLengthToWidth,
      0.01,
    );

랜드마크 fixture는 최소 478 슬롯을 만들고, 실제로 쓰는 인덱스만 명시적으로 채운다. 인덱스 맵에는 다음 그룹을 문서화한다.

- face oval: 10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109.
- eye contours: 33, 160, 158, 133, 153, 144와 362, 385, 387, 263, 373, 380.
- irises: 468..472와 473..477.
- brows: 46, 53, 52, 65, 55와 276, 283, 282, 295, 285.
- nose: 168, 6, 197, 195, 5, 4, 129, 358, 2.
- mouth: 61, 291, 13, 14, 78, 308, 0, 17.
- jaw/chin anchors: 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm run mobile:test:face-profile

Expected: faceProfileMath와 faceProfileGeometry export 부재로 실패.

- [ ] **Step 3: 순수 수학과 기하 추출을 구현한다**

처리 순서는 EXIF upright/mirror 메타 정규화, roll 제거, 필수점 검사, 기준 길이 계산, 비율·각도 계산이다.

    export type FaceProfileGeometryInput = {
      landmarks: FaceLandmarkPoint[];
      faceCount: number;
      imageWidth: number;
      imageHeight: number;
      mirrored: boolean;
      pose: FacePose | null;
      hairline?: FaceVerticalThirdsSummary | null;
      depth?: NativeDepthSummary | null;
    };

    export function extractFaceProfileGeometry(
      input: FaceProfileGeometryInput,
    ): {
      faceBalance: FaceProfileBalance;
      eyesAndBrows: FaceProfileEyesAndBrows;
      nose: FaceProfileNose;
      mouth: FaceProfileMouth;
      ruleFeatures: FaceShapeRuleFeatures;
      warnings: string[];
    };

정규화 기준은 다음을 고정한다.

- 얼굴 외곽·턱·코·입 너비/길이는 cheek width.
- 눈 간격은 cheek width와 IPD를 함께 보존하되 FaceProfile 공개값은 cheek width 기준.
- 세로 구간은 hairline H가 신뢰 가능할 때 H-G-Sn-Me를 사용한다.
- FHW는 semantic hair/skin boundary의 좌우 교점이 모두 신뢰 가능할 때 측정한다. 없을 때 upper face-oval의 paired points를 estimated 저신뢰 fallback으로 쓸 수 있지만 앞머리/가림 warning이면 null로 둔다. temple width는 paired temporal oval anchor를 사용한다.
- H가 없으면 landmark 10을 진짜 헤어라인으로 승격하지 않고 상안부 길이와 hairline 의존 이마 값을 null, source estimated, nullReason hairline_unavailable로 둔다.
- 좌우 기울기는 selfie mirror를 정규화한 해부학적 좌/우 기준으로 반환한다.
- 2D 값과 depth 파생 비율이 모두 있으면 depth confidence가 0.7 이상이고 validSampleRatio가 0.65 이상일 때만 truedepth_3d 값을 선택한다.

- [ ] **Step 4: 품질 gate를 구현한다**

    export function evaluateFaceProfileQuality(input: {
      faceCount: number;
      landmarkCount: number;
      pose: FacePose | null;
      screenCoverageRatio: number | null;
      centeredOffset: number | null;
      cameraMetadata?: NativeCameraCaptureMetadata;
      pixelQuality?: NativePixelQuality;
      expression?: FaceExpressionSignals;
    }): FaceProfileQualityDecision;

차단 규칙:

- faceCount 0: face_not_detected.
- faceCount 2 이상: multiple_faces.
- landmarkCount 478 미만 또는 필수점 누락: landmarks_incomplete.
- pose 없음: pose_unavailable.
- |yaw| 또는 |pitch| 8 초과, |roll| 5 초과: pose_out_of_range.
- 프레이밍·거리·흐림·조명은 품질 confidence와 경고를 낮추되, 값이 일부 가능한 경우 partial_success로 남긴다.

표정 신호는 눈 종횡비와 입 벌림 비율로 neutralExpressionScore, eyeClosureRisk, mouthOpenRisk를 계산한다.

현재 homuler 응답에는 per-landmark presence/visibility가 없으므로 landmarkConfidence는 478 count, finite/in-frame 비율, 필수점 가용률, pose matrix 가용성을 합친 estimated 값으로 명시한다. occlusionRisk도 ROI coverage, 좌우 극단 비대칭, 필수 contour 누락, hairline warning을 합친 estimated 위험도이며 실제 segmentation confidence로 가장하지 않는다.

- [ ] **Step 5: golden fixture가 모든 공개 필드에 값 또는 nullReason을 주는지 검증한다**

테스트는 결과 객체를 재귀 순회해 FaceMeasurement에 value가 null이면 non-empty nullReason이 있는지 확인한다. round/symmetric, long/narrow, square-jaw, heart, diamond, triangle, hairline-missing, pose-missing fixture를 포함한다.

Run:

    npm run mobile:test:face-profile
    npm run mobile:typecheck

Expected: 모두 exit 0.

- [ ] **Step 6: 커밋한다**

    git add apps/mobile/src/features/face-profile/services/faceProfileMath.ts apps/mobile/src/features/face-profile/services/faceProfileMath.test.ts apps/mobile/src/features/face-profile/services/faceProfileGeometry.ts apps/mobile/src/features/face-profile/services/faceProfileGeometry.test.ts apps/mobile/src/features/face-profile/services/faceProfileQualityGate.ts apps/mobile/src/features/face-profile/services/faceProfileQualityGate.test.ts apps/mobile/src/features/face-profile/constants/faceShapeLandmarks.ts scripts/mobile/run-face-profile-contract.mjs
    git commit -m "feat: 얼굴 프로필 기하 측정 엔진 추가"

---

## Task 3: 7종 규칙 얼굴형 scorer와 설명 문구를 만든다

**Files:**

- Create: apps/mobile/src/features/face-profile/services/faceShapeRuleScorer.ts
- Create: apps/mobile/src/features/face-profile/services/faceShapeRuleScorer.test.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfilePresentation.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfilePresentation.test.ts
- Create: apps/mobile/src/features/face-profile/index.ts
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: 클래스별 golden test와 gap 경계 테스트를 쓴다**

    assert.equal(scoreFaceShape(ovalFixture).dominantShape, 'oval');
    assert.equal(scoreFaceShape(roundFixture).dominantShape, 'round');
    assert.equal(scoreFaceShape(squareFixture).dominantShape, 'square');
    assert.equal(scoreFaceShape(heartFixture).dominantShape, 'heart');
    assert.equal(scoreFaceShape(oblongFixture).dominantShape, 'oblong');
    assert.equal(scoreFaceShape(diamondFixture).dominantShape, 'diamond');
    assert.equal(scoreFaceShape(triangleFixture).dominantShape, 'triangle');
    assertCloseTo(sum(Object.values(result.faceShapeScores)), 1, 1e-6);
    assert.equal(scoreGap(0.50, 0.41).status, 'mixed');
    assert.equal(scoreGap(0.50, 0.40).status, 'ready');
    assert.equal(sum(Object.values(blockedResult.faceShapeScores)), 0);
    assert.deepEqual(blockedResult.top2, []);
    assert.equal(blockedResult.dominantShape, null);

0.10 경계는 floating point 오차를 피하도록 epsilon을 적용하고, top2 동점은 FACE_SHAPE_LABELS의 고정 순서로 결정한다.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm run mobile:test:face-profile

Expected: scorer와 presentation export 부재로 실패.

- [ ] **Step 3: rule_v1 scorer를 구현한다**

입력 특징:

    type FaceShapeRuleFeatures = {
      faceLengthToWidth: number | null;
      faceLengthToCheekWidth: number | null;
      foreheadWidthToCheekWidth: number | null;
      templeWidthToCheekWidth: number | null;
      jawWidthToCheekWidth: number | null;
      chinWidthToCheekWidth: number | null;
      jawAngleDeg: number | null;
      jawSoftness: number | null;
      chinPointedness: number | null;
      contourRoundness: number | null;
      cheekDominance: number | null;
      jawWidthScore: number | null;
      jawAngleScore: number | null;
      foreheadDominance: number | null;
      lowerFaceWeight: number | null;
      contourAsymmetry: number | null;
      confidenceByFeature: Partial<Record<FaceShapeNumericFeature, number>>;
    };

각 클래스는 여러 특징의 triangular/trapezoid membership을 가중합하고, 가용 특징 가중치로 나눈 뒤 softmax가 아닌 양수 합 정규화를 사용한다. 최소 핵심 특징 faceLengthToWidth, jawWidthToCheekWidth, chinPointedness, contourRoundness 중 3개 미만이면 blocked로 둔다.

규칙 방향:

- oval: 중간 세로비, 광대 우세, 부드러운 턱, 중간 친.
- round: 낮은 세로비, 높은 roundness, 부드러운 턱.
- square: 중간 세로비, jaw/cheek 근접, 낮은 softness, 큰 턱 각.
- heart: forehead 우세, jaw와 chin이 좁고 친이 뾰족.
- oblong: 높은 세로비, 폭 구간이 비교적 일정.
- diamond: 광대 우세, 이마와 턱이 모두 좁음.
- triangle: lowerFaceWeight와 jaw 폭이 이마보다 큼.

overallConfidence에는 측정 confidence 평균, 특징 가용률, 비대칭 penalty를 반영한다. explanationTraits는 실제 점수에 기여한 상위 3개 특징만 넣는다.

- [ ] **Step 4: 한국어 표시 규칙을 구현한다**

    gap < 0.10       -> "타원형과 둥근형이 함께 보여요"
    0.10 <= gap < .20 -> "타원형에 조금 더 가까워요"
    gap >= 0.20      -> "타원형 얼굴형이에요"

blocked일 때는 추측하지 않고 재촬영 사유를 표시한다. rule score를 확률이라고 부르지 않는다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run:

    npm run mobile:test:face-profile
    npm run mobile:typecheck

Expected: 7 golden fixture, score 합, top2, gap, copy 테스트 모두 통과.

- [ ] **Step 6: 커밋한다**

    git add apps/mobile/src/features/face-profile apps/mobile/src/features/face-profile/index.ts scripts/mobile/run-face-profile-contract.mjs
    git commit -m "feat: 규칙 기반 7종 얼굴형 분류 추가"

---

## Task 4: iOS 픽셀 분석기에 눈·눈썹·피부 균일도·흐림·조명을 추가한다

**Files:**

- Create: apps/mobile/ios/AURA/AURAFacePixelMath.h
- Create: apps/mobile/ios/AURA/AURAFacePixelMath.m
- Create: apps/mobile/ios/AURATests/AURAFacePixelMathTests.m
- Modify: apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m
- Modify: apps/mobile/ios/AURA.xcodeproj/project.pbxproj
- Modify: apps/mobile/ios/AURA.xcodeproj/xcshareddata/xcschemes/AURA.xcscheme
- Modify: apps/mobile/src/features/personal-color/services/personalColorCore/contracts.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorAnalyzerNative.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorQualityGate.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorCore/fixtureInventory.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorCore/engine.test.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorCore/engine.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorService.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorArtifacts.ts
- Create: scripts/mobile/run-ios-face-profile-native-tests.mjs
- Create: apps/mobile/src/features/face-profile/services/faceProfilePixelSignals.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfilePixelSignals.test.ts
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: 확장된 네이티브 결과 계약 테스트를 작성한다**

먼저 현재 AURA.xcscheme이 참조하지만 project에 없는 AURATests target을 복구한다. unit-test product, Sources/Frameworks/Resources build phase, AURA host dependency, Debug/Release configuration, target membership을 project.pbxproj에 등록하고 scheme의 TestAction이 실제 target을 가리키게 한다. run-ios-face-profile-native-tests.mjs는 xcrun simctl list --json에서 첫 available iPhone simulator UDID를 고른 뒤 CODE_SIGNING_ALLOWED=NO xcodebuild test -only-testing:AURATests를 실행한다. simulator가 전혀 없으면 명확한 오류로 실패한다.

NativeRegionKey에 eyeLeft, eyeRight, browLeft, browRight를 추가하고 다음 품질 객체 fixture를 요구한다.

    type NativePixelQuality = {
      blur: {
        laplacianVariance: number;
        score: number;
        confidence: number;
      };
      lighting: {
        globalLuminance: number;
        leftLuminance: number;
        rightLuminance: number;
        uniformityScore: number;
        score: number;
      };
      skinUniformity: {
        cheekDelta: number;
        foreheadDelta: number;
        score: number;
      };
    };

테스트는 eye/brow region이 없어도 개인색 엔진이 기존 결과를 유지하고 경고만 추가하는지, pixel quality가 있으면 FaceProfile 대비·붉은기·황색도·균일도 값이 계산되는지 확인한다. AURAFacePixelMathTests는 synthetic upright/mirrored RGBA fixture로 eye/brow ROI coverage, 얼굴 ROI Laplacian, 좌우 luminance, EXIF 1/3/6/8 좌표 변환을 실제 Objective-C 코드에서 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm --prefix apps/mobile run test:personal-color
    npm run mobile:test:face-profile
    node scripts/mobile/run-ios-face-profile-native-tests.mjs

Expected: 새 region/quality 타입과 계산 함수 부재로 실패.

- [ ] **Step 3: 네이티브 ROI와 품질 신호를 구현한다**

AURAPersonalColorAnalyzer.m의 기존 upright sRGB buffer와 AURAPCAcc를 재사용한다.

- 눈 ROI는 안구 contour 내부에서 홍채 중심 주변을 사용하고 피부·흰자·정반사 오염을 경고한다.
- 눈썹 ROI는 brow polyline 주변의 좁은 band를 사용하고 피부 matte가 있으면 과도한 피부 픽셀을 줄인다.
- blur는 배경 전체가 아니라 얼굴/피부 ROI grayscale Laplacian variance로 계산한다.
- lighting은 얼굴 좌·우 ROI luminance와 전역 luminance를 분리한다.
- skinUniformity는 좌우 볼과 이마 패치의 Lab delta를 TypeScript에서 계산할 수 있도록 각 region 통계를 유지한다.
- 기존 areaRatio가 실제로는 gated grid coverage인 점을 roiCoverage로 바로잡고 하위 호환을 위해 areaRatio를 한 버전 동안 동일 값으로 남긴다.
- 원본 pixel, polygon, matte buffer는 payload에 넣지 않는다.

수학·좌표·ROI 누적은 React 의존성이 없는 AURAFacePixelMath로 분리해 위 native fixture test가 실제 production helper를 호출하도록 한다.

- [ ] **Step 4: 색·피부 파생값을 구현한다**

faceProfilePixelSignals.ts는 기존 RGB→Lab/LCh 함수를 재사용하고 다음을 계산한다.

- overallFaceContrast: 피부 대비 머리·눈썹·눈·입술의 가중 평균 delta E.
- eyeSkinContrast, browSkinContrast, lipSkinContrast.
- skinEvenness: 볼 좌우와 이마 delta E의 역정규화.
- redness: 피부 Lab a star의 캘리브레이션되지 않은 상대 지표.
- yellowness: 피부 Lab b star의 상대 지표.

붉은기·황색도는 의학 진단이 아닌 촬영 상대값이라는 warning과 source pixel_roi를 가진다.

퍼스널 컬러 privacy 계약은 다음 의미로 교체한다.

    rawAnalyzerArtifactsLocalOnly: true
    additionalRawFrameUpload: false
    derivedProfileUploadAllowed: true
    longTermRawAnalyzerArtifactStored: false
    trainingUseAllowed: false

FaceProfile pipeline에서는 artifactPolicy: 'none'을 전달해 saveSourceImage, result JSON, JSONL, matte/debug PNG 복사를 하지 않는다. 개인색 개발 lab만 명시적인 artifactPolicy: 'debug_local'에서 로컬 artifact를 허용하고, production 기본값은 none이다.

- [ ] **Step 5: 테스트와 iOS 문법 빌드를 실행한다**

Run:

    npm --prefix apps/mobile run test:personal-color
    npm run mobile:test:face-profile
    npm run mobile:typecheck
    node scripts/mobile/run-ios-face-profile-native-tests.mjs
    xcodebuild -workspace apps/mobile/ios/AURA.xcworkspace -scheme AURA -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /tmp/aura-face-profile-pixel-derived CODE_SIGNING_ALLOWED=NO build

Expected: 모두 exit 0. 실제 기기 색 정확도는 이 작업에서 주장하지 않는다.

- [ ] **Step 6: 커밋한다**

    git add apps/mobile/ios/AURA/AURAFacePixelMath.h apps/mobile/ios/AURA/AURAFacePixelMath.m apps/mobile/ios/AURATests/AURAFacePixelMathTests.m apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m apps/mobile/ios/AURA.xcodeproj/xcshareddata/xcschemes/AURA.xcscheme apps/mobile/src/features/personal-color apps/mobile/src/features/face-profile/services/faceProfilePixelSignals.ts apps/mobile/src/features/face-profile/services/faceProfilePixelSignals.test.ts scripts/mobile/run-face-profile-contract.mjs scripts/mobile/run-ios-face-profile-native-tests.mjs
    git add -p apps/mobile/ios/AURA.xcodeproj/project.pbxproj
    git commit -m "feat: 얼굴 픽셀 품질과 대비 분석 확장"

project.pbxproj의 대화형 stage에서는 새 AURATests/source/target hunks만 선택하고, 작업 시작 전부터 존재한 DEVELOPMENT_TEAM hunk는 선택하지 않는다. commit 직전 git diff --cached와 git diff로 각각 확인한다.

---

## Task 5: TrueDepth·semantic matte의 검증 가능한 네이티브 저장소·수학·정화 모듈을 만든다

**Files:**

- Create: apps/mobile/ios/AURA/AURATransientDepthStore.h
- Create: apps/mobile/ios/AURA/AURATransientDepthStore.m
- Create: apps/mobile/ios/AURA/AURATransientMatteStore.h
- Create: apps/mobile/ios/AURA/AURATransientMatteStore.m
- Create: apps/mobile/ios/AURA/AURAFaceDepthMath.h
- Create: apps/mobile/ios/AURA/AURAFaceDepthMath.m
- Create: apps/mobile/ios/AURA/AURAFaceCaptureConfigurationPolicy.h
- Create: apps/mobile/ios/AURA/AURAFaceCaptureConfigurationPolicy.m
- Create: apps/mobile/ios/AURA/AURAFaceProfileDepthAnalyzer.m
- Create: apps/mobile/ios/AURA/AURAFaceAnalysisMediaSanitizer.h
- Create: apps/mobile/ios/AURA/AURAFaceAnalysisMediaSanitizer.m
- Create: apps/mobile/ios/AURATests/AURATransientDepthStoreTests.m
- Create: apps/mobile/ios/AURATests/AURATransientMatteStoreTests.m
- Create: apps/mobile/ios/AURATests/AURAFaceDepthMathTests.m
- Create: apps/mobile/ios/AURATests/AURAFaceCaptureConfigurationPolicyTests.m
- Create: apps/mobile/ios/AURATests/AURAFaceAnalysisMediaSanitizerTests.m
- Modify: apps/mobile/ios/AURA.xcodeproj/project.pbxproj
- Create: apps/mobile/src/features/face-capture/services/faceAnalysisMediaSanitizerNative.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileDepthAnalyzerNative.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileDepthResult.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileDepthResult.test.ts
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: TS 계약과 네이티브 저장소 lifecycle 테스트를 먼저 작성한다**

촬영 결과 로컬 계약:

    type RealtimeCameraCaptureResult = {
      uri: string;
      width?: number;
      height?: number;
      format?: 'jpg' | 'png' | 'heic';
      nativeDepthToken?: string;
      nativeMatteToken?: string;
      trueDepth?: {
        requested: boolean;
        supported: boolean;
        captured: boolean;
        expiresInMs?: number;
        failureReason?: string;
      };
    };

NativeDepthSummary는 ok, unsupported, not_found, expired, invalid_landmarks, insufficient_depth, error 상태와 consumed를 가지며, 파생 스칼라만 허용한다.

    cameraDistanceMeters
    depthQuality.accuracy
    depthQuality.filtered
    depthQuality.validSampleRatio
    depthQuality.medianAbsoluteDeviationMeters
    depthQuality.confidence
    facePlane.pitchDeg
    facePlane.yawDeg
    facePlane.rollDeg
    facePlane.confidence
    ratios.faceLengthToCheekWidth
    ratios.jawWidthToCheekWidth
    ratios.chinWidthToCheekWidth
    ratios.foreheadWidthToCheekWidth
    ratios.interEyeToCheekWidth
    ratios.noseLengthToCheekWidth

Objective-C store 테스트는 create/consume/second consume/explicit discard/TTL expiry/discardAll을 검증한다. injectable clock/scheduler와 synthetic payload seam을 사용해 sleep이나 실제 AVDepthData 없이 TTL clamp, background/memory notification, 동시 consume/discard/eviction, conversion 실패 cleanup을 재현한다. consume은 ok/expired/not_found를 구분하는 status-bearing result를 반환하고, expired 판정용 tombstone은 토큰 hash와 만료시각만 최대 60초 추가 보관한다.

AURAFaceDepthMathTests는 synthetic Float32 depth와 intrinsics로 unprojection, robust neighborhood median, MAD, plane fit, 3D ratio, EXIF 1/3/6/8, selfie mirror를 검증한다. faceProfileDepthResult.test.ts는 React Native를 import하지 않는 순수 parser/fallback만 Node 러너에서 실행하고, NativeModules thin wrapper는 typecheck와 native test로 검증한다.

AURAFaceCaptureConfigurationPolicyTests는 React/camera hardware 없이 기존 720p 우선, depth/matte capability 부족 시에만 Photo 승격, transientDepthCapture false인 기존 모드 불변을 검증한다. Task 6의 실제 capture view는 이 helper 결과만 적용한다.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm run mobile:test:face-profile
    node scripts/mobile/run-ios-face-profile-native-tests.mjs
    xcodebuild -workspace apps/mobile/ios/AURA.xcworkspace -scheme AURA -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /tmp/aura-face-depth-derived CODE_SIGNING_ALLOWED=NO build

Expected: store/analyzer와 TS wrapper가 없어 실패.

- [ ] **Step 3: AURATransientDepthStore를 구현한다**

필수 인터페이스:

    + sharedStore
    - storeDepthData:photoPixelSize:orientation:mirrored:ttlSeconds:
    - consumeToken:
    - discardToken:
    - discardAll

필수 동작:

- NSUUID 기반 불투명 토큰.
- AVDepthData를 kCVPixelFormatType_DepthFloat32로 즉시 변환.
- token 조회와 동시에 map에서 제거하는 one-shot consume.
- TTL 최대 60초와 예약된 hard eviction.
- UIApplicationDidEnterBackgroundNotification, UIApplicationDidReceiveMemoryWarningNotification에서 전부 폐기.
- 토큰·깊이 크기·calibration·XYZ를 로그하지 않음.

AURATransientMatteStore는 동일 TTL/notification/discard 규칙을 쓰되 borrowToken이 AURATransientMatteLease를 반환한다. 각 lease가 hair/skin AVSemanticSegmentationMatte를 strong retain하고 reader finally에서 release되며, store discard는 새 borrow만 막고 이미 실행 중인 lease를 무효화하지 않는다. 개인색과 세로비율 analyzer가 같은 token을 병렬 borrow할 수 있고 token 자체는 JS 밖으로 직렬화하지 않는다. 테스트는 두 동시 reader, 한 reader 실패, borrow 중 discard, 두 lease release 후 deallocation을 검증한다.

- [ ] **Step 4: 업로드 사진 정화 모듈을 독립 구현한다**

AURAFaceAnalysisMediaSanitizer.h에 React 비의존 sanitize 함수와 auxiliary-data inspection 결과 계약을 공개한다. 구현은 camera와 gallery 입력을 EXIF-upright sRGB JPEG로 decode/re-encode하고 ImageIO auxiliary depth, disparity, portrait effects matte, semantic mattes, calibration, GPS/EXIF metadata가 모두 없는 새 tmp URI를 반환한다. sanitizer test는 이 production 함수를 synthetic auxiliary data fixture에 호출하고 ImageIO read-back이 nil인지 확인한다.

faceAnalysisMediaSanitizerNative.ts는 availability와 sanitize 결과만 감싸며 이 Task에서는 production capture에 아직 연결하지 않는다. store/analyzer/sanitizer 모듈은 모두 테스트되지만 token 생성 prop은 계속 비활성이라 Task 6 전 단계에서 소유자 없는 token이 생기지 않는다. iOS sanitizer가 없는 플랫폼은 Task 6에서 원본 업로드 대신 fail closed한다.

- [ ] **Step 5: depth sampler를 구현한다**

AURAFaceProfileDepthAnalyzer는 analyze(token, options)와 discard(token)를 export한다. analyze는 먼저 token을 소비한 뒤 homuler landmark 좌표와 orientation/mirror를 맞추고 AURAFaceDepthMath로 calibration intrinsics 기반 robust neighborhood median, plane fit, 3D 거리를 계산한 뒤 위 NativeDepthSummary만 반환한다.

native analyze option에는 deadlineMs 최대 1500을 두고 sampling loop가 monotonic deadline/cancellation flag를 확인한다. beginAnalysisWithToken은 store serial queue의 한 critical section에서 entry 제거와 active-analysis registry 등록을 원자적으로 수행한다. discard(token)는 같은 queue에서 store entry를 제거하거나 이미 등록된 active context의 cancellation flag를 세우므로 handoff 사이 취소 유실이 없다. XCTest는 begin/discard 두 순서와 동시 race를 반복 검증한다. resolve/reject finally는 registry와 AVDepthData strong reference를 제거한다. TS wrapper는 화면 이탈/timeout/finally에서 discard를 호출한다. unsupported/expired/insufficient_depth는 throw하지 않고 2D fallback 결과로 변환한다.

- [ ] **Step 6: 전체 네이티브 검증을 실행한다**

Run:

    npm run mobile:test:face-profile
    npm run mobile:typecheck
    plutil -lint apps/mobile/ios/AURA.xcodeproj/project.pbxproj
    node scripts/mobile/run-ios-face-profile-native-tests.mjs
    xcodebuild -workspace apps/mobile/ios/AURA.xcworkspace -scheme AURA -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /tmp/aura-face-depth-derived CODE_SIGNING_ALLOWED=NO build

Expected: 모두 exit 0. 실제 depth alignment와 absolute accuracy는 TrueDepth 물리 기기 검증 항목으로 남긴다.

- [ ] **Step 7: 커밋한다**

    git add apps/mobile/ios/AURA/AURATransientDepthStore.h apps/mobile/ios/AURA/AURATransientDepthStore.m apps/mobile/ios/AURA/AURATransientMatteStore.h apps/mobile/ios/AURA/AURATransientMatteStore.m apps/mobile/ios/AURA/AURAFaceDepthMath.h apps/mobile/ios/AURA/AURAFaceDepthMath.m apps/mobile/ios/AURA/AURAFaceCaptureConfigurationPolicy.h apps/mobile/ios/AURA/AURAFaceCaptureConfigurationPolicy.m apps/mobile/ios/AURA/AURAFaceProfileDepthAnalyzer.m apps/mobile/ios/AURA/AURAFaceAnalysisMediaSanitizer.h apps/mobile/ios/AURA/AURAFaceAnalysisMediaSanitizer.m apps/mobile/ios/AURATests apps/mobile/src/features/face-capture/services/faceAnalysisMediaSanitizerNative.ts apps/mobile/src/features/face-profile/services/faceProfileDepthAnalyzerNative.ts apps/mobile/src/features/face-profile/services/faceProfileDepthResult.ts apps/mobile/src/features/face-profile/services/faceProfileDepthResult.test.ts scripts/mobile/run-face-profile-contract.mjs
    git add -p apps/mobile/ios/AURA.xcodeproj/project.pbxproj
    git commit -m "feat: 일회용 TrueDepth 얼굴 측정 추가"

여기서도 새 source/test membership hunk만 stage하고 기존 DEVELOPMENT_TEAM 변경은 unstaged로 보존한다.

---

## Task 6: 단일 온디바이스 FaceProfile 파이프라인을 연결한다

**Files:**

- Modify: apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/StillFaceLandmarkService.cs
- Modify: apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m
- Modify: apps/mobile/ios/AURA/AURAFaceRatioHairline.h
- Modify: apps/mobile/ios/AURA/AURAFaceRatioHairline.m
- Modify: apps/mobile/ios/AURA/AURAFaceRatioAnalyzer.m
- Modify: apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m
- Modify: apps/mobile/src/features/ar/services/unityMakeupBridge.ts
- Modify: scripts/mobile/run-unity-makeup-bridge-contract.mjs
- Create: apps/mobile/src/features/face-profile/services/faceProfileBuilder.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileBuilder.test.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileService.ts
- Create: apps/mobile/src/features/face-profile/services/faceProfileService.test.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisOnDevicePipeline.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisOnDevicePipeline.test.ts
- Modify: apps/mobile/src/features/face-ratio/types.ts
- Modify: apps/mobile/src/features/face-ratio/services/faceRatioAnalyzerNative.ts
- Modify: apps/mobile/src/features/face-ratio/services/faceVerticalThirdsService.ts
- Modify: apps/mobile/src/features/face-ratio/services/faceVerticalThirdsArtifacts.ts
- Modify: apps/mobile/src/features/personal-color/types.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorAnalyzerNative.ts
- Modify: apps/mobile/src/features/personal-color/services/personalColorService.ts
- Modify: apps/mobile/src/features/face-capture/components/RealtimeFaceCaptureNativeView.tsx
- Modify: apps/mobile/src/features/face-capture/services/faceCaptureUploadService.ts
- Create: apps/mobile/src/features/face-capture/services/faceCaptureLocalPreviewOwnership.ts
- Create: apps/mobile/src/features/face-capture/services/faceCaptureLocalPreviewOwnership.test.ts
- Modify: apps/mobile/src/features/face-capture/screens/CameraFaceCaptureScreen.tsx
- Modify: apps/mobile/src/app/navigation/routes/faceCaptureConfirmationRoutes.tsx
- Modify: apps/mobile/src/app/navigation/routes/faceCaptureConfirmationRoutes.test.ts
- Modify: apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx
- Modify: apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.test.ts
- Create: scripts/mobile/verify-face-profile-native-privacy.mjs
- Modify: scripts/mobile/run-face-profile-contract.mjs
- Modify: apps/mobile/package.json

- [ ] **Step 1: 다중 얼굴, 부분 실패, 단일 실행 테스트를 작성한다**

테스트는 촬영 resolver 직후 sanitizer가 먼저 실행되고, 정화된 동일 imageUri에서 landmark requester가 정확히 1회 호출되며, 전달받은 동일 FaceLandmarksResult를 vertical-thirds와 personal-color가 재요청 없이 사용하는지 확인한다. sanitizer 완료 뒤에는 upload와 vertical-thirds/pixel/depth가 병렬 실행되어야 한다.

CameraFaceCaptureScreen이 이미 계산하는 FaceCaptureGreenlightReport를 로컬 전용 captureQualitySnapshot으로 정규화해 prepareFaceProfileCapture에 전달한다. snapshot에는 capturedAt, faceCount, yaw/pitch/roll, cameraStability, faceWidthRatio/screenCoverageRatio, guide-normalized centerOffsetX/Y, centered/framing score, nativeCameraMetadata의 ISO/exposure/WB/focus 안정성만 포함한다. camera fixture는 이 값이 quality measurement에 보존되고 gallery fixture는 값을 꾸미지 않고 camera_metadata_unavailable nullReason으로 partial 상태가 되는지 검증한다.

    assert.equal(requestLandmarks.calls.length, 1);
    assert.equal(result.status, 'partial_success');
    assert.equal(result.faceShape.classifierType, 'rule_v1');
    assert.equal(result.provenance.trueDepthUsed, false);
    assert.equal(result.provenance.trainingUseAllowed, false);

faceCount 2는 blocked, pose null은 blocked, hairline null은 partial_success, landmark timeout은 failed wrapper를 반환해야 한다. depth 미지원/만료만 발생하고 2D 필수 항목이 모두 채워지면 full_success를 허용한다.

RN 비의존 faceCaptureLocalPreviewOwnership.test.ts를 face-profile runner에 연결한다. camera tmp/sanitized tmp/gallery URI ownership fixture는 success, sanitizer failure, upload failure, local analysis failure, retake, confirmation cancel, report ready, route exit 각각에서 앱 소유 tmp만 정확히 한 번 삭제되고 gallery 원본은 삭제되지 않는지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm run mobile:test:face-profile
    npm run mobile:test:unity-bridge

Expected: pipeline과 actual faceCount 계약 부재로 실패.

- [ ] **Step 3: 정지사진 공급자가 실제 얼굴 수를 보고하게 한다**

StillFaceLandmarkService.cs는 numFaces를 2로 올리고 결과의 FaceLandmarks.Count를 faceCount로 직렬화한다. 분석용 landmark 배열은 첫 얼굴만 보내되 faceCount가 1이 아닐 때 TS gate가 측정을 차단한다.

unityMakeupBridge.ts는 pose matrix가 없을 때 pitch/yaw/roll 0을 만들지 않고 pose null을 유지한다. 기존 pendingFaceLandmarksRequests dedup은 보존한다.

- [ ] **Step 4: native capture와 sanitizer를 token owner에 연결한다**

AURARealtimeFaceCaptureView.m에 transientDepthCapture prop을 추가한다.

- setter가 session queue에서 재구성되며, semanticMatteCapture || transientDepthCapture이면 TrueDepth 우선 device를 선택한다. preset은 현재 720p 우선 → capability 부족 시 Photo 승격 rung을 그대로 보존하고, 강제 Photo 전환을 하지 않는다.
- depth capability는 matte capability와 분리하고, depth-only 요청도 depthDataDeliveryEnabled 및 per-photo depthDataDeliveryEnabled를 켠다.
- face_analysis의 transientDepthCapture branch에서 embedsDepthDataInPhoto와 embedsSemanticSegmentationMattesInPhoto를 NO로 둔다. 기존 personal_color, hair_analysis, FaceCaptureLab/PersonalColorLab의 semanticMatteCapture-only branch는 embedded matte 호환을 유지한다.
- delivered depth와 hair/skin matte를 각각 store에 넣고 token/capability만 resolve한다.
- AVCaptureResolvedPhotoSettings.uniqueID와 capture generation을 기록해 watchdog 뒤 늦은 callback이 token/promise를 만들지 못하게 한다.
- watchdog fallback, resolver 실패, capture cancel은 만든 token을 즉시 폐기한다.

RealtimeFaceCaptureNativeView에 transientDepthCapture를 추가하고 face_analysis에서만 true로 전달한다. CameraFaceCaptureScreen은 capture result를 받자마자 cleanup owner를 등록하고, sanitizer가 성공한 뒤 local pipeline에 token 소유권을 단 한 번 넘긴다. preparation 시작 전 close/error와 upload/navigation 취소는 화면 cleanup이 token을 폐기한다.

AURAFaceRatioAnalyzer/AURAFaceRatioHairline과 AURAPersonalColorAnalyzer는 nativeMatteToken을 option으로 받고 store의 read-only matte를 사용한다. production FaceProfile에서는 파일 auxiliary data 파싱과 matte/debug PNG artifact 생성을 금지한다.

AURAFaceRatioHairline 결과는 center H뿐 아니라 신뢰 가능한 좌·우 hair/skin boundary intersection과 각각의 confidence를 파생 scalar로 반환해 FHW를 계산한다. boundary polyline이나 matte 원본은 반환하지 않는다.

store가 기록한 photo orientation/mirror와 sanitizer가 반환한 original-to-upright transform을 두 analyzer와 depth math에 동일하게 적용한다. matteByApplyingExifOrientation과 좌표 mirror는 정확히 한 번만 수행하며 synthetic EXIF/mirror native tests로 고정한다.

verify-face-profile-native-privacy.mjs는 face-analysis photo settings branch의 두 embeds 플래그, sanitizer XCTest read-back, upload/presigned/photo-capture/analysis body의 token 부재, FaceProfile serializer의 raw 배열 부재, NSLog/console token 부재를 allowlist 방식으로 검증한다.

정적 guard는 face_analysis/transient branch에서 두 embeds 플래그가 NO인지 확인하고, semanticMatteCapture-only 기존 흐름의 YES는 허용한다. simulator XCTest는 AURAFaceCaptureConfigurationPolicy의 720p 기본 rung과 capability 부족 시 Photo 승격만 검증한다. 실제 live greenlight frame dimensions/성능은 camera가 있는 physical-device gate에서 검증한다.

face_analysis의 photo-captures.devicePayload에서도 local sourceUri, token, auxiliary capability 원본을 제거하고 sanitized width/height/contentType과 rawSensorArtifactsStored: false만 남긴다.

package script:

    "test:face-profile-native-privacy": "node ../../scripts/mobile/verify-face-profile-native-privacy.mjs"

- [ ] **Step 5: FaceProfileBuilder와 orchestrator를 구현한다**

    export async function prepareFaceProfileCapture(
      input: FaceCaptureImageInput,
      captureQualitySnapshot: FaceCaptureQualitySnapshot | null,
      dependencies?: FaceProfileDependencies,
    ): Promise<PreparedFaceProfileInputs>;

    export function finalizePreparedFaceProfile(
      prepared: PreparedFaceProfileInputs,
      uploaded: FaceCaptureUploadResult,
    ): FaceProfileResult;

순서:

1. CameraFaceCaptureScreen이 native capture 결과를 받는 즉시 cleanup owner를 등록하고 sanitizer를 먼저 실행한다.
2. sanitizer를 await해 정화 URI와 upright/mirror 메타를 받은 뒤 prepareFaceProfileCapture와 uploadFaceCaptureImage를 같은 순간 시작해 Promise.allSettled로 병렬 수행한다.
3. prepareFaceProfileCapture 내부에서 정화 URI로 requestFaceLandmarks를 정확히 한 번 시작한다.
4. FaceVerticalThirdsInput과 PersonalColorCaptureInput에 optional precomputedLandmarks, nativeMatteToken, artifactPolicy를 추가해 동일 결과를 주입한다. 두 서비스는 주입값이 있으면 requestFaceLandmarks를 다시 호출하지 않는다.
5. depth는 upload/확인 화면을 기다리지 않고 즉시 소비한다. 확인 화면에 오래 머물러도 token은 이미 폐기되고 파생 summary만 남는다.
6. quality gate 후 geometry, pixel signals, shape scorer를 실행하고 같은 측정값에서 §3.4 BeautyCoreFeatures projection을 결정론적으로 만든 뒤 upload에서 받은 photoCaptureId로 최종 FaceProfile captureId를 고정한다.
7. 기존 verticalThirds와 personalColor summary를 포함하고 모든 FaceMeasurement에 값 또는 nullReason을 보장한다.
8. finally에서 depth/matte token과 raw landmark 참조를 해제한다. sanitizer 성공 후 앱이 만든 원본 camera tmp는 삭제한다. sanitized tmp는 localPreviewUri로 FaceCaptureConfirmation에 소유권을 넘겨 즉시 삭제하지 않는다. retake/cancel이면 confirmation이 삭제하고, confirm이면 Loading으로 소유권을 넘긴 뒤 backend report의 검증된 CDN/preview URI가 준비되어 report.imageSource를 교체한 시점에 삭제한다. CDN이 아직 없으면 report detail route exit까지 유지한다. gallery 원본 URI는 절대 삭제하지 않는다. upload 실패·사용자 취소·화면 이탈도 같은 ownership cleanup을 호출한다.

FaceCaptureUploadResult에는 직렬화되지 않는 derivedFaceProfile과 앱 소유 localPreviewUri/cleanup handle만 추가한다. raw landmarks와 token은 결과에 남기지 않는다. 확인 UI는 localPreviewUri를 우선 사용하고, 서버/API serializer는 이 필드를 무시한다. FaceAnalysisLoadingRouteScreen은 selectedFaceCapture.derivedFaceProfile을 보고서 생성에 사용하고, legacy/gallery 복원처럼 필드가 없는 경우에만 단일 fallback pipeline을 실행한다. 전체 로컬 준비 budget은 12초이며 native depth 자체는 1.5초 deadline을 가진다. 재시도는 같은 derived profile을 재사용한다.

- [ ] **Step 6: 테스트를 통과시킨다**

Run:

    npm run mobile:test:face-profile
    npm run mobile:test:unity-bridge
    npm --prefix apps/mobile run test:personal-color
    npm run mobile:test:face-ratio-distortion
    npm run mobile:typecheck
    npm --prefix apps/mobile run test:face-profile-native-privacy
    node scripts/mobile/run-ios-face-profile-native-tests.mjs

Expected: 모두 exit 0.

- [ ] **Step 7: 커밋한다**

    git add apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/StillFaceLandmarkService.cs apps/mobile/ios/AURA/AURARealtimeFaceCaptureView.m apps/mobile/ios/AURA/AURAFaceRatioHairline.h apps/mobile/ios/AURA/AURAFaceRatioHairline.m apps/mobile/ios/AURA/AURAFaceRatioAnalyzer.m apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m apps/mobile/src/features/ar/services/unityMakeupBridge.ts scripts/mobile/run-unity-makeup-bridge-contract.mjs apps/mobile/src/features/face-profile apps/mobile/src/features/face-analysis/services/faceAnalysisOnDevicePipeline.ts apps/mobile/src/features/face-analysis/services/faceAnalysisOnDevicePipeline.test.ts apps/mobile/src/features/face-ratio apps/mobile/src/features/personal-color apps/mobile/src/features/face-capture apps/mobile/src/app/navigation/routes/faceCaptureConfirmationRoutes.tsx apps/mobile/src/app/navigation/routes/faceCaptureConfirmationRoutes.test.ts apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.test.ts scripts/mobile/verify-face-profile-native-privacy.mjs scripts/mobile/run-face-profile-contract.mjs apps/mobile/package.json
    git commit -m "feat: 얼굴 분석 온디바이스 파이프라인 통합"

---

## Task 7: 서버 동의 API와 얼굴 분석 진입 동의 gate를 만든다

**Files:**

- Create: services/backend/app/services/user_consents.py
- Modify: services/backend/app/schemas/users.py
- Modify: services/backend/app/api/users.py
- Create: services/backend/tests/test_user_consents.py
- Modify: services/backend/tests/test_route_contract.py
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisConsentModel.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisConsentModel.test.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisConsentService.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisConsentGate.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisConsentGate.test.ts
- Create: apps/mobile/src/features/face-analysis/screens/FaceAnalysisConsentScreen.tsx
- Modify: apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx
- Modify: apps/mobile/src/features/settings/services/accountService.ts
- Modify: apps/mobile/src/features/legal/screens/PrivacyPolicyScreen.tsx
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: 서버 동의의 accept/current/revoke 실패 테스트를 작성한다**

API를 다음으로 고정한다.

    GET    /api/users/me/consents
    PUT    /api/users/me/consents/{consentType}
    DELETE /api/users/me/consents/{consentType}

PUT body:

    {
      "version": "face-profile-2026-07-12",
      "accepted": true,
      "metadata": {
        "surface": "face_analysis",
        "rawSensorArtifactsStored": false,
        "trainingUseAllowed": false
      }
    }

허용 type은 camera_analysis, ai_processing, third_party_ai로 제한한다. active는 accepted true, accepted_at not null, revoked_at null인 서버가 요구하는 정확한 버전이다. 같은 user/type/version의 활성 row가 이미 있으면 그대로 반환하고 새 row를 만들지 않는다. 재동의는 새 history row를 insert하며, DELETE는 해당 사용자의 그 type에 속한 모든 active version row에 revoked_at을 기록한다. user_consents는 history 테이블이므로 unique constraint나 destructive upsert를 추가하지 않는다.

테스트:

- 다른 사용자의 동의를 조회·철회하지 못함.
- stale version은 active로 인정하지 않음.
- revoke는 type의 모든 active version을 철회하고 이후 current가 false.
- 같은 user/type/version의 동시 PUT 두 개를 실행해도 사용자 row lock으로 활성 row가 하나만 생김.
- metadata에 trainingUseAllowed true 또는 rawSensorArtifactsStored true가 오면 422.

- [ ] **Step 2: 실패를 확인한다**

Run:

    (cd services/backend && python -m pytest -q tests/test_user_consents.py tests/test_route_contract.py)

Expected: 엔드포인트와 서비스가 없어 실패.

- [ ] **Step 3: 동의 서비스와 API를 구현한다**

user_consents.py에 다음 상수를 둔다.

    FACE_PROFILE_CONSENT_VERSION = 'face-profile-2026-07-12'
    AI_PROCESSING_CONSENT_VERSION = 'face-ai-report-2026-07-12'
    THIRD_PARTY_AI_CONSENT_VERSION = 'face-third-party-ai-2026-07-12'

require_active_consent(connection, user_id, consent_type, version)는 accepted_at desc, id desc로 정확한 active version row를 for share로 읽고 없으면 FACE_PROFILE_CONSENT_REQUIRED 403을 발생시킨다. 얼굴 사진과 FaceProfile에는 camera_analysis, AI 보고서에는 ai_processing을 요구한다. third_party_ai는 Settings의 analysis/image generation provider가 bedrock 또는 openai처럼 실제 외부 공급자인 경우에만 요구하는 requires_third_party_ai(settings) 함수로 조건화한다.

동의 PUT/DELETE는 transaction을 열고 먼저 users의 현재 사용자 row를 SELECT ... FOR UPDATE로 잠가 같은 사용자의 동의 변경을 직렬화한다. 그 뒤 동일 활성 version을 조회해 있으면 반환하고, 없으면 insert한다. 이 잠금으로 동시 PUT도 하나의 active row만 만든다. DB history 보존과 기존 중복 row 안전성을 위해 Task 8에서도 unique constraint는 추가하지 않는다.

- [ ] **Step 4: 모바일 동의 모델과 UI를 구현한다**

별도 PersonalColorConsentScreen을 재사용하지 않는다. 새 화면 문구에는 다음을 모두 표시한다.

- 목적: 얼굴 비율·색·얼굴형·메이크업 추천 분석.
- 저장: 촬영 사진과 계산된 FaceProfile.
- 미저장: 원본 478점, depth map, matte, calibration, ROI.
- 보유: 보고서 또는 계정 삭제 시까지.
- 외부 처리: 서버 GET의 requiredConsentTypes에 third_party_ai가 있을 때만 공급자명을 추측하지 않는 “외부 AI 서비스에서 보고서와 추천 이미지를 생성합니다” 문구와 목적을 표시한다. 내부 provider 환경에서는 이 항목과 동의를 렌더링하지 않는다.
- 학습: 현재 모델 학습에 사용하지 않음.
- 거부 영향과 설정/보고서에서 삭제하는 방법.

수락 버튼은 camera_analysis와 ai_processing, 서버 환경이 외부 provider를 사용하면 third_party_ai까지 서버에 순차 PUT하고 모두 성공했을 때만 로컬 secure cache를 갱신한다. consent GET 응답은 requiredConsentTypes와 버전을 함께 반환해 모바일이 provider를 추측하지 않게 한다.

FaceAnalysisIntro의 시작 액션뿐 아니라 FaceCaptureRouteScreen도 camera view를 렌더하기 전에 서버 active 상태를 재확인한다. deep link나 다른 화면의 직접 navigation으로 FaceCapture에 들어와도 동의가 없으면 촬영·업로드 전에 FaceAnalysisIntro의 consent surface로 replace한다.

서버 동의 상태를 확인하지 못하면 로컬 cache만 믿고 촬영하지 않고 fail closed 안내와 재시도를 표시한다.

faceAnalysisConsentGate.ts는 RN 비의존 순수 함수로 loading, consent_required, sanitizer_unsupported, network_error, ready 상태를 받아 loading/consent/unsupported/retry/camera 중 하나만 반환한다. faceAnalysisConsentGate.test.ts를 face-profile Node 러너에 연결하고 다음을 실행 검증한다.

- direct/deep-link 진입도 server status ready 전에는 camera를 절대 반환하지 않음.
- active consent와 sanitizer available일 때만 camera.
- stale/revoked는 consent surface.
- network error는 retry이며 cache만으로 camera를 열지 않음.
- requiredConsentTypes에 third_party_ai가 없으면 외부 provider 고지/동의 항목이 없음.

- [ ] **Step 5: 동의 테스트를 통과시킨다**

Run:

    (cd services/backend && python -m pytest -q tests/test_user_consents.py tests/test_route_contract.py)
    npm run mobile:test:face-profile
    npm run mobile:typecheck

Expected: 모두 exit 0.

- [ ] **Step 6: 커밋한다**

    git add services/backend/app/services/user_consents.py services/backend/app/schemas/users.py services/backend/app/api/users.py services/backend/tests/test_user_consents.py services/backend/tests/test_route_contract.py apps/mobile/src/features/face-analysis/services/faceAnalysisConsentModel.ts apps/mobile/src/features/face-analysis/services/faceAnalysisConsentModel.test.ts apps/mobile/src/features/face-analysis/services/faceAnalysisConsentService.ts apps/mobile/src/features/face-analysis/services/faceAnalysisConsentGate.ts apps/mobile/src/features/face-analysis/services/faceAnalysisConsentGate.test.ts apps/mobile/src/features/face-analysis/screens/FaceAnalysisConsentScreen.tsx apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx apps/mobile/src/features/settings/services/accountService.ts apps/mobile/src/features/legal/screens/PrivacyPolicyScreen.tsx scripts/mobile/run-face-profile-contract.mjs
    git commit -m "feat: 얼굴 분석 개인정보 동의 흐름 추가"

---

## Task 8: FaceProfile DB 테이블·마이그레이션·체커를 추가한다

**Files:**

- Modify: docs/backend/schema.sql
- Modify: docs/backend/aws-postgresql-schema.dbml
- Modify: services/backend/app/db/init_db.py
- Modify: services/backend/app/db/check_schema.py
- Modify: services/backend/tests/test_db_scripts.py
- Create: services/backend/tests/test_analysis_face_profiles_postgres.py
- Modify: .github/workflows/backend-ci.yml

- [ ] **Step 1: DDL과 migration 기대 테스트를 먼저 작성한다**

test_db_scripts.py는 EXPECTED_TABLES/EXPECTED_COLUMNS에 analysis_face_profiles가 없을 때 실패하고, migration에 JSON object check, report cascade FK, consent snapshot, indexes가 없으면 실패해야 한다.

PostgreSQL integration test는 임시 schema와 search_path를 만들고 fresh schema 및 post migration 둘 다에서 다음을 확인한다.

- report hard delete가 profile을 cascade 삭제.
- user hard delete가 report/profile을 cascade 삭제.
- photo capture 삭제는 photo_capture_id를 null로 만듦.
- consent revoke/delete 후 camera/AI 및 조건부 third-party 동의의 immutable consent_snapshot id/version/acceptedAt은 유지.
- profile의 user_id/photo_capture_id가 부모 report와 다르면 consistency trigger가 거부.
- profile insert 실패 시 부모 report transaction rollback.
- 같은 user/type/version의 concurrent consent PUT이 사용자 row lock으로 활성 history row 하나만 만듦.

- [ ] **Step 2: 실패를 확인한다**

Run:

    (cd services/backend && python -m pytest -q tests/test_db_scripts.py)

Expected: 새 테이블/migration marker가 없어 실패.

- [ ] **Step 3: fresh schema와 DBML을 수정한다**

schema.sql의 analysis_reports 뒤에 다음 의미의 테이블을 추가한다.

    create table if not exists analysis_face_profiles (
      report_id uuid primary key,
      user_id uuid not null,
      photo_capture_id uuid,
      schema_version text not null,
      status text not null,
      dominant_shape text,
      confidence_gap double precision,
      profile_payload jsonb not null,
      camera_consent_id uuid,
      consent_version text not null,
      consent_accepted_at timestamptz not null,
      consent_snapshot jsonb not null,
      analyzed_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_analysis_face_profiles_status
        check (status in ('full_success', 'partial_success', 'blocked', 'failed')),
      constraint chk_analysis_face_profiles_shape
        check (dominant_shape is null or dominant_shape in
          ('oval', 'round', 'square', 'heart', 'oblong', 'diamond', 'triangle')),
      constraint chk_analysis_face_profiles_gap
        check (confidence_gap is null or confidence_gap between 0 and 1),
      constraint chk_analysis_face_profiles_payload
        check (jsonb_typeof(profile_payload) = 'object'),
      constraint chk_analysis_face_profiles_consent_snapshot
        check (jsonb_typeof(consent_snapshot) = 'object')
    );

FK:

- report_id → analysis_reports.id on delete cascade.
- user_id → users.id on delete cascade.
- photo_capture_id → photo_captures.id on delete set null.
- camera_consent_id → user_consents.id on delete set null.

consent_snapshot은 서버가 검증한 cameraAnalysis, aiProcessing, 조건부 thirdPartyAi 각각의 consentId, version, acceptedAt을 가진다. 클라이언트가 snapshot을 보내지 않는다.

인덱스:

    (user_id, analyzed_at desc)
    (dominant_shape, analyzed_at desc) where dominant_shape is not null

user_consents의 기존 non-unique history index는 유지한다. 기존 중복 row migration 실패와 동의 이력 소실을 피하기 위해 unique constraint를 추가하지 않는다. DBML도 같은 컬럼·Ref·index를 반영한다.

analysis_face_profiles의 user_id/photo_capture_id는 approved schema의 조회 index와 삭제 추적을 위해 유지하되 부모와 어긋나지 않도록 before insert or update trigger가 analysis_reports의 user_id/photo_capture_id 일치를 검증한다. denormalized status/dominant_shape/confidence_gap은 클라이언트 별도 값이 아니라 검증된 profile_payload에서 서버가 추출한다. updated_at trigger도 추가한다.

- [ ] **Step 4: 기존 DB post migration과 schema checker를 수정한다**

init_db.py의 POST_SCHEMA_MIGRATIONS에 schema.sql:analysis-face-profiles-v1을 추가한다. 이미 schema.sql:v3 marker가 있는 DB에도 테이블·FK·constraint·index·consistency/updated_at trigger가 적용되어야 한다.

check_schema.py에는 table과 핵심 columns report_id, user_id, photo_capture_id, profile_payload, schema_version, consent_version, consent_snapshot을 추가한다.

- [ ] **Step 5: DB 테스트를 통과시킨다**

Run:

    (cd services/backend && python -m pytest -q tests/test_db_scripts.py)
    (cd services/backend && python -m pytest -q tests/test_analysis_face_profiles_postgres.py)

Expected: 첫 명령은 항상 통과. 두 번째는 AURA_TEST_DATABASE_URL이 없으면 명시적으로 skip하고, CI에서는 pgvector/pgvector:pg16 service와 설정된 URL로 반드시 실행·통과한다. fresh schema와 legacy+post-migration은 서로 다른 임시 schema에서 검증한다.

backend-ci.yml의 PostgreSQL service image를 pgvector/pgvector:pg16으로 바꾸고 integration step에 AURA_TEST_DATABASE_URL을 명시한다. init_db/check_schema integration은 이 테스트 DB에 migration을 먼저 적용한 뒤 실행한다.

- [ ] **Step 6: 커밋한다**

    git add docs/backend/schema.sql docs/backend/aws-postgresql-schema.dbml services/backend/app/db/init_db.py services/backend/app/db/check_schema.py services/backend/tests/test_db_scripts.py services/backend/tests/test_analysis_face_profiles_postgres.py .github/workflows/backend-ci.yml
    git commit -m "feat: 얼굴 프로필 저장 스키마 추가"

---

## Task 9: 백엔드 중첩 계약과 report/profile 원자 저장을 구현한다

**Files:**

- Create: services/backend/app/schemas/face_profile.py
- Modify: services/backend/app/schemas/analysis.py
- Create: services/backend/app/services/analysis_face_profiles.py
- Create: services/backend/app/services/analysis_execution_guard.py
- Modify: services/backend/app/api/analysis.py
- Modify: services/backend/app/workers/job_dispatcher.py
- Modify: services/backend/app/services/openai_analysis.py
- Create: services/backend/tests/test_analysis_face_profiles.py
- Modify: services/backend/tests/test_ai_media_authorization.py
- Modify: services/backend/tests/test_validation_contract.py
- Modify: services/backend/tests/test_merged_async_user_journeys.py
- Modify: services/backend/tests/test_ai_job_worker.py
- Modify: services/backend/tests/test_account_deletion.py
- Modify: services/backend/tests/test_analysis_face_profiles_postgres.py

- [ ] **Step 1: Pydantic 검증 실패 테스트를 작성한다**

FaceProfileResultModel은 CamelModel을 상속하되 model_config에서 extra forbid, allow_inf_nan false를 사용한다. 제네릭 측정 모델은 value null일 때 nullReason을 요구하고 confidence를 0..1로 제한한다. TypeScript의 quality/color/faceBalance/eyesAndBrows/nose/mouth/faceShape/beautyCoreFeatures/existingAnalysis/provenance를 각각 중첩 Pydantic model로 동일하게 선언한다.

테스트:

- 정상 full/partial/blocked profile은 통과.
- full인데 required value가 null, partial인데 누락이 없음, blocked인데 blockingReasons가 비어 있거나 dominantShape가 있는 상태 불일치는 422.
- confidence -0.1/1.1, NaN/Infinity, 잘못된 shape, 점수 합 불일치, top2 불일치, 빈 nullReason은 422.
- rawLandmarks, landmarks, depthMap, calibrationData, semanticMatte, roiPixels, trainingUseAllowed true는 422.
- schemaVersion 불일치는 422.

공개 POST가 사용하는 AnalysisJobCreate에는 request_payload와 분리된 필수 face_profile을 추가한다.

    face_profile: FaceProfileResultModel = Field(alias='faceProfile')

model validator는 photoCaptureId를 필수로 하고 captureId UUID가 photoCaptureId와 같음을 검증한다. 공개 POST에는 client-controlled legacy escape hatch나 기본값을 두지 않는다. legacy queue/report 복원은 별도 내부 AnalysisJobReplay 모델로만 허용하고 public router가 그 모델을 받지 않는다. 기존 pending legacy job도 공용 실행 경계의 활성 AI 동의가 없으면 외부 호출 전에 cancel한다. 전체 faceProfile JSON은 256 KiB, warning/trait/string 길이는 Task 1과 같은 상한을 적용한다.

- [ ] **Step 2: transaction/consent/소유권 실패 테스트를 작성한다**

fake pool/connection은 transaction enter/commit/rollback을 기록한다.

- camera/AI/현재 settings에서 필요한 third-party 동의가 없거나 stale/revoked면 403이며 report insert 0회.
- profile captureId와 photoCaptureId가 다르면 422.
- media/photo 소유권 실패면 profile insert 0회.
- report insert 성공 후 profile insert 실패면 rollback, dispatch 0회.
- 둘 다 성공하면 commit 뒤 dispatch 1회.
- blocked/failed profile은 report/profile을 저장하지만 AI/third-party provider dispatch 0회이고 retake error code를 반환.
- AI 실패 후 profile row는 남음.
- create 후 동의를 철회한 inline BackgroundTasks와 SQS worker 양쪽 모두 provider call 0회, report cancelled.
- text provider 뒤 동의 철회 시 embedding Bedrock과 detached OpenAI image provider call 0회.
- provider 호출 중 철회 시 text/vector 결과 저장 0회, 생성 image object는 outbox cleanup되고 report reference 0회.
- text만 끝난 processing report는 embedding/image를 정상 진행하고 모든 필수 단계 뒤에만 completed로 전환.
- processing 중 report delete 시 cancelled/deleted 상태를 background update가 덮지 않고, 이후 provider call과 profile 재생성 0회.
- media/photo active row 검증과 concurrent soft-delete가 FOR SHARE lock으로 직렬화됨.

- [ ] **Step 3: 실패를 확인한다**

Run:

    (cd services/backend && python -m pytest -q tests/test_analysis_face_profiles.py tests/test_validation_contract.py tests/test_ai_media_authorization.py)

Expected: schema/service/transaction 부재로 실패.

- [ ] **Step 4: 중첩 schema와 persistence service를 구현한다**

analysis_face_profiles.py는 다음 책임만 가진다.

- FaceProfile model_dump를 JSON으로 직렬화.
- camera_analysis, ai_processing, 조건부 third_party_ai consent snapshot 검증/선택.
- insert_analysis_face_profile(connection, report_id, user_id, photo_capture_id, profile, consent).
- join row의 profile_payload decode.
- list용 summary와 detail용 full mapper.

create_analysis_job은 db.pool.acquire와 connection.transaction을 먼저 열고, owned-media/photo-capture helper가 동일 connection을 받을 수 있게 확장한다. user row는 FOR KEY SHARE, media_assets와 photo_captures의 소유권/active 상태 row는 non-key soft-delete UPDATE와 충돌하는 FOR SHARE로 잠그고 consent도 FOR SHARE로 재검증해 검증과 insert 사이 TOCTOU를 막는다.

트랜잭션 내부 순서:

1. user, media, photo capture의 동일 사용자 소유권과 active 상태를 같은 connection에서 잠금/재검증.
2. camera_analysis는 모든 profile에서 검증한다. full_success/partial_success로 AI dispatch가 가능한 경우에만 ai_processing과 조건부 third_party_ai도 for share로 재검증한다.
3. analysis_reports insert.
4. 검증된 model에서 status/dominant_shape/confidence_gap을 서버가 추출하고 필수 동의 consent_snapshot과 함께 analysis_face_profiles insert.
5. commit.
6. full_success/partial_success만 commit 이후 inline/SQS dispatch. blocked/failed는 profile을 보존하되 report를 failed/retake 상태로 반환하고 외부 AI를 호출하지 않는다.

profile은 analysis_reports.detail_payload에 복제하지 않는다.

- [ ] **Step 5: 조회·worker·AI 입력을 연결한다**

공유 ANALYSIS_MEDIA_SELECT에 full payload를 넣지 않는다. ANALYSIS_SUMMARY_SELECT와 ANALYSIS_DETAIL_SELECT를 분리하고, 사용하는 모든 query에 다음 join을 명시한다.

    left join analysis_face_profiles afp on afp.report_id = r.id

summary select:

    afp.status as face_profile_status
    afp.dominant_shape as face_profile_dominant_shape
    afp.confidence_gap as face_profile_confidence_gap
    afp.schema_version as face_profile_schema_version

detail select 추가:

    afp.profile_payload as face_profile

jobs/{id}와 reports/{id}는 ANALYSIS_DETAIL_SELECT로 full faceProfile을 반환한다. reports 목록은 ANALYSIS_SUMMARY_SELECT만 사용해 DB에서도 full JSON을 읽지 않고 다음 최소 summary만 반환한다.

    {
      "hasFaceProfile": true,
      "faceProfileSummary": {
        "status": "full_success",
        "dominantShape": "oval",
        "confidenceGap": 0.23,
        "schemaVersion": "aura-face-profile-v1"
      }
    }

job_dispatcher는 별도 테이블을 join해 검증된 faceProfile의 압축 요약만 AI request에 합성한다. analysis_execution_guard.require_execution_allowed는 report가 deleted_at null이고 status가 pending/processing인지, ai_processing과 조건부 third_party_ai가 현재 active인지 한 번에 확인한다. report는 text만 끝났다고 completed로 바꾸지 않고 text와 필수 image batch가 끝나고 embedding도 success/skipped/failed 중 terminal 상태가 될 때까지 processing을 유지하며 마지막 원자 update에서만 completed가 된다.

이 guard를 외부 provider 경계의 호출 직전과 응답 persist 직전에 호출한다.

1. run_analysis_job_background의 text provider 직전과 text detail_payload 저장 직전.
2. update_analysis_report_embedding의 Bedrock embedding 직전과 vector update 직전.
3. generate_analysis_images_background 시작, 각 OpenAI image item 직전, provider 응답 뒤 S3 upload 직전, media/report reference 저장 직전.

철회/deleted/cancelled이면 어느 경로에서도 다음 외부 호출 없이 report를 cancelled로 유지하고 FACE_ANALYSIS_CONSENT_REVOKED 또는 ANALYSIS_REPORT_CANCELLED를 기록한다. 이미 시작된 단일 provider HTTP 호출을 되돌릴 수는 없지만 post-call guard가 text/vector/image 결과를 DB에 저장하지 않고 후속 호출을 중단한다. image object가 S3에 생성된 뒤 마지막 guard가 실패하면 media deletion outbox에 즉시 넣고 report에 연결하지 않는다. camera_analysis 철회는 미래 촬영을 막지만 이미 저장된 report/profile은 사용자가 삭제하기 전까지 보존한다.

모든 background update analysis_reports 쿼리는 where id = $1 and deleted_at is null and status <> 'cancelled' 조건을 사용하고, update가 0 rows이면 즉시 종료한다. report delete transaction이 profile을 지운 뒤 background code는 profile을 insert/upsert하지 않는다.

openai_analysis prompt는 FaceProfile 수치를 사실 기준으로 사용하고 사진만 보고 다른 기하값을 발명하지 말라고 명시한다. 원본 landmarks/depth는 prompt에 없다.

- [ ] **Step 6: soft delete에서 profile을 즉시 삭제한다**

현재 report DELETE는 analysis_reports를 hard delete하지 않는다. 기존 SELECT ... FOR UPDATE가 사용자의 report 소유권을 확인한 다음, 같은 transaction에서 다음을 실행하고 나서 부모를 soft delete한다.

    delete from analysis_face_profiles
    where report_id = $1 and user_id = $2

계정 hard delete의 cascade도 test_account_deletion.py에서 검증한다.

- [ ] **Step 7: focused backend 테스트를 통과시킨다**

Run:

    (cd services/backend && python -m pytest -q tests/test_analysis_face_profiles.py tests/test_validation_contract.py tests/test_ai_media_authorization.py tests/test_merged_async_user_journeys.py tests/test_ai_job_worker.py tests/test_account_deletion.py tests/test_analysis_face_profiles_postgres.py)

Expected: 모두 exit 0.

- [ ] **Step 8: 커밋한다**

    git add services/backend/app/schemas/face_profile.py services/backend/app/schemas/analysis.py services/backend/app/services/analysis_face_profiles.py services/backend/app/services/analysis_execution_guard.py services/backend/app/api/analysis.py services/backend/app/workers/job_dispatcher.py services/backend/app/services/openai_analysis.py services/backend/tests/test_analysis_face_profiles.py services/backend/tests/test_ai_media_authorization.py services/backend/tests/test_validation_contract.py services/backend/tests/test_merged_async_user_journeys.py services/backend/tests/test_ai_job_worker.py services/backend/tests/test_account_deletion.py services/backend/tests/test_analysis_face_profiles_postgres.py
    git commit -m "feat: 얼굴 프로필 원자 저장과 조회 구현"

---

## Task 10: 모바일 요청 계약과 현재·과거 보고서 매핑을 연결한다

**Files:**

- Modify: apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.ts
- Modify: apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.test.ts
- Modify: apps/mobile/src/shared/types/faceAnalysis.ts
- Modify: apps/mobile/src/shared/services/faceAnalysisService.ts
- Modify: apps/mobile/src/shared/services/faceAnalysisService.test.ts
- Create: apps/mobile/src/shared/services/faceAnalysisProfileMapping.ts
- Create: apps/mobile/src/shared/services/faceAnalysisProfileMapping.test.ts
- Modify: apps/mobile/src/shared/mocks/faceAnalysis.mock.ts
- Modify: apps/mobile/src/shared/mocks/faceAnalysis.mock.test.ts
- Modify: apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx
- Modify: scripts/mobile/run-face-capture-upload-contract.mjs
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: 직렬화·역직렬화 테스트를 먼저 작성한다**

분석 요청 body는 다음 모양을 갖는다.

    {
      photoCaptureId,
      sourceMediaId,
      previewMediaId,
      runImmediately: true,
      requestPayload: {
        task: 'face_makeup_recommendation_report_v1',
        faceVerticalThirds
      },
      faceProfile
    }

테스트는 faceProfile이 top-level에 한 번만 들어가고, request body 전체 문자열에 다음 단어가 없는지 확인한다.

    rawLandmarks
    landmarks
    depthMap
    nativeDepthToken
    calibrationData
    semanticMatte
    sourceUri
    roiPixels

response mapping은 detail faceProfile을 우선하고, legacy report에는 undefined를 허용한다. malformed/unknown version profile은 버리고 legacy faceShape 문자열로 fallback한다. React Native 의존성이 없는 faceAnalysisProfileMapping.ts로 parser/precedence를 분리하고 face-profile Node 러너에서 실제 실행한다. 기존 faceAnalysisService.test.ts와 TSX tests는 typecheck 계약으로 유지한다.

blocked/failed FaceProfile create 응답은 저장 성공을 확인한 뒤 AI polling을 시작하지 않고 FACE_PROFILE_RETAKE_REQUIRED 오류와 statusReason을 Loading route에 전달한다. UI는 일반 서버 실패가 아니라 정확한 no-face/multiple-face/pose/quality 재촬영 안내를 표시한다.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm --prefix apps/mobile run test:face-capture-upload
    npm run mobile:test:face-profile
    npm run mobile:typecheck

Expected: faceProfile 인자와 report type이 없어 실패.

- [ ] **Step 3: 요청과 report mapping을 구현한다**

buildFaceAnalysisRequestPayload와 createFaceAnalysisReportFromCapture에 필수 FaceProfileResult를 추가한다. 공개 API에는 client-controlled legacy/version 우회 필드를 보내지 않으며 faceProfile.schemaVersion 자체가 저장 계약 버전이다. faceAnalysisRoutes는 촬영 직후 준비되어 FaceCaptureUploadResult에 붙은 derived profile을 전달한다.

FaceAnalysisReport:

    faceProfile?: FaceProfileResult;
    faceProfileSummary?: {
      status: FaceProfileStatus;
      dominantShape: FaceShapeLabel | null;
      confidenceGap: number | null;
      schemaVersion: string;
    };

mapBackendJobToFaceAnalysisReport는 parseFaceProfile을 거친 full profile만 사용한다. deterministic shape 표시가 유효하면 AI legacy faceShape보다 우선한다.

- [ ] **Step 4: 테스트를 통과시킨다**

Run:

    npm --prefix apps/mobile run test:face-capture-upload
    npm run mobile:test:face-profile
    npm run mobile:typecheck

Expected: 모두 exit 0.

- [ ] **Step 5: 커밋한다**

    git add apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.ts apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.test.ts apps/mobile/src/shared/types/faceAnalysis.ts apps/mobile/src/shared/services/faceAnalysisService.ts apps/mobile/src/shared/services/faceAnalysisService.test.ts apps/mobile/src/shared/services/faceAnalysisProfileMapping.ts apps/mobile/src/shared/services/faceAnalysisProfileMapping.test.ts apps/mobile/src/shared/mocks/faceAnalysis.mock.ts apps/mobile/src/shared/mocks/faceAnalysis.mock.test.ts apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx scripts/mobile/run-face-capture-upload-contract.mjs scripts/mobile/run-face-profile-contract.mjs
    git commit -m "feat: 얼굴 프로필 분석 요청과 보고서 매핑 연결"

---

## Task 11: 보고서 화면에 전체 분석 섹션을 표시한다

**Files:**

- Create: apps/mobile/src/features/face-analysis/components/FaceShapeProfileCard.tsx
- Create: apps/mobile/src/features/face-analysis/components/FaceProfileMeasurementSection.tsx
- Create: apps/mobile/src/features/face-analysis/components/FaceProfileQualityCard.tsx
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisProfileSections.ts
- Create: apps/mobile/src/features/face-analysis/services/faceAnalysisProfileSections.test.ts
- Modify: apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx
- Modify: apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.test.tsx
- Modify: apps/mobile/src/features/face-analysis/services/faceAnalysisReportDetailModel.ts
- Modify: apps/mobile/src/features/face-analysis/components/FaceAnalysisReportCard.tsx
- Modify: apps/mobile/src/features/face-analysis/components/FaceAnalysisReportCard.test.tsx
- Modify: apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportsListScreen.tsx
- Modify: scripts/mobile/run-face-profile-contract.mjs

- [ ] **Step 1: ready/mixed/blocked/legacy UI 계약 테스트를 작성한다**

React Native를 import하지 않는 faceAnalysisProfileSections.test.ts를 face-profile Node 러너에 연결해 다음 데이터 모델을 실제 실행한다. TSX component test는 typecheck 계약으로 유지한다.

- ready: 얼굴형, Top 2 rule score, 근거 특징 표시.
- mixed: “A와 B가 함께 보여요” 표시.
- blocked: 임의 얼굴형 대신 재촬영 사유 표시.
- partial: 측정 가능한 섹션은 표시하고 null 항목에는 측정 불가 사유.
- historical detail: session-only prop 없이 server report.faceProfile로 표시.
- legacy: FaceProfile 섹션은 숨기고 기존 보고서가 깨지지 않음.

- [ ] **Step 2: 실패를 확인한다**

Run:

    npm run mobile:typecheck

Expected: 새 component/type 부재로 실패.

- [ ] **Step 3: 숫자 덤프가 아닌 섹션형 UI를 구현한다**

순서:

1. 얼굴형: dominant/mixed, Top 2, explanationTraits.
2. 얼굴 균형: 세로 3분할, 세로/가로, 이마·광대·턱·친, 턱선.
3. 눈·눈썹.
4. 코·입.
5. 피부·컬러: 대비, 균일도, 상대 붉은기/황색도, 퍼스널 컬러.
6. 분석 품질: pose, blur, lighting, framing, TrueDepth 사용 여부, warning.

faceAnalysisProfileSections.ts가 섹션 순서, 표시 label/value, confidence-aware copy, nullReason copy를 만들고 UI component는 그 모델만 렌더링한다. 기본 화면에는 해석과 주요 비율만 보이고, 상세 disclosure에서 값·confidence·source·nullReason을 표시한다. 기존 theme token, Tamagui, lucide만 사용한다.

ReportsList의 카드에는 full profile이 아니라 summary dominant/mixed label만 사용한다.

- [ ] **Step 4: UI type/test를 통과시킨다**

Run:

    npm run mobile:test:face-profile
    npm run mobile:typecheck

Expected: 모두 exit 0.

- [ ] **Step 5: 커밋한다**

    git add apps/mobile/src/features/face-analysis/components/FaceShapeProfileCard.tsx apps/mobile/src/features/face-analysis/components/FaceProfileMeasurementSection.tsx apps/mobile/src/features/face-analysis/components/FaceProfileQualityCard.tsx apps/mobile/src/features/face-analysis/services/faceAnalysisProfileSections.ts apps/mobile/src/features/face-analysis/services/faceAnalysisProfileSections.test.ts apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.tsx apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportDetailScreen.test.tsx apps/mobile/src/features/face-analysis/services/faceAnalysisReportDetailModel.ts apps/mobile/src/features/face-analysis/components/FaceAnalysisReportCard.tsx apps/mobile/src/features/face-analysis/components/FaceAnalysisReportCard.test.tsx apps/mobile/src/features/face-analysis/screens/FaceAnalysisReportsListScreen.tsx scripts/mobile/run-face-profile-contract.mjs
    git commit -m "feat: 얼굴 프로필 전체 결과 화면 추가"

---

## Task 12: OpenAPI·개인정보 guard·전체 회귀 검증을 완료한다

**Files:**

- Modify: docs/backend/API_CONTRACT.md
- Modify: docs/backend/openapi.json
- Modify: .github/workflows/mobile-ci.yml
- Modify: services/backend/tests/test_export_openapi.py
- Modify: services/backend/tests/test_security.py
- Modify: services/backend/tests/test_route_contract.py
- Review: docs/faceData_WEI/AURA_FACE_PROFILE_FUTURE_CONSIDERATIONS_KO.md
- Review: docs/superpowers/specs/2026-07-12-face-profile-analysis-design.md
- Modify: docs/superpowers/plans/2026-07-12-face-profile-analysis.md

- [ ] **Step 1: API와 개인정보 회귀 테스트를 추가한다**

test_export_openapi.py는 FaceProfile schema와 consent paths를 확인한다. test_security.py는 oversized profile, unknown raw fields, NaN, 다른 사용자 profile 조회를 거부하는지 확인한다.

mobile-ci.yml은 working-directory가 apps/mobile이므로 다음 app-local 명령을 추가한다.

    npm run test:face-profile
    npm run test:face-profile-native-privacy
    npm run test:face-capture-upload
    npm run test:personal-color
    npm run test:unity-bridge
    npm run typecheck

- [ ] **Step 2: backend focused와 전체 테스트를 실행한다**

Run:

    (cd services/backend && python -m pytest -q tests/test_analysis_face_profiles.py tests/test_user_consents.py tests/test_validation_contract.py tests/test_ai_media_authorization.py tests/test_ai_job_worker.py tests/test_account_deletion.py tests/test_db_scripts.py tests/test_export_openapi.py tests/test_security.py)
    (cd services/backend && python -m pytest -q)

Expected: 모두 exit 0.

- [ ] **Step 3: OpenAPI를 재생성하고 schema checker를 실행한다**

Run:

    (cd services/backend && python -m app.ops.export_openapi --output ../../docs/backend/openapi.json)
    (cd services/backend && python -m pytest -q tests/test_db_scripts.py)
    (cd services/backend && python -m pytest -q tests/test_analysis_face_profiles_postgres.py)

Expected: OpenAPI와 정적 schema test는 항상 성공. PostgreSQL test는 AURA_TEST_DATABASE_URL이 없으면 skip하고 CI pgvector service에서는 반드시 통과한다. 실제 checker는 CI에서 DATABASE_URL을 test service로 설정하고 python -m app.db.init_db 이후 python -m app.db.check_schema를 실행한다.

- [ ] **Step 4: mobile/native 전체 검증을 실행한다**

Run:

    npm run mobile:test:face-profile
    npm --prefix apps/mobile run test:face-profile-native-privacy
    npm --prefix apps/mobile run test:face-capture-upload
    npm --prefix apps/mobile run test:personal-color
    npm run mobile:test:face-ratio-distortion
    npm run mobile:test:unity-bridge
    npm run mobile:typecheck
    plutil -lint apps/mobile/ios/AURA.xcodeproj/project.pbxproj
    node scripts/mobile/run-ios-face-profile-native-tests.mjs
    xcodebuild -workspace apps/mobile/ios/AURA.xcworkspace -scheme AURA -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /tmp/aura-face-profile-final-derived CODE_SIGNING_ALLOWED=NO build

Expected: 모두 exit 0.

- [ ] **Step 5: 실제 네트워크/DB payload에 원본이 없는지 최종 검색한다**

Run:

    npm --prefix apps/mobile run test:face-profile-native-privacy
    rg -n "rawLandmarks|rawDepth|depthMap|calibrationData|roiPixels|nativeDepthToken|nativeMatteToken" services/backend/app docs/backend/schema.sql apps/mobile/src/features/face-capture/services/faceCaptureUploadContract.ts apps/mobile/src/shared/services/faceAnalysisService.ts

Expected:

- allowlist 기반 privacy script가 production serializer, fetch body, logger, native saved image를 검사해 통과.
- 제한된 rg 대상에서는 금지 키가 0건. token은 capture local type, native analyzer, discard 경로에만 존재한다.

- [ ] **Step 6: 완료 기준을 한 줄씩 확인하고 체크한다**

- 한 번 촬영으로 범위의 모든 항목을 계산 시도함.
- 모든 공개 측정값은 value 또는 nullReason을 가짐.
- ready/mixed 얼굴형은 7개 rule score 합 1, Top 2, gap이 있고, blocked는 0점 map·빈 top2·null dominant로 추측하지 않음.
- TrueDepth 지원/미지원 모두 완료됨.
- 원본 landmarks/depth/matte/calibration/ROI가 network/DB/log/AI에 없음.
- AI dispatch 전 report/profile transaction commit이 끝남.
- AI 실패 후 profile이 유지됨.
- 현재·과거 detail이 같은 FaceProfile을 렌더링함.
- report soft delete와 account hard delete 모두 profile을 삭제함.
- 서버 동의가 없거나 철회되면 새 분석이 차단됨.
- trainingUseAllowed는 항상 false이며 학습 파이프라인이 없음.
- 법률 검토 후 도입할 항목은 future considerations 문서에만 남아 있음.

- [ ] **Step 7: 최종 커밋한다**

    git add docs/backend/API_CONTRACT.md docs/backend/openapi.json .github/workflows/mobile-ci.yml services/backend/tests/test_export_openapi.py services/backend/tests/test_security.py services/backend/tests/test_route_contract.py docs/superpowers/plans/2026-07-12-face-profile-analysis.md
    git commit -m "test: 얼굴 프로필 전체 분석 회귀 검증"

---

## Physical-device follow-up gate

코드 완료와 별개로 배포 전 TrueDepth 지원 실제 iPhone에서 다음을 검증한다.

- front TrueDepth 촬영 결과가 nativeDepthToken을 60초 안에 한 번만 소비함.
- hair/skin semantic matte는 nativeMatteToken으로만 공유되고 촬영 직후 폐기됨.
- 기존 720p→Photo capability rung과 live greenlight frame dimensions/CPU 성능이 회귀하지 않음.
- photo/depth orientation과 selfie mirror가 동일하게 정렬됨.
- 얼굴-카메라 거리와 3D ratio가 자세를 바꿔도 2D보다 안정적임.
- capture watchdog fallback 이후 stale token이 남지 않음.
- 앱 background, memory warning, 화면 이탈에서 token이 폐기됨.
- camera/gallery에서 업로드되는 정화 JPEG에 depth, disparity, portrait matte, semantic matte, calibration, GPS/EXIF auxiliary data가 포함되지 않음.
- Charles/프록시와 서버 로그에서 raw landmark/depth/token이 관찰되지 않음.

이 gate가 실패하면 TrueDepth 파생값만 feature flag로 비활성화하고 2D FaceProfile 출시를 유지한다.
