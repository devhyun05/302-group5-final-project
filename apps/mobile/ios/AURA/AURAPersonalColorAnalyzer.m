#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>

#import "AURAFacePixelMath.h"
#import "AURATransientMatteStore.h"

BOOL AURAPersonalColorReadsFileAuxiliaryDataForOptions(NSDictionary *options) {
  return ![options[@"artifactPolicy"] isEqualToString:@"face_profile"];
}

// AURAPersonalColorAnalyzer — 온디바이스 퍼스널 컬러 ROI 색 통계.
// LOCKED: CPU 픽셀 루프(Core Image 미사용), 알파 가중은 별도 matte 버퍼에서만.
// 반환 스키마는 src/features/personal-color/services/personalColorCore/contracts.ts의
// NativePersonalColorResult 와 일치.
//
// 얼굴 검출은 하지 않는다. CocoaPods MediaPipe 는 Unity homuler MediaPipe 와 중복
// 크래시를 일으켜 제거됐고(020cb33), 랜드마크는 Unity homuler(IMAGE 모드)가 검출해
// options[@"landmarks"] 로 넘겨준다. homuler 는 MediaPipe 와 동일한 478점 메시라
// 기존 인덱스 상수(234/454/10, 입술·볼 클러스터)를 그대로 쓴다.
//
// NOTE: matte 재구성/샘플링 헬퍼는 AURAFaceRatioHairline.m의 static 헬퍼를 이 모듈에
// self-contained로 복제(promote 대신)했다 — 작동 중인 hairline 파일을 건드리지 않기 위함.
// lip index 배열은 E7NativeLipBoundaryProviders.swift:1842-1850에서 복제.

#pragma mark - 튜닝 상수 (calibration target)

static const double kSkinAlphaGate = 0.6;
static const double kHairAlphaGate = 0.6;
static const double kSkinPatchRadiusFraction = 0.045; // faceWidth 대비
static const int kSkinPatchGridSteps = 21;
static const int kHairGridStepsX = 40;
static const int kHairGridStepsY = 24;
static const int kLipGridStepsX = 48;
static const int kLipGridStepsY = 40;
static const int kEyeGridStepsX = 28;
static const int kEyeGridStepsY = 20;
static const int kBrowGridStepsX = 36;
static const int kBrowGridStepsY = 16;

// MediaPipe 입술 컨투어 인덱스 (E7NativeLipBoundaryProviders.swift 복제)
static const int kOuterLipIndices[] = {61, 146, 91, 181, 84, 17, 314, 405, 321, 375,
                                       291, 409, 270, 269, 267, 0, 37, 39, 40, 185};
static const int kInnerLipIndices[] = {78, 95, 88, 178, 87, 14, 317, 402, 318, 324,
                                       308, 415, 310, 311, 312, 13, 82, 81, 80, 191};
static const int kOuterLipCount = 20;
static const int kInnerLipCount = 20;

// 피부 패치 landmark 클러스터
static const int kLeftCheekIndices[] = {50, 101, 118, 119, 205, 36};
static const int kRightCheekIndices[] = {280, 330, 347, 348, 425, 266};
static const int kForeheadIndices[] = {10, 151, 9, 107, 336};
static const int kFaceQualityIndices[] = {10, 338, 454, 323, 152, 93, 234, 109};
enum {
  AURAPCEyeContourCount = 6,
  AURAPCBrowPointCount = 5,
  AURAPCFaceQualityPointCount = 8,
};

#pragma mark - 기본 헬퍼

static double AURAPCClamp01(double v) { return fmax(0.0, fmin(1.0, v)); }
static int AURAPCClampInt(int v, int lo, int hi) { return (int)fmax(lo, fmin(hi, v)); }

typedef struct {
  uint8_t *data;
  size_t width;
  size_t height;
  size_t bytesPerRow;
} AURAPCImageBuffer;

// EXIF orientation을 픽셀에 bake (AURAFaceRatioUprightImage 패턴)
static UIImage *AURAPCUprightImage(UIImage *image) {
  if (image.imageOrientation == UIImageOrientationUp) {
    return image;
  }
  UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat defaultFormat];
  format.scale = 1.0;
  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithSize:image.size format:format];
  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    [image drawInRect:CGRectMake(0, 0, image.size.width, image.size.height)];
  }];
}

static CGImagePropertyOrientation AURAPCExifOrientation(CGImageSourceRef source) {
  NSDictionary *properties =
      CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  NSNumber *orientation = properties[(NSString *)kCGImagePropertyOrientation];
  if (![orientation respondsToSelector:@selector(unsignedIntValue)]) {
    return kCGImagePropertyOrientationUp;
  }
  return (CGImagePropertyOrientation)orientation.unsignedIntValue;
}

