#import "AURAFaceAnalysisMediaSanitizer.h"

#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

NSErrorDomain const AURAFaceAnalysisMediaSanitizerErrorDomain =
    @"com.aura.face-analysis.media-sanitizer";

NSString *const AURAFaceAnalysisInspectionHasAuxiliaryData =
    @"hasAuxiliaryData";
NSString *const AURAFaceAnalysisInspectionHasGPS = @"hasGPS";
NSString *const AURAFaceAnalysisInspectionHasExif = @"hasExif";
NSString *const AURAFaceAnalysisInspectionIsUpright = @"isUpright";
NSString *const AURAFaceAnalysisInspectionIsSRGB = @"isSRGB";

static NSString *const AURAFaceAnalysisSanitizedPrefix =
    @"aura-face-analysis-sanitized-";

static void AURASetSanitizerError(
    NSError **error,
    AURAFaceAnalysisMediaSanitizerError code,
    NSString *description) {
  if (!error) return;
  *error = [NSError errorWithDomain:AURAFaceAnalysisMediaSanitizerErrorDomain
                               code:code
                           userInfo:@{NSLocalizedDescriptionKey : description}];
}

static BOOL AURAValidateFileURL(NSURL *url, NSError **error) {
  if (![url isKindOfClass:NSURL.class] || !url.isFileURL) {
    AURASetSanitizerError(
        error,
        AURAFaceAnalysisMediaSanitizerErrorInvalidURL,
        @"Face analysis media must be a local file URL.");
    return NO;
  }
  return YES;
}

static CGImageSourceRef AURACreateImageSource(NSURL *url, NSError **error) {
  NSDictionary *options = @{
    (__bridge NSString *)kCGImageSourceShouldCache : @NO,
  };
  CGImageSourceRef source = CGImageSourceCreateWithURL(
      (__bridge CFURLRef)url, (__bridge CFDictionaryRef)options);
  if (!source || CGImageSourceGetCount(source) == 0) {
    if (source) CFRelease(source);
    AURASetSanitizerError(
        error,
        AURAFaceAnalysisMediaSanitizerErrorSourceUnavailable,
        @"Face analysis image could not be opened.");
    return NULL;
  }
  return source;
}

static NSArray<NSString *> *AURAAuxiliaryDataTypes(void) {
  static NSArray<NSString *> *types;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    NSMutableArray<NSString *> *values = [NSMutableArray arrayWithArray:@[
      (__bridge NSString *)kCGImageAuxiliaryDataTypeDepth,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeDisparity,
      (__bridge NSString *)kCGImageAuxiliaryDataTypePortraitEffectsMatte,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeSemanticSegmentationTeethMatte,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeSemanticSegmentationGlassesMatte,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeSemanticSegmentationSkyMatte,
      (__bridge NSString *)kCGImageAuxiliaryDataTypeHDRGainMap,
    ]];
    if (@available(iOS 18.0, *)) {
      [values addObject:(__bridge NSString *)kCGImageAuxiliaryDataTypeISOGainMap];
    }
    types = [values copy];
  });
  return types;
}

static BOOL AURAImageSourceHasAuxiliaryData(CGImageSourceRef source) {
  for (NSString *type in AURAAuxiliaryDataTypes()) {
    CFDictionaryRef information = CGImageSourceCopyAuxiliaryDataInfoAtIndex(
        source, 0, (__bridge CFStringRef)type);
    if (information) {
      CFRelease(information);
      return YES;
    }
  }
  return NO;
}

static NSData *AURAJPEGDataByRemovingMetadataSegments(NSData *jpegData) {
  const uint8_t *bytes = jpegData.bytes;
  NSUInteger length = jpegData.length;
  if (length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) {
    return nil;
  }

  NSMutableData *result = [NSMutableData dataWithCapacity:length];
  [result appendBytes:bytes length:2];
  NSUInteger offset = 2;

  while (offset < length) {
    NSUInteger markerStart = offset;
    if (bytes[offset] != 0xFF) return nil;
    while (offset < length && bytes[offset] == 0xFF) offset += 1;
    if (offset >= length) return nil;

    uint8_t marker = bytes[offset++];
    if (marker == 0x00) return nil;
    if (marker == 0xD9) {
      [result appendBytes:bytes + markerStart length:length - markerStart];
      return [result copy];
    }

    BOOL standaloneMarker =
        marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8);
    if (standaloneMarker) {
      [result appendBytes:bytes + markerStart length:offset - markerStart];
      continue;
    }

    if (offset + 2 > length) return nil;
    NSUInteger segmentLength =
        ((NSUInteger)bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || segmentLength > length - offset) return nil;
    NSUInteger segmentEnd = offset + segmentLength;
    if (marker == 0xDA) {
      [result appendBytes:bytes + markerStart length:length - markerStart];
      return [result copy];
    }

    BOOL sensitiveMetadataSegment =
        marker == 0xE1 || marker == 0xED || marker == 0xFE;
    if (!sensitiveMetadataSegment) {
      [result appendBytes:bytes + markerStart
                   length:segmentEnd - markerStart];
    }
    offset = segmentEnd;
  }

  return nil;
}

