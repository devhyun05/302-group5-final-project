#import <XCTest/XCTest.h>

#import "AURAFaceDepthMath.h"

FOUNDATION_EXPORT NSDictionary *AURAFaceProfileDepthApprovedSummary(
    id _Nullable candidate);

@interface AURAFaceDepthMathTests : XCTestCase
@end

@implementation AURAFaceDepthMathTests

- (void)testUnprojectionUsesScaledCameraIntrinsics
{
  AURAFaceDepthIntrinsics reference =
      AURAFaceDepthIntrinsicsMake(1000, 800, 500, 400, CGSizeMake(1000, 800));
  AURAFaceDepthIntrinsics scaled =
      AURAFaceDepthIntrinsicsScale(reference, CGSizeMake(500, 400));
  XCTAssertEqualWithAccuracy(scaled.fx, 500, 1e-12);
  XCTAssertEqualWithAccuracy(scaled.fy, 400, 1e-12);
  XCTAssertEqualWithAccuracy(scaled.cx, 250, 1e-12);
  XCTAssertEqualWithAccuracy(scaled.cy, 200, 1e-12);

  AURAFaceDepthPoint3D center = AURAFaceDepthUnproject(250, 200, 2, scaled);
  XCTAssertTrue(center.valid);
  XCTAssertEqualWithAccuracy(center.x, 0, 1e-12);
  XCTAssertEqualWithAccuracy(center.y, 0, 1e-12);
  XCTAssertEqualWithAccuracy(center.z, 2, 1e-12);

  AURAFaceDepthPoint3D offset = AURAFaceDepthUnproject(300, 240, 2, scaled);
  XCTAssertEqualWithAccuracy(offset.x, 0.2, 1e-12);
  XCTAssertEqualWithAccuracy(offset.y, 0.2, 1e-12);
}

- (void)testNeighborhoodMedianRejectsInvalidAndOutlierDepth
{
  float values[] = {
    1.0f, 1.0f, 1.0f,
    1.0f, 100.0f, 1.0f,
    1.0f, NAN, 1.0f,
  };
  AURAFaceDepthBuffer buffer = AURAFaceDepthBufferMake(values, 3, 3, 3);
  AURAFaceDepthSample sample =
      AURAFaceDepthMedianSample(buffer, AURAFaceDepthPoint2DMake(0.5, 0.5), 1);
  XCTAssertTrue(sample.valid);
  XCTAssertEqualWithAccuracy(sample.depthMeters, 1, 1e-12);
  XCTAssertEqualWithAccuracy(sample.validSampleRatio, 8.0 / 9.0, 1e-12);

  float invalidValues[] = {0.0f, -1.0f, NAN, INFINITY};
  AURAFaceDepthSample invalid = AURAFaceDepthMedianSample(
      AURAFaceDepthBufferMake(invalidValues, 2, 2, 2),
      AURAFaceDepthPoint2DMake(0.5, 0.5),
      1);
  XCTAssertFalse(invalid.valid);
}

- (void)testMedianAbsoluteDeviationAndThreeDimensionalRatio
{
  double values[] = {1, 2, 3, 4, 100};
  XCTAssertEqualWithAccuracy(AURAFaceDepthMedian(values, 5), 3, 1e-12);
  XCTAssertEqualWithAccuracy(AURAFaceDepthMedianAbsoluteDeviation(values, 5, 3),
                             1,
                             1e-12);

  AURAFaceDepthPoint3D a = AURAFaceDepthPoint3DMake(0, 0, 1);
  AURAFaceDepthPoint3D b = AURAFaceDepthPoint3DMake(2, 0, 1);
  AURAFaceDepthPoint3D c = AURAFaceDepthPoint3DMake(0, 0, 1);
  AURAFaceDepthPoint3D d = AURAFaceDepthPoint3DMake(4, 0, 1);
  XCTAssertEqualWithAccuracy(AURAFaceDepthDistanceRatio(a, b, c, d), 0.5, 1e-12);
  XCTAssertTrue(isnan(AURAFaceDepthDistanceRatio(a, a, c, c)));
}

