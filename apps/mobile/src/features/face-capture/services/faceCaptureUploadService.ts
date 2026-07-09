import {requestBackendJson} from '../../../shared/services/backendApi';

export type FaceCaptureImageSource = 'camera' | 'gallery';
export type FaceCaptureCameraFacing = 'front' | 'back';
export type FaceCaptureMeasurementMode = 'standard' | 'precision';

export type FaceCaptureUploadCaptureType =
  | 'face_analysis'
  | 'makeup_feedback'
  | 'filter_extraction'
  | 'ar_try_on'
  | 'personal_color';

export type FaceCaptureCameraAnalysisScreenPoint = {
  left?: number;
  top?: number;
  x?: number;
  y?: number;
};

export type FaceCaptureCameraAnalysisSnapshot = {
  cameraMetadata?: Record<string, unknown>;
  cameraStability?: Record<string, unknown>;
  capturedAt?: string;
  greenlight?: Record<string, unknown>;
  measurementMode?: FaceCaptureMeasurementMode;
  mediaPipe?: {
    faceWidthRatio?: number;
    landmarkCount?: number;
    pitchDeg?: number;
    poseSource?: string;
    rollDeg?: number;
    screenLandmarks?: Partial<
      Record<
        | 'chin'
        | 'forehead'
        | 'leftEye'
        | 'mouthLeft'
        | 'mouthRight'
        | 'noseBridge'
        | 'noseTip'
        | 'rightEye',
        FaceCaptureCameraAnalysisScreenPoint
      >
    >;
    status?: string;
    yawDeg?: number;
  };
  precision?: {
    cameraFacing?: FaceCaptureCameraFacing;
    enabled: boolean;
    requestedSemanticMatte: boolean;
    sourceHint:
      | 'front_truedepth_semantic_matte'
      | 'mediapipe_realtime_fallback'
      | 'standard_capture';
  };
  source?: 'realtime_native_mediapipe' | 'realtime_native_vision';
};

export type FaceCaptureImageInput = {
  cameraAnalysisSnapshot?: FaceCaptureCameraAnalysisSnapshot;
  cameraFacing?: FaceCaptureCameraFacing;
  captureType?: FaceCaptureUploadCaptureType;
  contentType?: string | null;
  fileName?: string | null;
  height?: number | null;
  measurementMode?: FaceCaptureMeasurementMode;
  mediaKind?: string;
  // Apple semantic matte(hair/skin) 임베드 여부 — RealtimeCameraCaptureResult.semanticMattes를
  // 그대로 실어 얼굴 세로 비율 분석까지 전달한다. 업로드에는 사용하지 않는다.
  semanticMattes?: {hair: boolean; requested: boolean; skin: boolean};
  source: FaceCaptureImageSource;
  uri: string;
  width?: number | null;
};

export type FaceCaptureUploadResult = {
  bucket: string;
  cameraAnalysisSnapshot?: FaceCaptureCameraAnalysisSnapshot;
  cameraFacing?: FaceCaptureCameraFacing;
  cdnUrl?: string | null;
  contentType?: string | null;
  imageUri: string;
  mediaId: string;
  measurementMode?: FaceCaptureMeasurementMode;
  objectKey: string;
  photoCaptureId: string;
  semanticMattes?: {hair: boolean; requested: boolean; skin: boolean};
  source: FaceCaptureImageSource;
};

type PresignedUpload = {
  bucket: string;
  cacheControl?: string | null;
  cdnUrl?: string | null;
  contentType: string;
  expiresIn: number;
  method: 'PUT';
  objectKey: string;
  uploadUrl: string;
};

type PresignedUploadResponse = {
  upload: PresignedUpload;
};

type MediaAsset = {
  bucket: string;
  cdnUrl?: string | null;
  id: string;
  objectKey: string;
};

type CompleteUploadResponse = {
  media: MediaAsset;
};

type PhotoCapture = {
  id: string;
};

type PhotoCaptureResponse = {
  photoCapture: PhotoCapture;
};

export function inferFaceCaptureContentType(uri: string, fallback?: string | null): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  const normalizedUri = uri.split('?')[0].toLowerCase();

  if (normalizedUri.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedUri.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedUri.endsWith('.heic') || normalizedUri.endsWith('.heif')) {
    return 'image/heic';
  }

  return 'image/jpeg';
}

export function getFaceCaptureFilename(uri: string, fallback?: string | null): string {
  if (fallback?.trim()) {
    return fallback.trim();
  }

  const withoutQuery = uri.split('?')[0];
  const filename = withoutQuery.split('/').pop();

  return filename?.includes('.') ? filename : `face-capture-${Date.now()}.jpg`;
}

