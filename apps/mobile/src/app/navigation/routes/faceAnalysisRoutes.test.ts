import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  getFaceAnalysisReportFooterHostHeight,
  getFaceAnalysisReportFooterReservedHeight,
  shouldCreateFaceAnalysisReportFromCapture,
  shouldUseCurrentFaceAnalysisSession,
} from './faceAnalysisRoutes';

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
expectEqual(
  shouldUseCurrentFaceAnalysisSession({
    capture: captureResult,
    report: {
      cameraAnalysisContext: {
        captureId: 'capture-face-analysis',
        reportId: 'report-current',
      },
      id: 'report-current',
    },
    routeReportId: null,
  }),
  true,
  'current report detail uses camera session values only when capture id matches',
);
expectEqual(
  shouldUseCurrentFaceAnalysisSession({
    capture: captureResult,
    report: {
      cameraAnalysisContext: {captureId: 'capture-other'},
      id: 'report-other',
    },
    routeReportId: null,
  }),
  false,
  'current report detail does not mix camera session values across captures',
);
expectEqual(
  shouldUseCurrentFaceAnalysisSession({
    capture: captureResult,
    report: {
      cameraAnalysisContext: {
        captureId: 'capture-face-analysis',
        reportId: 'report-other',
      },
      id: 'report-current',
    },
    routeReportId: null,
  }),
  false,
  'current report detail does not mix camera session values across report ids',
);
expectEqual(
  shouldUseCurrentFaceAnalysisSession({
    capture: captureResult,
    report: {
      cameraAnalysisContext: {captureId: 'capture-face-analysis'},
      id: 'report-stored',
    },
    routeReportId: 'report-stored',
  }),
  false,
  'stored report detail restores values from backend instead of live session state',
);
