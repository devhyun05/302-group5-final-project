import type {NativePersonalColorResult, NativeRegionStats} from '../../personal-color/services/personalColorCore/contracts';
import {computeFaceProfilePixelSignals} from './faceProfilePixelSignals';

const assert = {
  equal(actual: unknown, expected: unknown, label: string) {
    if (!Object.is(actual, expected)) {
      throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  ok(value: unknown, label: string) {
    if (!value) throw new Error(`${label}: expected truthy`);
  },
};

function region(r: number, g: number, b: number): NativeRegionStats {
  return {
    areaRatio: 0.72,
    confidence: 0.9,
    dominant: {b, g, r},
    matteCoverage: 0.88,
    overexposedRatio: 0,
    rgbMean: {b, g, r},
    rgbVariance: {b: 30, g: 30, r: 30},
    roiCoverage: 0.72,
    sampleCount: 320,
    specularRejectedRatio: 0.02,
    underexposedRatio: 0,
  };
}

const native = {
  colorSpace: 'srgb',
  faceCount: 1,
  quality: {
    blur: {confidence: 0.92, laplacianVariance: 180, score: 0.9},
    lighting: {
      globalLuminance: 0.52,
      leftLuminance: 0.5,
      rightLuminance: 0.54,
      score: 0.91,
      uniformityScore: 0.94,
    },
    skinUniformity: {cheekDelta: 2.2, foreheadDelta: 2.8, score: 0.9},
  },
  regions: {
    browLeft: region(72, 55, 46),
    browRight: region(76, 58, 48),
    eyeLeft: region(58, 52, 45),
    eyeRight: region(62, 55, 46),
    hair: region(38, 31, 29),
    lip: region(173, 75, 92),
    skinCheekLeft: region(211, 174, 154),
    skinCheekRight: region(207, 171, 151),
    skinForehead: region(216, 179, 159),
  },
  status: 'ok',
  warnings: [],
} satisfies NativePersonalColorResult;

const signals = computeFaceProfilePixelSignals(native);
for (const key of [
  'overallFaceContrast',
  'eyeSkinContrast',
  'browSkinContrast',
  'lipSkinContrast',
  'skinEvenness',
  'redness',
  'yellowness',
] as const) {
  assert.ok(signals[key].value !== null, `${key} has value`);
  assert.equal(signals[key].source, 'pixel_roi', `${key} source`);
}
assert.ok((signals.overallFaceContrast.value ?? 0) > 0, 'overall contrast positive');
assert.ok((signals.skinEvenness.value ?? 0) > 0.7, 'skin evenness high');
assert.ok(
  signals.redness.warnings.includes('relative_capture_value_not_medical_diagnosis'),
  'redness is explicitly non-diagnostic',
);
assert.ok(
  signals.yellowness.warnings.includes('relative_capture_value_not_medical_diagnosis'),
  'yellowness is explicitly non-diagnostic',
);

const serialized = JSON.stringify(signals);
for (const forbidden of ['pixels', 'polygon', 'matte', 'artifactUri']) {
  assert.equal(serialized.includes(forbidden), false, `no ${forbidden} in FaceProfile signals`);
}

console.log('faceProfilePixelSignals tests passed');
