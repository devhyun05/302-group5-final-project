#import "AURAFaceDepthMath.h"

#import <float.h>
#import <math.h>
#import <stdint.h>
#import <stdlib.h>

static const double kAURAFaceDepthMinimumPlaneVariance = DBL_MIN;
static const double kAURAFaceDepthMinimumNormalizedDeterminant = 1e-12;
static const double kAURAFaceDepthMinimumDistance = 1e-12;

static double AURAFaceDepthClamp01(double value)
{
  return fmax(0.0, fmin(1.0, value));
}

static BOOL AURAFaceDepthPoint3DIsFinite(AURAFaceDepthPoint3D point)
{
  return point.valid && isfinite(point.x) && isfinite(point.y) &&
      isfinite(point.z);
}

static int AURAFaceDepthCompareDoubles(const void *left, const void *right)
{
  double a = *(const double *)left;
  double b = *(const double *)right;
  return (a > b) - (a < b);
}

static double AURAFaceDepthMedianOfSortedValues(
    const double *values,
    NSUInteger count)
{
  if (!values || count == 0) {
    return NAN;
  }
  if ((count & 1u) != 0) {
    return values[count / 2];
  }
  double lower = values[count / 2 - 1];
  double upper = values[count / 2];
  return lower + (upper - lower) / 2.0;
}

AURAFaceDepthBuffer AURAFaceDepthBufferMake(
    const float *values,
    size_t width,
    size_t height,
    size_t rowStride)
{
  return (AURAFaceDepthBuffer){values, width, height, rowStride};
}

AURAFaceDepthPoint2D AURAFaceDepthPoint2DMake(double x, double y)
{
  return (AURAFaceDepthPoint2D){x, y};
}

AURAFaceDepthPoint3D AURAFaceDepthPoint3DMake(
    double x,
    double y,
    double z)
{
  return (AURAFaceDepthPoint3D){
    isfinite(x) && isfinite(y) && isfinite(z),
    x,
    y,
    z,
  };
}

AURAFaceDepthIntrinsics AURAFaceDepthIntrinsicsMake(
    double fx,
    double fy,
    double cx,
    double cy,
    CGSize referenceDimensions)
{
  BOOL valid = isfinite(fx) && fx > 0 && isfinite(fy) && fy > 0 &&
      isfinite(cx) && isfinite(cy) &&
      isfinite(referenceDimensions.width) && referenceDimensions.width > 0 &&
      isfinite(referenceDimensions.height) && referenceDimensions.height > 0;
  return (AURAFaceDepthIntrinsics){
    valid,
    fx,
    fy,
    cx,
    cy,
    referenceDimensions,
  };
}

AURAFaceDepthIntrinsics AURAFaceDepthIntrinsicsScale(
    AURAFaceDepthIntrinsics intrinsics,
    CGSize targetDimensions)
{
  if (!intrinsics.valid || !isfinite(targetDimensions.width) ||
      targetDimensions.width <= 0 || !isfinite(targetDimensions.height) ||
      targetDimensions.height <= 0) {
    return (AURAFaceDepthIntrinsics){0};
  }

  double scaleX = targetDimensions.width / intrinsics.referenceDimensions.width;
  double scaleY = targetDimensions.height / intrinsics.referenceDimensions.height;
  if (!isfinite(scaleX) || scaleX <= 0 || !isfinite(scaleY) || scaleY <= 0) {
    return (AURAFaceDepthIntrinsics){0};
  }

  return AURAFaceDepthIntrinsicsMake(
      intrinsics.fx * scaleX,
      intrinsics.fy * scaleY,
      intrinsics.cx * scaleX,
      intrinsics.cy * scaleY,
      targetDimensions);
}

AURAFaceDepthPoint3D AURAFaceDepthUnproject(
    double pixelX,
    double pixelY,
    double depthMeters,
    AURAFaceDepthIntrinsics intrinsics)
{
  if (!intrinsics.valid || !isfinite(pixelX) || !isfinite(pixelY) ||
      !isfinite(depthMeters) || depthMeters <= 0 || intrinsics.fx <= 0 ||
      intrinsics.fy <= 0) {
    return (AURAFaceDepthPoint3D){0};
  }

  double x = (pixelX - intrinsics.cx) * depthMeters / intrinsics.fx;
  double y = (pixelY - intrinsics.cy) * depthMeters / intrinsics.fy;
  if (!isfinite(x) || !isfinite(y)) {
    return (AURAFaceDepthPoint3D){0};
  }
  return AURAFaceDepthPoint3DMake(x, y, depthMeters);
}

