import type {
  FaceShapeLabel,
  FaceShapeNumericFeature,
  FaceShapeRuleFeatures,
  FaceShapeRuleResult,
} from '../../../shared/types/faceProfile';
import {FACE_SHAPE_LABELS} from '../constants/faceShapeLandmarks';
import {
  rankFaceShapeScores,
  scoreFaceShape,
  scoreGap,
} from '../index';

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
  ok(value: unknown, message = 'Expected value to be truthy') {
    if (!value) {
      throw new Error(message);
    }
  },
};

const assertCloseTo = (actual: number, expected: number, epsilon: number) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );

const NUMERIC_FEATURES: readonly FaceShapeNumericFeature[] = [
  'faceLengthToWidth',
  'faceLengthToCheekWidth',
  'foreheadWidthToCheekWidth',
  'templeWidthToCheekWidth',
  'jawWidthToCheekWidth',
  'chinWidthToCheekWidth',
  'jawAngleDeg',
  'jawSoftness',
  'chinPointedness',
  'contourRoundness',
  'cheekDominance',
  'jawWidthScore',
  'jawAngleScore',
  'foreheadDominance',
  'lowerFaceWeight',
  'contourAsymmetry',
];

const EMPTY_FEATURES: FaceShapeRuleFeatures = {
  cheekDominance: null,
  chinPointedness: null,
  chinWidthToCheekWidth: null,
  confidenceByFeature: {},
  contourAsymmetry: null,
  contourRoundness: null,
  faceLengthToCheekWidth: null,
  faceLengthToWidth: null,
  foreheadDominance: null,
  foreheadWidthToCheekWidth: null,
  jawAngleDeg: null,
  jawAngleScore: null,
  jawSoftness: null,
  jawWidthScore: null,
  jawWidthToCheekWidth: null,
  lowerFaceWeight: null,
  templeWidthToCheekWidth: null,
};

function fixture(
  values: Partial<Record<FaceShapeNumericFeature, number>>,
  confidence = 0.94,
): FaceShapeRuleFeatures {
  const features: FaceShapeRuleFeatures = {...EMPTY_FEATURES, ...values};
  features.confidenceByFeature = Object.fromEntries(
    NUMERIC_FEATURES.filter(feature => features[feature] !== null).map(feature => [
      feature,
      confidence,
    ]),
  );
  return features;
}

const GOLDEN_FIXTURES: Record<FaceShapeLabel, FaceShapeRuleFeatures> = {
  oval: fixture({
    cheekDominance: 0.76,
    chinPointedness: 0.5,
    chinWidthToCheekWidth: 0.48,
    contourAsymmetry: 0.03,
    contourRoundness: 0.62,
    faceLengthToCheekWidth: 1.5,
    faceLengthToWidth: 1.42,
    foreheadDominance: 0.48,
    foreheadWidthToCheekWidth: 0.95,
    jawAngleDeg: 124,
    jawAngleScore: 0.48,
    jawSoftness: 0.82,
    jawWidthScore: 0.45,
    jawWidthToCheekWidth: 0.82,
    lowerFaceWeight: 0.45,
    templeWidthToCheekWidth: 0.94,
  }),
  round: fixture({
    cheekDominance: 0.55,
    chinPointedness: 0.22,
    chinWidthToCheekWidth: 0.58,
    contourAsymmetry: 0.02,
    contourRoundness: 0.96,
    faceLengthToCheekWidth: 1.23,
    faceLengthToWidth: 1.16,
    foreheadDominance: 0.45,
    foreheadWidthToCheekWidth: 0.96,
    jawAngleDeg: 122,
    jawAngleScore: 0.3,
    jawSoftness: 0.94,
    jawWidthScore: 0.62,
    jawWidthToCheekWidth: 0.88,
    lowerFaceWeight: 0.5,
    templeWidthToCheekWidth: 0.96,
  }),
  square: fixture({
    cheekDominance: 0.24,
    chinPointedness: 0.18,
    chinWidthToCheekWidth: 0.66,
    contourAsymmetry: 0.04,
    contourRoundness: 0.12,
    faceLengthToCheekWidth: 1.39,
    faceLengthToWidth: 1.32,
    foreheadDominance: 0.38,
    foreheadWidthToCheekWidth: 0.97,
    jawAngleDeg: 138,
    jawAngleScore: 0.96,
    jawSoftness: 0.12,
    jawWidthScore: 0.97,
    jawWidthToCheekWidth: 0.99,
    lowerFaceWeight: 0.76,
    templeWidthToCheekWidth: 0.97,
  }),
  heart: fixture({
    cheekDominance: 0.68,
    chinPointedness: 0.95,
    chinWidthToCheekWidth: 0.3,
    contourAsymmetry: 0.03,
    contourRoundness: 0.42,
    faceLengthToCheekWidth: 1.43,
    faceLengthToWidth: 1.35,
    foreheadDominance: 0.96,
    foreheadWidthToCheekWidth: 1.09,
    jawAngleDeg: 119,
    jawAngleScore: 0.45,
    jawSoftness: 0.58,
    jawWidthScore: 0.22,
    jawWidthToCheekWidth: 0.68,
    lowerFaceWeight: 0.22,
    templeWidthToCheekWidth: 1.05,
  }),
  oblong: fixture({
    cheekDominance: 0.23,
    chinPointedness: 0.42,
    chinWidthToCheekWidth: 0.58,
    contourAsymmetry: 0.03,
    contourRoundness: 0.24,
    faceLengthToCheekWidth: 1.79,
    faceLengthToWidth: 1.69,
    foreheadDominance: 0.42,
    foreheadWidthToCheekWidth: 0.95,
    jawAngleDeg: 128,
    jawAngleScore: 0.55,
    jawSoftness: 0.54,
    jawWidthScore: 0.64,
    jawWidthToCheekWidth: 0.92,
    lowerFaceWeight: 0.54,
    templeWidthToCheekWidth: 0.94,
  }),
  diamond: fixture({
    cheekDominance: 0.98,
    chinPointedness: 0.78,
    chinWidthToCheekWidth: 0.31,
    contourAsymmetry: 0.03,
    contourRoundness: 0.32,
    faceLengthToCheekWidth: 1.5,
    faceLengthToWidth: 1.43,
    foreheadDominance: 0.18,
    foreheadWidthToCheekWidth: 0.78,
    jawAngleDeg: 123,
    jawAngleScore: 0.52,
    jawSoftness: 0.48,
    jawWidthScore: 0.24,
    jawWidthToCheekWidth: 0.69,
    lowerFaceWeight: 0.3,
    templeWidthToCheekWidth: 0.83,
  }),
  triangle: fixture({
    cheekDominance: 0.18,
    chinPointedness: 0.18,
    chinWidthToCheekWidth: 0.68,
    contourAsymmetry: 0.03,
    contourRoundness: 0.18,
    faceLengthToCheekWidth: 1.41,
    faceLengthToWidth: 1.34,
    foreheadDominance: 0.08,
    foreheadWidthToCheekWidth: 0.75,
    jawAngleDeg: 135,
    jawAngleScore: 0.9,
    jawSoftness: 0.28,
    jawWidthScore: 0.98,
    jawWidthToCheekWidth: 1.03,
    lowerFaceWeight: 0.98,
    templeWidthToCheekWidth: 0.79,
  }),
};

