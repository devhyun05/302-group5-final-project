#import <AVFoundation/AVFoundation.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <XCTest/XCTest.h>

#import "AURAFaceAnalysisMediaSanitizer.h"

@interface AURAFaceAnalysisMediaSanitizerTests : XCTestCase
@end

@implementation AURAFaceAnalysisMediaSanitizerTests

- (CGImageRef)newFixtureImage CF_RETURNS_RETAINED
{
  const size_t width = 3;
  const size_t height = 2;
  uint8_t pixels[] = {
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    255, 255, 0, 255, 255, 0, 255, 255, 0, 255, 255, 255,
  };
  CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context = CGBitmapContextCreate(
      pixels,
      width,
      height,
      8,
      width * 4,
      colorSpace,
      (uint32_t)kCGImageAlphaPremultipliedLast |
          (uint32_t)kCGBitmapByteOrder32Big);
  CGImageRef image = CGBitmapContextCreateImage(context);
  CGContextRelease(context);
  CGColorSpaceRelease(colorSpace);
  return image;
}

- (NSURL *)writeSourceFixtureWithDepthAndMetadata
{
  NSURL *url = [NSURL fileURLWithPath:[NSTemporaryDirectory()
      stringByAppendingPathComponent:[NSString stringWithFormat:@"aura-sanitizer-source-%@.jpg",
                                                               NSUUID.UUID.UUIDString]]];
  CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
      (__bridge CFURLRef)url,
      (__bridge CFStringRef)UTTypeJPEG.identifier,
      1,
      NULL);
  XCTAssertNotEqual(destination, NULL);
  CGImageRef image = [self newFixtureImage];
  NSDictionary *properties = @{
    (__bridge NSString *)kCGImagePropertyOrientation: @6,
    (__bridge NSString *)kCGImagePropertyGPSDictionary: @{
      (__bridge NSString *)kCGImagePropertyGPSLatitude: @37.5,
      (__bridge NSString *)kCGImagePropertyGPSLatitudeRef: @"N",
      (__bridge NSString *)kCGImagePropertyGPSLongitude: @127.0,
      (__bridge NSString *)kCGImagePropertyGPSLongitudeRef: @"E",
    },
    (__bridge NSString *)kCGImagePropertyExifDictionary: @{
      (__bridge NSString *)kCGImagePropertyExifUserComment: @"sensitive-fixture",
    },
  };
  CGMutableImageMetadataRef metadata = CGImageMetadataCreateMutable();
  CGImageMetadataTagRef xmpTag = CGImageMetadataTagCreate(
      kCGImageMetadataNamespaceXMPBasic,
      kCGImageMetadataPrefixXMPBasic,
      CFSTR("Label"),
      kCGImageMetadataTypeString,
      CFSTR("private-xmp-fixture"));
  XCTAssertNotEqual(xmpTag, NULL);
  XCTAssertTrue(CGImageMetadataSetTagWithPath(
      metadata, NULL, CFSTR("xmp:Label"), xmpTag));
  CGImageDestinationAddImageAndMetadata(
      destination, image, metadata, (__bridge CFDictionaryRef)properties);

  float depthValues[] = {0.4f, 0.5f, 0.6f, 0.7f};
  NSData *depthData = [NSData dataWithBytes:depthValues length:sizeof(depthValues)];
  NSDictionary *description = @{
    (__bridge NSString *)kCGImagePropertyWidth: @2,
    (__bridge NSString *)kCGImagePropertyHeight: @2,
    (__bridge NSString *)kCGImagePropertyBytesPerRow: @(2 * sizeof(float)),
    (__bridge NSString *)kCGImagePropertyPixelFormat:
        @(kCVPixelFormatType_DepthFloat32),
  };
  NSDictionary *auxiliary = @{
    (__bridge NSString *)kCGImageAuxiliaryDataInfoData: depthData,
    (__bridge NSString *)kCGImageAuxiliaryDataInfoDataDescription: description,
  };
  CGImageDestinationAddAuxiliaryDataInfo(
      destination,
      kCGImageAuxiliaryDataTypeDepth,
      (__bridge CFDictionaryRef)auxiliary);
  BOOL finalized = CGImageDestinationFinalize(destination);
  CFRelease(xmpTag);
  CFRelease(metadata);
  CGImageRelease(image);
  CFRelease(destination);
  XCTAssertTrue(finalized);
  return url;
}

