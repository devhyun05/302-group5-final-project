import {
  FACE_PROFILE_SCHEMA_VERSION,
  type FaceMeasurementSource,
  type FaceProfileResult,
  type FaceShapeLabel,
  type PersonalColor12Type,
} from '../../../shared/types/faceProfile';
import {FACE_SHAPE_LABELS} from '../constants/faceShapeLandmarks';

export {FACE_PROFILE_SCHEMA_VERSION};

const MAX_PROFILE_BYTES = 256 * 1024;
const MAX_WARNING_COUNT = 32;
const MAX_TRAIT_COUNT = 8;
const MAX_SHORT_STRING_LENGTH = 128;
export const FACE_SHAPE_SCORE_TOLERANCE = 1e-6;

export const FACE_PROFILE_PIPELINE_FAILURE_CODES = ['pipeline_failure'] as const;
const PIPELINE_FAILURE_CODE_SET = new Set<string>(
  FACE_PROFILE_PIPELINE_FAILURE_CODES,
);

const FORBIDDEN_KEYS = new Set([
  'landmarks',
  'rawLandmarks',
  'depthMap',
  'rawDepth',
  'calibrationData',
  'semanticMatte',
  'roiPixels',
  'trainingConsent',
]);

const MEASUREMENT_SOURCES = new Set<FaceMeasurementSource>([
  'truedepth_3d',
  'mediapipe_2d',
  'apple_semantic_matte',
  'pixel_roi',
  'camera_metadata',
  'derived',
  'estimated',
]);

const PERSONAL_COLOR_TYPES = [
  'spring_light',
  'spring_bright',
  'spring_true',
  'summer_light',
  'summer_true',
  'summer_muted',
  'autumn_muted',
  'autumn_true',
  'autumn_deep',
  'winter_bright',
  'winter_true',
  'winter_deep',
] as const satisfies readonly PersonalColor12Type[];

export const FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS = [
  'quality.faceCount',
  'quality.landmarkCount',
  'quality.yawDeg',
  'quality.pitchDeg',
  'quality.rollDeg',
  'quality.frontalScore',
  'quality.centeredScore',
  'quality.framingScore',
  'quality.screenCoverageRatio',
  'quality.cameraStability',
  'quality.blurScore',
  'quality.lightingScore',
  'quality.overexposureRisk',
  'quality.underexposureRisk',
  'quality.coloredLightingRisk',
  'quality.neutralExpressionScore',
  'quality.eyeClosureRisk',
  'quality.mouthOpenRisk',
  'quality.hairlineConfidence',
  'quality.occlusionRisk',
  'quality.landmarkConfidence',
  'quality.depthAvailable',
  'color.overallFaceContrast',
  'color.eyeSkinContrast',
  'color.browSkinContrast',
  'color.lipSkinContrast',
  'color.skinEvenness',
  'color.redness',
  'color.yellowness',
  'color.skinColor',
  'color.hairColor',
  'color.lipColor',
  'color.leftEyeColor',
  'color.rightEyeColor',
  'color.leftBrowColor',
  'color.rightBrowColor',
  'color.personalColor',
  'faceBalance.faceLengthToWidth',
  'faceBalance.faceLengthToCheekWidth',
  'faceBalance.upperThirdRatio',
  'faceBalance.middleThirdRatio',
  'faceBalance.lowerThirdRatio',
  'faceBalance.foreheadWidthToCheekWidth',
  'faceBalance.templeWidthToCheekWidth',
  'faceBalance.jawWidthToCheekWidth',
  'faceBalance.chinWidthToCheekWidth',
  'faceBalance.cheekToJawRatio',
  'faceBalance.cheekDominance',
  'faceBalance.jawlineLengthRatio',
  'faceBalance.jawAngleDeg',
  'faceBalance.jawWidthScore',
  'faceBalance.jawAngleScore',
  'faceBalance.jawSoftness',
  'faceBalance.chinPointedness',
  'faceBalance.contourRoundness',
  'faceBalance.foreheadDominance',
  'faceBalance.lowerFaceWeight',
  'faceBalance.contourAsymmetry',
  'eyesAndBrows.leftEyeAspectRatio',
  'eyesAndBrows.rightEyeAspectRatio',
  'eyesAndBrows.interEyeDistanceRatio',
  'eyesAndBrows.leftEyeCanthalTiltDeg',
  'eyesAndBrows.rightEyeCanthalTiltDeg',
  'eyesAndBrows.leftBrowEyeDistanceRatio',
  'eyesAndBrows.rightBrowEyeDistanceRatio',
  'eyesAndBrows.leftBrowTiltDeg',
  'eyesAndBrows.rightBrowTiltDeg',
  'eyesAndBrows.eyeAsymmetry',
  'eyesAndBrows.browAsymmetry',
  'nose.noseLengthRatio',
  'nose.noseWidthRatio',
  'nose.noseToMidfaceRatio',
  'nose.noseTipToMouthRatio',
  'nose.centerlineAsymmetry',
  'mouth.lipFullnessRatio',
  'mouth.mouthWidthRatio',
  'mouth.upperToLowerLipRatio',
  'mouth.leftCornerTiltDeg',
  'mouth.rightCornerTiltDeg',
  'mouth.mouthAsymmetry',
] as const;

