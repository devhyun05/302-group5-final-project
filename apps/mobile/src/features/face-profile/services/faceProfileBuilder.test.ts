import {parseFaceProfile} from './faceProfileContract';
import {buildFaceProfileGeometryFixture} from './faceProfileGeometry.testFixtures';
import {
  buildFaceProfile,
  normalizeFaceCaptureQualitySnapshot,
} from './faceProfileBuilder';
import {analyzePersonalColor} from '../../personal-color/services/personalColorCore/engine';
import {requireFixture} from '../../personal-color/services/personalColorCore/fixtureInventory';

const CAPTURE_ID = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = '2026-07-12T12:00:00.000Z';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function completeCameraSnapshot() {
  return {
    cameraStability: 0.96,
    capturedAt: CREATED_AT,
    centerOffsetX: 0.01,
    centerOffsetY: -0.02,
    centeredScore: 0.95,
    faceCount: 1,
    framingScore: 0.93,
    pitchDeg: 0,
    rollDeg: 0,
    screenCoverageRatio: 0.46,
    source: 'camera' as const,
    yawDeg: 0,
    nativeCameraMetadata: {
      exposureDurationMs: 8,
      isStable: true,
      iso: 80,
      lensPosition: 0.72,
      status: 'ok' as const,
      whiteBalanceGains: {blue: 1.1, green: 1, red: 1.08},
    },
  };
}

const geometryFixture = buildFaceProfileGeometryFixture('oval');
const colorFixture = requireFixture('light_cool_summer_pixel_quality').native;
const personalColor = analyzePersonalColor(colorFixture, {
  calibrationApplied: true,
  calibrationVersion: 'cal-v1',
  frameCount: 3,
});

const normalizedSnapshot = normalizeFaceCaptureQualitySnapshot({
  capturedAt: CREATED_AT,
  faceCount: 1,
  guide: {height: 400, width: 300},
  report: {
    cameraStabilityGreenlight: true,
    failureReasons: [],
    finalCaptureGreenlight: true,
    mediaPipeAlignmentGreenlight: true,
    message: 'ready',
    metrics: {
      centerOffsetPx: 15,
      centerOffsetYPx: -20,
      faceWidthRatio: 0.46,
      pitchDeg: 2,
      rollDeg: -1,
      yawDeg: 3,
    },
    nativeCameraMetadata: {
      exposureDurationMs: 8,
      isStable: 0.9,
      iso: 80,
      status: 'ok',
      whiteBalanceGains: {blue: 1.1, green: 1, red: 1.08},
    },
  },
});
expect(normalizedSnapshot.centerOffsetX === 0.05, 'center X is guide normalized');
expect(normalizedSnapshot.centerOffsetY === -0.05, 'center Y is guide normalized');
expect(normalizedSnapshot.faceCount === 1, 'camera face count is preserved');
expect(normalizedSnapshot.nativeCameraMetadata?.iso === 80, 'ISO is preserved');

const full = buildFaceProfile({
  captureId: CAPTURE_ID,
  captureQualitySnapshot: completeCameraSnapshot(),
  createdAt: CREATED_AT,
  depth: {consumed: false, status: 'unsupported'},
  faceCount: 1,
  imageHeight: geometryFixture.imageHeight,
  imageWidth: geometryFixture.imageWidth,
  landmarks: geometryFixture.landmarks,
  mirrored: false,
  nativePersonalColor: colorFixture,
  personalColor,
  pose: geometryFixture.pose,
  verticalThirds: geometryFixture.hairline ?? null,
});

expect(full.status === 'full_success', 'complete 2D data may be full_success without depth');
expect(full.statusReason === null, 'full profile has no status reason');
expect(full.faceShape.classifierType === 'rule_v1', 'rule classifier is preserved');
expect(full.provenance.trueDepthUsed === false, 'unsupported depth uses 2D provenance');
expect(full.provenance.trainingUseAllowed === false, 'training use stays disabled');
expect(parseFaceProfile(full) !== null, 'full profile satisfies the public contract');
expect(
  JSON.stringify(full) === JSON.stringify(buildFaceProfile({
    captureId: CAPTURE_ID,
    captureQualitySnapshot: completeCameraSnapshot(),
    createdAt: CREATED_AT,
    depth: {consumed: false, status: 'unsupported'},
    faceCount: 1,
    imageHeight: geometryFixture.imageHeight,
    imageWidth: geometryFixture.imageWidth,
    landmarks: geometryFixture.landmarks,
    mirrored: false,
    nativePersonalColor: colorFixture,
    personalColor,
    pose: geometryFixture.pose,
    verticalThirds: geometryFixture.hairline ?? null,
  })),
  'BeautyCoreFeatures and the profile are deterministic',
);

