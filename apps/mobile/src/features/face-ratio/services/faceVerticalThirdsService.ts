import type {
  FaceVerticalThirdsInput,
  FaceVerticalThirdsQuality,
  FaceVerticalThirdsResult,
  NativeFaceRatioAnalyzeResult,
  NativeFaceRatioKeypointKey,
  NativeFaceRatioPoint,
  VerticalThirdsKeypoint,
  VerticalThirdsKeypointMap,
  VerticalThirdsRatio,
} from '../types';
import {analyzeFacePhoto} from './faceRatioAnalyzerNative';
import {
  getFaceVerticalThirdsResultJsonUri,
  saveOverlayImage,
  saveSourceImage,
  writeResultJson,
} from './faceVerticalThirdsArtifacts';
import {
  buildInterpretation,
  calculateVerticalThirdsRatio,
  getAbnormalDisplayRatioWarnings,
} from './faceVerticalThirdsMath';
import {createFaceRatioLogger, type FaceRatioLogger} from './faceVerticalThirdsLogger';
import {evaluateFaceVerticalThirdsQuality} from './faceVerticalThirdsQualityGate';

const EMPTY_KEYPOINTS: VerticalThirdsKeypointMap = {
  G: null,
  H: null,
  Me: null,
  Sn: null,
};

const DEFAULT_FAILED_QUALITY: FaceVerticalThirdsQuality = {
  usable: false,
  warnings: [],
};

type KeypointConfig = {
  confidence: number;
  key: keyof VerticalThirdsKeypointMap;
  method: string;
  provider: VerticalThirdsKeypoint['provider'];
};

const KEYPOINT_CONFIG: Record<NativeFaceRatioKeypointKey, KeypointConfig> = {
  glabella: {
    confidence: 0.82,
    key: 'G',
    method: 'mediapipe_median_glabella_brow_group',
    provider: 'mediapipe',
  },
  hApprox: {
    confidence: 0.4,
    key: 'H',
    method: 'mediapipe_landmark_10_forehead_approx',
    provider: 'mediapipe_forehead_approx',
  },
  menton: {
    confidence: 0.88,
    key: 'Me',
    method: 'mediapipe_landmark_152',
    provider: 'mediapipe',
  },
  subnasale: {
    confidence: 0.82,
    key: 'Sn',
    method: 'mediapipe_median_subnasale_group',
    provider: 'mediapipe',
  },
};

