# AR Makeup — React Native + Unity 얼굴 보정/메이크업 필터 앱

React Native(UI) + Unity as a Library(AR 렌더링) 구조의 iOS/Android 얼굴 필터 앱입니다.

| 레이어 | 역할 | 기술 |
|---|---|---|
| React Native (루트) | 필터 프리셋/강도 슬라이더/립컬러 선택/카메라 전환/촬영 UI | RN 0.86, `@azesmway/react-native-unity` |
| Unity (`unity/`) | 카메라, 얼굴 트래킹, 피부 보정·메이크업 렌더링 | Unity 6000.3, AR Foundation 6.4 + **MediaPipe Face Landmarker** |

얼굴 트래킹은 이중 경로입니다:

- **MediaPipe 경로 (권장)** — `scripts/setup-mediapipe.sh` 실행 시 활성화.
  MediaPipe Face Landmarker(478pt)가 AR Foundation 카메라 CPU 프레임으로 구동됩니다.
  전/후면 카메라 모두 지원, iOS/Android 동일 canonical 토폴로지 → **마스크 한 벌**.
- **폴백 경로** — 플러그인 미설치 시 ARKit/ARCore 얼굴 트래킹(전면 전용, 플랫폼별 마스크).
  `MEDIAPIPE` 디파인은 패키지 설치 여부에 따라 asmdef versionDefines로 자동 토글됩니다.

```
RN (App.tsx)  ── postMessage('NativeBridge', 'OnMessageFromRN', json) ──▶  Unity
      ◀── onUnityMessage (ready / faceTracked / photoCaptured / error) ──
```

## 동작 방식

- **시간 동기 합성 (MediaPipe 경로의 핵심)**: 배경 영상을 ARCameraBackground(최신
  프레임)가 아니라 [FramePresenter.cs](unity/Assets/Scripts/Face/FramePresenter.cs)가
  그립니다 — MediaPipe가 랜드마크를 계산한 "바로 그 프레임"을 표시하므로 영상과
  메이크업이 같은 시점이 되어 픽셀 단위로 고정됩니다 (전문 뷰티캠 방식).
  미리보기 전체가 추론 지연(GPU ~수십 ms)만큼 균일하게 늦는 대신 어긋남이 원리적으로
  없습니다. 배경 쿼드의 꼭짓점을 랜드마크와 같은 매핑 함수로 배치하므로
  displayMatrix 추측도 불필요합니다.
- **얼굴 트래킹**: AR Foundation `ARFaceManager`가 전면 카메라에서 얼굴 메시를 추적합니다.
  씬은 비어 있고 [ARBootstrap.cs](unity/Assets/Scripts/Face/ARBootstrap.cs)가 런타임에 AR 세션/카메라/페이스 매니저를 전부 코드로 구성합니다.
- **피부 보정**: [FaceMakeup.shader](unity/Assets/Resources/FaceMakeup.shader)가 GrabPass로 얼굴 뒤에 렌더된 카메라 영상을 캡처한 뒤,
  엣지 보존 블러(bilateral)로 피부결만 스무딩하고 톤업을 적용합니다. 얼굴 메시 영역만 처리되므로 배경은 그대로입니다.
- **메이크업**: 립/블러셔/아이섀도 마스크(얼굴 메시 UV 공간) × 색상 × 강도로 피그먼트처럼 블렌딩합니다.
  마스크는 [MaskGenerator.cs](unity/Assets/Scripts/Face/MaskGenerator.cs)가 절차적으로 생성하는 근사치가 기본이며,
  `unity/Assets/Resources/Masks/{ios|android}/{lips,blush,eyeshadow}.png`에 페인팅 마스크를 넣으면 플랫폼별로 자동 대체됩니다.
  (ARKit과 ARCore는 UV 레이아웃이 달라 마스크를 두 벌 만들어야 합니다)
  립 외곽은 메시 자체를 테셀레이션합니다 — 링 각 변에 보간 정점 2개를 추가하고 매 프레임
  Catmull-Rom 스플라인(마스크 곡선과 동일 기저) 위에 배치해, 랜드마크 20각형의 직선 연결로
  입술선이 각져 보이던 문제를 기하에서 해결합니다([CanonicalFaceMesh.cs](unity/Assets/Scripts/Face/CanonicalFaceMesh.cs)).
  입꼬리(61/291)는 예각 코너라 스플라인 접선을 코드(chord) 방향으로 클램프해(건너편 제어점을 코너로 복제)
  코너 오버슈트가 만들던 입꼬리 우글거림을 막습니다 — 메시와 마스크가 같은 규칙을 씁니다.
