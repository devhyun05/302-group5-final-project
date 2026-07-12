import {validReadyProfile} from '../../features/face-profile/services/faceProfileContract.test';
import type {FaceProfileResult} from '../types/faceProfile';
import {
  createFaceAnalysisReportFromCapture,
  mapBackendJobToFaceAnalysisReport,
  resolveFaceAnalysisReportImageSource,
} from './faceAnalysisService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalCdnBaseUrl = process.env.EXPO_PUBLIC_CDN_BASE_URL;

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://cdn.example.com/api';

const localCaptureSource = resolveFaceAnalysisReportImageSource(
  {
    detailPayload: {
      request: {
        cdnUrl: 'https://cdn.example.com/uploads/capture/server-face.jpg',
      },
    },
  },
  {
    imageUri: 'file:///tmp/latest-face.jpg',
  },
) as {uri?: string};

expectEqual(
  localCaptureSource.uri,
  'file:///tmp/latest-face.jpg',
  'analysis report image source prefers the just-captured local image',
);

const storedCaptureSource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      cdnUrl: 'https://cdn.example.com/uploads/capture/stored-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  storedCaptureSource.uri,
  'https://cdn.example.com/uploads/capture/stored-face.jpg',
  'analysis report image source restores stored capture cdn url',
);

const objectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/object-key-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  objectKeySource.uri,
  'https://cdn.example.com/uploads/capture/object-key-face.jpg',
  'analysis report image source builds cdn url from stored object key',
);

process.env.EXPO_PUBLIC_CDN_BASE_URL = 'https://media.example.com/';

const explicitCdnObjectKeySource = resolveFaceAnalysisReportImageSource({
  detailPayload: {
    request: {
      objectKey: 'uploads/capture/explicit-cdn-face.jpg',
    },
  },
}) as {uri?: string};

expectEqual(
  explicitCdnObjectKeySource.uri,
  'https://media.example.com/uploads/capture/explicit-cdn-face.jpg',
  'analysis report image source uses explicit cdn base url before api base url',
);

process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
process.env.EXPO_PUBLIC_CDN_BASE_URL = originalCdnBaseUrl;

const mappedCurrentReport = mapBackendJobToFaceAnalysisReport({
  detailPayload: {result: {faceShape: 'AI 레거시 둥근형'}},
  faceProfile: validReadyProfile,
  faceProfileSummary: {
    confidenceGap: 0.99,
    dominantShape: 'round',
    schemaVersion: 'aura-face-profile-v1',
    status: 'full_success',
  },
  id: 'current-profile-report',
});
const mappedFullProfile: FaceProfileResult | undefined =
  mappedCurrentReport.faceProfile;
expectEqual(
  mappedFullProfile?.faceShape.dominantShape,
  'oval',
  'current detail exposes the validated full profile',
);
expectEqual(
  mappedCurrentReport.faceShape,
  'oval',
  'deterministic profile shape takes precedence over legacy AI shape',
);

const blockedFaceProfile: FaceProfileResult = {
  ...validReadyProfile,
  faceShape: {
    ...validReadyProfile.faceShape,
    confidenceGap: null,
    dominantShape: null,
    explanationTraits: [],
    faceShapeScores: {
      diamond: 0,
      heart: 0,
      oblong: 0,
      oval: 0,
      round: 0,
      square: 0,
      triangle: 0,
    },
    overallConfidence: 0,
    status: 'blocked',
    top2: [],
  },
  quality: {
    ...validReadyProfile.quality,
    blockingReasons: ['multiple_faces'],
  },
  status: 'blocked',
  statusReason: 'multiple_faces',
};
const mappedBlockedReport = mapBackendJobToFaceAnalysisReport({
  detailPayload: {result: {faceShape: 'AI 레거시 둥근형'}},
  faceProfile: blockedFaceProfile,
  id: 'blocked-profile-report',
});
expectEqual(
  mappedBlockedReport.faceShape,
  '측정 불가',
  'blocked full profile never falls back to an AI legacy shape',
);

const createWithRequiredProfile = () =>
  createFaceAnalysisReportFromCapture(
    {
      mediaId: '11111111-1111-4111-8111-111111111111',
      photoCaptureId: validReadyProfile.captureId,
    },
    validReadyProfile,
  );
void createWithRequiredProfile;
