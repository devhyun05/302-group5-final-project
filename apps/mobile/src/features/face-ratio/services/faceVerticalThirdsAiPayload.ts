import type {FaceVerticalThirdsResult} from '../types';
import {buildInterpretation, deriveDominantPart} from './faceVerticalThirdsMath';

type CameraSnapshotScreenPoint = {
  left?: number;
  top?: number;
  x?: number;
  y?: number;
};

type CameraSnapshotForVerticalThirds = {
  measurementMode?: string;
  mediaPipe?: {
    screenLandmarks?: Partial<
      Record<'chin' | 'forehead' | 'noseBridge' | 'noseTip', CameraSnapshotScreenPoint>
    >;
    status?: string;
  };
  precision?: {
    enabled?: boolean;
    requestedSemanticMatte?: boolean;
    sourceHint?: string;
  };
  source?: string;
};

// 보고서 작성 AI(requestPayload.faceVerticalThirds)로 보내는 압축 요약.
// raw keypoint는 보내지 않고 해석에 필요한 값만 담는다.
export type FaceVerticalThirdsAnalysisPayload = {
  confidence: number | null;
  displayRatio: {
    lower: number;
    middle: number;
    upper: number | null;
  };
  dominantPart: string | null;
  hairline: {
    confidence: number | null;
    provider: string | null;
  };
  measurement: {
    mode: string;
    semanticMatteAvailable: boolean;
    semanticMatteRequested: boolean;
    source: string;
    trueDepthCorrectionApplied: boolean;
    warnings: string[];
  };
  status: string;
  summary: string;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundRatio(value: number) {
  return Number(value.toFixed(4));
}

function getScreenTop(
  snapshot: CameraSnapshotForVerticalThirds | null | undefined,
  key: 'chin' | 'forehead' | 'noseBridge' | 'noseTip',
): number | null {
  const point = snapshot?.mediaPipe?.screenLandmarks?.[key];
  const top = finiteNumber(point?.top) ?? finiteNumber(point?.y);

  return top;
}

export function buildFaceVerticalThirdsAnalysisPayloadFromCameraSnapshot(
  snapshot?: CameraSnapshotForVerticalThirds | null,
): FaceVerticalThirdsAnalysisPayload | undefined {
  if (snapshot?.mediaPipe?.status !== 'ok') {
    return undefined;
  }

  const foreheadY = getScreenTop(snapshot, 'forehead');
  const glabellaY = getScreenTop(snapshot, 'noseBridge');
  const subnasaleY = getScreenTop(snapshot, 'noseTip');
  const chinY = getScreenTop(snapshot, 'chin');

  if (
    foreheadY === null ||
    glabellaY === null ||
    subnasaleY === null ||
    chinY === null
  ) {
    return undefined;
  }

  const upperPx = glabellaY - foreheadY;
  const middlePx = subnasaleY - glabellaY;
  const lowerPx = chinY - subnasaleY;

  if (upperPx <= 0 || middlePx <= 0 || lowerPx <= 0) {
    return undefined;
  }

  const ratio = {
    confidence: 0.58,
    displayRatio: {
      lower: roundRatio(lowerPx / middlePx),
      middle: 1.0 as const,
      upper: roundRatio(upperPx / middlePx),
    },
    lowerNormalized: roundRatio(lowerPx / (upperPx + middlePx + lowerPx)),
    lowerPx: roundRatio(lowerPx),
    middleNormalized: roundRatio(middlePx / (upperPx + middlePx + lowerPx)),
    middlePx: roundRatio(middlePx),
    totalPx: roundRatio(upperPx + middlePx + lowerPx),
    upperNormalized: roundRatio(upperPx / (upperPx + middlePx + lowerPx)),
    upperPx: roundRatio(upperPx),
    warnings: ['realtime_vision_approximation'],
  };
  const interpretation = buildInterpretation('partial_success', ratio);
  const measurementMode =
    snapshot.measurementMode ??
    (snapshot.precision?.enabled ? 'precision' : 'standard');

  return {
    confidence: ratio.confidence,
    displayRatio: ratio.displayRatio,
    dominantPart: deriveDominantPart(ratio),
    hairline: {
      confidence: 0.45,
      provider: snapshot.source ?? 'realtime_native_vision',
    },
    measurement: {
      mode: measurementMode,
      semanticMatteAvailable: false,
      semanticMatteRequested: Boolean(snapshot.precision?.requestedSemanticMatte),
      source: snapshot.source ?? 'realtime_native_vision',
      trueDepthCorrectionApplied: false,
      warnings:
        measurementMode === 'precision'
          ? ['realtime_vision_approximation', 'precision_result_timeout_fallback']
          : ['realtime_vision_approximation'],
    },
    status: 'partial_success',
    summary: interpretation.summary,
  };
}

export function buildFaceVerticalThirdsAnalysisPayload(
  result: FaceVerticalThirdsResult | null,
): FaceVerticalThirdsAnalysisPayload | undefined {
  if (
    !result ||
    (result.status !== 'full_success' && result.status !== 'partial_success') ||
    !result.verticalThirds
  ) {
    return undefined;
  }

  return {
    confidence: result.verticalThirds.confidence ?? null,
    displayRatio: {
      lower: result.verticalThirds.displayRatio.lower,
      middle: result.verticalThirds.displayRatio.middle,
      upper: result.verticalThirds.displayRatio.upper,
    },
    dominantPart: result.interpretation.dominantPart ?? null,
    hairline: {
      confidence: result.keypoints.H?.confidence ?? null,
      provider: result.keypoints.H?.provider ?? null,
    },
    measurement: {
      mode: result.measurement.mode,
      semanticMatteAvailable: result.measurement.semanticMatteAvailable,
      semanticMatteRequested: result.measurement.semanticMatteRequested,
      source: result.measurement.source,
      trueDepthCorrectionApplied: result.measurement.trueDepthCorrectionApplied,
      warnings: result.measurement.warnings,
    },
    status: result.status,
    summary: result.interpretation.summary,
  };
}
