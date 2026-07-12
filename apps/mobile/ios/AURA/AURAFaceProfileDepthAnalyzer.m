#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <simd/simd.h>
#import <float.h>
#import <math.h>

#import "AURAFaceDepthMath.h"
#import "AURATransientDepthStore.h"

FOUNDATION_EXPORT NSDictionary *AURAFaceProfileDepthApprovedSummary(
    id candidate);

// Only derived scalars leave this module. The AVDepthData, calibration, depth
// pixels, landmarks, and the opaque token remain process-local and transient.

enum {
  AURAFaceDepthLandmarkCount = 16,
};
static const NSUInteger kAURAFaceDepthNeighborhoodRadius = 2;
static const NSUInteger kAURAFaceDepthMaximumInputPointCount = 4096;
static const double kAURAFaceDepthMinimumNeighborhoodCoverage = 0.4;

static const NSInteger kAURAFaceDepthLandmarkIndices[] = {
  10, 152,       // face length
  234, 454,      // cheek width
  172, 397,      // jaw width
  148, 377,      // chin width
  103, 332,      // forehead width
  33, 133,       // anatomical right eye
  362, 263,      // anatomical left eye
  168, 4,        // nose length
};

typedef NS_ENUM(NSInteger, AURAFaceDepthAnalysisState) {
  AURAFaceDepthAnalysisStateOK,
  AURAFaceDepthAnalysisStateInvalidLandmarks,
  AURAFaceDepthAnalysisStateInsufficientDepth,
  AURAFaceDepthAnalysisStateCancelled,
  AURAFaceDepthAnalysisStateError,
};

typedef struct {
  AURAFaceDepthPoint2D normalizedPoints[AURAFaceDepthLandmarkCount];
} AURAFaceDepthLandmarkSet;

typedef struct {
  AURAFaceDepthPoint3D points[AURAFaceDepthLandmarkCount];
  double depths[AURAFaceDepthLandmarkCount];
  NSUInteger validPixelCount;
  NSUInteger totalPixelCount;
} AURAFaceDepthSamples;

static NSDictionary *AURAFaceDepthFailure(NSString *status, BOOL consumed)
{
  return @{
    @"status": status,
    @"consumed": @(consumed),
  };
}

static BOOL AURAFaceDepthDictionaryHasExactKeys(
    NSDictionary *dictionary,
    NSArray<NSString *> *expectedKeys)
{
  if (![dictionary isKindOfClass:NSDictionary.class] ||
      dictionary.count != expectedKeys.count) {
    return NO;
  }
  for (NSString *key in expectedKeys) {
    if (!dictionary[key]) {
      return NO;
    }
  }
  return YES;
}

static BOOL AURAFaceDepthBoolean(id value, BOOL *result)
{
  if (!value || CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID()) {
    return NO;
  }
  if (result) {
    *result = [value boolValue];
  }
  return YES;
}

static BOOL AURAFaceDepthApprovedNumber(
    id value,
    double minimum,
    double maximum,
    BOOL minimumExclusive,
    double *result)
{
  if (![value isKindOfClass:NSNumber.class] ||
      CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) {
    return NO;
  }
  double number = [value doubleValue];
  BOOL minimumValid = minimumExclusive ? number > minimum : number >= minimum;
  if (!isfinite(number) || !minimumValid || number > maximum) {
    return NO;
  }
  if (result) {
    *result = number;
  }
  return YES;
}

