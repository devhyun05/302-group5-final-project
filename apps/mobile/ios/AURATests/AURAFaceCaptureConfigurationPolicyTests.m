#import <AVFoundation/AVFoundation.h>
#import <XCTest/XCTest.h>

#import "AURAFaceCaptureConfigurationPolicy.h"

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

@end
