export const FACE_ANALYSIS_CONSENT_TYPES = [
  'camera_analysis',
  'ai_processing',
  'third_party_ai',
] as const;

export type FaceAnalysisConsentType =
  (typeof FACE_ANALYSIS_CONSENT_TYPES)[number];

export type FaceAnalysisConsentMetadata = {
  rawSensorArtifactsStored: false;
  surface: 'face_analysis';
  trainingUseAllowed: false;
};

export type FaceAnalysisConsentRecord = {
  acceptedAt: string | null;
  active: boolean;
  consentType: FaceAnalysisConsentType;
  id: string | null;
  metadata: FaceAnalysisConsentMetadata | null;
  revokedAt: string | null;
  version: string;
};

export type FaceAnalysisConsentStatus = {
  allRequiredActive: boolean;
  consentVersions: Partial<Record<FaceAnalysisConsentType, string>>;
  consents: FaceAnalysisConsentRecord[];
  requiredConsentTypes: FaceAnalysisConsentType[];
};

export type FaceAnalysisConsentAcceptance = {
  accepted: true;
  metadata: FaceAnalysisConsentMetadata;
  version: string;
};

export type FaceAnalysisConsentCache = {
  cachedAt: string;
  consentVersions: Partial<Record<FaceAnalysisConsentType, string>>;
  requiredConsentTypes: FaceAnalysisConsentType[];
  schemaVersion: 1;
};

const BASE_REQUIRED_CONSENT_TYPES = [
  'camera_analysis',
  'ai_processing',
] as const;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isIsoTimestamp(value);
}

function isConsentType(value: unknown): value is FaceAnalysisConsentType {
  return (
    typeof value === 'string' &&
    (FACE_ANALYSIS_CONSENT_TYPES as readonly string[]).includes(value)
  );
}

function parseMetadata(value: unknown): FaceAnalysisConsentMetadata | null {
  if (value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    value.surface !== 'face_analysis' ||
    value.rawSensorArtifactsStored !== false ||
    value.trainingUseAllowed !== false
  ) {
    return null;
  }

  return {
    rawSensorArtifactsStored: false,
    surface: 'face_analysis',
    trainingUseAllowed: false,
  };
}

function parseConsentRecord(value: unknown): FaceAnalysisConsentRecord | null {
  if (
    !isRecord(value) ||
    !(value.id === null || isNonEmptyString(value.id)) ||
    !isConsentType(value.consentType) ||
    !isNonEmptyString(value.version) ||
    typeof value.active !== 'boolean' ||
    !isNullableTimestamp(value.acceptedAt) ||
    !isNullableTimestamp(value.revokedAt)
  ) {
    return null;
  }

  const metadata = parseMetadata(value.metadata);
  if (value.metadata !== null && metadata === null) {
    return null;
  }

  if (
    value.active &&
    (!isNonEmptyString(value.id) ||
      !isIsoTimestamp(value.acceptedAt) ||
      value.revokedAt !== null ||
      metadata === null)
  ) {
    return null;
  }

  return {
    acceptedAt: value.acceptedAt,
    active: value.active,
    consentType: value.consentType,
    id: value.id,
    metadata,
    revokedAt: value.revokedAt,
    version: value.version,
  };
}

function parseRequiredConsentTypes(
  value: unknown,
): FaceAnalysisConsentType[] | null {
  if (!Array.isArray(value) || value.length < BASE_REQUIRED_CONSENT_TYPES.length) {
    return null;
  }

  if (!value.every(isConsentType) || new Set(value).size !== value.length) {
    return null;
  }

  if (
    !BASE_REQUIRED_CONSENT_TYPES.every(requiredType => value.includes(requiredType))
  ) {
    return null;
  }

  return [...value];
}

function parseConsentVersions(
  value: unknown,
  requiredConsentTypes: readonly FaceAnalysisConsentType[],
): Partial<Record<FaceAnalysisConsentType, string>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const keys = Object.keys(value);
  if (
    keys.length !== requiredConsentTypes.length ||
    !keys.every(isConsentType) ||
    !requiredConsentTypes.every(
      consentType => isNonEmptyString(value[consentType]),
    )
  ) {
    return null;
  }

  const versions: Partial<Record<FaceAnalysisConsentType, string>> = {};
  for (const consentType of requiredConsentTypes) {
    versions[consentType] = value[consentType] as string;
  }

  return versions;
}