NSDictionary *AURAFaceProfileDepthApprovedSummary(id candidate)
{
  NSDictionary *safeError = AURAFaceDepthFailure(@"error", YES);
  if (![candidate isKindOfClass:NSDictionary.class]) {
    return safeError;
  }
  NSDictionary *summary = candidate;
  NSString *status = summary[@"status"];
  BOOL consumed = NO;
  if (![status isKindOfClass:NSString.class] ||
      !AURAFaceDepthBoolean(summary[@"consumed"], &consumed)) {
    return safeError;
  }

  if (![status isEqualToString:@"ok"]) {
    NSDictionary<NSString *, NSNumber *> *consumedByStatus = @{
      @"unsupported": @NO,
      @"not_found": @NO,
      @"expired": @NO,
      @"invalid_landmarks": @YES,
      @"insufficient_depth": @YES,
      @"error": @YES,
    };
    NSNumber *expectedConsumed = consumedByStatus[status];
    if (!expectedConsumed || consumed != expectedConsumed.boolValue ||
        !AURAFaceDepthDictionaryHasExactKeys(
            summary, @[@"status", @"consumed"])) {
      return safeError;
    }
    return @{@"status": [status copy], @"consumed": @(consumed)};
  }

  if (!consumed) {
    return safeError;
  }
  BOOL hasCameraDistance = summary[@"cameraDistanceMeters"] != nil;
  NSArray<NSString *> *topLevelKeys = hasCameraDistance
      ? @[
          @"status", @"consumed", @"cameraDistanceMeters",
          @"depthQuality", @"facePlane", @"ratios"
        ]
      : @[@"status", @"consumed", @"depthQuality", @"facePlane", @"ratios"];
  if (!AURAFaceDepthDictionaryHasExactKeys(summary, topLevelKeys)) {
    return safeError;
  }

  NSDictionary *quality = summary[@"depthQuality"];
  if (!AURAFaceDepthDictionaryHasExactKeys(
          quality,
          @[
            @"accuracy", @"filtered", @"validSampleRatio",
            @"medianAbsoluteDeviationMeters", @"confidence"
          ])) {
    return safeError;
  }
  NSString *accuracy = quality[@"accuracy"];
  BOOL filtered = NO;
  double validSampleRatio = 0;
  double medianAbsoluteDeviation = 0;
  double depthConfidence = 0;
  if (![accuracy isKindOfClass:NSString.class] ||
      ((![accuracy isEqualToString:@"absolute"] &&
       ![accuracy isEqualToString:@"relative"]) ||
      !AURAFaceDepthBoolean(quality[@"filtered"], &filtered) ||
      !AURAFaceDepthApprovedNumber(
          quality[@"validSampleRatio"], 0, 1, NO, &validSampleRatio) ||
      !AURAFaceDepthApprovedNumber(
          quality[@"medianAbsoluteDeviationMeters"],
          0,
          DBL_MAX,
          NO,
          &medianAbsoluteDeviation) ||
      !AURAFaceDepthApprovedNumber(
          quality[@"confidence"], 0, 1, NO, &depthConfidence))) {
    return safeError;
  }

  double cameraDistance = 0;
  if ([accuracy isEqualToString:@"absolute"]) {
    if (!hasCameraDistance ||
        !AURAFaceDepthApprovedNumber(
            summary[@"cameraDistanceMeters"],
            0,
            DBL_MAX,
            YES,
            &cameraDistance)) {
      return safeError;
    }
  } else if (hasCameraDistance) {
    return safeError;
  }

  NSDictionary *facePlane = summary[@"facePlane"];
  if (!AURAFaceDepthDictionaryHasExactKeys(
          facePlane,
          @[@"pitchDeg", @"yawDeg", @"rollDeg", @"confidence"])) {
    return safeError;
  }
  double pitch = 0;
  double yaw = 0;
  double roll = 0;
  double planeConfidence = 0;
  if (!AURAFaceDepthApprovedNumber(
          facePlane[@"pitchDeg"], -DBL_MAX, DBL_MAX, NO, &pitch) ||
      !AURAFaceDepthApprovedNumber(
          facePlane[@"yawDeg"], -DBL_MAX, DBL_MAX, NO, &yaw) ||
      !AURAFaceDepthApprovedNumber(
          facePlane[@"rollDeg"], -DBL_MAX, DBL_MAX, NO, &roll) ||
      !AURAFaceDepthApprovedNumber(
          facePlane[@"confidence"], 0, 1, NO, &planeConfidence)) {
    return safeError;
  }

  NSArray<NSString *> *ratioKeys = @[
    @"faceLengthToCheekWidth", @"jawWidthToCheekWidth",
    @"chinWidthToCheekWidth", @"foreheadWidthToCheekWidth",
    @"interEyeToCheekWidth", @"noseLengthToCheekWidth"
  ];
  NSDictionary *ratios = summary[@"ratios"];
  if (!AURAFaceDepthDictionaryHasExactKeys(ratios, ratioKeys)) {
    return safeError;
  }
  NSMutableDictionary *approvedRatios = [NSMutableDictionary dictionary];
  for (NSString *key in ratioKeys) {
    double ratio = 0;
    if (!AURAFaceDepthApprovedNumber(
            ratios[key], 0, DBL_MAX, YES, &ratio)) {
      return safeError;
    }
    approvedRatios[key] = @(ratio);
  }

  NSMutableDictionary *approved = [@{
    @"status": @"ok",
    @"consumed": @YES,
    @"depthQuality": @{
      @"accuracy": [accuracy copy],
      @"filtered": @(filtered),
      @"validSampleRatio": @(validSampleRatio),
      @"medianAbsoluteDeviationMeters": @(medianAbsoluteDeviation),
      @"confidence": @(depthConfidence),
    },
    @"facePlane": @{
      @"pitchDeg": @(pitch),
      @"yawDeg": @(yaw),
      @"rollDeg": @(roll),
      @"confidence": @(planeConfidence),
    },
    @"ratios": [approvedRatios copy],
  } mutableCopy];
  if (hasCameraDistance) {
    approved[@"cameraDistanceMeters"] = @(cameraDistance);
  }
  return [approved copy];
}

