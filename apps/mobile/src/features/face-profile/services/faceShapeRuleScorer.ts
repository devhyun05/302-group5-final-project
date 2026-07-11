import type {
  FaceShapeLabel,
  FaceShapeNumericFeature,
  FaceShapeRuleFeatureSummary,
  FaceShapeRuleFeatures,
  FaceShapeRuleResult,
} from '../../../shared/types/faceProfile';
import {FACE_SHAPE_LABELS} from '../constants/faceShapeLandmarks';
import {FACE_SHAPE_SCORE_TOLERANCE} from './faceProfileContract';

const CLASSIFIER_VERSION = 'rule_v1.0.0';
const GAP_THRESHOLD = 0.1;
const GAP_EPSILON = 1e-9;
const RULE_SCORE_ZERO_EPSILON = 1e-12;

const CORE_FEATURES = [
  'faceLengthToWidth',
  'jawWidthToCheekWidth',
  'chinPointedness',
  'contourRoundness',
] as const satisfies readonly FaceShapeNumericFeature[];

const NUMERIC_FEATURES = [
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
] as const satisfies readonly FaceShapeNumericFeature[];

type Membership = (value: number) => number;

type TraitRule = {
  feature: FaceShapeNumericFeature;
  membership: Membership;
  trait: string;
  weight: number;
};