static CGImageRef AURACreateUprightSRGBImage(CGImageSourceRef source,
                                             NSError **error) {
  NSDictionary *properties = CFBridgingRelease(
      CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  NSNumber *pixelWidth = properties[(__bridge NSString *)kCGImagePropertyPixelWidth];
  NSNumber *pixelHeight = properties[(__bridge NSString *)kCGImagePropertyPixelHeight];
  size_t sourceWidth = pixelWidth.unsignedLongLongValue;
  size_t sourceHeight = pixelHeight.unsignedLongLongValue;
  size_t maximumDimension = MAX(sourceWidth, sourceHeight);
  if (maximumDimension == 0) {
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorDecodeFailed,
                          @"Face analysis image dimensions are invalid.");
    return NULL;
  }

  NSDictionary *thumbnailOptions = @{
    (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize :
        @(maximumDimension),
    (__bridge NSString *)kCGImageSourceShouldCacheImmediately : @YES,
  };
  CGImageRef uprightSource = CGImageSourceCreateThumbnailAtIndex(
      source, 0, (__bridge CFDictionaryRef)thumbnailOptions);
  if (!uprightSource) {
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorDecodeFailed,
                          @"Face analysis image could not be decoded.");
    return NULL;
  }

  size_t width = CGImageGetWidth(uprightSource);
  size_t height = CGImageGetHeight(uprightSource);
  if (width == 0 || height == 0 || width > SIZE_MAX / 4) {
    CGImageRelease(uprightSource);
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorDecodeFailed,
                          @"Face analysis image dimensions are invalid.");
    return NULL;
  }

  CGColorSpaceRef colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context = colorSpace
      ? CGBitmapContextCreate(NULL,
                             width,
                             height,
                             8,
                             width * 4,
                             colorSpace,
                             (uint32_t)kCGBitmapByteOrder32Big |
                                 (uint32_t)kCGImageAlphaPremultipliedLast)
      : NULL;
  if (colorSpace) CGColorSpaceRelease(colorSpace);
  if (!context) {
    CGImageRelease(uprightSource);
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorDecodeFailed,
                          @"Face analysis image could not be rendered.");
    return NULL;
  }

  CGContextSetBlendMode(context, kCGBlendModeCopy);
  CGContextDrawImage(context, CGRectMake(0, 0, width, height), uprightSource);
  CGImageRef renderedImage = CGBitmapContextCreateImage(context);
  CGContextRelease(context);
  CGImageRelease(uprightSource);

  if (!renderedImage) {
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorDecodeFailed,
                          @"Face analysis image could not be rendered.");
  }
  return renderedImage;
}

NSURL *AURAFaceAnalysisSanitizeImageURL(NSURL *sourceURL, NSError **error) {
  if (error) *error = nil;
  if (!AURAValidateFileURL(sourceURL, error)) return nil;

  CGImageSourceRef source = AURACreateImageSource(sourceURL, error);
  if (!source) return nil;
  CGImageRef renderedImage = AURACreateUprightSRGBImage(source, error);
  CFRelease(source);
  if (!renderedImage) return nil;

  NSString *identifier = NSUUID.UUID.UUIDString;
  NSURL *temporaryDirectory = [NSURL fileURLWithPath:NSTemporaryDirectory()
                                           isDirectory:YES];
  NSURL *stagingURL = [temporaryDirectory URLByAppendingPathComponent:
      [NSString stringWithFormat:@"aura-face-analysis-sanitizing-%@.tmp",
                                 identifier]];
  NSURL *outputURL = [temporaryDirectory URLByAppendingPathComponent:
      [NSString stringWithFormat:@"%@%@.jpg",
                                 AURAFaceAnalysisSanitizedPrefix,
                                 identifier]];

  UIImage *uprightImage = [UIImage imageWithCGImage:renderedImage
                                              scale:1.0
                                        orientation:UIImageOrientationUp];
  NSData *jpegData = UIImageJPEGRepresentation(uprightImage, 0.92);
  CGImageRelease(renderedImage);
  NSData *metadataFreeJPEG = jpegData
      ? AURAJPEGDataByRemovingMetadataSegments(jpegData)
      : nil;
  if (!metadataFreeJPEG) {
    [NSFileManager.defaultManager removeItemAtURL:stagingURL error:nil];
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorEncodeFailed,
                          @"Sanitized face analysis image could not be encoded.");
    return nil;
  }

  NSError *writeError = nil;
  if (![metadataFreeJPEG writeToURL:stagingURL
                            options:NSDataWritingAtomic
                              error:&writeError]) {
    (void)writeError;
    [NSFileManager.defaultManager removeItemAtURL:stagingURL error:nil];
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorEncodeFailed,
                          @"Sanitized face analysis image could not be stored.");
    return nil;
  }

  NSError *moveError = nil;
  if (![NSFileManager.defaultManager moveItemAtURL:stagingURL
                                             toURL:outputURL
                                             error:&moveError]) {
    (void)moveError;
    [NSFileManager.defaultManager removeItemAtURL:stagingURL error:nil];
    [NSFileManager.defaultManager removeItemAtURL:outputURL error:nil];
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorMoveFailed,
                          @"Sanitized face analysis image could not be stored.");
    return nil;
  }

  return outputURL;
}

