#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef struct {
  const float * _Nullable values;
  size_t width;
  size_t height;
  size_t rowStride;
} AURAFaceDepthBuffer;

typedef struct {
  double x;
  double y;
} AURAFaceDepthPoint2D;

typedef struct {
  BOOL valid;
  double x;
  double y;
  double z;
} AURAFaceDepthPoint3D;

typedef struct {
  BOOL valid;
  double fx;
  double fy;
  double cx;
  double cy;
  CGSize referenceDimensions;
} AURAFaceDepthIntrinsics;

typedef struct {
  BOOL valid;
  double depthMeters;
  double validSampleRatio;
  NSUInteger validSampleCount;
  NSUInteger totalSampleCount;
} AURAFaceDepthSample;

typedef struct {
  BOOL valid;
  double a;
  double b;
  double c;
  double normalX;
  double normalY;
  double normalZ;
  double rmse;
  NSUInteger sampleCount;
} AURAFaceDepthPlane;

typedef struct {
  BOOL valid;
  double pitchDeg;
  double yawDeg;
  double rollDeg;
} AURAFaceDepthPose;

FOUNDATION_EXPORT AURAFaceDepthBuffer AURAFaceDepthBufferMake(
    const float * _Nullable values,
    size_t width,
    size_t height,
    size_t rowStride);

FOUNDATION_EXPORT AURAFaceDepthPoint2D AURAFaceDepthPoint2DMake(
    double x,
    double y);

FOUNDATION_EXPORT AURAFaceDepthPoint3D AURAFaceDepthPoint3DMake(
    double x,
    double y,
    double z);

FOUNDATION_EXPORT AURAFaceDepthIntrinsics AURAFaceDepthIntrinsicsMake(
    double fx,
    double fy,
    double cx,
    double cy,
    CGSize referenceDimensions);

FOUNDATION_EXPORT AURAFaceDepthIntrinsics AURAFaceDepthIntrinsicsScale(
    AURAFaceDepthIntrinsics intrinsics,
    CGSize targetDimensions);

FOUNDATION_EXPORT AURAFaceDepthPoint3D AURAFaceDepthUnproject(
    double pixelX,
    double pixelY,
    double depthMeters,
    AURAFaceDepthIntrinsics intrinsics);

FOUNDATION_EXPORT AURAFaceDepthSample AURAFaceDepthMedianSample(
    AURAFaceDepthBuffer buffer,
    AURAFaceDepthPoint2D normalizedPoint,
    NSUInteger radius);

FOUNDATION_EXPORT double AURAFaceDepthMedian(
    const double * _Nullable values,
    NSUInteger count);

FOUNDATION_EXPORT double AURAFaceDepthMedianAbsoluteDeviation(
    const double * _Nullable values,
    NSUInteger count,
    double median);

FOUNDATION_EXPORT double AURAFaceDepthDistanceRatio(
    AURAFaceDepthPoint3D numeratorStart,
    AURAFaceDepthPoint3D numeratorEnd,
    AURAFaceDepthPoint3D denominatorStart,
    AURAFaceDepthPoint3D denominatorEnd);

FOUNDATION_EXPORT AURAFaceDepthPlane AURAFaceDepthFitPlane(
    const AURAFaceDepthPoint3D * _Nullable points,
    NSUInteger count);

FOUNDATION_EXPORT AURAFaceDepthPose AURAFaceDepthPoseFromPlane(
    AURAFaceDepthPlane plane,
    AURAFaceDepthPoint3D anatomicalRightEye,
    AURAFaceDepthPoint3D anatomicalLeftEye);

FOUNDATION_EXPORT AURAFaceDepthPoint2D AURAFaceDepthPointToUpright(
    AURAFaceDepthPoint2D point,
    NSInteger exifOrientation,
    BOOL mirrored);

FOUNDATION_EXPORT NSUInteger AURAFaceDepthClampDeadlineMilliseconds(
    double milliseconds);

FOUNDATION_EXPORT BOOL AURAFaceDepthRatiosAreFinitePositive(
    const double * _Nullable ratios,
    NSUInteger count);

NS_ASSUME_NONNULL_END
