import {
  buildFaceAnalysisConsentAcceptance,
  buildFaceAnalysisConsentCache,
  getUnacceptedRequiredConsentTypes,
  hasFreshRequiredFaceAnalysisConsents,
  parseFaceAnalysisConsentCache,
  parseFaceAnalysisConsentStatus,
  requiresThirdPartyAiConsent,
  type FaceAnalysisConsentRecord,
  type FaceAnalysisConsentStatus,
} from './faceAnalysisConsentModel';

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

const CAMERA_VERSION = 'face-profile-2026-07-12';
const AI_VERSION = 'face-ai-report-2026-07-12';
const THIRD_PARTY_VERSION = 'face-third-party-ai-2026-07-12';
const ACCEPTED_AT = '2026-07-12T03:00:00.000Z';

function activeConsent(
  consentType: 'camera_analysis' | 'ai_processing' | 'third_party_ai',
  version: string,
): FaceAnalysisConsentRecord {
  return {
    acceptedAt: ACCEPTED_AT,
    active: true,
    consentType,
    id: `${consentType}-id`,
    metadata: {
      rawSensorArtifactsStored: false,
      surface: 'face_analysis',
      trainingUseAllowed: false,
    },
    revokedAt: null,
    version,
  };
}

function readyStatus(includeThirdParty = false): FaceAnalysisConsentStatus {
  const requiredConsentTypes = includeThirdParty
    ? (['camera_analysis', 'ai_processing', 'third_party_ai'] as const)
    : (['camera_analysis', 'ai_processing'] as const);
  const consentVersions = {
    ai_processing: AI_VERSION,
    camera_analysis: CAMERA_VERSION,
    ...(includeThirdParty ? {third_party_ai: THIRD_PARTY_VERSION} : {}),
  };
  const consents = [
    activeConsent('camera_analysis', CAMERA_VERSION),
    activeConsent('ai_processing', AI_VERSION),
    ...(includeThirdParty
      ? [activeConsent('third_party_ai', THIRD_PARTY_VERSION)]
      : []),
  ];

  return {
    allRequiredActive: true,
    consentVersions,
    consents,
    requiredConsentTypes: [...requiredConsentTypes],
  };
}

const parsedReady = parseFaceAnalysisConsentStatus(readyStatus());
assert.equal(parsedReady !== null, true);
assert.equal(parsedReady && hasFreshRequiredFaceAnalysisConsents(parsedReady), true);
assert.deepEqual(parsedReady && getUnacceptedRequiredConsentTypes(parsedReady), []);
assert.equal(parsedReady && requiresThirdPartyAiConsent(parsedReady), false);

const parsedThirdParty = parseFaceAnalysisConsentStatus(readyStatus(true));
assert.equal(parsedThirdParty && requiresThirdPartyAiConsent(parsedThirdParty), true);
assert.deepEqual(parsedThirdParty?.requiredConsentTypes, [
  'camera_analysis',
  'ai_processing',
  'third_party_ai',
]);

const stale = readyStatus();
stale.consents[0] = activeConsent('camera_analysis', 'old-camera-version');
const parsedStale = parseFaceAnalysisConsentStatus(stale);
assert.equal(parsedStale && hasFreshRequiredFaceAnalysisConsents(parsedStale), false);
assert.deepEqual(parsedStale && getUnacceptedRequiredConsentTypes(parsedStale), [
  'camera_analysis',
]);

const revoked = readyStatus();
revoked.consents[1] = {
  acceptedAt: null,
  active: false,
  consentType: 'ai_processing',
  id: null,
  metadata: null,
  revokedAt: ACCEPTED_AT,
  version: AI_VERSION,
};
const parsedRevoked = parseFaceAnalysisConsentStatus(revoked);
assert.equal(parsedRevoked && hasFreshRequiredFaceAnalysisConsents(parsedRevoked), false);
assert.deepEqual(parsedRevoked && getUnacceptedRequiredConsentTypes(parsedRevoked), [
  'ai_processing',
]);

const inconsistentServerFlag = readyStatus();
inconsistentServerFlag.allRequiredActive = false;
const parsedInconsistent = parseFaceAnalysisConsentStatus(inconsistentServerFlag);
assert.equal(
  parsedInconsistent && hasFreshRequiredFaceAnalysisConsents(parsedInconsistent),
  false,
);

assert.equal(
  parseFaceAnalysisConsentStatus({
    ...readyStatus(),
    requiredConsentTypes: ['camera_analysis', 'ai_processing', 'unknown'],
  }),
  null,
);
assert.equal(
  parseFaceAnalysisConsentStatus({
    ...readyStatus(),
    requiredConsentTypes: ['camera_analysis', 'camera_analysis'],
  }),
  null,
);
const safeMetadataStatus = readyStatus();
const unsafeMetadata = {
  ...safeMetadataStatus,
  consents: safeMetadataStatus.consents.map((consent, index) =>
    index === 0
      ? {
          ...consent,
          metadata: {
            ...consent.metadata,
            trainingUseAllowed: true,
          },
        }
      : consent,
  ),
};
assert.equal(parseFaceAnalysisConsentStatus(unsafeMetadata), null);

assert.deepEqual(buildFaceAnalysisConsentAcceptance(CAMERA_VERSION), {
  accepted: true,
  metadata: {
    rawSensorArtifactsStored: false,
    surface: 'face_analysis',
    trainingUseAllowed: false,
  },
  version: CAMERA_VERSION,
});

const cache = buildFaceAnalysisConsentCache(readyStatus(), ACCEPTED_AT);
assert.deepEqual(parseFaceAnalysisConsentCache(JSON.stringify(cache)), cache);
assert.equal(
  parseFaceAnalysisConsentCache(
    JSON.stringify({...cache, cachedAt: 'not-an-iso-timestamp'}),
  ),
  null,
);
assert.equal(
  parseFaceAnalysisConsentCache(JSON.stringify({...cache, cachedAt: '0'})),
  null,
);
assert.equal(parseFaceAnalysisConsentCache('{broken-json'), null);

console.log('faceAnalysisConsentModel tests passed');