// 캡처 파일의 aux data → AVSemanticSegmentationMatte (EXIF 정립)
static AVSemanticSegmentationMatte *AURAPCCopyMatte(CGImageSourceRef source,
                                                    CFStringRef auxiliaryDataType,
                                                    CGImagePropertyOrientation orientation) {
  NSDictionary *auxiliaryInfo =
      CFBridgingRelease(CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, auxiliaryDataType));
  if (![auxiliaryInfo isKindOfClass:[NSDictionary class]]) {
    return nil;
  }
  NSError *error = nil;
  AVSemanticSegmentationMatte *matte = [AVSemanticSegmentationMatte
      semanticSegmentationMatteFromImageSourceAuxiliaryDataType:auxiliaryDataType
                                      dictionaryRepresentation:auxiliaryInfo
                                                         error:&error];
  if (!matte || error) {
    return nil;
  }
  return [matte semanticSegmentationMatteByApplyingExifOrientation:orientation];
}

static CVPixelBufferRef AURAPCMatteBuffer(id matte) {
  if (![matte isKindOfClass:AVSemanticSegmentationMatte.class]) {
    return nil;
  }
  return ((AVSemanticSegmentationMatte *)matte).mattingImage;
}

// matte 알파 정규화 샘플 (single-component buffer). 호출 전 락 필요.
static double AURAPCSampleMatte(CVPixelBufferRef buffer, double nx, double ny) {
  if (!buffer) return 0.0;
  size_t width = CVPixelBufferGetWidth(buffer);
  size_t height = CVPixelBufferGetHeight(buffer);
  if (width == 0 || height == 0) return 0.0;
  int x = AURAPCClampInt((int)llround(AURAPCClamp01(nx) * ((double)width - 1.0)), 0, (int)width - 1);
  int y = AURAPCClampInt((int)llround(AURAPCClamp01(ny) * ((double)height - 1.0)), 0, (int)height - 1);
  uint8_t *baseAddress = CVPixelBufferGetBaseAddress(buffer);
  if (!baseAddress) return 0.0;
  size_t bytesPerRow = CVPixelBufferGetBytesPerRow(buffer);
  OSType pixelFormat = CVPixelBufferGetPixelFormatType(buffer);
  uint8_t *row = baseAddress + (size_t)y * bytesPerRow;
  if (pixelFormat == kCVPixelFormatType_OneComponent8) {
    return row[x] / 255.0;
  }
  if (pixelFormat == kCVPixelFormatType_OneComponent32Float) {
    float *floatRow = (float *)row;
    return AURAPCClamp01(floatRow[x]);
  }
  return 0.0;
}

// Locked CV matte → dependency-free pixel helper view. Unsupported formats
// deliberately become an unavailable matte rather than being misinterpreted.
static AURAFacePixelScalarBuffer AURAPCPixelScalarBuffer(
    CVPixelBufferRef buffer) {
  if (!buffer || !CVPixelBufferGetBaseAddress(buffer)) {
    return AURAFacePixelScalarBufferMake(
        NULL, 0, 0, 0, AURAFacePixelScalarFormatNone);
  }
  AURAFacePixelScalarFormat format = AURAFacePixelScalarFormatNone;
  OSType pixelFormat = CVPixelBufferGetPixelFormatType(buffer);
  if (pixelFormat == kCVPixelFormatType_OneComponent8) {
    format = AURAFacePixelScalarFormatUInt8;
  } else if (pixelFormat == kCVPixelFormatType_OneComponent32Float) {
    format = AURAFacePixelScalarFormatFloat32;
  }
  return AURAFacePixelScalarBufferMake(
      CVPixelBufferGetBaseAddress(buffer),
      CVPixelBufferGetWidth(buffer),
      CVPixelBufferGetHeight(buffer),
      CVPixelBufferGetBytesPerRow(buffer),
      format);
}

// 스틸을 명시적 sRGB RGBA8 비트맵으로 1회 rasterize (DeviceRGB 아님 — P3 오염 방지)
static BOOL AURAPCRasterize(UIImage *upright, AURAPCImageBuffer *out) {
  CGImageRef cg = upright.CGImage;
  if (!cg) return NO;
  size_t width = CGImageGetWidth(cg);
  size_t height = CGImageGetHeight(cg);
  if (width == 0 || height == 0) return NO;
  size_t bytesPerRow = width * 4;
  uint8_t *data = calloc(height * bytesPerRow, sizeof(uint8_t));
  if (!data) return NO;
  CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context = CGBitmapContextCreate(
      data, width, height, 8, bytesPerRow, colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  if (!context) {
    free(data);
    return NO;
  }
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), cg);
  CGContextRelease(context);
  out->data = data;
  out->width = width;
  out->height = height;
  out->bytesPerRow = bytesPerRow;
  return YES;
}

// 정규화 좌표 → 픽셀 RGB (byte order R,G,B,A)
static void AURAPCPixel(AURAPCImageBuffer buf, double nx, double ny,
                        uint8_t *r, uint8_t *g, uint8_t *b) {
  int x = AURAPCClampInt((int)llround(AURAPCClamp01(nx) * ((double)buf.width - 1.0)), 0, (int)buf.width - 1);
  int y = AURAPCClampInt((int)llround(AURAPCClamp01(ny) * ((double)buf.height - 1.0)), 0, (int)buf.height - 1);
  uint8_t *px = buf.data + (size_t)y * buf.bytesPerRow + (size_t)x * 4;
  *r = px[0];
  *g = px[1];
  *b = px[2];
}

