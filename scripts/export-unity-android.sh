#!/usr/bin/env bash
# Exports the Unity project as an Android library (unityLibrary) into unity/builds/android.
set -euo pipefail
cd "$(dirname "$0")/.."

UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity}"
if [[ ! -x "$UNITY" ]]; then
  echo "Unity editor not found at: $UNITY"
  echo "Set UNITY_PATH to your editor binary, e.g."
  echo "  UNITY_PATH=/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity $0"
  exit 1
fi

# 설정과 익스포트를 별도 세션으로 분리 (XR 관련 스크립팅 디파인이
# 익스포트 세션 시작 전에 ProjectSettings에 반영되어 있어야 함)
"$UNITY" -batchmode -quit \
  -projectPath "$PWD/unity" \
  -buildTarget Android \
  -executeMethod ARMakeup.EditorTools.BuildScript.SetupProject \
  -logFile -

"$UNITY" -batchmode -quit \
  -projectPath "$PWD/unity" \
  -buildTarget Android \
  -executeMethod ARMakeup.EditorTools.BuildScript.ExportAndroid \
  -logFile -

echo
echo "✅ unityLibrary exported → unity/builds/android"
echo "   Now build the RN app: npm run android"
