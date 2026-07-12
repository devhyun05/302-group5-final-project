import * as SecureStore from '../../../shared/services/localSecureStore';
import {requestBackendJson} from '../../../shared/services/backendApi';
import {
  buildFaceAnalysisConsentCache,
  parseFaceAnalysisConsentCache,
  parseFaceAnalysisConsentStatus,
  type FaceAnalysisConsentAcceptance,
  type FaceAnalysisConsentCache,
  type FaceAnalysisConsentStatus,
  type FaceAnalysisConsentType,
} from './faceAnalysisConsentModel';
import {
  acceptRequiredFaceAnalysisConsentsSequentially,
  createFaceAnalysisConsentCacheEpoch,
  writeFaceAnalysisConsentCacheIfCurrent,
} from './faceAnalysisConsentGate';

const FACE_ANALYSIS_CONSENT_CACHE_KEY = 'aura.face-analysis.consent-cache.v1';
const consentCacheEpoch = createFaceAnalysisConsentCacheEpoch();

type AcceptedConsentResponse = {
  consent: unknown;
};

function consentPath(consentType: FaceAnalysisConsentType): string {
  return `/users/me/consents/${consentType}`;
}

export async function getFaceAnalysisConsentStatus(
  signal?: AbortSignal,
): Promise<FaceAnalysisConsentStatus> {
  const response = await requestBackendJson<unknown>('/users/me/consents', {
    method: 'GET',
    signal,
  });
  const parsed = parseFaceAnalysisConsentStatus(response);

  if (!parsed) {
    throw new Error('얼굴 분석 동의 상태를 안전하게 확인하지 못했어요.');
  }

  return parsed;
}

async function acceptFaceAnalysisConsent(
  consentType: FaceAnalysisConsentType,
  payload: FaceAnalysisConsentAcceptance,
): Promise<void> {
  await requestBackendJson<AcceptedConsentResponse>(consentPath(consentType), {
    body: payload,
    method: 'PUT',
  });
}

export async function readFaceAnalysisConsentCache(): Promise<FaceAnalysisConsentCache | null> {
  try {
    const rawValue = await SecureStore.getItemAsync(
      FACE_ANALYSIS_CONSENT_CACHE_KEY,
    );
    const parsed = parseFaceAnalysisConsentCache(rawValue);

    if (rawValue && !parsed) {
      await clearFaceAnalysisConsentCache();
    }

    return parsed;
  } catch {
    return null;
  }
}

async function cacheFreshFaceAnalysisConsent(
  consent: FaceAnalysisConsentStatus,
  capturedEpoch: number,
): Promise<void> {
  const cache = buildFaceAnalysisConsentCache(
    consent,
    new Date().toISOString(),
  );
  const serialized = JSON.stringify(cache);
  await writeFaceAnalysisConsentCacheIfCurrent({
    capturedEpoch,
    epoch: consentCacheEpoch,
    remove: () => SecureStore.deleteItemAsync(FACE_ANALYSIS_CONSENT_CACHE_KEY),
    write: () =>
      SecureStore.setItemAsync(
        FACE_ANALYSIS_CONSENT_CACHE_KEY,
        serialized,
        {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY},
      ),
  });
}

export async function clearFaceAnalysisConsentCache(): Promise<void> {
  consentCacheEpoch.invalidate();
  await SecureStore.deleteItemAsync(FACE_ANALYSIS_CONSENT_CACHE_KEY);
}

export async function acceptRequiredFaceAnalysisConsents(
  serverConsent: FaceAnalysisConsentStatus,
): Promise<FaceAnalysisConsentStatus> {
  const capturedEpoch = consentCacheEpoch.capture();
  return acceptRequiredFaceAnalysisConsentsSequentially(serverConsent, {
    acceptConsent: acceptFaceAnalysisConsent,
    cacheFreshConsent: consent =>
      cacheFreshFaceAnalysisConsent(consent, capturedEpoch),
    fetchFreshConsent: () => getFaceAnalysisConsentStatus(),
  });
}

export async function revokeRequiredFaceAnalysisConsents(
  requiredConsentTypes: readonly FaceAnalysisConsentType[],
): Promise<void> {
  try {
    for (const consentType of requiredConsentTypes) {
      await requestBackendJson<unknown>(consentPath(consentType), {
        method: 'DELETE',
      });
    }
  } finally {
    await clearFaceAnalysisConsentCache().catch(() => undefined);
  }
}
