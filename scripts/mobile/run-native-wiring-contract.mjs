// 네이티브·서비스 "기능 배선" 계약 가드.
//
// 도입 배경: 020cb33 이 CocoaPods MediaPipe 를 제거하면서 퍼스널컬러·얼굴비율
// 분석기를 "컴파일은 되지만 런타임에 무조건 reject 하는 껍데기"로 만들어 머지했고,
// CI 는 ObjC 를 컴파일하지 않아 이를 잡지 못했다. protected-paths-guard 의
// 불변식(대량삭제·pod 삭제·#if 금지)이 구조적 퇴화를 막고, 이 스크립트는 그
// 반대편 — "핵심 심볼과 배선이 존재하는가" — 를 심볼 수준에서 지킨다.
//
// 검사 원칙:
// - 존재해야 하는 것(export 모듈/메서드, 랜드마크 적재, 게이트·보정 배선)과
//   존재하면 안 되는 것(020cb33 스텁 마커)을 함께 본다.
// - import 만이 아니라 호출부까지 확인한다 — import 를 남긴 채 호출만 지우는
//   퇴화도 잡기 위함.
// - 새 기능이 머지되면 여기에 배선 검사를 함께 추가한다 (예: 조명 보정 포팅 시
//   illuminationCorrection import/호출 + 네이티브 sclera 심볼).

import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

let failures = 0;

function fail(message) {
  console.error(`[aura:native-wiring] FAIL ${message}`);
  failures += 1;
}

// 주석을 제거한다 — "배선을 주석 처리했는데 문자열이 주석에 남아 가드를
// 통과"하는 우회를 막는다(020cb33 류 조용한 무력화의 흔한 형태). 문자열
// 리터럴 안의 // 는 드물게 오탐할 수 있으나, 이 가드가 찾는 import/호출
// 패턴은 문자열 리터럴에 나타나지 않으므로 안전하다.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // 블록 주석 (ObjC/TS 공통)
    // 라인 주석. 콜론 뒤 '//'(예: https://)는 URL 이므로 제외한다 — 이 한 패턴이
    // 전체 줄 주석까지 커버하므로 별도 '^\s*//' 규칙은 불필요(중복, gemini 리뷰).
    .replace(/(?<!:)\/\/[^\n]*/g, ' ');
}