for (const shape of FACE_SHAPE_LABELS) {
  const result: FaceShapeRuleResult = scoreFaceShape(GOLDEN_FIXTURES[shape]);
  assert.equal(result.dominantShape, shape);
  assertCloseTo(
    Object.values(result.faceShapeScores).reduce((sum, score) => sum + score, 0),
    1,
    1e-6,
  );
  assert.equal(result.top2.length, 2);
  assert.ok(result.top2[0].score >= result.top2[1].score);
}

assert.equal(scoreGap(0.5, 0.41).status, 'mixed');
assert.equal(scoreGap(0.5, 0.4).status, 'ready');
assert.equal(scoreGap(0.5, 0.4000000000000001).status, 'ready');

const tiedScores = Object.fromEntries(
  FACE_SHAPE_LABELS.map(shape => [shape, 1 / FACE_SHAPE_LABELS.length]),
) as Record<FaceShapeLabel, number>;
assert.deepEqual(
  rankFaceShapeScores(tiedScores).map(
    (item: {shape: FaceShapeLabel; score: number}) => item.shape,
  ),
  ['oval', 'round'],
);

const blockedResult: FaceShapeRuleResult = scoreFaceShape(
  fixture({
    faceLengthToWidth: 1.4,
    foreheadDominance: 0.8,
    jawWidthToCheekWidth: 0.8,
  }),
);
assert.equal(blockedResult.status, 'blocked');
assertCloseTo(
  Object.values(blockedResult.faceShapeScores).reduce(
    (sum, score) => sum + score,
    0,
  ),
  0,
  1e-6,
);
assert.deepEqual(blockedResult.top2, []);
assert.equal(blockedResult.dominantShape, null);

const sparseResult: FaceShapeRuleResult = scoreFaceShape(
  fixture({
    chinPointedness: 0.5,
    faceLengthToWidth: 1.42,
    jawSoftness: 0.9,
    jawWidthToCheekWidth: 0.82,
  }),
);
assert.equal(sparseResult.status === 'blocked', false);
assert.ok(
  sparseResult.explanationTraits.every(
    (trait: string) => trait !== '둥근 얼굴 윤곽이 뚜렷해요',
  ),
  'A missing contourRoundness must not contribute as zero',
);

const highConfidence = scoreFaceShape(GOLDEN_FIXTURES.oval);
const lowConfidence = scoreFaceShape(
  fixture(
    Object.fromEntries(
      NUMERIC_FEATURES.flatMap(feature => {
        const value = GOLDEN_FIXTURES.oval[feature];
        return value === null ? [] : [[feature, value]];
      }),
    ),
    0.2,
  ),
);
const sparseConfidence = scoreFaceShape(
  fixture({
    chinPointedness: 0.5,
    contourRoundness: 0.62,
    faceLengthToWidth: 1.42,
    jawWidthToCheekWidth: 0.82,
  }),
);
const asymmetric = scoreFaceShape({
  ...GOLDEN_FIXTURES.oval,
  contourAsymmetry: 0.8,
});
assert.ok(highConfidence.overallConfidence > lowConfidence.overallConfidence);
assert.ok(highConfidence.overallConfidence > sparseConfidence.overallConfidence);
assert.ok(highConfidence.overallConfidence > asymmetric.overallConfidence);

console.log('faceShapeRuleScorer tests passed');
