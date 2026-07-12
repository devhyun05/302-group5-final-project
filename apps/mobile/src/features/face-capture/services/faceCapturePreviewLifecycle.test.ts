import {
  getOwnedFaceCapturePreviewUri,
  releaseOwnedFaceCapturePreview,
} from './faceCapturePreviewLifecycle';

async function run() {
  let releaseCalls = 0;
  const releasedCapture = {
    imageUri: 'file:///deleted-image.jpg',
    localPreviewOwnership: {
      getPreviewUri: () => null,
      release: async (owner: string) => {
        if (owner === 'loading') {
          releaseCalls += 1;
        }
      },
    },
    localPreviewUri: 'file:///deleted-preview.jpg',
  };
  if (getOwnedFaceCapturePreviewUri(releasedCapture) !== undefined) {
    throw new Error('released ownership must not fall back to a deleted file URI');
  }

  await releaseOwnedFaceCapturePreview(releasedCapture, 'loading');
  if (releaseCalls !== 1) {
    throw new Error('loading back/cancel must release ownership explicitly once');
  }

  const legacy = {
    imageUri: 'file:///legacy-image.jpg',
    localPreviewUri: 'file:///legacy-preview.jpg',
  };
  if (getOwnedFaceCapturePreviewUri(legacy) !== 'file:///legacy-preview.jpg') {
    throw new Error('legacy capture without ownership keeps preview fallback behavior');
  }

  console.log('faceCapturePreviewLifecycle tests passed');
}

void run();
