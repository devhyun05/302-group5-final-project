# Third-Party Notices / 오픈소스 고지

이 앱은 아래 오픈소스 소프트웨어와 ML 모델을 포함합니다. 상용 배포 시 이 고지를
앱 내 "오픈소스 라이선스" 화면으로 최종 사용자에게 노출해야 합니다(✅ 완료,
2026-07-13: 설정 → "오픈소스 라이선스" 리더에 고지 화면 추가 — 아래 Third Party
Notices 요약 및 대표 전문 포함. 구현: src/components/LegalScreen.tsx +
src/legal/ossLicenses.ts).

## Google MediaPipe (모델 및 프레임워크)

- **face_landmarker.task** — 얼굴 랜드마크 모델
- **selfie_multiclass_256x256.tflite** — 멀티클래스 셀피 세그멘테이션 모델
- **canonical_face_model.obj** — 캐노니컬 페이스 메시

출처: Google MediaPipe (https://github.com/google-ai-edge/mediapipe)
라이선스: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
Copyright 2019-2025 The MediaPipe Authors.

> ⚠️ 확인필요(법무): storage.googleapis.com/mediapipe-models 호스팅 모델 2종
> (face_landmarker, selfie_multiclass)의 라이선스가 저장소 루트 Apache-2.0과
> 동일 적용되는지 서면 재확인 권장 — 웹 조사로는 모델 전용 라이선스 페이지를
> 찾지 못함(간접 근거만 확보, 2026-07-09 조사).

## MediaPipe Unity Plugin

출처: https://github.com/homuler/MediaPipeUnityPlugin (v0.16.3)
라이선스: MIT License, Copyright (c) 2021 homuler

번들된 네이티브 프레임워크(MediaPipeUnity.framework)의 서드파티 고지 전문은
`unity/Library/PackageCache/com.github.homuler.mediapipe@*/Third Party Notices.md`
(Abseil 등 다수 Apache-2.0 컴포넌트, 2678줄)에 있음 — **빌드 산출물에는 포함되지
않으므로 앱 고지 화면에 번들함** (✅ 완료, 2026-07-13: 컴포넌트 29종 요약을
`src/legal/ossLicenses.ts` 의 `BUNDLED_NOTICES` 로 앱에 번들해 리더에 노출. 전문
필요 시 위 원본 파일 참조).

## React Native 의존성

package.json 의존성 전수 조사(767개, transitive 포함) 결과 GPL/AGPL/LGPL 계열
0건 — 전부 MIT/Apache-2.0/BSD 계열 (2026-07-09 조사). ✅ 완료(2026-07-13):
`npx license-checker --production --json` 스냅샷으로 프로덕션 의존성 539종 목록을
`src/legal/ossLicenses.ts` 에 생성, 대표 라이선스 전문(MIT/Apache-2.0/ISC/BSD)과
함께 앱 리더에 노출. 의존성 갱신 시 재생성 필요.

## 확인필요 잔여 항목 (담당자 판단)

1. Unity 라이선스 등급 — 연 매출 $200K 초과 시 Personal 불가, Runtime Fee 정책 확인.
2. App Store "App Privacy" 설문 — 얼굴 데이터 완전 온디바이스 처리(네트워크 전송
   0건 확인)라 "Data Not Collected" 신고 가능성 높음. 제출 시 최신 가이드라인 재확인.
3. 연령 등급 — 소셜/UGC/웹뷰 없음, 통상 4+ 예상.
