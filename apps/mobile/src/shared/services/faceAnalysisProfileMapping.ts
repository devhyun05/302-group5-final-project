import {parseFaceProfile} from '../../features/face-profile/services/faceProfileContract';
import {
  FACE_PROFILE_SCHEMA_VERSION,
  type FaceProfileResult,
  type FaceProfileStatus,
  type FaceShapeLabel,
} from '../types/faceProfile';

export type FaceAnalysisProfileSummary = {
  confidenceGap: number | null;
  dominantShape: FaceShapeLabel | null;
  schemaVersion: typeof FACE_PROFILE_SCHEMA_VERSION;
  status: FaceProfileStatus;
};

type FaceAnalysisProfileMappingInput = {
  faceProfile?: unknown;
  faceProfileSummary?: unknown;
  legacyFaceShape?: string | null;
};

export type FaceAnalysisProfileMapping = {
  faceProfile?: FaceProfileResult;
  faceProfileSummary?: FaceAnalysisProfileSummary;
  faceShape?: string;
};

export type FaceAnalysisProfileResolverCapture = {
  derivedFaceProfile?: unknown;
  photoCaptureId: string;
};

type FaceAnalysisCreateOutcomeInput = {
  errorCode?: string | null;
  faceProfile?: unknown;
  hasFaceProfile?: boolean | null;
  retakeRequired?: boolean | null;
  status?: string | null;
};

export type FaceAnalysisCreateOutcome =
  | {faceProfile?: FaceProfileResult; kind: 'continue'}
  | {
      faceProfile: FaceProfileResult;
      kind: 'retake';
      message: string;
      statusReason: string;
    }
  | {kind: 'persistence_error'; message: string};

const FACE_PROFILE_STATUSES = new Set<FaceProfileStatus>([
  'full_success',
  'partial_success',
  'blocked',
  'failed',
]);
const FACE_SHAPE_LABELS = new Set<FaceShapeLabel>([
  'oval',
  'round',
  'square',
  'heart',
  'oblong',
  'diamond',
  'triangle',
]);
const SUMMARY_KEYS = [
  'confidenceGap',
  'dominantShape',
  'schemaVersion',
  'status',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProfileStatus(value: unknown): value is FaceProfileStatus {
  return typeof value === 'string' && FACE_PROFILE_STATUSES.has(value as FaceProfileStatus);
}

function isFaceShapeLabel(value: unknown): value is FaceShapeLabel {
  return typeof value === 'string' && FACE_SHAPE_LABELS.has(value as FaceShapeLabel);
}

function summaryFromProfile(profile: FaceProfileResult): FaceAnalysisProfileSummary {
  return {
    confidenceGap: profile.faceShape.confidenceGap,
    dominantShape: profile.faceShape.dominantShape,
    schemaVersion: profile.schemaVersion,
    status: profile.status,
  };
}

export function parseFaceAnalysisProfileSummary(
  value: unknown,
): FaceAnalysisProfileSummary | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== SUMMARY_KEYS.length ||
    !SUMMARY_KEYS.every(key => key in value) ||
    value.schemaVersion !== FACE_PROFILE_SCHEMA_VERSION ||
    !isProfileStatus(value.status) ||
    !(
      value.dominantShape === null ||
      isFaceShapeLabel(value.dominantShape)
    ) ||
    !(
      value.confidenceGap === null ||
      (typeof value.confidenceGap === 'number' &&
        Number.isFinite(value.confidenceGap) &&
        value.confidenceGap >= 0 &&
        value.confidenceGap <= 1)
    )
  ) {
    return undefined;
  }

  if (
    (value.status === 'blocked' || value.status === 'failed') &&
    (value.dominantShape !== null || value.confidenceGap !== null)
  ) {
    return undefined;
  }

  return {
    confidenceGap: value.confidenceGap,
    dominantShape: value.dominantShape,
    schemaVersion: FACE_PROFILE_SCHEMA_VERSION,
    status: value.status,
  };
}

