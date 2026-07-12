import {
  FACE_PROFILE_OPTIONAL_MEASUREMENT_PATHS,
  FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS,
  FACE_PROFILE_SCHEMA_VERSION,
  parseFaceProfile,
} from './faceProfileContract';
import {FACE_ANALYSIS_POSE_LIMITS} from '../../../shared/contracts/faceAnalysisQuality';
import type {
  FaceMeasurement,
  FaceMeasurementSource,
  FaceProfileResult,
  PersonalColor12Type,
  PersonalColorSummary,
} from '../../../shared/types/faceProfile';
import {FACE_SHAPE_LABELS} from '../constants/faceShapeLandmarks';

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
  ok(value: unknown) {
    if (!value) {
      throw new Error('Expected value to be truthy');
    }
  },
};

const FACE_SHAPE_SCORES = {
  oval: 0.3,
  round: 0.2,
  square: 0.15,
  heart: 0.1,
  oblong: 0.1,
  diamond: 0.08,
  triangle: 0.07,
};

const PERSONAL_COLOR_TYPES = [
  'spring_light',
  'spring_bright',
  'spring_true',
  'summer_light',
  'summer_true',
  'summer_muted',
  'autumn_muted',
  'autumn_true',
  'autumn_deep',
  'winter_bright',
  'winter_true',
  'winter_deep',
] as const;

function measurement<T>(
  value: T,
  source: FaceMeasurementSource = 'derived',
): FaceMeasurement<T> {
  return {confidence: 0.9, source, value, warnings: []};
}

function unavailable<T = never>(
  source: FaceMeasurementSource,
  nullReason: string,
): FaceMeasurement<T> {
  return {confidence: 0, nullReason, source, value: null, warnings: []};
}

function measurements<const Names extends readonly string[]>(
  names: Names,
): {[Key in Names[number]]: FaceMeasurement<number>} {
  return Object.fromEntries(names.map(name => [name, measurement(0.5)])) as {
    [Key in Names[number]]: FaceMeasurement<number>;
  };
}

