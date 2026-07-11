#import <XCTest/XCTest.h>

// Production header: this target must fail to compile until the helper exists.
#import "AURAFacePixelMath.h"

@interface AURAFacePixelMathTests : XCTestCase
@end

@implementation AURAFacePixelMathTests

- (void)testMediaPipeRegionMappingsUseAnatomicalLeftAndRight {
  NSUInteger eyeCount = 0;
  const int *leftEye =
      AURAFacePixelEyeContourLandmarkIndices(YES, &eyeCount);
  const int *rightEye =
      AURAFacePixelEyeContourLandmarkIndices(NO, NULL);
  const int *leftBrow =
      AURAFacePixelBrowLandmarkIndices(YES, NULL);
  const int *rightBrow =
      AURAFacePixelBrowLandmarkIndices(NO, NULL);

  XCTAssertEqual(eyeCount, 6u);
  XCTAssertEqual(leftEye[0], 362);
  XCTAssertEqual(leftEye[3], 263);
  XCTAssertEqual(AURAFacePixelIrisLandmarkIndex(YES), 473);
  XCTAssertEqual(rightEye[0], 33);
  XCTAssertEqual(rightEye[3], 133);
  XCTAssertEqual(AURAFacePixelIrisLandmarkIndex(NO), 468);
  XCTAssertEqual(leftBrow[0], 336);
  XCTAssertEqual(rightBrow[0], 70);
}

- (void)testEyeAndBrowCoverageIsStableForMirroredRGBA {
  const size_t width = 12;
  const size_t height = 8;
  uint8_t pixels[width * height * 4];
  for (size_t y = 0; y < height; y++) {
    for (size_t x = 0; x < width; x++) {
      size_t offset = (y * width + x) * 4;
      pixels[offset] = (uint8_t)(20 + x * 12);
      pixels[offset + 1] = (uint8_t)(30 + y * 10);
      pixels[offset + 2] = 60;
      pixels[offset + 3] = 255;
    }
  }
  AURAFacePixelBuffer buffer = AURAFacePixelBufferMake(pixels, width, height, width * 4);
  AURAFacePixelPoint eye[] = {
    AURAFacePixelPointMake(0.16, 0.38),
    AURAFacePixelPointMake(0.24, 0.30),
    AURAFacePixelPointMake(0.36, 0.31),
    AURAFacePixelPointMake(0.43, 0.39),
    AURAFacePixelPointMake(0.34, 0.47),
    AURAFacePixelPointMake(0.23, 0.46),
  };
  AURAFacePixelPoint brow[] = {
    AURAFacePixelPointMake(0.15, 0.24),
    AURAFacePixelPointMake(0.27, 0.18),
    AURAFacePixelPointMake(0.43, 0.23),
  };

  AURAFacePixelCoverage eyeUpright =
      AURAFacePixelPolygonCoverage(buffer, eye, 6, 20, 14, NO);
  AURAFacePixelCoverage eyeMirrored =
      AURAFacePixelPolygonCoverage(buffer, eye, 6, 20, 14, YES);
  AURAFacePixelCoverage browUpright =
      AURAFacePixelPolylineBandCoverage(buffer, brow, 3, 0.035, 24, 12, NO);
  AURAFacePixelCoverage browMirrored =
      AURAFacePixelPolylineBandCoverage(buffer, brow, 3, 0.035, 24, 12, YES);

  XCTAssertGreaterThan(eyeUpright.roiCoverage, 0.25);
  XCTAssertLessThan(eyeUpright.roiCoverage, 0.9);
  XCTAssertEqualWithAccuracy(eyeUpright.roiCoverage, eyeMirrored.roiCoverage, 1e-12);
  XCTAssertGreaterThan(browUpright.roiCoverage, 0.05);
  XCTAssertLessThan(browUpright.roiCoverage, 0.8);
  XCTAssertEqualWithAccuracy(browUpright.roiCoverage, browMirrored.roiCoverage, 1e-12);
}