double AURAFaceDepthMedian(const double *values, NSUInteger count)
{
  if (!values || count == 0 || count > SIZE_MAX / sizeof(double)) {
    return NAN;
  }

  double *finiteValues = malloc((size_t)count * sizeof(double));
  if (!finiteValues) {
    return NAN;
  }

  NSUInteger finiteCount = 0;
  for (NSUInteger index = 0; index < count; index++) {
    if (isfinite(values[index])) {
      finiteValues[finiteCount++] = values[index];
    }
  }
  if (finiteCount == 0) {
    free(finiteValues);
    return NAN;
  }

  qsort(
      finiteValues,
      (size_t)finiteCount,
      sizeof(double),
      AURAFaceDepthCompareDoubles);
  double median = AURAFaceDepthMedianOfSortedValues(finiteValues, finiteCount);
  free(finiteValues);
  return median;
}

double AURAFaceDepthMedianAbsoluteDeviation(
    const double *values,
    NSUInteger count,
    double median)
{
  if (!values || count == 0 || !isfinite(median) ||
      count > SIZE_MAX / sizeof(double)) {
    return NAN;
  }

  double *deviations = malloc((size_t)count * sizeof(double));
  if (!deviations) {
    return NAN;
  }

  NSUInteger finiteCount = 0;
  for (NSUInteger index = 0; index < count; index++) {
    if (!isfinite(values[index])) {
      continue;
    }
    double deviation = fabs(values[index] - median);
    if (isfinite(deviation)) {
      deviations[finiteCount++] = deviation;
    }
  }
  if (finiteCount == 0) {
    free(deviations);
    return NAN;
  }

  qsort(
      deviations,
      (size_t)finiteCount,
      sizeof(double),
      AURAFaceDepthCompareDoubles);
  double result = AURAFaceDepthMedianOfSortedValues(deviations, finiteCount);
  free(deviations);
  return result;
}

AURAFaceDepthSample AURAFaceDepthMedianSample(
    AURAFaceDepthBuffer buffer,
    AURAFaceDepthPoint2D normalizedPoint,
    NSUInteger radius)
{
  AURAFaceDepthSample result = {0};
  if (!buffer.values || buffer.width == 0 || buffer.height == 0 ||
      buffer.rowStride < buffer.width ||
      !isfinite(normalizedPoint.x) || !isfinite(normalizedPoint.y) ||
      normalizedPoint.x < 0 || normalizedPoint.x > 1 ||
      normalizedPoint.y < 0 || normalizedPoint.y > 1) {
    return result;
  }

  size_t centerX = (size_t)llround(
      normalizedPoint.x * ((double)buffer.width - 1.0));
  size_t centerY = (size_t)llround(
      normalizedPoint.y * ((double)buffer.height - 1.0));
  size_t radiusSize = (size_t)radius;
  size_t minX = centerX > radiusSize ? centerX - radiusSize : 0;
  size_t minY = centerY > radiusSize ? centerY - radiusSize : 0;
  size_t maxX = radiusSize > buffer.width - 1 - centerX
      ? buffer.width - 1
      : centerX + radiusSize;
  size_t maxY = radiusSize > buffer.height - 1 - centerY
      ? buffer.height - 1
      : centerY + radiusSize;

  size_t sampleWidth = maxX - minX + 1;
  size_t sampleHeight = maxY - minY + 1;
  if (sampleWidth > SIZE_MAX / sampleHeight) {
    return result;
  }
  size_t capacity = sampleWidth * sampleHeight;
  if (capacity == 0 || capacity > SIZE_MAX / sizeof(double)) {
    return result;
  }

  double *validValues = malloc(capacity * sizeof(double));
  if (!validValues) {
    return result;
  }

  NSUInteger validCount = 0;
  NSUInteger totalCount = 0;
  for (size_t y = minY; y <= maxY; y++) {
    if (y > SIZE_MAX / buffer.rowStride) {
      free(validValues);
      return (AURAFaceDepthSample){0};
    }
    const float *row = buffer.values + y * buffer.rowStride;
    for (size_t x = minX; x <= maxX; x++) {
      totalCount += 1;
      float value = row[x];
      if (isfinite(value) && value > 0) {
        validValues[validCount++] = value;
      }
    }
  }

  result.validSampleCount = validCount;
  result.totalSampleCount = totalCount;
  result.validSampleRatio = totalCount > 0
      ? (double)validCount / (double)totalCount
      : 0;
  if (validCount > 0) {
    result.depthMeters = AURAFaceDepthMedian(validValues, validCount);
    result.valid = isfinite(result.depthMeters) && result.depthMeters > 0;
  }
  free(validValues);
  return result;
}

