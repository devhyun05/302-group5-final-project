import {createFaceCaptureLocalPreviewOwnership} from '../../face-capture/services/faceCaptureLocalPreviewOwnership';
import {
  runFaceAnalysisOnDevicePipeline,
  type FaceAnalysisOnDevicePipelineDependencies,
} from './faceAnalysisOnDevicePipeline';
import {buildFaceProfileGeometryFixture} from '../../face-profile/services/faceProfileGeometry.testFixtures';
import {buildFaceProfile} from '../../face-profile/services/faceProfileBuilder';
import {analyzePersonalColor} from '../../personal-color/services/personalColorCore/engine';
import {requireFixture} from '../../personal-color/services/personalColorCore/fixtureInventory';

const CREATED_AT = '2026-07-12T12:00:00.000Z';
const CAPTURE_ID = '33333333-3333-4333-8333-333333333333';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, reject, resolve};
}

function fullProfile() {
  const geometry = buildFaceProfileGeometryFixture('oval');
  const native = requireFixture('light_cool_summer_pixel_quality').native;
  return buildFaceProfile({
    captureId: '00000000-0000-4000-8000-000000000000',
    captureQualitySnapshot: {
      cameraStability: 0.96,
      capturedAt: CREATED_AT,
      centerOffsetX: 0.01,
      centerOffsetY: 0.01,
      centeredScore: 0.95,
      faceCount: 1,
      framingScore: 0.93,
      nativeCameraMetadata: {
        isStable: true,
        status: 'ok',
        whiteBalanceGains: {blue: 1.1, green: 1, red: 1.08},
      },
      pitchDeg: 0,
      rollDeg: 0,
      screenCoverageRatio: 0.46,
      source: 'camera',
      yawDeg: 0,
    },
    createdAt: CREATED_AT,
    depth: {consumed: false, status: 'unsupported'},
    faceCount: 1,
    imageHeight: geometry.imageHeight,
    imageWidth: geometry.imageWidth,
    landmarks: geometry.landmarks,
    mirrored: false,
    nativePersonalColor: native,
    personalColor: analyzePersonalColor(native, {
      calibrationApplied: true,
      frameCount: 3,
    }),
    pose: geometry.pose,
    verticalThirds: geometry.hairline ?? null,
  });
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function run() {
  const events: string[] = [];
  const sanitizer = deferred<{uri: string}>();
  const upload = deferred<{
    bucket: string;
    contentType: string;
    imageUri: string;
    mediaId: string;
    objectKey: string;
    photoCaptureId: string;
    source: 'camera';
  }>();
  const preparation = deferred<{profile: ReturnType<typeof fullProfile>}>();
  const deleted: string[] = [];
  const ownership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      deleted.push(uri);
    },
    source: 'camera',
    sourceUri: 'file:///camera-original.jpg',
  });

  const dependencies: FaceAnalysisOnDevicePipelineDependencies = {
    discardTransientCapture: async () => {
      events.push('discard-transient');
    },
    prepare: async input => {
      events.push(`prepare:${input.uri}`);
      expect(
        input.mirrored === false,
        'upright sanitized front-camera pixels are not mirrored a second time',
      );
      expect(input.nativeDepthToken === 'depth-token', 'local preparation owns depth token');
      expect(input.nativeMatteToken === 'matte-token', 'local preparation owns matte token');
      return preparation.promise;
    },
    sanitize: async uri => {
      events.push(`sanitize:${uri}`);
      return sanitizer.promise;
    },
    upload: async input => {
      events.push(`upload:${input.uri}`);
      expect(input.uri === 'file:///sanitized.jpg', 'upload uses sanitized URI');
      expect(input.contentType === 'image/jpeg', 'sanitized upload is JPEG');
      expect(!('nativeDepthToken' in input), 'upload input strips depth token');
      expect(!('nativeMatteToken' in input), 'upload input strips matte token');
      return upload.promise;
    },
  };

  let settled = false;
  const pipeline = runFaceAnalysisOnDevicePipeline(
    {
      captureQualitySnapshot: null,
      image: {
        captureType: 'face_analysis',
        contentType: 'image/heic',
        height: 1600,
        mirrored: true,
        nativeDepthToken: 'depth-token',
        nativeMatteToken: 'matte-token',
        source: 'camera',
        uri: 'file:///camera-original.jpg',
        width: 1200,
      },
      ownership,
    },
    dependencies,
  ).then(result => {
    settled = true;
    return result;
  });

  await flush();
  expect(events.length === 1 && events[0].startsWith('sanitize:'), 'sanitizer starts first');
  expect(!settled, 'pipeline waits for sanitizer');

  sanitizer.resolve({uri: 'file:///sanitized.jpg'});
  await flush();
  expect(
    events.includes('upload:file:///sanitized.jpg') &&
      events.includes('prepare:file:///sanitized.jpg'),
    'upload and local preparation both start after sanitization',
  );
  expect(!settled, 'independent work may settle separately');

  upload.resolve({
    bucket: 'media',
    contentType: 'image/jpeg',
    imageUri: 'file:///sanitized.jpg',
    mediaId: 'media-id',
    objectKey: 'capture/sanitized.jpg',
    photoCaptureId: CAPTURE_ID,
    source: 'camera',
  });
  await flush();
  expect(!settled, 'upload completion does not cancel local preparation');

  preparation.resolve({profile: fullProfile()});
  const result = await pipeline;
  expect(result.derivedFaceProfile?.captureId === CAPTURE_ID, 'profile is finalized with upload id');
  expect(result.localPreviewUri === 'file:///sanitized.jpg', 'confirmation receives local preview');
  expect(result.localPreviewOwnership === ownership, 'ownership handle is carried locally');
  expect(ownership.getOwner() === 'confirmation', 'preview transfers to confirmation');
  expect(
    JSON.stringify(result).includes('localPreviewUri') === false &&
      JSON.stringify(result).includes('derivedFaceProfile') === false,
    'local-only fields are non-enumerable and non-serialized',
  );
  expect(
    deleted.filter(uri => uri === 'file:///camera-original.jpg').length === 1,
    'camera original is released once after sanitizer succeeds',
  );

  const failedDeleted: string[] = [];
  let failedTransientDiscard = 0;
  const failedOwnership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      failedDeleted.push(uri);
    },
    source: 'camera',
    sourceUri: 'file:///failed-camera.jpg',
  });
  let failed = false;
  try {
    await runFaceAnalysisOnDevicePipeline(
      {
        captureQualitySnapshot: null,
        image: {
          nativeDepthToken: 'failed-depth',
          nativeMatteToken: 'failed-matte',
          source: 'camera',
          uri: 'file:///failed-camera.jpg',
        },
        ownership: failedOwnership,
      },
      {
        ...dependencies,
        discardTransientCapture: async () => {
          failedTransientDiscard += 1;
        },
        sanitize: async () => {
          throw new Error('sanitize_failed');
        },
      },
    );
  } catch {
    failed = true;
  }
  expect(failed, 'sanitizer failure rejects the pipeline');
  expect(failedTransientDiscard === 1, 'sanitizer failure discards native tokens once');
  expect(
    JSON.stringify(failedDeleted) === JSON.stringify(['file:///failed-camera.jpg']),
    'sanitizer failure deletes only the app-owned camera temp',
  );

  for (const synchronousFailure of ['upload', 'prepare'] as const) {
    let discardCalls = 0;
    const syncDeleted: string[] = [];
    const syncOwnership = createFaceCaptureLocalPreviewOwnership({
      deleteOwnedFile: async uri => {
        syncDeleted.push(uri);
      },
      source: 'camera',
      sourceUri: `file:///${synchronousFailure}-sync-camera.jpg`,
    });
    let receivedMessage = '';
    try {
      await runFaceAnalysisOnDevicePipeline(
        {
          captureQualitySnapshot: null,
          image: {
            nativeDepthToken: `${synchronousFailure}-depth`,
            nativeMatteToken: `${synchronousFailure}-matte`,
            source: 'camera',
            uri: `file:///${synchronousFailure}-sync-camera.jpg`,
          },
          ownership: syncOwnership,
        },
        {
          discardTransientCapture: () => {
            discardCalls += 1;
            return Promise.reject(new Error('cleanup_must_not_override'));
          },
          prepare: () => {
            if (synchronousFailure === 'prepare') {
              throw new Error('prepare_sync_failure');
            }
            return Promise.resolve({profile: fullProfile()});
          },
          sanitize: async () => ({uri: `file:///${synchronousFailure}-sanitized.jpg`}),
          upload: () => {
            if (synchronousFailure === 'upload') {
              throw new Error('upload_sync_failure');
            }
            return Promise.resolve({
              bucket: 'media',
              imageUri: `file:///${synchronousFailure}-sanitized.jpg`,
              mediaId: 'media-id',
              objectKey: 'capture/sanitized.jpg',
              photoCaptureId: CAPTURE_ID,
              source: 'camera',
            });
          },
        },
      );
    } catch (error) {
      receivedMessage = error instanceof Error ? error.message : String(error);
    }
    expect(
      receivedMessage === `${synchronousFailure}_sync_failure`,
      `${synchronousFailure} synchronous error remains authoritative`,
    );
    expect(discardCalls === 1, `${synchronousFailure} sync failure discards tokens once`);
    expect(
      syncDeleted.includes(`file:///${synchronousFailure}-sanitized.jpg`),
      `${synchronousFailure} sync failure releases sanitized preview`,
    );
  }

  const abortDeleted: string[] = [];
  const abortOwnership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      abortDeleted.push(uri);
    },
    source: 'camera',
    sourceUri: 'file:///abort-camera.jpg',
  });
  const abortController = new AbortController();
  const abortSanitizer = deferred<{uri: string}>();
  let abortDiscardCalls = 0;
  const abortedPipeline = runFaceAnalysisOnDevicePipeline(
    {
      captureQualitySnapshot: null,
      image: {
        nativeDepthToken: 'abort-depth',
        source: 'camera',
        uri: 'file:///abort-camera.jpg',
      },
      ownership: abortOwnership,
      signal: abortController.signal,
    },
    {
      ...dependencies,
      discardTransientCapture: async () => {
        abortDiscardCalls += 1;
      },
      sanitize: async () => abortSanitizer.promise,
    },
  );
  abortController.abort();
  abortSanitizer.resolve({uri: 'file:///abort-sanitized.jpg'});
  try {
    await abortedPipeline;
  } catch {
    // Expected cancellation.
  }
  expect(abortDiscardCalls === 1, 'abort during sanitizer discards transient tokens once');
  expect(
    JSON.stringify(abortDeleted.sort()) ===
      JSON.stringify(['file:///abort-camera.jpg', 'file:///abort-sanitized.jpg'].sort()),
    'abort after sanitizer resolves deletes both original and newly sanitized temp',
  );

  const earlyReleaseDeleted: string[] = [];
  const earlyReleaseOwnership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      earlyReleaseDeleted.push(uri);
    },
    source: 'camera',
    sourceUri: 'file:///early-release-camera.jpg',
  });
  const lateSanitizer = deferred<{uri: string}>();
  const earlyReleasePipeline = runFaceAnalysisOnDevicePipeline(
    {
      captureQualitySnapshot: null,
      image: {source: 'camera', uri: 'file:///early-release-camera.jpg'},
      ownership: earlyReleaseOwnership,
    },
    {
      ...dependencies,
      discardTransientCapture: async () => undefined,
      sanitize: async () => lateSanitizer.promise,
    },
  );
  await earlyReleaseOwnership.release('capture');
  lateSanitizer.resolve({uri: 'file:///early-release-sanitized.jpg'});
  try {
    await earlyReleasePipeline;
  } catch {
    // Screen exited before sanitizer completed.
  }
  await flush();
  expect(
    JSON.stringify(earlyReleaseDeleted.sort()) ===
      JSON.stringify([
        'file:///early-release-camera.jpg',
        'file:///early-release-sanitized.jpg',
      ].sort()),
    'release while sanitizer is pending still deletes the late sanitized temp',
  );

  console.log('faceAnalysisOnDevicePipeline tests passed');
}

void run();
