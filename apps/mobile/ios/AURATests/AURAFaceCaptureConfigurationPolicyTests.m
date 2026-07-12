#import <AVFoundation/AVFoundation.h>
#import <ImageIO/ImageIO.h>
#import <XCTest/XCTest.h>

#import "AURAFaceCaptureConfigurationPolicy.h"

FOUNDATION_EXPORT NSDictionary *AURARealtimePhotoCaptureDeliveryPolicy(
    BOOL transientDepthCapture,
    BOOL semanticMatteCapture,
    BOOL depthDeliveryAvailable,
    BOOL semanticMatteTypesAvailable);

FOUNDATION_EXPORT id _Nullable AURARealtimeNormalizeSemanticMatteForStorage(
    id _Nullable matte,
    CGImagePropertyOrientation orientation);

typedef void (^AURARealtimeCaptureTokenDiscardBlock)(NSString *token);

@interface AURARealtimeCaptureAttemptGuard : NSObject

@property(nonatomic, assign, readonly) NSUInteger generation;

- (instancetype)initWithDepthDiscard:(AURARealtimeCaptureTokenDiscardBlock)depthDiscard
                         matteDiscard:(AURARealtimeCaptureTokenDiscardBlock)matteDiscard;
- (NSUInteger)beginAttemptWithUniqueID:(int64_t)uniqueID;
- (NSUInteger)replaceAttemptWithUniqueID:(int64_t)uniqueID;
- (BOOL)acceptsGeneration:(NSUInteger)generation uniqueID:(int64_t)uniqueID;
- (BOOL)registerDepthToken:(nullable NSString *)depthToken
                matteToken:(nullable NSString *)matteToken
                generation:(NSUInteger)generation
                  uniqueID:(int64_t)uniqueID;
- (nullable NSDictionary<NSString *, NSString *> *)
    transferTokensForGeneration:(NSUInteger)generation uniqueID:(int64_t)uniqueID;
- (void)cancel;

@end

@interface AURASyntheticSemanticMatte : NSObject
@property(nonatomic, assign) NSUInteger transformCount;
@property(nonatomic, assign) CGImagePropertyOrientation receivedOrientation;
@end

@implementation AURASyntheticSemanticMatte

- (instancetype)semanticSegmentationMatteByApplyingExifOrientation:
    (CGImagePropertyOrientation)orientation
{
  self.transformCount += 1;
  self.receivedOrientation = orientation;
  return self;
}

@end

@interface AURAFaceCaptureConfigurationPolicyTests : XCTestCase
@end

@implementation AURAFaceCaptureConfigurationPolicyTests

- (void)testLegacyModeKeepsExisting720pPreset
{
  AVCaptureSessionPreset preset = AURAFaceCapturePresetForCapabilities(
      NO, NO, NO, NO, NO, YES);
  XCTAssertEqualObjects(preset, AVCaptureSessionPreset1280x720);
}

- (void)testDepthRequestKeeps720pWhenDepthIsAvailable
{
  AVCaptureSessionPreset preset = AURAFaceCapturePresetForCapabilities(
      YES, NO, YES, NO, NO, YES);
  XCTAssertEqualObjects(preset, AVCaptureSessionPreset1280x720);
}

- (void)testDepthRequestEscalatesToPhotoOnlyWhen720pCapabilityIsMissing
{
  AVCaptureSessionPreset preset = AURAFaceCapturePresetForCapabilities(
      YES, NO, NO, NO, NO, YES);
  XCTAssertEqualObjects(preset, AVCaptureSessionPresetPhoto);
}

- (void)testMatteRequestRequiresBothHairAndSkinAt720p
{
  XCTAssertEqualObjects(
      AURAFaceCapturePresetForCapabilities(NO, YES, YES, YES, YES, YES),
      AVCaptureSessionPreset1280x720);
  XCTAssertEqualObjects(
      AURAFaceCapturePresetForCapabilities(NO, YES, YES, YES, NO, YES),
      AVCaptureSessionPresetPhoto);
}

- (void)testUnavailablePhotoPresetFallsBackTo720p
{
  XCTAssertEqualObjects(
      AURAFaceCapturePresetForCapabilities(YES, YES, NO, NO, NO, NO),
      AVCaptureSessionPreset1280x720);
}

- (void)testDepthOnlyFaceAnalysisEnablesDeliveryWithoutEmbeddingAuxiliaryData
{
  NSDictionary *policy = AURARealtimePhotoCaptureDeliveryPolicy(
      YES, NO, YES, NO);

  XCTAssertEqualObjects(policy[@"depthDataDeliveryEnabled"], @YES);
  XCTAssertEqualObjects(policy[@"semanticMatteDeliveryEnabled"], @NO);
  XCTAssertEqualObjects(policy[@"embedsDepthDataInPhoto"], @NO);
  XCTAssertEqualObjects(policy[@"embedsSemanticSegmentationMattesInPhoto"], @NO);
}

- (void)testFaceAnalysisWithMattesKeepsBothAuxiliaryEmbedsDisabled
{
  NSDictionary *policy = AURARealtimePhotoCaptureDeliveryPolicy(
      YES, YES, YES, YES);

  XCTAssertEqualObjects(policy[@"depthDataDeliveryEnabled"], @YES);
  XCTAssertEqualObjects(policy[@"semanticMatteDeliveryEnabled"], @YES);
  XCTAssertEqualObjects(policy[@"embedsDepthDataInPhoto"], @NO);
  XCTAssertEqualObjects(policy[@"embedsSemanticSegmentationMattesInPhoto"], @NO);
}

