#import "AURAFaceRatioHairline.h"

#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>

// Scan / decision constants (docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md §튜닝 상수).
// Every constant can be overridden at runtime through options[@"tuning"][<name>] so thresholds
// can be tuned from TS with Fast Refresh, without a native rebuild. Keep names in sync with
// `FaceRatioHairlineTuning` in apps/mobile/src/features/face-ratio/constants.ts.

// Forehead ROI (doc v0.2 §4.3.3), fractions of face width (|idx234.x - idx454.x|).
static const double kHairlineRoiHalfWidthFraction = 0.28;   // roiX = faceCenterX ± faceWidth * this
static const double kHairlineRoiTopOffsetFraction = 0.35;   // roiY0 = idx10.y - faceWidth * this
static const double kHairlineRoiBottomMarginFraction = 0.03; // roiY1 = G.y - faceWidth * this

// Column scan (doc v0.2 §4.3.4). Alpha thresholds are on 0..1 normalized matte alpha.
static const double kHairlineHairAlphaThreshold = 0.45;
static const double kHairlineSkinAlphaThreshold = 0.35;
static const double kHairlineGradientThreshold = 0.25;
// Resolution-relative windows (fractions of matte height, with pixel floors applied in code:
// hair >= 2px, skin >= 3px, gradient offset >= 2px).
static const double kHairlineHairWindowFraction = 0.005;
static const double kHairlineSkinWindowFraction = 0.010;
static const double kHairlineGradientOffsetFraction = 0.004;
static const double kHairlineSampledColumnCount = 48;

// Post-processing.
static const double kHairlineOutlierMaxDeviationFraction = 0.08; // |y - median| < faceWidth * this
static const double kHairlineMinCandidateCount = 8;
static const double kHairlineMinSkinFraction = 0.20;             // hairlineVisible gate
static const double kHairlineMinGapToGlabellaFraction = 0.02;    // H.y <= G.y - faceWidth * this

// Confidence formula (plan §0.4): lightingQuality dropped (no honest input here), renormalized.
// confidence = 0.40*boundarySharpness + 0.30*candidateConsistency
//            + 0.20*foreheadSkinVisibility + 0.10*poseQuality
static const double kHairlineWeightBoundarySharpness = 0.40;
static const double kHairlineWeightCandidateConsistency = 0.30;
static const double kHairlineWeightForeheadSkinVisibility = 0.20;
static const double kHairlineWeightPoseQuality = 0.10;
static const double kHairlineSharpnessNormGradient = 0.60; // gradient at which sharpness saturates
static const double kHairlineSkinVisibilityNorm = 0.60;    // skinFraction at which visibility saturates
// poseQuality = 1 - clamp(max(|yaw|/8, |pitch|/8, |roll|/5), 0, 1) — mirrors JS pose gate limits.
static const double kHairlinePoseYawLimitDeg = 8.0;
static const double kHairlinePosePitchLimitDeg = 8.0;
static const double kHairlinePoseRollLimitDeg = 5.0;

static double AURAHairlineTuningValue(NSDictionary *_Nullable options,
                                      NSString *key,
                                      double fallback) {
  NSDictionary *tuning = options[@"tuning"];
  if (![tuning isKindOfClass:[NSDictionary class]]) {
    return fallback;
  }
  NSNumber *value = tuning[key];
  if (![value isKindOfClass:[NSNumber class]]) {
    return fallback;
  }
  return value.doubleValue;
}

