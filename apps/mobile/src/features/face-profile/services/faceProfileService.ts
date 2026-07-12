import type {
  AuraPersonalColorResult,
  NativePersonalColorResult,
} from '../../personal-color/services/personalColorCore/contracts';
import {analyzePersonalColor} from '../../personal-color/services/personalColorCore/engine';
import type {FaceProfileResult, FaceVerticalThirdsSummary} from '../../../shared/types/faceProfile';
import type {FaceProfileDepthResolution} from './faceProfileDepthResult';
import type {FaceHairSkinBoundaryPair} from './faceProfileGeometry';
import {
  buildFaceProfile,
  buildFailedFaceProfile,
  FACE_PROFILE_PENDING_CAPTURE_ID,
  type FaceCaptureQualitySnapshot,
} from './faceProfileBuilder';

export const FACE_PROFILE_TOTAL_BUDGET_MS = 12_000;

export type FaceProfileLandmarksResult = {
  error?: string;
  faceCount: number;
  imageHeight: number;
  imageWidth: number;
  landmarks: Array<{i: number; x: number; y: number; z: number}>;
  pose: {pitchDeg: number; rollDeg: number; yawDeg: number} | null;
  requestId: string;
  status: 'ok' | 'no_face' | 'error';
};

export type FaceProfileCaptureInput = {
  height?: number | null;
  mirrored?: boolean;
  nativeDepthToken?: string;
  nativeMatteToken?: string;
  source: 'camera' | 'gallery';
  uri: string;
  width?: number | null;
};

export type FaceProfileVerticalAnalysisInput = {
  artifactPolicy: 'face_profile';
  captureId: string;
  createdAt: string;
  imageUri: string;
  nativeMatteToken?: string;
  precomputedLandmarks: FaceProfileLandmarksResult;
  sessionId: string;
};

export type FaceProfilePersonalColorAnalysisInput = {
  artifactPolicy: 'face_profile';
  captureId: string;
  createdAt: string;
  imageUri: string;
  nativeMatteToken?: string;
  precomputedLandmarks: FaceProfileLandmarksResult;
  sessionId: string;
};

export type FaceProfileVerticalAnalysis = {
  hairSkinBoundary: FaceHairSkinBoundaryPair | null;
  summary: FaceVerticalThirdsSummary | null;
};

export type FaceProfilePersonalColorAnalysis = {
  native: NativePersonalColorResult;
  result: AuraPersonalColorResult;
};

export type FaceProfileDependencies = {
  analyzeDepth: (
    token: string,
    options: {
      deadlineMs: number;
      landmarks: {
        imageHeight: number;
        imageWidth: number;
        points: FaceProfileLandmarksResult['landmarks'];
      };
    },
    signal?: AbortSignal,
  ) => Promise<FaceProfileDepthResolution>;
  analyzePersonalColor: (
    input: FaceProfilePersonalColorAnalysisInput,
  ) => Promise<FaceProfilePersonalColorAnalysis>;
  analyzeVerticalThirds: (
    input: FaceProfileVerticalAnalysisInput,
  ) => Promise<FaceProfileVerticalAnalysis>;
  discardDepthToken: (token: string) => Promise<void>;
  discardMatteToken: (token: string) => Promise<void>;
  now: () => number;
  requestLandmarks: (
    imageUri: string,
    options: {timeoutMs: number},
  ) => Promise<FaceProfileLandmarksResult>;
};

export type PreparedFaceProfileInputs = {
  profile: FaceProfileResult;
};

function safeWarning(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'face_landmarks_timeout') {
    return message;
  }
  if (message === 'face_profile_budget_exceeded') {
    return message;
  }
  return 'face_profile_pipeline_error';
}

function emptyPersonalColor(
  faceCount: number,
  warning: string,
): FaceProfilePersonalColorAnalysis {
  const native: NativePersonalColorResult = {
    faceCount,
    status: 'error',
    warnings: [warning],
  };
  return {native, result: analyzePersonalColor(native)};
}

function remainingBudget(startedAt: number, now: () => number): number {
  return Math.max(1, FACE_PROFILE_TOTAL_BUDGET_MS - (now() - startedAt));
}

