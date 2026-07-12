import {validReadyProfile} from '../../face-profile/services/faceProfileContract.test';
import {buildFailedFaceProfile} from '../../face-profile/services/faceProfileBuilder';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {FaceProfileResult} from '../../../shared/types/faceProfile';
import {getFaceAnalysisReportSummaryItems} from './faceAnalysisReportDetailModel';
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
assert.equal(
  skinColor.measurements.length,
  Object.keys(readyProfile.color).length + 44,
);
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

const noLandmarkQuality = sectionById(
  buildFaceAnalysisProfileSections({
    ...readyProfile,
    provenance: {...readyProfile.provenance, landmarkCount: 0},
    quality: {
      ...readyProfile.quality,
      landmarkConfidence: {
        ...readyProfile.quality.landmarkConfidence,
        confidence: 0,
        nullReason: 'landmarks_incomplete',
        value: null,
      },
      landmarkCount: {
        ...readyProfile.quality.landmarkCount,
        confidence: 0,
        nullReason: 'landmarks_incomplete',
        value: 0,
      },
    },
    status: 'partial_success',
  }),
  'quality',
);
if (!('quality' in noLandmarkQuality)) {
  throw new Error('No-landmark profile lacks quality presentation');
}
assert.equal(noLandmarkQuality.quality.trueDepthLabel.includes('2D'), false);
assert.includes(noLandmarkQuality.quality.trueDepthLabel, '사용할 수 없');

const unboundedDisplaySections = buildFaceAnalysisProfileSections({
  ...readyProfile,
  color: {
    ...readyProfile.color,
    overallFaceContrast: {
      ...readyProfile.color.overallFaceContrast,
      value: 18.4,
    },
  },
  faceBalance: {
    ...readyProfile.faceBalance,
    lowerThirdRatio: {
      ...readyProfile.faceBalance.lowerThirdRatio,
      value: 1.12,
    },
  },
});
const unboundedBalance = sectionById(unboundedDisplaySections, 'face_balance');
const unboundedColor = sectionById(unboundedDisplaySections, 'skin_color');
assert.equal(
  unboundedBalance.measurements.find(item => item.id === 'lowerThirdRatio')?.value,
  '1.12',
);
assert.equal(
  unboundedColor.measurements.find(item => item.id === 'overallFaceContrast')?.value,
  'ΔE00 18.4',
);
assert.equal(
  unboundedColor.measurements.find(item => item.id === 'overallFaceContrast')?.value.includes('100%'),
  false,
);

const readyPersonalColor = readyProfile.color.personalColor.value;
if (!readyPersonalColor?.tone) {
  throw new Error('Ready fixture lacks personal color details');
}
const detailedPersonalColorSections = buildFaceAnalysisProfileSections({
  ...readyProfile,
  color: {
    ...readyProfile.color,
    personalColor: {
      ...readyProfile.color.personalColor,
      value: {
        ...readyPersonalColor,
        calibrationApplied: true,
        calibrationVersion: 'pc-cal-v2',
        palette: {
          bestFamilyIds: ['cool-clear', 'cool-deep'],
          worstFamilyIds: ['warm-muted', 'warm-light'],
        },
        warnings: ['hair_missing', 'future_personal_color_warning'],
      },
    },
  },
});
const detailedPersonalColor = sectionById(
  detailedPersonalColorSections,
  'skin_color',
);
const detailById = (id: string) =>
  detailedPersonalColor.measurements.find(item => item.id === id);

