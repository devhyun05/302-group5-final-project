import {parseFaceProfile} from './faceProfileContract';
import {buildFaceProfileGeometryFixture} from './faceProfileGeometry.testFixtures';
import {
  finalizePreparedFaceProfile,
  prepareFaceProfileCapture,
  type FaceProfileDependencies,
} from './faceProfileService';
import {analyzePersonalColor} from '../../personal-color/services/personalColorCore/engine';
import {requireFixture} from '../../personal-color/services/personalColorCore/fixtureInventory';

const CREATED_AT = '2026-07-12T12:00:00.000Z';
const UPLOADED_CAPTURE_ID = '22222222-2222-4222-8222-222222222222';
const geometry = buildFaceProfileGeometryFixture('oval');
const nativeColor = requireFixture('light_cool_summer_pixel_quality').native;
const color = analyzePersonalColor(nativeColor, {
  calibrationApplied: true,
  calibrationVersion: 'cal-v1',
  frameCount: 3,
});
const landmarks = {
  faceCount: 1,
  imageHeight: geometry.imageHeight,
  imageWidth: geometry.imageWidth,
  landmarks: geometry.landmarks.map(point => ({
    ...point,
    x: point.i === 33 ? point.x + 9 : point.x,
    z: point.z ?? 0,
  })),
  pose: {...(geometry.pose as NonNullable<typeof geometry.pose>), rollDeg: 3},
  requestId: 'landmark-once',
  status: 'ok' as const,
};
const verticalThirds = geometry.hairline;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function snapshot() {
  return {
    cameraStability: 0.96,
    capturedAt: CREATED_AT,
    centerOffsetX: 0.01,
    centerOffsetY: -0.02,
    centeredScore: 0.95,
    faceCount: 1,
    framingScore: 0.93,
    nativeCameraMetadata: {
      isStable: true,
      status: 'ok' as const,
      whiteBalanceGains: {blue: 1.1, green: 1, red: 1.08},
    },
    pitchDeg: 0,
    rollDeg: 0,
    screenCoverageRatio: 0.46,
    source: 'camera' as const,
    yawDeg: 0,
  };
}

