#import <XCTest/XCTest.h>
#import <UIKit/UIKit.h>

#import "AURATransientDepthStore.h"

@interface AURADepthLifetimeProbe : NSObject
@property(nonatomic, copy, nullable) dispatch_block_t onDealloc;
@end

@implementation AURADepthLifetimeProbe
- (void)dealloc
{
  if (_onDealloc) {
    _onDealloc();
  }
}
@end

@interface AURATransientDepthStoreTests : XCTestCase
@end

@implementation AURATransientDepthStoreTests

- (AURATransientDepthStore *)storeWithNow:(NSTimeInterval (^)(void))now
                                  scheduled:(NSMutableArray<dispatch_block_t> *)scheduled
                                     delays:(NSMutableArray<NSNumber *> *)delays
                                  converter:(AURATransientDepthConverter)converter
                         notificationCenter:(NSNotificationCenter *)notificationCenter
{
  return [[AURATransientDepthStore alloc]
      initWithNowProvider:now
                scheduler:^(NSTimeInterval delay, dispatch_block_t block) {
                  [delays addObject:@(delay)];
                  [scheduled addObject:[block copy]];
                }
       notificationCenter:notificationCenter
           depthConverter:converter];
}

- (void)testCreateConsumeSecondConsumeAndExplicitDiscard
{
  __block NSTimeInterval now = 10;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  NSNotificationCenter *notifications = [NSNotificationCenter new];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return now; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:notifications];
  NSObject *depth = [NSObject new];
  NSString *token = [store storeSyntheticDepthData:depth
                                    photoPixelSize:CGSizeMake(1200, 1600)
                                        orientation:1
                                           mirrored:YES
                                          ttlSeconds:15];

  XCTAssertNotNil(token);
  XCTAssertEqual(store.entryCount, 1u);
  XCTAssertEqualWithAccuracy(delays.lastObject.doubleValue, 15, 1e-12);

  AURATransientDepthConsumeResult *first = [store consumeToken:token];
  XCTAssertEqualObjects(first.status, AURATransientDepthStatusOK);
  XCTAssertTrue(first.consumed);
  XCTAssertEqual(first.payload.depthData, depth);
  XCTAssertEqual(first.payload.photoPixelSize.width, 1200);
  XCTAssertTrue(first.payload.mirrored);
  XCTAssertEqual(store.entryCount, 0u);

  AURATransientDepthConsumeResult *second = [store consumeToken:token];
  XCTAssertEqualObjects(second.status, AURATransientDepthStatusNotFound);
  XCTAssertFalse(second.consumed);
  XCTAssertNil(second.payload);

  NSString *discarded = [store storeSyntheticDepthData:[NSObject new]
                                        photoPixelSize:CGSizeMake(100, 100)
                                            orientation:1
                                               mirrored:NO
                                              ttlSeconds:3];
  XCTAssertTrue([store discardToken:discarded]);
  XCTAssertEqualObjects([store consumeToken:discarded].status,
                        AURATransientDepthStatusNotFound);
}

- (void)testTTLClampExpiryTombstoneAndDiscardAll
{
  __block NSTimeInterval now = 100;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return now; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:[NSNotificationCenter new]];

  NSString *token = [store storeSyntheticDepthData:[NSObject new]
                                    photoPixelSize:CGSizeMake(10, 10)
                                        orientation:1
                                           mirrored:NO
                                          ttlSeconds:500];
  XCTAssertEqualWithAccuracy(delays.lastObject.doubleValue, 60, 1e-12);

  now = 160;
  XCTAssertEqualObjects([store consumeToken:token].status,
                        AURATransientDepthStatusExpired);

  token = [store storeSyntheticDepthData:[NSObject new]
                          photoPixelSize:CGSizeMake(10, 10)
                              orientation:1
                                 mirrored:NO
                                ttlSeconds:1];

  now = 161;
  scheduled.lastObject();
  XCTAssertEqual(store.entryCount, 0u);
  XCTAssertEqualObjects([store consumeToken:token].status,
                        AURATransientDepthStatusExpired);

  now = 222;
  XCTAssertEqualObjects([store consumeToken:token].status,
                        AURATransientDepthStatusNotFound);

  [store storeSyntheticDepthData:[NSObject new]
                  photoPixelSize:CGSizeMake(10, 10)
                      orientation:1
                         mirrored:NO
                        ttlSeconds:10];
  [store storeSyntheticDepthData:[NSObject new]
                  photoPixelSize:CGSizeMake(10, 10)
                      orientation:1
                         mirrored:NO
                        ttlSeconds:10];
  XCTAssertEqual(store.entryCount, 2u);
  [store discardAll];
  XCTAssertEqual(store.entryCount, 0u);
}

