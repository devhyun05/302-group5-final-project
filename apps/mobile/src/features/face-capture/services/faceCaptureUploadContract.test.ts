import {
  buildFaceAnalysisRequestBody,
  buildFaceAnalysisRequestPayload,
  buildFaceCaptureDevicePayload,
  buildFaceCaptureCompleteUploadBody,
  assertFaceAnalysisRequestBodyPrivacy,
} from './faceCaptureUploadContract';
import {validReadyProfile} from '../../face-profile/services/faceProfileContract.test';
import type {FaceProfileResult} from '../../../shared/types/faceProfile';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectThrows(operation: () => unknown, label: string) {
  try {
    operation();
  } catch {
    return;
  }

  throw new Error(`${label}: expected operation to throw`);
}

const uploadIdBody = buildFaceCaptureCompleteUploadBody(
  {
    bucket: 'media-bucket',
    contentType: 'image/jpeg',
    objectKey: 'uploads/capture/face.jpg',
    uploadId: '11111111-1111-1111-1111-111111111111',
  },
  {
    byteSize: 123,
    contentType: 'image/jpeg',
    mediaKind: 'capture',
    originalFilename: 'face.jpg',
    source: 'camera',
  },
);

expectEqual(
  JSON.stringify(uploadIdBody),
  JSON.stringify({uploadId: '11111111-1111-1111-1111-111111111111'}),
  'current backend completion uses only the server upload id',
);

const legacyBody = buildFaceCaptureCompleteUploadBody(
  {
    bucket: 'media-bucket',
    cdnUrl: 'https://cdn.example.com/uploads/capture/face.jpg',
    contentType: 'image/jpeg',
    objectKey: 'uploads/capture/face.jpg',
  },
  {
    byteSize: 123,
    contentType: 'image/jpeg',
    height: 1600,
    mediaKind: 'capture',
    originalFilename: 'face.jpg',
    source: 'camera',
    width: 1200,
  },
);

if ('uploadId' in legacyBody) {
  throw new Error('legacy completion must not synthesize an upload id');
}

expectEqual(legacyBody.bucket, 'media-bucket', 'legacy completion bucket');
expectEqual(legacyBody.objectKey, 'uploads/capture/face.jpg', 'legacy completion object key');
expectEqual(legacyBody.mediaKind, 'capture', 'legacy completion media kind');
expectEqual(legacyBody.byteSize, 123, 'legacy completion byte size');

const blankUploadIdBody = buildFaceCaptureCompleteUploadBody(
  {
    bucket: 'media-bucket',
    objectKey: 'uploads/capture/blank-id.jpg',
    uploadId: '   ',
  },
  {
    byteSize: 321,
    contentType: 'image/jpeg',
    mediaKind: 'capture',
    originalFilename: 'blank-id.jpg',
    source: 'gallery',
  },
);

if ('uploadId' in blankUploadIdBody) {
  throw new Error('blank upload ids must use the legacy completion contract');
}

expectEqual(
  blankUploadIdBody.objectKey,
  'uploads/capture/blank-id.jpg',
  'blank upload id fallback object key',
);

const faceVerticalThirds = {
  confidence: 0.91,
  displayRatio: {lower: 1.08, middle: 1, upper: 0.96},
  dominantPart: 'lower',
  hairline: {confidence: 0.84, provider: 'apple_semantic_matte'},
  status: 'full_success',
  summary: '하안부가 조금 길어요',
};
const analysisRequestContract = buildFaceAnalysisRequestPayload(
  validReadyProfile,
  faceVerticalThirds,
);

expectEqual(
  JSON.stringify(Object.keys(analysisRequestContract).sort()),
  JSON.stringify(['faceProfile', 'requestPayload']),
  'public analysis request fragment has only profile and request payload',
);
expectEqual(
  analysisRequestContract.faceProfile,
  validReadyProfile,
  'validated profile is emitted once at top level',
);
expectEqual(
  JSON.stringify(Object.keys(analysisRequestContract.requestPayload).sort()),
  JSON.stringify(['faceVerticalThirds', 'task']),
  'request payload is a derived-only allowlist',
);
expectEqual(
  analysisRequestContract.requestPayload.faceVerticalThirds,
  faceVerticalThirds,
  'request payload preserves the existing vertical-thirds summary',
);
expectEqual(
  analysisRequestContract.requestPayload.task,
  'face_makeup_recommendation_report_v1',
  'request payload preserves the face analysis task',
);

const serializedAnalysisRequest = JSON.stringify(analysisRequestContract);
expectEqual(
  serializedAnalysisRequest.match(/"faceProfile"\s*:/g)?.length ?? 0,
  1,
  'faceProfile appears exactly once in the serialized request',
);