function toneRecord(value: number): Record<PersonalColor12Type, number> {
  return Object.fromEntries(
    PERSONAL_COLOR_TYPES.map(type => [type, value]),
  ) as Record<PersonalColor12Type, number>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setPath(root: unknown, path: readonly string[], value: unknown) {
  let current = root;
  for (const segment of path.slice(0, -1)) {
    if (!isRecord(current)) {
      throw new Error(`Expected object at ${segment}`);
    }
    current = current[segment];
  }
  if (!isRecord(current)) {
    throw new Error(`Expected object at ${path.join('.')}`);
  }
  current[path[path.length - 1]] = value;
}

function sumScores(scores: Record<string, number>) {
  return Object.values(scores).reduce((sum, score) => sum + score, 0);
}

const personalColorSummary = {
  axes: {
    temperature: {confidence: 0.8, value: 0.2},
    value: {confidence: 0.8, value: -0.1},
    chroma: {confidence: 0.7, value: 0.3},
    clarity: {confidence: 0.7, value: 0.25},
    contrast: {confidence: 0.9, value: 0.4},
  },
  calibrationApplied: false,
  calibrationVersion: null,
  measurementConfidence: 0.8,
  palette: {bestFamilyIds: ['cool-clear'], worstFamilyIds: ['warm-muted']},
  relations: {
    dE00SkinHair: 22,
    dE00SkinLip: 12,
    dLSkinHair: 18,
    dLSkinLip: 8,
  },
  status: 'definitive',
  tone: {
    gap: 0.2,
    score: 0.5,
    season: 'winter',
    secondary: 'winter_true',
    top: 'winter_bright',
    toneDistances: toneRecord(0.4),
    toneScores: toneRecord(1 / PERSONAL_COLOR_TYPES.length),
  },
  warnings: [],
} satisfies PersonalColorSummary;

export const validReadyProfile = {
  beautyCoreFeatures: {
    eyesAndBrows: {
      browEyeDistance: 'balanced',
      eyeAspectRatio: 0.31,
      eyeSpacing: 'balanced',
      eyeTilt: 'slightly_upturned',
    },
    faceBalance: {
      cheekboneToJawRatio: 1.2,
      faceLengthWidthRatio: 1.35,
      jawSoftness: 0.68,
      lowerFaceLength: 'balanced',
      midfaceLength: 'balanced',
    },
    facialContrast: {
      browSkinContrast: 0.38,
      eyeSkinContrast: 0.42,
      lipSkinContrast: 0.46,
      overall: 'medium_soft',
    },
    mouth: {
      lipFullness: 'medium',
      mouthCornerTilt: 'neutral',
      mouthWidthRatio: 0.39,
      upperLowerLipRatio: 0.67,
    },
    nose: {
      noseLengthRatio: 0.32,
      noseMidfaceRatio: 0.48,
      noseTipMouthDistanceRatio: 0.18,
      noseWidthRatio: 0.22,
    },
    quality: {
      confidence: 0.94,
      isFrontal: true,
      lightingQuality: 0.81,
      neutralExpression: true,
    },
    skinEvenness: {redness: 0.31, toneUniformity: 0.72, yellowHue: 0.44},
  },
  captureId: '550e8400-e29b-41d4-a716-446655440000',
  color: {
    ...measurements([
      'overallFaceContrast',
      'eyeSkinContrast',
      'browSkinContrast',
      'lipSkinContrast',
      'skinEvenness',
      'redness',
      'yellowness',
    ]),
    hairColor: measurement({hex: '#201815', lab: {L: 15, a: 2, b: 3}, rgb: {b: 21, g: 24, r: 32}}, 'pixel_roi'),
    leftBrowColor: measurement({hex: '#342621', lab: {L: 22, a: 3, b: 4}, rgb: {b: 33, g: 38, r: 52}}, 'pixel_roi'),
    leftEyeColor: measurement({hex: '#2A211D', lab: {L: 18, a: 2, b: 3}, rgb: {b: 29, g: 33, r: 42}}, 'pixel_roi'),
    lipColor: measurement({hex: '#A85F67', lab: {L: 48, a: 28, b: 10}, rgb: {b: 103, g: 95, r: 168}}, 'pixel_roi'),
    personalColor: measurement(personalColorSummary),
    rightBrowColor: measurement({hex: '#342621', lab: {L: 22, a: 3, b: 4}, rgb: {b: 33, g: 38, r: 52}}, 'pixel_roi'),
    rightEyeColor: measurement({hex: '#2A211D', lab: {L: 18, a: 2, b: 3}, rgb: {b: 29, g: 33, r: 42}}, 'pixel_roi'),
    skinColor: measurement({hex: '#D5A389', lab: {L: 70, a: 12, b: 18}, rgb: {b: 137, g: 163, r: 213}}, 'pixel_roi'),
  },
  createdAt: '2026-07-12T03:04:05.000Z',
  existingAnalysis: {
    personalColor: personalColorSummary,
    verticalThirds: {
      confidence: 0.83,
      displayRatio: {lower: 1.02, middle: 1, upper: 0.98},
      dominantPart: 'balanced',
      hairline: {confidence: 0.8, provider: 'apple_semantic_matte'},
      status: 'full_success',
      summary: '상중하안부가 균형에 가까워요.',
    },
  },
  eyesAndBrows: measurements([
    'leftEyeAspectRatio',
    'rightEyeAspectRatio',
    'interEyeDistanceRatio',
    'leftEyeCanthalTiltDeg',
    'rightEyeCanthalTiltDeg',
    'leftBrowEyeDistanceRatio',
    'rightBrowEyeDistanceRatio',
    'leftBrowTiltDeg',
    'rightBrowTiltDeg',
    'eyeAsymmetry',
    'browAsymmetry',
  ]),
  faceBalance: measurements([
    'faceLengthToWidth',
    'faceLengthToCheekWidth',
    'upperThirdRatio',
    'middleThirdRatio',
    'lowerThirdRatio',
    'foreheadWidthToCheekWidth',
    'templeWidthToCheekWidth',
    'jawWidthToCheekWidth',
    'chinWidthToCheekWidth',
    'cheekToJawRatio',
    'cheekDominance',
    'jawlineLengthRatio',
    'jawAngleDeg',
    'jawWidthScore',
    'jawAngleScore',
    'jawSoftness',
    'chinPointedness',
    'contourRoundness',
    'foreheadDominance',
    'lowerFaceWeight',
    'contourAsymmetry',
  ]),
  faceShape: {
    classifierType: 'rule_v1',
    classifierVersion: 'rule-v1.0.0',
    confidenceGap: 0.1,
    dominantShape: 'oval',
    explanationTraits: ['balanced_length', 'soft_jaw'],
    faceShapeScores: FACE_SHAPE_SCORES,
    overallConfidence: 0.88,
    ruleFeatures: {
      cheekDominance: 0.7,
      chinPointedness: 0.45,
      chinWidthToCheekWidth: 0.5,
      contourRoundness: 0.65,
      faceLengthToCheekWidth: 1.35,
      foreheadDominance: 0.55,
      foreheadWidthToCheekWidth: 0.9,
      frontalConfidence: 0.95,
      hairlineConfidence: 0.8,
      jawAngleScore: 0.55,
      jawWidthScore: 0.5,
      jawWidthToCheekWidth: 0.75,
      landmarkConfidence: 0.96,
      lowerFaceWeight: 0.48,
      templeWidthToCheekWidth: 0.88,
    },
    status: 'ready',
    top2: [
      {score: 0.3, shape: 'oval'},
      {score: 0.2, shape: 'round'},
    ],
    warnings: [],
  },
  mouth: measurements([
    'lipFullnessRatio',
    'mouthWidthRatio',
    'upperToLowerLipRatio',
    'leftCornerTiltDeg',
    'rightCornerTiltDeg',
    'mouthAsymmetry',
  ]),
  nose: measurements([
    'noseLengthRatio',
    'noseWidthRatio',
    'noseToMidfaceRatio',
    'noseTipToMouthRatio',
    'centerlineAsymmetry',
  ]),
  provenance: {
    classifierVersion: 'rule-v1.0.0',
    landmarkCount: 478,
    landmarkIndexVersion: 'mediapipe-face-mesh-478-v1',
    landmarkProvider: 'unity_homuler_mediapipe',
    pixelAnalyzerVersion: 'aura-face-pixel-v1',
    trainingUseAllowed: false,
    trueDepthUsed: false,
  },
  quality: {
    ...measurements([
      'faceCount',
      'landmarkCount',
      'yawDeg',
      'pitchDeg',
      'rollDeg',
      'frontalScore',
      'centeredScore',
      'framingScore',
      'screenCoverageRatio',
      'cameraStability',
      'blurScore',
      'lightingScore',
      'overexposureRisk',
      'underexposureRisk',
      'coloredLightingRisk',
      'neutralExpressionScore',
      'eyeClosureRisk',
      'mouthOpenRisk',
      'hairlineConfidence',
      'occlusionRisk',
      'landmarkConfidence',
    ]),
    blockingReasons: [],
    cameraDistanceMeters: unavailable('truedepth_3d', 'truedepth_unavailable'),
    depthAccuracy: unavailable('truedepth_3d', 'truedepth_unavailable'),
    depthAvailable: measurement(false, 'camera_metadata'),
    depthConfidence: unavailable('truedepth_3d', 'truedepth_unavailable'),
    depthFiltered: unavailable('truedepth_3d', 'truedepth_unavailable'),
    depthMedianAbsoluteDeviationMeters: unavailable('truedepth_3d', 'truedepth_unavailable'),
    depthValidSampleRatio: unavailable('truedepth_3d', 'truedepth_unavailable'),
    facePlaneConfidence: unavailable('truedepth_3d', 'truedepth_unavailable'),
    facePlanePitchDeg: unavailable('truedepth_3d', 'truedepth_unavailable'),
    facePlaneRollDeg: unavailable('truedepth_3d', 'truedepth_unavailable'),
    facePlaneYawDeg: unavailable('truedepth_3d', 'truedepth_unavailable'),
  },
  schemaVersion: 'aura-face-profile-v1',
  status: 'full_success',
  statusReason: null,
  warnings: [],
} satisfies FaceProfileResult;

assert.equal(FACE_PROFILE_SCHEMA_VERSION, 'aura-face-profile-v1');
assert.equal(FACE_SHAPE_LABELS.length, 7);
assert.equal(sumScores(validReadyProfile.faceShape.faceShapeScores), 1);
assert.deepEqual(FACE_ANALYSIS_POSE_LIMITS, {
  yawAbsMaxDeg: 8,
  pitchAbsMaxDeg: 8,
  rollAbsMaxDeg: 5,
});
assert.ok(FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS.includes('faceBalance.upperThirdRatio'));
assert.ok(FACE_PROFILE_OPTIONAL_MEASUREMENT_PATHS.includes('quality.cameraDistanceMeters'));
assert.ok(FACE_PROFILE_OPTIONAL_MEASUREMENT_PATHS.includes('quality.facePlanePitchDeg'));

assert.equal(parseFaceProfile(validReadyProfile)?.schemaVersion, 'aura-face-profile-v1');
assert.equal(parseFaceProfile({...validReadyProfile, landmarks: []}), null);
assert.equal(parseFaceProfile({...validReadyProfile, schemaVersion: 'unknown'}), null);

const nestedRawPayload = clone(validReadyProfile);
setPath(nestedRawPayload, ['existingAnalysis', 'rawDepth'], []);
assert.equal(parseFaceProfile(nestedRawPayload), null);

const forbiddenRawFixtures: readonly {
  key: string;
  path: readonly string[];
  value: unknown;
}[] = [
  {key: 'pixels', path: ['pixels'], value: [1, 2, 3]},
  {
    key: 'polygon',
    path: ['color', 'overallFaceContrast', 'polygon'],
    value: [{x: 0.1, y: 0.2}],
  },
  {key: 'matte', path: ['quality', 'blurScore', 'matte'], value: 'opaque'},
  {
    key: 'artifactUri',
    path: ['existingAnalysis', 'artifactUri'],
    value: 'file:///tmp/raw.jpg',
  },
  {key: 'Pixels', path: ['provenance', 'Pixels'], value: []},
  {
    key: 'rawPolygons',
    path: ['faceBalance', 'faceLengthToWidth', 'rawPolygons'],
    value: [],
  },
  {
    key: 'rawArtifactUris',
    path: ['existingAnalysis', 'rawArtifactUris'],
    value: [],
  },
];
for (const fixture of forbiddenRawFixtures) {
  const profile = clone(validReadyProfile);
  setPath(profile, fixture.path, fixture.value);
  assert.equal(
    parseFaceProfile(profile),
    null,
  );
}

assert.equal(parseFaceProfile({...validReadyProfile, captureId: 'not-a-uuid'}), null);
assert.equal(parseFaceProfile({...validReadyProfile, createdAt: '2026-99-99'}), null);
assert.equal(
  parseFaceProfile({...validReadyProfile, createdAt: '2026-02-30T03:04:05.000Z'}),
  null,
);

const invalidNumericMeasurement = clone(validReadyProfile);
setPath(invalidNumericMeasurement, ['faceBalance', 'faceLengthToWidth', 'value'], '1.35');
assert.equal(parseFaceProfile(invalidNumericMeasurement), null);

const invalidBooleanMeasurement = clone(validReadyProfile);
setPath(invalidBooleanMeasurement, ['quality', 'depthAvailable', 'value'], 'false');
assert.equal(parseFaceProfile(invalidBooleanMeasurement), null);

const invalidConfidence = clone(validReadyProfile);
setPath(invalidConfidence, ['quality', 'yawDeg', 'confidence'], 1.01);
assert.equal(parseFaceProfile(invalidConfidence), null);

const nonFiniteValue = clone(validReadyProfile);
setPath(nonFiniteValue, ['mouth', 'mouthWidthRatio', 'value'], Number.NaN);
assert.equal(parseFaceProfile(nonFiniteValue), null);

const missingNullReason = clone(validReadyProfile);
setPath(missingNullReason, ['quality', 'cameraDistanceMeters'], {
  confidence: 0,
  source: 'truedepth_3d',
  value: null,
  warnings: [],
});
assert.equal(parseFaceProfile(missingNullReason), null);

const spuriousNullReason = clone(validReadyProfile);
setPath(spuriousNullReason, ['quality', 'yawDeg', 'nullReason'], 'not_needed');
assert.equal(parseFaceProfile(spuriousNullReason), null);

const unsortedTop2 = clone(validReadyProfile);
setPath(unsortedTop2, ['faceShape', 'top2'], [
  {score: 0.2, shape: 'round'},
  {score: 0.3, shape: 'oval'},
]);
assert.equal(parseFaceProfile(unsortedTop2), null);

const invalidScoreSum = clone(validReadyProfile);
setPath(invalidScoreSum, ['faceShape', 'faceShapeScores', 'oval'], 0.31);
assert.equal(parseFaceProfile(invalidScoreSum), null);

const missingRequiredFull = clone(validReadyProfile);
setPath(missingRequiredFull, ['faceBalance', 'upperThirdRatio'], unavailable('apple_semantic_matte', 'hairline_unavailable'));
assert.equal(parseFaceProfile(missingRequiredFull), null);

const validPartial = clone(missingRequiredFull);
setPath(validPartial, ['status'], 'partial_success');
setPath(validPartial, ['statusReason'], 'partial_measurements_unavailable');
assert.equal(parseFaceProfile(validPartial)?.status, 'partial_success');

const completePartial = clone(validReadyProfile);
setPath(completePartial, ['status'], 'partial_success');
setPath(completePartial, ['statusReason'], 'partial_measurements_unavailable');
assert.equal(parseFaceProfile(completePartial), null);

const blockedProfile = clone(validReadyProfile);
setPath(blockedProfile, ['status'], 'blocked');
setPath(blockedProfile, ['statusReason'], 'pose_out_of_range');
setPath(blockedProfile, ['quality', 'blockingReasons'], ['pose_out_of_range']);
setPath(blockedProfile, ['faceShape'], {
  ...validReadyProfile.faceShape,
  confidenceGap: null,
  dominantShape: null,
  explanationTraits: [],
  faceShapeScores: Object.fromEntries(FACE_SHAPE_LABELS.map(label => [label, 0])),
  overallConfidence: 0,
  status: 'blocked',
  top2: [],
});
assert.equal(parseFaceProfile(blockedProfile)?.status, 'blocked');

const guessingBlockedProfile = clone(blockedProfile);
setPath(guessingBlockedProfile, ['faceShape', 'dominantShape'], 'oval');
assert.equal(parseFaceProfile(guessingBlockedProfile), null);

const failedProfile = clone(blockedProfile);
setPath(failedProfile, ['status'], 'failed');
setPath(failedProfile, ['statusReason'], 'pipeline_failure');
setPath(failedProfile, ['quality', 'blockingReasons'], []);
for (const path of FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS) {
  setPath(failedProfile, path.split('.'), unavailable('derived', 'pipeline_failure'));
}
assert.equal(parseFaceProfile(failedProfile)?.status, 'failed');

const failedWithoutPipelineCode = clone(failedProfile);
setPath(failedWithoutPipelineCode, ['statusReason'], 'pose_unavailable');
assert.equal(parseFaceProfile(failedWithoutPipelineCode), null);

const failedWithGateReason = clone(failedProfile);
setPath(failedWithGateReason, ['statusReason'], 'pose_gate_failed');
assert.equal(parseFaceProfile(failedWithGateReason), null);

const tooManyWarnings = clone(validReadyProfile);
setPath(tooManyWarnings, ['warnings'], Array.from({length: 33}, () => 'warning'));
assert.equal(parseFaceProfile(tooManyWarnings), null);

const tooManyTraits = clone(validReadyProfile);
setPath(tooManyTraits, ['faceShape', 'explanationTraits'], Array.from({length: 9}, () => 'trait'));
assert.equal(parseFaceProfile(tooManyTraits), null);

const oversizedProfile = clone(validReadyProfile);
setPath(oversizedProfile, ['padding'], 'x'.repeat(256 * 1024));
assert.equal(parseFaceProfile(oversizedProfile), null);

const trainingEnabled = clone(validReadyProfile);
setPath(trainingEnabled, ['provenance', 'trainingUseAllowed'], true);
assert.equal(parseFaceProfile(trainingEnabled), null);

console.log('faceProfileContract tests passed');