// Silence unused-constant warnings until the detection body lands (TODO below consumes these).
__attribute__((unused)) static void AURAHairlineReferenceConstants(void) {
  (void)kHairlineRoiHalfWidthFraction;
  (void)kHairlineRoiTopOffsetFraction;
  (void)kHairlineRoiBottomMarginFraction;
  (void)kHairlineHairAlphaThreshold;
  (void)kHairlineSkinAlphaThreshold;
  (void)kHairlineGradientThreshold;
  (void)kHairlineHairWindowFraction;
  (void)kHairlineSkinWindowFraction;
  (void)kHairlineGradientOffsetFraction;
  (void)kHairlineSampledColumnCount;
  (void)kHairlineOutlierMaxDeviationFraction;
  (void)kHairlineMinCandidateCount;
  (void)kHairlineMinSkinFraction;
  (void)kHairlineMinGapToGlabellaFraction;
  (void)kHairlineWeightBoundarySharpness;
  (void)kHairlineWeightCandidateConsistency;
  (void)kHairlineWeightForeheadSkinVisibility;
  (void)kHairlineWeightPoseQuality;
  (void)kHairlineSharpnessNormGradient;
  (void)kHairlineSkinVisibilityNorm;
  (void)kHairlinePoseYawLimitDeg;
  (void)kHairlinePosePitchLimitDeg;
  (void)kHairlinePoseRollLimitDeg;
  (void)AURAHairlineTuningValue;
}

NSDictionary *AURAFaceRatioDetectHairline(NSURL *imageFileURL,
                                          AURAFaceRatioHairlineLandmarks landmarks,
                                          NSDictionary *_Nullable options) {
  // TODO(codex): Phase 2 구현 — docs/AURA_FACE_HAIRLINE_APPLE_MATTE_PLAN_KO_v0.1.md 참조.
  // 1) CGImageSourceCreateWithURL(imageFileURL) → CGImageSourceCopyPropertiesAtIndex(0)에서
  //    kCGImagePropertyOrientation(EXIF) 읽기. 실패 시 {failureReason:"image_unreadable"}.
  // 2) CGImageSourceCopyAuxiliaryDataInfoAtIndex(src, 0,
  //      kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte / ...SkinMatte)
  //    → +[AVSemanticSegmentationMatte
  //         semanticSegmentationMatteFromImageSourceAuxiliaryDataType:dictionaryRepresentation:error:]
  //    → -[AVSemanticSegmentationMatte semanticSegmentationMatteByApplyingExifOrientation:]
  //      (1)의 EXIF 값 적용 — landmark가 EXIF-upright 공간이므로 좌표계 일치.
  //    → matte.mattingImage (kCVPixelFormatType_OneComponent8). 둘 다 없으면
  //      {matte:{hairAvailable:NO,...}, failureReason:"no_aux_data"}.
  // 3) landmarks로 forehead ROI 계산(§4.3.3, 위 kHairlineRoi* 상수). normalized 좌표를 다리로
  //    matte 픽셀 공간에서만 스캔(hair/skin matte 크기가 다를 수 있으므로 각자 normX*w, normY*h로
  //    샘플링, 업스케일 금지). ROI가 비거나 뒤집히면 {failureReason:"roi_invalid"}.
  // 4) column scan(§4.3.4): kHairlineSampledColumnCount개 열에서 hairAbove/skinBelow/gradient
  //    조건으로 첫 경계 후보 수집 → median 기준 outlier 제거(kHairlineOutlierMaxDeviationFraction)
  //    → weighted median(가중치 = gradient × center-x 가우시안)으로 H 결정.
  //    후보 < kHairlineMinCandidateCount → {failureReason:"no_candidates"}.
  // 5) confidence(§0.4 공식, 위 kHairlineWeight* 상수) + visible 판정
  //    (candidates ≥ min && skinFraction ≥ kHairlineMinSkinFraction &&
  //     H.y ≤ G.y - faceWidth * kHairlineMinGapToGlabellaFraction).
  // 6) options[@"debugArtifacts"]가 truthy면 gray CGBitmapContext로 matte PNG 2종 +
  //    ROI/후보/H선을 그린 hairline-debug.png를 NSTemporaryDirectory() 하위에 쓰고 URI 반환.
  // 반환 형식은 AURAFaceRatioHairline.h 헤더 주석의 계약을 따를 것.
  (void)imageFileURL;
  (void)landmarks;
  (void)options;
  return @{ @"failureReason": @"not_implemented" };
}
