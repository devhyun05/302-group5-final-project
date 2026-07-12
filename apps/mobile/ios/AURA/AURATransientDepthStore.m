#import "AURATransientDepthStore.h"

#import <AVFoundation/AVFoundation.h>
#import <CommonCrypto/CommonDigest.h>
#import <ImageIO/ImageIO.h>
#import <UIKit/UIKit.h>
#import <math.h>

NSString *const AURATransientDepthStatusOK = @"ok";
NSString *const AURATransientDepthStatusExpired = @"expired";
NSString *const AURATransientDepthStatusNotFound = @"not_found";

static const NSTimeInterval kAURATransientDepthMaximumTTL = 60.0;
static const NSTimeInterval kAURATransientDepthTombstoneTTL = 60.0;

@interface AURATransientDepthPayload ()
@property(nonatomic, strong, readwrite) id depthData;
@property(nonatomic, assign, readwrite) CGSize photoPixelSize;
@property(nonatomic, assign, readwrite) NSInteger orientation;
@property(nonatomic, assign, readwrite, getter=isMirrored) BOOL mirrored;
- (instancetype)initWithDepthData:(id)depthData
                    photoPixelSize:(CGSize)photoPixelSize
                        orientation:(NSInteger)orientation
                           mirrored:(BOOL)mirrored;
@end

@implementation AURATransientDepthPayload

- (instancetype)initWithDepthData:(id)depthData
                    photoPixelSize:(CGSize)photoPixelSize
                        orientation:(NSInteger)orientation
                           mirrored:(BOOL)mirrored
{
  self = [super init];
  if (self) {
    _depthData = depthData;
    _photoPixelSize = photoPixelSize;
    _orientation = orientation;
    _mirrored = mirrored;
  }
  return self;
}

@end

@interface AURATransientDepthAnalysisContext ()
@property(atomic, strong, readwrite, nullable) AURATransientDepthPayload *payload;
@property(atomic, assign, readwrite, getter=isCancelled) BOOL cancelled;
- (instancetype)initWithPayload:(AURATransientDepthPayload *)payload;
@end

@implementation AURATransientDepthAnalysisContext

- (instancetype)initWithPayload:(AURATransientDepthPayload *)payload
{
  self = [super init];
  if (self) {
    _payload = payload;
    _cancelled = NO;
  }
  return self;
}

@end

@interface AURATransientDepthConsumeResult ()
@property(nonatomic, copy, readwrite) NSString *status;
@property(nonatomic, assign, readwrite, getter=isConsumed) BOOL consumed;
@property(nonatomic, strong, readwrite, nullable) AURATransientDepthPayload *payload;
@property(nonatomic, strong, readwrite, nullable)
    AURATransientDepthAnalysisContext *analysisContext;
+ (instancetype)resultWithStatus:(NSString *)status
                        consumed:(BOOL)consumed
                         payload:(nullable AURATransientDepthPayload *)payload
                 analysisContext:(nullable AURATransientDepthAnalysisContext *)context;
@end

@implementation AURATransientDepthConsumeResult

+ (instancetype)resultWithStatus:(NSString *)status
                        consumed:(BOOL)consumed
                         payload:(AURATransientDepthPayload *)payload
                 analysisContext:(AURATransientDepthAnalysisContext *)context
{
  AURATransientDepthConsumeResult *result = [self new];
  result.status = status;
  result.consumed = consumed;
  result.payload = payload;
  result.analysisContext = context;
  return result;
}

@end

@interface AURATransientDepthEntry : NSObject
@property(nonatomic, strong) AURATransientDepthPayload *payload;
@property(nonatomic, assign) NSTimeInterval expiresAt;
@property(nonatomic, assign) NSUInteger generation;
@end

@implementation AURATransientDepthEntry
@end

@interface AURATransientDepthTombstone : NSObject
@property(nonatomic, assign) NSTimeInterval expiresAt;
@property(nonatomic, assign) NSUInteger generation;
@end

@implementation AURATransientDepthTombstone
@end

@interface AURATransientDepthStore ()
@property(nonatomic, strong) dispatch_queue_t stateQueue;
@property(nonatomic, strong) NSMutableDictionary<NSString *, AURATransientDepthEntry *> *entries;
@property(nonatomic, strong) NSMutableDictionary<NSString *, AURATransientDepthTombstone *> *tombstones;
@property(nonatomic, strong) NSMutableDictionary<NSString *, AURATransientDepthAnalysisContext *> *activeAnalyses;
@property(nonatomic, copy) AURATransientDepthNowProvider nowProvider;
@property(nonatomic, copy) AURATransientDepthScheduler scheduler;
@property(nonatomic, copy) AURATransientDepthConverter depthConverter;
@property(nonatomic, strong) NSNotificationCenter *notificationCenter;
@property(nonatomic, strong) NSArray<id> *notificationObservers;
@property(nonatomic, assign) NSUInteger nextGeneration;
@end