type TraitContribution = {
  amount: number;
  order: number;
  trait: string;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function low(fullThrough: number, zeroAt: number): Membership {
  return value => {
    if (value <= fullThrough) {
      return 1;
    }
    if (value >= zeroAt) {
      return 0;
    }
    return (zeroAt - value) / (zeroAt - fullThrough);
  };
}

function high(zeroThrough: number, fullAt: number): Membership {
  return value => {
    if (value <= zeroThrough) {
      return 0;
    }
    if (value >= fullAt) {
      return 1;
    }
    return (value - zeroThrough) / (fullAt - zeroThrough);
  };
}

function band(
  lowZero: number,
  lowFull: number,
  highFull: number,
  highZero: number,
): Membership {
  return value => {
    if (value <= lowZero || value >= highZero) {
      return 0;
    }
    if (value >= lowFull && value <= highFull) {
      return 1;
    }
    if (value < lowFull) {
      return (value - lowZero) / (lowFull - lowZero);
    }
    return (highZero - value) / (highZero - highFull);
  };
}

const RULES: Record<FaceShapeLabel, readonly TraitRule[]> = {
  oval: [
    {
      feature: 'faceLengthToWidth',
      membership: band(1.24, 1.36, 1.5, 1.6),
      trait: '세로와 가로 비율이 균형에 가까워요',
      weight: 1.35,
    },
    {
      feature: 'faceLengthToCheekWidth',
      membership: band(1.3, 1.42, 1.58, 1.68),
      trait: '얼굴 길이가 중간 범위예요',
      weight: 1,
    },
    {
      feature: 'cheekDominance',
      membership: band(0.12, 0.2, 0.32, 0.42),
      trait: '광대 폭이 자연스럽게 중심을 잡아요',
      weight: 1.05,
    },
    {
      feature: 'jawSoftness',
      membership: high(0.42, 0.72),
      trait: '턱선이 부드럽게 이어져요',
      weight: 1.1,
    },
    {
      feature: 'chinPointedness',
      membership: band(0.45, 0.6, 0.82, 0.9),
      trait: '턱끝이 중간 정도로 모여요',
      weight: 0.9,
    },
    {
      feature: 'contourRoundness',
      membership: band(0.78, 0.86, 0.94, 0.985),
      trait: '윤곽에 완만한 곡선이 보여요',
      weight: 0.85,
    },
    {
      feature: 'jawWidthToCheekWidth',
      membership: band(0.67, 0.76, 0.88, 0.96),
      trait: '광대에서 턱까지 폭이 완만하게 좁아져요',
      weight: 0.8,
    },
  ],
  round: [
    {
      feature: 'faceLengthToWidth',
      membership: low(1.19, 1.3),
      trait: '세로 길이가 비교적 짧아요',
      weight: 1.35,
    },
    {
      feature: 'faceLengthToCheekWidth',
      membership: low(1.24, 1.34),
      trait: '얼굴 길이와 광대 폭이 가까워요',
      weight: 0.9,
    },
    {
      feature: 'contourRoundness',
      membership: high(0.58, 0.82),
      trait: '둥근 얼굴 윤곽이 뚜렷해요',
      weight: 1.35,
    },
    {
      feature: 'jawSoftness',
      membership: high(0.58, 0.82),
      trait: '턱선이 부드럽게 보여요',
      weight: 1,
    },
    {
      feature: 'chinPointedness',
      membership: low(0.28, 0.5),
      trait: '턱끝이 완만해요',
      weight: 0.8,
    },
    {
      feature: 'jawAngleScore',
      membership: low(0.32, 0.62),
      trait: '턱의 각이 완만해요',
      weight: 0.6,
    },
  ],
  square: [
    {
      feature: 'faceLengthToWidth',
      membership: band(1.16, 1.25, 1.42, 1.54),
      trait: '세로와 가로 비율이 중간 범위예요',
      weight: 0.85,
    },
    {
      feature: 'jawWidthToCheekWidth',
      membership: high(0.78, 0.86),
      trait: '턱 폭이 광대 폭에 가까워요',
      weight: 1.35,
    },
    {
      feature: 'jawSoftness',
      membership: low(0.22, 0.5),
      trait: '턱선의 각이 또렷해요',
      weight: 1.05,
    },
    {
      feature: 'jawAngleDeg',
      membership: high(127, 136),
      trait: '턱 각도가 크게 측정됐어요',
      weight: 1,
    },
    {
      feature: 'jawWidthScore',
      membership: high(0.76, 0.86),
      trait: '아래 얼굴의 폭이 넓어요',
      weight: 0.95,
    },
    {
      feature: 'jawAngleScore',
      membership: high(0.66, 0.86),
      trait: '턱 모서리가 선명해요',
      weight: 0.9,
    },
    {
      feature: 'contourRoundness',
      membership: low(0.22, 0.52),
      trait: '윤곽의 직선감이 보여요',
      weight: 0.75,
    },
  ],
  heart: [
    {
      feature: 'foreheadDominance',
      membership: high(0.34, 0.43),
      trait: '이마 쪽 폭이 도드라져요',
      weight: 1.25,
    },
    {
      feature: 'foreheadWidthToCheekWidth',
      membership: high(0.48, 0.525),
      trait: '이마 폭이 광대 폭과 비슷하거나 넓어요',
      weight: 1,
    },
    {
      feature: 'jawWidthToCheekWidth',
      membership: low(0.66, 0.76),
      trait: '턱 폭이 광대보다 좁아요',
      weight: 1,
    },
    {
      feature: 'chinWidthToCheekWidth',
      membership: low(0.14, 0.22),
      trait: '턱끝 폭이 좁아요',
      weight: 0.9,
    },
    {
      feature: 'chinPointedness',
      membership: high(0.68, 0.78),
      trait: '턱끝이 뾰족하게 모여요',
      weight: 1.2,
    },
    {
      feature: 'lowerFaceWeight',
      membership: low(0.3, 0.54),
      trait: '아래 얼굴의 폭이 가벼워요',
      weight: 0.8,
    },
  ],
  oblong: [
    {
      feature: 'faceLengthToWidth',
      membership: high(1.48, 1.64),
      trait: '세로 길이가 길게 측정됐어요',
      weight: 1.45,
    },
    {
      feature: 'faceLengthToCheekWidth',
      membership: high(1.57, 1.73),
      trait: '광대 폭에 비해 얼굴 길이가 길어요',
      weight: 1.15,
    },
    {
      feature: 'foreheadWidthToCheekWidth',
      membership: band(0.43, 0.47, 0.52, 0.56),
      trait: '이마와 광대 폭이 비교적 일정해요',
      weight: 0.65,
    },
    {
      feature: 'templeWidthToCheekWidth',
      membership: band(0.84, 0.9, 1, 1.07),
      trait: '관자와 광대 폭이 비교적 일정해요',
      weight: 0.65,
    },
    {
      feature: 'jawWidthToCheekWidth',
      membership: band(0.7, 0.74, 0.82, 0.86),
      trait: '광대와 턱 폭 차이가 크지 않아요',
      weight: 0.7,
    },
    {
      feature: 'contourRoundness',
      membership: low(0.32, 0.62),
      trait: '옆 윤곽이 길고 완만해요',
      weight: 0.55,
    },
  ],
  diamond: [
    {
      feature: 'cheekDominance',
      membership: high(0.2, 0.34),
      trait: '광대 폭이 가장 도드라져요',
      weight: 1.35,
    },
    {
      feature: 'foreheadWidthToCheekWidth',
      membership: low(0.43, 0.49),
      trait: '이마 폭이 광대보다 좁아요',
      weight: 1,
    },
    {
      feature: 'templeWidthToCheekWidth',
      membership: low(0.8, 0.9),
      trait: '관자 폭이 광대보다 좁아요',
      weight: 0.85,
    },
    {
      feature: 'jawWidthToCheekWidth',
      membership: low(0.69, 0.78),
      trait: '턱 폭이 광대보다 좁아요',
      weight: 1,
    },
    {
      feature: 'chinWidthToCheekWidth',
      membership: low(0.14, 0.22),
      trait: '턱끝 폭이 좁아요',
      weight: 0.85,
    },
    {
      feature: 'chinPointedness',
      membership: high(0.68, 0.78),
      trait: '턱끝이 모이는 편이에요',
      weight: 0.75,
    },
    {
      feature: 'foreheadDominance',
      membership: low(0.36, 0.44),
      trait: '이마보다 광대가 중심을 잡아요',
      weight: 0.65,
    },
  ],
  triangle: [
    {
      feature: 'lowerFaceWeight',
      membership: high(0.64, 0.86),
      trait: '아래 얼굴의 폭이 도드라져요',
      weight: 1.35,
    },
    {
      feature: 'jawWidthToCheekWidth',
      membership: high(0.84, 0.91),
      trait: '턱 폭이 광대 폭만큼 넓어요',
      weight: 1.5,
    },
    {
      feature: 'foreheadWidthToCheekWidth',
      membership: low(0.42, 0.49),
      trait: '이마 폭이 아래 얼굴보다 좁아요',
      weight: 1,
    },
    {
      feature: 'templeWidthToCheekWidth',
      membership: low(0.78, 0.9),
      trait: '관자 폭이 비교적 좁아요',
      weight: 0.75,
    },
    {
      feature: 'jawWidthScore',
      membership: high(0.82, 0.91),
      trait: '턱 폭 점수가 높아요',
      weight: 1.3,
    },
    {
      feature: 'foreheadDominance',
      membership: low(0.25, 0.36),
      trait: '이마보다 아래 얼굴이 중심을 잡아요',
      weight: 1,
    },
    {
      feature: 'cheekDominance',
      membership: low(0.1, 0.24),
      trait: '광대보다 턱 쪽 폭이 도드라져요',
      weight: 0.65,
    },
  ],
};

function finiteValue(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeFeatures(
  features: FaceShapeRuleFeatures,
): Record<FaceShapeNumericFeature, number | null> {
  return Object.fromEntries(
    NUMERIC_FEATURES.map(feature => [feature, finiteValue(features[feature])]),
  ) as Record<FaceShapeNumericFeature, number | null>;
}

function confidenceFor(
  features: FaceShapeRuleFeatures,
  feature: FaceShapeNumericFeature,
): number {
  const confidence = features.confidenceByFeature[feature];
  return typeof confidence === 'number' && Number.isFinite(confidence)
    ? clamp01(confidence)
    : 0;
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function featureConfidenceAverage(
  features: FaceShapeRuleFeatures,
  sanitized: Record<FaceShapeNumericFeature, number | null>,
  selectedFeatures: readonly FaceShapeNumericFeature[],
): number {
  return average(
    selectedFeatures
      .filter(feature => sanitized[feature] !== null)
      .map(feature => confidenceFor(features, feature)),
  );
}

function ruleFeatureSummary(
  features: FaceShapeRuleFeatures,
  sanitized: Record<FaceShapeNumericFeature, number | null>,
): FaceShapeRuleFeatureSummary {
  return {
    cheekDominance: sanitized.cheekDominance,
    chinPointedness: sanitized.chinPointedness,
    chinWidthToCheekWidth: sanitized.chinWidthToCheekWidth,
    contourAsymmetry: sanitized.contourAsymmetry,
    contourRoundness: sanitized.contourRoundness,
    faceLengthToCheekWidth: sanitized.faceLengthToCheekWidth,
    faceLengthToWidth: sanitized.faceLengthToWidth,
    foreheadDominance: sanitized.foreheadDominance,
    foreheadWidthToCheekWidth: sanitized.foreheadWidthToCheekWidth,
    frontalConfidence: featureConfidenceAverage(
      features,
      sanitized,
      CORE_FEATURES,
    ),
    hairlineConfidence: featureConfidenceAverage(features, sanitized, [
      'foreheadWidthToCheekWidth',
      'templeWidthToCheekWidth',
      'foreheadDominance',
    ]),
    jawAngleDeg: sanitized.jawAngleDeg,
    jawAngleScore: sanitized.jawAngleScore,
    jawSoftness: sanitized.jawSoftness,
    jawWidthScore: sanitized.jawWidthScore,
    jawWidthToCheekWidth: sanitized.jawWidthToCheekWidth,
    landmarkConfidence: featureConfidenceAverage(
      features,
      sanitized,
      NUMERIC_FEATURES,
    ),
    lowerFaceWeight: sanitized.lowerFaceWeight,
    templeWidthToCheekWidth: sanitized.templeWidthToCheekWidth,
  };
}

function emptyScores(): Record<FaceShapeLabel, number> {
  return Object.fromEntries(
    FACE_SHAPE_LABELS.map(shape => [shape, 0]),
  ) as Record<FaceShapeLabel, number>;
}

function scoreRules(
  rules: readonly TraitRule[],
  features: Record<FaceShapeNumericFeature, number | null>,
): {contributions: TraitContribution[]; score: number} {
  let availableWeight = 0;
  let weightedMembership = 0;
  const contributions: TraitContribution[] = [];

  rules.forEach((rule, order) => {
    const value = features[rule.feature];
    if (value === null) {
      return;
    }
    availableWeight += rule.weight;
    const membership = clamp01(rule.membership(value));
    const amount = membership * rule.weight;
    weightedMembership += amount;
    if (amount > RULE_SCORE_ZERO_EPSILON) {
      contributions.push({amount, order, trait: rule.trait});
    }
  });

  return {
    contributions,
    score: availableWeight > 0 ? weightedMembership / availableWeight : 0,
  };
}

function normalizeScores(
  scores: Record<FaceShapeLabel, number>,
): {scores: Record<FaceShapeLabel, number>; usedUniformFallback: boolean} {
  const total = FACE_SHAPE_LABELS.reduce(
    (sum, shape) => sum + scores[shape],
    0,
  );
  if (total <= RULE_SCORE_ZERO_EPSILON) {
    const uniformScore = 1 / FACE_SHAPE_LABELS.length;
    return {
      scores: Object.fromEntries(
        FACE_SHAPE_LABELS.map(shape => [shape, uniformScore]),
      ) as Record<FaceShapeLabel, number>,
      usedUniformFallback: true,
    };
  }
  return {
    scores: Object.fromEntries(
      FACE_SHAPE_LABELS.map(shape => [shape, scores[shape] / total]),
    ) as Record<FaceShapeLabel, number>,
    usedUniformFallback: false,
  };
}

function overallConfidence(
  features: FaceShapeRuleFeatures,
  sanitized: Record<FaceShapeNumericFeature, number | null>,
): number {
  const availableFeatures = NUMERIC_FEATURES.filter(
    feature => sanitized[feature] !== null,
  );
  const measurementConfidence = average(
    availableFeatures.map(feature => confidenceFor(features, feature)),
  );
  const availability = availableFeatures.length / NUMERIC_FEATURES.length;
  const asymmetry = sanitized.contourAsymmetry;
  const asymmetryPenalty =
    asymmetry === null ? 1 : 1 - 0.45 * clamp01(asymmetry);
  return clamp01(
    (measurementConfidence * 0.55 + availability * 0.45) * asymmetryPenalty,
  );
}

export function rankFaceShapeScores(
  scores: Record<FaceShapeLabel, number>,
): Array<{shape: FaceShapeLabel; score: number}> {
  return FACE_SHAPE_LABELS.map((shape, order) => ({
    order,
    score: scores[shape],
    shape,
  }))
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      return Math.abs(scoreDifference) <= FACE_SHAPE_SCORE_TOLERANCE
        ? left.order - right.order
        : scoreDifference;
    })
    .slice(0, 2)
    .map(({score, shape}) => ({score, shape}));
}

export function scoreGap(
  firstScore: number,
  secondScore: number,
): {gap: number; status: 'ready' | 'mixed'} {
  const gap = Math.max(0, firstScore - secondScore);
  return {
    gap,
    status: gap + GAP_EPSILON >= GAP_THRESHOLD ? 'ready' : 'mixed',
  };
}

export function scoreFaceShape(
  features: FaceShapeRuleFeatures,
): FaceShapeRuleResult {
  const sanitized = sanitizeFeatures(features);
  const summary = ruleFeatureSummary(features, sanitized);
  const availableCoreCount = CORE_FEATURES.filter(
    feature => sanitized[feature] !== null,
  ).length;

  if (availableCoreCount < 3) {
    return {
      classifierType: 'rule_v1',
      classifierVersion: CLASSIFIER_VERSION,
      confidenceGap: null,
      dominantShape: null,
      explanationTraits: [],
      faceShapeScores: emptyScores(),
      overallConfidence: 0,
      ruleFeatures: summary,
      status: 'blocked',
      top2: [],
      warnings: ['insufficient_core_features'],
    };
  }

  const rawScores = emptyScores();
  const contributions = new Map<FaceShapeLabel, TraitContribution[]>();
  for (const shape of FACE_SHAPE_LABELS) {
    const ruleScore = scoreRules(RULES[shape], sanitized);
    rawScores[shape] = ruleScore.score;
    contributions.set(shape, ruleScore.contributions);
  }

  const normalized = normalizeScores(rawScores);
  const top2 = rankFaceShapeScores(normalized.scores);
  const gap = scoreGap(top2[0].score, top2[1].score);
  const dominantShape = top2[0].shape;
  const explanationTraits = [...(contributions.get(dominantShape) ?? [])]
    .sort(
      (left, right) =>
        right.amount - left.amount || left.order - right.order,
    )
    .map(contribution => contribution.trait)
    .filter((trait, index, traits) => traits.indexOf(trait) === index)
    .slice(0, 3);

  return {
    classifierType: 'rule_v1',
    classifierVersion: CLASSIFIER_VERSION,
    confidenceGap: gap.gap,
    dominantShape,
    explanationTraits,
    faceShapeScores: normalized.scores,
    overallConfidence: overallConfidence(features, sanitized),
    ruleFeatures: summary,
    status: gap.status,
    top2,
    warnings: normalized.usedUniformFallback ? ['no_rule_membership'] : [],
  };
}