- (NSURL *)writeIPTCSourceFixture
{
  NSURL *url = [NSURL fileURLWithPath:[NSTemporaryDirectory()
      stringByAppendingPathComponent:[NSString stringWithFormat:@"aura-iptc-source-%@.jpg",
                                                               NSUUID.UUID.UUIDString]]];
  CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
      (__bridge CFURLRef)url,
      (__bridge CFStringRef)UTTypeJPEG.identifier,
      1,
      NULL);
  XCTAssertNotEqual(destination, NULL);
  CGImageRef image = [self newFixtureImage];
  CGImageDestinationAddImage(destination, image, NULL);
  BOOL finalized = CGImageDestinationFinalize(destination);
  CGImageRelease(image);
  CFRelease(destination);
  XCTAssertTrue(finalized);

  NSData *jpegData = [NSData dataWithContentsOfURL:url];
  XCTAssertGreaterThanOrEqual(jpegData.length, 2u);
  const uint8_t *jpegBytes = jpegData.bytes;
  XCTAssertEqual(jpegBytes[0], 0xFF);
  XCTAssertEqual(jpegBytes[1], 0xD8);

  static const uint8_t recordVersion[] = {
    0x1C, 0x02, 0x00, 0x00, 0x02, 0x00, 0x02,
  };
  NSData *caption = [@"private-iptc-fixture"
      dataUsingEncoding:NSASCIIStringEncoding];
  XCTAssertLessThanOrEqual(caption.length, UINT16_MAX);
  uint8_t captionHeader[] = {
    0x1C,
    0x02,
    0x78,
    (uint8_t)(caption.length >> 8),
    (uint8_t)(caption.length & 0xFF),
  };
  NSMutableData *iptcData = [NSMutableData data];
  [iptcData appendBytes:recordVersion length:sizeof(recordVersion)];
  [iptcData appendBytes:captionHeader length:sizeof(captionHeader)];
  [iptcData appendData:caption];

  NSMutableData *app13Payload = [NSMutableData data];
  static const uint8_t photoshopHeader[] = "Photoshop 3.0";
  static const uint8_t resourceSignature[] = {'8', 'B', 'I', 'M'};
  static const uint8_t resourceIdentifier[] = {0x04, 0x04};
  static const uint8_t emptyPascalName[] = {0x00, 0x00};
  [app13Payload appendBytes:photoshopHeader length:sizeof(photoshopHeader)];
  [app13Payload appendBytes:resourceSignature length:sizeof(resourceSignature)];
  [app13Payload appendBytes:resourceIdentifier length:sizeof(resourceIdentifier)];
  [app13Payload appendBytes:emptyPascalName length:sizeof(emptyPascalName)];
  uint32_t resourceLength = (uint32_t)iptcData.length;
  uint8_t resourceLengthBytes[] = {
    (uint8_t)(resourceLength >> 24),
    (uint8_t)(resourceLength >> 16),
    (uint8_t)(resourceLength >> 8),
    (uint8_t)resourceLength,
  };
  [app13Payload appendBytes:resourceLengthBytes
                     length:sizeof(resourceLengthBytes)];
  [app13Payload appendData:iptcData];
  if ((iptcData.length & 1u) != 0) {
    uint8_t padding = 0;
    [app13Payload appendBytes:&padding length:1];
  }

  NSUInteger jpegSegmentLength = app13Payload.length + 2;
  XCTAssertLessThanOrEqual(jpegSegmentLength, UINT16_MAX);
  uint8_t app13Header[] = {
    0xFF,
    0xED,
    (uint8_t)(jpegSegmentLength >> 8),
    (uint8_t)(jpegSegmentLength & 0xFF),
  };
  NSMutableData *fixture = [NSMutableData dataWithCapacity:
      jpegData.length + sizeof(app13Header) + app13Payload.length];
  [fixture appendBytes:jpegBytes length:2];
  [fixture appendBytes:app13Header length:sizeof(app13Header)];
  [fixture appendData:app13Payload];
  [fixture appendBytes:jpegBytes + 2 length:jpegData.length - 2];
  XCTAssertTrue([fixture writeToURL:url atomically:YES]);
  return url;
}

- (NSArray<id> *)auxiliaryTypes
{
  return @[
    (__bridge id)kCGImageAuxiliaryDataTypeDepth,
    (__bridge id)kCGImageAuxiliaryDataTypeDisparity,
    (__bridge id)kCGImageAuxiliaryDataTypePortraitEffectsMatte,
    (__bridge id)kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte,
    (__bridge id)kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte,
    (__bridge id)kCGImageAuxiliaryDataTypeSemanticSegmentationTeethMatte,
    (__bridge id)kCGImageAuxiliaryDataTypeSemanticSegmentationGlassesMatte,
    (__bridge id)kCGImageAuxiliaryDataTypeSemanticSegmentationSkyMatte,
  ];
}