export const FACE_PROFILE_OPTIONAL_MEASUREMENT_PATHS = [
  'quality.cameraDistanceMeters',
  'quality.depthAccuracy',
  'quality.depthFiltered',
  'quality.depthValidSampleRatio',
  'quality.depthMedianAbsoluteDeviationMeters',
  'quality.depthConfidence',
  'quality.facePlanePitchDeg',
  'quality.facePlaneYawDeg',
  'quality.facePlaneRollDeg',
  'quality.facePlaneConfidence',
] as const;

const BOOLEAN_MEASUREMENT_PATHS = new Set([
  'quality.depthAvailable',
  'quality.depthFiltered',
]);

const COLOR_SAMPLE_MEASUREMENT_PATHS = new Set([
  'color.skinColor',
  'color.hairColor',
  'color.lipColor',
  'color.leftEyeColor',
  'color.rightEyeColor',
  'color.leftBrowColor',
  'color.rightBrowColor',
]);

const GEOMETRY_CORE_PATHS = [
  'faceBalance.faceLengthToWidth',
  'eyesAndBrows.leftEyeAspectRatio',
  'nose.noseLengthRatio',
  'mouth.mouthWidthRatio',
] as const;

const COLOR_CORE_PATHS = [
  'color.overallFaceContrast',
  'color.skinEvenness',
  'color.skinColor',
  'color.personalColor',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isUnitNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isShortString(value: unknown, allowEmpty = false): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_SHORT_STRING_LENGTH &&
    (allowEmpty || value.length > 0)
  );
}

function isBoundedStringArray(
  value: unknown,
  maxCount = MAX_WARNING_COUNT,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxCount &&
    value.every(item => isShortString(item))
  );
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function validateTree(
  value: unknown,
  parentKey?: string,
  seen: WeakSet<object> = new WeakSet(),
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    if (parentKey === 'warnings' && !isBoundedStringArray(value)) {
      return false;
    }
    if (parentKey === 'explanationTraits' && !isBoundedStringArray(value, MAX_TRAIT_COUNT)) {
      return false;
    }
    return value.every(item => validateTree(item, undefined, seen));
  }
  if (!isRecord(value) || seen.has(value)) {
    return false;
  }

  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return false;
    }
    if (key === 'nullReason' && !isShortString(child)) {
      return false;
    }
    if (/confidence/i.test(key) && typeof child === 'number' && !isUnitNumber(child)) {
      return false;
    }
    if (!validateTree(child, key, seen)) {
      return false;
    }
  }
  seen.delete(value);
  return true;
}