static double AURAFaceDepthClamp01(double value)
{
  return fmax(0.0, fmin(1.0, value));
}

static BOOL AURAFaceDepthFiniteNumber(id value, double *result)
{
  if (![value isKindOfClass:NSNumber.class] ||
      CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) {
    return NO;
  }
  double number = [value doubleValue];
  if (!isfinite(number)) {
    return NO;
  }
  if (result) {
    *result = number;
  }
  return YES;
}

static NSInteger AURAFaceDepthSlotForLandmark(NSInteger landmarkIndex)
{
  for (NSUInteger slot = 0; slot < AURAFaceDepthLandmarkCount; slot++) {
    if (kAURAFaceDepthLandmarkIndices[slot] == landmarkIndex) {
      return (NSInteger)slot;
    }
  }
  return -1;
}

static BOOL AURAFaceDepthWorkShouldStop(
    AURATransientDepthAnalysisContext *context,
    NSTimeInterval deadline)
{
  return context.isCancelled ||
      NSProcessInfo.processInfo.systemUptime >= deadline;
}

static AURAFaceDepthAnalysisState AURAFaceDepthParseLandmarks(
    NSDictionary *options,
    AURATransientDepthPayload *payload,
    AURATransientDepthAnalysisContext *context,
    NSTimeInterval deadline,
    AURAFaceDepthLandmarkSet *result)
{
  if (!result || ![options isKindOfClass:NSDictionary.class] ||
      AURAFaceDepthWorkShouldStop(context, deadline)) {
    return AURAFaceDepthWorkShouldStop(context, deadline)
        ? AURAFaceDepthAnalysisStateCancelled
        : AURAFaceDepthAnalysisStateInvalidLandmarks;
  }

  NSDictionary *landmarkInput = options[@"landmarks"];
  if (![landmarkInput isKindOfClass:NSDictionary.class]) {
    return AURAFaceDepthAnalysisStateInvalidLandmarks;
  }

  NSArray *points = landmarkInput[@"points"];
  double imageWidth = 0;
  double imageHeight = 0;
  if (![points isKindOfClass:NSArray.class] || points.count == 0 ||
      points.count > kAURAFaceDepthMaximumInputPointCount ||
      !AURAFaceDepthFiniteNumber(landmarkInput[@"imageWidth"], &imageWidth) ||
      !AURAFaceDepthFiniteNumber(landmarkInput[@"imageHeight"], &imageHeight) ||
      imageWidth <= 0 || imageHeight <= 0) {
    return AURAFaceDepthAnalysisStateInvalidLandmarks;
  }

  // The store owns orientation and mirroring. Caller-supplied copies are not
  // trusted because applying them twice silently misaligns depth and color.
  NSInteger orientation = payload.orientation;
  if (orientation != 1 && orientation != 3 &&
      orientation != 6 && orientation != 8) {
    return AURAFaceDepthAnalysisStateInsufficientDepth;
  }

  BOOL found[AURAFaceDepthLandmarkCount] = {NO};
  NSUInteger foundCount = 0;
  for (id value in points) {
    if (AURAFaceDepthWorkShouldStop(context, deadline)) {
      return AURAFaceDepthAnalysisStateCancelled;
    }
    if (![value isKindOfClass:NSDictionary.class]) {
      continue;
    }
    NSDictionary *point = value;
    double rawIndex = 0;
    if (!AURAFaceDepthFiniteNumber(point[@"i"], &rawIndex) ||
        rawIndex < 0 || rawIndex > (double)NSIntegerMax ||
        floor(rawIndex) != rawIndex) {
      continue;
    }
    NSInteger slot = AURAFaceDepthSlotForLandmark((NSInteger)rawIndex);
    if (slot < 0) {
      continue;
    }
    if (found[slot]) {
      return AURAFaceDepthAnalysisStateInvalidLandmarks;
    }

    double x = 0;
    double y = 0;
    if (!AURAFaceDepthFiniteNumber(point[@"x"], &x) ||
        !AURAFaceDepthFiniteNumber(point[@"y"], &y) ||
        x < 0 || x > 1 || y < 0 || y > 1) {
      return AURAFaceDepthAnalysisStateInvalidLandmarks;
    }
    AURAFaceDepthPoint2D upright = AURAFaceDepthPointToUpright(
        AURAFaceDepthPoint2DMake(x, y),
        orientation,
        payload.isMirrored);
    if (!isfinite(upright.x) || !isfinite(upright.y) ||
        upright.x < 0 || upright.x > 1 ||
        upright.y < 0 || upright.y > 1) {
      return AURAFaceDepthAnalysisStateInvalidLandmarks;
    }
    result->normalizedPoints[slot] = upright;
    found[slot] = YES;
    foundCount += 1;
  }

  return foundCount == AURAFaceDepthLandmarkCount
      ? AURAFaceDepthAnalysisStateOK
      : AURAFaceDepthAnalysisStateInvalidLandmarks;
}

