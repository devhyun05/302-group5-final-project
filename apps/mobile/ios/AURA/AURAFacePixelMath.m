#import "AURAFacePixelMath.h"

#import <float.h>
#import <math.h>
#import <string.h>

static const double kMinSamplesForFullConfidence = 40.0;
static const uint8_t kOverexposedThreshold = 250;
static const uint8_t kUnderexposedThreshold = 16;
static const uint8_t kSpecularBrightMinimum = 230;
static const uint8_t kSpecularSaturationMaximum = 20;
static const double kSkinMatteRejectionThreshold = 0.72;

static double Clamp01(double value) { return fmax(0.0, fmin(1.0, value)); }

static BOOL ValidBuffer(AURAFacePixelBuffer buffer) {
  return buffer.bytes && buffer.width > 0 && buffer.height > 0 &&
      buffer.bytesPerRow >= buffer.width * 4;
}

AURAFacePixelBuffer AURAFacePixelBufferMake(
    const uint8_t *bytes, size_t width, size_t height, size_t bytesPerRow) {
  return (AURAFacePixelBuffer){bytes, width, height, bytesPerRow};
}

AURAFacePixelScalarBuffer AURAFacePixelScalarBufferMake(
    const void *bytes,
    size_t width,
    size_t height,
    size_t bytesPerRow,
    AURAFacePixelScalarFormat format) {
  return (AURAFacePixelScalarBuffer){
    bytes, width, height, bytesPerRow, format,
  };
}

AURAFacePixelPoint AURAFacePixelPointMake(double x, double y) {
  return (AURAFacePixelPoint){x, y};
}

void AURAFacePixelAccumulatorInit(AURAFacePixelAccumulator *accumulator) {
  if (!accumulator) return;
  memset(accumulator, 0, sizeof(*accumulator));
}

static BOOL SpecularPixel(uint8_t red, uint8_t green, uint8_t blue) {
  uint8_t maximum = (uint8_t)fmax(red, fmax(green, blue));
  uint8_t minimum = (uint8_t)fmin(red, fmin(green, blue));
  return minimum >= kSpecularBrightMinimum &&
      maximum - minimum <= kSpecularSaturationMaximum;
}

void AURAFacePixelAccumulatorAdd(
    AURAFacePixelAccumulator *accumulator,
    uint8_t red,
    uint8_t green,
    uint8_t blue,
    double weight) {
  if (!accumulator) return;
  accumulator->sampledCount += 1;
  uint8_t maximum = (uint8_t)fmax(red, fmax(green, blue));
  if (maximum >= kOverexposedThreshold) {
    accumulator->overexposedCount += 1;
  }
  if (maximum <= kUnderexposedThreshold) {
    accumulator->underexposedCount += 1;
  }
  if (SpecularPixel(red, green, blue)) {
    accumulator->specularRejectedCount += 1;
    return;
  }

  double safeWeight = fmax(0.0, weight);
  accumulator->sumWeight += safeWeight;
  accumulator->sumWeightedRed += safeWeight * red;
  accumulator->sumWeightedGreen += safeWeight * green;
  accumulator->sumWeightedBlue += safeWeight * blue;
  accumulator->sumWeightedRedSquared += safeWeight * red * red;
  accumulator->sumWeightedGreenSquared += safeWeight * green * green;
  accumulator->sumWeightedBlueSquared += safeWeight * blue * blue;
  accumulator->accumulatedCount += 1;
  NSUInteger bin = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
  accumulator->histogram[bin] += 1;
}

static double WeightedVariance(
    double weightedSquaredSum,
    double weightedSum,
    double weight) {
  if (weight <= 0) return 0;
  double mean = weightedSum / weight;
  return fmax(0.0, weightedSquaredSum / weight - mean * mean);
}

