#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSString *const AURATransientDepthStatusOK;
FOUNDATION_EXPORT NSString *const AURATransientDepthStatusExpired;
FOUNDATION_EXPORT NSString *const AURATransientDepthStatusNotFound;

// Conversion may throw for malformed AVDepthData. An unsafe parameter avoids
// ARC exception-cleanup retaining a rejected payload beyond this call.
typedef id _Nullable (^AURATransientDepthConverter)(
    __unsafe_unretained id depthData);
typedef NSTimeInterval (^AURATransientDepthNowProvider)(void);
typedef void (^AURATransientDepthScheduler)(
    NSTimeInterval delay,
    dispatch_block_t block);

@interface AURATransientDepthPayload : NSObject

@property(nonatomic, strong, readonly) id depthData;
@property(nonatomic, assign, readonly) CGSize photoPixelSize;
@property(nonatomic, assign, readonly) NSInteger orientation;
@property(nonatomic, assign, readonly, getter=isMirrored) BOOL mirrored;

@end

@interface AURATransientDepthAnalysisContext : NSObject

@property(atomic, strong, readonly, nullable) AURATransientDepthPayload *payload;
@property(atomic, assign, readonly, getter=isCancelled) BOOL cancelled;

@end

@interface AURATransientDepthConsumeResult : NSObject

@property(nonatomic, copy, readonly) NSString *status;
@property(nonatomic, assign, readonly, getter=isConsumed) BOOL consumed;
@property(nonatomic, strong, readonly, nullable) AURATransientDepthPayload *payload;
@property(nonatomic, strong, readonly, nullable)
    AURATransientDepthAnalysisContext *analysisContext;

@end

@interface AURATransientDepthStore : NSObject

@property(nonatomic, assign, readonly) NSUInteger entryCount;
@property(nonatomic, assign, readonly) NSUInteger activeAnalysisCount;

+ (instancetype)sharedStore;

- (instancetype)initWithNowProvider:(AURATransientDepthNowProvider)nowProvider
                           scheduler:(AURATransientDepthScheduler)scheduler
                  notificationCenter:(NSNotificationCenter *)notificationCenter
                      depthConverter:(AURATransientDepthConverter)depthConverter
    NS_DESIGNATED_INITIALIZER;

- (instancetype)init NS_UNAVAILABLE;

- (nullable NSString *)storeDepthData:(id)depthData
                       photoPixelSize:(CGSize)photoPixelSize
                           orientation:(NSInteger)orientation
                              mirrored:(BOOL)mirrored
                             ttlSeconds:(NSTimeInterval)ttlSeconds;

// Test seam for lifecycle verification without requiring camera hardware.
- (nullable NSString *)storeSyntheticDepthData:(id)depthData
                                photoPixelSize:(CGSize)photoPixelSize
                                    orientation:(NSInteger)orientation
                                       mirrored:(BOOL)mirrored
                                      ttlSeconds:(NSTimeInterval)ttlSeconds;

- (AURATransientDepthConsumeResult *)consumeToken:(NSString *)token;
- (AURATransientDepthConsumeResult *)beginAnalysisWithToken:(NSString *)token;
- (void)endAnalysisForToken:(NSString *)token;
- (BOOL)discardToken:(NSString *)token;
- (void)discardAll;

@end

NS_ASSUME_NONNULL_END