static AURAFaceDepthIntrinsics AURAFaceDepthScaledIntrinsics(
    AVCameraCalibrationData *calibration,
    CGSize depthDimensions)
{
  if (!calibration) {
    return (AURAFaceDepthIntrinsics){0};
  }
  // simd matrices are column-major. The optical center is in column 2,
  // not row 2.
  simd_float3x3 matrix = calibration.intrinsicMatrix;
  AURAFaceDepthIntrinsics reference = AURAFaceDepthIntrinsicsMake(
      matrix.columns[0][0],
      matrix.columns[1][1],
      matrix.columns[2][0],
      matrix.columns[2][1],
      calibration.intrinsicMatrixReferenceDimensions);
  return AURAFaceDepthIntrinsicsScale(reference, depthDimensions);
}

static AURAFaceDepthAnalysisState AURAFaceDepthSampleLandmarks(
    AURAFaceDepthBuffer buffer,
    AURAFaceDepthIntrinsics intrinsics,
    AURAFaceDepthLandmarkSet landmarks,
    AURATransientDepthAnalysisContext *context,
    NSTimeInterval deadline,
    AURAFaceDepthSamples *result)
{
  if (!result || !intrinsics.valid) {
    return AURAFaceDepthAnalysisStateInsufficientDepth;
  }

  for (NSUInteger slot = 0; slot < AURAFaceDepthLandmarkCount; slot++) {
    // Cancellation is checked in every sampling iteration so discard remains
    // bounded even on older devices.
    if (AURAFaceDepthWorkShouldStop(context, deadline)) {
      return AURAFaceDepthAnalysisStateCancelled;
    }
    AURAFaceDepthPoint2D normalized = landmarks.normalizedPoints[slot];
    AURAFaceDepthSample sample = AURAFaceDepthMedianSample(
        buffer, normalized, kAURAFaceDepthNeighborhoodRadius);
    if (!sample.valid || sample.validSampleCount == 0 ||
        sample.validSampleRatio < kAURAFaceDepthMinimumNeighborhoodCoverage ||
        sample.totalSampleCount == 0) {
      return AURAFaceDepthAnalysisStateInsufficientDepth;
    }
    double pixelX = normalized.x * ((double)buffer.width - 1.0);
    double pixelY = normalized.y * ((double)buffer.height - 1.0);
    AURAFaceDepthPoint3D point = AURAFaceDepthUnproject(
        pixelX, pixelY, sample.depthMeters, intrinsics);
    if (!point.valid) {
      return AURAFaceDepthAnalysisStateInsufficientDepth;
    }
    result->points[slot] = point;
    result->depths[slot] = sample.depthMeters;
    result->validPixelCount += sample.validSampleCount;
    result->totalPixelCount += sample.totalSampleCount;
  }
  return AURAFaceDepthAnalysisStateOK;
}

