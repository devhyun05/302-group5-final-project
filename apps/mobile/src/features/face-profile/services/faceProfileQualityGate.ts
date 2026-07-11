import {FACE_ANALYSIS_POSE_LIMITS} from '../../../shared/contracts/faceAnalysisQuality';
import type {
  FaceMeasurement,
  FaceMeasurementSource,
  FaceProfileQuality,
} from '../../../shared/types/faceProfile';
import type {FacePose} from './faceProfileGeometry';
import {normalizedAsymmetry, robustMean} from './faceProfileMath';

export type NativeCameraCaptureMetadata = {
  adjustingExposure?: boolean;
  adjustingFocus?: boolean;
  adjustingWhiteBalance?: boolean;
  exposureDurationMs?: number;
  focusSupported?: boolean;
  isStable?: boolean | number;
  iso?: number;
  lensPosition?: number;
  stableDurationMs?: number;
  stableThresholdMs?: number;
  status?: 'ok' | 'camera_unavailable';
  whiteBalanceGains?: {
    blue?: number;
    green?: number;
    red?: number;
  };
  captureLockedAtMs?: number;
  exposureLocked?: boolean;
  focusLocked?: boolean;
  lockError?: string | null;
  whiteBalanceLocked?: boolean;
};

export type NativePixelQuality = {
  blur: {
    laplacianVariance: number;
    score: number;
    confidence: number;
  };
  lighting: {
    globalLuminance: number;
    leftLuminance: number;
    rightLuminance: number;
    uniformityScore: number;
    score: number;
  };
  skinUniformity: {
    cheekDelta: number;
    foreheadDelta: number;
    score: number;
  };
};

export type FaceExpressionSignals = {
  leftEyeAspectRatio: number;
  rightEyeAspectRatio: number;
  mouthOpenRatio: number;
  leftRightContourAsymmetry?: number;
  requiredContourCoverage?: number;
  roiCoverage?: number;
  hairlineWarning?: boolean;
};

export type FaceProfileQualityInput = {
  faceCount: number;
  landmarkCount: number;
  pose: FacePose | null;
  screenCoverageRatio: number | null;
  centeredOffset: number | null;
  cameraMetadata?: NativeCameraCaptureMetadata;
  pixelQuality?: NativePixelQuality;
  expression?: FaceExpressionSignals;
  finiteInFrameRatio?: number;
  requiredLandmarkAvailability?: number;
};