async function run() {
  let landmarkRequests = 0;
  let verticalCalls = 0;
  let personalCalls = 0;
  let depthCalls = 0;
  let depthDiscards = 0;
  let matteDiscards = 0;

  const dependencies: FaceProfileDependencies = {
    analyzeDepth: async (token, options) => {
      depthCalls += 1;
      expect(token === 'depth-once', 'depth token is consumed immediately');
      expect(options.landmarks?.points === landmarks.landmarks, 'depth reuses landmarks');
      return {
        kind: 'fallback_2d',
        summary: {consumed: false, status: 'unsupported'},
        warnings: ['depth_unsupported'],
      };
    },
    analyzePersonalColor: async input => {
      personalCalls += 1;
      expect(
        input.precomputedLandmarks === landmarks,
        'personal color receives the exact precomputed result',
      );
      expect(input.nativeMatteToken === 'matte-once', 'personal color receives matte token');
      return {native: nativeColor, result: color};
    },
    analyzeVerticalThirds: async input => {
      verticalCalls += 1;
      expect(
        input.precomputedLandmarks === landmarks,
        'vertical thirds receives the exact precomputed result',
      );
      expect(input.nativeMatteToken === 'matte-once', 'vertical thirds receives matte token');
      return {hairSkinBoundary: null, summary: verticalThirds ?? null};
    },
    discardDepthToken: async token => {
      expect(token === 'depth-once', 'depth discard uses capture token');
      depthDiscards += 1;
    },
    discardMatteToken: async token => {
      expect(token === 'matte-once', 'matte discard uses capture token');
      matteDiscards += 1;
    },
    now: () => Date.parse(CREATED_AT),
    requestLandmarks: async (imageUri, options) => {
      landmarkRequests += 1;
      expect(imageUri === 'file:///sanitized.jpg', 'landmarks use sanitized image');
      expect(
        typeof options.timeoutMs === 'number' && options.timeoutMs <= 12_000,
        'landmark request stays inside total budget',
      );
      return landmarks;
    },
  };

  const prepared = await prepareFaceProfileCapture(
    {
      height: geometry.imageHeight,
      nativeDepthToken: 'depth-once',
      nativeMatteToken: 'matte-once',
      source: 'camera',
      uri: 'file:///sanitized.jpg',
      width: geometry.imageWidth,
    },
    snapshot(),
    dependencies,
  );
  expect(landmarkRequests === 1, 'landmark requester is called exactly once');
  expect(verticalCalls === 1 && personalCalls === 1, 'downstream analyses run once');
  expect(depthCalls === 1, 'depth is consumed once');
  expect(
    depthDiscards === 0 && matteDiscards === 1,
    'depth wrapper owns cleanup after handoff while service releases matte once',
  );
  expect(prepared.profile.status === 'full_success', '2D fallback can stay full success');

  const preparedJson = JSON.stringify(prepared).toLowerCase();
  for (const forbidden of ['landmarks', 'depth-once', 'matte-once']) {
    expect(!preparedJson.includes(forbidden), `prepared result does not retain ${forbidden}`);
  }

  const finalized = finalizePreparedFaceProfile(prepared, {
    photoCaptureId: UPLOADED_CAPTURE_ID,
  });
  expect(finalized.captureId === UPLOADED_CAPTURE_ID, 'upload capture id is authoritative');
  expect(parseFaceProfile(finalized) !== null, 'finalized profile remains contract-valid');

  let blockedAnalyzerCalls = 0;
  const blockedDependencies: FaceProfileDependencies = {
    ...dependencies,
    analyzeDepth: async () => {
      blockedAnalyzerCalls += 1;
      throw new Error('must_not_run');
    },
    analyzePersonalColor: async () => {
      blockedAnalyzerCalls += 1;
      throw new Error('must_not_run');
    },
    analyzeVerticalThirds: async () => {
      blockedAnalyzerCalls += 1;
      throw new Error('must_not_run');
    },
    discardDepthToken: async () => undefined,
    discardMatteToken: async () => undefined,
    requestLandmarks: async () => ({...landmarks, faceCount: 2}),
  };
  const blocked = await prepareFaceProfileCapture(
    {source: 'camera', uri: 'file:///sanitized.jpg'},
    {...snapshot(), faceCount: 2},
    blockedDependencies,
  );
  expect(blocked.profile.status === 'blocked', 'two faces block preparation');
  expect(blockedAnalyzerCalls === 0, 'blocked face count never starts analyzers');

  const nullPose = await prepareFaceProfileCapture(
    {source: 'camera', uri: 'file:///sanitized.jpg'},
    snapshot(),
    {...blockedDependencies, requestLandmarks: async () => ({...landmarks, pose: null})},
  );
  expect(nullPose.profile.status === 'blocked', 'null pose blocks preparation');
  expect(blockedAnalyzerCalls === 0, 'null pose never starts analyzers');

  let timeoutDepthDiscard = 0;
  let timeoutMatteDiscard = 0;
  const timedOut = await prepareFaceProfileCapture(
    {
      nativeDepthToken: 'timeout-depth',
      nativeMatteToken: 'timeout-matte',
      source: 'camera',
      uri: 'file:///sanitized.jpg',
    },
    snapshot(),
    {
      ...dependencies,
      discardDepthToken: async () => {
        timeoutDepthDiscard += 1;
      },
      discardMatteToken: async () => {
        timeoutMatteDiscard += 1;
      },
      requestLandmarks: async () => {
        throw new Error('face_landmarks_timeout');
      },
    },
  );
  expect(timedOut.profile.status === 'failed', 'landmark timeout returns failed wrapper');
  expect(
    timedOut.profile.statusReason === 'pipeline_failure' &&
      timedOut.profile.warnings.includes('face_landmarks_timeout'),
    'failed wrapper records a safe timeout reason',
  );
  expect(timeoutDepthDiscard === 1 && timeoutMatteDiscard === 1, 'timeout cleans tokens once');
  expect(parseFaceProfile(timedOut.profile) !== null, 'failed wrapper is contract-valid');

  let synchronousDepthDiscard = 0;
  const synchronousDepthFailure = await prepareFaceProfileCapture(
    {
      nativeDepthToken: 'sync-depth',
      source: 'camera',
      uri: 'file:///sanitized.jpg',
    },
    snapshot(),
    {
      ...dependencies,
      analyzeDepth: () => {
        throw new Error('synchronous_depth_handoff_failure');
      },
      analyzePersonalColor: async () => ({native: nativeColor, result: color}),
      analyzeVerticalThirds: async () => ({
        hairSkinBoundary: null,
        summary: verticalThirds ?? null,
      }),
      discardDepthToken: async () => {
        synchronousDepthDiscard += 1;
      },
      discardMatteToken: async () => undefined,
    },
  );
  expect(
    synchronousDepthFailure.profile.status === 'failed',
    'synchronous depth handoff failure is contained',
  );
  expect(
    synchronousDepthDiscard === 1,
    'service discards depth exactly once when handoff never completes',
  );

  const cleanupFailureDoesNotOverride = await prepareFaceProfileCapture(
    {nativeMatteToken: 'cleanup-fails', source: 'camera', uri: 'file:///sanitized.jpg'},
    snapshot(),
    {
      ...dependencies,
      analyzeDepth: async () => ({
        kind: 'fallback_2d',
        summary: {consumed: false, status: 'unsupported'},
        warnings: ['depth_unsupported'],
      }),
      discardDepthToken: async () => undefined,
      discardMatteToken: async () => {
        throw new Error('cleanup_failed');
      },
      analyzePersonalColor: async () => ({native: nativeColor, result: color}),
      analyzeVerticalThirds: async () => ({
        hairSkinBoundary: null,
        summary: verticalThirds ?? null,
      }),
    },
  );
  expect(
    cleanupFailureDoesNotOverride.profile.status === 'full_success',
    'best-effort cleanup failure cannot overwrite a successful profile',
  );

  console.log('faceProfileService tests passed');
}

void run();
