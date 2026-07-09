import {
  buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot,
} from './faceVerticalThirdsAiPayload';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const realtimePayload = buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot({
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
  'precision',
  'realtime camera snapshot preserves requested precision mode',
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
