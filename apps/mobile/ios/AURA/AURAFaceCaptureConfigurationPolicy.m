#import "AURAFaceCaptureConfigurationPolicy.h"

AVCaptureSessionPreset AURAFaceCapturePresetForCapabilities(
    BOOL transientDepthCaptureRequested,
    BOOL semanticMatteCaptureRequested,
    BOOL depthAvailableAt720p,
    BOOL hairMatteAvailableAt720p,
    BOOL skinMatteAvailableAt720p,
    BOOL photoPresetAvailable) {
  BOOL depthRequired =
      transientDepthCaptureRequested || semanticMatteCaptureRequested;
  BOOL requestedCapabilityMissing =
      (depthRequired && !depthAvailableAt720p) ||
      (semanticMatteCaptureRequested &&
       (!hairMatteAvailableAt720p || !skinMatteAvailableAt720p));

  if (requestedCapabilityMissing && photoPresetAvailable) {
    return AVCaptureSessionPresetPhoto;
  }
  return AVCaptureSessionPreset1280x720;
}