#pragma mark - 랜드마크 좌표

typedef struct { double x; double y; BOOL valid; } AURAPCPoint;

// Unity homuler 가 넘겨준 정규화 랜드마크. 각 항목의 `i` 필드를 슬롯 번호로 삼아
// 인덱스 직접 접근이 가능한 C 배열로 채운다(전송 순서에 의존하지 않는다).
typedef struct {
  AURAPCPoint *points;
  int capacity;
} AURAPCLandmarkSet;

static AURAPCLandmarkSet AURAPCLandmarkSetFromJS(NSArray *jsPoints) {
  AURAPCLandmarkSet set = {NULL, 0};
  if (jsPoints.count == 0) return set;

  int maxIndex = -1;
  for (id entry in jsPoints) {
    if (![entry isKindOfClass:NSDictionary.class]) continue;
    int index = [entry[@"i"] intValue];
    if (index > maxIndex) maxIndex = index;
  }
  if (maxIndex < 0) return set;

  int capacity = maxIndex + 1;
  set.points = calloc((size_t)capacity, sizeof(AURAPCPoint));
  if (!set.points) return set;
  set.capacity = capacity;

  for (id entry in jsPoints) {
    if (![entry isKindOfClass:NSDictionary.class]) continue;
    int index = [entry[@"i"] intValue];
    if (index < 0 || index >= capacity) continue;
    NSNumber *xNum = entry[@"x"];
    NSNumber *yNum = entry[@"y"];
    if (![xNum isKindOfClass:NSNumber.class] || ![yNum isKindOfClass:NSNumber.class]) continue;
    set.points[index].x = AURAPCClamp01(xNum.doubleValue);
    set.points[index].y = AURAPCClamp01(yNum.doubleValue);
    set.points[index].valid = YES;
  }
  return set;
}

static void AURAPCLandmarkSetFree(AURAPCLandmarkSet *set) {
  if (set && set->points) {
    free(set->points);
    set->points = NULL;
    set->capacity = 0;
  }
}

static AURAPCPoint AURAPCLandmark(AURAPCLandmarkSet landmarks, int index) {
  AURAPCPoint p = {0, 0, NO};
  if (!landmarks.points || index < 0 || index >= landmarks.capacity) return p;
  return landmarks.points[index];
}

static AURAPCPoint AURAPCClusterCenter(AURAPCLandmarkSet landmarks,
                                       const int *indices, int count) {
  double sx = 0, sy = 0;
  int n = 0;
  for (int i = 0; i < count; i++) {
    AURAPCPoint p = AURAPCLandmark(landmarks, indices[i]);
    if (!p.valid) continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  AURAPCPoint c = {0, 0, NO};
  if (n == 0) return c;
  c.x = sx / n;
  c.y = sy / n;
  c.valid = YES;
  return c;
}

static BOOL AURAPCFillPoints(AURAPCLandmarkSet landmarks,
                             const int *indices,
                             int count,
                             AURAFacePixelPoint *output) {
  for (int index = 0; index < count; index++) {
    AURAPCPoint point = AURAPCLandmark(landmarks, indices[index]);
    if (!point.valid) return NO;
    output[index] = AURAFacePixelPointMake(point.x, point.y);
  }
  return YES;
}

// point-in-polygon (ray casting), 폴리곤은 정규화 좌표 배열
static BOOL AURAPCInsidePolygon(const double *px, const double *py, int count, double x, double y) {
  BOOL inside = NO;
  for (int i = 0, j = count - 1; i < count; j = i++) {
    BOOL intersect = ((py[i] > y) != (py[j] > y)) &&
                     (x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i]) + px[i]);
    if (intersect) inside = !inside;
  }
  return inside;
}

#pragma mark - ROI 누적

static NSDictionary *AURAPCRegionStatisticsDictionary(
    AURAFacePixelRegionStatistics statistics) {
  if (!statistics.valid) return nil;
  return @{
    @"rgbMean": @{
      @"r": @(statistics.rgbMean.red),
      @"g": @(statistics.rgbMean.green),
      @"b": @(statistics.rgbMean.blue),
    },
    @"rgbVariance": @{
      @"r": @(statistics.rgbVariance.red),
      @"g": @(statistics.rgbVariance.green),
      @"b": @(statistics.rgbVariance.blue),
    },
    @"dominant": @{
      @"r": @(statistics.dominant.red),
      @"g": @(statistics.dominant.green),
      @"b": @(statistics.dominant.blue),
    },
    @"sampleCount": @(statistics.sampleCount),
    @"overexposedRatio": @(statistics.overexposedRatio),
    @"underexposedRatio": @(statistics.underexposedRatio),
    @"specularRejectedRatio": @(statistics.specularRejectedRatio),
    @"confidence": @(statistics.confidence),
  };
}

