export const UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION =
  'aura-unity-face-analysis-v1' as const;

export type UnityFaceImageAnalysisCameraFacing = 'front' | 'back' | 'unknown';

export type UnityFaceImageAnalysisRotationDegrees = 0 | 90 | 180 | 270;

export type UnityFaceImageAnalysisRequest = {
  cameraFacing: UnityFaceImageAnalysisCameraFacing;
  captureId?: string;
  imageUri: string;
  privacy: {
    localOnly: true;
    longTermRawFrameStored: false;
    offDeviceUpload: false;
  };
  purpose: 'face_ratio_personal_color_camera_context';
  requestedAtMs: number;
  requestedBy: 'aura-camera-analysis';
  requestId: string;
  rotationDegrees: UnityFaceImageAnalysisRotationDegrees;
  schemaVersion: typeof UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION;
  sessionId?: string;
  type: 'face_image_analysis_request';
};

export type UnityFaceImageAnalysisStatus =
  | 'ok'
  | 'no_face'
  | 'unsupported'
  | 'failed';

export type UnityFaceLandmarkPoint = {
  confidence?: number;
  index: number;
  normalized: true;
  presence?: number;
  visibility?: number;
  x: number;
  y: number;
  z?: number;
};

export type UnityFaceAnalysisKeypointName =
  | 'hApprox'
  | 'glabella'
  | 'subnasale'
  | 'menton'
  | 'cheekLeft'
  | 'cheekRight';

export type UnityFaceAnalysisPose = {
  pitchDeg?: number;
  poseSource: 'mediapipe' | 'matrix' | 'unavailable';
  rollDeg?: number;
  yawDeg?: number;
};

export type UnityFaceImageAnalysisEvent = {
  cameraFacing?: UnityFaceImageAnalysisCameraFacing;
  captureId?: string;
  detail?: string;
  debugPoints?: Partial<Record<string, UnityFaceLandmarkPoint>>;
  error?: string;
  faceCount: number;
  imageHeight?: number;
  imageUri?: string;
  imageWidth?: number;
  keypoints?: Partial<Record<UnityFaceAnalysisKeypointName, UnityFaceLandmarkPoint>>;
  landmarkCount?: number;
  landmarks?: readonly UnityFaceLandmarkPoint[];
  pose?: UnityFaceAnalysisPose;
  requestId: string;
  schemaVersion: typeof UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION;
  sessionId?: string;
  status: UnityFaceImageAnalysisStatus;
  type: 'unity_face_image_analysis';
};

export function buildUnityFaceImageAnalysisRequest({
  cameraFacing = 'unknown',
  captureId,
  imageUri,
  requestedAtMs = Date.now(),
  requestId,
  rotationDegrees = 0,
  sessionId,
}: {
  cameraFacing?: UnityFaceImageAnalysisCameraFacing;
  captureId?: string;
  imageUri: string;
  requestedAtMs?: number;
  requestId?: string;
  rotationDegrees?: UnityFaceImageAnalysisRotationDegrees;
  sessionId?: string;
}): UnityFaceImageAnalysisRequest {
  const resolvedRequestId = requestId ?? `unity-face-analysis-${requestedAtMs}`;

  return {
    cameraFacing,
    captureId,
    imageUri,
    privacy: {
      localOnly: true,
      longTermRawFrameStored: false,
      offDeviceUpload: false,
    },
    purpose: 'face_ratio_personal_color_camera_context',
    requestedAtMs,
    requestedBy: 'aura-camera-analysis',
    requestId: resolvedRequestId,
    rotationDegrees,
    schemaVersion: UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION,
    sessionId,
    type: 'face_image_analysis_request',
  };
}

export function isUnityFaceImageAnalysisEvent(
  value: unknown,
): value is UnityFaceImageAnalysisEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === 'unity_face_image_analysis' &&
    value.schemaVersion === UNITY_FACE_IMAGE_ANALYSIS_SCHEMA_VERSION &&
    typeof value.requestId === 'string' &&
    typeof value.faceCount === 'number' &&
    isUnityFaceImageAnalysisStatus(value.status)
  );
}

function isUnityFaceImageAnalysisStatus(
  value: unknown,
): value is UnityFaceImageAnalysisStatus {
  return (
    value === 'ok' ||
    value === 'no_face' ||
    value === 'unsupported' ||
    value === 'failed'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
