#import <XCTest/XCTest.h>
#import <UIKit/UIKit.h>

#import "AURATransientMatteStore.h"

@interface AURAMatteLifetimeProbe : NSObject
@property(nonatomic, copy, nullable) dispatch_block_t onDealloc;
@end

@implementation AURAMatteLifetimeProbe
- (void)dealloc
{
  if (_onDealloc) {
    _onDealloc();
  }
}
@end

@interface AURATransientMatteStoreTests : XCTestCase
@end

@implementation AURATransientMatteStoreTests

- (AURATransientMatteStore *)storeWithNow:(NSTimeInterval (^)(void))now
                                  scheduled:(NSMutableArray<dispatch_block_t> *)scheduled
                                     delays:(NSMutableArray<NSNumber *> *)delays
                         notificationCenter:(NSNotificationCenter *)notificationCenter
{
  return [[AURATransientMatteStore alloc]
      initWithNowProvider:now
                scheduler:^(NSTimeInterval delay, dispatch_block_t block) {
                  [delays addObject:@(delay)];
                  [scheduled addObject:[block copy]];
                }
       notificationCenter:notificationCenter];
}

- (void)testTwoReadersBorrowIndependentlyAndDiscardOnlyBlocksNewReaders
{
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientMatteStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
      notificationCenter:[NSNotificationCenter new]];
  NSObject *hair = [NSObject new];
  NSObject *skin = [NSObject new];
  NSString *token = [store storeHairMatte:hair skinMatte:skin ttlSeconds:10];

  AURATransientMatteLease *first = [store borrowToken:token];
  AURATransientMatteLease *second = [store borrowToken:token];
  XCTAssertNotNil(first);
  XCTAssertNotNil(second);
  XCTAssertNotEqual(first, second);
  XCTAssertEqual(first.hairMatte, hair);
  XCTAssertEqual(second.skinMatte, skin);

  XCTAssertTrue([store discardToken:token]);
  XCTAssertNil([store borrowToken:token]);
  XCTAssertEqual(first.hairMatte, hair);
  XCTAssertEqual(second.skinMatte, skin);
}

- (void)testOneReaderFailureDoesNotInvalidateTheOtherLease
{
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientMatteStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
      notificationCenter:[NSNotificationCenter new]];
  NSObject *hair = [NSObject new];
  NSString *token = [store storeHairMatte:hair skinMatte:nil ttlSeconds:10];
  __block AURATransientMatteLease *failingReader = [store borrowToken:token];
  AURATransientMatteLease *successfulReader = [store borrowToken:token];

  @try {
    @throw [NSException exceptionWithName:@"SyntheticReaderFailure"
                                   reason:@"fixture"
                                 userInfo:nil];
  } @catch (NSException *exception) {
    XCTAssertEqualObjects(exception.name, @"SyntheticReaderFailure");
  } @finally {
    failingReader = nil;
  }

  XCTAssertEqual(successfulReader.hairMatte, hair);
  XCTAssertNotNil([store borrowToken:token]);
}

- (void)testDiscardWhileBorrowedReleasesPayloadAfterBothLeasesDeallocate
{
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientMatteStore *store =
      [self storeWithNow:^NSTimeInterval { return 0; }
               scheduled:scheduled
                  delays:delays
      notificationCenter:[NSNotificationCenter new]];
  __block NSUInteger deallocationCount = 0;
  __weak AURAMatteLifetimeProbe *weakHair = nil;
  AURATransientMatteLease *first = nil;
  AURATransientMatteLease *second = nil;

  @autoreleasepool {
    AURAMatteLifetimeProbe *hair = [AURAMatteLifetimeProbe new];
    hair.onDealloc = ^{ deallocationCount += 1; };
    weakHair = hair;
    NSString *token = [store storeHairMatte:hair skinMatte:nil ttlSeconds:10];
    first = [store borrowToken:token];
    second = [store borrowToken:token];
    [store discardToken:token];
    hair = nil;
  }

  XCTAssertNotNil(weakHair);
  first = nil;
  XCTAssertNotNil(weakHair);
  second = nil;
  XCTAssertNil(weakHair);
  XCTAssertEqual(deallocationCount, 1u);
}

- (void)testTTLClampHardEvictionAndNotifications
{
  __block NSTimeInterval now = 0;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  NSNotificationCenter *notifications = [NSNotificationCenter new];
  AURATransientMatteStore *store =
      [self storeWithNow:^NSTimeInterval { return now; }
               scheduled:scheduled
                  delays:delays
      notificationCenter:notifications];
  NSString *token = [store storeHairMatte:[NSObject new]
                                 skinMatte:[NSObject new]
                                ttlSeconds:600];
  XCTAssertEqualWithAccuracy(delays.lastObject.doubleValue, 60, 1e-12);
  now = 61;
  scheduled.lastObject();
  XCTAssertNil([store borrowToken:token]);

  [store storeHairMatte:[NSObject new] skinMatte:nil ttlSeconds:10];
  [notifications postNotificationName:UIApplicationDidEnterBackgroundNotification
                                object:nil];
  XCTAssertEqual(store.entryCount, 0u);

  [store storeHairMatte:nil skinMatte:[NSObject new] ttlSeconds:10];
  [notifications postNotificationName:UIApplicationDidReceiveMemoryWarningNotification
                                object:nil];
  XCTAssertEqual(store.entryCount, 0u);
}

- (void)testHardEvictionReadsClockAfterAcquiringStateQueue
{
  char queueSpecificStorage = 0;
  void *queueSpecificKey = &queueSpecificStorage;
  __block BOOL distinguishQueueOwnership = NO;
  NSMutableArray<dispatch_block_t> *scheduled = [NSMutableArray array];
  NSMutableArray<NSNumber *> *delays = [NSMutableArray array];
  AURATransientMatteStore *store =
      [self storeWithNow:^NSTimeInterval {
        if (!distinguishQueueOwnership) {
          return 0;
        }
        // A pre-lock read observes the stale value. A read serialized with
        // entry state observes that the hard deadline has already passed.
        return dispatch_get_specific(queueSpecificKey) ? 61 : 59;
      }
               scheduled:scheduled
                  delays:delays
      notificationCenter:[NSNotificationCenter new]];
  NSString *token = [store storeHairMatte:[NSObject new]
                                 skinMatte:nil
                                ttlSeconds:60];
  dispatch_queue_t stateQueue = [store valueForKey:@"stateQueue"];
  XCTAssertNotNil(stateQueue);
  dispatch_queue_set_specific(
      stateQueue, queueSpecificKey, queueSpecificKey, NULL);

  distinguishQueueOwnership = YES;
  XCTAssertEqual(scheduled.count, 1u);
  scheduled.lastObject();

  // The stale pre-lock implementation scheduled one extra second instead of
  // performing the already-due hard eviction.
  XCTAssertEqual(scheduled.count, 1u);
  XCTAssertEqual(store.entryCount, 0u);
  XCTAssertNil([store borrowToken:token]);
  dispatch_queue_set_specific(stateQueue, queueSpecificKey, NULL, NULL);
}

@end