- **눈 오버레이 (홍채 컬러렌즈 + 정밀 아이라이너)**: [IrisRenderer.cs](unity/Assets/Scripts/Face/IrisRenderer.cs)가
  얼굴 메시 뒤 큐(Transparent+10~12)에 세 메시를 매 프레임 랜드마크로 갱신해 얹습니다.
  - **컬러렌즈**: 눈동자 랜드마크(468~477)로 만든 디스크를 [Iris.shader](unity/Assets/Resources/Iris.shader)가
    GrabPass로 잡은 실제 눈동자 픽셀 위에 루마 보존 틴트(동공 보존 + 림버스 링). 눈 열림 폴리곤을
    [EyeStencil.shader](unity/Assets/Resources/EyeStencil.shader)로 스텐실=1에 기록하고 렌즈를 그 안에서만
    그려, 눈꺼풀·흰자 침범과 깜빡임 가림이 기하에서 자동 처리됩니다(폴리곤이 접히며 면적 0 → 렌즈 사라짐).
  - **아이라이너**: 상안검 체인 위 리본([Eyeliner.shader](unity/Assets/Resources/Eyeliner.shader)), 바깥
    눈꼬리→안쪽으로 두께를 테이퍼링해 눈꼬리 라이너 형태. 좌표 매핑은 FramePresenter를 공유하므로 눈동자에
    픽셀 단위로 고정됩니다. MediaPipe 경로 전용.