- (void)testLegacySemanticMatteCaptureStillEmbedsMattesButNotDepth
{
  NSDictionary *policy = AURARealtimePhotoCaptureDeliveryPolicy(
      NO, YES, YES, YES);

  XCTAssertEqualObjects(policy[@"depthDataDeliveryEnabled"], @YES);
  XCTAssertEqualObjects(policy[@"semanticMatteDeliveryEnabled"], @YES);
  XCTAssertEqualObjects(policy[@"embedsDepthDataInPhoto"], @NO);
  XCTAssertEqualObjects(policy[@"embedsSemanticSegmentationMattesInPhoto"], @YES);
}

- (void)testDepthAndMatteCapabilitiesRemainIndependent
{
  NSDictionary *depthOnlyAvailable = AURARealtimePhotoCaptureDeliveryPolicy(
      YES, YES, YES, NO);
  XCTAssertEqualObjects(depthOnlyAvailable[@"depthDataDeliveryEnabled"], @YES);
  XCTAssertEqualObjects(depthOnlyAvailable[@"semanticMatteDeliveryEnabled"], @NO);

  NSDictionary *matteTypesWithoutDepth = AURARealtimePhotoCaptureDeliveryPolicy(
      YES, YES, NO, YES);
  XCTAssertEqualObjects(matteTypesWithoutDepth[@"depthDataDeliveryEnabled"], @NO);
  XCTAssertEqualObjects(matteTypesWithoutDepth[@"semanticMatteDeliveryEnabled"], @NO);
}

- (void)testCaptureAttemptRejectsLateUniqueIDAndGenerationAndDiscardsLateTokens
{
  NSMutableArray<NSString *> *discardedDepth = [NSMutableArray array];
  NSMutableArray<NSString *> *discardedMatte = [NSMutableArray array];
  AURARealtimeCaptureAttemptGuard *guard =
      [[AURARealtimeCaptureAttemptGuard alloc]
          initWithDepthDiscard:^(NSString *token) {
            [discardedDepth addObject:token];
          }
          matteDiscard:^(NSString *token) {
            [discardedMatte addObject:token];
          }];

  NSUInteger first = [guard beginAttemptWithUniqueID:101];
  NSUInteger second = [guard replaceAttemptWithUniqueID:202];
  XCTAssertNotEqual(first, second);
  XCTAssertFalse([guard acceptsGeneration:first uniqueID:101]);
  XCTAssertFalse([guard acceptsGeneration:second uniqueID:101]);
  XCTAssertTrue([guard acceptsGeneration:second uniqueID:202]);

  XCTAssertFalse([guard registerDepthToken:@"late-depth"
                                matteToken:@"late-matte"
                                generation:first
                                  uniqueID:101]);
  XCTAssertEqualObjects(discardedDepth, (@[@"late-depth"]));
  XCTAssertEqualObjects(discardedMatte, (@[@"late-matte"]));
}

- (void)testCaptureCancellationDiscardsRegisteredTokensAndCannotResolveTwice
{
  NSMutableArray<NSString *> *discarded = [NSMutableArray array];
  AURARealtimeCaptureAttemptGuard *guard =
      [[AURARealtimeCaptureAttemptGuard alloc]
          initWithDepthDiscard:^(NSString *token) {
            [discarded addObject:[@"depth:" stringByAppendingString:token]];
          }
          matteDiscard:^(NSString *token) {
            [discarded addObject:[@"matte:" stringByAppendingString:token]];
          }];
  NSUInteger generation = [guard beginAttemptWithUniqueID:303];
  XCTAssertTrue([guard registerDepthToken:@"d"
                               matteToken:@"m"
                               generation:generation
                                 uniqueID:303]);

  [guard cancel];
  XCTAssertEqualObjects(
      [NSSet setWithArray:discarded],
      ([NSSet setWithArray:@[@"depth:d", @"matte:m"]]));
  XCTAssertFalse([guard acceptsGeneration:generation uniqueID:303]);
  XCTAssertNil([guard transferTokensForGeneration:generation uniqueID:303]);
  [guard cancel];
  XCTAssertEqual(discarded.count, 2u);
}

- (void)testSuccessfulTokenTransferIsExactOnceAndDoesNotDiscard
{
  __block NSUInteger discardCount = 0;
  AURARealtimeCaptureAttemptGuard *guard =
      [[AURARealtimeCaptureAttemptGuard alloc]
          initWithDepthDiscard:^(__unused NSString *token) {
            discardCount += 1;
          }
          matteDiscard:^(__unused NSString *token) {
            discardCount += 1;
          }];
  NSUInteger generation = [guard beginAttemptWithUniqueID:404];
  XCTAssertTrue([guard registerDepthToken:@"d"
                               matteToken:@"m"
                               generation:generation
                                 uniqueID:404]);

  NSDictionary *transferred =
      [guard transferTokensForGeneration:generation uniqueID:404];
  XCTAssertEqualObjects(transferred, (@{
    @"nativeDepthToken": @"d",
    @"nativeMatteToken": @"m",
  }));
  XCTAssertNil([guard transferTokensForGeneration:generation uniqueID:404]);
  [guard cancel];
  XCTAssertEqual(discardCount, 0u);
}

- (void)testSemanticMatteNormalizationAppliesEachExifTransformExactlyOnce
{
  for (NSNumber *orientation in @[@1, @3, @6, @8, @2]) {
    AURASyntheticSemanticMatte *matte = [AURASyntheticSemanticMatte new];
    id normalized = AURARealtimeNormalizeSemanticMatteForStorage(
        matte, (CGImagePropertyOrientation)orientation.unsignedIntegerValue);
    XCTAssertEqual(normalized, matte);
    XCTAssertEqual(matte.transformCount, 1u);
    XCTAssertEqual(matte.receivedOrientation,
                   (CGImagePropertyOrientation)orientation.unsignedIntegerValue);
  }
}

@end
