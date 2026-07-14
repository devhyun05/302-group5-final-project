#!/usr/bin/env bash
# Exports the Unity project as an Xcode project into unity/builds/ios-xcode,
# then builds UnityFramework.framework into unity/builds/ios.
set -euo pipefail
cd "$(dirname "$0")/.."

UNITY="${UNITY_PATH:-/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity}"
if [[ ! -x "$UNITY" ]]; then
  echo "Unity editor not found at: $UNITY"
  echo "Set UNITY_PATH to your editor binary, e.g."
  echo "  UNITY_PATH=/Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity $0"
  exit 1
fi

# 1단계: 프로젝트 설정만 별도 세션으로 실행.
# UNITY_XR_ARKIT_LOADER_ENABLED 디파인이 ProjectSettings에 저장되고,
# 다음 세션이 그 디파인이 켜진 채로 에디터 코드를 컴파일해야
# ARKit 네이티브 라이브러리(libUnityARKit.a)가 빌드에 포함된다.
"$UNITY" -batchmode -quit \
  -projectPath "$PWD/unity" \
  -buildTarget iOS \
  -executeMethod ARMakeup.EditorTools.BuildScript.SetupProject \
  -logFile -

# 2단계: 실제 익스포트 (새 세션 = 디파인 반영된 상태)
"$UNITY" -batchmode -quit \
  -projectPath "$PWD/unity" \
  -buildTarget iOS \
  -executeMethod ARMakeup.EditorTools.BuildScript.ExportIOS \
  -logFile -

exec "$(dirname "$0")/build-ios-framework.sh"
