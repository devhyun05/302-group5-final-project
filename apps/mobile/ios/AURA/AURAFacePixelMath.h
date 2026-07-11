#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef struct {
  const uint8_t *bytes;
  size_t width;
  size_t height;
  size_t bytesPerRow;
} AURAFacePixelBuffer;

typedef NS_ENUM(NSUInteger, AURAFacePixelScalarFormat) {
  AURAFacePixelScalarFormatNone = 0,
  AURAFacePixelScalarFormatUInt8 = 1,
  AURAFacePixelScalarFormatFloat32 = 2,
};

typedef struct {
  const void *bytes;
  size_t width;
  size_t height;
  size_t bytesPerRow;
  AURAFacePixelScalarFormat format;
} AURAFacePixelScalarBuffer;

typedef struct { double x, y; } AURAFacePixelPoint;

typedef struct { double red, green, blue; } AURAFacePixelRGB;

typedef struct {
  double sumWeight;
  double sumWeightedRed;
  double sumWeightedGreen;
  double sumWeightedBlue;
  double sumWeightedRedSquared;
  double sumWeightedGreenSquared;
  double sumWeightedBlueSquared;
  NSUInteger sampledCount;
  NSUInteger accumulatedCount;
  NSUInteger overexposedCount;
  NSUInteger underexposedCount;
  NSUInteger specularRejectedCount;
  NSUInteger histogram[512];
} AURAFacePixelAccumulator;

typedef struct {
  BOOL valid;
  AURAFacePixelRGB rgbMean;
  AURAFacePixelRGB rgbVariance;
  AURAFacePixelRGB dominant;
  NSUInteger sampleCount;
  NSUInteger inputSampleCount;
  NSUInteger overexposedCount;
  NSUInteger underexposedCount;
  NSUInteger specularRejectedCount;
  double overexposedRatio;
  double underexposedRatio;
  double specularRejectedRatio;
  double confidence;
} AURAFacePixelRegionStatistics;

typedef struct {
  AURAFacePixelRegionStatistics statistics;
  NSUInteger gridSampleCount;
  NSUInteger roiCandidateCount;
  NSUInteger acceptedCount;
  NSUInteger matteRejectedCount;
  NSUInteger scleraRejectedCount;
  double roiCoverage;
  double matteCoverage;
} AURAFacePixelRegionAnalysis;

typedef struct {
  NSUInteger sampledCount;
  NSUInteger includedCount;
  double roiCoverage;
} AURAFacePixelCoverage;

typedef struct {
  double globalLuminance;
  double leftLuminance;
  double rightLuminance;
  double uniformityScore;
  double score;
  NSUInteger sampleCount;
} AURAFacePixelLighting;

typedef struct { double L, a, b; } AURAFacePixelLab;

FOUNDATION_EXPORT AURAFacePixelBuffer AURAFacePixelBufferMake(
    const uint8_t *bytes, size_t width, size_t height, size_t bytesPerRow);
FOUNDATION_EXPORT AURAFacePixelScalarBuffer AURAFacePixelScalarBufferMake(
    const void * _Nullable bytes,
    size_t width,
    size_t height,
    size_t bytesPerRow,
    AURAFacePixelScalarFormat format);
FOUNDATION_EXPORT AURAFacePixelPoint AURAFacePixelPointMake(double x, double y);
FOUNDATION_EXPORT void AURAFacePixelAccumulatorInit(
    AURAFacePixelAccumulator *accumulator);
FOUNDATION_EXPORT void AURAFacePixelAccumulatorAdd(
    AURAFacePixelAccumulator *accumulator,
    uint8_t red,
    uint8_t green,
    uint8_t blue,
    double weight);
FOUNDATION_EXPORT AURAFacePixelRegionStatistics
    AURAFacePixelAccumulatorFinalize(
        const AURAFacePixelAccumulator *accumulator);
FOUNDATION_EXPORT const int *AURAFacePixelEyeContourLandmarkIndices(
    BOOL anatomicalLeft, NSUInteger * _Nullable count);
FOUNDATION_EXPORT const int *AURAFacePixelBrowLandmarkIndices(
    BOOL anatomicalLeft, NSUInteger * _Nullable count);
FOUNDATION_EXPORT int AURAFacePixelIrisLandmarkIndex(BOOL anatomicalLeft);
FOUNDATION_EXPORT AURAFacePixelPoint AURAFacePixelPointToUpright(
    AURAFacePixelPoint point, NSInteger exifOrientation, BOOL mirrored);

FOUNDATION_EXPORT BOOL AURAFacePixelPointInPolygon(
    AURAFacePixelPoint point,
    const AURAFacePixelPoint *polygon,
    NSUInteger count,
    BOOL mirrored);
FOUNDATION_EXPORT double AURAFacePixelDistanceToPolyline(
    AURAFacePixelPoint point,
    const AURAFacePixelPoint *polyline,
    NSUInteger count,
    BOOL mirrored);

FOUNDATION_EXPORT AURAFacePixelCoverage AURAFacePixelPolygonCoverage(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *polygon,
    NSUInteger count,
    NSUInteger gridColumns,
    NSUInteger gridRows,
    BOOL mirrored);
FOUNDATION_EXPORT AURAFacePixelCoverage AURAFacePixelPolylineBandCoverage(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *polyline,
    NSUInteger count,
    double bandRadius,
    NSUInteger gridColumns,
    NSUInteger gridRows,
    BOOL mirrored);

FOUNDATION_EXPORT AURAFacePixelRegionAnalysis AURAFacePixelAnalyzeEyeRegion(
    AURAFacePixelBuffer buffer,
    AURAFacePixelScalarBuffer skinMatte,
    const AURAFacePixelPoint *contour,
    NSUInteger count,
    AURAFacePixelPoint iris,
    double radiusX,
    double radiusY,
    NSUInteger gridColumns,
    NSUInteger gridRows,
    BOOL mirrored);
FOUNDATION_EXPORT AURAFacePixelRegionAnalysis AURAFacePixelAnalyzeBrowRegion(
    AURAFacePixelBuffer buffer,
    AURAFacePixelScalarBuffer skinMatte,
    const AURAFacePixelPoint *polyline,
    NSUInteger count,
    double bandRadius,
    NSUInteger gridColumns,
    NSUInteger gridRows,
    BOOL mirrored);

FOUNDATION_EXPORT double AURAFacePixelLaplacianVariance(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *facePolygon,
    NSUInteger count,
    BOOL mirrored);
FOUNDATION_EXPORT AURAFacePixelLighting AURAFacePixelLightingInPolygon(
    AURAFacePixelBuffer buffer,
    const AURAFacePixelPoint *facePolygon,
    NSUInteger count,
    BOOL mirrored);

FOUNDATION_EXPORT AURAFacePixelLab AURAFacePixelRGBToLab(
    uint8_t red, uint8_t green, uint8_t blue);
FOUNDATION_EXPORT double AURAFacePixelDeltaE76(
    AURAFacePixelLab first, AURAFacePixelLab second);

NS_ASSUME_NONNULL_END