function readSource(relativePath) {
  return stripComments(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

function assertContains(source, needle, label) {
  const found = needle instanceof RegExp ? needle.test(source) : source.includes(needle);
  if (!found) {
    fail(label);
  }
}

function assertNotContains(source, needle, label) {
  if (source.includes(needle)) {
    fail(label);
  }
}

// ── 1. 퍼스널컬러 정지영상 분석기 (ObjC) ────────────────────────────────
{
  const path = 'apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m';
  const src = readSource(path);
  assertContains(src, 'RCT_EXPORT_MODULE()', `${path}: RCT_EXPORT_MODULE 이 없다 — RN 모듈 등록이 사라짐`);
  assertContains(src, /RCT_EXPORT_METHOD\(analyze:/, `${path}: analyze 메서드 export 가 없다`);
  assertContains(src, 'AURAPCLandmarkSetFromJS', `${path}: homuler 랜드마크 적재 함수(AURAPCLandmarkSetFromJS 정의)가 없다`);
  // 정의 존재만이 아니라 실제 '적재 호출'을 검증한다 — 정의는 남기고 대입을
  // `= {0}` 등으로 바꾸면 모든 입력이 런타임 no_face 가 되는데(코덱스 재현),
  // 문자열 존재 검사만으로는 그 퇴화를 못 잡는다.
  assertContains(src, /=\s*AURAPCLandmarkSetFromJS\(/, `${path}: homuler 랜드마크 적재 호출(= AURAPCLandmarkSetFromJS(...))이 없다 — 얼굴 검출이 죽어 항상 no_face`);
  assertContains(src, /static AURAPCPoint AURAPCLandmark\(/, `${path}: 랜드마크 접근자(AURAPCLandmark)가 없다`);
  assertContains(src, /AURAPCLandmark\(landmarks/, `${path}: 적재된 랜드마크(landmarks)를 실제로 샘플링하는 호출이 없다`);
  // 조명 보정(sclera) 배선 — 8164840 포팅으로 도입. 이 심볼들이 사라지면
  // 흰자 샘플링이 죽어 illuminationCorrection 이 조용히 미적용으로 퇴화한다.
  assertContains(src, 'kScleraLeftEyeIndices', `${path}: sclera 랜드마크 인덱스가 없다 — 조명 보정 입력이 사라짐`);
  assertContains(src, 'scleraLeft', `${path}: sclera 영역(regions.scleraLeft) 방출이 없다`);
  assertNotContains(src, 'MEDIAPIPE_UNAVAILABLE', `${path}: 020cb33 스텁 마커(MEDIAPIPE_UNAVAILABLE)가 재유입됐다 — 분석기가 무조건 reject 하는 껍데기일 수 있음`);
}

// ── 2. 얼굴비율 정지영상 분석기 (ObjC) ─────────────────────────────────
{
  const path = 'apps/mobile/ios/AURA/AURAFaceRatioAnalyzer.m';
  const src = readSource(path);
  assertContains(src, 'RCT_EXPORT_MODULE()', `${path}: RCT_EXPORT_MODULE 이 없다 — RN 모듈 등록이 사라짐`);
  assertContains(src, /RCT_EXPORT_METHOD\(analyze:/, `${path}: analyze 메서드 export 가 없다`);
  // 실제 homuler 랜드마크 변환 호출 검증 — 정의만 남기고 호출을 끊는 퇴화 차단.
  assertContains(src, /=\s*AURAFaceRatioLandmarksFromJS\(/, `${path}: homuler 랜드마크 변환 호출(= AURAFaceRatioLandmarksFromJS(...))이 없다`);
  assertNotContains(src, 'MEDIAPIPE_UNAVAILABLE', `${path}: 020cb33 스텁 마커(MEDIAPIPE_UNAVAILABLE)가 재유입됐다`);
}

// ── 3. 얼굴 세로비율 서비스 배선 (TS) ──────────────────────────────────
// 롤 보정과 품질 게이트가 보고서 흐름에서 빠지면 "왜곡된 비율이 조용히 노출"된다.
{
  const path = 'apps/mobile/src/features/face-ratio/services/faceVerticalThirdsService.ts';
  const src = readSource(path);
  assertContains(src, /from\s+['"`]\.\/faceVerticalThirdsQualityGate['"`]/, `${path}: 품질 게이트 import 가 없다`);
  assertContains(src, /evaluateFaceVerticalThirdsQuality\(/, `${path}: 품질 게이트 호출부가 없다`);
  assertContains(src, /from\s+['"`]\.\/faceVerticalThirdsRollCorrection['"`]/, `${path}: 롤 보정 import 가 없다`);
  assertContains(src, /applyRollCorrectionToKeypoints\(/, `${path}: 롤 보정 호출부가 없다`);
  assertContains(src, /requestFaceLandmarks\(/, `${path}: homuler 랜드마크 요청 호출부가 없다 — 얼굴 검출 없이 분석기가 no_face 로 죽는다`);
}

// ── 4. 퍼스널컬러 서비스 배선 (TS) ─────────────────────────────────────
{
  const path = 'apps/mobile/src/features/personal-color/services/personalColorService.ts';
  const src = readSource(path);
  assertContains(src, /from\s+['"`]\.\/personalColorQualityGate['"`]/, `${path}: 품질 게이트 import 가 없다`);
  assertContains(src, /evaluatePersonalColorQuality\(/, `${path}: 품질 게이트 호출부가 없다`);
  assertContains(src, /from\s+['"`]\.\/personalColorAnalyzerNative['"`]/, `${path}: 네이티브 분석기 import 가 없다`);
  assertContains(src, /analyzePersonalColorPhoto\(/, `${path}: 네이티브 분석기 호출부가 없다`);
  assertContains(src, /requestFaceLandmarks\(/, `${path}: homuler 랜드마크 요청 호출부가 없다`);
  // 조명 보정(A/B) 배선 — 8164840 포팅. import 를 남긴 채 호출만 지우는 퇴화도 잡는다.
  assertContains(src, /from\s+['"`]\.\/personalColorCore\/illuminationCorrection['"`]/, `${path}: 조명 보정 import 가 없다`);
  assertContains(src, /deriveIlluminationCorrection\(/, `${path}: 조명 보정 호출부가 없다 — 보정이 조용히 죽음`);
}

// ── 5. 보고서 연결 배선 (TS) ───────────────────────────────────────────
// 보정 결과가 보고서로 흐르는 경로: cameraMetadata pass-through + 보고 메인(reported).
{
  const path = 'apps/mobile/src/app/navigation/routes/faceAnalysisRoutes.tsx';
  const src = readSource(path);
  assertContains(src, /cameraMetadata:\s*selectedFaceCapture\.cameraMetadata/, `${path}: 보고서 촬영의 cameraMetadata 전달이 없다 — WB 보정/캘리브레이션 수집이 죽음`);
  assertContains(src, /outcome\.reported/, `${path}: 보고 메인 결과(outcome.reported) 배선이 없다 — 화면·저장 정합`);
}

// ── 6. 화면·저장 정합: 서비스가 reported(보정 우선)를 저장하는가 (F13) ──
{
  const path = 'apps/mobile/src/features/personal-color/services/personalColorService.ts';
  const src = readSource(path);
  assertContains(src, /const reported =/, `${path}: reported(보고 메인) 확정 배선이 없다`);
  assertContains(src, /writeResultJson\(input\.sessionId,\s*reported\b/, `${path}: 저장이 reported 가 아니다 — 화면 corrected/저장 baseline 불일치(F13)`);
}

// ── 7. Xcode Compile Sources 멤버십 (빌드 불변식) ──────────────────────
// 분석기 .m 이 소스 내용상 온전해도 PBXSourcesBuildPhase(Compile Sources)에서
// 빠지면 컴파일·링크가 안 돼 RN 네이티브 모듈이 런타임에 존재하지 않는다 — 소스만
// 보는 심볼 검사로는 못 잡던 회귀(코덱스 #244). pbxproj 의 '/* ... */' 는 주석이
// 아니라 구조의 일부이므로 stripComments 없이 raw 로 읽는다.
{
  const path = 'apps/mobile/ios/AURA.xcodeproj/project.pbxproj';
  const pbx = readFileSync(resolve(repoRoot, path), 'utf8');
  const begin = pbx.indexOf('/* Begin PBXSourcesBuildPhase section */');
  const end = pbx.indexOf('/* End PBXSourcesBuildPhase section */');
  if (begin === -1 || end === -1 || end < begin) {
    fail(`${path}: PBXSourcesBuildPhase 섹션을 찾지 못함 — Compile Sources 검증 불가`);
  } else {
    const sourcesPhase = pbx.slice(begin, end);
    // Xcode 는 Sources 빌드 페이즈 항목을 '<uuid> /* <name> in Sources */,' 로 쓴다.
    // 이 문자열이 Sources 페이즈 블록 안에 있어야 실제로 컴파일된다.
    for (const name of [
      'AURAPersonalColorAnalyzer.m',
      'AURAFaceRatioAnalyzer.m',
      'E7NativeLipBoundaryProviders.swift',
    ]) {
      assertContains(
        sourcesPhase,
        `${name} in Sources`,
        `${path}: ${name} 이 Compile Sources(PBXSourcesBuildPhase)에 없다 — 소스는 있어도 빌드/링크에서 빠져 런타임 네이티브 모듈이 사라진다`,
      );
    }
  }
}

// ── 8. 메인 AR recipe + 튜토리얼 가이드 배선 ──────────────────────────
// ARFilter 는 대상 Unity 에 없는 NativeBridge flat-filter 경로가 아니라
// RNBridge.ApplyRecipeJson 을 사용해야 한다. 가이드 sender/receiver 이름도
// UnitySendMessage 계약이라 한 글자만 달라도 화면은 정상인데 선만 조용히 사라진다.
{
  const screenPath = 'apps/mobile/src/features/ar/screens/ARFilterScreen.tsx';
  const screen = readSource(screenPath);
  assertContains(
    screen,
    /createUnityMakeupRecipeBatchFromARFilterSelections\(/,
    `${screenPath}: 메인 AR 선택을 RNBridge recipe 로 컴파일하지 않는다`,
  );
  assertContains(
    screen,
    /postUnityMakeupRecipe\(/,
    `${screenPath}: 메인 AR recipe 전송 호출이 없다`,
  );
  assertNotContains(
    screen,
    'postUnityFilterParams(',
    `${screenPath}: 존재하지 않는 NativeBridge flat-filter 전송이 다시 연결됐다`,
  );

  const bridgePath = 'apps/mobile/src/features/ar/services/unityMakeupBridge.ts';
  const bridge = readSource(bridgePath);
  assertContains(bridge, "gameObject: 'AuraTutorialGuide'", `${bridgePath}: 가이드 GameObject 계약이 없다`);
  assertContains(bridge, "applyMethod: 'ApplyJson'", `${bridgePath}: 가이드 메서드 계약이 없다`);
  assertContains(bridge, "capturePhotoMethod: 'CapturePhoto'", `${bridgePath}: AR 사진 촬영 메서드 계약이 없다`);
  assertContains(bridge, /postUnityTutorialGuide\(/, `${bridgePath}: 가이드 전송 함수가 없다`);
  assertContains(bridge, /requestUnityARPhotoCapture\(/, `${bridgePath}: AR 사진 촬영 요청 함수가 없다`);
  assertContains(bridge, /clearScheduledNativePost\(retryKey\)/, `${bridgePath}: 촬영 timeout 뒤 지연 셔터 예약을 취소하지 않는다`);

  const guidePath = 'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/AuraTutorialGuide.cs';
  const guide = readSource(guidePath);
  assertContains(guide, 'class AuraTutorialGuide', `${guidePath}: 가이드 receiver 가 없다`);
  assertContains(guide, /public void ApplyJson\(string json\)/, `${guidePath}: ApplyJson UnitySendMessage 진입점이 없다`);
  assertContains(guide, /public void CapturePhoto\(string requestId\)/, `${guidePath}: 사진 셔터 UnitySendMessage 진입점이 없다`);
  assertContains(guide, /type\\\":\\\"ar_photo_captured/, `${guidePath}: 사진 촬영 완료 이벤트가 없다`);
  assertContains(guide, /FramePresenter\.Instance\.ImageToViewport\(/, `${guidePath}: 얼굴 좌표를 현재 카메라 뷰포트로 투영하지 않는다`);
  assertContains(guide, /renderQueue\s*=\s*5000/, `${guidePath}: 가이드가 target 최종 E3 합성보다 앞에서 지워질 수 있다`);
  assertContains(guide, /sortingOrder\s*=\s*32760/, `${guidePath}: E3와 같은 queue에서 최종 overlay 순서가 비결정적이다`);

  const bootstrapPath = 'apps/unity/MakeupAR/Assets/Scripts/MediaPipeGraft/AuraMediaPipeGraftBootstrap.cs';
  const bootstrap = readSource(bootstrapPath);
  assertContains(bootstrap, 'new GameObject("AuraTutorialGuide")', `${bootstrapPath}: 안정적인 가이드 GameObject 를 만들지 않는다`);
  assertContains(bootstrap, /_tutorialGuide\.Init\(cam, source\)/, `${bootstrapPath}: MediaPipe source 를 가이드에 연결하지 않는다`);

  assertContains(screen, /onCapture=\{handleCapture\}/, `${screenPath}: 셔터가 실제 Unity 촬영 함수에 연결되지 않았다`);
  assertContains(screen, /initialShapePreset/, `${screenPath}: 저장된 핏 프리셋을 라이브 recipe에 반영하지 않는다`);
  assertContains(screen, /supportsVideoCapture=\{false\}/, `${screenPath}: 미지원 동영상 모드가 다시 노출됐다`);
  assertContains(screen, /supportsCameraFacingToggle=\{false\}/, `${screenPath}: ARKit 얼굴 추적이 지원하지 않는 후면 전환이 다시 노출됐다`);
  assertContains(screen, /supportsGallery=\{false\}/, `${screenPath}: Unity 필터가 적용되지 않는 갤러리 편집이 라이브 AR에 다시 노출됐다`);

  const routePath = 'apps/mobile/src/app/navigation/routes/arRoutes.tsx';
  const route = readSource(routePath);
  assertContains(route, /initialShapePreset:\s*shapePreset/, `${routePath}: 핏 저장값을 ARFilter 복귀 params로 운반하지 않는다`);

  const e3Path = 'apps/unity/MakeupAR/Assets/Scripts/E3RegionMaskOverlay.cs';
  const e3 = readSource(e3Path);
  assertContains(e3, /recipe\.MaskOffsetX/, `${e3Path}: 핏 좌우 이동을 마스크 material에 반영하지 않는다`);
  assertContains(e3, /recipe\.MaskScale/, `${e3Path}: 핏 크기를 마스크 material에 반영하지 않는다`);
  assertContains(e3, /recipe\.MaskRotation/, `${e3Path}: 핏 각도를 마스크 material에 반영하지 않는다`);
}

if (failures > 0) {
  console.error(`[aura:native-wiring] ${failures}건 실패 — 기능 배선이 끊겼습니다. 020cb33 류 회귀인지 확인하세요.`);
  process.exit(1);
}

console.log('[aura:native-wiring] PASS — 분석기 심볼·서비스 배선 전부 확인');