@implementation AURATransientDepthStore

+ (instancetype)sharedStore
{
  static AURATransientDepthStore *store;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    store = [[self alloc]
        initWithNowProvider:^NSTimeInterval {
          return NSProcessInfo.processInfo.systemUptime;
        }
        scheduler:^(NSTimeInterval delay, dispatch_block_t block) {
          int64_t nanoseconds = (int64_t)(MAX(0, delay) * NSEC_PER_SEC);
          dispatch_after(
              dispatch_time(DISPATCH_TIME_NOW, nanoseconds),
              dispatch_get_global_queue(QOS_CLASS_UTILITY, 0),
              block);
        }
        notificationCenter:NSNotificationCenter.defaultCenter
        depthConverter:^id _Nullable(id value) {
          if (![value isKindOfClass:[AVDepthData class]]) {
            return nil;
          }
          AVDepthData *depthData = value;
          if (depthData.depthDataType == kCVPixelFormatType_DepthFloat32) {
            return depthData;
          }
          if (![depthData.availableDepthDataTypes
                  containsObject:@(kCVPixelFormatType_DepthFloat32)]) {
            return nil;
          }
          return [depthData depthDataByConvertingToDepthDataType:
                                    kCVPixelFormatType_DepthFloat32];
        }];
  });
  return store;
}

- (instancetype)initWithNowProvider:(AURATransientDepthNowProvider)nowProvider
                           scheduler:(AURATransientDepthScheduler)scheduler
                  notificationCenter:(NSNotificationCenter *)notificationCenter
                      depthConverter:(AURATransientDepthConverter)depthConverter
{
  self = [super init];
  if (self) {
    _stateQueue = dispatch_queue_create(
        "com.aura.transient-depth-store.state",
        DISPATCH_QUEUE_SERIAL);
    _entries = [NSMutableDictionary dictionary];
    _tombstones = [NSMutableDictionary dictionary];
    _activeAnalyses = [NSMutableDictionary dictionary];
    _nowProvider = [nowProvider copy];
    _scheduler = [scheduler copy];
    _depthConverter = [depthConverter copy];
    _notificationCenter = notificationCenter;
    _nextGeneration = 1;

    __weak typeof(self) weakSelf = self;
    id backgroundObserver = [notificationCenter
        addObserverForName:UIApplicationDidEnterBackgroundNotification
                    object:nil
                     queue:nil
                usingBlock:^(__unused NSNotification *notification) {
                  [weakSelf discardAll];
                }];
    id memoryObserver = [notificationCenter
        addObserverForName:UIApplicationDidReceiveMemoryWarningNotification
                    object:nil
                     queue:nil
                usingBlock:^(__unused NSNotification *notification) {
                  [weakSelf discardAll];
                }];
    _notificationObservers = @[ backgroundObserver, memoryObserver ];
  }
  return self;
}

- (void)dealloc
{
  for (id observer in _notificationObservers) {
    [_notificationCenter removeObserver:observer];
  }
}

static NSString *AURATransientDepthHashToken(NSString *token)
{
  if (![token isKindOfClass:[NSString class]] || token.length == 0) {
    return nil;
  }
  NSData *data = [token dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return nil;
  }
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *result = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (NSUInteger index = 0; index < CC_SHA256_DIGEST_LENGTH; index++) {
    [result appendFormat:@"%02x", digest[index]];
  }
  return result;
}

static NSTimeInterval AURATransientDepthClampedTTL(NSTimeInterval ttl)
{
  if (!isfinite(ttl) || ttl <= 0) {
    return 0;
  }
  return MIN(ttl, kAURATransientDepthMaximumTTL);
}

static CGSize AURATransientDepthUprightPixelSize(
    CGSize pixelSize,
    NSInteger orientation)
{
  if (orientation >= 5 && orientation <= 8) {
    return CGSizeMake(pixelSize.height, pixelSize.width);
  }
  return pixelSize;
}

- (nullable NSString *)storeDepthData:(id)depthData
                       photoPixelSize:(CGSize)photoPixelSize
                           orientation:(NSInteger)orientation
                              mirrored:(BOOL)mirrored
                             ttlSeconds:(NSTimeInterval)ttlSeconds
{
  return [self storeDepthData:depthData
                photoPixelSize:photoPixelSize
                    orientation:orientation
                       mirrored:mirrored
                      ttlSeconds:ttlSeconds
              applyOrientation:YES];
}

