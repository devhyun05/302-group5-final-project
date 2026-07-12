#import "AURATransientMatteStore.h"

#import <CommonCrypto/CommonDigest.h>
#import <UIKit/UIKit.h>
#import <math.h>

static const NSTimeInterval AURAMaximumMatteTTLSeconds = 60.0;

@interface AURATransientMatteLease ()

@property(nonatomic, strong, readwrite, nullable) id hairMatte;
@property(nonatomic, strong, readwrite, nullable) id skinMatte;

- (instancetype)initWithHairMatte:(nullable id)hairMatte
                        skinMatte:(nullable id)skinMatte;

@end


@implementation AURATransientMatteLease

- (instancetype)initWithHairMatte:(id)hairMatte skinMatte:(id)skinMatte
{
  self = [super init];
  if (self) {
    _hairMatte = hairMatte;
    _skinMatte = skinMatte;
  }
  return self;
}

@end


@interface AURATransientMatteEntry : NSObject

@property(nonatomic, strong, nullable) id hairMatte;
@property(nonatomic, strong, nullable) id skinMatte;
@property(nonatomic) NSTimeInterval expiresAt;
@property(nonatomic) uint64_t generation;

@end


@implementation AURATransientMatteEntry
@end


static NSData *AURAMatteTokenDigest(NSString *token)
{
  if (token.length == 0) {
    return nil;
  }

  NSData *tokenData = [token dataUsingEncoding:NSUTF8StringEncoding];
  if (tokenData.length == 0) {
    return nil;
  }

  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(tokenData.bytes, (CC_LONG)tokenData.length, digest);
  return [NSData dataWithBytes:digest length:sizeof(digest)];
}

static NSTimeInterval AURAClampedMatteTTL(NSTimeInterval requestedTTL)
{
  if (isnan(requestedTTL) || requestedTTL <= 0) {
    return 0;
  }
  if (!isfinite(requestedTTL) || requestedTTL > AURAMaximumMatteTTLSeconds) {
    return AURAMaximumMatteTTLSeconds;
  }
  return requestedTTL;
}


@interface AURATransientMatteStore ()

@property(nonatomic, copy) AURATransientMatteNowProvider nowProvider;
@property(nonatomic, copy) AURATransientMatteScheduler scheduler;
@property(nonatomic, strong) NSNotificationCenter *notificationCenter;
@property(nonatomic, strong) NSMutableDictionary<NSData *, AURATransientMatteEntry *> *entries;
@property(nonatomic, strong) dispatch_queue_t stateQueue;
@property(nonatomic) uint64_t nextGeneration;

@end


@implementation AURATransientMatteStore

+ (instancetype)sharedStore
{
  static AURATransientMatteStore *store;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    store = [[self alloc] init];
  });
  return store;
}

- (instancetype)init
{
  AURATransientMatteNowProvider nowProvider = ^NSTimeInterval {
    return NSProcessInfo.processInfo.systemUptime;
  };
  AURATransientMatteScheduler scheduler = ^(NSTimeInterval delay,
                                             dispatch_block_t block) {
    int64_t nanoseconds = (int64_t)(MAX(0, delay) * NSEC_PER_SEC);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, nanoseconds),
                   dispatch_get_global_queue(QOS_CLASS_UTILITY, 0),
                   block);
  };
  return [self initWithNowProvider:nowProvider
                        scheduler:scheduler
               notificationCenter:NSNotificationCenter.defaultCenter];
}

- (instancetype)initWithNowProvider:(AURATransientMatteNowProvider)nowProvider
                           scheduler:(AURATransientMatteScheduler)scheduler
                  notificationCenter:(NSNotificationCenter *)notificationCenter
{
  self = [super init];
  if (self) {
    if (nowProvider) {
      _nowProvider = [nowProvider copy];
    } else {
      _nowProvider = ^NSTimeInterval {
        return NSProcessInfo.processInfo.systemUptime;
      };
    }
    if (scheduler) {
      _scheduler = [scheduler copy];
    } else {
      _scheduler = ^(NSTimeInterval delay, dispatch_block_t block) {
        int64_t nanoseconds = (int64_t)(MAX(0, delay) * NSEC_PER_SEC);
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, nanoseconds),
                       dispatch_get_global_queue(QOS_CLASS_UTILITY, 0),
                       block);
      };
    }
    _notificationCenter = notificationCenter ?: NSNotificationCenter.defaultCenter;
    _entries = [NSMutableDictionary dictionary];
    _stateQueue = dispatch_queue_create("com.aura.transient-matte-store",
                                        DISPATCH_QUEUE_SERIAL);
    _nextGeneration = 1;

    [_notificationCenter addObserver:self
                             selector:@selector(handleDiscardNotification:)
                                 name:UIApplicationDidEnterBackgroundNotification
                               object:nil];
    [_notificationCenter addObserver:self
                             selector:@selector(handleDiscardNotification:)
                                 name:UIApplicationDidReceiveMemoryWarningNotification
                               object:nil];
  }
  return self;
}

