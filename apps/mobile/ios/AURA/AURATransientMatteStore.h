#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NSTimeInterval (^AURATransientMatteNowProvider)(void);
typedef void (^AURATransientMatteScheduler)(NSTimeInterval delay,
                                             dispatch_block_t block);

/**
 * A short-lived, reader-owned view of the semantic mattes.
 *
 * Every borrow returns a distinct lease.  The lease keeps its mattes alive even
 * if the store entry is discarded while an analyzer is still using them.
 */
@interface AURATransientMatteLease : NSObject

@property(nonatomic, strong, readonly, nullable) id hairMatte;
@property(nonatomic, strong, readonly, nullable) id skinMatte;

@end

/**
 * In-memory semantic-matte handoff with a maximum lifetime of 60 seconds.
 * Tokens are opaque and are never retained by the store in their raw form.
 */
@interface AURATransientMatteStore : NSObject

@property(nonatomic, readonly) NSUInteger entryCount;

+ (instancetype)sharedStore;

- (instancetype)initWithNowProvider:(AURATransientMatteNowProvider)nowProvider
                           scheduler:(AURATransientMatteScheduler)scheduler
                  notificationCenter:(NSNotificationCenter *)notificationCenter
    NS_DESIGNATED_INITIALIZER;

- (instancetype)init;

- (nullable NSString *)storeHairMatte:(nullable id)hairMatte
                            skinMatte:(nullable id)skinMatte
                           ttlSeconds:(NSTimeInterval)ttlSeconds;

- (nullable AURATransientMatteLease *)borrowToken:(nullable NSString *)token;

- (BOOL)discardToken:(nullable NSString *)token;

- (void)discardAll;

@end

NS_ASSUME_NONNULL_END