- (void)testProductionEyeAndBrowSamplingConsumesRGBAAndMatteAfterMirror {
  const size_t width = 24;
  const size_t height = 16;
  uint8_t upright[width * height * 4];
  uint8_t mirrored[width * height * 4];
  uint8_t matte[width * height];
  uint8_t mirroredMatte[width * height];

  for (size_t y = 0; y < height; y++) {
    for (size_t x = 0; x < width; x++) {
      double nx = ((double)x + 0.5) / width;
      double ny = ((double)y + 0.5) / height;
      uint8_t red = 120, green = 100, blue = 80, alpha = 0;

      if (nx >= 0.10 && nx <= 0.46 && ny >= 0.30 && ny <= 0.66) {
        red = 36; green = 54; blue = 78;
        if (nx >= 0.18 && nx < 0.23) alpha = 255;
        if (nx >= 0.25 && nx < 0.30) red = green = blue = 190;
        if (nx >= 0.32 && nx < 0.37) red = green = blue = 250;
      }
      if (nx >= 0.55 && nx <= 0.91 && ny >= 0.12 && ny <= 0.34) {
        red = 48; green = 32; blue = 24;
        if (nx >= 0.62 && nx < 0.67) alpha = 255;
        if (nx >= 0.74 && nx < 0.79) red = green = blue = 250;
      }

      size_t offset = (y * width + x) * 4;
      upright[offset] = red;
      upright[offset + 1] = green;
      upright[offset + 2] = blue;
      upright[offset + 3] = 255;
      matte[y * width + x] = alpha;

      size_t mirroredX = width - 1 - x;
      size_t mirroredOffset = (y * width + mirroredX) * 4;
      mirrored[mirroredOffset] = red;
      mirrored[mirroredOffset + 1] = green;
      mirrored[mirroredOffset + 2] = blue;
      mirrored[mirroredOffset + 3] = 255;
      mirroredMatte[y * width + mirroredX] = alpha;
    }
  }

  AURAFacePixelPoint eye[] = {
    AURAFacePixelPointMake(0.10, 0.48),
    AURAFacePixelPointMake(0.18, 0.31),
    AURAFacePixelPointMake(0.38, 0.31),
    AURAFacePixelPointMake(0.46, 0.48),
    AURAFacePixelPointMake(0.38, 0.65),
    AURAFacePixelPointMake(0.18, 0.65),
  };
  AURAFacePixelPoint iris = AURAFacePixelPointMake(0.28, 0.48);
  AURAFacePixelPoint brow[] = {
    AURAFacePixelPointMake(0.56, 0.27),
    AURAFacePixelPointMake(0.68, 0.17),
    AURAFacePixelPointMake(0.80, 0.16),
    AURAFacePixelPointMake(0.90, 0.25),
  };

  AURAFacePixelRegionAnalysis eyeUpright = AURAFacePixelAnalyzeEyeRegion(
      AURAFacePixelBufferMake(upright, width, height, width * 4),
      AURAFacePixelScalarBufferMake(
          matte, width, height, width, AURAFacePixelScalarFormatUInt8),
      eye, 6, iris, 0.17, 0.17, 32, 24, NO);
  AURAFacePixelRegionAnalysis eyeMirrored = AURAFacePixelAnalyzeEyeRegion(
      AURAFacePixelBufferMake(mirrored, width, height, width * 4),
      AURAFacePixelScalarBufferMake(
          mirroredMatte, width, height, width, AURAFacePixelScalarFormatUInt8),
      eye, 6, iris, 0.17, 0.17, 32, 24, YES);
  AURAFacePixelRegionAnalysis browUpright = AURAFacePixelAnalyzeBrowRegion(
      AURAFacePixelBufferMake(upright, width, height, width * 4),
      AURAFacePixelScalarBufferMake(
          matte, width, height, width, AURAFacePixelScalarFormatUInt8),
      brow, 4, 0.07, 36, 16, NO);
  AURAFacePixelRegionAnalysis browMirrored = AURAFacePixelAnalyzeBrowRegion(
      AURAFacePixelBufferMake(mirrored, width, height, width * 4),
      AURAFacePixelScalarBufferMake(
          mirroredMatte, width, height, width, AURAFacePixelScalarFormatUInt8),
      brow, 4, 0.07, 36, 16, YES);

  XCTAssertTrue(eyeUpright.statistics.valid);
  XCTAssertGreaterThan(eyeUpright.roiCoverage, 0.15);
  XCTAssertGreaterThan(eyeUpright.matteRejectedCount, 0u);
  XCTAssertGreaterThan(eyeUpright.scleraRejectedCount, 0u);
  XCTAssertGreaterThan(eyeUpright.statistics.specularRejectedRatio, 0.0);
  XCTAssertLessThan(eyeUpright.statistics.rgbMean.red, 80.0);
  XCTAssertEqualWithAccuracy(
      eyeUpright.roiCoverage, eyeMirrored.roiCoverage, 1e-12);
  XCTAssertEqualWithAccuracy(
      eyeUpright.statistics.rgbMean.red,
      eyeMirrored.statistics.rgbMean.red,
      1e-12);

  XCTAssertTrue(browUpright.statistics.valid);
  XCTAssertGreaterThan(browUpright.roiCoverage, 0.10);
  XCTAssertGreaterThan(browUpright.matteRejectedCount, 0u);
  XCTAssertGreaterThan(browUpright.statistics.specularRejectedRatio, 0.0);
  XCTAssertLessThan(browUpright.statistics.rgbMean.red, 80.0);
  XCTAssertEqualWithAccuracy(
      browUpright.roiCoverage, browMirrored.roiCoverage, 1e-12);
  XCTAssertEqualWithAccuracy(
      browUpright.statistics.rgbMean.red,
      browMirrored.statistics.rgbMean.red,
      1e-12);
}