AURAFacePixelRegionStatistics AURAFacePixelAccumulatorFinalize(
    const AURAFacePixelAccumulator *accumulator) {
  AURAFacePixelRegionStatistics result = {0};
  if (!accumulator || accumulator->sampledCount == 0 ||
      accumulator->sumWeight <= 0) {
    return result;
  }

  result.valid = YES;
  result.rgbMean = (AURAFacePixelRGB){
    accumulator->sumWeightedRed / accumulator->sumWeight,
    accumulator->sumWeightedGreen / accumulator->sumWeight,
    accumulator->sumWeightedBlue / accumulator->sumWeight,
  };
  result.rgbVariance = (AURAFacePixelRGB){
    WeightedVariance(
        accumulator->sumWeightedRedSquared,
        accumulator->sumWeightedRed,
        accumulator->sumWeight),
    WeightedVariance(
        accumulator->sumWeightedGreenSquared,
        accumulator->sumWeightedGreen,
        accumulator->sumWeight),
    WeightedVariance(
        accumulator->sumWeightedBlueSquared,
        accumulator->sumWeightedBlue,
        accumulator->sumWeight),
  };

  NSUInteger bestBin = 0;
  NSUInteger bestCount = 0;
  for (NSUInteger index = 0; index < 512; index++) {
    if (accumulator->histogram[index] > bestCount) {
      bestCount = accumulator->histogram[index];
      bestBin = index;
    }
  }
  result.dominant = (AURAFacePixelRGB){
    ((bestBin >> 6) & 7) * 32 + 16,
    ((bestBin >> 3) & 7) * 32 + 16,
    (bestBin & 7) * 32 + 16,
  };
  result.sampleCount = accumulator->accumulatedCount;
  result.inputSampleCount = accumulator->sampledCount;
  result.overexposedCount = accumulator->overexposedCount;
  result.underexposedCount = accumulator->underexposedCount;
  result.specularRejectedCount = accumulator->specularRejectedCount;
  double denominator = accumulator->sampledCount;
  result.overexposedRatio = accumulator->overexposedCount / denominator;
  result.underexposedRatio = accumulator->underexposedCount / denominator;
  result.specularRejectedRatio =
      accumulator->specularRejectedCount / denominator;
  double countTerm = fmin(
      1.0, accumulator->accumulatedCount / kMinSamplesForFullConfidence);
  double exposureTerm = 1.0 - fmin(
      1.0, result.overexposedRatio + result.underexposedRatio);
  double specularTerm = 1.0 - fmin(1.0, result.specularRejectedRatio);
  result.confidence = Clamp01(
      0.5 * countTerm + 0.3 * exposureTerm + 0.2 * specularTerm);
  return result;
}

static const int kAnatomicalLeftEye[] = {362, 385, 387, 263, 373, 380};
static const int kAnatomicalRightEye[] = {33, 160, 158, 133, 153, 144};
static const int kAnatomicalLeftBrow[] = {336, 296, 334, 293, 300};
static const int kAnatomicalRightBrow[] = {70, 63, 105, 66, 107};

const int *AURAFacePixelEyeContourLandmarkIndices(
    BOOL anatomicalLeft, NSUInteger *count) {
  if (count) *count = 6;
  return anatomicalLeft ? kAnatomicalLeftEye : kAnatomicalRightEye;
}

const int *AURAFacePixelBrowLandmarkIndices(
    BOOL anatomicalLeft, NSUInteger *count) {
  if (count) *count = 5;
  return anatomicalLeft ? kAnatomicalLeftBrow : kAnatomicalRightBrow;
}

int AURAFacePixelIrisLandmarkIndex(BOOL anatomicalLeft) {
  return anatomicalLeft ? 473 : 468;
}

AURAFacePixelPoint AURAFacePixelPointToUpright(
    AURAFacePixelPoint point, NSInteger orientation, BOOL mirrored) {
  AURAFacePixelPoint upright = point;
  if (orientation == 3) {
    upright = AURAFacePixelPointMake(1.0 - point.x, 1.0 - point.y);
  } else if (orientation == 6) {
    upright = AURAFacePixelPointMake(1.0 - point.y, point.x);
  } else if (orientation == 8) {
    upright = AURAFacePixelPointMake(point.y, 1.0 - point.x);
  }
  if (mirrored) upright.x = 1.0 - upright.x;
  upright.x = Clamp01(upright.x);
  upright.y = Clamp01(upright.y);
  return upright;
}

static AURAFacePixelPoint OrientedPoint(AURAFacePixelPoint point, BOOL mirrored) {
  return mirrored ? AURAFacePixelPointMake(1.0 - point.x, point.y) : point;
}