static NSDictionary *AURAPCFinalizeRegion(
    const AURAFacePixelAccumulator *accumulator) {
  return AURAPCRegionStatisticsDictionary(
      AURAFacePixelAccumulatorFinalize(accumulator));
}

static void AURAPCStoreRegion(NSDictionary *stats,
                              NSString *key,
                              double roiCoverage,
                              double matteCoverage,
                              NSMutableDictionary *regions) {
  if (!stats) return;
  NSMutableDictionary *measurement = [stats mutableCopy];
  measurement[@"roiCoverage"] = @(AURAPCClamp01(roiCoverage));
  // v1 compatibility alias; remove after all consumers migrate to roiCoverage.
  measurement[@"areaRatio"] = measurement[@"roiCoverage"];
  measurement[@"matteCoverage"] = @(AURAPCClamp01(matteCoverage));
  regions[key] = measurement;
}

static void AURAPCAnalyzeEye(AURAPCLandmarkSet landmarks,
                             AURAPCImageBuffer colorBuffer,
                             CVPixelBufferRef skinBuffer,
                             const int *contourIndices,
                             int irisIndex,
                             NSString *regionKey,
                             NSString *warningPrefix,
                             NSMutableDictionary *regions,
                             NSMutableArray<NSString *> *warnings) {
  AURAFacePixelPoint contour[AURAPCEyeContourCount];
  if (!AURAPCFillPoints(
          landmarks, contourIndices, AURAPCEyeContourCount, contour)) {
    [warnings addObject:[warningPrefix stringByAppendingString:@"_landmarks_unavailable"]];
    return;
  }

  AURAPCPoint iris = AURAPCLandmark(landmarks, irisIndex);
  if (!iris.valid) {
    iris = AURAPCClusterCenter(
        landmarks, contourIndices, AURAPCEyeContourCount);
  }
  if (!iris.valid) return;

  double minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (int index = 0; index < AURAPCEyeContourCount; index++) {
    minX = fmin(minX, contour[index].x);
    maxX = fmax(maxX, contour[index].x);
    minY = fmin(minY, contour[index].y);
    maxY = fmax(maxY, contour[index].y);
  }
  double radiusX = fmax(0.004, (maxX - minX) * 0.34);
  double radiusY = fmax(0.003, (maxY - minY) * 0.48);
  AURAFacePixelRegionAnalysis analysis = AURAFacePixelAnalyzeEyeRegion(
      AURAFacePixelBufferMake(
          colorBuffer.data,
          colorBuffer.width,
          colorBuffer.height,
          colorBuffer.bytesPerRow),
      AURAPCPixelScalarBuffer(skinBuffer),
      contour,
      AURAPCEyeContourCount,
      AURAFacePixelPointMake(iris.x, iris.y),
      radiusX,
      radiusY,
      kEyeGridStepsX,
      kEyeGridStepsY,
      NO);
  NSDictionary *stats = AURAPCRegionStatisticsDictionary(analysis.statistics);
  if (!stats) {
    [warnings addObject:[warningPrefix stringByAppendingString:@"_roi_unavailable"]];
    return;
  }
  AURAPCStoreRegion(
      stats,
      regionKey,
      analysis.roiCoverage,
      analysis.matteCoverage,
      regions);
  double contamination = analysis.roiCandidateCount
      ? (double)(analysis.matteRejectedCount + analysis.scleraRejectedCount) /
          analysis.roiCandidateCount
      : 1.0;
  if (contamination > 0.35) {
    [warnings addObject:
        [warningPrefix stringByAppendingString:@"_skin_or_sclera_contamination"]];
  }
  if ([stats[@"specularRejectedRatio"] doubleValue] > 0.2) {
    [warnings addObject:
        [warningPrefix stringByAppendingString:@"_specular_contamination"]];
  }
}

static void AURAPCAnalyzeBrow(AURAPCLandmarkSet landmarks,
                              AURAPCImageBuffer colorBuffer,
                              CVPixelBufferRef skinBuffer,
                              const int *browIndices,
                              double faceWidth,
                              NSString *regionKey,
                              NSString *warningPrefix,
                              NSMutableDictionary *regions,
                              NSMutableArray<NSString *> *warnings) {
  AURAFacePixelPoint brow[AURAPCBrowPointCount];
  if (!AURAPCFillPoints(
          landmarks, browIndices, AURAPCBrowPointCount, brow)) {
    [warnings addObject:[warningPrefix stringByAppendingString:@"_landmarks_unavailable"]];
    return;
  }
  double radius = fmax(0.005, faceWidth * 0.022);
  AURAFacePixelRegionAnalysis analysis = AURAFacePixelAnalyzeBrowRegion(
      AURAFacePixelBufferMake(
          colorBuffer.data,
          colorBuffer.width,
          colorBuffer.height,
          colorBuffer.bytesPerRow),
      AURAPCPixelScalarBuffer(skinBuffer),
      brow,
      AURAPCBrowPointCount,
      radius,
      kBrowGridStepsX,
      kBrowGridStepsY,
      NO);
  NSDictionary *stats = AURAPCRegionStatisticsDictionary(analysis.statistics);
  if (!stats) {
    [warnings addObject:[warningPrefix stringByAppendingString:@"_roi_unavailable"]];
    return;
  }
  AURAPCStoreRegion(
      stats,
      regionKey,
      analysis.roiCoverage,
      analysis.matteCoverage,
      regions);
  if (analysis.roiCandidateCount &&
      (double)analysis.matteRejectedCount / analysis.roiCandidateCount > 0.65) {
    [warnings addObject:
        [warningPrefix stringByAppendingString:@"_skin_contamination"]];
  }
}