- (void)testSanitizerCreatesUprightSRGBJPEGWithoutAuxiliaryOrSensitiveMetadata
{
  NSURL *sourceURL = [self writeSourceFixtureWithDepthAndMetadata];
  NSURL *iptcSourceURL = [self writeIPTCSourceFixture];
  NSData *sourceBytesBefore = [NSData dataWithContentsOfURL:sourceURL];
  CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)sourceURL, NULL);
  XCTAssertNotEqual(source, NULL);
  NSDictionary *sourceProperties = CFBridgingRelease(
      CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  NSDictionary *sourceDepth = CFBridgingRelease(
      CGImageSourceCopyAuxiliaryDataInfoAtIndex(
          source, 0, kCGImageAuxiliaryDataTypeDepth));
  XCTAssertNotNil(sourceDepth);
  XCTAssertNotNil(sourceProperties[(__bridge NSString *)kCGImagePropertyGPSDictionary]);
  XCTAssertNotNil(sourceProperties[(__bridge NSString *)kCGImagePropertyExifDictionary]);
  CGImageMetadataRef sourceMetadata = CGImageSourceCopyMetadataAtIndex(source, 0, NULL);
  CFStringRef sourceXMP = sourceMetadata
      ? CGImageMetadataCopyStringValueWithPath(sourceMetadata, NULL, CFSTR("xmp:Label"))
      : NULL;
  XCTAssertEqualObjects((__bridge NSString *)sourceXMP, @"private-xmp-fixture");
  if (sourceXMP) CFRelease(sourceXMP);
  if (sourceMetadata) CFRelease(sourceMetadata);
  CFRelease(source);

  CGImageSourceRef iptcSource =
      CGImageSourceCreateWithURL((__bridge CFURLRef)iptcSourceURL, NULL);
  XCTAssertNotEqual(iptcSource, NULL);
  NSDictionary *iptcSourceProperties = CFBridgingRelease(
      CGImageSourceCopyPropertiesAtIndex(iptcSource, 0, NULL));
  NSDictionary *sourceIPTC =
      iptcSourceProperties[(__bridge NSString *)kCGImagePropertyIPTCDictionary];
  XCTAssertEqualObjects(
      sourceIPTC[(__bridge NSString *)kCGImagePropertyIPTCCaptionAbstract],
      @"private-iptc-fixture");
  CFRelease(iptcSource);

  NSError *error = nil;
  NSURL *sanitizedURL = AURAFaceAnalysisSanitizeImageURL(sourceURL, &error);
  XCTAssertNotNil(sanitizedURL);
  XCTAssertNil(error);
  XCTAssertNotEqualObjects(sanitizedURL, sourceURL);
  XCTAssertEqualObjects([NSData dataWithContentsOfURL:sourceURL], sourceBytesBefore);

  CGImageSourceRef sanitized =
      CGImageSourceCreateWithURL((__bridge CFURLRef)sanitizedURL, NULL);
  XCTAssertNotEqual(sanitized, NULL);
  XCTAssertEqual(CGImageSourceGetCount(sanitized), 1u);
  XCTAssertEqualObjects((__bridge NSString *)CGImageSourceGetType(sanitized),
                        UTTypeJPEG.identifier);

  NSDictionary *properties = CFBridgingRelease(
      CGImageSourceCopyPropertiesAtIndex(sanitized, 0, NULL));
  NSNumber *outputOrientation =
      properties[(__bridge NSString *)kCGImagePropertyOrientation];
  XCTAssertTrue(outputOrientation == nil || outputOrientation.integerValue == 1);
  XCTAssertNil(properties[(__bridge NSString *)kCGImagePropertyGPSDictionary]);
  XCTAssertNil(properties[(__bridge NSString *)kCGImagePropertyExifDictionary]);
  XCTAssertNil(properties[(__bridge NSString *)kCGImagePropertyIPTCDictionary]);
  XCTAssertEqual([properties[(__bridge NSString *)kCGImagePropertyPixelWidth]
                     integerValue],
                 2);
  XCTAssertEqual([properties[(__bridge NSString *)kCGImagePropertyPixelHeight]
                     integerValue],
                 3);

  CGImageRef image = CGImageSourceCreateImageAtIndex(sanitized, 0, NULL);
  XCTAssertNotEqual(image, NULL);
  CGColorSpaceRef colorSpace = CGImageGetColorSpace(image);
  XCTAssertEqual(CGColorSpaceGetModel(colorSpace), kCGColorSpaceModelRGB);
  XCTAssertEqualObjects((__bridge NSString *)CGColorSpaceGetName(colorSpace),
                        (__bridge NSString *)kCGColorSpaceSRGB);
  CGImageRelease(image);

  for (id auxiliaryType in [self auxiliaryTypes]) {
    NSDictionary *info = CFBridgingRelease(
        CGImageSourceCopyAuxiliaryDataInfoAtIndex(
            sanitized, 0, (__bridge CFStringRef)auxiliaryType));
    XCTAssertNil(info, @"Sanitized JPEG retained auxiliary type %@", auxiliaryType);
  }
  CGImageMetadataRef sanitizedMetadata =
      CGImageSourceCopyMetadataAtIndex(sanitized, 0, NULL);
  CFStringRef sanitizedXMP = sanitizedMetadata
      ? CGImageMetadataCopyStringValueWithPath(
            sanitizedMetadata, NULL, CFSTR("xmp:Label"))
      : NULL;
  XCTAssertEqual(sanitizedXMP, NULL);
  if (sanitizedXMP) CFRelease(sanitizedXMP);
  if (sanitizedMetadata) CFRelease(sanitizedMetadata);
  CFRelease(sanitized);

  NSDictionary<NSString *, NSNumber *> *inspection =
      AURAFaceAnalysisInspectImageURL(sanitizedURL, &error);
  XCTAssertNotNil(inspection);
  XCTAssertNil(error);
  XCTAssertEqualObjects(inspection[AURAFaceAnalysisInspectionHasAuxiliaryData], @NO);
  XCTAssertEqualObjects(inspection[AURAFaceAnalysisInspectionHasGPS], @NO);
  XCTAssertEqualObjects(inspection[AURAFaceAnalysisInspectionHasExif], @NO);
  XCTAssertEqualObjects(inspection[AURAFaceAnalysisInspectionIsUpright], @YES);
  XCTAssertEqualObjects(inspection[AURAFaceAnalysisInspectionIsSRGB], @YES);

  NSError *iptcError = nil;
  NSURL *sanitizedIPTCURL =
      AURAFaceAnalysisSanitizeImageURL(iptcSourceURL, &iptcError);
  XCTAssertNotNil(sanitizedIPTCURL);
  XCTAssertNil(iptcError);
  CGImageSourceRef sanitizedIPTC = CGImageSourceCreateWithURL(
      (__bridge CFURLRef)sanitizedIPTCURL, NULL);
  XCTAssertNotEqual(sanitizedIPTC, NULL);
  NSDictionary *sanitizedIPTCProperties = CFBridgingRelease(
      CGImageSourceCopyPropertiesAtIndex(sanitizedIPTC, 0, NULL));
  XCTAssertNil(
      sanitizedIPTCProperties[(__bridge NSString *)kCGImagePropertyIPTCDictionary]);
  CFRelease(sanitizedIPTC);
}

