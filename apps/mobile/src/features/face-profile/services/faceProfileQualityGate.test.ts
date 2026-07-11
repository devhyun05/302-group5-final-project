import type {FaceMeasurement} from '../../../shared/types/faceProfile';
import {
  evaluateFaceProfileQuality,
  type FaceProfileQualityInput,
  type NativePixelQuality,
} from './faceProfileQualityGate';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
  ok(value: unknown, message = 'Expected value to be truthy') {
    if (!value) {
      throw new Error(message);
    }
  },
};

const GOOD_PIXEL_QUALITY: NativePixelQuality = {
  blur: {confidence: 0.9, laplacianVariance: 180, score: 0.92},
  lighting: {
    globalLuminance: 0.52,
    leftLuminance: 0.51,
    rightLuminance: 0.53,
    score: 0.9,
    uniformityScore: 0.94,
  },
  skinUniformity: {cheekDelta: 2.1, foreheadDelta: 2.8, score: 0.88},
};

const BASE_INPUT: FaceProfileQualityInput = {
  cameraMetadata: {
    adjustingExposure: false,
    adjustingFocus: false,
    adjustingWhiteBalance: false,
    isStable: true,
    stableDurationMs: 900,
    stableThresholdMs: 700,
    whiteBalanceGains: {blue: 1.04, green: 1, red: 1.03},
  },
  centeredOffset: 0.03,
  expression: {
    leftEyeAspectRatio: 0.29,
    mouthOpenRatio: 0.06,
    rightEyeAspectRatio: 0.3,
  },
  faceCount: 1,
  landmarkCount: 478,
  pixelQuality: GOOD_PIXEL_QUALITY,
  pose: {pitchDeg: 1, rollDeg: -1, yawDeg: 2},
  screenCoverageRatio: 0.42,
};

function evaluate(overrides: Partial<FaceProfileQualityInput> = {}) {
  return evaluateFaceProfileQuality({...BASE_INPUT, ...overrides});
}

function assertAllMeasurementsHaveValuesOrReasons(
  value: Record<string, unknown>,
  parentPath = 'quality',
) {
  for (const [key, nested] of Object.entries(value)) {
    const path = `${parentPath}.${key}`;
    if (
      typeof nested === 'object' &&
      nested !== null &&
      'value' in nested &&
      'confidence' in nested &&
      'source' in nested &&
      'warnings' in nested
    ) {
      const measurement = nested as FaceMeasurement<unknown>;
      assert.ok(
        measurement.value !== null ||
          (typeof measurement.nullReason === 'string' &&
            measurement.nullReason.length > 0),
        `${path} must have a value or nullReason`,
      );
      continue;
    }
    if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
      assertAllMeasurementsHaveValuesOrReasons(
        nested as Record<string, unknown>,
        path,
      );
    }
  }
}

const noFace = evaluate({faceCount: 0});
assert.equal(noFace.status, 'blocked');
assert.ok(noFace.blockingReasons.includes('face_not_detected'));

const multipleFaces = evaluate({faceCount: 2});
assert.equal(multipleFaces.status, 'blocked');
assert.ok(multipleFaces.blockingReasons.includes('multiple_faces'));

const incompleteLandmarks = evaluate({landmarkCount: 477});
assert.equal(incompleteLandmarks.status, 'blocked');
assert.ok(incompleteLandmarks.blockingReasons.includes('landmarks_incomplete'));

const missingRequiredLandmark = evaluate({requiredLandmarkAvailability: 0.99});
assert.equal(missingRequiredLandmark.status, 'blocked');
assert.ok(
  missingRequiredLandmark.blockingReasons.includes('landmarks_incomplete'),
);

const missingPose = evaluate({pose: null});
assert.equal(missingPose.status, 'blocked');
assert.ok(missingPose.blockingReasons.includes('pose_unavailable'));
assert.equal(missingPose.quality.yawDeg.value, null);
assert.equal(missingPose.quality.yawDeg.nullReason, 'pose_unavailable');

for (const pose of [
  {pitchDeg: 8.01, rollDeg: 0, yawDeg: 0},
  {pitchDeg: 0, rollDeg: 5.01, yawDeg: 0},
  {pitchDeg: 0, rollDeg: 0, yawDeg: -8.01},
]) {
  const outOfRange = evaluate({pose});
  assert.equal(outOfRange.status, 'blocked');
  assert.ok(outOfRange.blockingReasons.includes('pose_out_of_range'));
}

const boundaryPose = evaluate({pose: {pitchDeg: 8, rollDeg: -5, yawDeg: -8}});
assert.ok(!boundaryPose.blockingReasons.includes('pose_out_of_range'));

const poorButUsable = evaluate({
  cameraMetadata: {...BASE_INPUT.cameraMetadata, isStable: false},
  centeredOffset: 0.31,
  pixelQuality: {
    ...GOOD_PIXEL_QUALITY,
    blur: {...GOOD_PIXEL_QUALITY.blur, score: 0.19},
    lighting: {
      ...GOOD_PIXEL_QUALITY.lighting,
      globalLuminance: 0.12,
      score: 0.22,
      uniformityScore: 0.35,
    },
  },
  screenCoverageRatio: 0.15,
});
assert.equal(poorButUsable.status, 'partial_success');
assert.equal(poorButUsable.blockingReasons.length, 0);
assert.ok(poorButUsable.warnings.includes('face_not_centered'));
assert.ok(poorButUsable.warnings.includes('face_too_far'));
assert.ok(poorButUsable.warnings.includes('blur_risk'));
assert.ok(poorButUsable.warnings.includes('lighting_low'));
assert.ok(poorButUsable.warnings.includes('camera_unstable'));

const neutral = evaluate();
assert.ok((neutral.quality.neutralExpressionScore.value ?? 0) > 0.7);
assert.ok((neutral.quality.eyeClosureRisk.value ?? 1) < 0.3);
assert.ok((neutral.quality.mouthOpenRisk.value ?? 1) < 0.3);

const expressive = evaluate({
  expression: {
    leftEyeAspectRatio: 0.11,
    mouthOpenRatio: 0.34,
    rightEyeAspectRatio: 0.12,
  },
});
assert.ok((expressive.quality.eyeClosureRisk.value ?? 0) > 0.6);
assert.ok((expressive.quality.mouthOpenRisk.value ?? 0) > 0.6);
assert.ok((expressive.quality.neutralExpressionScore.value ?? 1) < 0.4);

assert.equal(neutral.quality.landmarkConfidence.source, 'estimated');
assert.ok(
  neutral.quality.landmarkConfidence.warnings.includes(
    'landmark_confidence_is_estimated',
  ),
);
assert.equal(neutral.quality.occlusionRisk.source, 'estimated');
assert.ok(
  neutral.quality.occlusionRisk.warnings.includes('occlusion_risk_is_estimated'),
);
assertAllMeasurementsHaveValuesOrReasons(
  neutral.quality as unknown as Record<string, unknown>,
);
assertAllMeasurementsHaveValuesOrReasons(
  missingPose.quality as unknown as Record<string, unknown>,
);

console.log('faceProfileQualityGate tests passed');
