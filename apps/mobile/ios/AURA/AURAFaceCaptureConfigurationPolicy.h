#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT AVCaptureSessionPreset AURAFaceCapturePresetForCapabilities(
    BOOL transientDepthCaptureRequested,
    BOOL semanticMatteCaptureRequested,
    BOOL depthAvailableAt720p,
    BOOL hairMatteAvailableAt720p,
    BOOL skinMatteAvailableAt720p,
    BOOL photoPresetAvailable);

NS_ASSUME_NONNULL_END
