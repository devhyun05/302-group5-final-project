import {NativeModules} from 'react-native';

export type FaceAnalysisSanitizedMedia = {
  uri: string;
};

type NativeFaceAnalysisMediaSanitizer = {
  sanitize?: (imageUri: string) => Promise<unknown>;
};

function getNativeSanitizer(): NativeFaceAnalysisMediaSanitizer | undefined {
  return NativeModules.AURAFaceAnalysisMediaSanitizer as
    | NativeFaceAnalysisMediaSanitizer
    | undefined;
}

export function isFaceAnalysisMediaSanitizerAvailable(): boolean {
  return typeof getNativeSanitizer()?.sanitize === 'function';
}

export async function sanitizeFaceAnalysisMedia(
  imageUri: string,
): Promise<FaceAnalysisSanitizedMedia> {
  const sanitizer = getNativeSanitizer();
  if (typeof sanitizer?.sanitize !== 'function') {
    throw new Error('Face analysis media sanitizer is unavailable.');
  }

  const result = await sanitizer.sanitize(imageUri);
  if (
    typeof result !== 'object' ||
    result === null ||
    !('uri' in result) ||
    typeof result.uri !== 'string' ||
    result.uri.length === 0
  ) {
    throw new Error('Face analysis media sanitizer returned an invalid result.');
  }
  return {uri: result.uri};
}
