import {
  addUnityMakeupEventListener,
  isUnityMakeupFrameworkAvailable,
  postUnityFaceImageAnalysisRequest,
} from '../../ar/services/unityMakeupBridge';
import {
  buildUnityFaceImageAnalysisRequest,
  isUnityFaceImageAnalysisEvent,
  type UnityFaceImageAnalysisCameraFacing,
  type UnityFaceImageAnalysisEvent,
  type UnityFaceLandmarkPoint,
} from '../../../shared/contracts/unityFaceAnalysis';
import type {
  NativeFaceRatioAnalyzeResult,
  NativeFaceRatioKeypointKey,
  NativeFaceRatioPoint,
  NativeFaceRatioPose,
} from '../types';

const DEFAULT_UNITY_FACE_IMAGE_ANALYSIS_TIMEOUT_MS = 6500;

export type UnityFaceImageAnalyzeInput = {
  cameraFacing?: UnityFaceImageAnalysisCameraFacing;
  captureId: string;
  imageUri: string;
  sessionId: string;
  timeoutMs?: number;
};

function toNativePoint(
  point: UnityFaceLandmarkPoint | null | undefined,
): NativeFaceRatioPoint | undefined {
  if (
    !point ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    return undefined;
  }

  return typeof point.z === 'number' && Number.isFinite(point.z)
    ? {x: point.x, y: point.y, z: point.z}
    : {x: point.x, y: point.y};
}

function mapPointRecord(
  points: Partial<Record<string, UnityFaceLandmarkPoint>> | undefined,
): Partial<Record<string, NativeFaceRatioPoint>> | undefined {
  if (!points) {
    return undefined;
  }

  const mapped: Partial<Record<string, NativeFaceRatioPoint>> = {};

  Object.entries(points).forEach(([key, point]) => {
    const nativePoint = toNativePoint(point);

    if (nativePoint) {
      mapped[key] = nativePoint;
    }
  });

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function mapKeypoints(
  event: UnityFaceImageAnalysisEvent,
): Partial<Record<NativeFaceRatioKeypointKey, NativeFaceRatioPoint>> | undefined {
  const mapped: Partial<Record<NativeFaceRatioKeypointKey, NativeFaceRatioPoint>> = {};

  (['hApprox', 'glabella', 'subnasale', 'menton'] as NativeFaceRatioKeypointKey[])
    .forEach(key => {
      const nativePoint = toNativePoint(event.keypoints?.[key]);

      if (nativePoint) {
        mapped[key] = nativePoint;
      }
    });

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function mapPose(event: UnityFaceImageAnalysisEvent): NativeFaceRatioPose | undefined {
  const pitchDeg = event.pose?.pitchDeg;
  const rollDeg = event.pose?.rollDeg;
  const yawDeg = event.pose?.yawDeg;

  if (
    typeof pitchDeg !== 'number' ||
    typeof rollDeg !== 'number' ||
    typeof yawDeg !== 'number' ||
    !Number.isFinite(pitchDeg) ||
    !Number.isFinite(rollDeg) ||
    !Number.isFinite(yawDeg)
  ) {
    return undefined;
  }

  return {
    pitchDeg,
    poseSource: event.pose?.poseSource === 'unavailable' ? 'unavailable' : 'matrix',
    rollDeg,
    yawDeg,
  };
}

export function mapUnityFaceImageAnalysisToNativeResult(
  event: UnityFaceImageAnalysisEvent,
): NativeFaceRatioAnalyzeResult {
  return {
    debugPoints: mapPointRecord(event.debugPoints),
    error: event.error ?? event.detail,
    faceCount: event.faceCount,
    imageHeight: event.imageHeight,
    imageWidth: event.imageWidth,
    keypoints: mapKeypoints(event),
    landmarkCount: event.landmarkCount,
    pose: mapPose(event),
    status:
      event.status === 'ok'
        ? 'ok'
        : event.status === 'no_face'
          ? 'no_face'
          : 'unsupported',
  };
}

function parseUnityFaceImageAnalysisEvent(
  message: string | undefined,
): UnityFaceImageAnalysisEvent | null {
  if (!message) {
    return null;
  }

  try {
    const parsed = JSON.parse(message) as unknown;

    return isUnityFaceImageAnalysisEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function analyzeFacePhotoWithUnity(
  input: UnityFaceImageAnalyzeInput,
): Promise<NativeFaceRatioAnalyzeResult | null> {
  if (!isUnityMakeupFrameworkAvailable()) {
    return null;
  }

  const requestedAtMs = Date.now();
  const request = buildUnityFaceImageAnalysisRequest({
    cameraFacing: input.cameraFacing ?? 'unknown',
    captureId: input.captureId,
    imageUri: input.imageUri,
    requestedAtMs,
    requestId: `unity-face-analysis:${input.captureId}:${requestedAtMs}`,
    sessionId: input.sessionId,
  });

  return new Promise(resolve => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscription: {remove: () => void} | null = null;
    const settle = (result: NativeFaceRatioAnalyzeResult | null) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription?.remove();
      resolve(result);
    };
    subscription = addUnityMakeupEventListener(event => {
      const parsed = parseUnityFaceImageAnalysisEvent(event.message);

      if (!parsed || parsed.requestId !== request.requestId) {
        return;
      }

      settle(mapUnityFaceImageAnalysisToNativeResult(parsed));
    });
    timeoutId = setTimeout(
      () => settle(null),
      input.timeoutMs ?? DEFAULT_UNITY_FACE_IMAGE_ANALYSIS_TIMEOUT_MS,
    );

    if (!postUnityFaceImageAnalysisRequest(request)) {
      settle(null);
    }
  });
}