const serialized = JSON.stringify(full).toLowerCase();
for (const forbidden of ['landmarks', 'nativedepthtoken', 'nativemattetoken', 'depthmap']) {
  expect(!serialized.includes(forbidden), `profile must not retain ${forbidden}`);
}

const gallery = buildFaceProfile({
  captureId: CAPTURE_ID,
  captureQualitySnapshot: null,
  createdAt: CREATED_AT,
  depth: {consumed: false, status: 'unsupported'},
  faceCount: 1,
  imageHeight: geometryFixture.imageHeight,
  imageWidth: geometryFixture.imageWidth,
  landmarks: geometryFixture.landmarks,
  mirrored: false,
  nativePersonalColor: colorFixture,
  personalColor,
  pose: geometryFixture.pose,
  verticalThirds: geometryFixture.hairline ?? null,
});
expect(gallery.status === 'partial_success', 'gallery metadata absence is partial');
expect(
  gallery.quality.cameraStability.nullReason === 'camera_metadata_unavailable',
  'gallery never fabricates camera stability',
);
expect(
  gallery.quality.screenCoverageRatio.nullReason === 'camera_metadata_unavailable',
  'gallery never fabricates camera framing',
);

const noHairline = buildFaceProfile({
  captureId: CAPTURE_ID,
  captureQualitySnapshot: completeCameraSnapshot(),
  createdAt: CREATED_AT,
  depth: {consumed: false, status: 'expired'},
  faceCount: 1,
  imageHeight: geometryFixture.imageHeight,
  imageWidth: geometryFixture.imageWidth,
  landmarks: geometryFixture.landmarks,
  mirrored: false,
  nativePersonalColor: colorFixture,
  personalColor,
  pose: geometryFixture.pose,
  verticalThirds: null,
});
expect(noHairline.status === 'partial_success', 'missing hairline remains a partial result');
expect(
  noHairline.quality.hairlineConfidence.nullReason === 'hairline_unavailable',
  'missing hairline is explicit',
);

const multipleFaces = buildFaceProfile({
  captureId: CAPTURE_ID,
  captureQualitySnapshot: {...completeCameraSnapshot(), faceCount: 2},
  createdAt: CREATED_AT,
  depth: null,
  faceCount: 2,
  imageHeight: geometryFixture.imageHeight,
  imageWidth: geometryFixture.imageWidth,
  landmarks: geometryFixture.landmarks,
  mirrored: false,
  nativePersonalColor: colorFixture,
  personalColor,
  pose: geometryFixture.pose,
  verticalThirds: geometryFixture.hairline ?? null,
});
expect(multipleFaces.status === 'blocked', 'multiple faces are blocked');
expect(
  multipleFaces.quality.blockingReasons.includes('multiple_faces'),
  'multiple face reason is preserved',
);

const nullPose = buildFaceProfile({
  captureId: CAPTURE_ID,
  captureQualitySnapshot: completeCameraSnapshot(),
  createdAt: CREATED_AT,
  depth: null,
  faceCount: 1,
  imageHeight: geometryFixture.imageHeight,
  imageWidth: geometryFixture.imageWidth,
  landmarks: geometryFixture.landmarks,
  mirrored: false,
  nativePersonalColor: colorFixture,
  personalColor,
  pose: null,
  verticalThirds: geometryFixture.hairline ?? null,
});
expect(nullPose.status === 'blocked', 'null pose is blocked');
expect(
  nullPose.quality.blockingReasons.includes('pose_unavailable'),
  'null pose reason is preserved',
);

console.log('faceProfileBuilder tests passed');
