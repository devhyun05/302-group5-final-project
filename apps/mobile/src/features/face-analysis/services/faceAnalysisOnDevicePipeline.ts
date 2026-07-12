import type {FaceProfileResult} from '../../../shared/types/faceProfile';
import type {
  FaceCaptureLocalPreviewOwnership,
} from '../../face-capture/services/faceCaptureLocalPreviewOwnership';
import {
  finalizePreparedFaceProfile,
  type FaceProfileCaptureInput,
  type PreparedFaceProfileInputs,
} from '../../face-profile/services/faceProfileService';
import type {FaceCaptureQualitySnapshot} from '../../face-profile/services/faceProfileBuilder';

export type FaceAnalysisPipelineImageInput = FaceProfileCaptureInput & {
  captureType?: 'face_analysis';
  contentType?: string | null;
  fileName?: string | null;
  mediaKind?: string;
  trueDepth?: {
    captured: boolean;
    expiresInMs?: number;
    failureReason?: string;
    requested: boolean;
    supported: boolean;
  };
};

export type FaceAnalysisSanitizedUploadInput = {
  captureType: 'face_analysis';
  contentType: 'image/jpeg';
  fileName: string;
  height?: number | null;
  mediaKind?: string;
  source: 'camera' | 'gallery';
  uri: string;
  width?: number | null;
};

export type FaceAnalysisUploadedCapture = {
  bucket: string;
  cdnUrl?: string | null;
  contentType?: string | null;
  height?: number | null;
  imageUri: string;
  mediaId: string;
  objectKey: string;
  photoCaptureId: string;
  source: 'camera' | 'gallery';
  width?: number | null;
};

export type FaceAnalysisOnDeviceCaptureResult = FaceAnalysisUploadedCapture & {
  /** Local-only, defined as non-enumerable by the pipeline. */
  derivedFaceProfile?: FaceProfileResult;
  /** Local-only, defined as non-enumerable by the pipeline. */
  localPreviewOwnership?: FaceCaptureLocalPreviewOwnership;
  /** Local-only, defined as non-enumerable by the pipeline. */
  localPreviewUri?: string;
};

export type FaceAnalysisOnDevicePipelineDependencies = {
  discardTransientCapture: (input: FaceAnalysisPipelineImageInput) => Promise<void>;
  prepare: (
    input: FaceProfileCaptureInput,
    quality: FaceCaptureQualitySnapshot | null,
  ) => Promise<PreparedFaceProfileInputs>;
  sanitize: (imageUri: string) => Promise<{uri: string}>;
  upload: (
    input: FaceAnalysisSanitizedUploadInput,
  ) => Promise<FaceAnalysisUploadedCapture>;
};

export type FaceAnalysisOnDevicePipelineInput = {
  captureQualitySnapshot: FaceCaptureQualitySnapshot | null;
  image: FaceAnalysisPipelineImageInput;
  ownership: FaceCaptureLocalPreviewOwnership;
  signal?: AbortSignal;
};

function abortError(): Error {
  return new Error('face_analysis_pipeline_aborted');
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw abortError();
  }
}

function attachLocalOnlyFields(
  result: FaceAnalysisUploadedCapture,
  profile: FaceProfileResult,
  previewUri: string,
  ownership: FaceCaptureLocalPreviewOwnership,
): FaceAnalysisOnDeviceCaptureResult {
  const localResult: FaceAnalysisOnDeviceCaptureResult = {...result};
  for (const [key, value] of [
    ['derivedFaceProfile', profile],
    ['localPreviewOwnership', ownership],
    ['localPreviewUri', previewUri],
  ] as const) {
    Object.defineProperty(localResult, key, {
      configurable: false,
      enumerable: false,
      value,
      writable: false,
    });
  }
  return localResult;
}

export async function runFaceAnalysisOnDevicePipeline(
  input: FaceAnalysisOnDevicePipelineInput,
  dependencies: FaceAnalysisOnDevicePipelineDependencies,
): Promise<FaceAnalysisOnDeviceCaptureResult> {
  let preparationStarted = false;
  let transientDiscard: Promise<void> | null = null;
  const discardTransientOnce = () => {
    transientDiscard ??= dependencies.discardTransientCapture(input.image);
    return transientDiscard;
  };

  try {
    throwIfAborted(input.signal);
    const sanitized = await dependencies.sanitize(input.image.uri);
    input.ownership.registerSanitizedPreview(sanitized.uri);
    throwIfAborted(input.signal);

    const originalRelease = input.ownership.releaseOriginalAfterSanitize();
    const preparationInput: FaceProfileCaptureInput = {
      height: input.image.height,
      // Sanitizer bakes one upright, unmirrored pixel space. Facing is not an
      // image transform and must never trigger a second x-mirror here.
      mirrored: false,
      nativeDepthToken: input.image.nativeDepthToken,
      nativeMatteToken: input.image.nativeMatteToken,
      source: input.image.source,
      uri: sanitized.uri,
      width: input.image.width,
    };
    const uploadInput: FaceAnalysisSanitizedUploadInput = {
      captureType: 'face_analysis',
      contentType: 'image/jpeg',
      fileName: 'face-analysis-sanitized.jpg',
      height: input.image.height,
      mediaKind: input.image.mediaKind,
      source: input.image.source,
      uri: sanitized.uri,
      width: input.image.width,
    };

    const uploadPromise = dependencies.upload(uploadInput);
    const preparationPromise = dependencies.prepare(
      preparationInput,
      input.captureQualitySnapshot,
    );
    preparationStarted = true;
    const [uploaded, prepared] = await Promise.allSettled([
      uploadPromise,
      preparationPromise,
    ]);
    await originalRelease;
    throwIfAborted(input.signal);

    if (uploaded.status === 'rejected') {
      throw uploaded.reason;
    }
    if (prepared.status === 'rejected') {
      throw prepared.reason;
    }

    const profile = finalizePreparedFaceProfile(prepared.value, uploaded.value);
    const result = attachLocalOnlyFields(
      {
        ...uploaded.value,
        contentType: 'image/jpeg',
        imageUri: uploaded.value.cdnUrl ?? sanitized.uri,
      },
      profile,
      sanitized.uri,
      input.ownership,
    );
    input.ownership.transfer('capture', 'confirmation');
    return result;
  } catch (error) {
    if (!preparationStarted) {
      await discardTransientOnce().catch(() => undefined);
    }
    await input.ownership.release('capture');
    throw error;
  }
}
