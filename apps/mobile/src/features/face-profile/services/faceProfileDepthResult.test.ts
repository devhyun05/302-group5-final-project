import {
  parseNativeDepthSummary,
  resolveNativeDepthSummary,
  type FaceProfileTransientCaptureResult,
  type NativeDepthOkSummary,
} from './faceProfileDepthResult';

const assert = {
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(expected)}`,
      );
    }
  },
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
  throws(operation: () => unknown, expectedMessage: string) {
    try {
      operation();
    } catch (error) {
      if (error instanceof Error && error.message.includes(expectedMessage)) {
        return;
      }
      throw error;
    }
    throw new Error(`Expected operation to throw ${expectedMessage}`);
  },
};

const valid: NativeDepthOkSummary = {
  cameraDistanceMeters: 0.48,
  consumed: true,
  depthQuality: {
    accuracy: 'absolute',
    confidence: 0.91,
    filtered: true,
    medianAbsoluteDeviationMeters: 0.003,
    validSampleRatio: 0.87,
  },
  facePlane: {
    confidence: 0.9,
    pitchDeg: 1.2,
    rollDeg: -0.8,
    yawDeg: 2.1,
  },
  ratios: {
    faceLengthToCheekWidth: 1.55,
    jawWidthToCheekWidth: 0.77,
    chinWidthToCheekWidth: 0.42,
    foreheadWidthToCheekWidth: 0.89,
    interEyeToCheekWidth: 0.31,
    noseLengthToCheekWidth: 0.28,
  },
  status: 'ok',
};

assert.deepEqual(parseNativeDepthSummary(valid), valid);
assert.deepEqual(resolveNativeDepthSummary(valid), {
  kind: 'depth',
  summary: valid,
  warnings: [],
});

for (const status of ['unsupported', 'expired', 'insufficient_depth'] as const) {
  const summary = {consumed: status === 'insufficient_depth', status};
  assert.deepEqual(resolveNativeDepthSummary(summary), {
    kind: 'fallback_2d',
    summary,
    warnings: [`depth_${status}`],
  });
}

for (const summary of [
  {consumed: false, status: 'not_found' as const},
  {consumed: true, status: 'invalid_landmarks' as const},
  {consumed: true, status: 'error' as const},
]) {
  assert.deepEqual(parseNativeDepthSummary(summary), summary);
  assert.deepEqual(resolveNativeDepthSummary(summary), {
    kind: 'fallback_2d',
    summary,
    warnings: [`depth_${summary.status}`],
  });
}

for (const invalidConsumed of [
  {consumed: true, status: 'unsupported'},
  {consumed: true, status: 'not_found'},
  {consumed: true, status: 'expired'},
  {consumed: false, status: 'invalid_landmarks'},
  {consumed: false, status: 'insufficient_depth'},
  {consumed: false, status: 'error'},
  {consumed: false, status: 'ok'},
]) {
  assert.throws(
    () => parseNativeDepthSummary(invalidConsumed),
    'consumed',
  );
}
assert.throws(
  () => parseNativeDepthSummary({consumed: 1, status: 'expired'}),
  'consumed',
);

assert.throws(
  () => parseNativeDepthSummary({...valid, rawDepth: [0.1, 0.2]}),
  'unexpected key',
);
assert.throws(
  () =>
    parseNativeDepthSummary({
      ...valid,
      depthQuality: {...valid.depthQuality, calibration: {fx: 1200}},
    }),
  'unexpected key',
);
assert.throws(
  () => parseNativeDepthSummary({...valid, token: 'sensitive-token'}),
  'unexpected key',
);
assert.throws(
  () =>
    parseNativeDepthSummary({
      ...valid,
      depthQuality: {...valid.depthQuality, confidence: Number.NaN},
    }),
  'confidence',
);
assert.throws(
  () =>
    parseNativeDepthSummary({
      ...valid,
      ratios: {...valid.ratios, faceLengthToCheekWidth: 0},
    }),
  'faceLengthToCheekWidth',
);
assert.throws(
  () => parseNativeDepthSummary({consumed: false, reason: 'raw error', status: 'expired'}),
  'unexpected key',
);

const deferredCaptureContract: FaceProfileTransientCaptureResult = {
  format: 'jpg',
  nativeDepthToken: 'opaque-depth-token',
  nativeMatteToken: 'opaque-matte-token',
  trueDepth: {
    captured: true,
    expiresInMs: 60_000,
    requested: true,
    supported: true,
  },
  uri: 'file:///tmp/capture.jpg',
};
assert.equal(deferredCaptureContract.trueDepth?.captured, true);

console.log('faceProfileDepthResult tests passed');