static double AURAFaceDepthDistance(
    AURAFaceDepthPoint3D start,
    AURAFaceDepthPoint3D end)
{
  if (!AURAFaceDepthPoint3DIsFinite(start) ||
      !AURAFaceDepthPoint3DIsFinite(end)) {
    return NAN;
  }
  return hypot(hypot(end.x - start.x, end.y - start.y), end.z - start.z);
}

double AURAFaceDepthDistanceRatio(
    AURAFaceDepthPoint3D numeratorStart,
    AURAFaceDepthPoint3D numeratorEnd,
    AURAFaceDepthPoint3D denominatorStart,
    AURAFaceDepthPoint3D denominatorEnd)
{
  double numerator = AURAFaceDepthDistance(numeratorStart, numeratorEnd);
  double denominator = AURAFaceDepthDistance(denominatorStart, denominatorEnd);
  if (!isfinite(numerator) || !isfinite(denominator) ||
      denominator <= kAURAFaceDepthMinimumDistance) {
    return NAN;
  }
  double ratio = numerator / denominator;
  return isfinite(ratio) ? ratio : NAN;
}

AURAFaceDepthPlane AURAFaceDepthFitPlane(
    const AURAFaceDepthPoint3D *points,
    NSUInteger count)
{
  AURAFaceDepthPlane result = {0};
  if (!points || count < 3) {
    return result;
  }

  double sumX = 0;
  double sumY = 0;
  double sumZ = 0;
  NSUInteger validCount = 0;
  for (NSUInteger index = 0; index < count; index++) {
    AURAFaceDepthPoint3D point = points[index];
    if (!AURAFaceDepthPoint3DIsFinite(point)) {
      continue;
    }
    sumX += point.x;
    sumY += point.y;
    sumZ += point.z;
    validCount += 1;
  }
  if (validCount < 3 || !isfinite(sumX) || !isfinite(sumY) ||
      !isfinite(sumZ)) {
    return result;
  }

  double meanX = sumX / validCount;
  double meanY = sumY / validCount;
  double meanZ = sumZ / validCount;
  double sxx = 0;
  double syy = 0;
  double sxy = 0;
  double sxz = 0;
  double syz = 0;
  for (NSUInteger index = 0; index < count; index++) {
    AURAFaceDepthPoint3D point = points[index];
    if (!AURAFaceDepthPoint3DIsFinite(point)) {
      continue;
    }
    double dx = point.x - meanX;
    double dy = point.y - meanY;
    double dz = point.z - meanZ;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
    sxz += dx * dz;
    syz += dy * dz;
  }

  if (!isfinite(sxx) || !isfinite(syy) || !isfinite(sxy) ||
      !isfinite(sxz) || !isfinite(syz) ||
      sxx <= kAURAFaceDepthMinimumPlaneVariance ||
      syy <= kAURAFaceDepthMinimumPlaneVariance) {
    return result;
  }
  double covarianceProduct = sxx * syy;
  double determinant = covarianceProduct - sxy * sxy;
  double normalizedDeterminant = determinant / covarianceProduct;
  if (!isfinite(determinant) || determinant <= 0 ||
      !isfinite(normalizedDeterminant) ||
      normalizedDeterminant <= kAURAFaceDepthMinimumNormalizedDeterminant) {
    return result;
  }

  double a = (sxz * syy - syz * sxy) / determinant;
  double b = (syz * sxx - sxz * sxy) / determinant;
  double c = meanZ - a * meanX - b * meanY;
  if (!isfinite(a) || !isfinite(b) || !isfinite(c)) {
    return result;
  }

  double squaredError = 0;
  for (NSUInteger index = 0; index < count; index++) {
    AURAFaceDepthPoint3D point = points[index];
    if (!AURAFaceDepthPoint3DIsFinite(point)) {
      continue;
    }
    double residual = point.z - (a * point.x + b * point.y + c);
    squaredError += residual * residual;
  }
  double rmse = sqrt(squaredError / validCount);
  double normalLength = hypot(hypot(a, b), 1.0);
  if (!isfinite(rmse) || !isfinite(normalLength) || normalLength <= 0) {
    return result;
  }

  result.valid = YES;
  result.a = a;
  result.b = b;
  result.c = c;
  result.normalX = -a / normalLength;
  result.normalY = -b / normalLength;
  result.normalZ = 1.0 / normalLength;
  if (result.normalZ < 0) {
    result.normalX = -result.normalX;
    result.normalY = -result.normalY;
    result.normalZ = -result.normalZ;
  }
  result.rmse = rmse;
  result.sampleCount = validCount;
  return result;
}