static AURAFacePixelLab AURAPCRegionLab(NSDictionary *region) {
  NSDictionary *rgb = region[@"rgbMean"];
  int red = AURAPCClampInt((int)llround([rgb[@"r"] doubleValue]), 0, 255);
  int green = AURAPCClampInt((int)llround([rgb[@"g"] doubleValue]), 0, 255);
  int blue = AURAPCClampInt((int)llround([rgb[@"b"] doubleValue]), 0, 255);
  return AURAFacePixelRGBToLab((uint8_t)red, (uint8_t)green, (uint8_t)blue);
}

static NSDictionary *AURAPCBuildPixelQuality(
    AURAPCLandmarkSet landmarks,
    AURAPCImageBuffer colorBuffer,
    NSDictionary *regions,
    NSDictionary *options,
    NSMutableArray<NSString *> *warnings) {
  AURAFacePixelPoint face[AURAPCFaceQualityPointCount];
  double variance = 0, blurScore = 0, blurConfidence = 0;
  AURAFacePixelLighting lighting = {0, 0, 0, 0, 0, 0};
  if (AURAPCFillPoints(
          landmarks,
          kFaceQualityIndices,
          AURAPCFaceQualityPointCount,
          face)) {
    AURAFacePixelBuffer buffer = AURAFacePixelBufferMake(
        colorBuffer.data,
        colorBuffer.width,
        colorBuffer.height,
        colorBuffer.bytesPerRow);
    variance = AURAFacePixelLaplacianVariance(
        buffer, face, AURAPCFaceQualityPointCount, NO);
    lighting = AURAFacePixelLightingForAnalyzerOptions(
        buffer, face, AURAPCFaceQualityPointCount, options);
    blurScore = AURAPCClamp01(log1p(variance) / log1p(12000.0));
    blurConfidence = AURAPCClamp01((double)lighting.sampleCount / 500.0);
  } else {
    [warnings addObject:@"face_quality_roi_unavailable"];
  }

  double cheekDelta = 0, foreheadDelta = 0, uniformityScore = 0;
  NSDictionary *leftCheek = regions[@"skinCheekLeft"];
  NSDictionary *rightCheek = regions[@"skinCheekRight"];
  NSDictionary *forehead = regions[@"skinForehead"];
  if (leftCheek && rightCheek && forehead) {
    AURAFacePixelLab left = AURAPCRegionLab(leftCheek);
    AURAFacePixelLab right = AURAPCRegionLab(rightCheek);
    AURAFacePixelLab upper = AURAPCRegionLab(forehead);
    cheekDelta = AURAFacePixelDeltaE76(left, right);
    foreheadDelta = 0.5 * (
        AURAFacePixelDeltaE76(upper, left) +
        AURAFacePixelDeltaE76(upper, right));
    uniformityScore = AURAPCClamp01(
        1.0 - (0.6 * cheekDelta + 0.4 * foreheadDelta) / 25.0);
  } else {
    [warnings addObject:@"skin_uniformity_roi_unavailable"];
  }

  return @{
    @"blur": @{
      @"laplacianVariance": @(variance),
      @"score": @(blurScore),
      @"confidence": @(blurConfidence),
    },
    @"lighting": @{
      @"globalLuminance": @(lighting.globalLuminance),
      @"leftLuminance": @(lighting.leftLuminance),
      @"rightLuminance": @(lighting.rightLuminance),
      @"uniformityScore": @(lighting.uniformityScore),
      @"score": @(lighting.score),
    },
    @"skinUniformity": @{
      @"cheekDelta": @(cheekDelta),
      @"foreheadDelta": @(foreheadDelta),
      @"score": @(uniformityScore),
    },
  };
}

#pragma mark - Module

@interface AURAPersonalColorAnalyzer : NSObject <RCTBridgeModule>
@end

@implementation AURAPersonalColorAnalyzer

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue {
  return dispatch_queue_create("com.aura.personal-color-analyzer", DISPATCH_QUEUE_SERIAL);
}