- (void)testFaceLaplacianIgnoresFlatBackground {
  const size_t width = 10;
  const size_t height = 10;
  uint8_t detailed[width * height * 4];
  uint8_t flat[width * height * 4];
  for (size_t y = 0; y < height; y++) {
    for (size_t x = 0; x < width; x++) {
      size_t offset = (y * width + x) * 4;
      BOOL inFacePatch = x >= 2 && x <= 7 && y >= 2 && y <= 7;
      uint8_t value = inFacePatch ? (((x + y) % 2 == 0) ? 35 : 220) : 127;
      detailed[offset] = detailed[offset + 1] = detailed[offset + 2] = value;
      detailed[offset + 3] = 255;
      flat[offset] = flat[offset + 1] = flat[offset + 2] = 127;
      flat[offset + 3] = 255;
    }
  }
  AURAFacePixelPoint face[] = {
    AURAFacePixelPointMake(0.18, 0.18),
    AURAFacePixelPointMake(0.82, 0.18),
    AURAFacePixelPointMake(0.82, 0.82),
    AURAFacePixelPointMake(0.18, 0.82),
  };
  double detailedVariance = AURAFacePixelLaplacianVariance(
      AURAFacePixelBufferMake(detailed, width, height, width * 4), face, 4, NO);
  double flatVariance = AURAFacePixelLaplacianVariance(
      AURAFacePixelBufferMake(flat, width, height, width * 4), face, 4, NO);

  XCTAssertGreaterThan(detailedVariance, 1000.0);
  XCTAssertEqualWithAccuracy(flatVariance, 0.0, 1e-12);
}

- (void)testLightingKeepsAnatomicalSidesAfterMirrorNormalization {
  const size_t width = 12;
  const size_t height = 6;
  uint8_t upright[width * height * 4];
  uint8_t mirrored[width * height * 4];
  for (size_t y = 0; y < height; y++) {
    for (size_t x = 0; x < width; x++) {
      uint8_t value = x < width / 2 ? 60 : 190;
      size_t offset = (y * width + x) * 4;
      upright[offset] = upright[offset + 1] = upright[offset + 2] = value;
      upright[offset + 3] = 255;

      size_t mirroredOffset = (y * width + (width - 1 - x)) * 4;
      mirrored[mirroredOffset] = mirrored[mirroredOffset + 1] =
          mirrored[mirroredOffset + 2] = value;
      mirrored[mirroredOffset + 3] = 255;
    }
  }
  AURAFacePixelPoint face[] = {
    AURAFacePixelPointMake(0.08, 0.08),
    AURAFacePixelPointMake(0.92, 0.08),
    AURAFacePixelPointMake(0.92, 0.92),
    AURAFacePixelPointMake(0.08, 0.92),
  };
  AURAFacePixelLighting uprightLighting = AURAFacePixelLightingInPolygon(
      AURAFacePixelBufferMake(upright, width, height, width * 4), face, 4, NO);
  AURAFacePixelLighting mirroredLighting = AURAFacePixelLightingInPolygon(
      AURAFacePixelBufferMake(mirrored, width, height, width * 4), face, 4, YES);

  XCTAssertGreaterThan(uprightLighting.leftLuminance, uprightLighting.globalLuminance);
  XCTAssertLessThan(uprightLighting.rightLuminance, uprightLighting.globalLuminance);
  XCTAssertEqualWithAccuracy(uprightLighting.leftLuminance,
                             mirroredLighting.leftLuminance, 1e-12);
  XCTAssertEqualWithAccuracy(uprightLighting.rightLuminance,
                             mirroredLighting.rightLuminance, 1e-12);
  XCTAssertLessThan(uprightLighting.uniformityScore, 0.7);
}

- (void)testExifOneThreeSixEightCoordinateTransforms {
  AURAFacePixelPoint point = AURAFacePixelPointMake(0.2, 0.3);
  AURAFacePixelPoint one = AURAFacePixelPointToUpright(point, 1, NO);
  AURAFacePixelPoint three = AURAFacePixelPointToUpright(point, 3, NO);
  AURAFacePixelPoint six = AURAFacePixelPointToUpright(point, 6, NO);
  AURAFacePixelPoint eight = AURAFacePixelPointToUpright(point, 8, NO);
  AURAFacePixelPoint sixMirrored = AURAFacePixelPointToUpright(point, 6, YES);

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

- (void)testSkinPatchDeltaUsesColorSpaceDistance {
  AURAFacePixelLab warm = AURAFacePixelRGBToLab(210, 170, 145);
  AURAFacePixelLab same = AURAFacePixelRGBToLab(210, 170, 145);
  AURAFacePixelLab shifted = AURAFacePixelRGBToLab(170, 125, 105);

  XCTAssertEqualWithAccuracy(AURAFacePixelDeltaE76(warm, same), 0.0, 1e-12);
  XCTAssertGreaterThan(AURAFacePixelDeltaE76(warm, shifted), 10.0);
}

@end