export function mapFaceAnalysisProfile(
  input: FaceAnalysisProfileMappingInput,
): FaceAnalysisProfileMapping {
  const faceProfile = parseFaceProfile(input.faceProfile) ?? undefined;
  const faceProfileSummary = faceProfile
    ? summaryFromProfile(faceProfile)
    : parseFaceAnalysisProfileSummary(input.faceProfileSummary);
  const deterministicShape =
    faceProfile && faceProfile.faceShape.status !== 'blocked'
      ? faceProfile.faceShape.dominantShape ?? undefined
      : undefined;
  const legacyFaceShape = input.legacyFaceShape?.trim() || undefined;

  return {
    faceProfile,
    faceProfileSummary,
    faceShape: faceProfile ? deterministicShape : legacyFaceShape,
  };
}

export function createFaceAnalysisProfileResolver<
  TCapture extends FaceAnalysisProfileResolverCapture,
>(
  prepareFallback: (capture: TCapture) => Promise<FaceProfileResult>,
): (capture: TCapture) => Promise<FaceProfileResult> {
  const fallbackByCaptureId = new Map<string, Promise<FaceProfileResult>>();

  return capture => {
    const derivedFaceProfile = parseFaceProfile(capture.derivedFaceProfile);
    if (
      derivedFaceProfile &&
      derivedFaceProfile.captureId === capture.photoCaptureId
    ) {
      return Promise.resolve(derivedFaceProfile);
    }

    const cachedFallback = fallbackByCaptureId.get(capture.photoCaptureId);
    if (cachedFallback) {
      return cachedFallback;
    }

    let preparedFallback: Promise<FaceProfileResult>;
    try {
      preparedFallback = prepareFallback(capture);
    } catch (error) {
      preparedFallback = Promise.reject(error);
    }

    const validatedFallback = preparedFallback.then(profile => {
      const parsedProfile = parseFaceProfile(profile);
      if (
        !parsedProfile ||
        parsedProfile.captureId !== capture.photoCaptureId
      ) {
        throw new Error(
          'Fallback FaceProfile must be valid and match photoCaptureId.',
        );
      }
      return parsedProfile;
    });
    fallbackByCaptureId.set(capture.photoCaptureId, validatedFallback);
    return validatedFallback;
  };
}

export function runFaceAnalysisCreateIfActive<T>(
  isActive: () => boolean,
  create: () => Promise<T>,
): Promise<T | null> {
  return isActive() ? create() : Promise.resolve(null);
}

export function getFaceProfileRetakeMessage(
  statusReason: string | null | undefined,
): string {
  if (statusReason === 'face_not_detected') {
    return '얼굴을 찾지 못했어요. 얼굴 전체가 가이드 안에 보이도록 다시 촬영해 주세요.';
  }

  if (statusReason === 'multiple_faces') {
    return '사진에는 한 명의 얼굴만 나오도록 다시 촬영해 주세요.';
  }

  if (
    statusReason === 'pose_unavailable' ||
    statusReason === 'pose_out_of_range' ||
    statusReason === 'pose_gate_failed'
  ) {
    return '고개를 기울이지 말고 정면을 바라본 상태로 다시 촬영해 주세요.';
  }

  if (statusReason === 'landmarks_incomplete') {
    return '얼굴을 가린 요소와 조명·초점을 확인한 뒤 다시 촬영해 주세요.';
  }

  return '촬영 품질을 확인하지 못했어요. 밝고 선명한 환경에서 다시 촬영해 주세요.';
}

export function resolveFaceAnalysisCreateOutcome(
  input: FaceAnalysisCreateOutcomeInput,
): FaceAnalysisCreateOutcome {
  const faceProfile = parseFaceProfile(input.faceProfile) ?? undefined;
  const profileRequiresRetake =
    faceProfile?.status === 'blocked' || faceProfile?.status === 'failed';
  const hasRetakeSignal =
    input.errorCode === 'FACE_PROFILE_RETAKE_REQUIRED' ||
    input.retakeRequired === true ||
    profileRequiresRetake;

  if (!hasRetakeSignal) {
    return {faceProfile, kind: 'continue'};
  }

  if (
    input.hasFaceProfile !== true ||
    !faceProfile ||
    !profileRequiresRetake ||
    input.status !== 'failed'
  ) {
    return {
      kind: 'persistence_error',
      message: '얼굴 분석 결과 저장을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
    };
  }

  const statusReason = faceProfile.statusReason ?? 'quality_unavailable';
  return {
    faceProfile,
    kind: 'retake',
    message: getFaceProfileRetakeMessage(statusReason),
    statusReason,
  };
}