async function logEvent(
  logger: FaceRatioLogger,
  event: string,
  payload?: Record<string, unknown>,
) {
  await logger.log(event, payload);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toPixelKeypoint(
  point: NativeFaceRatioPoint | undefined,
  config: KeypointConfig,
  imageWidth: number,
  imageHeight: number,
): VerticalThirdsKeypoint | null {
  if (
    !point ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  return {
    confidence: config.confidence,
    method: config.method,
    provider: config.provider,
    x: Number((point.x * imageWidth).toFixed(2)),
    y: Number((point.y * imageHeight).toFixed(2)),
  };
}

function mapNativeKeypoints(
  nativeResult: NativeFaceRatioAnalyzeResult,
  imageWidth: number,
  imageHeight: number,
): VerticalThirdsKeypointMap {
  const keypoints: VerticalThirdsKeypointMap = {...EMPTY_KEYPOINTS};

  (Object.keys(KEYPOINT_CONFIG) as NativeFaceRatioKeypointKey[]).forEach(nativeKey => {
    const config = KEYPOINT_CONFIG[nativeKey];
    keypoints[config.key] = toPixelKeypoint(
      nativeResult.keypoints?.[nativeKey],
      config,
      imageWidth,
      imageHeight,
    );
  });

  return keypoints;
}

function createResult({
  artifacts,
  input,
  keypoints,
  quality,
  ratio,
  sourceImage,
  status,
  statusReason,
}: {
  artifacts: FaceVerticalThirdsResult['artifacts'];
  input: FaceVerticalThirdsInput;
  keypoints: VerticalThirdsKeypointMap;
  quality: FaceVerticalThirdsQuality;
  ratio?: VerticalThirdsRatio;
  sourceImage: FaceVerticalThirdsResult['sourceImage'];
  status: FaceVerticalThirdsResult['status'];
  statusReason?: string;
}): FaceVerticalThirdsResult {
  return {
    artifacts,
    captureId: input.captureId,
    createdAt: input.createdAt,
    interpretation: buildInterpretation(status, ratio),
    keypoints,
    quality,
    schemaVersion: 'aura-face-vertical-thirds-v1',
    sessionId: input.sessionId,
    sourceImage,
    status,
    statusReason,
    verticalThirds: ratio,
  };
}

async function writeResultWithPlannedUri(result: FaceVerticalThirdsResult) {
  const plannedResultJsonUri = getFaceVerticalThirdsResultJsonUri(result.sessionId);
  const resultWithUri: FaceVerticalThirdsResult = {
    ...result,
    artifacts: {
      ...result.artifacts,
      resultJsonUri: plannedResultJsonUri ?? undefined,
    },
  };

  await writeResultJson(resultWithUri);

  return resultWithUri;
}

async function persistTerminalResult(
  result: FaceVerticalThirdsResult,
): Promise<FaceVerticalThirdsResult> {
  try {
    return await writeResultWithPlannedUri(result);
  } catch {
    return result;
  }
}

async function createFailedResult({
  input,
  logger,
  message,
  reason,
  sourceImage,
}: {
  input: FaceVerticalThirdsInput;
  logger: FaceRatioLogger;
  message?: string;
  reason: string;
  sourceImage?: FaceVerticalThirdsResult['sourceImage'];
}) {
  const result = createResult({
    artifacts: {
      logJsonlUri: logger.logFileUri ?? undefined,
    },
    input,
    keypoints: EMPTY_KEYPOINTS,
    quality: {
      ...DEFAULT_FAILED_QUALITY,
      warnings: [reason],
    },
    sourceImage: sourceImage ?? {
      height: 0,
      uri: input.imageUri,
      width: 0,
    },
    status: 'failed',
    statusReason: reason,
  });

  await logEvent(logger, 'analysis:failed', {
    message,
    reason,
  });

  return persistTerminalResult(result);
}

export async function analyzeFaceVerticalThirds(
  input: FaceVerticalThirdsInput,
): Promise<FaceVerticalThirdsResult> {
  const logger = createFaceRatioLogger(input.sessionId);

  await logEvent(logger, 'capture:ready', {
    captureId: input.captureId,
    imageUri: input.imageUri,
  });

  let nativeResult: NativeFaceRatioAnalyzeResult;

  try {
    nativeResult = await analyzeFacePhoto(input.imageUri);
  } catch (error) {
    return createFailedResult({
      input,
      logger,
      message: getErrorMessage(error),
      reason: 'native_analyzer_failed',
    });
  }

  const imageWidth = nativeResult.imageWidth ?? 0;
  const imageHeight = nativeResult.imageHeight ?? 0;
  const sourceImage = {
    height: imageHeight,
    uri: input.imageUri,
    width: imageWidth,
  };

  await logEvent(logger, 'landmark:ready', {
    faceCount: nativeResult.faceCount,
    imageHeight,
    imageWidth,
    landmarkCount: nativeResult.landmarkCount,
    nativeStatus: nativeResult.status,
  });

  if (nativeResult.status === 'unsupported') {
    return createFailedResult({
      input,
      logger,
      message: nativeResult.error,
      reason: 'native_module_unsupported',
      sourceImage,
    });
  }

  const mappedKeypoints = mapNativeKeypoints(nativeResult, imageWidth, imageHeight);
  const qualityGate = evaluateFaceVerticalThirdsQuality(nativeResult, mappedKeypoints);

  await logEvent(logger, 'quality:gate', {
    reason: qualityGate.statusReason,
    usable: qualityGate.quality.usable,
    warnings: qualityGate.quality.warnings,
    yaw: qualityGate.quality.yaw,
    pitch: qualityGate.quality.pitch,
    roll: qualityGate.quality.roll,
  });

  if (!qualityGate.quality.usable) {
    const result = createResult({
      artifacts: {
        logJsonlUri: logger.logFileUri ?? undefined,
      },
      input,
      keypoints: qualityGate.keypoints,
      quality: qualityGate.quality,
      sourceImage,
      status: 'blocked',
      statusReason: qualityGate.statusReason,
    });

    await logEvent(logger, 'analysis:blocked', {
      reason: qualityGate.statusReason,
      warnings: qualityGate.quality.warnings,
    });

    return persistTerminalResult(result);
  }

  if (qualityGate.keypoints.H) {
    await logEvent(logger, 'hairline:ready', {
      confidence: qualityGate.keypoints.H.confidence,
      method: qualityGate.keypoints.H.method,
      provider: qualityGate.keypoints.H.provider,
    });
  }

  const ratio = calculateVerticalThirdsRatio(qualityGate.keypoints);
  const abnormalWarnings = getAbnormalDisplayRatioWarnings(ratio);

  await logEvent(logger, 'ratio:computed', {
    displayRatio: ratio.displayRatio,
    lowerPx: ratio.lowerPx,
    middlePx: ratio.middlePx,
    upperPx: ratio.upperPx,
    warnings: [...ratio.warnings, ...abnormalWarnings],
  });

  try {
    const ratioWithWarnings = {
      ...ratio,
      warnings: [...ratio.warnings, ...abnormalWarnings],
    };
    const qualityWithWarnings = {
      ...qualityGate.quality,
      warnings: [...qualityGate.quality.warnings, ...abnormalWarnings],
    };
    const sourceImageUri = await saveSourceImage(input.sessionId, input.imageUri);
    const result = createResult({
      artifacts: {
        logJsonlUri: logger.logFileUri ?? undefined,
        sourceImageUri,
      },
      input,
      keypoints: qualityGate.keypoints,
      quality: qualityWithWarnings,
      ratio: ratioWithWarnings,
      sourceImage: {
        ...sourceImage,
        uri: sourceImageUri,
      },
      status: 'partial_success',
    });
    const persistedResult = await writeResultWithPlannedUri(result);

    await logEvent(logger, 'analysis:partial', {
      artifacts: persistedResult.artifacts,
      status: persistedResult.status,
      warnings: persistedResult.quality.warnings,
    });

    return persistedResult;
  } catch (error) {
    return createFailedResult({
      input,
      logger,
      message: getErrorMessage(error),
      reason: 'artifact_write_failed',
      sourceImage,
    });
  }
}

export async function finalizeOverlayArtifact(
  result: FaceVerticalThirdsResult,
  tmpUri: string,
): Promise<FaceVerticalThirdsResult> {
  const logger = createFaceRatioLogger(result.sessionId);

  try {
    const overlayImageUri = await saveOverlayImage(result.sessionId, tmpUri);
    const resultWithOverlay: FaceVerticalThirdsResult = {
      ...result,
      artifacts: {
        ...result.artifacts,
        overlayImageUri,
      },
    };

    const persistedResult = await writeResultWithPlannedUri(resultWithOverlay);

    await logEvent(logger, 'overlay:saved', {
      overlayImageUri,
      resultJsonUri: persistedResult.artifacts.resultJsonUri,
    });

    return persistedResult;
  } catch (error) {
    await logEvent(logger, 'overlay:failed', {
      message: getErrorMessage(error),
    });

    return result;
  }
}