const forbiddenRequestKeys = [
  'rawLandmarks',
  'landmarks',
  'depthMap',
  'nativeDepthToken',
  'nativeMatteToken',
  'calibrationData',
  'semanticMatte',
  'sourceUri',
  'roiPixels',
  'rawMatte',
  'matte',
  'rawDepthMap',
  'calibrationMatrix',
  'roiPolygon',
  'rawSensorBlob',
] as const;
for (const forbiddenKey of forbiddenRequestKeys) {
  expectEqual(
    new RegExp(`"${forbiddenKey}"\\s*:`, 'i').test(serializedAnalysisRequest),
    false,
    `serialized request omits ${forbiddenKey}`,
  );
  expectThrows(
    () =>
      buildFaceAnalysisRequestPayload({
        ...validReadyProfile,
        [forbiddenKey]: 'must-not-leave-device',
      } as unknown as FaceProfileResult),
    `runtime privacy guard rejects ${forbiddenKey}`,
  );
}

for (const unsafeVerticalThirds of [
  {...faceVerticalThirds, rawMatte: 'raw'},
  {...faceVerticalThirds, calibrationMatrix: [1, 0, 0, 1]},
  {...faceVerticalThirds, roiPolygon: [[0, 0], [1, 1]]},
  {...faceVerticalThirds, rawSensorBlob: 'raw'},
  {...faceVerticalThirds, modelTrainingConsent: true},
]) {
  expectThrows(
    () => buildFaceAnalysisRequestPayload(validReadyProfile, unsafeVerticalThirds),
    'runtime privacy guard rejects unsafe vertical-thirds fields before fetch',
  );
}

const fullAnalysisRequestBody = buildFaceAnalysisRequestBody({
  faceProfile: validReadyProfile,
  faceVerticalThirds,
  photoCaptureId: validReadyProfile.captureId,
  previewMediaId: '11111111-1111-4111-8111-111111111111',
  sourceMediaId: '11111111-1111-4111-8111-111111111111',
});
expectEqual(
  JSON.stringify(Object.keys(fullAnalysisRequestBody).sort()),
  JSON.stringify([
    'faceProfile',
    'photoCaptureId',
    'previewMediaId',
    'requestPayload',
    'runImmediately',
    'sourceMediaId',
  ]),
  'public analysis body uses the exact top-level allowlist',
);
expectEqual(
  JSON.stringify(fullAnalysisRequestBody).match(/"faceProfile"\s*:/g)?.length ?? 0,
  1,
  'full public analysis body serializes faceProfile exactly once',
);
expectThrows(
  () =>
    buildFaceAnalysisRequestBody({
      faceProfile: validReadyProfile,
      photoCaptureId: '22222222-2222-4222-8222-222222222222',
      previewMediaId: '11111111-1111-4111-8111-111111111111',
      sourceMediaId: '11111111-1111-4111-8111-111111111111',
    }),
  'request body rejects a profile from a different photo capture',
);
expectThrows(
  () =>
    assertFaceAnalysisRequestBodyPrivacy({
      requestPayload: {faceProfile: validReadyProfile},
    }),
  'privacy assertion rejects a nested-only faceProfile',
);
expectThrows(
  () =>
    buildFaceAnalysisRequestPayload(validReadyProfile, {
      toJSON() {
        return {
          faceProfile: validReadyProfile,
          sourceUri: 'file:///must-not-leave-device.jpg',
        };
      },
    }),
  'privacy assertion checks the serialized toJSON result',
);

const requestWithoutVerticalThirds = buildFaceAnalysisRequestPayload(
  validReadyProfile,
);
expectEqual(
  JSON.stringify(requestWithoutVerticalThirds.requestPayload),
  JSON.stringify({task: 'face_makeup_recommendation_report_v1'}),
  'vertical-thirds summary is optional without adding legacy location fields',
);

expectThrows(
  () =>
    buildFaceAnalysisRequestPayload({
      ...validReadyProfile,
      schemaVersion: 'future-face-profile-v2',
    } as unknown as FaceProfileResult),
  'unknown profile version is rejected before request serialization',
);

const faceAnalysisDevicePayload = buildFaceCaptureDevicePayload({
  captureType: 'face_analysis',
  contentType: 'image/jpeg',
  height: 1600,
  nativeDepthToken: 'must-not-leave-device',
  nativeMatteToken: 'must-not-leave-device',
  originalFilename: 'sanitized.jpg',
  source: 'camera',
  sourceUri: 'file:///sanitized.jpg',
  width: 1200,
});
expectEqual(
  JSON.stringify(faceAnalysisDevicePayload),
  JSON.stringify({
    contentType: 'image/jpeg',
    height: 1600,
    rawSensorArtifactsStored: false,
    width: 1200,
  }),
  'face analysis device payload uses the privacy allowlist',
);