BOOL AURAFacePixelPointInPolygon(
    AURAFacePixelPoint point,
    const AURAFacePixelPoint *polygon,
    NSUInteger count,
    BOOL mirrored) {
  if (!polygon || count < 3) return NO;
  BOOL inside = NO;
  for (NSUInteger i = 0, j = count - 1; i < count; j = i++) {
    AURAFacePixelPoint a = OrientedPoint(polygon[i], mirrored);
    AURAFacePixelPoint b = OrientedPoint(polygon[j], mirrored);
    if ((a.y > point.y) == (b.y > point.y)) continue;
    double dy = b.y - a.y;
    if (fabs(dy) <= DBL_EPSILON) continue;
    double edgeX = a.x + (b.x - a.x) * (point.y - a.y) / dy;
    if (point.x < edgeX) inside = !inside;
  }
  return inside;
}

static double SegmentDistance(
    AURAFacePixelPoint point,
    AURAFacePixelPoint start,
    AURAFacePixelPoint end) {
  double dx = end.x - start.x;
  double dy = end.y - start.y;
  double squaredLength = dx * dx + dy * dy;
  if (squaredLength <= DBL_EPSILON) {
    return hypot(point.x - start.x, point.y - start.y);
  }
  double t = Clamp01(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
      squaredLength);
  return hypot(
      point.x - start.x - t * dx,
      point.y - start.y - t * dy);
}

double AURAFacePixelDistanceToPolyline(
    AURAFacePixelPoint point,
    const AURAFacePixelPoint *polyline,
    NSUInteger count,
    BOOL mirrored) {
  if (!polyline || count < 2) return DBL_MAX;
  double distance = DBL_MAX;
  for (NSUInteger i = 1; i < count; i++) {
    distance = fmin(
        distance,
        SegmentDistance(
            point,
            OrientedPoint(polyline[i - 1], mirrored),
            OrientedPoint(polyline[i], mirrored)));
  }
  return distance;
}

static BOOL Bounds(
    const AURAFacePixelPoint *points,
    NSUInteger count,
    BOOL mirrored,
    double padding,
    double *minX,
    double *maxX,
    double *minY,
    double *maxY) {
  if (!points || count == 0) return NO;
  *minX = *minY = 1.0;
  *maxX = *maxY = 0.0;
  for (NSUInteger i = 0; i < count; i++) {
    AURAFacePixelPoint point = OrientedPoint(points[i], mirrored);
    *minX = fmin(*minX, point.x);
    *maxX = fmax(*maxX, point.x);
    *minY = fmin(*minY, point.y);
    *maxY = fmax(*maxY, point.y);
  }
  *minX = Clamp01(*minX - padding);
  *maxX = Clamp01(*maxX + padding);
  *minY = Clamp01(*minY - padding);
  *maxY = Clamp01(*maxY + padding);
  return *maxX > *minX && *maxY > *minY;
}

typedef BOOL (*GridPredicate)(
    AURAFacePixelPoint point, const void *context, BOOL mirrored);

static AURAFacePixelCoverage GridCoverage(
    AURAFacePixelBuffer buffer,
    double minX,
    double maxX,
    double minY,
    double maxY,
    NSUInteger columns,
    NSUInteger rows,
    GridPredicate predicate,
    const void *context,
    BOOL mirrored) {
  AURAFacePixelCoverage result = {0, 0, 0};
  if (!ValidBuffer(buffer) || columns == 0 || rows == 0) return result;
  for (NSUInteger row = 0; row < rows; row++) {
    for (NSUInteger column = 0; column < columns; column++) {
      AURAFacePixelPoint point = AURAFacePixelPointMake(
          minX + (maxX - minX) * ((double)column + 0.5) / columns,
          minY + (maxY - minY) * ((double)row + 0.5) / rows);
      result.sampledCount += 1;
      if (predicate(point, context, mirrored)) result.includedCount += 1;
    }
  }
  result.roiCoverage = result.sampledCount
      ? (double)result.includedCount / result.sampledCount
      : 0.0;
  return result;
}

typedef struct {
  const AURAFacePixelPoint *points;
  NSUInteger count;
  double radius;
} ShapeContext;

static BOOL PolygonPredicate(
    AURAFacePixelPoint point, const void *rawContext, BOOL mirrored) {
  const ShapeContext *context = rawContext;
  return AURAFacePixelPointInPolygon(
      point, context->points, context->count, mirrored);
}

static BOOL BandPredicate(
    AURAFacePixelPoint point, const void *rawContext, BOOL mirrored) {
  const ShapeContext *context = rawContext;
  return AURAFacePixelDistanceToPolyline(
      point, context->points, context->count, mirrored) <= context->radius;
}

