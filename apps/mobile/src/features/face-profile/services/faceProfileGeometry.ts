import type {
  FaceMeasurement,
  FaceMeasurementSource,
  FaceProfileBalance,
  FaceProfileEyesAndBrows,
  FaceProfileMouth,
  FaceProfileNose,
  FaceShapeNumericFeature,
  FaceShapeRuleFeatures,
  FaceVerticalThirdsSummary,
} from '../../../shared/types/faceProfile';
import {
  FACE_PROFILE_GEOMETRY_ANCHORS,
  FACE_PROFILE_GEOMETRY_REQUIRED_LANDMARKS,
  FACE_SHAPE_LANDMARKS,
} from '../constants/faceShapeLandmarks';
import {
  distance,
  midpoint,
  normalizedAsymmetry,
  polygonArea,
  polygonPerimeter,
  robustMean,
  rotateAround,
  type Point2D,
} from './faceProfileMath';

export type FaceLandmarkPoint = Point2D & {
  i: number;
  z?: number;
};

export type FacePose = {
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
};

type NativeDepthQuality = {
  accuracy: 'absolute' | 'relative';
  filtered: boolean;
  validSampleRatio: number;
  medianAbsoluteDeviationMeters: number;
  confidence: number;
};

type NativeDepthRatios = {
  faceLengthToCheekWidth?: number;
  jawWidthToCheekWidth?: number;
  chinWidthToCheekWidth?: number;
  foreheadWidthToCheekWidth?: number;
  interEyeToCheekWidth?: number;
  noseLengthToCheekWidth?: number;
};

export type NativeDepthSummary =
  | {
  status: 'ok';
  consumed: boolean;
  cameraDistanceMeters?: number;
  depthQuality: NativeDepthQuality;
  facePlane?: {
    pitchDeg: number;
    yawDeg: number;
    rollDeg: number;
    confidence: number;
  };
  ratios: NativeDepthRatios;
}
  | {
      status:
        | 'unsupported'
        | 'not_found'
        | 'expired'
        | 'invalid_landmarks'
        | 'insufficient_depth'
        | 'error';
      consumed: boolean;
    };

export type FaceProfileGeometryInput = {
  landmarks: FaceLandmarkPoint[];
  faceCount: number;
  imageWidth: number;
  imageHeight: number;
  mirrored: boolean;
  pose: FacePose | null;
  hairline?: FaceVerticalThirdsSummary | null;
  depth?: NativeDepthSummary | null;
};

export type FaceProfileGeometryResult = {
  faceBalance: FaceProfileBalance;
  eyesAndBrows: FaceProfileEyesAndBrows;
  nose: FaceProfileNose;
  mouth: FaceProfileMouth;
  ruleFeatures: FaceShapeRuleFeatures;
  warnings: string[];
};

const BALANCE_FIELDS = [
  'faceLengthToWidth',
  'faceLengthToCheekWidth',
  'upperThirdRatio',
  'middleThirdRatio',
  'lowerThirdRatio',
  'foreheadWidthToCheekWidth',
  'templeWidthToCheekWidth',
  'jawWidthToCheekWidth',
  'chinWidthToCheekWidth',
  'cheekToJawRatio',
  'cheekDominance',
  'jawlineLengthRatio',
  'jawAngleDeg',
  'jawWidthScore',
  'jawAngleScore',
  'jawSoftness',
  'chinPointedness',
  'contourRoundness',
  'foreheadDominance',
  'lowerFaceWeight',
  'contourAsymmetry',
] as const;

const EYE_AND_BROW_FIELDS = [
  'leftEyeAspectRatio',
  'rightEyeAspectRatio',
  'interEyeDistanceRatio',
  'leftEyeCanthalTiltDeg',
  'rightEyeCanthalTiltDeg',
  'leftBrowEyeDistanceRatio',
  'rightBrowEyeDistanceRatio',
  'leftBrowTiltDeg',
  'rightBrowTiltDeg',
  'eyeAsymmetry',
  'browAsymmetry',
] as const;

const NOSE_FIELDS = [
  'noseLengthRatio',
  'noseWidthRatio',
  'noseToMidfaceRatio',
  'noseTipToMouthRatio',
  'centerlineAsymmetry',
] as const;