export function parseFaceAnalysisConsentStatus(
  value: unknown,
): FaceAnalysisConsentStatus | null {
  if (!isRecord(value) || typeof value.allRequiredActive !== 'boolean') {
    return null;
  }

  const requiredConsentTypes = parseRequiredConsentTypes(
    value.requiredConsentTypes,
  );
  if (!requiredConsentTypes) {
    return null;
  }

  const consentVersions = parseConsentVersions(
    value.consentVersions,
    requiredConsentTypes,
  );
  if (!consentVersions || !Array.isArray(value.consents)) {
    return null;
  }

  const consents = value.consents.map(parseConsentRecord);
  if (consents.some(consent => consent === null)) {
    return null;
  }

  const parsedConsents = consents as FaceAnalysisConsentRecord[];
  const consentTypes = parsedConsents.map(consent => consent.consentType);
  if (
    parsedConsents.length !== requiredConsentTypes.length ||
    new Set(consentTypes).size !== consentTypes.length ||
    !requiredConsentTypes.every(consentType => consentTypes.includes(consentType))
  ) {
    return null;
  }

  return {
    allRequiredActive: value.allRequiredActive,
    consentVersions,
    consents: parsedConsents,
    requiredConsentTypes,
  };
}

function isCurrentActiveConsent(
  status: FaceAnalysisConsentStatus,
  consentType: FaceAnalysisConsentType,
): boolean {
  const expectedVersion = status.consentVersions[consentType];
  const consent = status.consents.find(
    candidate => candidate.consentType === consentType,
  );

  return Boolean(
    isNonEmptyString(expectedVersion) &&
      consent?.active === true &&
      consent.version === expectedVersion &&
      isNonEmptyString(consent.id) &&
      isIsoTimestamp(consent.acceptedAt) &&
      consent.revokedAt === null &&
      consent.metadata?.surface === 'face_analysis' &&
      consent.metadata.rawSensorArtifactsStored === false &&
      consent.metadata.trainingUseAllowed === false,
  );
}

export function getUnacceptedRequiredConsentTypes(
  status: FaceAnalysisConsentStatus,
): FaceAnalysisConsentType[] {
  const unaccepted = status.requiredConsentTypes.filter(
    consentType => !isCurrentActiveConsent(status, consentType),
  );

  if (!status.allRequiredActive && unaccepted.length === 0) {
    return [...status.requiredConsentTypes];
  }

  return unaccepted;
}

export function hasFreshRequiredFaceAnalysisConsents(
  status: FaceAnalysisConsentStatus,
): boolean {
  return (
    status.allRequiredActive &&
    getUnacceptedRequiredConsentTypes(status).length === 0
  );
}

export function requiresThirdPartyAiConsent(
  status: Pick<FaceAnalysisConsentStatus, 'requiredConsentTypes'>,
): boolean {
  return status.requiredConsentTypes.includes('third_party_ai');
}

export function buildFaceAnalysisConsentAcceptance(
  version: string,
): FaceAnalysisConsentAcceptance {
  if (!isNonEmptyString(version)) {
    throw new Error('A current consent version is required.');
  }

  return {
    accepted: true,
    metadata: {
      rawSensorArtifactsStored: false,
      surface: 'face_analysis',
      trainingUseAllowed: false,
    },
    version,
  };
}

export function buildFaceAnalysisConsentCache(
  status: FaceAnalysisConsentStatus,
  cachedAt: string,
): FaceAnalysisConsentCache {
  if (!hasFreshRequiredFaceAnalysisConsents(status) || !isIsoTimestamp(cachedAt)) {
    throw new Error('Only a fresh, fully active server consent may be cached.');
  }

  const consentVersions: Partial<Record<FaceAnalysisConsentType, string>> = {};
  for (const consentType of status.requiredConsentTypes) {
    consentVersions[consentType] = status.consentVersions[consentType];
  }

  return {
    cachedAt,
    consentVersions,
    requiredConsentTypes: [...status.requiredConsentTypes],
    schemaVersion: 1,
  };
}

export function parseFaceAnalysisConsentCache(
  rawValue: string | null,
): FaceAnalysisConsentCache | null {
  if (!rawValue) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.schemaVersion !== 1 || !isIsoTimestamp(value.cachedAt)) {
    return null;
  }

  const requiredConsentTypes = parseRequiredConsentTypes(
    value.requiredConsentTypes,
  );
  if (!requiredConsentTypes) {
    return null;
  }

  const consentVersions = parseConsentVersions(
    value.consentVersions,
    requiredConsentTypes,
  );
  if (!consentVersions) {
    return null;
  }

  return {
    cachedAt: value.cachedAt,
    consentVersions,
    requiredConsentTypes,
    schemaVersion: 1,
  };
}