- (nullable NSString *)storeSyntheticDepthData:(id)depthData
                                photoPixelSize:(CGSize)photoPixelSize
                                    orientation:(NSInteger)orientation
                                       mirrored:(BOOL)mirrored
                                      ttlSeconds:(NSTimeInterval)ttlSeconds
{
  return [self storeDepthData:depthData
                photoPixelSize:photoPixelSize
                    orientation:orientation
                       mirrored:mirrored
                      ttlSeconds:ttlSeconds
              applyOrientation:NO];
}

- (nullable NSString *)storeDepthData:(id)depthData
                       photoPixelSize:(CGSize)photoPixelSize
                           orientation:(NSInteger)orientation
                              mirrored:(BOOL)mirrored
                             ttlSeconds:(NSTimeInterval)ttlSeconds
                     applyOrientation:(BOOL)applyOrientation
{
  id convertedDepth = nil;
  __unsafe_unretained id conversionInput = depthData;
  AURATransientDepthConverter converter = self.depthConverter;
  @try {
    convertedDepth = converter(conversionInput);
    if (applyOrientation &&
        [convertedDepth isKindOfClass:[AVDepthData class]] &&
        orientation >= 1 && orientation <= 8 && orientation != 1) {
      convertedDepth = [(AVDepthData *)convertedDepth
          depthDataByApplyingExifOrientation:(CGImagePropertyOrientation)orientation];
    }
  } @catch (__unused NSException *exception) {
    convertedDepth = nil;
  }
  if (!convertedDepth) {
    return nil;
  }

  NSInteger payloadOrientation = applyOrientation ? 1 : orientation;
  CGSize payloadPixelSize = applyOrientation
      ? AURATransientDepthUprightPixelSize(photoPixelSize, orientation)
      : photoPixelSize;
  AURATransientDepthPayload *payload = [[AURATransientDepthPayload alloc]
      initWithDepthData:convertedDepth
          photoPixelSize:payloadPixelSize
              orientation:payloadOrientation
                 mirrored:mirrored];
  NSString *token = NSUUID.UUID.UUIDString;
  NSString *hashedToken = AURATransientDepthHashToken(token);
  NSTimeInterval ttl = AURATransientDepthClampedTTL(ttlSeconds);
  __block NSUInteger generation = 0;

  dispatch_sync(self.stateQueue, ^{
    generation = self.nextGeneration++;
    AURATransientDepthEntry *entry = [AURATransientDepthEntry new];
    entry.payload = payload;
    entry.expiresAt = self.nowProvider() + ttl;
    entry.generation = generation;
    self.entries[hashedToken] = entry;
    [self.tombstones removeObjectForKey:hashedToken];
  });

  __weak typeof(self) weakSelf = self;
  self.scheduler(ttl, ^{
    [weakSelf evictHashedToken:hashedToken generation:generation];
  });
  return token;
}

- (void)evictHashedToken:(NSString *)hashedToken generation:(NSUInteger)generation
{
  __block BOOL createdTombstone = NO;
  __block NSUInteger tombstoneGeneration = 0;
  dispatch_sync(self.stateQueue, ^{
    AURATransientDepthEntry *entry = self.entries[hashedToken];
    if (!entry || entry.generation != generation) {
      return;
    }
    NSTimeInterval now = self.nowProvider();
    if (now < entry.expiresAt) {
      return;
    }
    [self.entries removeObjectForKey:hashedToken];
    tombstoneGeneration = self.nextGeneration++;
    AURATransientDepthTombstone *tombstone = [AURATransientDepthTombstone new];
    tombstone.expiresAt = now + kAURATransientDepthTombstoneTTL;
    tombstone.generation = tombstoneGeneration;
    self.tombstones[hashedToken] = tombstone;
    createdTombstone = YES;
  });
  if (createdTombstone) {
    [self scheduleTombstoneRemovalForHashedToken:hashedToken
                                      generation:tombstoneGeneration];
  }
}

- (void)scheduleTombstoneRemovalForHashedToken:(NSString *)hashedToken
                                     generation:(NSUInteger)generation
{
  __weak typeof(self) weakSelf = self;
  self.scheduler(kAURATransientDepthTombstoneTTL, ^{
    AURATransientDepthStore *strongSelf = weakSelf;
    if (!strongSelf) {
      return;
    }
    dispatch_sync(strongSelf.stateQueue, ^{
      AURATransientDepthTombstone *tombstone = strongSelf.tombstones[hashedToken];
      if (tombstone.generation == generation &&
          strongSelf.nowProvider() >= tombstone.expiresAt) {
        [strongSelf.tombstones removeObjectForKey:hashedToken];
      }
    });
  });
}