function withinBudget<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('face_profile_budget_exceeded')),
      timeoutMs,
    );
    promise.then(
      value => {
        clearTimeout(timeout);
        resolve(value);
      },
      error => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function blockedProfile(
  input: FaceProfileCaptureInput,
  snapshot: FaceCaptureQualitySnapshot | null,
  landmarks: FaceProfileLandmarksResult,
  createdAt: string,
): FaceProfileResult {
  const personalColor = emptyPersonalColor(
    landmarks.faceCount,
    landmarks.pose ? 'face_count_blocked' : 'pose_unavailable',
  );
  return buildFaceProfile({
    captureId: FACE_PROFILE_PENDING_CAPTURE_ID,
    captureQualitySnapshot: snapshot,
    createdAt,
    depth: null,
    faceCount: landmarks.faceCount,
    imageHeight: landmarks.imageHeight || input.height || 0,
    imageWidth: landmarks.imageWidth || input.width || 0,
    landmarks: landmarks.landmarks,
    mirrored: input.mirrored ?? false,
    nativePersonalColor: personalColor.native,
    personalColor: personalColor.result,
    pose: landmarks.pose,
    verticalThirds: null,
  });
}

export async function prepareFaceProfileCapture(
  input: FaceProfileCaptureInput,
  captureQualitySnapshot: FaceCaptureQualitySnapshot | null,
  dependencies?: FaceProfileDependencies,
): Promise<PreparedFaceProfileInputs> {
  const createdAt = captureQualitySnapshot?.capturedAt ?? new Date().toISOString();
  if (!dependencies) {
    return {profile: buildFailedFaceProfile(createdAt, 'dependencies_unavailable')};
  }

  const startedAt = dependencies.now();
  const abortController = new AbortController();
  let depthDiscard: Promise<void> | null = null;
  let matteDiscard: Promise<void> | null = null;
  let depthHandedOff = false;
  const discardDepthOnce = () => {
    if (!input.nativeDepthToken || depthHandedOff) {
      return Promise.resolve();
    }
    depthDiscard ??= Promise.resolve().then(() =>
      dependencies.discardDepthToken(input.nativeDepthToken as string),
    );
    return depthDiscard;
  };
  const discardMatteOnce = () => {
    if (!input.nativeMatteToken) {
      return Promise.resolve();
    }
    matteDiscard ??= Promise.resolve().then(() =>
      dependencies.discardMatteToken(input.nativeMatteToken as string),
    );
    return matteDiscard;
  };

  try {
    const landmarks = await withinBudget(
      dependencies.requestLandmarks(input.uri, {
        timeoutMs: remainingBudget(startedAt, dependencies.now),
      }),
      remainingBudget(startedAt, dependencies.now),
    );

    if (
      landmarks.status !== 'ok' ||
      landmarks.faceCount !== 1 ||
      landmarks.pose === null ||
      landmarks.landmarks.length < 478
    ) {
      if (landmarks.status === 'error') {
        return {
          profile: buildFailedFaceProfile(
            createdAt,
            landmarks.error ?? 'face_landmarks_error',
          ),
        };
      }
      return {
        profile: blockedProfile(
          input,
          captureQualitySnapshot,
          landmarks,
          createdAt,
        ),
      };
    }

    const sessionId = `face-profile-${createdAt}`;
    const sharedInput = {
      artifactPolicy: 'face_profile' as const,
      captureId: FACE_PROFILE_PENDING_CAPTURE_ID,
      createdAt,
      imageUri: input.uri,
      nativeMatteToken: input.nativeMatteToken,
      precomputedLandmarks: landmarks,
      sessionId,
    };
    const verticalPromise = dependencies.analyzeVerticalThirds(sharedInput);
    const personalPromise = dependencies.analyzePersonalColor(sharedInput);
    let depthPromise: Promise<FaceProfileDepthResolution>;
    if (input.nativeDepthToken) {
      depthPromise = dependencies.analyzeDepth(
        input.nativeDepthToken,
        {
          deadlineMs: 1500,
          landmarks: {
            imageHeight: landmarks.imageHeight,
            imageWidth: landmarks.imageWidth,
            points: landmarks.landmarks,
          },
        },
        abortController.signal,
      );
      depthHandedOff = true;
    } else {
      depthPromise = Promise.resolve({
          kind: 'fallback_2d' as const,
          summary: {consumed: false as const, status: 'unsupported' as const},
          warnings: ['depth_unsupported'],
        });
    }

    const [verticalSettled, personalSettled, depthSettled] = await withinBudget(
      Promise.allSettled([verticalPromise, personalPromise, depthPromise]),
      remainingBudget(startedAt, dependencies.now),
    );
    const vertical =
      verticalSettled.status === 'fulfilled'
        ? verticalSettled.value
        : {hairSkinBoundary: null, summary: null};
    const personal =
      personalSettled.status === 'fulfilled'
        ? personalSettled.value
        : emptyPersonalColor(landmarks.faceCount, 'personal_color_unavailable');
    const depth =
      depthSettled.status === 'fulfilled'
        ? depthSettled.value
        : {
            kind: 'fallback_2d' as const,
            summary: {consumed: true as const, status: 'error' as const},
            warnings: ['depth_error'],
          };
    const warnings = [
      ...(verticalSettled.status === 'rejected'
        ? ['vertical_thirds_unavailable']
        : []),
      ...(personalSettled.status === 'rejected'
        ? ['personal_color_unavailable']
        : []),
      ...depth.warnings,
    ];

    return {
      profile: buildFaceProfile({
        captureId: FACE_PROFILE_PENDING_CAPTURE_ID,
        captureQualitySnapshot,
        createdAt,
        depth: depth.summary,
        faceCount: landmarks.faceCount,
        hairSkinBoundary: vertical.hairSkinBoundary,
        imageHeight: landmarks.imageHeight,
        imageWidth: landmarks.imageWidth,
        landmarks: landmarks.landmarks,
        mirrored: input.mirrored ?? false,
        nativePersonalColor: personal.native,
        personalColor: personal.result,
        pose: landmarks.pose,
        verticalThirds: vertical.summary,
        warnings,
      }),
    };
  } catch (error) {
    abortController.abort();
    return {profile: buildFailedFaceProfile(createdAt, safeWarning(error))};
  } finally {
    await Promise.all([
      discardDepthOnce().catch(() => undefined),
      discardMatteOnce().catch(() => undefined),
    ]);
  }
}

export function finalizePreparedFaceProfile(
  prepared: PreparedFaceProfileInputs,
  uploaded: {photoCaptureId: string},
): FaceProfileResult {
  return {...prepared.profile, captureId: uploaded.photoCaptureId};
}