- (void)testBackgroundAndMemoryWarningsDiscardEverything
{
  __block NSTimeInterval now = 0;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  NSNotificationCenter *notifications = [NSNotificationCenter new];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return now; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:notifications];

  [store storeSyntheticDepthData:[NSObject new]
                  photoPixelSize:CGSizeMake(10, 10)
                      orientation:1
                         mirrored:NO
                        ttlSeconds:10];
  [notifications postNotificationName:UIApplicationDidEnterBackgroundNotification
                                object:nil];
  XCTAssertEqual(store.entryCount, 0u);

  [store storeSyntheticDepthData:[NSObject new]
                  photoPixelSize:CGSizeMake(10, 10)
                      orientation:1
                         mirrored:NO
                        ttlSeconds:10];
  [notifications postNotificationName:UIApplicationDidReceiveMemoryWarningNotification
                                object:nil];
  XCTAssertEqual(store.entryCount, 0u);
}

- (void)testConversionFailureDoesNotLeaveAnEntry
{
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) {
                 (void)value;
                 return nil;
               }
      notificationCenter:[NSNotificationCenter new]];

  NSString *token = [store storeSyntheticDepthData:[NSObject new]
                                    photoPixelSize:CGSizeMake(10, 10)
                                        orientation:1
                                           mirrored:NO
                                          ttlSeconds:10];
  XCTAssertNil(token);
  XCTAssertEqual(store.entryCount, 0u);
  XCTAssertEqual(scheduled.count, 0u);
}

- (void)testConverterRunsExactlyOnceAndExceptionCleanupReleasesPayload
{
  __block NSUInteger conversionCount = 0;
  __block NSUInteger deallocationCount = 0;
  __weak AURADepthLifetimeProbe *weakDepth = nil;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) {
                 conversionCount += 1;
                 @throw [NSException exceptionWithName:@"SyntheticConversionFailure"
                                                reason:@"fixture"
                                              userInfo:nil];
               }
      notificationCenter:[NSNotificationCenter new]];

  @autoreleasepool {
    AURADepthLifetimeProbe *depth = [AURADepthLifetimeProbe new];
    depth.onDealloc = ^{ deallocationCount += 1; };
    weakDepth = depth;
    XCTAssertNil([store storeSyntheticDepthData:depth
                                photoPixelSize:CGSizeMake(10, 10)
                                    orientation:1
                                       mirrored:NO
                                      ttlSeconds:10]);
    depth = nil;
  }

  XCTAssertEqual(conversionCount, 1u);
  XCTAssertEqual(store.entryCount, 0u);
  XCTAssertEqual(scheduled.count, 0u);
  XCTAssertNil(weakDepth);
  XCTAssertEqual(deallocationCount, 1u);
}

- (void)testDiscardReleasesPayloadBeforeScheduledEvictionRuns
{
  __block NSUInteger deallocationCount = 0;
  __weak AURADepthLifetimeProbe *weakDepth = nil;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:[NSNotificationCenter new]];
  NSString *token = nil;

  @autoreleasepool {
    AURADepthLifetimeProbe *depth = [AURADepthLifetimeProbe new];
    depth.onDealloc = ^{ deallocationCount += 1; };
    weakDepth = depth;
    token = [store storeSyntheticDepthData:depth
                            photoPixelSize:CGSizeMake(10, 10)
                                orientation:1
                                   mirrored:NO
                                  ttlSeconds:60];
    depth = nil;
  }
  XCTAssertNotNil(weakDepth);
  XCTAssertTrue([store discardToken:token]);
  XCTAssertNil(weakDepth);
  XCTAssertEqual(deallocationCount, 1u);
  XCTAssertEqual(scheduled.count, 1u);
}