- **UV 템플릿 추출 (개발용)**: 앱의 "조정" 패널 맨 아래 버튼으로 현재 트래킹 중인 얼굴 메시의
  UV 와이어프레임 PNG(2048²)를 추출할 수 있습니다([UVTemplateExporter.cs](unity/Assets/Scripts/Face/UVTemplateExporter.cs)).
  이 PNG를 밑그림으로 마스크를 그리면 실제 기기 UV와 정확히 일치합니다.
  - Android는 공식 템플릿도 있습니다: [canonical_face_mesh.psd](https://github.com/google-ar/arcore-android-sdk/tree/main/assets)
  - 파일 위치 — iOS: Files 앱 > AR Makeup(문서 폴더), Android: `Android/data/com.jungle.armakeup/files`
- **촬영**: Unity가 화면을 캡처해 JPG로 저장 후 경로를 RN에 전달 → RN이 미리보기 모달 표시.

## 사전 준비

- Unity **6000.3.18f1** + 모듈: **iOS Build Support**, **Android Build Support** (OpenJDK/SDK/NDK 포함)
  - ⚠️ 현재 이 머신에는 iOS 서포트만 설치되어 있습니다. Android 빌드 전에 Unity Hub에서 Android Build Support를 추가하세요.
- Xcode + CocoaPods, Android Studio(또는 SDK)
- Node 22+, `npm install` 완료 상태

## 빌드 순서 (중요)

RN 앱은 Unity 익스포트 산출물에 의존하므로 **항상 Unity 익스포트가 먼저**입니다.
(`@azesmway/react-native-unity`의 podspec/gradle이 `unity/builds/...`를 참조)

### 1. Unity 프로젝트 최초 설정

```bash
npm run unity:setup-mediapipe   # MediaPipe 플러그인(~277MB) + 모델 + canonical 메시 다운로드
# Unity Hub에서 unity/ 폴더를 열면 패키지가 자동 설치됩니다.
# 에디터 메뉴: AR Makeup > 1. Setup Project (run once)
```

Setup이 하는 일: 빈 Main 씬 생성, 번들 ID/IL2CPP/ARM64/카메라 권한 문구 설정,
XR Plug-in Management에 ARKit/ARCore 로더 할당, ARKit Face Tracking 활성화 시도.
(자동 설정이 실패하면 Project Settings → XR Plug-in Management에서 수동으로 체크)

### 2-A. Android

```bash
npm run unity:android   # 또는 Unity 메뉴: AR Makeup > 2. Export Android
npm run android         # 실기기 권장 (ARCore 지원 기기)
```

익스포트 산출물: `unity/builds/android/unityLibrary` → `android/settings.gradle`이 include.
launcher intent-filter 제거는 익스포트 후처리에서 자동 수행됩니다.

### 2-B. iOS

```bash
npm run unity:ios       # Xcode 프로젝트 익스포트 + UnityFramework.framework 빌드까지 자동
cd ios && rm -rf Pods Podfile.lock && bundle exec pod install && cd ..
npm run ios -- --device # AR은 시뮬레이터 미지원, 실기기 전용
```

`NativeCallProxy.h` public 헤더 설정과 Data 폴더의 UnityFramework 타깃 멤버십은
[IOSPostBuild.cs](unity/Assets/Editor/IOSPostBuild.cs)가 자동 처리하므로 Xcode 수동 작업이 없습니다.
Unity를 다시 익스포트하면 **pod을 반드시 재설치**하세요. 단, framework 복사는 podspec이 아니라
`scripts/build-ios-framework.sh`가 수행합니다 — 오토링크된 `:path` 개발 pod에는 podspec
`prepare_command`가 실행되지 않으므로, `pod install`만으로는 새 UnityFramework가 앱에 들어가지 않습니다
(`npm run unity:ios`가 이 스크립트까지 자동 실행).

## 메시지 프로토콜

RN → Unity (`src/bridge/types.ts` ↔ `unity/Assets/Scripts/Bridge/BridgeMessages.cs`):

```jsonc
{ "type": "applyFilter", "filter": {
    "skinSmoothing": 0.5, "skinBrightening": 0.2,
    "lipColor": "#E04E68", "lipIntensity": 0.55,
    "blushColor": "#F08698", "blushIntensity": 0.45,
    "eyeshadowColor": "#D89AA0", "eyeshadowIntensity": 0.3,
    "irisColor": "#5B7B8C", "irisIntensity": 0.5,       // 컬러렌즈 (intensity 0 = 끔)
    "eyelinerColor": "#181418", "eyelinerIntensity": 0.6 } }
{ "type": "capture" }
{ "type": "setPaused", "paused": true }
{ "type": "setCamera", "facing": "rear" }         // 전/후면 전환 (rear는 MediaPipe 필요)
{ "type": "exportUVTemplate" }                    // 개발용: UV 와이어프레임 PNG 추출
```

Unity → RN:

```jsonc
{ "type": "ready" }                               // 기동 완료 → RN이 현재 필터 재전송
{ "type": "faceTracked", "tracked": true }        // 얼굴 인식 상태 변화
{ "type": "photoCaptured", "path": "/…/x.jpg" }   // 촬영 결과 파일 경로
{ "type": "uvTemplateExported", "path": "/…/x.png" } // UV 템플릿 파일 경로
{ "type": "error", "message": "…" }
```

## 프로젝트 구조

```
├── App.tsx                        # 메인 화면 (UnityView + 오버레이 UI)
├── src/
│   ├── bridge/types.ts            # 브리지 프로토콜 타입
│   ├── presets.ts                 # 필터 프리셋 (원본/내추럴/로지/피치/글램/스모키)
│   └── components/                # 슬라이더, 프리셋 캐러셀, 컬러 스와치
├── types/                         # react-native-unity 로컬 타입 보강
├── unity/
│   ├── Assets/Scripts/Bridge/     # NativeBridge (RN ↔ Unity JSON 허브)
│   ├── Assets/Scripts/Face/       # ARBootstrap, MakeupController, MaskGenerator
│   ├── Assets/Scripts/Capture/    # PhotoCapture
│   ├── Assets/Resources/          # FaceMakeup.shader (+ Masks/*.png 오버라이드 위치)
│   ├── Assets/Plugins/iOS/        # NativeCallProxy (UaaL iOS 메시징)
│   └── Assets/Editor/             # BuildScript(설정/익스포트), IOSPostBuild
└── scripts/                       # Unity 익스포트/프레임워크 빌드 자동화
```

## 기기 캘리브레이션 (MediaPipe 경로, 최초 실기기 테스트 시)

랜드마크 → 화면 좌표 매핑은 플랫폼·기기별 확인이 필요합니다. **재빌드 없이 앱 안에서
실시간으로 조정**할 수 있습니다:

1. 앱에서 "조정" 패널을 열고 맨 아래 캘리브레이션 줄의 **"메시 ON"**을 눌러
   얼굴 메시를 반투명 컬러로 표시
2. 시간 동기 경로(MediaPipe)에서 버튼 의미:
   - **Y플립** = 셀피 미러 토글 (화면 기준 좌우 반전)
   - **회전** = MediaPipe에 알려줄 센서 회전 (얼굴 인식 자체가 안 되면 변경)
   - **행렬** = 표시 회전 0~3 = 0/90/180/270° (영상이 돌아가 보이면 변경)
   - **컬링** = 고개 돌릴 때 실루엣 fold-over 제거 (기본 = 앞컷, 실측 확정)
3. 찾은 확정값을 코드 기본값에 반영:
   - 미러·표시회전 → [FramePresenter.cs](unity/Assets/Scripts/Face/FramePresenter.cs)의 `mirror`, `rotationSteps`
   - 회전 → [FaceLandmarkSource.cs](unity/Assets/Scripts/Face/FaceLandmarkSource.cs)의 `GuessRotationDegrees()`
4. 전면/후면 카메라 각각 확인 (회전값이 다를 수 있음)

## 마스크 생성 (scripts/generate-masks.py)

`Resources/Masks/{lips,blush,eyeshadow}.png`는 [generate-masks.py](scripts/generate-masks.py)가
canonical 메시의 실제 UV + MediaPipe 윤곽 랜드마크 인덱스로 생성합니다.
포토샵 없이 파라미터(밴드 높이, feather, 팽창)만 바꿔 재생성할 수 있고,
실기기 튜닝을 거친 현재 값이 스크립트에 주석과 함께 기록돼 있습니다.
치아 립스틱 방지는 마스크(입안 완전 차단) + 셰이더의 붉은기 게이트 2중으로 처리합니다.

## 품질 개선 로드맵

- **Phase 2**: RT 멀티패스 재구축 — 세그멘테이션 기반 이마·목 스무딩, 헤어 염색
- **Phase 3**: ~~홍채 기능(컬러렌즈, 정밀 아이라이너)~~ 구현됨([IrisRenderer.cs](unity/Assets/Scripts/Face/IrisRenderer.cs))
  + 워핑(눈 확대, 윤곽 슬림) — 예정: 합성 결과를 RenderTexture에 렌더 후 랜드마크 기반 워프 셰이더로
  풀스크린 블릿(모든 레이어가 함께 휘어 정렬 유지)
- **Phase 4**: iOS 전면 ARKit 보강 — TrueDepth 오클루전, blendshape 연동
- 갤러리 저장(PHPhotoLibrary/MediaStore)
- ~~랜드마크 스무딩~~ → One Euro 필터 + 속도 외삽 적용됨 (FaceLandmarkSource)
- ~~GPU 추론~~ → GPU delegate 적용됨 (CPU 자동 폴백)

## 트러블슈팅

- **iOS: 앱은 뜨는데 카메라 권한 요청도 없이 검은 화면** → 두 가지 확인:
  1. 기기 로그에 `Unable to load plugin UnityARKit` → 익스포트된 UnityFramework에
     `libUnityARKit.a`가 빠진 것. ARKit 패키지가 배치모드에서
     `UNITY_XR_ARKIT_LOADER_ENABLED` 디파인을 스스로 설정하지 못하는 문제로,
     `scripts/export-unity-ios.sh`가 Setup/Export를 **별도 Unity 세션 2번**으로
     실행하는 이유다. 에디터 GUI에서 익스포트할 때는 해당 없음.
  2. Unity 로그가 아예 없음 → RNUnityView Fabric 컴포넌트 미등록.
     `patches/@azesmway+react-native-unity+1.0.11.patch`(codegenConfig의
     `ios.componentProvider`)가 적용됐는지, `pod install`을 다시 했는지 확인.
- **iOS: 시작 즉시 크래시, dyld `MediaPipeUnity.framework` not loaded** →
  MediaPipeUnity 동적 프레임워크가 앱에 임베드 안 된 것. `npm run unity:ios` 재실행 후
  `pod install` (Podfile이 `unity/builds/ios-frameworks`의 로컬 pod을 자동 포함).
- **Android: `unityLibrary` 못 찾음** → Unity 익스포트를 먼저 실행 (`npm run unity:android`).
- **iOS: pod install 실패 (`UnityFramework.framework` 없음)** → `npm run unity:ios` 먼저.
- **iOS 링크 에러 `NativeCallProxy`** → Unity 재익스포트 후 pod 재설치 (`rm -rf ios/Pods ios/Podfile.lock`).
- **NDK 버전 충돌(Android)** → `android/build.gradle`의 `ndkVersion`을
  `unity/builds/android/unityLibrary/build.gradle`이 요구하는 값과 맞추세요.
- **메이크업 위치가 어긋남** → `MaskGenerator.cs`의 플랫폼별 Ellipse 좌표를 조정하거나 페인팅 마스크로 교체.