- (void)testPlaneFitCanonicalizesNormalAndRejectsDegeneratePoints
{
  AURAFaceDepthPoint3D points[] = {
    AURAFaceDepthPoint3DMake(-1, -1, 1.1),
    AURAFaceDepthPoint3DMake(0, -1, 1.2),
    AURAFaceDepthPoint3DMake(1, -1, 1.3),
    AURAFaceDepthPoint3DMake(-1, 1, 0.7),
    AURAFaceDepthPoint3DMake(0, 1, 0.8),
    AURAFaceDepthPoint3DMake(1, 1, 0.9),
  };
  AURAFaceDepthPlane plane = AURAFaceDepthFitPlane(points, 6);
  XCTAssertTrue(plane.valid);
  XCTAssertEqualWithAccuracy(plane.a, 0.1, 1e-10);
  XCTAssertEqualWithAccuracy(plane.b, -0.2, 1e-10);
  XCTAssertEqualWithAccuracy(plane.c, 1.0, 1e-10);
  XCTAssertGreaterThan(plane.normalZ, 0);
  XCTAssertLessThan(plane.rmse, 1e-10);

  AURAFaceDepthPoint3D degenerate[] = {
    AURAFaceDepthPoint3DMake(0, 0, 1),
    AURAFaceDepthPoint3DMake(0, 0, 2),
    AURAFaceDepthPoint3DMake(0, 0, 3),
  };
  XCTAssertFalse(AURAFaceDepthFitPlane(degenerate, 3).valid);
}

- (void)testExifOneThreeSixEightAndSelfieMirror
{
  AURAFaceDepthPoint2D point = AURAFaceDepthPoint2DMake(0.2, 0.3);
  AURAFaceDepthPoint2D one = AURAFaceDepthPointToUpright(point, 1, NO);
  AURAFaceDepthPoint2D three = AURAFaceDepthPointToUpright(point, 3, NO);
  AURAFaceDepthPoint2D six = AURAFaceDepthPointToUpright(point, 6, NO);
  AURAFaceDepthPoint2D eight = AURAFaceDepthPointToUpright(point, 8, NO);
  AURAFaceDepthPoint2D sixMirrored = AURAFaceDepthPointToUpright(point, 6, YES);

  XCTAssertEqualWithAccuracy(one.x, 0.2, 1e-12);
  XCTAssertEqualWithAccuracy(one.y, 0.3, 1e-12);
  XCTAssertEqualWithAccuracy(three.x, 0.8, 1e-12);
  XCTAssertEqualWithAccuracy(three.y, 0.7, 1e-12);
  XCTAssertEqualWithAccuracy(six.x, 0.7, 1e-12);
  XCTAssertEqualWithAccuracy(six.y, 0.2, 1e-12);
  XCTAssertEqualWithAccuracy(eight.x, 0.3, 1e-12);
  XCTAssertEqualWithAccuracy(eight.y, 0.8, 1e-12);
  XCTAssertEqualWithAccuracy(sixMirrored.x, 0.3, 1e-12);
  XCTAssertEqualWithAccuracy(sixMirrored.y, 0.2, 1e-12);
}

- (void)testFacePlaneAnglesUseCanonicalNormalAndLabeledEyeAxis
{
  AURAFaceDepthPlane plane = {
    .valid = YES,
    .normalX = -0.1,
    .normalY = 0.2,
    .normalZ = 1.0,
  };
  AURAFaceDepthPoint3D anatomicalRightEye = AURAFaceDepthPoint3DMake(-1, 0.2, 1);
  AURAFaceDepthPoint3D anatomicalLeftEye = AURAFaceDepthPoint3DMake(1, 0.4, 1);
  AURAFaceDepthPose pose = AURAFaceDepthPoseFromPlane(
      plane, anatomicalRightEye, anatomicalLeftEye);
  XCTAssertTrue(pose.valid);
  XCTAssertGreaterThan(pose.yawDeg, 0);
  XCTAssertLessThan(pose.pitchDeg, 0);
  XCTAssertGreaterThan(pose.rollDeg, 0);
}

- (void)testAnalyzerDeadlineClampAndSerializableRatioValidation
{
  XCTAssertEqual(AURAFaceDepthClampDeadlineMilliseconds(-20), 1u);
  XCTAssertEqual(AURAFaceDepthClampDeadlineMilliseconds(700), 700u);
  XCTAssertEqual(AURAFaceDepthClampDeadlineMilliseconds(5000), 1500u);

  double valid[] = {1.5, 0.8, 0.4, 0.9, 0.3, 0.28};
  XCTAssertTrue(AURAFaceDepthRatiosAreFinitePositive(valid, 6));
  double zero[] = {1.5, 0.8, 0.0};
  XCTAssertFalse(AURAFaceDepthRatiosAreFinitePositive(zero, 3));
  double nonFinite[] = {1.5, NAN, 0.4};
  XCTAssertFalse(AURAFaceDepthRatiosAreFinitePositive(nonFinite, 3));
}