assert.equal(detailById('personalColorStatus')?.value, '확정');
assert.equal(detailById('personalColorMeasurementConfidence')?.value, '80%');
assert.equal(detailById('personalColorAxisTemperature')?.value, '0.20');
assert.includes(
  detailById('personalColorAxisTemperature')?.confidenceLabel ?? '',
  '80%',
);
assert.equal(detailById('personalColorRelationDLSkinHair')?.value, 'ΔL* 18.0');
assert.equal(detailById('personalColorRelationDE00SkinHair')?.value, 'ΔE00 22.0');
assert.equal(detailById('personalColorToneTop')?.value, '겨울 브라이트');
assert.equal(detailById('personalColorToneSecondary')?.value, '겨울 트루');
assert.equal(detailById('personalColorToneSeason')?.value, '겨울');
assert.equal(detailById('personalColorToneScore')?.value, '50%');
assert.equal(detailById('personalColorToneGap')?.value, '20%');
assert.equal(
  detailedPersonalColor.measurements.filter(item =>
    item.id.startsWith('personalColorToneScore.'),
  ).length,
  12,
);
assert.equal(
  detailedPersonalColor.measurements.filter(item =>
    item.id.startsWith('personalColorToneDistance.'),
  ).length,
  12,
);
assert.includes(detailById('personalColorPaletteBest')?.value ?? '', 'cool-clear');
assert.includes(detailById('personalColorPaletteWorst')?.value ?? '', 'warm-muted');
assert.equal(detailById('personalColorCalibrationApplied')?.value, '적용됨');
assert.equal(detailById('personalColorCalibrationVersion')?.value, 'pc-cal-v2');
assert.equal(
  detailedPersonalColor.measurements
    .filter(item => item.id.startsWith('personalColor') && item.id !== 'personalColor')
    .every(item => !item.isKey),
  true,
);
assert.equal(
  detailedPersonalColor.measurements
    .find(item => item.id === 'personalColor')
    ?.warnings.join(' ')
    .includes('hair_missing'),
  false,
);
assert.equal(
  detailedPersonalColor.measurements.find(item => item.id === 'personalColor')
    ?.warnings.length,
  2,
);
assert.equal(
  detailedPersonalColor.warnings.join(' ').includes('future_personal_color_warning'),
  false,
);
assert.equal(
  detailedPersonalColor.warnings.some(warning => warning.includes('헤어 색상')),
  false,
);
assert.equal(
  detailedPersonalColor.measurements.filter(item => item.isKey).length,
  5,
);

const mixedProfile: FaceProfileResult = {
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
};
const mixedSections = buildFaceAnalysisProfileSections(mixedProfile);
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
assert.equal(failedQuality.quality.trueDepthLabel.includes('2D'), false);
assert.includes(failedQuality.quality.trueDepthLabel, '사용할 수 없');

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

const warnedShape = sectionById(
  buildFaceAnalysisProfileSections({
    ...readyProfile,
    faceShape: {
      ...readyProfile.faceShape,
      warnings: ['future_shape_warning'],
    },
  }),
  'face_shape',
);
assert.equal(warnedShape.warnings.length, 1);
assert.equal(warnedShape.warnings.join(' ').includes('future_shape_warning'), false);

function reportForSummary(
  faceProfile: FaceProfileResult | undefined,
  faceShape = '레거시 계란형',
): FaceAnalysisReport {
  return {
    faceProfile,
    faceShape,
    personalColor: '레거시 퍼스널 컬러',
    recommendedMood: '맑은 무드',
    toneSummary: '맑고 선명해요',
  } as FaceAnalysisReport;
}

assert.equal(
  getFaceAnalysisReportSummaryItems(reportForSummary(readyProfile)).find(
    item => item.label === '얼굴형',
  )?.value,
  '타원형 얼굴형이에요',
);
assert.equal(
  getFaceAnalysisReportSummaryItems(reportForSummary(mixedProfile)).find(
    item => item.label === '얼굴형',
  )?.value,
  '타원형과 둥근형이 함께 보여요',
);
assert.equal(
  getFaceAnalysisReportSummaryItems(reportForSummary(blockedProfile)).find(
    item => item.label === '얼굴형',
  )?.value,
  '얼굴형을 판단할 정보가 부족해요',
);
assert.equal(
  getFaceAnalysisReportSummaryItems(reportForSummary(undefined)).find(
    item => item.label === '얼굴형',
  )?.value,
  '레거시 계란형',
);

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
    confidenceGap: 0.3 - 0.2,
    dominantShape: 'oval',
    schemaVersion: 'aura-face-profile-v1',
    status: 'full_success',
  }),
  '타원형',
);
assert.equal(
  getFaceProfileSummaryLabel({
    confidenceGap: 0.1 - 2e-9,
    dominantShape: 'oval',
    schemaVersion: 'aura-face-profile-v1',
    status: 'partial_success',
  }),
  '타원형 혼합형',
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
