import type {
  NativePersonalColorResult,
  NativeRegionStats,
} from './personalColorCore/contracts';
import type {PersonalColorAnalyzeOptions} from './personalColorAnalyzerNative';
import {evaluatePersonalColorQuality} from './personalColorQualityGate';
import type {PersonalColorCaptureInput} from '../types';

// Task 6 can inject sanitizer/capture mirror metadata without persisting it in
// the FaceProfile result. These assignments are compile-time contract fixtures.
const mirroredNativeOptions: PersonalColorAnalyzeOptions = {mirrored: true};
const mirroredCaptureInput: PersonalColorCaptureInput = {
  captureId: 'capture-id',
  createdAt: '2026-07-12T00:00:00.000Z',
  imageUri: 'file:///tmp/sanitized.jpg',
  mirrored: true,
  sessionId: 'session-id',
};
void mirroredNativeOptions;
void mirroredCaptureInput;

function region(overexposedRatio: number): NativeRegionStats {
  return {
    areaRatio: 0.8,
    confidence: 0.9,
    dominant: {b: 100, g: 120, r: 140},
    matteCoverage: 1,
    overexposedRatio,
    rgbMean: {b: 100, g: 120, r: 140},
    rgbVariance: {b: 10, g: 10, r: 10},
    roiCoverage: 0.8,
    sampleCount: 100,
    specularRejectedRatio: 0,
    underexposedRatio: 0,
  };
}

const legacyOverexposedWithDarkNewRegions = {
  faceCount: 1,
  regions: {
    browLeft: region(0),
    browRight: region(0),
    eyeLeft: region(0),
    eyeRight: region(0),
    hair: region(0.6),
    lip: region(0.6),
    skinCheekLeft: region(0.6),
    skinCheekRight: region(0.6),
    skinForehead: region(0.6),
  },
  status: 'ok',
} satisfies NativePersonalColorResult;

const gate = evaluatePersonalColorQuality(legacyOverexposedWithDarkNewRegions);
if (!gate.warnings.includes('capture_overexposed')) {
  throw new Error(
    'legacy skin/hair/lip exposure gate must ignore the newer eye/brow ROI set',
  );
}

console.log('personalColorQualityGate tests passed');