function getPath(root: Record<string, unknown>, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function validateMeasurement(value: unknown): value is {
  value: unknown;
  confidence: number;
  source: FaceMeasurementSource;
  nullReason?: string;
  warnings: string[];
} {
  if (
    !isRecord(value) ||
    !Object.prototype.hasOwnProperty.call(value, 'value') ||
    !isUnitNumber(value.confidence) ||
    typeof value.source !== 'string' ||
    !MEASUREMENT_SOURCES.has(value.source as FaceMeasurementSource) ||
    !isBoundedStringArray(value.warnings)
  ) {
    return false;
  }

  if (value.value === null) {
    return isShortString(value.nullReason);
  }

  return !Object.prototype.hasOwnProperty.call(value, 'nullReason');
}

function getMeasurementValue(root: Record<string, unknown>, path: string): unknown {
  const measurement = getPath(root, path);
  return validateMeasurement(measurement) ? measurement.value : undefined;
}

function validateColorSample(value: unknown): boolean {
  if (!isRecord(value) || !isShortString(value.hex) || !/^#[0-9a-f]{6}$/i.test(value.hex)) {
    return false;
  }
  const lab = value.lab;
  const rgb = value.rgb;
  return (
    isRecord(lab) &&
    isFiniteNumber(lab.L) &&
    isFiniteNumber(lab.a) &&
    isFiniteNumber(lab.b) &&
    isRecord(rgb) &&
    isFiniteNumber(rgb.r) &&
    isFiniteNumber(rgb.g) &&
    isFiniteNumber(rgb.b)
  );
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every(key => actualKeys.includes(key));
}

function isFaceShapeLabel(value: unknown): value is FaceShapeLabel {
  return (
    typeof value === 'string' &&
    (FACE_SHAPE_LABELS as readonly string[]).includes(value)
  );
}

function validateRuleFeatureSummary(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const numericOrNullFields = [
    'faceLengthToCheekWidth',
    'foreheadWidthToCheekWidth',
    'templeWidthToCheekWidth',
    'jawWidthToCheekWidth',
    'chinWidthToCheekWidth',
    'cheekDominance',
    'jawWidthScore',
    'jawAngleScore',
    'chinPointedness',
    'contourRoundness',
    'foreheadDominance',
    'lowerFaceWeight',
  ] as const;
  const confidenceFields = [
    'frontalConfidence',
    'landmarkConfidence',
    'hairlineConfidence',
  ] as const;

  return (
    numericOrNullFields.every(
      field => value[field] === null || isFiniteNumber(value[field]),
    ) && confidenceFields.every(field => isUnitNumber(value[field]))
  );
}

function validateFaceShape(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !['ready', 'mixed', 'blocked'].includes(String(value.status)) ||
    value.classifierType !== 'rule_v1' ||
    !isShortString(value.classifierVersion) ||
    !isUnitNumber(value.overallConfidence) ||
    !isBoundedStringArray(value.explanationTraits, MAX_TRAIT_COUNT) ||
    !isBoundedStringArray(value.warnings) ||
    !validateRuleFeatureSummary(value.ruleFeatures) ||
    !isRecord(value.faceShapeScores) ||
    !hasExactKeys(value.faceShapeScores, FACE_SHAPE_LABELS)
  ) {
    return false;
  }

  const scores = value.faceShapeScores;
  if (!FACE_SHAPE_LABELS.every(label => isUnitNumber(scores[label]))) {
    return false;
  }

  if (value.status === 'blocked') {
    return (
      value.dominantShape === null &&
      value.confidenceGap === null &&
      Array.isArray(value.top2) &&
      value.top2.length === 0 &&
      FACE_SHAPE_LABELS.every(label => scores[label] === 0)
    );
  }

  const scoreSum = FACE_SHAPE_LABELS.reduce(
    (sum, label) => sum + (scores[label] as number),
    0,
  );
  if (
    Math.abs(scoreSum - 1) > FACE_SHAPE_SCORE_TOLERANCE ||
    !isFaceShapeLabel(value.dominantShape) ||
    !isUnitNumber(value.confidenceGap) ||
    !Array.isArray(value.top2) ||
    value.top2.length !== 2
  ) {
    return false;
  }

  const sortedLabels = [...FACE_SHAPE_LABELS].sort((left, right) => {
    const scoreDifference = (scores[right] as number) - (scores[left] as number);
    return Math.abs(scoreDifference) <= FACE_SHAPE_SCORE_TOLERANCE
      ? FACE_SHAPE_LABELS.indexOf(left) - FACE_SHAPE_LABELS.indexOf(right)
      : scoreDifference;
  });

  for (let index = 0; index < 2; index += 1) {
    const item = value.top2[index];
    const expectedLabel = sortedLabels[index];
    if (
      !isRecord(item) ||
      item.shape !== expectedLabel ||
      !isFiniteNumber(item.score) ||
      Math.abs(item.score - (scores[expectedLabel] as number)) >
        FACE_SHAPE_SCORE_TOLERANCE
    ) {
      return false;
    }
  }

  const expectedGap =
    (scores[sortedLabels[0]] as number) - (scores[sortedLabels[1]] as number);
  return (
    value.dominantShape === sortedLabels[0] &&
    Math.abs(value.confidenceGap - expectedGap) <=
      FACE_SHAPE_SCORE_TOLERANCE
  );
}