AURAFacePixelCoverage AURAFacePixelPolygonCoverage(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *polygon,
    NSUInteger count,
    NSUInteger columns,
    NSUInteger rows,
    BOOL mirrored) {
  double minX, maxX, minY, maxY;
  if (!Bounds(polygon, count, mirrored, 0, &minX, &maxX, &minY, &maxY)) {
    return (AURAFacePixelCoverage){0, 0, 0};
  }
  ShapeContext context = {polygon, count, 0};
  return GridCoverage(
      buffer, minX, maxX, minY, maxY, columns, rows,
      PolygonPredicate, &context, mirrored);
}

AURAFacePixelCoverage AURAFacePixelPolylineBandCoverage(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *polyline,
    NSUInteger count,
    double radius,
    NSUInteger columns,
    NSUInteger rows,
    BOOL mirrored) {
  double minX, maxX, minY, maxY;
  if (radius <= 0 ||
      !Bounds(polyline, count, mirrored, radius, &minX, &maxX, &minY, &maxY)) {
    return (AURAFacePixelCoverage){0, 0, 0};
  }
  ShapeContext context = {polyline, count, radius};
  return GridCoverage(
      buffer, minX, maxX, minY, maxY, columns, rows,
      BandPredicate, &context, mirrored);
}

static BOOL ValidScalarBuffer(AURAFacePixelScalarBuffer buffer) {
  if (!buffer.bytes || buffer.width == 0 || buffer.height == 0) return NO;
  if (buffer.format == AURAFacePixelScalarFormatUInt8) {
    return buffer.bytesPerRow >= buffer.width;
  }
  if (buffer.format == AURAFacePixelScalarFormatFloat32) {
    return buffer.bytesPerRow >= buffer.width * sizeof(float);
  }
  return NO;
}

static size_t PixelCoordinate(double normalized, size_t length) {
  if (length <= 1) return 0;
  return (size_t)llround(Clamp01(normalized) * ((double)length - 1.0));
}

static double ScalarAtPoint(
    AURAFacePixelScalarBuffer buffer, AURAFacePixelPoint point) {
  if (!ValidScalarBuffer(buffer)) return 0;
  size_t x = PixelCoordinate(point.x, buffer.width);
  size_t y = PixelCoordinate(point.y, buffer.height);
  const uint8_t *row =
      (const uint8_t *)buffer.bytes + y * buffer.bytesPerRow;
  if (buffer.format == AURAFacePixelScalarFormatUInt8) {
    return row[x] / 255.0;
  }
  const float *floatRow = (const float *)row;
  return Clamp01(floatRow[x]);
}

static void RGBAtPoint(
    AURAFacePixelBuffer buffer,
    AURAFacePixelPoint point,
    uint8_t *red,
    uint8_t *green,
    uint8_t *blue) {
  size_t x = PixelCoordinate(point.x, buffer.width);
  size_t y = PixelCoordinate(point.y, buffer.height);
  const uint8_t *pixel = buffer.bytes + y * buffer.bytesPerRow + x * 4;
  *red = pixel[0];
  *green = pixel[1];
  *blue = pixel[2];
}

static AURAFacePixelRegionAnalysis FinalizeRegionAnalysis(
    AURAFacePixelRegionAnalysis result,
    const AURAFacePixelAccumulator *accumulator) {
  result.statistics = AURAFacePixelAccumulatorFinalize(accumulator);
  result.roiCoverage = result.gridSampleCount
      ? (double)result.acceptedCount / result.gridSampleCount
      : 0;
  result.matteCoverage = result.roiCandidateCount
      ? (double)result.acceptedCount / result.roiCandidateCount
      : 0;
  return result;
}

