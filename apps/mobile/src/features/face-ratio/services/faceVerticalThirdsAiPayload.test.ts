import {
  buildFaceVerticalThirdsAnalysisPayload,
  buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot,
} from './faceVerticalThirdsAiPayload';
import type {FaceVerticalThirdsResult} from '../types';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const realtimePayload = buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot({
  measurementMode: 'standard',
  mediaPipe: {
    screenLandmarks: {
      chin: {left: 200, top: 410},
      forehead: {left: 200, top: 100},
      noseBridge: {left: 200, top: 190},
      noseTip: {left: 200, top: 290},
    },
    status: 'ok',
  },
  source: 'realtime_native_vision',
});

const precisionRealtimePayload = buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot({
  measurementMode: 'precision',
  mediaPipe: {
    screenLandmarks: {
      chin: {left: 200, top: 410},
      forehead: {left: 200, top: 100},
      noseBridge: {left: 200, top: 190},
      noseTip: {left: 200, top: 290},
    },
    status: 'ok',
  },
  source: 'realtime_native_vision',
});

expectEqual(
  precisionRealtimePayload,
  undefined,
  'precision face analysis does not promote realtime guide landmarks to report baseline',
);
expectEqual(
  realtimePayload?.displayRatio.upper,
  0.9,
  'realtime camera snapshot restores upper vertical thirds ratio',
);
expectEqual(
  realtimePayload?.displayRatio.middle,
  1,
  'realtime camera snapshot uses the middle third as baseline',
);
expectEqual(
  realtimePayload?.displayRatio.lower,
  1.2,
  'realtime camera snapshot restores lower vertical thirds ratio',
);
expectEqual(
  realtimePayload?.dominantPart,
  'lower',
  'realtime camera snapshot derives the dominant vertical thirds part',
);
expectEqual(
  realtimePayload?.measurement.source,
  'realtime_native_vision',
  'realtime camera snapshot keeps the approximate measurement source',
);
expectEqual(
  realtimePayload?.measurement.mode,
  'standard',
  'standard realtime camera snapshot preserves standard measurement mode',
);

const missingPayload = buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot({
  mediaPipe: {
    screenLandmarks: {
      chin: {left: 200, top: 410},
      forehead: {left: 200, top: 100},
    },
    status: 'ok',
  },
});

expectEqual(
  missingPayload,
  undefined,
  'realtime camera snapshot does not fabricate ratios without nose landmarks',
);

const measuredPayload = buildFaceVerticalThirdsAnalysisPayload({
  artifacts: {},
  captureId: 'capture-overlay',
  createdAt: '2026-07-09T00:00:00.000Z',
  interpretation: {
    dominantPart: 'lower',
    summary: '하안부가 살짝 긴 편이에요.',
    title: '하안부 중심형',
  },
  keypoints: {
    G: {
      confidence: 0.82,
      method: 'mediapipe_median_glabella_brow_group',
      provider: 'mediapipe',
      x: 520,
      y: 410,
    },
    H: {
      confidence: 0.72,
      method: 'apple_hairline',
      provider: 'apple_semantic_matte',
      x: 520,
      y: 250,
    },
    Me: {
      confidence: 0.84,
      method: 'mediapipe_bottom_chin_contour_polyline',
      provider: 'mediapipe',
      x: 522,
      y: 930,
    },
    Sn: {
      confidence: 0.82,
      method: 'mediapipe_median_subnasale_group',
      provider: 'mediapipe',
      x: 518,
      y: 610,
    },
  },
  measurement: {
    cameraFacing: 'front',
    mode: 'precision',
    semanticMatteAvailable: true,
    semanticMatteRequested: true,
    source: 'apple_semantic_matte',
    trueDepthCorrectionApplied: false,
    warnings: [],
  },
  quality: {usable: true, warnings: []},
  schemaVersion: 'aura-face-vertical-thirds-v1',
  sessionId: 'capture-overlay',
  sourceImage: {
    height: 1200,
    uri: 'file:///tmp/overlay-source.jpg',
    width: 900,
  },
  status: 'full_success',
  verticalThirds: {
    confidence: 0.86,
    displayRatio: {
      lower: 1.6,
      middle: 1,
      upper: 0.8,
    },
    lowerNormalized: 0.47,
    lowerPx: 320,
    middleNormalized: 0.29,
    middlePx: 200,
    totalPx: 680,
    upperNormalized: 0.24,
    upperPx: 160,
    warnings: [],
  },
} satisfies FaceVerticalThirdsResult);

expectEqual(
  measuredPayload?.overlay?.sourceImage.width,
  900,
  'measured vertical thirds payload preserves overlay source width',
);
expectEqual(
  measuredPayload?.overlay?.keypoints.Sn?.y,
  610,
  'measured vertical thirds payload preserves overlay keypoints for reports',
);
