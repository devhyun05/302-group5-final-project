import type {
  AuraPersonalColorResult,
  NativePersonalColorResult,
  NativeRegionStats,
} from '../../personal-color/services/personalColorCore/contracts';
import {
  analyzePersonalColor,
  combineSkinPatches,
} from '../../personal-color/services/personalColorCore/engine';
import {rgb8ToLab} from '../../personal-color/services/personalColorCore/colorMath';
import type {
  BeautyCoreFeatures,
  FaceColorSample,
  FaceMeasurement,
  FaceMeasurementSource,
  FaceProfileColor,
  FaceProfileQuality,
  FaceProfileResult,
  FaceVerticalThirdsSummary,
  PersonalColorSummary,
} from '../../../shared/types/faceProfile';
import {
  FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS,
  FACE_PROFILE_SCHEMA_VERSION,
} from './faceProfileContract';
import {
  extractFaceProfileGeometry,
  type FaceHairSkinBoundaryPair,
  type FaceLandmarkPoint,
  type FacePose,
  type NativeDepthSummary,
} from './faceProfileGeometry';
import {computeFaceProfilePixelSignals} from './faceProfilePixelSignals';
import {
  evaluateFaceProfileQuality,
  type NativeCameraCaptureMetadata,
} from './faceProfileQualityGate';
import {scoreFaceShape} from './faceShapeRuleScorer';

export type FaceCaptureQualitySnapshot = {
  cameraStability: number | null;
  capturedAt: string;
  centerOffsetX: number | null;
  centerOffsetY: number | null;
  centeredScore: number | null;
  faceCount: number;
  framingScore: number | null;
  nativeCameraMetadata: NativeCameraCaptureMetadata | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  screenCoverageRatio: number | null;
  source: 'camera';
  yawDeg: number | null;
};

export type FaceCaptureQualitySnapshotReport = {
  [key: string]: unknown;
  cameraStabilityGreenlight: boolean;
  metrics: {
    centerOffsetPx?: number;
    centerOffsetYPx?: number;
    faceWidthRatio?: number;
    pitchDeg?: number;
    rollDeg?: number;
    yawDeg?: number;
  };
  nativeCameraMetadata?: NativeCameraCaptureMetadata;
};

export type FaceProfileBuildInput = {
  captureId: string;
  captureQualitySnapshot: FaceCaptureQualitySnapshot | null;
  createdAt: string;
  depth: NativeDepthSummary | null;
  faceCount: number;
  hairSkinBoundary?: FaceHairSkinBoundaryPair | null;
  imageHeight: number;
  imageWidth: number;
  landmarks: FaceLandmarkPoint[];
  mirrored: boolean;
  nativePersonalColor: NativePersonalColorResult;
  personalColor: AuraPersonalColorResult;
  pose: FacePose | null;
  verticalThirds: FaceVerticalThirdsSummary | null;
  warnings?: readonly string[];
};