AURAFacePixelRegionAnalysis AURAFacePixelAnalyzeEyeRegion(
    AURAFacePixelBuffer buffer,
    AURAFacePixelScalarBuffer skinMatte,
    const AURAFacePixelPoint *contour,
    NSUInteger count,
    AURAFacePixelPoint iris,
    double radiusX,
    double radiusY,
    NSUInteger columns,
    NSUInteger rows,
    BOOL mirrored) {
  AURAFacePixelRegionAnalysis result = {0};
  AURAFacePixelAccumulator accumulator;
  AURAFacePixelAccumulatorInit(&accumulator);
  if (!ValidBuffer(buffer) || !contour || count < 3 ||
      radiusX <= 0 || radiusY <= 0 || columns == 0 || rows == 0) {
    return result;
  }

  BOOL hasSkinMatte = ValidScalarBuffer(skinMatte);
  AURAFacePixelPoint orientedIris = OrientedPoint(iris, mirrored);
  for (NSUInteger row = 0; row < rows; row++) {
    for (NSUInteger column = 0; column < columns; column++) {
      double dx = ((double)column + 0.5) / columns * 2.0 - 1.0;
      double dy = ((double)row + 0.5) / rows * 2.0 - 1.0;
      result.gridSampleCount += 1;
      if (dx * dx + dy * dy > 1.0) continue;
      AURAFacePixelPoint point = AURAFacePixelPointMake(
          orientedIris.x + dx * radiusX,
          orientedIris.y + dy * radiusY);
      if (!AURAFacePixelPointInPolygon(point, contour, count, mirrored)) {
        continue;
      }
      result.roiCandidateCount += 1;
      double skinAlpha = hasSkinMatte ? ScalarAtPoint(skinMatte, point) : 0;
      if (hasSkinMatte && skinAlpha >= kSkinMatteRejectionThreshold) {
        result.matteRejectedCount += 1;
        continue;
      }

      uint8_t red, green, blue;
      RGBAtPoint(buffer, point, &red, &green, &blue);
      uint8_t maximum = (uint8_t)fmax(red, fmax(green, blue));
      uint8_t minimum = (uint8_t)fmin(red, fmin(green, blue));
      // Near-white glints are measured by the shared accumulator, while
      // ordinary low-saturation sclera is excluded from iris color.
      if (!SpecularPixel(red, green, blue) &&
          minimum >= 145 && maximum - minimum <= 45) {
        result.scleraRejectedCount += 1;
        continue;
      }
      result.acceptedCount += 1;
      AURAFacePixelAccumulatorAdd(&accumulator, red, green, blue, 1.0);
    }
  }
  return FinalizeRegionAnalysis(result, &accumulator);
}

AURAFacePixelRegionAnalysis AURAFacePixelAnalyzeBrowRegion(
    AURAFacePixelBuffer buffer,
    AURAFacePixelScalarBuffer skinMatte,
    const AURAFacePixelPoint *polyline,
    NSUInteger count,
    double radius,
    NSUInteger columns,
    NSUInteger rows,
    BOOL mirrored) {
  AURAFacePixelRegionAnalysis result = {0};
  AURAFacePixelAccumulator accumulator;
  AURAFacePixelAccumulatorInit(&accumulator);
  double minX, maxX, minY, maxY;
  if (!ValidBuffer(buffer) || radius <= 0 || columns == 0 || rows == 0 ||
      !Bounds(
          polyline, count, mirrored, radius,
          &minX, &maxX, &minY, &maxY)) {
    return result;
  }

  BOOL hasSkinMatte = ValidScalarBuffer(skinMatte);
  for (NSUInteger row = 0; row < rows; row++) {
    for (NSUInteger column = 0; column < columns; column++) {
      AURAFacePixelPoint point = AURAFacePixelPointMake(
          minX + (maxX - minX) * ((double)column + 0.5) / columns,
          minY + (maxY - minY) * ((double)row + 0.5) / rows);
      result.gridSampleCount += 1;
      if (AURAFacePixelDistanceToPolyline(
              point, polyline, count, mirrored) > radius) {
        continue;
      }
      result.roiCandidateCount += 1;
      double skinAlpha = hasSkinMatte ? ScalarAtPoint(skinMatte, point) : 0;
      if (hasSkinMatte && skinAlpha >= kSkinMatteRejectionThreshold) {
        result.matteRejectedCount += 1;
        continue;
      }

      uint8_t red, green, blue;
      RGBAtPoint(buffer, point, &red, &green, &blue);
      result.acceptedCount += 1;
      AURAFacePixelAccumulatorAdd(
          &accumulator,
          red,
          green,
          blue,
          hasSkinMatte ? fmax(0.2, 1.0 - skinAlpha) : 1.0);
    }
  }
  return FinalizeRegionAnalysis(result, &accumulator);
}

static double Luminance(AURAFacePixelBuffer buffer, size_t x, size_t y) {
  const uint8_t *pixel = buffer.bytes + y * buffer.bytesPerRow + x * 4;
  return (0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]) /
      255.0;
}

