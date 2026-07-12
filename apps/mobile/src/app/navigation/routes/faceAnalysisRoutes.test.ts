import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  getFaceAnalysisCapturePreviewUri,
  getFaceAnalysisReportFooterHostHeight,
  getFaceAnalysisReportFooterReservedHeight,
  shouldCreateFaceAnalysisReportFromCapture,
  shouldRunLegacyFaceProfileFallback,
} from './faceAnalysisRoutes';
import type {FaceProfileResult} from '../../../shared/types/faceProfile';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const captureResult: FaceCaptureUploadResult = {
  bucket: 'local',
  cdnUrl: null,
  contentType: 'image/jpeg',
  imageUri: 'file:///face-analysis.jpg',
  mediaId: 'media-face-analysis',
  objectKey: 'file:///face-analysis.jpg',
  photoCaptureId: 'capture-face-analysis',
  source: 'camera',
};

expectEqual(
  shouldCreateFaceAnalysisReportFromCapture(null),
  false,
  'face analysis loading skips missing capture',
);
expectEqual(
  shouldCreateFaceAnalysisReportFromCapture(captureResult),
  true,
  'face analysis loading starts with capture',
);
expectEqual(
  shouldRunLegacyFaceProfileFallback(captureResult),
  true,
  'legacy capture without a derived profile uses one fallback analysis',
);

const preparedCapture: FaceCaptureUploadResult = {
  ...captureResult,
  derivedFaceProfile: {} as FaceProfileResult,
  localPreviewUri: 'file:///sanitized-preview.jpg',
};
expectEqual(
  shouldRunLegacyFaceProfileFallback(preparedCapture),
  false,
  'prepared capture reuses the derived profile on report retry',
);
expectEqual(
  getFaceAnalysisCapturePreviewUri(preparedCapture),
  'file:///sanitized-preview.jpg',
  'local sanitized preview is preferred while owned',
);
expectEqual(
  getFaceAnalysisReportFooterReservedHeight(18),
  86,
  'face analysis report reserves the floating footer below content',
);
expectEqual(
  getFaceAnalysisReportFooterHostHeight(874, 18),
  874,
  'face analysis report footer host covers screen for outside taps',
);
expectEqual(
  getFaceAnalysisReportFooterHostHeight(220, 18),
  264,
  'face analysis report footer host keeps room for quick action arc',
);