static AURAFaceDepthPoint3D AURAFaceDepthMidpoint3D(
    AURAFaceDepthPoint3D first,
    AURAFaceDepthPoint3D second)
{
  if (!first.valid || !second.valid) {
    return (AURAFaceDepthPoint3D){0};
  }
  return AURAFaceDepthPoint3DMake(
      (first.x + second.x) / 2.0,
      (first.y + second.y) / 2.0,
      (first.z + second.z) / 2.0);
}

static NSDictionary *AURAFaceDepthBuildSummary(
    AVDepthData *depthData,
    AVCameraCalibrationData *calibration,
    AURAFaceDepthSamples samples,
    AURATransientDepthAnalysisContext *context,
    NSTimeInterval deadline)
{
  if (AURAFaceDepthWorkShouldStop(context, deadline)) {
    return AURAFaceDepthFailure(@"error", YES);
  }

  // Fit on face-surface anchors, excluding the two nose points whose intended
  // protrusion would bias the frontal plane.
  AURAFaceDepthPoint3D planePoints[14];
  for (NSUInteger index = 0; index < 14; index++) {
    planePoints[index] = samples.points[index];
  }
  AURAFaceDepthPlane plane = AURAFaceDepthFitPlane(planePoints, 14);
  if (!plane.valid || AURAFaceDepthWorkShouldStop(context, deadline)) {
    return AURAFaceDepthWorkShouldStop(context, deadline)
        ? AURAFaceDepthFailure(@"error", YES)
        : AURAFaceDepthFailure(@"insufficient_depth", YES);
  }

  AURAFaceDepthPoint3D rightEye = AURAFaceDepthMidpoint3D(
      samples.points[10], samples.points[11]);
  AURAFaceDepthPoint3D leftEye = AURAFaceDepthMidpoint3D(
      samples.points[12], samples.points[13]);
  AURAFaceDepthPose pose = AURAFaceDepthPoseFromPlane(
      plane, rightEye, leftEye);
  if (!pose.valid) {
    return AURAFaceDepthFailure(@"insufficient_depth", YES);
  }

  if (AURAFaceDepthWorkShouldStop(context, deadline)) {
    return AURAFaceDepthFailure(@"error", YES);
  }

  AURAFaceDepthPoint3D cheekStart = samples.points[2];
  AURAFaceDepthPoint3D cheekEnd = samples.points[3];
  double ratios[] = {
    AURAFaceDepthDistanceRatio(
        samples.points[0], samples.points[1], cheekStart, cheekEnd),
    AURAFaceDepthDistanceRatio(
        samples.points[4], samples.points[5], cheekStart, cheekEnd),
    AURAFaceDepthDistanceRatio(
        samples.points[6], samples.points[7], cheekStart, cheekEnd),
    AURAFaceDepthDistanceRatio(
        samples.points[8], samples.points[9], cheekStart, cheekEnd),
    AURAFaceDepthDistanceRatio(rightEye, leftEye, cheekStart, cheekEnd),
    AURAFaceDepthDistanceRatio(
        samples.points[14], samples.points[15], cheekStart, cheekEnd),
  };
  if (!AURAFaceDepthRatiosAreFinitePositive(ratios, 6) ||
      AURAFaceDepthWorkShouldStop(context, deadline)) {
    return AURAFaceDepthWorkShouldStop(context, deadline)
        ? AURAFaceDepthFailure(@"error", YES)
        : AURAFaceDepthFailure(@"insufficient_depth", YES);
  }

  double medianDepth = AURAFaceDepthMedian(
      samples.depths, AURAFaceDepthLandmarkCount);
  double medianAbsoluteDeviation = AURAFaceDepthMedianAbsoluteDeviation(
      samples.depths, AURAFaceDepthLandmarkCount, medianDepth);
  if (!isfinite(medianDepth) || medianDepth <= 0 ||
      !isfinite(medianAbsoluteDeviation) || medianAbsoluteDeviation < 0 ||
      samples.totalPixelCount == 0) {
    return AURAFaceDepthFailure(@"insufficient_depth", YES);
  }

  double validSampleRatio = AURAFaceDepthClamp01(
      (double)samples.validPixelCount / (double)samples.totalPixelCount);
  double relativeMAD = medianAbsoluteDeviation / fmax(medianDepth, 1e-9);
  double relativePlaneError = plane.rmse / fmax(medianDepth, 1e-9);
  double madScore = AURAFaceDepthClamp01(1.0 - relativeMAD / 0.08);
  double planeScore = AURAFaceDepthClamp01(1.0 - relativePlaneError / 0.06);

  // Until device-specific distortion alignment is calibrated, the presence
  // of a distortion table conservatively caps confidence instead of claiming
  // pixel-perfect alignment.
  BOOL hasLensDistortion =
      calibration.lensDistortionLookupTable.length > 0 ||
      calibration.inverseLensDistortionLookupTable.length > 0;
  double lensConfidence = hasLensDistortion
      ? 0.85
      : 1.0;
  double planeConfidence = AURAFaceDepthClamp01(
      validSampleRatio * planeScore * lensConfidence);
  double depthConfidence = AURAFaceDepthClamp01(
      (0.55 * validSampleRatio + 0.25 * madScore + 0.20 * planeScore) *
      lensConfidence);

  BOOL absolute = depthData.depthDataAccuracy == AVDepthDataAccuracyAbsolute;
  if (!absolute) {
    depthConfidence = fmin(depthConfidence, 0.8);
    planeConfidence = fmin(planeConfidence, 0.8);
  }

  NSMutableDictionary *summary = [@{
    @"status": @"ok",
    @"consumed": @YES,
    @"depthQuality": @{
      @"accuracy": absolute ? @"absolute" : @"relative",
      @"filtered": @(depthData.isDepthDataFiltered),
      @"validSampleRatio": @(validSampleRatio),
      @"medianAbsoluteDeviationMeters": @(medianAbsoluteDeviation),
      @"confidence": @(depthConfidence),
    },
    @"facePlane": @{
      @"pitchDeg": @(pose.pitchDeg),
      @"yawDeg": @(pose.yawDeg),
      @"rollDeg": @(pose.rollDeg),
      @"confidence": @(planeConfidence),
    },
    @"ratios": @{
      @"faceLengthToCheekWidth": @(ratios[0]),
      @"jawWidthToCheekWidth": @(ratios[1]),
      @"chinWidthToCheekWidth": @(ratios[2]),
      @"foreheadWidthToCheekWidth": @(ratios[3]),
      @"interEyeToCheekWidth": @(ratios[4]),
      @"noseLengthToCheekWidth": @(ratios[5]),
    },
  } mutableCopy];
  if (absolute) {
    summary[@"cameraDistanceMeters"] = @(medianDepth);
  }
  return summary;
}