double AURAFacePixelLaplacianVariance(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *facePolygon,
    NSUInteger count,
    BOOL mirrored) {
  if (!ValidBuffer(buffer) || buffer.width < 3 || buffer.height < 3) return 0;
  double sum = 0, squaredSum = 0;
  NSUInteger sampleCount = 0;
  for (size_t y = 1; y + 1 < buffer.height; y++) {
    for (size_t x = 1; x + 1 < buffer.width; x++) {
      AURAFacePixelPoint point = AURAFacePixelPointMake(
          ((double)x + 0.5) / buffer.width,
          ((double)y + 0.5) / buffer.height);
      if (!AURAFacePixelPointInPolygon(point, facePolygon, count, mirrored)) continue;
      double laplacian = 255.0 * (
          4.0 * Luminance(buffer, x, y) -
          Luminance(buffer, x - 1, y) - Luminance(buffer, x + 1, y) -
          Luminance(buffer, x, y - 1) - Luminance(buffer, x, y + 1));
      sum += laplacian;
      squaredSum += laplacian * laplacian;
      sampleCount += 1;
    }
  }
  if (!sampleCount) return 0;
  double mean = sum / sampleCount;
  return fmax(0.0, squaredSum / sampleCount - mean * mean);
}

AURAFacePixelLighting AURAFacePixelLightingInPolygon(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *facePolygon,
    NSUInteger count,
    BOOL mirrored) {
  AURAFacePixelLighting result = {0, 0, 0, 0, 0, 0};
  double minX, maxX, minY, maxY;
  if (!ValidBuffer(buffer) ||
      !Bounds(facePolygon, count, mirrored, 0, &minX, &maxX, &minY, &maxY)) {
    return result;
  }
  double imageSplit = (minX + maxX) / 2.0;
  double globalSum = 0, leftSum = 0, rightSum = 0;
  NSUInteger leftCount = 0, rightCount = 0;
  for (size_t y = 0; y < buffer.height; y++) {
    for (size_t x = 0; x < buffer.width; x++) {
      AURAFacePixelPoint point = AURAFacePixelPointMake(
          ((double)x + 0.5) / buffer.width,
          ((double)y + 0.5) / buffer.height);
      if (!AURAFacePixelPointInPolygon(point, facePolygon, count, mirrored)) continue;
      double luminance = Luminance(buffer, x, y);
      globalSum += luminance;
      result.sampleCount += 1;
      // MediaPipe anatomical left is image-right for unmirrored input and
      // image-left after horizontal mirror normalization.
      BOOL anatomicalLeft = mirrored
          ? point.x < imageSplit
          : point.x >= imageSplit;
      if (anatomicalLeft) {
        leftSum += luminance;
        leftCount += 1;
      } else {
        rightSum += luminance;
        rightCount += 1;
      }
    }
  }
  if (!result.sampleCount) return result;
  result.globalLuminance = globalSum / result.sampleCount;
  result.leftLuminance = leftCount ? leftSum / leftCount : result.globalLuminance;
  result.rightLuminance = rightCount ? rightSum / rightCount : result.globalLuminance;
  result.uniformityScore = Clamp01(
      1.0 - fabs(result.leftLuminance - result.rightLuminance));
  double exposureScore = Clamp01(
      1.0 - fabs(result.globalLuminance - 0.55) / 0.55);
  result.score = Clamp01(0.55 * exposureScore + 0.45 * result.uniformityScore);
  return result;
}

static double LinearChannel(uint8_t channel) {
  double encoded = channel / 255.0;
  return encoded <= 0.04045
      ? encoded / 12.92
      : pow((encoded + 0.055) / 1.055, 2.4);
}

static double LabTransform(double value) {
  const double delta = 6.0 / 29.0;
  return value > delta * delta * delta
      ? cbrt(value)
      : value / (3.0 * delta * delta) + 4.0 / 29.0;
}

AURAFacePixelLab AURAFacePixelRGBToLab(uint8_t red, uint8_t green, uint8_t blue) {
  double r = LinearChannel(red), g = LinearChannel(green), b = LinearChannel(blue);
  double x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  double y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  double z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  double fx = LabTransform(x / 0.95047);
  double fy = LabTransform(y);
  double fz = LabTransform(z / 1.08883);
  return (AURAFacePixelLab){
    116.0 * fy - 16.0,
    500.0 * (fx - fy),
    200.0 * (fy - fz),
  };
}

double AURAFacePixelDeltaE76(AURAFacePixelLab first, AURAFacePixelLab second) {
  return hypot(hypot(first.L - second.L, first.a - second.a), first.b - second.b);
}
