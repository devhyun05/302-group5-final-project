export type FaceCaptureLocalPreviewOwner =
  | 'capture'
  | 'confirmation'
  | 'loading'
  | 'report';

export type FaceCaptureOwnedFileDeleter = (uri: string) => Promise<void>;

export type FaceCaptureLocalPreviewOwnership = {
  getOwner: () => FaceCaptureLocalPreviewOwner | null;
  getPreviewUri: () => string | null;
  registerSanitizedPreview: (uri: string) => void;
  release: (owner: FaceCaptureLocalPreviewOwner) => Promise<void>;
  releaseOriginalAfterSanitize: () => Promise<void>;
  transfer: (
    from: FaceCaptureLocalPreviewOwner,
    to: FaceCaptureLocalPreviewOwner,
  ) => void;
};

export function createFaceCaptureLocalPreviewOwnership({
  deleteOwnedFile,
  source,
  sourceUri,
}: {
  deleteOwnedFile: FaceCaptureOwnedFileDeleter;
  source: 'camera' | 'gallery';
  sourceUri: string;
}): FaceCaptureLocalPreviewOwnership {
  let owner: FaceCaptureLocalPreviewOwner | null = 'capture';
  let previewUri: string | null = null;
  const ownedUris = new Set<string>(source === 'camera' ? [sourceUri] : []);
  const deletionByUri = new Map<string, Promise<void>>();

  const deleteOnce = (uri: string): Promise<void> => {
    const existing = deletionByUri.get(uri);
    if (existing) {
      return existing;
    }

    ownedUris.delete(uri);
    const deletion = Promise.resolve()
      .then(() => deleteOwnedFile(uri))
      .catch(() => undefined);
    deletionByUri.set(uri, deletion);
    return deletion;
  };

  return {
    getOwner: () => owner,
    getPreviewUri: () => previewUri,
    registerSanitizedPreview(uri) {
      if (!uri) {
        throw new Error('face_capture_preview_uri_missing');
      }
      if (owner === null) {
        if (uri !== sourceUri || source === 'camera') {
          ownedUris.add(uri);
          void deleteOnce(uri);
        }
        throw new Error('face_capture_preview_already_released');
      }
      if (previewUri && previewUri !== uri) {
        throw new Error('face_capture_preview_already_registered');
      }

      previewUri = uri;
      if (uri !== sourceUri || source === 'camera') {
        ownedUris.add(uri);
      }
    },
    async release(expectedOwner) {
      if (owner !== expectedOwner) {
        return;
      }

      owner = null;
      await Promise.all([...ownedUris].map(deleteOnce));
      previewUri = null;
    },
    async releaseOriginalAfterSanitize() {
      if (
        source === 'camera' &&
        ownedUris.has(sourceUri) &&
        previewUri !== sourceUri
      ) {
        await deleteOnce(sourceUri);
      }
    },
    transfer(from, to) {
      if (owner !== from) {
        throw new Error('face_capture_preview_owner_mismatch');
      }
      owner = to;
    },
  };
}
