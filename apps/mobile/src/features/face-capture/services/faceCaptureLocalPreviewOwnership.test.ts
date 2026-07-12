import {createFaceCaptureLocalPreviewOwnership} from './faceCaptureLocalPreviewOwnership';

function expectEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

async function cameraFixture(
  exit: 'sanitizer_failure' | 'upload_failure' | 'local_analysis_failure' | 'retake' |
    'confirmation_cancel' | 'report_ready' | 'route_exit',
) {
  const deleted: string[] = [];
  const ownership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      deleted.push(uri);
    },
    source: 'camera',
    sourceUri: 'file:///camera-original.jpg',
  });

  if (exit === 'sanitizer_failure') {
    await ownership.release('capture');
    await ownership.release('capture');
    return deleted;
  }

  ownership.registerSanitizedPreview('file:///sanitized-preview.jpg');
  await ownership.releaseOriginalAfterSanitize();
  await ownership.releaseOriginalAfterSanitize();

  if (exit === 'upload_failure' || exit === 'local_analysis_failure') {
    await ownership.release('capture');
    await ownership.release('capture');
    return deleted;
  }

  ownership.transfer('capture', 'confirmation');
  if (exit === 'retake' || exit === 'confirmation_cancel') {
    await ownership.release('confirmation');
    await ownership.release('confirmation');
    return deleted;
  }

  ownership.transfer('confirmation', 'loading');
  if (exit === 'report_ready') {
    await ownership.release('loading');
    await ownership.release('loading');
    return deleted;
  }

  ownership.transfer('loading', 'report');
  await ownership.release('report');
  await ownership.release('report');
  return deleted;
}

async function run() {
  for (const exit of [
    'sanitizer_failure',
    'upload_failure',
    'local_analysis_failure',
    'retake',
    'confirmation_cancel',
    'report_ready',
    'route_exit',
  ] as const) {
    const deleted = await cameraFixture(exit);
    expectEqual(
      deleted,
      exit === 'sanitizer_failure'
        ? ['file:///camera-original.jpg']
        : ['file:///camera-original.jpg', 'file:///sanitized-preview.jpg'],
      `${exit} deletes each app-owned camera temp exactly once`,
    );
  }

  const galleryDeleted: string[] = [];
  const galleryOwnership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      galleryDeleted.push(uri);
    },
    source: 'gallery',
    sourceUri: 'file:///gallery-original.jpg',
  });
  galleryOwnership.registerSanitizedPreview('file:///gallery-sanitized.jpg');
  await galleryOwnership.releaseOriginalAfterSanitize();
  galleryOwnership.transfer('capture', 'confirmation');
  await galleryOwnership.release('confirmation');
  expectEqual(
    galleryDeleted,
    ['file:///gallery-sanitized.jpg'],
    'gallery original is never deleted',
  );

  const sameUriDeleted: string[] = [];
  const sameUriOwnership = createFaceCaptureLocalPreviewOwnership({
    deleteOwnedFile: async uri => {
      sameUriDeleted.push(uri);
    },
    source: 'gallery',
    sourceUri: 'file:///gallery-original.jpg',
  });
  sameUriOwnership.registerSanitizedPreview('file:///gallery-original.jpg');
  await sameUriOwnership.release('capture');
  expectEqual(
    sameUriDeleted,
    [],
    'sanitizer alias can never turn a gallery original into an owned temp',
  );

  console.log('faceCaptureLocalPreviewOwnership tests passed');
}

void run();