NSDictionary<NSString *, NSNumber *> *AURAFaceAnalysisInspectImageURL(
    NSURL *imageURL, NSError **error) {
  if (error) *error = nil;
  if (!AURAValidateFileURL(imageURL, error)) return nil;

  CGImageSourceRef source = AURACreateImageSource(imageURL, error);
  if (!source) return nil;
  NSDictionary *properties = CFBridgingRelease(
      CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
  if (!image) {
    CFRelease(source);
    AURASetSanitizerError(error,
                          AURAFaceAnalysisMediaSanitizerErrorDecodeFailed,
                          @"Face analysis image could not be inspected.");
    return nil;
  }

  BOOL hasAuxiliaryData = AURAImageSourceHasAuxiliaryData(source);
  BOOL hasGPS =
      [properties[(__bridge NSString *)kCGImagePropertyGPSDictionary]
          isKindOfClass:NSDictionary.class];
  BOOL hasExif =
      [properties[(__bridge NSString *)kCGImagePropertyExifDictionary]
          isKindOfClass:NSDictionary.class];
  NSNumber *orientation =
      properties[(__bridge NSString *)kCGImagePropertyOrientation];
  BOOL isUpright = !orientation || orientation.integerValue == 1;
  CGColorSpaceRef colorSpace = CGImageGetColorSpace(image);
  CFStringRef colorSpaceName = colorSpace ? CGColorSpaceGetName(colorSpace) : NULL;
  BOOL isSRGB = colorSpaceName && CFEqual(colorSpaceName, kCGColorSpaceSRGB);

  CGImageRelease(image);
  CFRelease(source);
  return @{
    AURAFaceAnalysisInspectionHasAuxiliaryData : @(hasAuxiliaryData),
    AURAFaceAnalysisInspectionHasGPS : @(hasGPS),
    AURAFaceAnalysisInspectionHasExif : @(hasExif),
    AURAFaceAnalysisInspectionIsUpright : @(isUpright),
    AURAFaceAnalysisInspectionIsSRGB : @(isSRGB),
  };
}

static NSURL *AURAFaceAnalysisLocalFileURL(NSString *imageURI) {
  if (![imageURI isKindOfClass:NSString.class] || imageURI.length == 0) {
    return nil;
  }

  NSURL *parsedURL = [NSURL URLWithString:imageURI];
  if (parsedURL.isFileURL) {
    return parsedURL;
  }
  if (parsedURL.scheme.length > 0 ||
      [imageURI hasPrefix:@"file:"] ||
      [imageURI rangeOfString:@"://"].location != NSNotFound) {
    return nil;
  }
  return [NSURL fileURLWithPath:imageURI];
}

@interface AURAFaceAnalysisMediaSanitizer : NSObject <RCTBridgeModule>
@end

@implementation AURAFaceAnalysisMediaSanitizer

RCT_EXPORT_MODULE(AURAFaceAnalysisMediaSanitizer)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(sanitize:(NSString *)imageURI
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  static NSString *const errorCode = @"FACE_ANALYSIS_MEDIA_SANITIZE_FAILED";
  static NSString *const errorMessage =
      @"Face analysis media could not be sanitized.";

  NSURL *sourceURL = AURAFaceAnalysisLocalFileURL(imageURI);
  if (!sourceURL) {
    reject(errorCode, errorMessage, nil);
    return;
  }

  NSError *sanitizerError = nil;
  NSURL *outputURL =
      AURAFaceAnalysisSanitizeImageURL(sourceURL, &sanitizerError);
  (void)sanitizerError;
  if (!outputURL) {
    reject(errorCode, errorMessage, nil);
    return;
  }

  resolve(@{ @"uri" : outputURL.absoluteString });
}

@end