function isFiniteOrNull(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isCategory(value: unknown): boolean {
  return isShortString(value);
}

function validateBeautyCore(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const facialContrast = value.facialContrast;
  const skinEvenness = value.skinEvenness;
  const faceBalance = value.faceBalance;
  const eyesAndBrows = value.eyesAndBrows;
  const nose = value.nose;
  const mouth = value.mouth;
  const quality = value.quality;
  if (
    !isRecord(facialContrast) ||
    !isRecord(skinEvenness) ||
    !isRecord(faceBalance) ||
    !isRecord(eyesAndBrows) ||
    !isRecord(nose) ||
    !isRecord(mouth) ||
    !isRecord(quality)
  ) {
    return false;
  }

  return (
    isCategory(facialContrast.overall) &&
    ['eyeSkinContrast', 'browSkinContrast', 'lipSkinContrast'].every(field =>
      isFiniteOrNull(facialContrast[field]),
    ) &&
    ['toneUniformity', 'redness', 'yellowHue'].every(field =>
      isFiniteOrNull(skinEvenness[field]),
    ) &&
    ['faceLengthWidthRatio', 'jawSoftness', 'cheekboneToJawRatio'].every(field =>
      isFiniteOrNull(faceBalance[field]),
    ) &&
    isCategory(faceBalance.midfaceLength) &&
    isCategory(faceBalance.lowerFaceLength) &&
    isFiniteOrNull(eyesAndBrows.eyeAspectRatio) &&
    ['eyeSpacing', 'eyeTilt', 'browEyeDistance'].every(field =>
      isCategory(eyesAndBrows[field]),
    ) &&
    [
      'noseLengthRatio',
      'noseWidthRatio',
      'noseMidfaceRatio',
      'noseTipMouthDistanceRatio',
    ].every(field => isFiniteOrNull(nose[field])) &&
    ['mouthWidthRatio', 'upperLowerLipRatio'].every(field =>
      isFiniteOrNull(mouth[field]),
    ) &&
    isCategory(mouth.lipFullness) &&
    isCategory(mouth.mouthCornerTilt) &&
    (typeof quality.isFrontal === 'boolean' || quality.isFrontal === 'unavailable') &&
    (typeof quality.neutralExpression === 'boolean' ||
      quality.neutralExpression === 'unavailable') &&
    isFiniteOrNull(quality.lightingQuality) &&
    isUnitNumber(quality.confidence)
  );
}

function validateToneRecord(value: unknown, unitRange: boolean): boolean {
  if (!isRecord(value) || !hasExactKeys(value, PERSONAL_COLOR_TYPES)) {
    return false;
  }
  return PERSONAL_COLOR_TYPES.every(type =>
    unitRange ? isUnitNumber(value[type]) : isFiniteNumber(value[type]),
  );
}

function validatePersonalColorSummary(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const axes = value.axes;
  const relations = value.relations;
  const palette = value.palette;
  if (
    !['definitive', 'mixed', 'provisional', 'insufficient'].includes(String(value.status)) ||
    !isUnitNumber(value.measurementConfidence) ||
    !isRecord(axes) ||
    !isRecord(relations) ||
    !isRecord(palette) ||
    typeof value.calibrationApplied !== 'boolean' ||
    !(value.calibrationVersion === null || isShortString(value.calibrationVersion)) ||
    !isBoundedStringArray(value.warnings)
  ) {
    return false;
  }

  const axisNames = ['temperature', 'value', 'chroma', 'clarity', 'contrast'] as const;
  if (
    !hasExactKeys(axes, axisNames) ||
    !axisNames.every(axis => {
      const measurement = axes[axis];
      return (
        isRecord(measurement) &&
        isFiniteOrNull(measurement.value) &&
        isUnitNumber(measurement.confidence)
      );
    }) ||
    !['dLSkinHair', 'dLSkinLip', 'dE00SkinHair', 'dE00SkinLip'].every(field =>
      isFiniteOrNull(relations[field]),
    ) ||
    !isBoundedStringArray(palette.bestFamilyIds) ||
    !isBoundedStringArray(palette.worstFamilyIds)
  ) {
    return false;
  }

  if (value.tone === null) {
    return value.status === 'insufficient';
  }
  if (!isRecord(value.tone)) {
    return false;
  }

  return (
    PERSONAL_COLOR_TYPES.includes(value.tone.top as PersonalColor12Type) &&
    (value.tone.secondary === null ||
      PERSONAL_COLOR_TYPES.includes(value.tone.secondary as PersonalColor12Type)) &&
    ['spring', 'summer', 'autumn', 'winter'].includes(String(value.tone.season)) &&
    isUnitNumber(value.tone.score) &&
    isUnitNumber(value.tone.gap) &&
    validateToneRecord(value.tone.toneScores, true) &&
    validateToneRecord(value.tone.toneDistances, false)
  );
}

function validateMeasurementValue(path: string, measurement: unknown): boolean {
  if (!validateMeasurement(measurement) || measurement.value === null) {
    return validateMeasurement(measurement);
  }
  if (BOOLEAN_MEASUREMENT_PATHS.has(path)) {
    return typeof measurement.value === 'boolean';
  }
  if (path === 'quality.depthAccuracy') {
    return measurement.value === 'absolute' || measurement.value === 'relative';
  }
  if (COLOR_SAMPLE_MEASUREMENT_PATHS.has(path)) {
    return validateColorSample(measurement.value);
  }
  if (path === 'color.personalColor') {
    return validatePersonalColorSummary(measurement.value);
  }
  return isFiniteNumber(measurement.value);
}

function validateVerticalThirdsSummary(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !['full_success', 'partial_success', 'blocked', 'failed'].includes(
      String(value.status),
    ) ||
    !isFiniteOrNull(value.confidence) ||
    !isRecord(value.displayRatio) ||
    !isFiniteNumber(value.displayRatio.lower) ||
    !isFiniteNumber(value.displayRatio.middle) ||
    !isFiniteOrNull(value.displayRatio.upper) ||
    !isRecord(value.hairline) ||
    !isFiniteOrNull(value.hairline.confidence) ||
    !(value.hairline.provider === null || isShortString(value.hairline.provider)) ||
    !isShortString(value.summary, true)
  ) {
    return false;
  }

  return (
    value.dominantPart === null ||
    ['upper', 'middle', 'lower', 'balanced', 'unknown'].includes(
      String(value.dominantPart),
    )
  );
}