- (AURATransientDepthConsumeResult *)consumeToken:(NSString *)token
{
  return [self takeToken:token registerAnalysis:NO];
}

- (AURATransientDepthConsumeResult *)beginAnalysisWithToken:(NSString *)token
{
  return [self takeToken:token registerAnalysis:YES];
}

- (AURATransientDepthConsumeResult *)takeToken:(NSString *)token
                               registerAnalysis:(BOOL)registerAnalysis
{
  NSString *hashedToken = AURATransientDepthHashToken(token);
  if (!hashedToken) {
    return [AURATransientDepthConsumeResult
        resultWithStatus:AURATransientDepthStatusNotFound
                consumed:NO
                 payload:nil
         analysisContext:nil];
  }

  __block AURATransientDepthPayload *payload = nil;
  __block AURATransientDepthAnalysisContext *context = nil;
  __block NSString *status = AURATransientDepthStatusNotFound;
  __block BOOL createdTombstone = NO;
  __block NSUInteger tombstoneGeneration = 0;
  dispatch_sync(self.stateQueue, ^{
    NSTimeInterval now = self.nowProvider();
    AURATransientDepthTombstone *existingTombstone = self.tombstones[hashedToken];
    if (existingTombstone && now >= existingTombstone.expiresAt) {
      [self.tombstones removeObjectForKey:hashedToken];
      existingTombstone = nil;
    }

    AURATransientDepthEntry *entry = self.entries[hashedToken];
    if (!entry) {
      status = existingTombstone
          ? AURATransientDepthStatusExpired
          : AURATransientDepthStatusNotFound;
      return;
    }
    [self.entries removeObjectForKey:hashedToken];
    if (now >= entry.expiresAt) {
      status = AURATransientDepthStatusExpired;
      tombstoneGeneration = self.nextGeneration++;
      AURATransientDepthTombstone *tombstone = [AURATransientDepthTombstone new];
      tombstone.expiresAt = now + kAURATransientDepthTombstoneTTL;
      tombstone.generation = tombstoneGeneration;
      self.tombstones[hashedToken] = tombstone;
      createdTombstone = YES;
      return;
    }

    status = AURATransientDepthStatusOK;
    payload = entry.payload;
    if (registerAnalysis) {
      context = [[AURATransientDepthAnalysisContext alloc] initWithPayload:payload];
      self.activeAnalyses[hashedToken] = context;
    }
  });

  if (createdTombstone) {
    [self scheduleTombstoneRemovalForHashedToken:hashedToken
                                      generation:tombstoneGeneration];
  }
  BOOL consumed = [status isEqualToString:AURATransientDepthStatusOK];
  return [AURATransientDepthConsumeResult
      resultWithStatus:status
              consumed:consumed
               payload:registerAnalysis ? nil : payload
       analysisContext:context];
}

- (void)endAnalysisForToken:(NSString *)token
{
  NSString *hashedToken = AURATransientDepthHashToken(token);
  if (!hashedToken) {
    return;
  }
  dispatch_sync(self.stateQueue, ^{
    AURATransientDepthAnalysisContext *context = self.activeAnalyses[hashedToken];
    context.payload = nil;
    [self.activeAnalyses removeObjectForKey:hashedToken];
  });
}

- (BOOL)discardToken:(NSString *)token
{
  NSString *hashedToken = AURATransientDepthHashToken(token);
  if (!hashedToken) {
    return NO;
  }
  __block BOOL discarded = NO;
  dispatch_sync(self.stateQueue, ^{
    if (self.entries[hashedToken]) {
      [self.entries removeObjectForKey:hashedToken];
      discarded = YES;
    }
    AURATransientDepthAnalysisContext *context = self.activeAnalyses[hashedToken];
    if (context) {
      context.cancelled = YES;
      discarded = YES;
    }
    if (self.tombstones[hashedToken]) {
      [self.tombstones removeObjectForKey:hashedToken];
      discarded = YES;
    }
  });
  return discarded;
}

- (void)discardAll
{
  dispatch_sync(self.stateQueue, ^{
    [self.entries removeAllObjects];
    [self.tombstones removeAllObjects];
    for (AURATransientDepthAnalysisContext *context in
         self.activeAnalyses.allValues) {
      context.cancelled = YES;
    }
  });
}

- (NSUInteger)entryCount
{
  __block NSUInteger count = 0;
  dispatch_sync(self.stateQueue, ^{
    count = self.entries.count;
  });
  return count;
}

- (NSUInteger)activeAnalysisCount
{
  __block NSUInteger count = 0;
  dispatch_sync(self.stateQueue, ^{
    count = self.activeAnalyses.count;
  });
  return count;
}

@end
