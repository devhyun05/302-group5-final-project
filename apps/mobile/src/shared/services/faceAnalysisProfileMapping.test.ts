import {validReadyProfile} from '../../features/face-profile/services/faceProfileContract.test';
import {
  createFaceAnalysisProfileResolver,
  getFaceProfileRetakeMessage,
  mapFaceAnalysisProfile,
  parseFaceAnalysisProfileSummary,
  resolveFaceAnalysisCreateOutcome,
  runFaceAnalysisCreateIfActive,
} from './faceAnalysisProfileMapping';

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
};

const expectedSummary = {
  confidenceGap: validReadyProfile.faceShape.confidenceGap,
  dominantShape: validReadyProfile.faceShape.dominantShape,
  schemaVersion: validReadyProfile.schemaVersion,
  status: validReadyProfile.status,
};

const currentDetail = mapFaceAnalysisProfile({
  faceProfile: validReadyProfile,
  faceProfileSummary: {
    ...expectedSummary,
    dominantShape: 'round',
  },
  legacyFaceShape: 'AI 레거시 둥근형',
});
assert.equal(currentDetail.faceProfile, validReadyProfile);
assert.deepEqual(currentDetail.faceProfileSummary, expectedSummary);
assert.equal(currentDetail.faceShape, 'oval');

const unknownVersion = mapFaceAnalysisProfile({
  faceProfile: {...validReadyProfile, schemaVersion: 'future-v2'},
  faceProfileSummary: {...expectedSummary, schemaVersion: 'future-v2'},
  legacyFaceShape: '레거시 얼굴형',
});
assert.equal(unknownVersion.faceProfile, undefined);
assert.equal(unknownVersion.faceProfileSummary, undefined);
assert.equal(unknownVersion.faceShape, '레거시 얼굴형');

const malformedFullProfile = mapFaceAnalysisProfile({
  faceProfile: {...validReadyProfile, rawLandmarks: []},
  faceProfileSummary: expectedSummary,
  legacyFaceShape: '레거시 계란형',
});
assert.equal(malformedFullProfile.faceProfile, undefined);
assert.deepEqual(malformedFullProfile.faceProfileSummary, expectedSummary);
assert.equal(malformedFullProfile.faceShape, '레거시 계란형');

const legacyReport = mapFaceAnalysisProfile({
  legacyFaceShape: '기존 보고서 얼굴형',
});
assert.equal(legacyReport.faceProfile, undefined);
assert.equal(legacyReport.faceProfileSummary, undefined);
assert.equal(legacyReport.faceShape, '기존 보고서 얼굴형');

assert.equal(
  parseFaceAnalysisProfileSummary({...expectedSummary, confidenceGap: Number.NaN}),
  undefined,
);
assert.equal(
  parseFaceAnalysisProfileSummary({...expectedSummary, unexpected: true}),
  undefined,
);

const blockedProfile = {
  ...validReadyProfile,
  faceShape: {
    ...validReadyProfile.faceShape,
    confidenceGap: null,
    dominantShape: null,
    explanationTraits: [],
    faceShapeScores: Object.fromEntries(
      Object.keys(validReadyProfile.faceShape.faceShapeScores).map(shape => [shape, 0]),
    ),
    overallConfidence: 0,
    status: 'blocked',
    top2: [],
  },
  quality: {
    ...validReadyProfile.quality,
    blockingReasons: ['multiple_faces'],
  },
  status: 'blocked',
  statusReason: 'multiple_faces',
};

const blockedDetail = mapFaceAnalysisProfile({
  faceProfile: blockedProfile,
  legacyFaceShape: '과거 AI 둥근형',
});
assert.equal(blockedDetail.faceProfile, blockedProfile);
assert.deepEqual(blockedDetail.faceProfileSummary, {
  confidenceGap: null,
  dominantShape: null,
  schemaVersion: blockedProfile.schemaVersion,
  status: 'blocked',
});
assert.equal(blockedDetail.faceShape, undefined);

let fallbackPreparationCount = 0;
const resolveFaceProfile = createFaceAnalysisProfileResolver(capture => {
  fallbackPreparationCount += 1;
  return Promise.resolve({
    ...validReadyProfile,
    captureId: capture.photoCaptureId,
  });
});
const legacyCapture = {
  photoCaptureId: '11111111-1111-4111-8111-111111111111',
};
const firstFallback = resolveFaceProfile(legacyCapture);
const retryFallback = resolveFaceProfile(legacyCapture);
assert.equal(firstFallback, retryFallback);
assert.equal(fallbackPreparationCount, 1);

let preparedFallbackCount = 0;
const resolvePreparedFaceProfile = createFaceAnalysisProfileResolver(() => {
  preparedFallbackCount += 1;
  return Promise.resolve(validReadyProfile);
});
void resolvePreparedFaceProfile({
  derivedFaceProfile: validReadyProfile,
  photoCaptureId: validReadyProfile.captureId,
});
assert.equal(preparedFallbackCount, 0);

let canceledCreateCount = 0;
void runFaceAnalysisCreateIfActive(
  () => false,
  () => {
    canceledCreateCount += 1;
    return Promise.resolve('created');
  },
);
assert.equal(canceledCreateCount, 0);

const retakeOutcome = resolveFaceAnalysisCreateOutcome({
  errorCode: 'FACE_PROFILE_RETAKE_REQUIRED',
  faceProfile: blockedProfile,
  hasFaceProfile: true,
  retakeRequired: true,
  status: 'failed',
});
assert.equal(retakeOutcome.kind, 'retake');
if (retakeOutcome.kind === 'retake') {
  assert.equal(retakeOutcome.statusReason, 'multiple_faces');
  assert.equal(
    retakeOutcome.message,
    '사진에는 한 명의 얼굴만 나오도록 다시 촬영해 주세요.',
  );
}

const missingPersistence = resolveFaceAnalysisCreateOutcome({
  errorCode: 'FACE_PROFILE_RETAKE_REQUIRED',
  faceProfile: null,
  hasFaceProfile: false,
  retakeRequired: true,
  status: 'failed',
});
assert.equal(missingPersistence.kind, 'persistence_error');

const pendingOutcome = resolveFaceAnalysisCreateOutcome({
  errorCode: null,
  faceProfile: validReadyProfile,
  hasFaceProfile: true,
  retakeRequired: false,
  status: 'pending',
});
assert.equal(pendingOutcome.kind, 'continue');

assert.equal(
  getFaceProfileRetakeMessage('face_not_detected'),
  '얼굴을 찾지 못했어요. 얼굴 전체가 가이드 안에 보이도록 다시 촬영해 주세요.',
);
assert.equal(
  getFaceProfileRetakeMessage('pose_out_of_range'),
  '고개를 기울이지 말고 정면을 바라본 상태로 다시 촬영해 주세요.',
);
assert.equal(
  getFaceProfileRetakeMessage('landmarks_incomplete'),
  '얼굴을 가린 요소와 조명·초점을 확인한 뒤 다시 촬영해 주세요.',
);
assert.equal(
  getFaceProfileRetakeMessage('pipeline_failure'),
  '촬영 품질을 확인하지 못했어요. 밝고 선명한 환경에서 다시 촬영해 주세요.',
);

console.log('faceAnalysisProfileMapping tests passed');
