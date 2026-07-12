import {
  buildFaceAnalysisConsentAcceptance,
  hasFreshRequiredFaceAnalysisConsents,
  type FaceAnalysisConsentAcceptance,
  type FaceAnalysisConsentCache,
  type FaceAnalysisConsentStatus,
  type FaceAnalysisConsentType,
} from './faceAnalysisConsentModel';

export type FaceAnalysisConsentEntryPoint =
  | 'intro_start'
  | 'direct_capture';

export type FaceAnalysisConsentGateState =
  | {
      cachedConsent: FaceAnalysisConsentCache | null;
      entryPoint: FaceAnalysisConsentEntryPoint;
      status: 'loading';
    }
  | {
      consent: FaceAnalysisConsentStatus;
      entryPoint: FaceAnalysisConsentEntryPoint;
      status: 'consent_required';
    }
  | {
      consent: FaceAnalysisConsentStatus;
      entryPoint: FaceAnalysisConsentEntryPoint;
      status: 'sanitizer_unsupported';
    }
  | {
      cachedConsent: FaceAnalysisConsentCache | null;
      entryPoint: FaceAnalysisConsentEntryPoint;
      status: 'network_error';
    }
  | {
      consent: FaceAnalysisConsentStatus;
      entryPoint: FaceAnalysisConsentEntryPoint;
      status: 'ready';
    };

export type FaceAnalysisConsentSurface =
  | 'loading'
  | 'consent'
  | 'unsupported'
  | 'retry'
  | 'camera';

type PendingGateInput = {
  cachedConsent: FaceAnalysisConsentCache | null;
  entryPoint: FaceAnalysisConsentEntryPoint;
  sanitizerAvailable: boolean;
  serverConsent: null;
  serverState: 'loading' | 'network_error';
};

type SuccessfulGateInput = {
  cachedConsent: FaceAnalysisConsentCache | null;
  entryPoint: FaceAnalysisConsentEntryPoint;
  sanitizerAvailable: boolean;
  serverConsent: FaceAnalysisConsentStatus;
  serverState: 'success';
};

export type FaceAnalysisConsentGateInput =
  | PendingGateInput
  | SuccessfulGateInput;

export function evaluateFaceAnalysisConsentGate(
  input: FaceAnalysisConsentGateInput,
): FaceAnalysisConsentGateState {
  if (input.serverState === 'loading') {
    return {
      cachedConsent: input.cachedConsent,
      entryPoint: input.entryPoint,
      status: 'loading',
    };
  }

  if (input.serverState === 'network_error') {
    return {
      cachedConsent: input.cachedConsent,
      entryPoint: input.entryPoint,
      status: 'network_error',
    };
  }

  const serverConsent = input.serverConsent;
  if (!serverConsent) {
    return {
      cachedConsent: input.cachedConsent,
      entryPoint: input.entryPoint,
      status: 'network_error',
    };
  }

  if (!hasFreshRequiredFaceAnalysisConsents(serverConsent)) {
    return {
      consent: serverConsent,
      entryPoint: input.entryPoint,
      status: 'consent_required',
    };
  }

  if (!input.sanitizerAvailable) {
    return {
      consent: serverConsent,
      entryPoint: input.entryPoint,
      status: 'sanitizer_unsupported',
    };
  }

  return {
    consent: serverConsent,
    entryPoint: input.entryPoint,
    status: 'ready',
  };
}

export function resolveFaceAnalysisConsentSurface(
  state: FaceAnalysisConsentGateState,
): FaceAnalysisConsentSurface {
  switch (state.status) {
    case 'loading':
      return 'loading';
    case 'consent_required':
      return 'consent';
    case 'sanitizer_unsupported':
      return 'unsupported';
    case 'network_error':
      return 'retry';
    case 'ready':
      return 'camera';
  }
}

export function shouldReplaceDirectCaptureWithConsentIntro(
  state: FaceAnalysisConsentGateState,
): boolean {
  return (
    state.entryPoint === 'direct_capture' &&
    state.status === 'consent_required'
  );
}

export async function runFaceAnalysisConsentCacheCleanupBestEffort(
  clearCache: () => Promise<void>,
): Promise<void> {
  await Promise.allSettled([Promise.resolve().then(clearCache)]);
}

export type FaceAnalysisConsentCacheEpoch = {
  capture: () => number;
  invalidate: () => number;
  isCurrent: (capturedEpoch: number) => boolean;
};

export function createFaceAnalysisConsentCacheEpoch(): FaceAnalysisConsentCacheEpoch {
  let currentEpoch = 0;

  return {
    capture: () => currentEpoch,
    invalidate: () => {
      currentEpoch += 1;
      return currentEpoch;
    },
    isCurrent: capturedEpoch => capturedEpoch === currentEpoch,
  };
}

export async function writeFaceAnalysisConsentCacheIfCurrent({
  capturedEpoch,
  epoch,
  remove,
  write,
}: {
  capturedEpoch: number;
  epoch: FaceAnalysisConsentCacheEpoch;
  remove: () => Promise<void>;
  write: () => Promise<void>;
}): Promise<'skipped' | 'written' | 'invalidated'> {
  if (!epoch.isCurrent(capturedEpoch)) {
    return 'skipped';
  }

  await write();
  if (!epoch.isCurrent(capturedEpoch)) {
    await remove();
    return 'invalidated';
  }

  return 'written';
}

export type FaceAnalysisConsentAcceptanceDependencies = {
  acceptConsent: (
    consentType: FaceAnalysisConsentType,
    payload: FaceAnalysisConsentAcceptance,
  ) => Promise<void>;
  cacheFreshConsent: (consent: FaceAnalysisConsentStatus) => Promise<void>;
  fetchFreshConsent: () => Promise<FaceAnalysisConsentStatus>;
};

export async function acceptRequiredFaceAnalysisConsentsSequentially(
  serverConsent: FaceAnalysisConsentStatus,
  dependencies: FaceAnalysisConsentAcceptanceDependencies,
): Promise<FaceAnalysisConsentStatus> {
  for (const consentType of serverConsent.requiredConsentTypes) {
    const version = serverConsent.consentVersions[consentType];
    if (!version) {
      throw new Error(`Current consent version is missing for ${consentType}.`);
    }

    await dependencies.acceptConsent(
      consentType,
      buildFaceAnalysisConsentAcceptance(version),
    );
  }

  const refreshedConsent = await dependencies.fetchFreshConsent();
  if (!hasFreshRequiredFaceAnalysisConsents(refreshedConsent)) {
    throw new Error('Server did not confirm every required face analysis consent.');
  }

  await Promise.allSettled([
    Promise.resolve().then(() =>
      dependencies.cacheFreshConsent(refreshedConsent),
    ),
  ]);

  return refreshedConsent;
}
