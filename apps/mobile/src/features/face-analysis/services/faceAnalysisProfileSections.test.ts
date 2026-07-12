import {validReadyProfile} from '../../face-profile/services/faceProfileContract.test';
import {buildFailedFaceProfile} from '../../face-profile/services/faceProfileBuilder';
import type {FaceProfileResult} from '../../../shared/types/faceProfile';
import {
  FACE_PROFILE_SECTION_IDS,
  buildFaceAnalysisProfileSections,
  buildFaceAnalysisProfileSectionsFromReport,
  getFaceProfileSummaryLabel,
} from './faceAnalysisProfileSections';

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
  includes(actual: string, expected: string) {
    if (!actual.includes(expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to include ${expected}`);
    }
  },
};

function sectionById(
  sections: ReturnType<typeof buildFaceAnalysisProfileSections>,
  id: (typeof FACE_PROFILE_SECTION_IDS)[number],
) {
  const section = sections.find(candidate => candidate.id === id);
  if (!section) {
    throw new Error(`Missing section ${id}`);
  }
  return section;
}

const readyProfile: FaceProfileResult = {
  ...validReadyProfile,
  faceShape: {
    ...validReadyProfile.faceShape,
    confidenceGap: 0.25,
    explanationTraits: ['balanced_length', 'soft_jaw'],
    top2: [
      {score: 0.4, shape: 'oval'},
      {score: 0.15, shape: 'round'},
    ],
  },
};
const readySections = buildFaceAnalysisProfileSections(readyProfile);
assert.deepEqual(
  readySections.map(section => section.id),
  FACE_PROFILE_SECTION_IDS,
);

const readyShape = sectionById(readySections, 'face_shape');
if (!('faceShape' in readyShape)) {
  throw new Error('Face shape section lacks faceShape presentation');
}
assert.equal(readyShape.faceShape.headline, '타원형 얼굴형이에요');
assert.equal(readyShape.faceShape.topTwo.length, 2);
assert.equal(readyShape.faceShape.topTwo[0].label, '타원형');
assert.includes(readyShape.faceShape.topTwo[0].scoreLabel, '40%');
assert.equal(
  readyShape.faceShape.traits.every(trait => !trait.includes('_')),
  true,
);

const unknownTraitShape = sectionById(
  buildFaceAnalysisProfileSections({
    ...readyProfile,
    faceShape: {
      ...readyProfile.faceShape,
      explanationTraits: ['futureTraitCode'],
    },
  }),
  'face_shape',
);
if (!('faceShape' in unknownTraitShape)) {
  throw new Error('Unknown-trait profile lacks faceShape presentation');
}
assert.equal(
  unknownTraitShape.faceShape.traits.join(' ').includes('futureTraitCode'),
  false,
);
assert.equal(unknownTraitShape.faceShape.traits[0].length > 0, true);

const balance = sectionById(readySections, 'face_balance');
const eyesBrows = sectionById(readySections, 'eyes_brows');
const noseMouth = sectionById(readySections, 'nose_mouth');
const skinColor = sectionById(readySections, 'skin_color');
const quality = sectionById(readySections, 'quality');
assert.equal(balance.measurements.length, Object.keys(readyProfile.faceBalance).length);
assert.equal(eyesBrows.measurements.length, Object.keys(readyProfile.eyesAndBrows).length);
assert.equal(
  noseMouth.measurements.length,
  Object.keys(readyProfile.nose).length + Object.keys(readyProfile.mouth).length,
);
assert.equal(skinColor.measurements.length, Object.keys(readyProfile.color).length);
assert.equal(noseMouth.interpretation.includes('살폈봤어요'), false);
assert.includes(noseMouth.interpretation, '살펴봤어요');
assert.equal(
  quality.measurements.length,
  Object.keys(readyProfile.quality).length - 1,
);
assert.equal(balance.measurements.some(item => item.isKey), true);
assert.equal(quality.measurements.some(item => item.sourceLabel.length > 0), true);
if (!('quality' in quality)) {
  throw new Error('Quality section lacks quality presentation');
}
assert.includes(quality.quality.trueDepthLabel, '2D');

const mixedSections = buildFaceAnalysisProfileSections({
  ...readyProfile,
  faceShape: {
    ...readyProfile.faceShape,
    confidenceGap: 0.05,
    status: 'mixed',
    top2: [
      {score: 0.31, shape: 'oval'},
      {score: 0.26, shape: 'round'},
    ],
  },
});
const mixedShape = sectionById(mixedSections, 'face_shape');
if (!('faceShape' in mixedShape)) {
  throw new Error('Mixed profile lacks faceShape presentation');
}
assert.equal(
  mixedShape.faceShape.headline,
  '타원형과 둥근형이 함께 보여요',
);

const blockedProfile: FaceProfileResult = {
  ...readyProfile,
  faceShape: {
    ...readyProfile.faceShape,
    confidenceGap: null,
    dominantShape: null,
    explanationTraits: [],
    faceShapeScores: {
      diamond: 0,
      heart: 0,
      oblong: 0,
      oval: 0,
      round: 0,
      square: 0,
      triangle: 0,
    },
    overallConfidence: 0,
    status: 'blocked',
    top2: [],
  },
  quality: {
    ...readyProfile.quality,
    blockingReasons: ['multiple_faces'],
  },
  status: 'blocked',
  statusReason: 'multiple_faces',
};
const blockedSections = buildFaceAnalysisProfileSections(blockedProfile);
const blockedShape = sectionById(blockedSections, 'face_shape');
if (!('faceShape' in blockedShape)) {
  throw new Error('Blocked profile lacks faceShape presentation');
}
assert.equal(blockedShape.faceShape.topTwo.length, 0);
assert.equal(blockedShape.faceShape.traits.length, 0);
assert.equal(blockedShape.faceShape.headline.includes('타원형'), false);
assert.includes(blockedShape.faceShape.retakeReasons.join(' '), '한 명');

const failedProfile = {
  ...buildFailedFaceProfile('2026-07-12T12:00:00.000Z', 'future_pipeline_code'),
  captureId: readyProfile.captureId,
};
const failedQuality = sectionById(
  buildFaceAnalysisProfileSections(failedProfile),
  'quality',
);
if (!('quality' in failedQuality)) {
  throw new Error('Failed profile lacks quality presentation');
}
assert.equal(failedQuality.quality.retakeReasons.length > 0, true);
assert.equal(
  failedQuality.quality.retakeReasons.join(' ').includes('future_pipeline_code'),
  false,
);

const partialProfile: FaceProfileResult = {
  ...readyProfile,
  nose: {
    ...readyProfile.nose,
    noseWidthRatio: {
      ...readyProfile.nose.noseWidthRatio,
      confidence: 0,
      nullReason: 'future_landmark_reason',
      value: null,
      warnings: ['future_warning_code'],
    },
  },
  status: 'partial_success',
  statusReason: 'partial_measurements_unavailable',
};
const partialSections = buildFaceAnalysisProfileSections(partialProfile);
const partialNoseMouth = sectionById(partialSections, 'nose_mouth');
const unavailableNoseWidth = partialNoseMouth.measurements.find(
  item => item.id === 'noseWidthRatio',
);
const availableMouthWidth = partialNoseMouth.measurements.find(
  item => item.id === 'mouthWidthRatio',
);
assert.equal(unavailableNoseWidth?.value, '측정 불가');
assert.equal(Boolean(unavailableNoseWidth?.nullReason), true);
assert.equal(
  unavailableNoseWidth?.nullReason?.includes('future_landmark_reason'),
  false,
);
assert.equal(
  unavailableNoseWidth?.warnings.join(' ').includes('future_warning_code'),
  false,
);
assert.equal(
  unavailableNoseWidth?.warnings.join(' ').includes('신뢰도가 낮아'),
  false,
);
assert.equal(availableMouthWidth?.value === '측정 불가', false);

const knownWarningSections = buildFaceAnalysisProfileSections({
  ...readyProfile,
  color: {
    ...readyProfile.color,
    redness: {
      ...readyProfile.color.redness,
      warnings: ['relative_capture_value_not_medical_diagnosis'],
    },
  },
  quality: {
    ...readyProfile.quality,
    blurScore: {
      ...readyProfile.quality.blurScore,
      warnings: ['blur_risk'],
    },
  },
});
assert.includes(
  sectionById(knownWarningSections, 'skin_color').warnings.join(' '),
  '상대값',
);
assert.includes(
  sectionById(knownWarningSections, 'quality').warnings.join(' '),
  '흐려',
);

const trueDepthSections = buildFaceAnalysisProfileSections({
  ...readyProfile,
  provenance: {...readyProfile.provenance, trueDepthUsed: true},
});
const trueDepthQuality = sectionById(trueDepthSections, 'quality');
if (!('quality' in trueDepthQuality)) {
  throw new Error('TrueDepth profile lacks quality presentation');
}
assert.includes(trueDepthQuality.quality.trueDepthLabel, 'TrueDepth');

assert.equal(
  buildFaceAnalysisProfileSectionsFromReport({faceProfile: readyProfile})?.length,
  6,
);
assert.equal(buildFaceAnalysisProfileSectionsFromReport({}), null);

assert.equal(
  getFaceProfileSummaryLabel({
    confidenceGap: 0.24,
    dominantShape: 'round',
    schemaVersion: 'aura-face-profile-v1',
    status: 'full_success',
  }),
  '둥근형',
);
assert.equal(
  getFaceProfileSummaryLabel({
    confidenceGap: 0.099,
    dominantShape: 'oval',
    schemaVersion: 'aura-face-profile-v1',
    status: 'partial_success',
  }),
  '타원형 혼합형',
);
assert.equal(
  getFaceProfileSummaryLabel({
    confidenceGap: 0.1,
    dominantShape: 'oval',
    schemaVersion: 'aura-face-profile-v1',
    status: 'full_success',
  }),
  '타원형',
);
assert.equal(
  getFaceProfileSummaryLabel({
    confidenceGap: null,
    dominantShape: null,
    schemaVersion: 'aura-face-profile-v1',
    status: 'blocked',
  }),
  '측정 불가',
);
assert.equal(getFaceProfileSummaryLabel(undefined), undefined);

const serializedModel = JSON.stringify(readySections);
for (const forbidden of [
  'rawLandmarks',
  'landmarks',
  'depthMap',
  'nativeDepthToken',
  'nativeMatteToken',
  'calibrationData',
  'semanticMatte',
  'sourceUri',
  'roiPixels',
  'faceShapeScores',
]) {
  assert.equal(serializedModel.includes(forbidden), false);
}

console.log('faceAnalysisProfileSections tests passed');