export const FACE_PROFILE_PENDING_CAPTURE_ID =
  '00000000-0000-4000-8000-000000000000';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeFaceCaptureQualitySnapshot({
  capturedAt,
  faceCount,
  guide,
  report,
}: {
  capturedAt: string;
  faceCount: number;
  guide: {height: number; width: number};
  report: FaceCaptureQualitySnapshotReport;
}): FaceCaptureQualitySnapshot {
  const normalizeOffset = (value: number | undefined, size: number) =>
    typeof value === 'number' && Number.isFinite(value) && size > 0
      ? value / size
      : null;
  const centerOffsetX = normalizeOffset(report.metrics.centerOffsetPx, guide.width);
  const centerOffsetY = normalizeOffset(
    report.metrics.centerOffsetYPx,
    guide.height,
  );
  const centeredOffset = finiteMean([centerOffsetX, centerOffsetY].map(value =>
    value === null ? null : Math.abs(value),
  ));
  const coverage = finiteOrNull(report.metrics.faceWidthRatio);
  const metadataStable = report.nativeCameraMetadata?.isStable;
  const cameraStability =
    typeof metadataStable === 'number' && Number.isFinite(metadataStable)
      ? clamp01(metadataStable)
      : typeof metadataStable === 'boolean'
        ? metadataStable
          ? 1
          : 0
        : report.cameraStabilityGreenlight
          ? 1
          : 0;

  return {
    cameraStability,
    capturedAt,
    centerOffsetX,
    centerOffsetY,
    centeredScore:
      centeredOffset === null ? null : clamp01(1 - centeredOffset / 0.18),
    faceCount,
    framingScore:
      coverage === null ? null : clamp01(1 - Math.abs(coverage - 0.46) / 0.26),
    nativeCameraMetadata: report.nativeCameraMetadata ?? null,
    pitchDeg: finiteOrNull(report.metrics.pitchDeg),
    rollDeg: finiteOrNull(report.metrics.rollDeg),
    screenCoverageRatio: coverage,
    source: 'camera',
    yawDeg: finiteOrNull(report.metrics.yawDeg),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function measured<T>(
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

function finiteMean(values: readonly (number | null)[]): number | null {
  const finite = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  return finite.length === 0
    ? null
    : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function rgbHex(rgb: {r: number; g: number; b: number}): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function colorSample(
  stats: NativeRegionStats | undefined,
  missingReason: string,
): FaceMeasurement<FaceColorSample> {
  if (!stats || stats.sampleCount <= 0) {
    return unavailable(missingReason, {source: 'pixel_roi'});
  }
  const lab = rgb8ToLab(stats.rgbMean);
  return measured(
    {
      hex: rgbHex(stats.rgbMean),
      lab: {L: lab.L, a: lab.a, b: lab.b},
      rgb: {...stats.rgbMean},
    },
    {confidence: stats.confidence, source: 'pixel_roi'},
  );
}

function personalColorSummary(
  result: AuraPersonalColorResult,
): PersonalColorSummary {
  return {
    axes: {
      chroma: {
        confidence: result.axes.chroma.confidence,
        value: result.axes.chroma.value,
      },
      clarity: {
        confidence: result.axes.clarity.confidence,
        value: result.axes.clarity.value,
      },
      contrast: {
        confidence: result.axes.contrast.confidence,
        value: result.axes.contrast.value,
      },
      temperature: {
        confidence: result.axes.temperature.confidence,
        value: result.axes.temperature.value,
      },
      value: {
        confidence: result.axes.value.confidence,
        value: result.axes.value.value,
      },
    },
    calibrationApplied: result.calibrationApplied,
    calibrationVersion: result.artifacts.calibrationVersion,
    measurementConfidence: result.measurementConfidence,
    palette: {
      bestFamilyIds: result.palette.best.map(item => item.family.id),
      worstFamilyIds: result.palette.worst.map(item => item.family.id),
    },
    relations: {
      dE00SkinHair: result.relations.dE00_skinHair,
      dE00SkinLip: result.relations.dE00_skinLip,
      dLSkinHair: result.relations.dL_skinHair,
      dLSkinLip: result.relations.dL_skinLip,
    },
    status: result.status,
    tone: result.tone
      ? {
          gap: result.tone.gap,
          score: result.tone.typeScore,
          season: result.tone.season,
          secondary: result.tone.secondary,
          toneDistances: result.tone.distances,
          toneScores: result.tone.probabilities,
          top: result.tone.top,
        }
      : null,
    warnings: unique(result.warnings),
  };
}

function buildColor(
  native: NativePersonalColorResult,
  personalColor: AuraPersonalColorResult,
): FaceProfileColor {
  const signals = computeFaceProfilePixelSignals(native);
  const regions = native.regions ?? {};
  const skin = combineSkinPatches(native);
  const summary = personalColorSummary(personalColor);
  return {
    ...signals,
    hairColor: colorSample(regions.hair, 'hair_region_missing'),
    leftBrowColor: colorSample(regions.browLeft, 'brow_left_missing'),
    leftEyeColor: colorSample(regions.eyeLeft, 'eye_left_missing'),
    lipColor: colorSample(regions.lip, 'lip_region_missing'),
    personalColor: measured(summary, {
      confidence: personalColor.measurementConfidence,
      source: 'derived',
      warnings: personalColor.warnings,
    }),
    rightBrowColor: colorSample(regions.browRight, 'brow_right_missing'),
    rightEyeColor: colorSample(regions.eyeRight, 'eye_right_missing'),
    skinColor: colorSample(skin, 'skin_region_missing'),
  };
}

function preserveCameraSnapshot(
  quality: FaceProfileQuality,
  snapshot: FaceCaptureQualitySnapshot | null,
): FaceProfileQuality {
  if (!snapshot) {
    const metadataUnavailable = <T>() =>
      unavailable<T>('camera_metadata_unavailable', {source: 'camera_metadata'});
    return {
      ...quality,
      cameraStability: metadataUnavailable<number>(),
      centeredScore: metadataUnavailable<number>(),
      coloredLightingRisk: metadataUnavailable<number>(),
      framingScore: metadataUnavailable<number>(),
      screenCoverageRatio: metadataUnavailable<number>(),
    };
  }

  const snapshotMeasurement = (
    value: number | null,
    reason: string,
  ): FaceMeasurement<number> =>
    value === null || !Number.isFinite(value)
      ? unavailable(reason, {source: 'camera_metadata'})
      : measured(value, {source: 'camera_metadata'});
  return {
    ...quality,
    cameraStability: snapshotMeasurement(
      snapshot.cameraStability,
      'camera_stability_unavailable',
    ),
    centeredScore: snapshotMeasurement(
      snapshot.centeredScore,
      'centered_offset_unavailable',
    ),
    framingScore: snapshotMeasurement(
      snapshot.framingScore,
      'screen_coverage_unavailable',
    ),
    screenCoverageRatio: snapshotMeasurement(
      snapshot.screenCoverageRatio,
      'screen_coverage_unavailable',
    ),
  };
}

function mergeDepthQuality(
  quality: FaceProfileQuality,
  depth: NativeDepthSummary | null,
): FaceProfileQuality {
  if (!depth || depth.status !== 'ok') {
    return {
      ...quality,
      depthAvailable: measured(false, {source: 'camera_metadata'}),
    };
  }

  const plane = depth.facePlane;
  return {
    ...quality,
    cameraDistanceMeters:
      depth.cameraDistanceMeters === undefined
        ? unavailable('relative_depth_has_no_camera_distance', {
            source: 'truedepth_3d',
          })
        : measured(depth.cameraDistanceMeters, {source: 'truedepth_3d'}),
    depthAccuracy: measured(depth.depthQuality.accuracy, {
      source: 'truedepth_3d',
    }),
    depthAvailable: measured(true, {source: 'truedepth_3d'}),
    depthConfidence: measured(depth.depthQuality.confidence, {
      source: 'truedepth_3d',
    }),
    depthFiltered: measured(depth.depthQuality.filtered, {
      source: 'truedepth_3d',
    }),
    depthMedianAbsoluteDeviationMeters: measured(
      depth.depthQuality.medianAbsoluteDeviationMeters,
      {source: 'truedepth_3d'},
    ),
    depthValidSampleRatio: measured(depth.depthQuality.validSampleRatio, {
      source: 'truedepth_3d',
    }),
    facePlaneConfidence: plane
      ? measured(plane.confidence, {source: 'truedepth_3d'})
      : unavailable('face_plane_unavailable', {source: 'truedepth_3d'}),
    facePlanePitchDeg: plane
      ? measured(plane.pitchDeg, {source: 'truedepth_3d'})
      : unavailable('face_plane_unavailable', {source: 'truedepth_3d'}),
    facePlaneRollDeg: plane
      ? measured(plane.rollDeg, {source: 'truedepth_3d'})
      : unavailable('face_plane_unavailable', {source: 'truedepth_3d'}),
    facePlaneYawDeg: plane
      ? measured(plane.yawDeg, {source: 'truedepth_3d'})
      : unavailable('face_plane_unavailable', {source: 'truedepth_3d'}),
  };
}

function measurementValue(
  root: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'object' && current !== null && 'value' in current
    ? (current as {value: unknown}).value
    : undefined;
}

function category(
  value: number | null,
  low: number,
  high: number,
  labels: readonly [string, string, string],
): string {
  if (value === null || !Number.isFinite(value)) {
    return '측정 불가';
  }
  return value < low ? labels[0] : value > high ? labels[2] : labels[1];
}

function beautyCore(
  quality: FaceProfileQuality,
  color: FaceProfileColor,
  faceBalance: FaceProfileResult['faceBalance'],
  eyesAndBrows: FaceProfileResult['eyesAndBrows'],
  nose: FaceProfileResult['nose'],
  mouth: FaceProfileResult['mouth'],
): BeautyCoreFeatures {
  const overallContrast = color.overallFaceContrast.value;
  const eyeAspectRatio = finiteMean([
    eyesAndBrows.leftEyeAspectRatio.value,
    eyesAndBrows.rightEyeAspectRatio.value,
  ]);
  const eyeTilt = finiteMean([
    eyesAndBrows.leftEyeCanthalTiltDeg.value,
    eyesAndBrows.rightEyeCanthalTiltDeg.value,
  ]);
  const browDistance = finiteMean([
    eyesAndBrows.leftBrowEyeDistanceRatio.value,
    eyesAndBrows.rightBrowEyeDistanceRatio.value,
  ]);
  const mouthTilt = finiteMean([
    mouth.leftCornerTiltDeg.value,
    mouth.rightCornerTiltDeg.value,
  ]);
  const confidenceValues = [
    quality.frontalScore,
    quality.landmarkConfidence,
    quality.lightingScore,
    color.overallFaceContrast,
  ]
    .filter(measurement => measurement.value !== null)
    .map(measurement => measurement.confidence);

  return {
    eyesAndBrows: {
      browEyeDistance: category(
        browDistance,
        0.12,
        0.22,
        ['가까움', '균형', '멀음'],
      ),
      eyeAspectRatio,
      eyeSpacing: category(
        eyesAndBrows.interEyeDistanceRatio.value,
        0.28,
        0.36,
        ['좁음', '균형', '넓음'],
      ),
      eyeTilt: category(eyeTilt, -2, 2, ['하향', '수평', '상향']),
    },
    faceBalance: {
      cheekboneToJawRatio: faceBalance.cheekToJawRatio.value,
      faceLengthWidthRatio: faceBalance.faceLengthToWidth.value,
      jawSoftness: faceBalance.jawSoftness.value,
      lowerFaceLength: category(
        faceBalance.lowerThirdRatio.value,
        0.92,
        1.08,
        ['짧음', '균형', '김'],
      ),
      midfaceLength: category(
        faceBalance.middleThirdRatio.value,
        0.92,
        1.08,
        ['짧음', '균형', '김'],
      ),
    },
    facialContrast: {
      browSkinContrast: color.browSkinContrast.value,
      eyeSkinContrast: color.eyeSkinContrast.value,
      lipSkinContrast: color.lipSkinContrast.value,
      overall: category(overallContrast, 12, 24, ['낮음', '중간', '높음']),
    },
    mouth: {
      lipFullness: category(
        mouth.lipFullnessRatio.value,
        0.18,
        0.32,
        ['얇음', '균형', '도톰함'],
      ),
      mouthCornerTilt: category(mouthTilt, -2, 2, ['하향', '수평', '상향']),
      mouthWidthRatio: mouth.mouthWidthRatio.value,
      upperLowerLipRatio: mouth.upperToLowerLipRatio.value,
    },
    nose: {
      noseLengthRatio: nose.noseLengthRatio.value,
      noseMidfaceRatio: nose.noseToMidfaceRatio.value,
      noseTipMouthDistanceRatio: nose.noseTipToMouthRatio.value,
      noseWidthRatio: nose.noseWidthRatio.value,
    },
    quality: {
      confidence:
        confidenceValues.length === 0
          ? 0
          : clamp01(
              confidenceValues.reduce((sum, value) => sum + value, 0) /
                confidenceValues.length,
            ),
      isFrontal:
        quality.frontalScore.value === null
          ? 'unavailable'
          : quality.frontalScore.value >= 0.6,
      lightingQuality: quality.lightingScore.value,
      neutralExpression:
        quality.neutralExpressionScore.value === null
          ? 'unavailable'
          : quality.neutralExpressionScore.value >= 0.6,
    },
    skinEvenness: {
      redness: color.redness.value,
      toneUniformity: color.skinEvenness.value,
      yellowHue: color.yellowness.value,
    },
  };
}

export function buildFaceProfile(input: FaceProfileBuildInput): FaceProfileResult {
  const geometry = extractFaceProfileGeometry({
    depth: input.depth,
    faceCount: input.faceCount,
    hairSkinBoundary: input.hairSkinBoundary,
    hairline: input.verticalThirds,
    imageHeight: input.imageHeight,
    imageWidth: input.imageWidth,
    landmarks: input.landmarks,
    mirrored: input.mirrored,
    pose: input.pose,
  });
  const pixelQuality = input.nativePersonalColor.quality;
  const expression = {
    hairlineWarning: input.verticalThirds === null,
    leftEyeAspectRatio: geometry.eyesAndBrows.leftEyeAspectRatio.value ?? Number.NaN,
    mouthOpenRatio: geometry.mouth.lipFullnessRatio.value ?? Number.NaN,
    rightEyeAspectRatio:
      geometry.eyesAndBrows.rightEyeAspectRatio.value ?? Number.NaN,
  };
  const centeredOffset = input.captureQualitySnapshot
    ? Math.max(
        Math.abs(input.captureQualitySnapshot.centerOffsetX ?? 0),
        Math.abs(input.captureQualitySnapshot.centerOffsetY ?? 0),
      )
    : null;
  const qualityDecision = evaluateFaceProfileQuality({
    cameraMetadata: input.captureQualitySnapshot?.nativeCameraMetadata ?? undefined,
    centeredOffset,
    expression,
    faceCount: input.faceCount,
    finiteInFrameRatio:
      input.landmarks.filter(
        point =>
          point &&
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= 0 &&
          point.y >= 0,
      ).length / Math.max(1, input.landmarks.length),
    landmarkCount: input.landmarks.length,
    pixelQuality,
    pose: input.pose,
    requiredLandmarkAvailability: input.landmarks.length >= 478 ? 1 : 0,
    screenCoverageRatio:
      input.captureQualitySnapshot?.screenCoverageRatio ?? null,
  });
  let quality = preserveCameraSnapshot(
    qualityDecision.quality,
    input.captureQualitySnapshot,
  );
  quality = {
    ...quality,
    hairlineConfidence:
      input.verticalThirds?.hairline.confidence === null ||
      input.verticalThirds?.hairline.confidence === undefined
        ? unavailable('hairline_unavailable', {source: 'estimated'})
        : measured(input.verticalThirds.hairline.confidence, {
            source:
              input.verticalThirds.hairline.provider === 'apple_semantic_matte'
                ? 'apple_semantic_matte'
                : 'estimated',
          }),
  };
  quality = mergeDepthQuality(quality, input.depth);
  const color = buildColor(input.nativePersonalColor, input.personalColor);
  const faceShape = scoreFaceShape(geometry.ruleFeatures);
  const warnings = unique([
    ...qualityDecision.warnings,
    ...geometry.warnings,
    ...input.personalColor.warnings,
    ...(input.depth && input.depth.status !== 'ok'
      ? [`depth_${input.depth.status}`]
      : []),
    ...(input.warnings ?? []),
  ]);

  const provisional: FaceProfileResult = {
    beautyCoreFeatures: beautyCore(
      quality,
      color,
      geometry.faceBalance,
      geometry.eyesAndBrows,
      geometry.nose,
      geometry.mouth,
    ),
    captureId: input.captureId,
    color,
    createdAt: input.createdAt,
    existingAnalysis: {
      personalColor: personalColorSummary(input.personalColor),
      verticalThirds: input.verticalThirds,
    },
    eyesAndBrows: geometry.eyesAndBrows,
    faceBalance: geometry.faceBalance,
    faceShape,
    mouth: geometry.mouth,
    nose: geometry.nose,
    provenance: {
      classifierVersion: faceShape.classifierVersion,
      landmarkCount: input.landmarks.length,
      landmarkIndexVersion: 'mediapipe-face-landmarker-478-v1',
      landmarkProvider: 'unity_homuler_mediapipe',
      pixelAnalyzerVersion: 'aura-personal-color-roi-v1',
      trainingUseAllowed: false,
      trueDepthUsed: input.depth?.status === 'ok',
    },
    quality,
    schemaVersion: FACE_PROFILE_SCHEMA_VERSION,
    status: 'partial_success',
    statusReason: 'partial_measurements_unavailable',
    warnings,
  };

  if (quality.blockingReasons.length > 0) {
    return {
      ...provisional,
      status: 'blocked',
      statusReason: quality.blockingReasons[0],
    };
  }

  const allRequiredAvailable = FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS.every(
    path => {
      const value = measurementValue(
        provisional as unknown as Record<string, unknown>,
        path,
      );
      return value !== null && value !== undefined;
    },
  );
  if (allRequiredAvailable && faceShape.status !== 'blocked') {
    return {...provisional, status: 'full_success', statusReason: null};
  }

  return provisional;
}

export function buildFailedFaceProfile(
  createdAt: string,
  warning: string,
): FaceProfileResult {
  const native: NativePersonalColorResult = {
    faceCount: 0,
    status: 'error',
    warnings: [warning],
  };
  const blocked = buildFaceProfile({
    captureId: FACE_PROFILE_PENDING_CAPTURE_ID,
    captureQualitySnapshot: null,
    createdAt,
    depth: null,
    faceCount: 0,
    imageHeight: 0,
    imageWidth: 0,
    landmarks: [],
    mirrored: false,
    nativePersonalColor: native,
    personalColor: analyzePersonalColor(native),
    pose: null,
    verticalThirds: null,
    warnings: [warning],
  });

  return {
    ...blocked,
    quality: {...blocked.quality, blockingReasons: []},
    status: 'failed',
    statusReason: 'pipeline_failure',
    warnings: unique([...blocked.warnings, warning]),
  };
}
