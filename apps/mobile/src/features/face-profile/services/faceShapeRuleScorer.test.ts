import type {
  FaceShapeLabel,
  FaceShapeNumericFeature,
  FaceShapeRuleFeatures,
  FaceShapeRuleResult,
} from '../../../shared/types/faceProfile';
import {FACE_SHAPE_LABELS} from '../constants/faceShapeLandmarks';
import {extractFaceShapeRuleFixture} from './faceProfileGeometry.testFixtures';
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

const GOLDEN_FIXTURES = Object.fromEntries(
  FACE_SHAPE_LABELS.map(shape => [shape, extractFaceShapeRuleFixture(shape)]),
) as Record<FaceShapeLabel, FaceShapeRuleFeatures>;

const requireFeature = (
  features: FaceShapeRuleFeatures,
  feature: FaceShapeNumericFeature,
): number => {
  const value = features[feature];
  assert.ok(value !== null, `${feature} must be extracted`);
  return value as number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const misclassifiedFixtures: string[] = [];
const weakMarginFixtures: string[] = [];

for (const shape of FACE_SHAPE_LABELS) {
  const features = GOLDEN_FIXTURES[shape];
  const jawWidth = requireFeature(features, 'jawWidthToCheekWidth');
  const chinWidth = requireFeature(features, 'chinWidthToCheekWidth');
  const jawAngleDeg = requireFeature(features, 'jawAngleDeg');
  const jawAngleScore = requireFeature(features, 'jawAngleScore');
  const contourRoundness = requireFeature(features, 'contourRoundness');

  assertCloseTo(
    requireFeature(features, 'chinPointedness'),
    clamp01(1 - chinWidth / jawWidth),
    1e-8,
  );
  assertCloseTo(jawAngleScore, clamp01(jawAngleDeg / 180), 1e-8);
  assertCloseTo(
    requireFeature(features, 'cheekDominance'),
    clamp01(1 - jawWidth),
    1e-8,
  );
  assertCloseTo(
    requireFeature(features, 'jawWidthScore'),
    clamp01(jawWidth),
    1e-8,
  );
  assertCloseTo(
    requireFeature(features, 'jawSoftness'),
    (jawAngleScore + contourRoundness) / 2,
    1e-8,
  );

  const result: FaceShapeRuleResult = scoreFaceShape(features);
  if (result.dominantShape !== shape) {
    misclassifiedFixtures.push(`${shape}->${String(result.dominantShape)}`);
  }
  if ((result.confidenceGap ?? 0) < 0.01) {
    weakMarginFixtures.push(shape);
  }
  assertCloseTo(
    Object.values(result.faceShapeScores).reduce((sum, score) => sum + score, 0),
    1,
    1e-6,
  );
  assert.equal(result.top2.length, 2);
  assert.ok(result.top2[0].score >= result.top2[1].score);
}
assert.deepEqual(misclassifiedFixtures, []);
assert.deepEqual(weakMarginFixtures, []);

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

const nearTiedScores: Record<FaceShapeLabel, number> = {
  ...tiedScores,
  oval: 0.25,
  round: 0.2500005,
};
assert.deepEqual(
  rankFaceShapeScores(nearTiedScores).map(item => item.shape),
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