- (void)dealloc
{
  [_notificationCenter removeObserver:self];
}

- (NSString *)storeHairMatte:(id)hairMatte
                   skinMatte:(id)skinMatte
                  ttlSeconds:(NSTimeInterval)ttlSeconds
{
  if (!hairMatte && !skinMatte) {
    return nil;
  }

  NSString *token = NSUUID.UUID.UUIDString;
  NSData *tokenDigest = AURAMatteTokenDigest(token);
  if (!tokenDigest) {
    return nil;
  }

  NSTimeInterval ttl = AURAClampedMatteTTL(ttlSeconds);
  __block uint64_t generation = 0;
  dispatch_sync(self.stateQueue, ^{
    generation = self.nextGeneration;
    self.nextGeneration += 1;

    AURATransientMatteEntry *entry = [AURATransientMatteEntry new];
    entry.hairMatte = hairMatte;
    entry.skinMatte = skinMatte;
    entry.expiresAt = self.nowProvider() + ttl;
    entry.generation = generation;
    self.entries[tokenDigest] = entry;
  });

  [self scheduleEvictionForDigest:tokenDigest generation:generation delay:ttl];
  return token;
}

- (AURATransientMatteLease *)borrowToken:(NSString *)token
{
  NSData *tokenDigest = AURAMatteTokenDigest(token);
  if (!tokenDigest) {
    return nil;
  }

  __block AURATransientMatteLease *lease = nil;
  dispatch_sync(self.stateQueue, ^{
    NSTimeInterval now = self.nowProvider();
    AURATransientMatteEntry *entry = self.entries[tokenDigest];
    if (!entry) {
      return;
    }
    if (now >= entry.expiresAt) {
      [self.entries removeObjectForKey:tokenDigest];
      return;
    }
    lease = [[AURATransientMatteLease alloc] initWithHairMatte:entry.hairMatte
                                                    skinMatte:entry.skinMatte];
  });
  return lease;
}

- (BOOL)discardToken:(NSString *)token
{
  NSData *tokenDigest = AURAMatteTokenDigest(token);
  if (!tokenDigest) {
    return NO;
  }

  __block BOOL discarded = NO;
  dispatch_sync(self.stateQueue, ^{
    discarded = self.entries[tokenDigest] != nil;
    [self.entries removeObjectForKey:tokenDigest];
  });
  return discarded;
}

- (void)discardAll
{
  dispatch_sync(self.stateQueue, ^{
    [self.entries removeAllObjects];
  });
}

- (NSUInteger)entryCount
{
  __block NSUInteger count = 0;
  dispatch_sync(self.stateQueue, ^{
    NSTimeInterval now = self.nowProvider();
    NSMutableArray<NSData *> *expiredDigests = [NSMutableArray array];
    [self.entries enumerateKeysAndObjectsUsingBlock:^(
                      NSData *digest,
                      AURATransientMatteEntry *entry,
                      BOOL *stop) {
      (void)stop;
      if (now >= entry.expiresAt) {
        [expiredDigests addObject:digest];
      }
    }];
    [self.entries removeObjectsForKeys:expiredDigests];
    count = self.entries.count;
  });
  return count;
}

- (void)handleDiscardNotification:(NSNotification *)notification
{
  (void)notification;
  [self discardAll];
}

- (void)scheduleEvictionForDigest:(NSData *)tokenDigest
                       generation:(uint64_t)generation
                            delay:(NSTimeInterval)delay
{
  __weak AURATransientMatteStore *weakSelf = self;
  self.scheduler(delay, ^{
    [weakSelf evictDigest:tokenDigest generation:generation];
  });
}

- (void)evictDigest:(NSData *)tokenDigest generation:(uint64_t)generation
{
  __block NSTimeInterval remaining = 0;
  dispatch_sync(self.stateQueue, ^{
    // Read the monotonic clock only after acquiring the state queue. A value
    // captured while waiting could reschedule an already-expired payload.
    NSTimeInterval now = self.nowProvider();
    AURATransientMatteEntry *entry = self.entries[tokenDigest];
    if (!entry || entry.generation != generation) {
      return;
    }
    if (now >= entry.expiresAt) {
      [self.entries removeObjectForKey:tokenDigest];
      return;
    }
    remaining = entry.expiresAt - now;
  });

  if (remaining > 0) {
    [self scheduleEvictionForDigest:tokenDigest
                         generation:generation
                              delay:remaining];
  }
}

@end