const MOUTH_FIELDS = [
  'lipFullnessRatio',
  'mouthWidthRatio',
  'upperToLowerLipRatio',
  'leftCornerTiltDeg',
  'rightCornerTiltDeg',
  'mouthAsymmetry',
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings)];
}

function measured(
  value: number,
  options: {
    confidence?: number;
    source?: FaceMeasurementSource;
    warnings?: readonly string[];
  } = {},
): FaceMeasurement<number> {
  return {
    confidence: clamp01(options.confidence ?? 0.9),
    source: options.source ?? 'mediapipe_2d',
    value,
    warnings: uniqueWarnings(options.warnings ?? []),
  };
}

function unavailable(
  nullReason: string,
  options: {
    source?: FaceMeasurementSource;
    warnings?: readonly string[];
  } = {},
): FaceMeasurement<number> {
  return {
    confidence: 0,
    nullReason,
    source: options.source ?? 'mediapipe_2d',
    value: null,
    warnings: uniqueWarnings(options.warnings ?? []),
  };
}

function unavailableRecord<const Names extends readonly string[]>(
  names: Names,
  reason: string,
): {[Name in Names[number]]: FaceMeasurement<number>} {
  return Object.fromEntries(
    names.map(name => [name, unavailable(reason, {warnings: [reason]})]),
  ) as {[Name in Names[number]]: FaceMeasurement<number>};
}

function emptyRuleFeatures(): FaceShapeRuleFeatures {
  return {
    cheekDominance: null,
    chinPointedness: null,
    chinWidthToCheekWidth: null,
    confidenceByFeature: {},
    contourAsymmetry: null,
    contourRoundness: null,
    faceLengthToCheekWidth: null,
    faceLengthToWidth: null,
    foreheadDominance: null,
    foreheadWidthToCheekWidth: null,
    jawAngleDeg: null,
    jawAngleScore: null,
    jawSoftness: null,
    jawWidthScore: null,
    jawWidthToCheekWidth: null,
    lowerFaceWeight: null,
    templeWidthToCheekWidth: null,
  };
}