static double AURAFaceDepthRadiansToDegrees(double radians)
{
  return radians * (180.0 / M_PI);
}

static double AURAFaceDepthCanonicalEyeLineAngle(double degrees)
{
  while (degrees > 90.0) {
    degrees -= 180.0;
  }
  while (degrees <= -90.0) {
    degrees += 180.0;
  }
  return degrees;
}

AURAFaceDepthPose AURAFaceDepthPoseFromPlane(
    AURAFaceDepthPlane plane,
    AURAFaceDepthPoint3D anatomicalRightEye,
    AURAFaceDepthPoint3D anatomicalLeftEye)
{
  AURAFaceDepthPose result = {0};
  if (!plane.valid || !isfinite(plane.normalX) ||
      !isfinite(plane.normalY) || !isfinite(plane.normalZ) ||
      !AURAFaceDepthPoint3DIsFinite(anatomicalRightEye) ||
      !AURAFaceDepthPoint3DIsFinite(anatomicalLeftEye)) {
    return result;
  }

  double nx = plane.normalX;
  double ny = plane.normalY;
  double nz = plane.normalZ;
  double normalLength = hypot(hypot(nx, ny), nz);
  if (!isfinite(normalLength) || normalLength <= 0) {
    return result;
  }
  nx /= normalLength;
  ny /= normalLength;
  nz /= normalLength;
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  double eyeX = anatomicalLeftEye.x - anatomicalRightEye.x;
  double eyeY = anatomicalLeftEye.y - anatomicalRightEye.y;
  if (!isfinite(eyeX) || !isfinite(eyeY) ||
      hypot(eyeX, eyeY) <= kAURAFaceDepthMinimumDistance) {
    return result;
  }

  double yaw = AURAFaceDepthRadiansToDegrees(atan2(-nx, nz));
  double pitch = AURAFaceDepthRadiansToDegrees(
      atan2(-ny, hypot(nx, nz)));
  double roll = AURAFaceDepthCanonicalEyeLineAngle(
      AURAFaceDepthRadiansToDegrees(atan2(eyeY, eyeX)));
  if (!isfinite(yaw) || !isfinite(pitch) || !isfinite(roll)) {
    return result;
  }

  result.valid = YES;
  result.pitchDeg = pitch;
  result.yawDeg = yaw;
  result.rollDeg = roll;
  return result;
}

AURAFaceDepthPoint2D AURAFaceDepthPointToUpright(
    AURAFaceDepthPoint2D point,
    NSInteger exifOrientation,
    BOOL mirrored)
{
  if (!isfinite(point.x) || !isfinite(point.y)) {
    return AURAFaceDepthPoint2DMake(NAN, NAN);
  }

  AURAFaceDepthPoint2D upright;
  switch (exifOrientation) {
    case 1:
      upright = point;
      break;
    case 3:
      upright = AURAFaceDepthPoint2DMake(1.0 - point.x, 1.0 - point.y);
      break;
    case 6:
      upright = AURAFaceDepthPoint2DMake(1.0 - point.y, point.x);
      break;
    case 8:
      upright = AURAFaceDepthPoint2DMake(point.y, 1.0 - point.x);
      break;
    default:
      return AURAFaceDepthPoint2DMake(NAN, NAN);
  }

  if (mirrored) {
    upright.x = 1.0 - upright.x;
  }
  upright.x = AURAFaceDepthClamp01(upright.x);
  upright.y = AURAFaceDepthClamp01(upright.y);
  return upright;
}

NSUInteger AURAFaceDepthClampDeadlineMilliseconds(double milliseconds)
{
  if (isnan(milliseconds)) {
    return 1500;
  }
  if (milliseconds <= 1) {
    return 1;
  }
  if (milliseconds >= 1500) {
    return 1500;
  }
  return (NSUInteger)llround(milliseconds);
}

BOOL AURAFaceDepthRatiosAreFinitePositive(
    const double *ratios,
    NSUInteger count)
{
  if (!ratios || count == 0) {
    return NO;
  }
  for (NSUInteger index = 0; index < count; index++) {
    if (!isfinite(ratios[index]) || ratios[index] <= 0) {
      return NO;
    }
  }
  return YES;
}