function validateExistingAnalysis(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.verticalThirds === null ||
      validateVerticalThirdsSummary(value.verticalThirds)) &&
    (value.personalColor === null || validatePersonalColorSummary(value.personalColor))
  );
}

function validateProvenance(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.landmarkProvider === 'unity_homuler_mediapipe' &&
    isFiniteNumber(value.landmarkCount) &&
    value.landmarkCount >= 0 &&
    isShortString(value.landmarkIndexVersion) &&
    isShortString(value.classifierVersion) &&
    isShortString(value.pixelAnalyzerVersion) &&
    typeof value.trueDepthUsed === 'boolean' &&
    value.trainingUseAllowed === false
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) {
    return false;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth =
    month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  return (
    day >= 1 &&
    day <= daysInMonth &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59
  );
}

function isPipelineFailureCode(value: unknown): value is string {
  return isShortString(value) && PIPELINE_FAILURE_CODE_SET.has(value);
}

function serializeWithinLimit(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return (
      typeof serialized === 'string' && utf8ByteLength(serialized) <= MAX_PROFILE_BYTES
    );
  } catch {
    return false;
  }
}

export function parseFaceProfile(value: unknown): FaceProfileResult | null {
  if (
    !isRecord(value) ||
    !serializeWithinLimit(value) ||
    !validateTree(value) ||
    value.schemaVersion !== FACE_PROFILE_SCHEMA_VERSION ||
    !['full_success', 'partial_success', 'blocked', 'failed'].includes(
      String(value.status),
    ) ||
    !(
      value.statusReason === null ||
      (isShortString(value.statusReason) && value.statusReason.length > 0)
    ) ||
    !isUuid(value.captureId) ||
    !isIsoDate(value.createdAt) ||
    !isRecord(value.quality) ||
    !isRecord(value.color) ||
    !isRecord(value.faceBalance) ||
    !isRecord(value.eyesAndBrows) ||
    !isRecord(value.nose) ||
    !isRecord(value.mouth) ||
    !validateFaceShape(value.faceShape) ||
    !validateBeautyCore(value.beautyCoreFeatures) ||
    !validateExistingAnalysis(value.existingAnalysis) ||
    !isBoundedStringArray(value.warnings) ||
    !validateProvenance(value.provenance) ||
    !isBoundedStringArray(value.quality.blockingReasons)
  ) {
    return null;
  }

  for (const path of [
    ...FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS,
    ...FACE_PROFILE_OPTIONAL_MEASUREMENT_PATHS,
  ]) {
    if (!validateMeasurementValue(path, getPath(value, path))) {
      return null;
    }
  }

  const personalColorMeasurement = getPath(value, 'color.personalColor');
  if (
    !validateMeasurement(personalColorMeasurement) ||
    (personalColorMeasurement.value !== null &&
      !validatePersonalColorSummary(personalColorMeasurement.value))
  ) {
    return null;
  }

  const allRequiredAvailable = FACE_PROFILE_REQUIRED_MEASUREMENT_PATHS.every(
    path => getMeasurementValue(value, path) !== null,
  );
  const hasGeometryCore = GEOMETRY_CORE_PATHS.some(
    path => getMeasurementValue(value, path) !== null,
  );
  const hasColorCore = COLOR_CORE_PATHS.some(
    path => getMeasurementValue(value, path) !== null,
  );
  const blockingReasons = value.quality.blockingReasons;
  const faceShape = value.faceShape as Record<string, unknown>;

  if (blockingReasons.length > 0) {
    if (
      value.status !== 'blocked' ||
      !isShortString(value.statusReason) ||
      faceShape.status !== 'blocked'
    ) {
      return null;
    }
    return value as FaceProfileResult;
  }

  if (allRequiredAvailable) {
    if (
      value.status !== 'full_success' ||
      value.statusReason !== null ||
      faceShape.status === 'blocked'
    ) {
      return null;
    }
    return value as FaceProfileResult;
  }

  if (isPipelineFailureCode(value.statusReason)) {
    if (value.status !== 'failed' || faceShape.status !== 'blocked') {
      return null;
    }
    return value as FaceProfileResult;
  }

  if (hasGeometryCore || hasColorCore) {
    if (
      value.status !== 'partial_success' ||
      value.statusReason !== 'partial_measurements_unavailable' ||
      faceShape.status === 'blocked'
    ) {
      return null;
    }
    return value as FaceProfileResult;
  }

  return null;
}