function unavailableResult(reason: string): FaceProfileGeometryResult {
  return {
    eyesAndBrows: unavailableRecord(EYE_AND_BROW_FIELDS, reason),
    faceBalance: unavailableRecord(BALANCE_FIELDS, reason),
    mouth: unavailableRecord(MOUTH_FIELDS, reason),
    nose: unavailableRecord(NOSE_FIELDS, reason),
    ruleFeatures: emptyRuleFeatures(),
    warnings: [reason],
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

function normalizedLandmarkMap(
  input: FaceProfileGeometryInput,
): Map<number, FaceLandmarkPoint> {
  const finiteLandmarks = input.landmarks.filter(
    point => point && Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  const coordinatesAreNormalized = finiteLandmarks.every(
    point => Math.abs(point.x) <= 2 && Math.abs(point.y) <= 2,
  );
  const center = {x: input.imageWidth / 2, y: input.imageHeight / 2};
  const uprightRollDeg = input.mirrored
    ? -(input.pose?.rollDeg ?? 0)
    : input.pose?.rollDeg ?? 0;
  const result = new Map<number, FaceLandmarkPoint>();

  input.landmarks.forEach((point, arrayIndex) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    const index = Number.isInteger(point.i) ? point.i : arrayIndex;
    let normalizedPoint: FaceLandmarkPoint = {
      ...point,
      i: index,
      x: coordinatesAreNormalized ? point.x * input.imageWidth : point.x,
      y: coordinatesAreNormalized ? point.y * input.imageHeight : point.y,
    };
    if (input.mirrored) {
      normalizedPoint = {
        ...normalizedPoint,
        x: input.imageWidth - normalizedPoint.x,
      };
    }
    if (uprightRollDeg !== 0) {
      normalizedPoint = {
        ...normalizedPoint,
        ...rotateAround(normalizedPoint, center, -uprightRollDeg),
      };
    }
    result.set(index, normalizedPoint);
  });

  return result;
}

function getPoint(
  landmarks: ReadonlyMap<number, FaceLandmarkPoint>,
  index: number,
): FaceLandmarkPoint {
  const point = landmarks.get(index);
  if (!point) {
    throw new Error(`Required landmark ${index} was not normalized`);
  }
  return point;
}

function getPoints(
  landmarks: ReadonlyMap<number, FaceLandmarkPoint>,
  indices: readonly number[],
): FaceLandmarkPoint[] {
  return indices.map(index => getPoint(landmarks, index));
}

function averagePoint(points: readonly Point2D[]): Point2D {
  const x = robustMean(points.map(point => point.x));
  const y = robustMean(points.map(point => point.y));
  return {x: x ?? 0, y: y ?? 0};
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

function ratioMeasurement(
  numerator: number,
  denominator: number,
  confidence = 0.9,
): FaceMeasurement<number> {
  const ratio = safeRatio(numerator, denominator);
  return ratio === null
    ? unavailable('reference_length_unavailable')
    : measured(ratio, {confidence});
}

function eyeAspectRatio(
  landmarks: ReadonlyMap<number, FaceLandmarkPoint>,
  indices: readonly [number, number, number, number, number, number],
): number | null {
  const [outer, upperOuter, upperInner, inner, lowerInner, lowerOuter] = getPoints(
    landmarks,
    indices,
  );
  const width = distance(outer, inner);
  const height = robustMean([
    distance(upperOuter, lowerOuter),
    distance(upperInner, lowerInner),
  ]);
  return height === null ? null : safeRatio(height, width);
}

function outwardTiltDeg(inner: Point2D, outer: Point2D): number {
  return (Math.atan2(-(outer.y - inner.y), Math.abs(outer.x - inner.x)) * 180) /
    Math.PI;
}

function angleAt(vertex: Point2D, first: Point2D, second: Point2D): number {
  const firstVector = {x: first.x - vertex.x, y: first.y - vertex.y};
  const secondVector = {x: second.x - vertex.x, y: second.y - vertex.y};
  const denominator = Math.hypot(firstVector.x, firstVector.y) *
    Math.hypot(secondVector.x, secondVector.y);
  if (denominator === 0) {
    return 0;
  }
  const cosine = Math.min(
    1,
    Math.max(
      -1,
      (firstVector.x * secondVector.x + firstVector.y * secondVector.y) /
        denominator,
    ),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function isHairlineAvailable(
  hairline: FaceVerticalThirdsSummary | null | undefined,
): boolean {
  return Boolean(
    hairline &&
      hairline.status !== 'blocked' &&
      hairline.status !== 'failed' &&
      hairline.displayRatio.upper !== null &&
      Number.isFinite(hairline.displayRatio.upper) &&
      (hairline.hairline.confidence ?? hairline.confidence ?? 0) >= 0.5,
  );
}

function hasHairlineOcclusionWarning(
  hairline: FaceVerticalThirdsSummary | null | undefined,
): boolean {
  return Boolean(hairline && /(앞머리|가림|bang|occlu)/i.test(hairline.summary));
}

type NativeDepthOkSummary = Extract<NativeDepthSummary, {status: 'ok'}>;

function depthCanOverride(
  depth: NativeDepthSummary | null | undefined,
): depth is NativeDepthOkSummary {
  return Boolean(
    depth?.status === 'ok' &&
      depth.depthQuality &&
      depth.depthQuality.confidence >= 0.7 &&
      depth.depthQuality.validSampleRatio >= 0.65,
  );
}

function withDepthRatio(
  measurement: FaceMeasurement<number>,
  depthValue: number | undefined,
  depth: NativeDepthSummary | null | undefined,
): FaceMeasurement<number> {
  if (
    measurement.value === null ||
    !depthCanOverride(depth) ||
    !Number.isFinite(depthValue)
  ) {
    return measurement;
  }
  return measured(depthValue as number, {
    confidence: depth.depthQuality.confidence,
    source: 'truedepth_3d',
  });
}

function ruleFeaturesFromBalance(
  balance: FaceProfileBalance,
): FaceShapeRuleFeatures {
  const measurementByFeature: Record<
    FaceShapeNumericFeature,
    FaceMeasurement<number>
  > = {
    cheekDominance: balance.cheekDominance,
    chinPointedness: balance.chinPointedness,
    chinWidthToCheekWidth: balance.chinWidthToCheekWidth,
    contourAsymmetry: balance.contourAsymmetry,
    contourRoundness: balance.contourRoundness,
    faceLengthToCheekWidth: balance.faceLengthToCheekWidth,
    faceLengthToWidth: balance.faceLengthToWidth,
    foreheadDominance: balance.foreheadDominance,
    foreheadWidthToCheekWidth: balance.foreheadWidthToCheekWidth,
    jawAngleDeg: balance.jawAngleDeg,
    jawAngleScore: balance.jawAngleScore,
    jawSoftness: balance.jawSoftness,
    jawWidthScore: balance.jawWidthScore,
    jawWidthToCheekWidth: balance.jawWidthToCheekWidth,
    lowerFaceWeight: balance.lowerFaceWeight,
    templeWidthToCheekWidth: balance.templeWidthToCheekWidth,
  };
  const confidenceByFeature: Partial<Record<FaceShapeNumericFeature, number>> = {};
  for (const [feature, measurement] of Object.entries(measurementByFeature) as Array<
    [FaceShapeNumericFeature, FaceMeasurement<number>]
  >) {
    if (measurement.value !== null) {
      confidenceByFeature[feature] = measurement.confidence;
    }
  }

  return {
    ...Object.fromEntries(
      Object.entries(measurementByFeature).map(([feature, measurement]) => [
        feature,
        measurement.value,
      ]),
    ) as Record<FaceShapeNumericFeature, number | null>,
    confidenceByFeature,
  };
}

export function extractFaceProfileGeometry(
  input: FaceProfileGeometryInput,
): FaceProfileGeometryResult {
  if (input.faceCount !== 1) {
    return unavailableResult(input.faceCount === 0 ? 'face_not_detected' : 'multiple_faces');
  }
  if (!isFinitePose(input.pose)) {
    return unavailableResult('pose_unavailable');
  }
  if (
    !Number.isFinite(input.imageWidth) ||
    !Number.isFinite(input.imageHeight) ||
    input.imageWidth <= 0 ||
    input.imageHeight <= 0
  ) {
    return unavailableResult('image_dimensions_invalid');
  }

  const landmarks = normalizedLandmarkMap(input);
  if (
    !FACE_PROFILE_GEOMETRY_REQUIRED_LANDMARKS.every(index => landmarks.has(index))
  ) {
    return unavailableResult('landmarks_incomplete');
  }

  const warnings: string[] = [];
  if (input.pose.rollDeg !== 0) {
    warnings.push('roll_corrected');
  }

  const cheekWidth = distance(
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.cheekWidth[0]),
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.cheekWidth[1]),
  );
  if (cheekWidth <= 0) {
    return unavailableResult('reference_length_unavailable');
  }

  const faceLength = distance(
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.faceLength[0]),
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.faceLength[1]),
  );
  const templeWidth = distance(
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.templeWidth[0]),
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.templeWidth[1]),
  );
  const jawWidth = distance(
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.jawWidth[0]),
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.jawWidth[1]),
  );
  const chinWidth = distance(
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.chinWidth[0]),
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.chinWidth[1]),
  );
  const faceOval = getPoints(landmarks, FACE_SHAPE_LANDMARKS.faceOval);
  const contourPerimeter = polygonPerimeter(faceOval);
  const contourArea = polygonArea(faceOval);
  const contourRoundness = contourPerimeter > 0
    ? clamp01((4 * Math.PI * contourArea) / contourPerimeter ** 2)
    : 0;
  const leftJawPoints = getPoints(landmarks, [
    234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152,
  ]);
  const rightJawPoints = getPoints(landmarks, [
    454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  ]);
  const leftJawLength = leftJawPoints
    .slice(1)
    .reduce(
      (sum, point, index) => sum + distance(leftJawPoints[index], point),
      0,
    );
  const rightJawLength = rightJawPoints
    .slice(1)
    .reduce(
      (sum, point, index) => sum + distance(rightJawPoints[index], point),
      0,
    );
  const jawAngle = robustMean([
    angleAt(
      getPoint(landmarks, 172),
      getPoint(landmarks, 58),
      getPoint(landmarks, 152),
    ),
    angleAt(
      getPoint(landmarks, 397),
      getPoint(landmarks, 288),
      getPoint(landmarks, 152),
    ),
  ]) ?? 0;
  const jawWidthScore = safeRatio(jawWidth, cheekWidth) ?? 0;
  const jawAngleScore = clamp01(jawAngle / 180);
  const chinPointedness = clamp01(1 - (safeRatio(chinWidth, jawWidth) ?? 1));
  const jawSoftness = clamp01((jawAngleScore + contourRoundness) / 2);
  const glabella = getPoint(landmarks, 168);
  const subnasale = getPoint(landmarks, 2);
  const menton = getPoint(landmarks, 152);
  const middleThirdLength = distance(glabella, subnasale);
  const lowerThirdLength = distance(subnasale, menton);
  const lowerFaceWeight = clamp01(safeRatio(lowerThirdLength, faceLength) ?? 0);

  let foreheadWidth: FaceMeasurement<number>;
  if (!isHairlineAvailable(input.hairline)) {
    foreheadWidth = unavailable('hairline_unavailable', {
      source: 'estimated',
      warnings: ['hairline_unavailable'],
    });
    warnings.push('hairline_unavailable');
  } else if (hasHairlineOcclusionWarning(input.hairline)) {
    foreheadWidth = unavailable('hairline_occluded', {
      source: 'estimated',
      warnings: ['hairline_occluded'],
    });
    warnings.push('hairline_occluded');
  } else {
    const fallbackWidth = distance(
      getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.foreheadWidthFallback[0]),
      getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.foreheadWidthFallback[1]),
    );
    foreheadWidth = measured(fallbackWidth / cheekWidth, {
      confidence: Math.min(
        input.hairline?.hairline.confidence ?? input.hairline?.confidence ?? 0.5,
        0.6,
      ),
      source: 'estimated',
      warnings: ['forehead_width_estimated_from_face_oval'],
    });
    warnings.push('forehead_width_estimated_from_face_oval');
  }

  const upperThirdRatio = isHairlineAvailable(input.hairline)
    ? measured(input.hairline?.displayRatio.upper as number, {
        confidence: input.hairline?.hairline.confidence ?? input.hairline?.confidence ?? 0.5,
        source: input.hairline?.hairline.provider === 'apple_semantic_matte'
          ? 'apple_semantic_matte'
          : 'estimated',
      })
    : unavailable('hairline_unavailable', {
        source: 'estimated',
        warnings: ['hairline_unavailable'],
      });
  const middleThirdRatio = measured(1, {confidence: 0.88});
  const lowerThirdRatio = ratioMeasurement(lowerThirdLength, middleThirdLength, 0.88);
  const foreheadDominance = foreheadWidth.value === null
    ? unavailable(foreheadWidth.nullReason ?? 'hairline_unavailable', {
        source: foreheadWidth.source,
        warnings: foreheadWidth.warnings,
      })
    : measured(
        clamp01(0.5 + (foreheadWidth.value - jawWidthScore) / 2),
        {
          confidence: foreheadWidth.confidence,
          source: foreheadWidth.source,
          warnings: foreheadWidth.warnings,
        },
      );

  let faceLengthToWidth = ratioMeasurement(faceLength, cheekWidth);
  let faceLengthToCheekWidth = ratioMeasurement(faceLength, cheekWidth);
  let jawWidthToCheekWidth = ratioMeasurement(jawWidth, cheekWidth);
  let chinWidthToCheekWidth = ratioMeasurement(chinWidth, cheekWidth);
  let foreheadWidthToCheekWidth = foreheadWidth;
  const templeWidthToCheekWidth = ratioMeasurement(templeWidth, cheekWidth);

  const leftEyeAspectRatioValue = eyeAspectRatio(
    landmarks,
    FACE_SHAPE_LANDMARKS.leftEyeContour,
  );
  const rightEyeAspectRatioValue = eyeAspectRatio(
    landmarks,
    FACE_SHAPE_LANDMARKS.rightEyeContour,
  );
  const leftEyeAspectRatio = leftEyeAspectRatioValue === null
    ? unavailable('eye_geometry_unavailable')
    : measured(leftEyeAspectRatioValue);
  const rightEyeAspectRatio = rightEyeAspectRatioValue === null
    ? unavailable('eye_geometry_unavailable')
    : measured(rightEyeAspectRatioValue);
  const leftIrisCenter = averagePoint(
    getPoints(landmarks, FACE_SHAPE_LANDMARKS.leftIris),
  );
  const rightIrisCenter = averagePoint(
    getPoints(landmarks, FACE_SHAPE_LANDMARKS.rightIris),
  );
  let interEyeDistanceRatio = ratioMeasurement(
    distance(leftIrisCenter, rightIrisCenter),
    cheekWidth,
    0.92,
  );
  const leftEyeCanthalTilt = outwardTiltDeg(
    getPoint(landmarks, 133),
    getPoint(landmarks, 33),
  );
  const rightEyeCanthalTilt = outwardTiltDeg(
    getPoint(landmarks, 362),
    getPoint(landmarks, 263),
  );
  const leftEyeCenter = midpoint(getPoint(landmarks, 33), getPoint(landmarks, 133));
  const rightEyeCenter = midpoint(
    getPoint(landmarks, 362),
    getPoint(landmarks, 263),
  );
  const leftBrowCenter = averagePoint(
    getPoints(landmarks, FACE_SHAPE_LANDMARKS.leftBrow),
  );
  const rightBrowCenter = averagePoint(
    getPoints(landmarks, FACE_SHAPE_LANDMARKS.rightBrow),
  );
  const leftBrowDistance = distance(leftEyeCenter, leftBrowCenter) / cheekWidth;
  const rightBrowDistance = distance(rightEyeCenter, rightBrowCenter) / cheekWidth;
  const leftBrowTilt = outwardTiltDeg(
    getPoint(landmarks, 55),
    getPoint(landmarks, 46),
  );
  const rightBrowTilt = outwardTiltDeg(
    getPoint(landmarks, 285),
    getPoint(landmarks, 276),
  );

  const noseLength = distance(glabella, getPoint(landmarks, 4));
  const noseWidth = distance(getPoint(landmarks, 129), getPoint(landmarks, 358));
  const noseTip = getPoint(landmarks, 4);
  const mouthCenter = midpoint(getPoint(landmarks, 13), getPoint(landmarks, 14));
  let noseLengthRatio = ratioMeasurement(noseLength, cheekWidth);
  const noseWidthRatio = ratioMeasurement(noseWidth, cheekWidth);
  const noseToMidfaceRatio = ratioMeasurement(noseLength, middleThirdLength);
  const noseTipToMouthRatio = ratioMeasurement(
    distance(noseTip, mouthCenter),
    cheekWidth,
  );
  const faceCenterX = midpoint(
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.cheekWidth[0]),
    getPoint(landmarks, FACE_PROFILE_GEOMETRY_ANCHORS.cheekWidth[1]),
  ).x;
  const centerlineAsymmetry = measured(
    Math.abs(noseTip.x - faceCenterX) / cheekWidth,
  );

  const mouthLeft = getPoint(landmarks, 61);
  const mouthRight = getPoint(landmarks, 291);
  const mouthWidth = distance(mouthLeft, mouthRight);
  const lipFullness = distance(getPoint(landmarks, 0), getPoint(landmarks, 17));
  const upperLipThickness = distance(getPoint(landmarks, 0), getPoint(landmarks, 13));
  const lowerLipThickness = distance(getPoint(landmarks, 14), getPoint(landmarks, 17));
  const leftCornerTilt = outwardTiltDeg(mouthCenter, mouthLeft);
  const rightCornerTilt = outwardTiltDeg(mouthCenter, mouthRight);

  if (depthCanOverride(input.depth)) {
    const ratios = input.depth.ratios;
    faceLengthToWidth = withDepthRatio(
      faceLengthToWidth,
      ratios?.faceLengthToCheekWidth,
      input.depth,
    );
    faceLengthToCheekWidth = withDepthRatio(
      faceLengthToCheekWidth,
      ratios?.faceLengthToCheekWidth,
      input.depth,
    );
    jawWidthToCheekWidth = withDepthRatio(
      jawWidthToCheekWidth,
      ratios?.jawWidthToCheekWidth,
      input.depth,
    );
    chinWidthToCheekWidth = withDepthRatio(
      chinWidthToCheekWidth,
      ratios?.chinWidthToCheekWidth,
      input.depth,
    );
    foreheadWidthToCheekWidth = withDepthRatio(
      foreheadWidthToCheekWidth,
      ratios?.foreheadWidthToCheekWidth,
      input.depth,
    );
    interEyeDistanceRatio = withDepthRatio(
      interEyeDistanceRatio,
      ratios?.interEyeToCheekWidth,
      input.depth,
    );
    noseLengthRatio = withDepthRatio(
      noseLengthRatio,
      ratios?.noseLengthToCheekWidth,
      input.depth,
    );
  } else if (input.depth) {
    warnings.push('depth_quality_insufficient');
  }

  const faceBalance: FaceProfileBalance = {
    cheekDominance: measured(clamp01(1 - jawWidthScore)),
    cheekToJawRatio: ratioMeasurement(cheekWidth, jawWidth),
    chinPointedness: measured(chinPointedness),
    chinWidthToCheekWidth,
    contourAsymmetry: measured(
      normalizedAsymmetry(leftJawLength, rightJawLength),
    ),
    contourRoundness: measured(contourRoundness),
    faceLengthToCheekWidth,
    faceLengthToWidth,
    foreheadDominance,
    foreheadWidthToCheekWidth,
    jawAngleDeg: measured(jawAngle),
    jawAngleScore: measured(jawAngleScore),
    jawSoftness: measured(jawSoftness),
    jawWidthScore: measured(clamp01(jawWidthScore)),
    jawWidthToCheekWidth,
    jawlineLengthRatio: ratioMeasurement(
      (leftJawLength + rightJawLength) / 2,
      cheekWidth,
    ),
    lowerFaceWeight: measured(lowerFaceWeight),
    lowerThirdRatio,
    middleThirdRatio,
    templeWidthToCheekWidth,
    upperThirdRatio,
  };

  const eyesAndBrows: FaceProfileEyesAndBrows = {
    browAsymmetry: measured(normalizedAsymmetry(leftBrowDistance, rightBrowDistance)),
    eyeAsymmetry: measured(
      normalizedAsymmetry(
        leftEyeAspectRatio.value ?? 0,
        rightEyeAspectRatio.value ?? 0,
      ),
    ),
    interEyeDistanceRatio,
    leftBrowEyeDistanceRatio: measured(leftBrowDistance),
    leftBrowTiltDeg: measured(leftBrowTilt),
    leftEyeAspectRatio,
    leftEyeCanthalTiltDeg: measured(leftEyeCanthalTilt),
    rightBrowEyeDistanceRatio: measured(rightBrowDistance),
    rightBrowTiltDeg: measured(rightBrowTilt),
    rightEyeAspectRatio,
    rightEyeCanthalTiltDeg: measured(rightEyeCanthalTilt),
  };

  const nose: FaceProfileNose = {
    centerlineAsymmetry,
    noseLengthRatio,
    noseTipToMouthRatio,
    noseToMidfaceRatio,
    noseWidthRatio,
  };

  const mouth: FaceProfileMouth = {
    leftCornerTiltDeg: measured(leftCornerTilt),
    lipFullnessRatio: ratioMeasurement(lipFullness, mouthWidth),
    mouthAsymmetry: measured(
      normalizedAsymmetry(
        distance(mouthCenter, mouthLeft),
        distance(mouthCenter, mouthRight),
      ),
    ),
    mouthWidthRatio: ratioMeasurement(mouthWidth, cheekWidth),
    rightCornerTiltDeg: measured(rightCornerTilt),
    upperToLowerLipRatio: ratioMeasurement(
      upperLipThickness,
      lowerLipThickness,
    ),
  };

  return {
    eyesAndBrows,
    faceBalance,
    mouth,
    nose,
    ruleFeatures: ruleFeaturesFromBalance(faceBalance),
    warnings: uniqueWarnings(warnings),
  };
}
