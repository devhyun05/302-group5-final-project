import {NativeModules} from 'react-native';

import {
  resolveNativeDepthSummary,
  type FaceProfileDepthResolution,
} from './faceProfileDepthResult';

export type FaceProfileDepthLandmarkInput = {
  points: {i: number; x: number; y: number; z?: number}[];
  imageWidth: number;
  imageHeight: number;
};

export type FaceProfileDepthAnalyzeOptions = {
  deadlineMs?: number;
  landmarks?: FaceProfileDepthLandmarkInput;
};

type NativeFaceProfileDepthAnalyzer = {
  analyze?: (
    token: string,
    options: FaceProfileDepthAnalyzeOptions,
  ) => Promise<unknown>;
  discard?: (token: string) => void | Promise<void>;
};

const DEFAULT_DEADLINE_MS = 1500;

function getNativeAnalyzer(): NativeFaceProfileDepthAnalyzer | undefined {
  return NativeModules.AURAFaceProfileDepthAnalyzer as
    | NativeFaceProfileDepthAnalyzer
    | undefined;
}

function clampDeadline(milliseconds: number | undefined): number {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) {
    return DEFAULT_DEADLINE_MS;
  }
  return Math.min(DEFAULT_DEADLINE_MS, Math.max(1, Math.round(milliseconds)));
}

async function discardWith(
  analyzer: NativeFaceProfileDepthAnalyzer | undefined,
  token: string,
): Promise<void> {
  try {
    await analyzer?.discard?.(token);
  } catch {
    // Discard is best-effort and intentionally carries no sensitive details.
  }
}

export function isFaceProfileDepthAnalyzerAvailable(): boolean {
  const analyzer = getNativeAnalyzer();
  return (
    typeof analyzer?.analyze === 'function' &&
    typeof analyzer.discard === 'function'
  );
}

export async function discardFaceProfileDepthToken(token: string): Promise<void> {
  await discardWith(getNativeAnalyzer(), token);
}

export async function analyzeFaceProfileDepth(
  token: string,
  options: FaceProfileDepthAnalyzeOptions = {},
  signal?: AbortSignal,
): Promise<FaceProfileDepthResolution> {
  const analyzer = getNativeAnalyzer();
  if (typeof analyzer?.analyze !== 'function') {
    return resolveNativeDepthSummary({consumed: false, status: 'unsupported'});
  }
  if (signal?.aborted) {
    await discardWith(analyzer, token);
    return resolveNativeDepthSummary({consumed: false, status: 'not_found'});
  }

  const deadlineMs = clampDeadline(options.deadlineMs);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  let discardPromise: Promise<void> | undefined;
  const discardOnce = () => {
    discardPromise ??= discardWith(analyzer, token);
    return discardPromise;
  };

  const cancellation = new Promise<unknown>(resolve => {
    const cancel = () => {
      void discardOnce();
      resolve({consumed: true, status: 'error'});
    };
    timeout = setTimeout(cancel, deadlineMs);
    abortHandler = cancel;
    if (signal?.aborted) {
      cancel();
    } else {
      signal?.addEventListener('abort', cancel, {once: true});
    }
  });

  try {
    const raw = await Promise.race([
      analyzer.analyze(token, {...options, deadlineMs}),
      cancellation,
    ]);
    return resolveNativeDepthSummary(raw);
  } catch {
    return resolveNativeDepthSummary({consumed: true, status: 'error'});
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    if (abortHandler) {
      signal?.removeEventListener('abort', abortHandler);
    }
    await discardOnce();
  }
}
