import type {
  FaceCaptureLocalPreviewOwner,
  FaceCaptureLocalPreviewOwnership,
} from './faceCaptureLocalPreviewOwnership';

export type FaceCapturePreviewLifecycleValue = {
  imageUri?: string;
  localPreviewOwnership?: Pick<
    FaceCaptureLocalPreviewOwnership,
    'getPreviewUri' | 'release'
  >;
  localPreviewUri?: string;
};

export function getOwnedFaceCapturePreviewUri(
  capture: FaceCapturePreviewLifecycleValue | null,
): string | undefined {
  if (!capture) {
    return undefined;
  }
  if (capture.localPreviewOwnership) {
    return capture.localPreviewOwnership.getPreviewUri() ?? undefined;
  }
  return capture.localPreviewUri ?? capture.imageUri;
}

export async function releaseOwnedFaceCapturePreview(
  capture: FaceCapturePreviewLifecycleValue | null,
  owner: FaceCaptureLocalPreviewOwner,
): Promise<void> {
  try {
    await capture?.localPreviewOwnership?.release(owner);
  } catch {
    // Local file cleanup is best effort and must not replace navigation intent.
  }
}