static NSDictionary *AURAFaceDepthAnalyzePayload(
    AURATransientDepthAnalysisContext *context,
    NSDictionary *options,
    NSTimeInterval deadline)
{
  if (AURAFaceDepthWorkShouldStop(context, deadline)) {
    return AURAFaceDepthFailure(@"error", YES);
  }

  AURATransientDepthPayload *payload = context.payload;
  if (!payload) {
    return AURAFaceDepthFailure(@"error", YES);
  }
  if (![payload.depthData isKindOfClass:AVDepthData.class]) {
    return AURAFaceDepthFailure(@"insufficient_depth", YES);
  }
  // Retaining the parent AVDepthData for the entire locked-buffer scope keeps
  // both the map and camera calibration alive.
  AVDepthData *depthData = payload.depthData;
  CVPixelBufferRef depthMap = depthData.depthDataMap;
  AVCameraCalibrationData *calibration = depthData.cameraCalibrationData;
  if (!depthMap || !calibration ||
      CVPixelBufferGetPixelFormatType(depthMap) !=
          kCVPixelFormatType_DepthFloat32 ||
      CVPixelBufferIsPlanar(depthMap)) {
    return AURAFaceDepthFailure(@"insufficient_depth", YES);
  }

  AURAFaceDepthLandmarkSet landmarks = {0};
  AURAFaceDepthAnalysisState landmarkState = AURAFaceDepthParseLandmarks(
      options, payload, context, deadline, &landmarks);
  if (landmarkState != AURAFaceDepthAnalysisStateOK) {
    if (landmarkState == AURAFaceDepthAnalysisStateCancelled) {
      return AURAFaceDepthFailure(@"error", YES);
    }
    return AURAFaceDepthFailure(
        landmarkState == AURAFaceDepthAnalysisStateInvalidLandmarks
            ? @"invalid_landmarks"
            : @"insufficient_depth",
        YES);
  }

  CVReturn lockResult = CVPixelBufferLockBaseAddress(
      depthMap, kCVPixelBufferLock_ReadOnly);
  if (lockResult != kCVReturnSuccess) {
    return AURAFaceDepthFailure(@"error", YES);
  }

  NSDictionary *summary = nil;
  @try {
    size_t width = CVPixelBufferGetWidth(depthMap);
    size_t height = CVPixelBufferGetHeight(depthMap);
    size_t bytesPerRow = CVPixelBufferGetBytesPerRow(depthMap);
    const float *values = CVPixelBufferGetBaseAddress(depthMap);
    if (!values || width == 0 || height == 0 ||
        bytesPerRow % sizeof(float) != 0) {
      summary = AURAFaceDepthFailure(@"insufficient_depth", YES);
    } else {
      AURAFaceDepthBuffer buffer = AURAFaceDepthBufferMake(
          values, width, height, bytesPerRow / sizeof(float));
      AURAFaceDepthIntrinsics intrinsics = AURAFaceDepthScaledIntrinsics(
          calibration, CGSizeMake(width, height));
      AURAFaceDepthSamples samples = {0};
      AURAFaceDepthAnalysisState sampleState = AURAFaceDepthSampleLandmarks(
          buffer, intrinsics, landmarks, context, deadline, &samples);
      if (sampleState == AURAFaceDepthAnalysisStateCancelled) {
        summary = AURAFaceDepthFailure(@"error", YES);
      } else if (sampleState != AURAFaceDepthAnalysisStateOK) {
        summary = AURAFaceDepthFailure(@"insufficient_depth", YES);
      } else {
        summary = AURAFaceDepthBuildSummary(
            depthData, calibration, samples, context, deadline);
      }
    }
  } @finally {
    CVPixelBufferUnlockBaseAddress(depthMap, kCVPixelBufferLock_ReadOnly);
  }
  return summary ?: AURAFaceDepthFailure(@"error", YES);
}

