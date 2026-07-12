import type {FaceAnalysisConsentStatus} from './faceAnalysisConsentModel';
import {
  acceptRequiredFaceAnalysisConsentsSequentially,
  evaluateFaceAnalysisConsentGate,
  resolveFaceAnalysisConsentSurface,
  runFaceAnalysisConsentCacheCleanupBestEffort,
  shouldReplaceDirectCaptureWithConsentIntro,
} from './faceAnalysisConsentGate';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
};

function readyStatus(): FaceAnalysisConsentStatus {
  return {
    allRequiredActive: true,
    consentVersions: {
      ai_processing: 'face-ai-report-2026-07-12',
      camera_analysis: 'face-profile-2026-07-12',
    },
    consents: [
      {
        acceptedAt: '2026-07-12T03:00:00.000Z',
        active: true,
        consentType: 'camera_analysis',
        id: 'camera-id',
        metadata: {
          rawSensorArtifactsStored: false,
          surface: 'face_analysis',
          trainingUseAllowed: false,
        },
        revokedAt: null,
        version: 'face-profile-2026-07-12',
      },
      {
        acceptedAt: '2026-07-12T03:00:00.000Z',
        active: true,
        consentType: 'ai_processing',
        id: 'ai-id',
        metadata: {
          rawSensorArtifactsStored: false,
          surface: 'face_analysis',
          trainingUseAllowed: false,
        },
        revokedAt: null,
        version: 'face-ai-report-2026-07-12',
      },
    ],
    requiredConsentTypes: ['camera_analysis', 'ai_processing'],
  };
}

const freshReady = readyStatus();
for (const entryPoint of ['intro_start', 'direct_capture'] as const) {
  const gate = evaluateFaceAnalysisConsentGate({
    cachedConsent: null,
    entryPoint,
    sanitizerAvailable: true,
    serverConsent: freshReady,
    serverState: 'success',
  });
  assert.equal(gate.status, 'ready');
  assert.equal(resolveFaceAnalysisConsentSurface(gate), 'camera');
}

const stale = readyStatus();
stale.consents[0].version = 'old-version';
const staleIntroGate = evaluateFaceAnalysisConsentGate({
  cachedConsent: null,
  entryPoint: 'intro_start',
  sanitizerAvailable: true,
  serverConsent: stale,
  serverState: 'success',
});
assert.equal(resolveFaceAnalysisConsentSurface(staleIntroGate), 'consent');
assert.equal(shouldReplaceDirectCaptureWithConsentIntro(staleIntroGate), false);

const revoked = readyStatus();
revoked.consents[1].active = false;
revoked.consents[1].revokedAt = '2026-07-12T04:00:00.000Z';
const revokedDirectGate = evaluateFaceAnalysisConsentGate({
  cachedConsent: null,
  entryPoint: 'direct_capture',
  sanitizerAvailable: true,
  serverConsent: revoked,
  serverState: 'success',
});
assert.equal(resolveFaceAnalysisConsentSurface(revokedDirectGate), 'consent');
assert.equal(shouldReplaceDirectCaptureWithConsentIntro(revokedDirectGate), true);

const cachedReady = {
  cachedAt: '2026-07-12T03:00:00.000Z',
  consentVersions: freshReady.consentVersions,
  requiredConsentTypes: freshReady.requiredConsentTypes,
  schemaVersion: 1 as const,
};
for (const serverState of ['loading', 'network_error'] as const) {
  const gate = evaluateFaceAnalysisConsentGate({
    cachedConsent: cachedReady,
    entryPoint: 'direct_capture',
    sanitizerAvailable: true,
    serverConsent: null,
    serverState,
  });
  assert.equal(
    resolveFaceAnalysisConsentSurface(gate),
    serverState === 'loading' ? 'loading' : 'retry',
  );
}

assert.equal(
  resolveFaceAnalysisConsentSurface(
    evaluateFaceAnalysisConsentGate({
      cachedConsent: cachedReady,
      entryPoint: 'direct_capture',
      sanitizerAvailable: false,
      serverConsent: freshReady,
      serverState: 'success',
    }),
  ),
  'unsupported',
);

async function testBestEffortCleanup() {
  let calls = 0;
  await runFaceAnalysisConsentCacheCleanupBestEffort(async () => {
    calls += 1;
    throw new Error('secure-store-unavailable');
  });
  assert.equal(calls, 1);
}

async function testSequentialAcceptanceAndCacheBoundary() {
  const events: string[] = [];
  const status = readyStatus();
  const refreshed = readyStatus();

  const result = await acceptRequiredFaceAnalysisConsentsSequentially(status, {
    acceptConsent: async (consentType, payload) => {
      events.push(`put:start:${consentType}:${payload.version}`);
      await Promise.resolve();
      events.push(`put:end:${consentType}`);
    },
    cacheFreshConsent: async consent => {
      assert.equal(consent, refreshed);
      events.push('cache');
    },
    fetchFreshConsent: async () => {
      events.push('get:fresh');
      return refreshed;
    },
  });

  assert.equal(result, refreshed);
  assert.equal(
    JSON.stringify(events),
    JSON.stringify([
      'put:start:camera_analysis:face-profile-2026-07-12',
      'put:end:camera_analysis',
      'put:start:ai_processing:face-ai-report-2026-07-12',
      'put:end:ai_processing',
      'get:fresh',
      'cache',
    ]),
  );

  const thirdPartyStatus = readyStatus();
  thirdPartyStatus.requiredConsentTypes.push('third_party_ai');
  thirdPartyStatus.consentVersions.third_party_ai =
    'face-third-party-ai-2026-07-12';
  thirdPartyStatus.consents.push({
    acceptedAt: '2026-07-12T03:00:00.000Z',
    active: true,
    consentType: 'third_party_ai',
    id: 'third-party-id',
    metadata: {
      rawSensorArtifactsStored: false,
      surface: 'face_analysis',
      trainingUseAllowed: false,
    },
    revokedAt: null,
    version: 'face-third-party-ai-2026-07-12',
  });
  const acceptedTypes: string[] = [];
  await acceptRequiredFaceAnalysisConsentsSequentially(thirdPartyStatus, {
    acceptConsent: async consentType => {
      acceptedTypes.push(consentType);
    },
    cacheFreshConsent: async () => undefined,
    fetchFreshConsent: async () => thirdPartyStatus,
  });
  assert.equal(
    JSON.stringify(acceptedTypes),
    JSON.stringify([
      'camera_analysis',
      'ai_processing',
      'third_party_ai',
    ]),
  );

  const failedEvents: string[] = [];
  let failed = false;
  try {
    await acceptRequiredFaceAnalysisConsentsSequentially(status, {
      acceptConsent: async consentType => {
        failedEvents.push(`put:${consentType}`);
        if (consentType === 'ai_processing') {
          throw new Error('second-put-failed');
        }
      },
      cacheFreshConsent: async () => {
        failedEvents.push('cache');
      },
      fetchFreshConsent: async () => {
        failedEvents.push('get:fresh');
        return refreshed;
      },
    });
  } catch {
    failed = true;
  }

  assert.equal(failed, true);
  assert.equal(
    JSON.stringify(failedEvents),
    JSON.stringify(['put:camera_analysis', 'put:ai_processing']),
  );
}

void Promise.all([
  testBestEffortCleanup(),
  testSequentialAcceptanceAndCacheBoundary(),
]).then(() => {
  console.log('faceAnalysisConsentGate tests passed');
});
