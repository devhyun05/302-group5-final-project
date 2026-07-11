import type {FaceShapeRuleResult} from '../../../shared/types/faceProfile';
import {getFaceShapePresentation} from '../index';

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

function result(
  firstScore: number,
  secondScore: number,
  status: FaceShapeRuleResult['status'],
): FaceShapeRuleResult {
  return {
    classifierType: 'rule_v1',
    classifierVersion: 'rule_v1.0.0',
    confidenceGap:
      status === 'blocked' ? null : Math.max(0, firstScore - secondScore),
    dominantShape: status === 'blocked' ? null : 'oval',
    explanationTraits: [],
    faceShapeScores: {
      diamond: 0,
      heart: 0,
      oblong: 0,
      oval: status === 'blocked' ? 0 : firstScore,
      round: status === 'blocked' ? 0 : secondScore,
      square: 0,
      triangle: 0,
    },
    overallConfidence: status === 'blocked' ? 0 : 0.88,
    ruleFeatures: {
      cheekDominance: null,
      chinPointedness: null,
      chinWidthToCheekWidth: null,
      contourAsymmetry: null,
      contourRoundness: null,
      faceLengthToCheekWidth: null,
      faceLengthToWidth: null,
      foreheadDominance: null,
      foreheadWidthToCheekWidth: null,
      frontalConfidence: 0,
      hairlineConfidence: 0,
      jawAngleDeg: null,
      jawAngleScore: null,
      jawSoftness: null,
      jawWidthScore: null,
      jawWidthToCheekWidth: null,
      landmarkConfidence: 0,
      lowerFaceWeight: null,
      templeWidthToCheekWidth: null,
    },
    status,
    top2:
      status === 'blocked'
        ? []
        : [
            {score: firstScore, shape: 'oval'},
            {score: secondScore, shape: 'round'},
          ],
    warnings: status === 'blocked' ? ['insufficient_core_features'] : [],
  };
}

assert.equal(
  getFaceShapePresentation(result(0.5, 0.41, 'mixed')).headline,
  '타원형과 둥근형이 함께 보여요',
);
assert.equal(
  getFaceShapePresentation(result(0.5, 0.4, 'ready')).headline,
  '타원형에 조금 더 가까워요',
);
assert.equal(
  getFaceShapePresentation(result(0.55, 0.35, 'ready')).headline,
  '타원형 얼굴형이에요',
);

const blocked = getFaceShapePresentation(result(0, 0, 'blocked'));
assert.equal(blocked.headline, '얼굴형을 판단할 정보가 부족해요');
assert.equal(
  blocked.detail,
  '얼굴 윤곽이 잘 보이도록 정면에서 다시 촬영해 주세요.',
);
assert.ok(!blocked.headline.includes('확률'));
assert.ok(!blocked.detail.includes('확률'));

console.log('faceProfilePresentation tests passed');
