#!/usr/bin/env bash
# Builds UnityFramework.framework from the exported Xcode project and places it
# where @azesmway/react-native-unity expects it: unity/builds/ios.
set -euo pipefail
cd "$(dirname "$0")/.."

XCODE_PROJ="unity/builds/ios-xcode/Unity-iPhone.xcodeproj"
DERIVED="$PWD/unity/builds/ios-derived"

if [[ ! -d "$XCODE_PROJ" ]]; then
  echo "Exported Xcode project not found: $XCODE_PROJ"
  echo "Run scripts/export-unity-ios.sh (or the 'AR Makeup > 3. Export iOS' menu in Unity) first."
  exit 1
fi

xcodebuild -project "$XCODE_PROJ" \
  -scheme UnityFramework \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  CONFIGURATION_BUILD_DIR="$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build

mkdir -p unity/builds/ios
rm -rf unity/builds/ios/UnityFramework.framework
cp -R "$DERIVED/UnityFramework.framework" unity/builds/ios/

# ★ 중요: @azesmway/react-native-unity는 vendored_frameworks를 node_modules 안의
# ios/UnityFramework.framework에서 임베드한다. 이를 갱신하는 podspec prepare_command
# (cp ../../../unity/builds/ios/ ios/)은 CocoaPods가 pod을 "다운로드"할 때만 실행되고,
# 오토링크된 :path 개발 pod에는 pod install 시 실행되지 않는다. 따라서 여기서 직접
# 복사하지 않으면, 프레임워크를 새로 빌드해도 앱엔 예전 프레임워크가 임베드되어
# Unity 쪽 변경(셰이더/스크립트)이 실기기에 반영되지 않는다.
POD_IOS="node_modules/@azesmway/react-native-unity/ios"
if [[ -d "$POD_IOS" ]]; then
  rm -rf "$POD_IOS/UnityFramework.framework"
  cp -R unity/builds/ios/UnityFramework.framework "$POD_IOS/"
  echo "✅ UnityFramework.framework → $POD_IOS (앱 임베드 소스 갱신)"
fi

# MediaPipe 사용 시: UnityFramework가 참조하는 MediaPipeUnity.framework(동적)를
# 최종 앱에 임베드해야 한다. 일반 Unity 빌드에선 플러그인 후처리가 자동으로 하지만
# UaaL에선 RN 앱이 직접 임베드해야 하므로, 로컬 pod으로 노출한다 (Podfile에서 참조).
MP_FW="unity/builds/ios-xcode/Frameworks/com.github.homuler.mediapipe/Runtime/Plugins/iOS/MediaPipeUnity.framework"
if [[ -d "$MP_FW" ]]; then
  mkdir -p unity/builds/ios-frameworks
  rm -rf unity/builds/ios-frameworks/MediaPipeUnity.framework
  cp -R "$MP_FW" unity/builds/ios-frameworks/
  cat > unity/builds/ios-frameworks/MediaPipeUnity.podspec << 'PODSPEC'
Pod::Spec.new do |s|
  s.name = "MediaPipeUnity"
  s.version = "0.16.3"
  s.summary = "MediaPipe Unity Plugin native framework (UaaL embed)"
  s.homepage = "https://github.com/homuler/MediaPipeUnityPlugin"
  s.license = { :type => "MIT" }
  s.authors = "homuler"
  s.platform = :ios, "15.0"
  s.source = { :git => "https://github.com/homuler/MediaPipeUnityPlugin.git", :tag => "v0.16.3" }
  s.vendored_frameworks = "MediaPipeUnity.framework"
end
PODSPEC
  echo "✅ MediaPipeUnity.framework → unity/builds/ios-frameworks (pod으로 임베드됨)"
fi

echo
echo "✅ UnityFramework.framework → unity/builds/ios (+ node_modules pod)"
echo "   프레임워크가 node_modules pod에 직접 복사되었으므로 pod install 없이 바로 재빌드해도 된다."
echo "   Build the RN app: npx react-native run-ios --udid <UDID>  (AR은 실기기 전용)"
echo "   (참고: pod install 만으로는 프레임워크가 갱신되지 않는다 — 위 복사 단계가 필수)"
