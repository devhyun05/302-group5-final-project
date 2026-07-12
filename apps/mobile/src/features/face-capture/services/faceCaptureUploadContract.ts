import {parseFaceProfile} from '../../face-profile/services/faceProfileContract';
import type {FaceProfileResult} from '../../../shared/types/faceProfile';

export type FaceCaptureUploadSource = 'camera' | 'gallery';

export type FaceCapturePresignedUpload = {
  bucket: string;
  cdnUrl?: string | null;
  contentType?: string | null;
  objectKey: string;
  uploadId?: string | null;
};

export type FaceCaptureCompletionMetadata = {
  byteSize: number;
  contentType: string;
  height?: number | null;
  mediaKind: string;
  originalFilename: string;
  source: FaceCaptureUploadSource;
  width?: number | null;
};

export type FaceCaptureDevicePayloadInput = {
  captureType?: string;
  contentType: string;
  height?: number | null;
  nativeDepthToken?: string;
  nativeMatteToken?: string;
  originalFilename: string;
  source: FaceCaptureUploadSource;
  sourceUri: string;
  width?: number | null;
};

export function buildFaceCaptureDevicePayload(
  input: FaceCaptureDevicePayloadInput,
) {
  if (input.captureType === 'face_analysis') {
    return {
      contentType: input.contentType,
      height: input.height ?? null,
      rawSensorArtifactsStored: false as const,
      width: input.width ?? null,
    };
  }

  return {
    height: input.height ?? null,
    originalFilename: input.originalFilename,
    sourceUri: input.sourceUri,
    width: input.width ?? null,
  };
}

export type FaceCaptureCompleteUploadBody =
  | {uploadId: string}
  | {
      bucket: string;
      byteSize: number;
      cdnUrl: string | null;
      contentType: string;
      height: number | null;
      mediaKind: string;
      objectKey: string;
      originalFilename: string;
      source: FaceCaptureUploadSource;
      width: number | null;
    };

export function buildFaceCaptureCompleteUploadBody(
  upload: FaceCapturePresignedUpload,
  metadata: FaceCaptureCompletionMetadata,
): FaceCaptureCompleteUploadBody {
  const uploadId = upload.uploadId?.trim();

  if (uploadId) {
    return {uploadId};
  }

  // 구버전 백엔드 호환 경로. 최신 백엔드는 이 위치를 그대로 신뢰하지 않고
  // 현재 사용자에게 서버가 발급한 pending upload session과 다시 대조한다.
  return {
    bucket: upload.bucket,
    byteSize: metadata.byteSize,
    cdnUrl: upload.cdnUrl || null,
    contentType: metadata.contentType,
    height: metadata.height ?? null,
    mediaKind: metadata.mediaKind,
    objectKey: upload.objectKey,
    originalFilename: metadata.originalFilename,
    source: metadata.source,
    width: metadata.width ?? null,
  };
}

const FORBIDDEN_FACE_ANALYSIS_REQUEST_KEYS = new Set([
  'rawlandmarks',
  'landmarks',
  'depthmap',
  'nativedepthtoken',
  'nativemattetoken',
  'calibrationdata',
  'semanticmatte',
  'sourceuri',
  'roipixels',
]);

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function assertFaceAnalysisRequestBodyPrivacy(body: unknown): void {
  let serializedBody: string;
  let plainBody: unknown;
  try {
    const serialized = JSON.stringify(body);
    if (serialized === undefined) {
      throw new Error('undefined serialization');
    }
    serializedBody = serialized;
    plainBody = JSON.parse(serializedBody) as unknown;
  } catch {
    throw new Error('Face analysis request must be JSON serializable.');
  }

  if (
    !plainBody ||
    typeof plainBody !== 'object' ||
    Array.isArray(plainBody) ||
    !Object.prototype.hasOwnProperty.call(plainBody, 'faceProfile')
  ) {
    throw new Error('Face analysis request requires a top-level faceProfile.');
  }

  let faceProfileCount = 0;

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [key, nested] of Object.entries(value)) {
      const normalized = normalizedKey(key);
      if (normalized === 'faceprofile') {
        faceProfileCount += 1;
      }
      if (FORBIDDEN_FACE_ANALYSIS_REQUEST_KEYS.has(normalized)) {
        throw new Error(`Face analysis request contains forbidden key: ${key}`);
      }
      visit(nested);
    }
  }

  visit(plainBody);
  if (faceProfileCount !== 1) {
    throw new Error('Face analysis request must contain top-level faceProfile exactly once.');
  }
}

export function buildFaceAnalysisRequestPayload<TFaceVerticalThirds>(
  faceProfile: FaceProfileResult,
  faceVerticalThirds?: TFaceVerticalThirds,
) {
  const validatedFaceProfile = parseFaceProfile(faceProfile);
  if (!validatedFaceProfile) {
    throw new Error('A valid current-version FaceProfile is required for analysis.');
  }

  const contract = {
    faceProfile: validatedFaceProfile,
    requestPayload: {
      ...(faceVerticalThirds ? {faceVerticalThirds} : {}),
      task: 'face_makeup_recommendation_report_v1' as const,
    },
  };

  assertFaceAnalysisRequestBodyPrivacy(contract);
  return contract;
}

export function buildFaceAnalysisRequestBody<TFaceVerticalThirds>({
  faceProfile,
  faceVerticalThirds,
  photoCaptureId,
  previewMediaId,
  sourceMediaId,
}: {
  faceProfile: FaceProfileResult;
  faceVerticalThirds?: TFaceVerticalThirds;
  photoCaptureId: string;
  previewMediaId: string;
  sourceMediaId: string;
}) {
  const contract = buildFaceAnalysisRequestPayload(
    faceProfile,
    faceVerticalThirds,
  );
  if (contract.faceProfile.captureId !== photoCaptureId) {
    throw new Error('faceProfile.captureId must match photoCaptureId.');
  }

  const body = {
    faceProfile: contract.faceProfile,
    photoCaptureId,
    previewMediaId,
    requestPayload: contract.requestPayload,
    runImmediately: true as const,
    sourceMediaId,
  };
  assertFaceAnalysisRequestBodyPrivacy(body);
  return body;
}