@interface AURAFaceProfileDepthAnalyzer : NSObject <RCTBridgeModule>
@end

@implementation AURAFaceProfileDepthAnalyzer

RCT_EXPORT_MODULE(AURAFaceProfileDepthAnalyzer)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  static dispatch_queue_t queue;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    queue = dispatch_queue_create(
        "com.aura.face-profile-depth-analyzer.control",
        DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

RCT_EXPORT_METHOD(analyze:(NSString *)token
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  (void)reject;
  AURATransientDepthStore *store = AURATransientDepthStore.sharedStore;
  AURATransientDepthConsumeResult *begin =
      [store beginAnalysisWithToken:token];
  if (![begin.status isEqualToString:AURATransientDepthStatusOK]) {
    NSString *status = [begin.status isEqualToString:AURATransientDepthStatusExpired]
        ? @"expired"
        : @"not_found";
    resolve(AURAFaceProfileDepthApprovedSummary(
        AURAFaceDepthFailure(status, NO)));
    return;
  }

  AURATransientDepthAnalysisContext *context = begin.analysisContext;
  if (!context) {
    [store endAnalysisForToken:token];
    resolve(AURAFaceProfileDepthApprovedSummary(
        AURAFaceDepthFailure(@"error", YES)));
    return;
  }

  double requestedDeadline = 1500;
  if ([options isKindOfClass:NSDictionary.class]) {
    double parsedDeadline = 0;
    if (AURAFaceDepthFiniteNumber(options[@"deadlineMs"], &parsedDeadline)) {
      requestedDeadline = parsedDeadline;
    }
  }
  NSUInteger deadlineMilliseconds =
      AURAFaceDepthClampDeadlineMilliseconds(requestedDeadline);
  NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime +
      (NSTimeInterval)deadlineMilliseconds / 1000.0;
  NSDictionary *safeOptions = [options isKindOfClass:NSDictionary.class]
      ? options
      : @{};

  dispatch_async(
      dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0),
      ^{
        @autoreleasepool {
          NSDictionary *summary = nil;
          @try {
            summary = AURAFaceDepthAnalyzePayload(
                context, safeOptions, deadline);
          } @catch (__unused NSException *exception) {
            summary = AURAFaceDepthFailure(@"error", YES);
          } @finally {
            [store endAnalysisForToken:token];
          }
          resolve(AURAFaceProfileDepthApprovedSummary(
              summary ?: AURAFaceDepthFailure(@"error", YES)));
        }
      });
}

RCT_EXPORT_METHOD(discard:(NSString *)token)
{
  [AURATransientDepthStore.sharedStore discardToken:token];
}

@end