- (void)testBeginAnalysisAndDiscardAreOneCancellationSafeHandoff
{
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:[NSNotificationCenter new]];
  NSString *token = [store storeSyntheticDepthData:[NSObject new]
                                    photoPixelSize:CGSizeMake(10, 10)
                                        orientation:1
                                           mirrored:NO
                                          ttlSeconds:10];

  AURATransientDepthConsumeResult *begin = [store beginAnalysisWithToken:token];
  XCTAssertEqualObjects(begin.status, AURATransientDepthStatusOK);
  XCTAssertNotNil(begin.analysisContext);
  XCTAssertEqual(store.activeAnalysisCount, 1u);
  XCTAssertTrue([store discardToken:token]);
  XCTAssertTrue(begin.analysisContext.isCancelled);
  [store endAnalysisForToken:token];
  XCTAssertEqual(store.activeAnalysisCount, 0u);
  XCTAssertNil(begin.analysisContext.payload);

  NSString *discardFirst = [store storeSyntheticDepthData:[NSObject new]
                                           photoPixelSize:CGSizeMake(10, 10)
                                               orientation:1
                                                  mirrored:NO
                                                 ttlSeconds:10];
  XCTAssertTrue([store discardToken:discardFirst]);
  XCTAssertEqualObjects([store beginAnalysisWithToken:discardFirst].status,
                        AURATransientDepthStatusNotFound);
}

- (void)testBackgroundAndMemoryWarningCancelActiveAnalysis
{
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  NSNotificationCenter *notifications = [NSNotificationCenter new];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:notifications];

  for (NSNotificationName name in @[
         UIApplicationDidEnterBackgroundNotification,
         UIApplicationDidReceiveMemoryWarningNotification,
       ]) {
    NSString *token = [store storeSyntheticDepthData:[NSObject new]
                                      photoPixelSize:CGSizeMake(10, 10)
                                          orientation:1
                                             mirrored:NO
                                            ttlSeconds:10];
    AURATransientDepthConsumeResult *begin = [store beginAnalysisWithToken:token];
    XCTAssertFalse(begin.analysisContext.isCancelled);
    [notifications postNotificationName:name object:nil];
    XCTAssertTrue(begin.analysisContext.isCancelled);
    [store endAnalysisForToken:token];
    XCTAssertEqual(store.activeAnalysisCount, 0u);
  }
}

- (void)testRepeatedHandoffRaceAndConsumeDiscardEvictionLeaveNoPayload
{
  __block NSTimeInterval now = 0;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientDepthStore *store =
      [self storeWithNow:^NSTimeInterval { return now; }
               scheduled:scheduled
                  delays:delays
               converter:^id(id value) { return value; }
      notificationCenter:[NSNotificationCenter new]];

  for (NSUInteger attempt = 0; attempt < 64; attempt += 1) {
    NSString *token = [store storeSyntheticDepthData:[NSObject new]
                                      photoPixelSize:CGSizeMake(10, 10)
                                          orientation:1
                                             mirrored:NO
                                            ttlSeconds:10];
    __block AURATransientDepthConsumeResult *begin = nil;
    dispatch_group_t group = dispatch_group_create();
    dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      begin = [store beginAnalysisWithToken:token];
    });
    dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      [store discardToken:token];
    });
    dispatch_group_wait(group, DISPATCH_TIME_FOREVER);

    if ([begin.status isEqualToString:AURATransientDepthStatusOK]) {
      XCTAssertTrue(begin.analysisContext.isCancelled);
      [store endAnalysisForToken:token];
    } else {
      XCTAssertEqualObjects(begin.status, AURATransientDepthStatusNotFound);
    }
    XCTAssertEqual(store.entryCount, 0u);
    XCTAssertEqual(store.activeAnalysisCount, 0u);
  }

  NSString *token = [store storeSyntheticDepthData:[NSObject new]
                                    photoPixelSize:CGSizeMake(10, 10)
                                        orientation:1
                                           mirrored:NO
                                          ttlSeconds:1];
  dispatch_block_t eviction = scheduled.lastObject;
  now = 2;
  __block AURATransientDepthConsumeResult *consume = nil;
  dispatch_group_t group = dispatch_group_create();
  dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    consume = [store consumeToken:token];
  });
  dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), eviction);
  dispatch_group_async(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    [store discardToken:token];
  });
  dispatch_group_wait(group, DISPATCH_TIME_FOREVER);
  XCTAssertTrue([consume.status isEqualToString:AURATransientDepthStatusExpired] ||
                [consume.status isEqualToString:AURATransientDepthStatusNotFound]);
  XCTAssertFalse(consume.consumed);
  XCTAssertEqual(store.entryCount, 0u);
}

@end