- (void)testMalformedInputReturnsErrorAndLeavesNoPartialOutput
{
  NSString *prefix = @"aura-face-analysis-sanitized-";
  NSFileManager *files = NSFileManager.defaultManager;
  NSArray<NSString *> *before = [files contentsOfDirectoryAtPath:NSTemporaryDirectory()
                                                          error:nil];
  NSPredicate *matchesPrefix = [NSPredicate predicateWithBlock:^BOOL(
      NSString *name, NSDictionary<NSString *, id> *bindings) {
    (void)bindings;
    return [name hasPrefix:prefix];
  }];
  NSSet<NSString *> *beforeOutputs =
      [NSSet setWithArray:[before filteredArrayUsingPredicate:matchesPrefix]];
  NSURL *malformed = [NSURL fileURLWithPath:[NSTemporaryDirectory()
      stringByAppendingPathComponent:[NSString stringWithFormat:@"aura-malformed-%@.jpg",
                                                               NSUUID.UUID.UUIDString]]];
  [@"not-an-image" writeToURL:malformed
                   atomically:YES
                     encoding:NSUTF8StringEncoding
                        error:nil];

  NSError *error = nil;
  XCTAssertNil(AURAFaceAnalysisSanitizeImageURL(malformed, &error));
  XCTAssertNotNil(error);

  NSArray<NSString *> *after = [files contentsOfDirectoryAtPath:NSTemporaryDirectory()
                                                         error:nil];
  NSSet<NSString *> *afterOutputs =
      [NSSet setWithArray:[after filteredArrayUsingPredicate:matchesPrefix]];
  XCTAssertEqualObjects(afterOutputs, beforeOutputs);
}

@end