export type FaceProfileQualityDecision = {
  status: 'full_success' | 'partial_success' | 'blocked';
  quality: FaceProfileQuality;
  blockingReasons: string[];
  warnings: string[];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function measurement<T>(
  value: T,
  options: {
    confidence?: number;
    source?: FaceMeasurementSource;
    warnings?: readonly string[];
  } = {},
): FaceMeasurement<T> {
  return {
    confidence: clamp01(options.confidence ?? 0.9),
    source: options.source ?? 'derived',
    value,
    warnings: unique(options.warnings ?? []),
  };
}

function unavailable<T>(
  nullReason: string,
  options: {
    source?: FaceMeasurementSource;
    warnings?: readonly string[];
  } = {},
): FaceMeasurement<T> {
  return {
    confidence: 0,
    nullReason,
    source: options.source ?? 'derived',
    value: null,
    warnings: unique(options.warnings ?? [nullReason]),
  };
}

function isFinitePose(pose: FacePose | null): pose is FacePose {
  return Boolean(
    pose &&
      Number.isFinite(pose.pitchDeg) &&
      Number.isFinite(pose.rollDeg) &&
      Number.isFinite(pose.yawDeg),
  );
}

function normalizeLuminance(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clamp01(value > 1 ? value / 255 : value);
}

function cameraStabilityScore(
  metadata: NativeCameraCaptureMetadata | undefined,
): number | null {
  if (!metadata || metadata.status === 'camera_unavailable') {
    return null;
  }
  if (typeof metadata.isStable === 'number' && Number.isFinite(metadata.isStable)) {
    return clamp01(metadata.isStable);
  }
  if (typeof metadata.isStable === 'boolean') {
    return metadata.isStable ? 1 : 0;
  }
  const adjustments = [
    metadata.adjustingExposure,
    metadata.adjustingFocus,
    metadata.adjustingWhiteBalance,
  ].filter(value => typeof value === 'boolean');
  if (adjustments.length === 0) {
    return null;
  }
  return adjustments.some(Boolean) ? 0 : 1;
}

function expressionMeasurements(
  expression: FaceExpressionSignals | undefined,
): Pick<
  FaceProfileQuality,
  'neutralExpressionScore' | 'eyeClosureRisk' | 'mouthOpenRisk'
> {
  if (
    !expression ||
    !Number.isFinite(expression.leftEyeAspectRatio) ||
    !Number.isFinite(expression.rightEyeAspectRatio) ||
    !Number.isFinite(expression.mouthOpenRatio)
  ) {
    return {
      eyeClosureRisk: unavailable('expression_unavailable', {
        source: 'estimated',
      }),
      mouthOpenRisk: unavailable('expression_unavailable', {
        source: 'estimated',
      }),
      neutralExpressionScore: unavailable('expression_unavailable', {
        source: 'estimated',
      }),
    };
  }

  const minimumEyeAspectRatio = Math.min(
    expression.leftEyeAspectRatio,
    expression.rightEyeAspectRatio,
  );
  const eyeClosureRisk = clamp01((0.22 - minimumEyeAspectRatio) / 0.16);
  const mouthOpenRisk = clamp01((expression.mouthOpenRatio - 0.08) / 0.26);
  const neutralExpressionScore = clamp01(1 - Math.max(eyeClosureRisk, mouthOpenRisk));

  return {
    eyeClosureRisk: measurement(eyeClosureRisk, {
      confidence: 0.82,
      source: 'estimated',
    }),
    mouthOpenRisk: measurement(mouthOpenRisk, {
      confidence: 0.82,
      source: 'estimated',
    }),
    neutralExpressionScore: measurement(neutralExpressionScore, {
      confidence: 0.82,
      source: 'estimated',
    }),
  };
}

function landmarkConfidence(
  input: FaceProfileQualityInput,
): FaceMeasurement<number> {
  const countRatio = clamp01(input.landmarkCount / 478);
  const finiteInFrameRatio = clamp01(input.finiteInFrameRatio ?? countRatio);
  const requiredAvailability = clamp01(
    input.requiredLandmarkAvailability ?? countRatio,
  );
  const poseAvailability = isFinitePose(input.pose) ? 1 : 0;
  const confidence =
    countRatio * 0.45 +
    finiteInFrameRatio * 0.25 +
    requiredAvailability * 0.2 +
    poseAvailability * 0.1;

  return measurement(clamp01(confidence), {
    confidence: 0.65,
    source: 'estimated',
    warnings: ['landmark_confidence_is_estimated'],
  });
}

function occlusionRisk(
  input: FaceProfileQualityInput,
): FaceMeasurement<number> {
  const expression = input.expression;
  const countRisk = 1 - clamp01(input.landmarkCount / 478);
  const roiRisk = expression?.roiCoverage === undefined
    ? 0
    : 1 - clamp01(expression.roiCoverage);
  const contourRisk = expression?.requiredContourCoverage === undefined
    ? 0
    : 1 - clamp01(expression.requiredContourCoverage);
  const asymmetryRisk = clamp01(expression?.leftRightContourAsymmetry ?? 0);
  const eyeAsymmetryRisk = expression
    ? clamp01(
        normalizedAsymmetry(
          expression.leftEyeAspectRatio,
          expression.rightEyeAspectRatio,
        ),
      )
    : 0;
  const hairlineRisk = expression?.hairlineWarning ? 0.5 : 0;
  const risk = Math.max(
    countRisk,
    roiRisk,
    contourRisk,
    asymmetryRisk,
    eyeAsymmetryRisk,
    hairlineRisk,
  );

  return measurement(risk, {
    confidence: 0.55,
    source: 'estimated',
    warnings: ['occlusion_risk_is_estimated'],
  });
}

export function evaluateFaceProfileQuality(
  input: FaceProfileQualityInput,
): FaceProfileQualityDecision {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (input.faceCount <= 0) {
    blockingReasons.push('face_not_detected');
  } else if (input.faceCount >= 2) {
    blockingReasons.push('multiple_faces');
  }
  if (
    !Number.isFinite(input.landmarkCount) ||
    input.landmarkCount < 478 ||
    (input.requiredLandmarkAvailability !== undefined &&
      (!Number.isFinite(input.requiredLandmarkAvailability) ||
        input.requiredLandmarkAvailability < 1))
  ) {
    blockingReasons.push('landmarks_incomplete');
  }

  const pose = isFinitePose(input.pose) ? input.pose : null;
  if (!pose) {
    blockingReasons.push('pose_unavailable');
  } else if (
    Math.abs(pose.yawDeg) > FACE_ANALYSIS_POSE_LIMITS.yawAbsMaxDeg ||
    Math.abs(pose.pitchDeg) > FACE_ANALYSIS_POSE_LIMITS.pitchAbsMaxDeg ||
    Math.abs(pose.rollDeg) > FACE_ANALYSIS_POSE_LIMITS.rollAbsMaxDeg
  ) {
    blockingReasons.push('pose_out_of_range');
  }

  const coverage = input.screenCoverageRatio;
  if (coverage === null || !Number.isFinite(coverage)) {
    warnings.push('screen_coverage_unavailable');
  } else if (coverage < 0.22) {
    warnings.push('face_too_far');
  } else if (coverage > 0.72) {
    warnings.push('face_too_close');
  }

  if (input.centeredOffset === null || !Number.isFinite(input.centeredOffset)) {
    warnings.push('centered_offset_unavailable');
  } else if (Math.abs(input.centeredOffset) > 0.18) {
    warnings.push('face_not_centered');
  }

  const stability = cameraStabilityScore(input.cameraMetadata);
  if (stability === null) {
    warnings.push('camera_stability_unavailable');
  } else if (stability < 0.5) {
    warnings.push('camera_unstable');
  }

  if (!input.pixelQuality) {
    warnings.push('pixel_quality_unavailable');
  } else {
    if (input.pixelQuality.blur.score < 0.45) {
      warnings.push('blur_risk');
    }
    const luminance = normalizeLuminance(
      input.pixelQuality.lighting.globalLuminance,
    );
    if (luminance < 0.25 || input.pixelQuality.lighting.score < 0.4) {
      warnings.push('lighting_low');
    } else if (luminance > 0.85) {
      warnings.push('lighting_high');
    }
    if (input.pixelQuality.lighting.uniformityScore < 0.5) {
      warnings.push('lighting_uneven');
    }
  }

  if (!input.expression) {
    warnings.push('expression_unavailable');
  }

  const landmarkConfidenceMeasurement = landmarkConfidence(input);
  const expression = expressionMeasurements(input.expression);
  const frontalScore = pose
    ? measurement(
        clamp01(
          1 -
            Math.max(
              Math.abs(pose.yawDeg) / FACE_ANALYSIS_POSE_LIMITS.yawAbsMaxDeg,
              Math.abs(pose.pitchDeg) /
                FACE_ANALYSIS_POSE_LIMITS.pitchAbsMaxDeg,
              Math.abs(pose.rollDeg) / FACE_ANALYSIS_POSE_LIMITS.rollAbsMaxDeg,
            ),
        ),
        {source: 'derived'},
      )
    : unavailable<number>('pose_unavailable', {source: 'derived'});
  const centeredScore = input.centeredOffset === null ||
      !Number.isFinite(input.centeredOffset)
    ? unavailable<number>('centered_offset_unavailable')
    : measurement(clamp01(1 - Math.abs(input.centeredOffset) / 0.2));
  const framingScore = coverage === null || !Number.isFinite(coverage)
    ? unavailable<number>('screen_coverage_unavailable')
    : measurement(
        coverage < 0.35
          ? clamp01(coverage / 0.35)
          : coverage > 0.62
            ? clamp01(1 - (coverage - 0.62) / 0.38)
            : 1,
      );

  const luminance = input.pixelQuality
    ? normalizeLuminance(input.pixelQuality.lighting.globalLuminance)
    : null;
  const whiteBalanceValues = input.cameraMetadata?.whiteBalanceGains
    ? [
        input.cameraMetadata.whiteBalanceGains.red,
        input.cameraMetadata.whiteBalanceGains.green,
        input.cameraMetadata.whiteBalanceGains.blue,
      ].filter((value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
      )
    : [];
  const whiteBalanceMean = robustMean(whiteBalanceValues);
  const coloredLightingRisk = whiteBalanceValues.length === 3 && whiteBalanceMean !== null
    ? measurement(
        clamp01(
          Math.max(
            ...whiteBalanceValues.map(value => Math.abs(value - whiteBalanceMean)),
          ) / Math.max(whiteBalanceMean, 0.01),
        ),
        {source: 'camera_metadata'},
      )
    : unavailable<number>('white_balance_unavailable', {
        source: 'camera_metadata',
      });

  const quality: FaceProfileQuality = {
    blockingReasons: unique(blockingReasons),
    blurScore: input.pixelQuality
      ? measurement(clamp01(input.pixelQuality.blur.score), {
          confidence: input.pixelQuality.blur.confidence,
          source: 'pixel_roi',
        })
      : unavailable('pixel_quality_unavailable', {source: 'pixel_roi'}),
    cameraDistanceMeters: unavailable('camera_distance_unavailable', {
      source: 'camera_metadata',
    }),
    cameraStability: stability === null
      ? unavailable('camera_stability_unavailable', {source: 'camera_metadata'})
      : measurement(stability, {source: 'camera_metadata'}),
    centeredScore,
    coloredLightingRisk,
    depthAccuracy: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    depthAvailable: measurement(false, {source: 'camera_metadata'}),
    depthConfidence: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    depthFiltered: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    depthMedianAbsoluteDeviationMeters: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    depthValidSampleRatio: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    eyeClosureRisk: expression.eyeClosureRisk,
    faceCount: measurement(input.faceCount, {confidence: 1}),
    facePlaneConfidence: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    facePlanePitchDeg: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    facePlaneRollDeg: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    facePlaneYawDeg: unavailable('truedepth_unavailable', {
      source: 'truedepth_3d',
    }),
    framingScore,
    frontalScore,
    hairlineConfidence: unavailable('hairline_unavailable', {source: 'estimated'}),
    landmarkConfidence: landmarkConfidenceMeasurement,
    landmarkCount: measurement(input.landmarkCount, {confidence: 1}),
    lightingScore: input.pixelQuality
      ? measurement(clamp01(input.pixelQuality.lighting.score), {
          source: 'pixel_roi',
        })
      : unavailable('pixel_quality_unavailable', {source: 'pixel_roi'}),
    mouthOpenRisk: expression.mouthOpenRisk,
    neutralExpressionScore: expression.neutralExpressionScore,
    occlusionRisk: occlusionRisk(input),
    overexposureRisk: luminance === null
      ? unavailable('pixel_quality_unavailable', {source: 'pixel_roi'})
      : measurement(clamp01((luminance - 0.7) / 0.3), {source: 'pixel_roi'}),
    pitchDeg: pose
      ? measurement(pose.pitchDeg, {source: 'mediapipe_2d'})
      : unavailable('pose_unavailable', {source: 'mediapipe_2d'}),
    rollDeg: pose
      ? measurement(pose.rollDeg, {source: 'mediapipe_2d'})
      : unavailable('pose_unavailable', {source: 'mediapipe_2d'}),
    screenCoverageRatio: coverage === null || !Number.isFinite(coverage)
      ? unavailable('screen_coverage_unavailable', {source: 'mediapipe_2d'})
      : measurement(coverage, {source: 'mediapipe_2d'}),
    underexposureRisk: luminance === null
      ? unavailable('pixel_quality_unavailable', {source: 'pixel_roi'})
      : measurement(clamp01((0.3 - luminance) / 0.3), {source: 'pixel_roi'}),
    yawDeg: pose
      ? measurement(pose.yawDeg, {source: 'mediapipe_2d'})
      : unavailable('pose_unavailable', {source: 'mediapipe_2d'}),
  };

  const uniqueWarnings = unique(warnings);
  const status = blockingReasons.length > 0
    ? 'blocked'
    : uniqueWarnings.length > 0
      ? 'partial_success'
      : 'full_success';

  return {
    blockingReasons: unique(blockingReasons),
    quality,
    status,
    warnings: uniqueWarnings,
  };
}
