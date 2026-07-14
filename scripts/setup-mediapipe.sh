#!/usr/bin/env bash
# MediaPipe Unity Plugin과 필수 에셋을 내려받아 Unity 프로젝트에 연결한다.
#  1. com.github.homuler.mediapipe UPM tarball → unity/Packages/local/  (~277MB, git 제외)
#  2. face_landmarker.task (랜드마커 모델)     → unity/Assets/StreamingAssets/
#  3. canonical_face_model.obj (468pt 토폴로지) → unity/Assets/StreamingAssets/
#  4. selfie_multiclass_256x256.tflite (세그멘테이션 모델, §11 오클루전) → unity/Assets/StreamingAssets/
#  5. unity/Packages/manifest.json에 의존성 추가
# 실행 후 Unity를 다시 열면 ARMakeup.Runtime.asmdef의 versionDefines가
# MEDIAPIPE 디파인을 자동 활성화한다.
set -euo pipefail
cd "$(dirname "$0")/.."

MP_VERSION="0.16.3"
TGZ_NAME="com.github.homuler.mediapipe-${MP_VERSION}.tgz"
TGZ_DIR="unity/Packages/local"
SA_DIR="unity/Assets/StreamingAssets"

mkdir -p "$TGZ_DIR" "$SA_DIR"

if [[ ! -f "$TGZ_DIR/$TGZ_NAME" ]]; then
  echo "▶ MediaPipeUnityPlugin v$MP_VERSION 다운로드 중 (~277MB)…"
  curl -L --fail -o "$TGZ_DIR/$TGZ_NAME" \
    "https://github.com/homuler/MediaPipeUnityPlugin/releases/download/v${MP_VERSION}/${TGZ_NAME}"
else
  echo "✔ $TGZ_NAME 이미 존재"
fi

if [[ ! -f "$SA_DIR/face_landmarker.task" ]]; then
  echo "▶ face_landmarker.task 다운로드 중…"
  curl -L --fail -o "$SA_DIR/face_landmarker.task" \
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
else
  echo "✔ face_landmarker.task 이미 존재"
fi

if [[ ! -f "$SA_DIR/canonical_face_model.obj" ]]; then
  echo "▶ canonical_face_model.obj 다운로드 중…"
  curl -L --fail -o "$SA_DIR/canonical_face_model.obj" \
    "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj"
else
  echo "✔ canonical_face_model.obj 이미 존재"
fi

# SelfieMulticlass 세그멘테이션 모델(~16MB) — 오클루전 마스크(SegmentationSource, 설계 §11).
# 없어도 앱은 동작한다(세그 비활성 = 오클루전 게이트 항상 1).
if [[ ! -f "$SA_DIR/selfie_multiclass_256x256.tflite" ]]; then
  echo "▶ selfie_multiclass_256x256.tflite 다운로드 중…"
  curl -L --fail -o "$SA_DIR/selfie_multiclass_256x256.tflite" \
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
else
  echo "✔ selfie_multiclass_256x256.tflite 이미 존재"
fi

echo "▶ manifest.json에 의존성 추가…"
node -e "
const fs = require('fs');
const path = 'unity/Packages/manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
const dep = 'file:local/${TGZ_NAME}';
if (manifest.dependencies['com.github.homuler.mediapipe'] !== dep) {
  manifest.dependencies['com.github.homuler.mediapipe'] = dep;
  fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  console.log('  추가됨: com.github.homuler.mediapipe → ' + dep);
} else {
  console.log('  이미 설정됨');
}
"

echo
echo "✅ MediaPipe 셋업 완료. Unity 프로젝트를 다시 열거나 재익스포트하세요."
echo "   (unity/builds 산출물이 있다면 npm run unity:android / unity:ios 재실행)"