function readImageBlobWithXhr(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('GET', uri);
    request.responseType = 'blob';
    request.onload = () => {
      const isLocalFileRead = request.status === 0;
      const isHttpSuccess = request.status >= 200 && request.status < 300;

      if (!isLocalFileRead && !isHttpSuccess) {
        reject(new Error(`Failed to read image file with HTTP ${request.status}.`));
        return;
      }

      if (!(request.response instanceof Blob)) {
        reject(new Error('Failed to read image file as a blob.'));
        return;
      }

      resolve(request.response);
    };
    request.onerror = () => reject(new Error('Failed to read image file from the device.'));
    request.send();
  });
}

async function readImageBlob(uri: string): Promise<Blob> {
  return readImageBlobWithXhr(uri);
}

export async function uploadFaceCaptureImage({
  cameraAnalysisSnapshot,
  cameraFacing,
  captureType = 'face_analysis',
  contentType: providedContentType,
  fileName,
  height,
  measurementMode,
  mediaKind = 'capture',
  semanticMattes,
  source,
  uri,
  width,
}: FaceCaptureImageInput): Promise<FaceCaptureUploadResult> {
  const startedAt = Date.now();
  const contentType = inferFaceCaptureContentType(uri, providedContentType);
  const originalFilename = getFaceCaptureFilename(uri, fileName);

  console.info('[aura:capture-upload] start', {
    contentType,
    hasLocalUri: Boolean(uri),
    source,
  });

  const readStartedAt = Date.now();
  const imageBlob = await readImageBlob(uri);

  console.info('[aura:capture-upload] image-read:success', {
    byteSize: imageBlob.size,
    durationMs: Date.now() - readStartedAt,
  });

  console.info('[aura:capture-upload] presigned-upload:start');
  const {upload} = await requestBackendJson<PresignedUploadResponse>('/media/presigned-upload', {
    body: {
      contentType,
      height,
      mediaKind,
      originalFilename,
      source,
      width,
    },
    method: 'POST',
  });

  console.info('[aura:capture-upload] presigned-upload:success', {
    expiresIn: upload.expiresIn,
    hasCdnUrl: Boolean(upload.cdnUrl),
  });

  const s3StartedAt = Date.now();
  console.info('[aura:capture-upload] s3-put:start');
  const uploadResponse = await fetch(upload.uploadUrl, {
    body: imageBlob,
    headers: {
      ...(upload.cacheControl ? {'Cache-Control': upload.cacheControl} : {}),
      'Content-Type': contentType,
    },
    method: upload.method,
  });

  if (!uploadResponse.ok) {
    console.info('[aura:capture-upload] s3-put:fail', {
      durationMs: Date.now() - s3StartedAt,
      status: uploadResponse.status,
    });

    throw new Error(`S3 upload failed with HTTP ${uploadResponse.status}.`);
  }

  console.info('[aura:capture-upload] s3-put:success', {
    durationMs: Date.now() - s3StartedAt,
    status: uploadResponse.status,
  });

  const byteSize = imageBlob.size;
  console.info('[aura:capture-upload] media-complete:start');
  const {media} = await requestBackendJson<CompleteUploadResponse>('/media/complete-upload', {
    body: {
      bucket: upload.bucket,
      byteSize,
      cdnUrl: upload.cdnUrl || null,
      contentType,
      height,
      mediaKind,
      objectKey: upload.objectKey,
      originalFilename,
      source,
      width,
    },
    method: 'POST',
  });

  console.info('[aura:capture-upload] media-complete:success', {
    hasCdnUrl: Boolean(media.cdnUrl),
    mediaId: media.id,
  });

  console.info('[aura:capture-upload] photo-capture:start');
  const {photoCapture} = await requestBackendJson<PhotoCaptureResponse>('/photo-captures', {
    body: {
      captureType,
      devicePayload: {
        cameraAnalysisSnapshot,
        cameraFacing,
        height,
        measurementMode,
        originalFilename,
        sourceUri: uri,
        width,
      },
      mediaId: media.id,
      source,
    },
    method: 'POST',
  });

  console.info('[aura:capture-upload] photo-capture:success', {
    durationMs: Date.now() - startedAt,
    mediaId: media.id,
    photoCaptureId: photoCapture.id,
  });

  return {
    bucket: media.bucket,
    cameraAnalysisSnapshot,
    cameraFacing,
    cdnUrl: media.cdnUrl ?? null,
    contentType,
    imageUri: uri,
    mediaId: media.id,
    measurementMode,
    objectKey: media.objectKey,
    photoCaptureId: photoCapture.id,
    semanticMattes,
    source,
  };
}