- (void)testApprovedSummaryGuardEnforcesTheCompleteScalarAllowlist
{
  NSDictionary *valid = @{
    @"status": @"ok",
    @"consumed": @YES,
    @"cameraDistanceMeters": @0.48,
    @"depthQuality": @{
      @"accuracy": @"absolute",
      @"filtered": @YES,
      @"validSampleRatio": @0.87,
      @"medianAbsoluteDeviationMeters": @0.003,
      @"confidence": @0.91,
    },
    @"facePlane": @{
      @"pitchDeg": @1.2,
      @"yawDeg": @2.1,
      @"rollDeg": @(-0.8),
      @"confidence": @0.9,
    },
    @"ratios": @{
      @"faceLengthToCheekWidth": @1.55,
      @"jawWidthToCheekWidth": @0.77,
      @"chinWidthToCheekWidth": @0.42,
      @"foreheadWidthToCheekWidth": @0.89,
      @"interEyeToCheekWidth": @0.31,
      @"noseLengthToCheekWidth": @0.28,
    },
  };
  XCTAssertEqualObjects(AURAFaceProfileDepthApprovedSummary(valid), valid);

  for (NSString *status in @[
         @"unsupported", @"not_found", @"expired",
         @"invalid_landmarks", @"insufficient_depth", @"error",
       ]) {
    BOOL consumed = [@[
      @"invalid_landmarks", @"insufficient_depth", @"error"
    ] containsObject:status];
    NSDictionary *failure = @{@"status": status, @"consumed": @(consumed)};
    XCTAssertEqualObjects(
        AURAFaceProfileDepthApprovedSummary(failure), failure);
  }

  NSDictionary *safeError = @{@"status": @"error", @"consumed": @YES};
  NSArray<NSDictionary *> *invalid = @[
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    [valid mutableCopy],
    @{@"status": @"expired", @"consumed": @YES},
    @{@"status": @"error", @"consumed": @NO},
    @{@"status": @"not_found", @"consumed": @NO, @"token": @"opaque"},
    @{@"status": @"unknown", @"consumed": @NO},
  ];
  NSMutableArray<NSMutableDictionary *> *mutableInvalid =
      (NSMutableArray<NSMutableDictionary *> *)invalid;
  mutableInvalid[0][@"token"] = @"opaque";
  mutableInvalid[1][@"rawDepth"] = @[@0.1];
  NSMutableDictionary *qualityWithCalibration =
      [valid[@"depthQuality"] mutableCopy];
  qualityWithCalibration[@"calibration"] = @{@"fx": @1200};
  mutableInvalid[2][@"depthQuality"] = qualityWithCalibration;
  NSMutableDictionary *qualityNaN = [valid[@"depthQuality"] mutableCopy];
  qualityNaN[@"confidence"] = @(NAN);
  mutableInvalid[3][@"depthQuality"] = qualityNaN;
  NSMutableDictionary *qualityOutOfRange =
      [valid[@"depthQuality"] mutableCopy];
  qualityOutOfRange[@"validSampleRatio"] = @1.1;
  mutableInvalid[4][@"depthQuality"] = qualityOutOfRange;
  NSMutableDictionary *qualityNegativeMAD =
      [valid[@"depthQuality"] mutableCopy];
  qualityNegativeMAD[@"medianAbsoluteDeviationMeters"] = @(-0.1);
  mutableInvalid[5][@"depthQuality"] = qualityNegativeMAD;
  NSMutableDictionary *planeWithExtra = [valid[@"facePlane"] mutableCopy];
  planeWithExtra[@"normalX"] = @0.1;
  mutableInvalid[6][@"facePlane"] = planeWithExtra;
  NSMutableDictionary *planeNaN = [valid[@"facePlane"] mutableCopy];
  planeNaN[@"pitchDeg"] = @(NAN);
  mutableInvalid[7][@"facePlane"] = planeNaN;
  NSMutableDictionary *zeroRatio = [valid[@"ratios"] mutableCopy];
  zeroRatio[@"faceLengthToCheekWidth"] = @0;
  mutableInvalid[8][@"ratios"] = zeroRatio;
  NSMutableDictionary *ratioWithExtra = [valid[@"ratios"] mutableCopy];
  ratioWithExtra[@"rawPoints"] = @[];
  mutableInvalid[9][@"ratios"] = ratioWithExtra;
  mutableInvalid[10][@"cameraDistanceMeters"] = @YES;

  for (NSDictionary *candidate in invalid) {
    XCTAssertEqualObjects(
        AURAFaceProfileDepthApprovedSummary(candidate), safeError);
  }

  NSMutableDictionary *relativeWithDistance = [valid mutableCopy];
  NSMutableDictionary *relativeQuality = [valid[@"depthQuality"] mutableCopy];
  relativeQuality[@"accuracy"] = @"relative";
  relativeWithDistance[@"depthQuality"] = relativeQuality;
  XCTAssertEqualObjects(
      AURAFaceProfileDepthApprovedSummary(relativeWithDistance), safeError);

  [relativeWithDistance removeObjectForKey:@"cameraDistanceMeters"];
  XCTAssertEqualObjects(
      AURAFaceProfileDepthApprovedSummary(relativeWithDistance),
      relativeWithDistance);
}

@end
