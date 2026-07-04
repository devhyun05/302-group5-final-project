import {NativeModules} from 'react-native';

import type {NativeFaceRatioAnalyzeResult} from '../types';

type NativeFaceRatioAnalyzer = {
  analyze?: (
    imageUri: string,
    options?: Record<string, never>,
  ) => Promise<NativeFaceRatioAnalyzeResult>;
};

function getNativeFaceRatioAnalyzer(): NativeFaceRatioAnalyzer | undefined {
  return NativeModules.AURAFaceRatioAnalyzer as NativeFaceRatioAnalyzer | undefined;
}

export function isFaceRatioAnalyzerAvailable(): boolean {
  return typeof getNativeFaceRatioAnalyzer()?.analyze === 'function';
}

export async function analyzeFacePhoto(
  imageUri: string,
): Promise<NativeFaceRatioAnalyzeResult> {
  const analyzer = getNativeFaceRatioAnalyzer();

  if (typeof analyzer?.analyze !== 'function') {
    return {
      error: 'AURAFaceRatioAnalyzer native module is not available. Rebuild the iOS app.',
      faceCount: 0,
      status: 'unsupported',
    };
  }

  return analyzer.analyze(imageUri, {});
}