RCT_EXPORT_METHOD(analyze:(NSString *)imageUri
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  (void)reject;

  NSURL *url = [NSURL URLWithString:imageUri];
  NSString *path = url.isFileURL ? url.path : imageUri;
  NSURL *imageFileURL = url.isFileURL ? url : [NSURL fileURLWithPath:path];

  UIImage *image = [UIImage imageWithContentsOfFile:path];
  if (image == nil) {
    resolve(@{@"status": @"error", @"faceCount": @0, @"error": @"image_unavailable"});
    return;
  }
  UIImage *uprightImage = AURAPCUprightImage(image);

  double imgW = uprightImage.size.width;
  double imgH = uprightImage.size.height;

  // 랜드마크는 Unity homuler(IMAGE 모드)가 검출해 JS 를 통해 넘겨준다.
  // 없으면 얼굴 검출 자체가 불가하므로 unsupported 로 알린다(호출측이 격리).
  NSDictionary *landmarkInput =
      [options isKindOfClass:NSDictionary.class] ? options[@"landmarks"] : nil;
  if (![landmarkInput isKindOfClass:NSDictionary.class]) {
    resolve(@{@"status": @"unsupported", @"faceCount": @0,
              @"error": @"face landmarks were not provided (homuler landmark service unavailable)"});
    return;
  }

  NSArray *jsPoints = landmarkInput[@"points"];
  if (![jsPoints isKindOfClass:NSArray.class] || jsPoints.count == 0) {
    resolve(@{@"status": @"no_face", @"faceCount": @0,
              @"imageWidth": @(imgW), @"imageHeight": @(imgH), @"colorSpace": @"srgb"});
    return;
  }

  AURAPCLandmarkSet landmarks = AURAPCLandmarkSetFromJS(jsPoints);
  if (landmarks.capacity == 0) {
    AURAPCLandmarkSetFree(&landmarks);
    resolve(@{@"status": @"no_face", @"faceCount": @0,
              @"imageWidth": @(imgW), @"imageHeight": @(imgH), @"colorSpace": @"srgb"});
    return;
  }
  NSUInteger faceCount = 1;
  NSUInteger landmarkCount = jsPoints.count;

  // sRGB rasterize
  AURAPCImageBuffer colorBuf = {0};
  if (!AURAPCRasterize(uprightImage, &colorBuf)) {
    AURAPCLandmarkSetFree(&landmarks);
    resolve(@{@"status": @"error", @"faceCount": @(faceCount), @"error": @"rasterize_failed"});
    return;
  }

  // FaceProfile accepts only the in-memory token lease. Its sanitized JPEG is
  // intentionally free of auxiliary data, so falling back to file parsing
  // would be both ineffective and a privacy regression.
  BOOL readsFileAuxiliary =
      AURAPersonalColorReadsFileAuxiliaryDataForOptions(options);
  BOOL faceProfile = !readsFileAuxiliary;
  AURATransientMatteLease *matteLease = nil;
  AVSemanticSegmentationMatte *hairMatte = nil;
  AVSemanticSegmentationMatte *skinMatte = nil;
  if (faceProfile) {
    NSString *matteToken = [options[@"nativeMatteToken"]
        isKindOfClass:NSString.class]
        ? options[@"nativeMatteToken"]
        : nil;
    matteLease = [AURATransientMatteStore.sharedStore borrowToken:matteToken];
    hairMatte = [matteLease.hairMatte
        isKindOfClass:AVSemanticSegmentationMatte.class]
        ? matteLease.hairMatte
        : nil;
    skinMatte = [matteLease.skinMatte
        isKindOfClass:AVSemanticSegmentationMatte.class]
        ? matteLease.skinMatte
        : nil;
  } else if (readsFileAuxiliary) {
    CGImageSourceRef source =
        CGImageSourceCreateWithURL((__bridge CFURLRef)imageFileURL, NULL);
    CGImagePropertyOrientation orientation =
        source ? AURAPCExifOrientation(source) : kCGImagePropertyOrientationUp;
    hairMatte = source
        ? AURAPCCopyMatte(
            source,
            kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte,
            orientation)
        : nil;
    skinMatte = source
        ? AURAPCCopyMatte(
            source,
            kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte,
            orientation)
        : nil;
    if (source) CFRelease(source);
  }

  CVPixelBufferRef hairBuf = AURAPCMatteBuffer(hairMatte);
  CVPixelBufferRef skinBuf = AURAPCMatteBuffer(skinMatte);
  if (hairBuf) CVPixelBufferLockBaseAddress(hairBuf, kCVPixelBufferLock_ReadOnly);
  if (skinBuf) CVPixelBufferLockBaseAddress(skinBuf, kCVPixelBufferLock_ReadOnly);

  NSMutableArray<NSString *> *warnings = [NSMutableArray array];
  NSMutableDictionary *regions = [NSMutableDictionary dictionary];

  // 랜드마크 정규화 좌표는 EXIF 적용된 upright 프레임 기준이어야 한다(아래 샘플링이
  // uprightImage 를 쓰기 때문). Unity 가 다른 방향으로 디코드했다면 종횡비가 어긋나므로
  // 계측 가능한 경고로 남긴다 — 조용히 틀린 색을 뽑는 것보다 낫다.
  double jsW = [landmarkInput[@"imageWidth"] doubleValue];
  double jsH = [landmarkInput[@"imageHeight"] doubleValue];
  if (jsW > 0.0 && jsH > 0.0 && imgW > 0.0 && imgH > 0.0) {
    double jsAspect = jsW / jsH;
    double nativeAspect = imgW / imgH;
    if (fabs(jsAspect - nativeAspect) > 0.02 * nativeAspect) {
      [warnings addObject:@"landmark_frame_mismatch"];
    }
  }

  double faceWidth = 0.0;
  AURAPCPoint left = AURAPCLandmark(landmarks, 234);
  AURAPCPoint right = AURAPCLandmark(landmarks, 454);
  if (left.valid && right.valid) faceWidth = fabs(right.x - left.x);
  if (faceWidth < 1e-4) faceWidth = 0.3;

  // ---- Skin 3패치 (landmark 배치 + skin-matte 게이트) ----
  NSDictionary *skinClusters = @{
    @"skinCheekLeft": [NSValue valueWithPointer:kLeftCheekIndices],
    @"skinCheekRight": [NSValue valueWithPointer:kRightCheekIndices],
    @"skinForehead": [NSValue valueWithPointer:kForeheadIndices],
  };
  NSDictionary *skinCounts = @{
    @"skinCheekLeft": @(6),
    @"skinCheekRight": @(6),
    @"skinForehead": @(5),
  };
  for (NSString *key in skinClusters) {
    const int *indices = (const int *)[skinClusters[key] pointerValue];
    int count = [skinCounts[key] intValue];
    AURAPCPoint center = AURAPCClusterCenter(landmarks, indices, count);
    if (!center.valid) continue;

    AURAFacePixelAccumulator acc;
    AURAFacePixelAccumulatorInit(&acc);
    double radius = faceWidth * kSkinPatchRadiusFraction;
    long gridSampled = 0;
    long gridGated = 0;
    for (int gy = 0; gy < kSkinPatchGridSteps; gy++) {
      for (int gx = 0; gx < kSkinPatchGridSteps; gx++) {
        double fx = ((double)gx / (kSkinPatchGridSteps - 1)) * 2.0 - 1.0;
        double fy = ((double)gy / (kSkinPatchGridSteps - 1)) * 2.0 - 1.0;
        if (fx * fx + fy * fy > 1.0) continue; // 원반
        gridSampled += 1;
        double nx = center.x + fx * radius;
        double ny = center.y + fy * radius;
        double alpha = skinBuf ? AURAPCSampleMatte(skinBuf, nx, ny) : 1.0;
        if (skinBuf && alpha < kSkinAlphaGate) continue;
        gridGated += 1;
        uint8_t r, g, b;
        AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
        AURAFacePixelAccumulatorAdd(
            &acc, r, g, b, skinBuf ? alpha : 1.0);
      }
    }
    NSDictionary *stats = AURAPCFinalizeRegion(&acc);
    if (stats) {
      double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
      AURAPCStoreRegion(stats, key, coverage, coverage, regions);
    }
  }

  // ---- Hair (matte 주도) ----
  if (hairBuf) {
    AURAPCPoint foreheadTop = AURAPCLandmark(landmarks, 10);
    if (foreheadTop.valid && left.valid && right.valid) {
      double cx = (left.x + right.x) / 2.0;
      double x0 = cx - 0.5 * faceWidth;
      double x1 = cx + 0.5 * faceWidth;
      double y0 = foreheadTop.y - 0.5 * faceWidth;
      double y1 = foreheadTop.y - 0.05 * faceWidth;
      AURAFacePixelAccumulator acc;
      AURAFacePixelAccumulatorInit(&acc);
      long gridSampled = 0, gridGated = 0;
      for (int gy = 0; gy < kHairGridStepsY; gy++) {
        for (int gx = 0; gx < kHairGridStepsX; gx++) {
          double nx = x0 + (x1 - x0) * ((double)gx + 0.5) / kHairGridStepsX;
          double ny = y0 + (y1 - y0) * ((double)gy + 0.5) / kHairGridStepsY;
          if (ny < 0.0 || ny > 1.0) continue;
          gridSampled += 1;
          double alpha = AURAPCSampleMatte(hairBuf, nx, ny);
          if (alpha < kHairAlphaGate) continue;
          gridGated += 1;
          uint8_t r, g, b;
          AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
          AURAFacePixelAccumulatorAdd(&acc, r, g, b, alpha);
        }
      }
      NSDictionary *stats = AURAPCFinalizeRegion(&acc);
      if (stats) {
        double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
        AURAPCStoreRegion(stats, @"hair", coverage, coverage, regions);
      }
    }
  } else {
    [warnings addObject:@"hair_matte_unavailable"];
  }

  // ---- Lip (landmark 폴리곤; 입술 matte 없음) ----
  {
    double outerX[kOuterLipCount], outerY[kOuterLipCount];
    double innerX[kInnerLipCount], innerY[kInnerLipCount];
    BOOL lipValid = YES;
    double minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
    for (int i = 0; i < kOuterLipCount; i++) {
      AURAPCPoint p = AURAPCLandmark(landmarks, kOuterLipIndices[i]);
      if (!p.valid) { lipValid = NO; break; }
      outerX[i] = p.x; outerY[i] = p.y;
      minX = fmin(minX, p.x); maxX = fmax(maxX, p.x);
      minY = fmin(minY, p.y); maxY = fmax(maxY, p.y);
    }
    for (int i = 0; i < kInnerLipCount && lipValid; i++) {
      AURAPCPoint p = AURAPCLandmark(landmarks, kInnerLipIndices[i]);
      if (!p.valid) { lipValid = NO; break; }
      innerX[i] = p.x; innerY[i] = p.y;
    }
    if (lipValid && maxX > minX && maxY > minY) {
      AURAFacePixelAccumulator acc;
      AURAFacePixelAccumulatorInit(&acc);
      long gridSampled = 0, gridGated = 0;
      for (int gy = 0; gy < kLipGridStepsY; gy++) {
        for (int gx = 0; gx < kLipGridStepsX; gx++) {
          double nx = minX + (maxX - minX) * ((double)gx + 0.5) / kLipGridStepsX;
          double ny = minY + (maxY - minY) * ((double)gy + 0.5) / kLipGridStepsY;
          gridSampled += 1;
          if (!AURAPCInsidePolygon(outerX, outerY, kOuterLipCount, nx, ny)) continue;
          if (AURAPCInsidePolygon(innerX, innerY, kInnerLipCount, nx, ny)) continue; // 치아/입안 제외
          gridGated += 1;
          uint8_t r, g, b;
          AURAPCPixel(colorBuf, nx, ny, &r, &g, &b);
          AURAFacePixelAccumulatorAdd(&acc, r, g, b, 1.0);
        }
      }
      NSDictionary *stats = AURAPCFinalizeRegion(&acc);
      if (stats) {
        double coverage = gridSampled > 0 ? (double)gridGated / (double)gridSampled : 0.0;
        AURAPCStoreRegion(stats, @"lip", coverage, 1.0, regions);
      }
    } else {
      [warnings addObject:@"lip_landmarks_unavailable"];
    }
  }

  AURAPCAnalyzeEye(
      landmarks, colorBuf, skinBuf,
      AURAFacePixelEyeContourLandmarkIndices(YES, NULL),
      AURAFacePixelIrisLandmarkIndex(YES),
      @"eyeLeft", @"eye_left", regions, warnings);
  AURAPCAnalyzeEye(
      landmarks, colorBuf, skinBuf,
      AURAFacePixelEyeContourLandmarkIndices(NO, NULL),
      AURAFacePixelIrisLandmarkIndex(NO),
      @"eyeRight", @"eye_right", regions, warnings);
  AURAPCAnalyzeBrow(
      landmarks, colorBuf, skinBuf,
      AURAFacePixelBrowLandmarkIndices(YES, NULL), faceWidth,
      @"browLeft", @"brow_left", regions, warnings);
  AURAPCAnalyzeBrow(
      landmarks, colorBuf, skinBuf,
      AURAFacePixelBrowLandmarkIndices(NO, NULL), faceWidth,
      @"browRight", @"brow_right", regions, warnings);
  NSDictionary *pixelQuality = AURAPCBuildPixelQuality(
      landmarks, colorBuf, regions, options, warnings);

  if (hairBuf) CVPixelBufferUnlockBaseAddress(hairBuf, kCVPixelBufferLock_ReadOnly);
  if (skinBuf) CVPixelBufferUnlockBaseAddress(skinBuf, kCVPixelBufferLock_ReadOnly);
  free(colorBuf.data);
  AURAPCLandmarkSetFree(&landmarks);

  NSDictionary *payload = @{
    @"status": @"ok",
    @"faceCount": @(faceCount),
    @"landmarkCount": @(landmarkCount),
    @"imageWidth": @(imgW),
    @"imageHeight": @(imgH),
    @"colorSpace": @"srgb",
    @"matte": @{
      @"skinAvailable": @(skinBuf != NULL),
      @"hairAvailable": @(hairBuf != NULL),
      @"matteWidth": @(skinBuf ? (double)CVPixelBufferGetWidth(skinBuf) : 0.0),
      @"matteHeight": @(skinBuf ? (double)CVPixelBufferGetHeight(skinBuf) : 0.0),
    },
    @"regions": regions,
    @"quality": pixelQuality,
    @"warnings": warnings,
  };

  NSLog(@"[aura:personal-color] native analyze status=ok faces=%lu regions=%lu hairMatte=%d skinMatte=%d",
        (unsigned long)faceCount, (unsigned long)regions.count, hairBuf != NULL, skinBuf != NULL);

  resolve(payload);
}

@end
