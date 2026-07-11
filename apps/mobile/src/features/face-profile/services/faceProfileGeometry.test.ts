import type {
  FaceMeasurement,
  FaceVerticalThirdsSummary,
} from '../../../shared/types/faceProfile';
import {
  FACE_PROFILE_GEOMETRY_REQUIRED_LANDMARKS,
  FACE_SHAPE_LANDMARKS,
} from '../constants/faceShapeLandmarks';
import {rotateAround} from './faceProfileMath';
import {
  extractFaceProfileGeometry,
  type FaceProfileExifOrientation,
  type FaceLandmarkPoint,
  type FaceProfileGeometryInput,
  type NativeDepthSummary,
} from './faceProfileGeometry';

const assert = {
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(expected)}`,
      );
    }
  },
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
  ok(value: unknown, message = 'Expected value to be truthy') {
    if (!value) {
      throw new Error(message);
    }
  },
};

const assertCloseTo = (actual: number, expected: number, epsilon: number) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );

type GeometryFixtureName =
  | 'round_symmetric'
  | 'long_narrow'
  | 'square_jaw'
  | 'heart'
  | 'diamond'
  | 'triangle';

type TestExifOrientation = FaceProfileExifOrientation;

type GeometryInputWithTransientSeams = FaceProfileGeometryInput;

const IMAGE_LEFT_BROW = [46, 53, 52, 65, 55] as const;
const IMAGE_LEFT_IRIS = [468, 469, 470, 471, 472] as const;
const IMAGE_RIGHT_BROW = [276, 283, 282, 295, 285] as const;
const IMAGE_RIGHT_IRIS = [473, 474, 475, 476, 477] as const;

const HAIRLINE: FaceVerticalThirdsSummary = {
  confidence: 0.86,
  displayRatio: {lower: 1.02, middle: 1, upper: 0.98},
  dominantPart: 'balanced',
  hairline: {confidence: 0.84, provider: 'apple_semantic_matte'},
  status: 'full_success',
  summary: '상중하안부가 균형에 가까워요.',
};

const FIXTURE_CONFIG: Record<
  GeometryFixtureName,
  {faceRx: number; faceRy: number; upperScale: number; jawScale: number}
> = {
  diamond: {faceRx: 310, faceRy: 410, upperScale: 0.82, jawScale: 0.78},
  heart: {faceRx: 300, faceRy: 405, upperScale: 1.04, jawScale: 0.72},
  long_narrow: {faceRx: 235, faceRy: 470, upperScale: 0.96, jawScale: 0.88},
  round_symmetric: {faceRx: 310, faceRy: 355, upperScale: 0.97, jawScale: 0.88},
  square_jaw: {faceRx: 310, faceRy: 405, upperScale: 0.98, jawScale: 0.98},
  triangle: {faceRx: 295, faceRy: 405, upperScale: 0.78, jawScale: 1.04},
};

function setPoint(
  landmarks: FaceLandmarkPoint[],
  index: number,
  x: number,
  y: number,
) {
  landmarks[index] = {i: index, x, y, z: 0};
}

function buildFixture(name: GeometryFixtureName): FaceProfileGeometryInput {
  const imageWidth = 1000;
  const imageHeight = 1200;
  const centerX = imageWidth / 2;
  const centerY = 585;
  const config = FIXTURE_CONFIG[name];
  const landmarks = new Array<FaceLandmarkPoint>(478);

  FACE_SHAPE_LANDMARKS.faceOval.forEach((index, position, all) => {
    const theta = -Math.PI / 2 + (position / all.length) * Math.PI * 2;
    const verticalPosition = (Math.sin(theta) + 1) / 2;
    const halfWidthScale =
      verticalPosition < 0.38
        ? config.upperScale
        : verticalPosition > 0.64
          ? config.jawScale
          : 1;
    setPoint(
      landmarks,
      index,
      centerX + Math.cos(theta) * config.faceRx * halfWidthScale,
      centerY + Math.sin(theta) * config.faceRy,
    );
  });

  const eyeHalfGap = config.faceRx * 0.42;
  const eyeHalfWidth = config.faceRx * 0.22;
  const eyeY = centerY - config.faceRy * 0.19;
  const eyeHeight = Math.max(25, config.faceRy * 0.075);
  const leftEyeCenterX = centerX - eyeHalfGap;
  const rightEyeCenterX = centerX + eyeHalfGap;

  [
    [33, leftEyeCenterX - eyeHalfWidth, eyeY - 4],
    [160, leftEyeCenterX - eyeHalfWidth * 0.45, eyeY - eyeHeight],
    [158, leftEyeCenterX + eyeHalfWidth * 0.45, eyeY - eyeHeight * 0.9],
    [133, leftEyeCenterX + eyeHalfWidth, eyeY + 3],
    [153, leftEyeCenterX + eyeHalfWidth * 0.45, eyeY + eyeHeight],
    [144, leftEyeCenterX - eyeHalfWidth * 0.45, eyeY + eyeHeight * 0.92],
    [362, rightEyeCenterX - eyeHalfWidth, eyeY + 3],
    [385, rightEyeCenterX - eyeHalfWidth * 0.45, eyeY - eyeHeight * 0.9],
    [387, rightEyeCenterX + eyeHalfWidth * 0.45, eyeY - eyeHeight],
    [263, rightEyeCenterX + eyeHalfWidth, eyeY - 4],
    [373, rightEyeCenterX + eyeHalfWidth * 0.45, eyeY + eyeHeight * 0.92],
    [380, rightEyeCenterX - eyeHalfWidth * 0.45, eyeY + eyeHeight],
  ].forEach(([index, x, y]) => setPoint(landmarks, index, x, y));

  IMAGE_LEFT_IRIS.forEach((index, offset) => {
    const theta = (offset / IMAGE_LEFT_IRIS.length) * Math.PI * 2;
    setPoint(
      landmarks,
      index,
      leftEyeCenterX + Math.cos(theta) * 10,
      eyeY + Math.sin(theta) * 10,
    );
  });
  IMAGE_RIGHT_IRIS.forEach((index, offset) => {
    const theta = (offset / IMAGE_RIGHT_IRIS.length) * Math.PI * 2;
    setPoint(
      landmarks,
      index,
      rightEyeCenterX + Math.cos(theta) * 10,
      eyeY + Math.sin(theta) * 10,
    );
  });

  const browY = eyeY - eyeHeight * 2.1;
  IMAGE_LEFT_BROW.forEach((index, offset, all) => {
    const progress = offset / (all.length - 1);
    setPoint(
      landmarks,
      index,
      leftEyeCenterX - eyeHalfWidth + progress * eyeHalfWidth * 2,
      browY - Math.sin(progress * Math.PI) * 9,
    );
  });
  IMAGE_RIGHT_BROW.forEach((index, offset, all) => {
    const progress = offset / (all.length - 1);
    setPoint(
      landmarks,
      index,
      rightEyeCenterX + eyeHalfWidth - progress * eyeHalfWidth * 2,
      browY - Math.sin(progress * Math.PI) * 9,
    );
  });

  const noseTopY = eyeY + 5;
  const noseTipY = centerY + config.faceRy * 0.18;
  [
    [168, centerX, noseTopY],
    [6, centerX, noseTopY + (noseTipY - noseTopY) * 0.2],
    [197, centerX - 3, noseTopY + (noseTipY - noseTopY) * 0.4],
    [195, centerX + 2, noseTopY + (noseTipY - noseTopY) * 0.58],
    [5, centerX, noseTopY + (noseTipY - noseTopY) * 0.74],
    [4, centerX, noseTipY - 12],
    [129, centerX - config.faceRx * 0.12, noseTipY],
    [358, centerX + config.faceRx * 0.12, noseTipY],
    [2, centerX, noseTipY + 10],
  ].forEach(([index, x, y]) => setPoint(landmarks, index, x, y));

  const mouthY = centerY + config.faceRy * 0.42;
  const mouthHalfWidth = config.faceRx * 0.28;
  [
    [61, centerX - mouthHalfWidth, mouthY - 2],
    [291, centerX + mouthHalfWidth, mouthY - 2],
    [13, centerX, mouthY - 11],
    [14, centerX, mouthY + 10],
    [78, centerX - mouthHalfWidth * 0.72, mouthY - 6],
    [308, centerX + mouthHalfWidth * 0.72, mouthY - 6],
    [0, centerX, mouthY - 23],
    [17, centerX, mouthY + 25],
  ].forEach(([index, x, y]) => setPoint(landmarks, index, x, y));

  return {
    faceCount: 1,
    hairline: HAIRLINE,
    imageHeight,
    imageWidth,
    landmarks,
    mirrored: false,
    pose: {pitchDeg: 0, rollDeg: 0, yawDeg: 0},
  };
}

function mirrorFixture(input: FaceProfileGeometryInput): FaceProfileGeometryInput {
  return {
    ...input,
    landmarks: input.landmarks.map(point =>
      point ? {...point, x: input.imageWidth - point.x} : point,
    ),
    mirrored: !input.mirrored,
    pose: input.pose
      ? {...input.pose, rollDeg: -input.pose.rollDeg}
      : null,
  };
}

function rollFixture(
  input: FaceProfileGeometryInput,
  rollDeg: number,
): FaceProfileGeometryInput {
  const center = {x: input.imageWidth / 2, y: input.imageHeight / 2};
  return {
    ...input,
    landmarks: input.landmarks.map(point => {
      if (!point) {
        return point;
      }
      return {...point, ...rotateAround(point, center, rollDeg)};
    }),
    pose: {pitchDeg: 0, rollDeg, yawDeg: 0},
  };
}

function exifFixture(
  input: FaceProfileGeometryInput,
  exifOrientation: TestExifOrientation,
): GeometryInputWithTransientSeams {
  const uprightWidth = input.imageWidth;
  const uprightHeight = input.imageHeight;
  const storedDimensions = exifOrientation === 6 || exifOrientation === 8
    ? {height: uprightWidth, width: uprightHeight}
    : {height: uprightHeight, width: uprightWidth};
  const toStoredPoint = (point: FaceLandmarkPoint): FaceLandmarkPoint => {
    switch (exifOrientation) {
      case 3:
        return {
          ...point,
          x: uprightWidth - point.x,
          y: uprightHeight - point.y,
        };
      case 6:
        return {...point, x: point.y, y: uprightWidth - point.x};
      case 8:
        return {...point, x: uprightHeight - point.y, y: point.x};
      default:
        return {...point};
    }
  };

  return {
    ...input,
    imageHeight: storedDimensions.height,
    imageWidth: storedDimensions.width,
    landmarks: input.landmarks.map(point =>
      point ? toStoredPoint(point) : point,
    ),
    originalToUpright: {exifOrientation},
  };
}

function rounded(value: unknown): unknown {
  if (typeof value === 'number') {
    return Math.round(value * 1e8) / 1e8;
  }
  if (Array.isArray(value)) {
    return value.map(rounded);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rounded(item)]),
    );
  }
  return value;
}

function mirrorGeometry<T>(value: T): unknown {
  return rounded(value);
}

function assertMeasurement(measurement: FaceMeasurement<unknown>, path: string) {
  assert.ok(
    Number.isFinite(measurement.confidence) &&
      measurement.confidence >= 0 &&
      measurement.confidence <= 1,
    `${path} must have a bounded confidence`,
  );
  assert.ok(Array.isArray(measurement.warnings), `${path} must have warnings`);
  if (measurement.value === null) {
    assert.ok(
      typeof measurement.nullReason === 'string' && measurement.nullReason.length > 0,
      `${path} must have a non-empty nullReason`,
    );
  } else if (typeof measurement.value === 'number') {
    assert.ok(Number.isFinite(measurement.value), `${path} must be finite`);
  }
}

function assertPublicMeasurementsComplete(
  result: ReturnType<typeof extractFaceProfileGeometry>,
) {
  for (const [groupName, group] of Object.entries({
    eyesAndBrows: result.eyesAndBrows,
    faceBalance: result.faceBalance,
    mouth: result.mouth,
    nose: result.nose,
  })) {
    for (const [measurementName, measurement] of Object.entries(group)) {
      assertMeasurement(
        measurement as FaceMeasurement<unknown>,
        `${groupName}.${measurementName}`,
      );
    }
  }
}

assert.ok(FACE_PROFILE_GEOMETRY_REQUIRED_LANDMARKS.length > 0);
for (const group of Object.values(FACE_SHAPE_LANDMARKS)) {
  for (const index of group) {
    assert.ok(
      FACE_PROFILE_GEOMETRY_REQUIRED_LANDMARKS.includes(index),
      `Landmark ${index} must be part of the required geometry map`,
    );
  }
}

const baseFixture = buildFixture('round_symmetric');
assert.equal(baseFixture.landmarks.length, 478);
const baseResult = extractFaceProfileGeometry(baseFixture);
assertPublicMeasurementsComplete(baseResult);
assert.ok(baseResult.faceBalance.faceLengthToWidth.value !== null);
assert.ok(baseResult.faceBalance.contourAsymmetry.value !== null);
assert.ok(baseResult.eyesAndBrows.interEyeDistanceRatio.value !== null);

assert.deepEqual(FACE_SHAPE_LANDMARKS.leftEyeContour, [
  362, 385, 387, 263, 373, 380,
]);
assert.deepEqual(FACE_SHAPE_LANDMARKS.leftBrow, [276, 283, 282, 295, 285]);
assert.deepEqual(FACE_SHAPE_LANDMARKS.rightEyeContour, [
  33, 160, 158, 133, 153, 144,
]);
assert.deepEqual(FACE_SHAPE_LANDMARKS.rightBrow, [46, 53, 52, 65, 55]);

const asymmetricFixture = buildFixture('round_symmetric');
[
  [362, 580, 500],
  [385, 610, 440],
  [387, 675, 445],
  [263, 720, 480],
  [373, 675, 555],
  [380, 610, 560],
  [33, 280, 520],
  [160, 320, 485],
  [158, 380, 486],
  [133, 420, 500],
  [153, 380, 514],
  [144, 320, 515],
  [276, 720, 400],
  [283, 685, 402],
  [282, 650, 407],
  [295, 615, 418],
  [285, 580, 430],
  [46, 280, 460],
  [53, 315, 455],
  [52, 350, 450],
  [65, 385, 445],
  [55, 420, 440],
].forEach(([index, x, y]) =>
  setPoint(asymmetricFixture.landmarks, index, x, y),
);
const asymmetricResult = extractFaceProfileGeometry(asymmetricFixture);
assert.ok(
  (asymmetricResult.eyesAndBrows.leftEyeAspectRatio.value ?? 0) >
    (asymmetricResult.eyesAndBrows.rightEyeAspectRatio.value ?? 1),
  'Anatomical left eye must use the taller 362/263 contour',
);
assert.ok(
  (asymmetricResult.eyesAndBrows.leftEyeCanthalTiltDeg.value ?? -1) > 0,
  'Anatomical left eye tilt must use the 362/263 contour',
);
assert.ok(
  (asymmetricResult.eyesAndBrows.rightEyeCanthalTiltDeg.value ?? 1) < 0,
  'Anatomical right eye tilt must use the 33/133 contour',
);
assert.ok(
  (asymmetricResult.eyesAndBrows.leftBrowEyeDistanceRatio.value ?? 0) >
    (asymmetricResult.eyesAndBrows.rightBrowEyeDistanceRatio.value ?? 1),
  'Anatomical left brow distance must use the 276..285 cluster',
);
assert.ok(
  (asymmetricResult.eyesAndBrows.leftBrowTiltDeg.value ?? -1) > 0,
  'Anatomical left brow tilt must use the 276..285 cluster',
);
assert.ok(
  (asymmetricResult.eyesAndBrows.rightBrowTiltDeg.value ?? 1) < 0,
  'Anatomical right brow tilt must use the 46..55 cluster',
);

const mirroredResult = extractFaceProfileGeometry(mirrorFixture(baseFixture));
assert.deepEqual(rounded(mirroredResult), mirrorGeometry(baseResult));

const rolledResult = extractFaceProfileGeometry(rollFixture(baseFixture, 7));
assertCloseTo(
  rolledResult.faceBalance.faceLengthToWidth.value as number,
  baseResult.faceBalance.faceLengthToWidth.value as number,
  0.01,
);
assertCloseTo(
  rolledResult.eyesAndBrows.leftEyeCanthalTiltDeg.value as number,
  baseResult.eyesAndBrows.leftEyeCanthalTiltDeg.value as number,
  0.01,
);

const mirroredRolledResult = extractFaceProfileGeometry(
  mirrorFixture(rollFixture(baseFixture, 7)),
);
assertCloseTo(
  mirroredRolledResult.faceBalance.faceLengthToWidth.value as number,
  baseResult.faceBalance.faceLengthToWidth.value as number,
  0.01,
);
assertCloseTo(
  mirroredRolledResult.eyesAndBrows.leftEyeCanthalTiltDeg.value as number,
  baseResult.eyesAndBrows.leftEyeCanthalTiltDeg.value as number,
  0.01,
);

for (const exifOrientation of [1, 3, 6, 8] as const) {
  const orientedResult = extractFaceProfileGeometry(
    exifFixture(baseFixture, exifOrientation),
  );
  assert.deepEqual(
    rounded(orientedResult),
    rounded(baseResult),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(orientedResult, 'originalToUpright'),
    false,
  );
}

const missingHairlineResult = extractFaceProfileGeometry({
  ...baseFixture,
  hairline: null,
});
assert.equal(missingHairlineResult.faceBalance.upperThirdRatio.value, null);
assert.equal(
  missingHairlineResult.faceBalance.upperThirdRatio.nullReason,
  'hairline_unavailable',
);
assert.equal(
  missingHairlineResult.faceBalance.foreheadWidthToCheekWidth.value,
  null,
);
assert.equal(
  missingHairlineResult.faceBalance.foreheadWidthToCheekWidth.nullReason,
  'hairline_unavailable',
);
assert.ok(missingHairlineResult.faceBalance.faceLengthToWidth.value !== null);
assert.ok(missingHairlineResult.warnings.includes('hairline_unavailable'));

const movedOvalTop = baseFixture.landmarks.map(point =>
  point?.i === 10 ? {...point, y: point.y - 100} : point,
);
const stillMissingHairline = extractFaceProfileGeometry({
  ...baseFixture,
  hairline: null,
  landmarks: movedOvalTop,
});
assert.equal(stillMissingHairline.faceBalance.upperThirdRatio.value, null);

const semanticBoundaryInput: GeometryInputWithTransientSeams = {
  ...baseFixture,
  hairSkinBoundary: {
    left: {confidence: 0.92, point: {x: 280, y: 290}, warnings: []},
    right: {confidence: 0.9, point: {x: 720, y: 290}, warnings: []},
    status: 'ok',
    warnings: [],
  },
};
const semanticBoundaryResult = extractFaceProfileGeometry(semanticBoundaryInput);
const semanticCheekWidth = Math.hypot(
  (baseFixture.landmarks[454]?.x ?? 0) -
    (baseFixture.landmarks[234]?.x ?? 0),
  (baseFixture.landmarks[454]?.y ?? 0) -
    (baseFixture.landmarks[234]?.y ?? 0),
);
assertCloseTo(
  semanticBoundaryResult.faceBalance.foreheadWidthToCheekWidth.value as number,
  440 / semanticCheekWidth,
  1e-9,
);
assert.equal(
  semanticBoundaryResult.faceBalance.foreheadWidthToCheekWidth.source,
  'apple_semantic_matte',
);
assert.equal(
  Object.prototype.hasOwnProperty.call(semanticBoundaryResult, 'hairSkinBoundary'),
  false,
);

const lowConfidenceBoundaryResult = extractFaceProfileGeometry({
  ...semanticBoundaryInput,
  hairSkinBoundary: {
    ...semanticBoundaryInput.hairSkinBoundary!,
    left: {confidence: 0.69, point: {x: 280, y: 290}, warnings: []},
  },
} as GeometryInputWithTransientSeams);
assert.equal(
  lowConfidenceBoundaryResult.faceBalance.foreheadWidthToCheekWidth.source,
  'estimated',
);
assert.ok(
  lowConfidenceBoundaryResult.faceBalance.foreheadWidthToCheekWidth.warnings.includes(
    'forehead_width_estimated_from_face_oval',
  ),
);

const structuredOcclusionResult = extractFaceProfileGeometry({
  ...semanticBoundaryInput,
  hairSkinBoundary: {
    ...semanticBoundaryInput.hairSkinBoundary!,
    left: {
      confidence: 0.92,
      point: {x: 280, y: 290},
      warnings: ['bangs'],
    },
  },
} as GeometryInputWithTransientSeams);
assert.equal(
  structuredOcclusionResult.faceBalance.foreheadWidthToCheekWidth.value,
  null,
);
assert.equal(
  structuredOcclusionResult.faceBalance.foreheadWidthToCheekWidth.nullReason,
  'hairline_occluded',
);

const localizedCopyIsNotASignal = extractFaceProfileGeometry({
  ...semanticBoundaryInput,
  hairline: {...HAIRLINE, summary: '앞머리와 가림이라는 단어가 들어간 표시 문구'},
  hairSkinBoundary: {
    ...semanticBoundaryInput.hairSkinBoundary!,
    left: {confidence: 0.69, point: {x: 280, y: 290}, warnings: []},
  },
} as GeometryInputWithTransientSeams);
assert.equal(
  localizedCopyIsNotASignal.faceBalance.foreheadWidthToCheekWidth.source,
  'estimated',
);

const highQualityDepth: NativeDepthSummary = {
  consumed: true,
  depthQuality: {
    accuracy: 'absolute',
    confidence: 0.88,
    filtered: true,
    medianAbsoluteDeviationMeters: 0.004,
    validSampleRatio: 0.82,
  },
  facePlane: {confidence: 0.9, pitchDeg: 0, rollDeg: 0, yawDeg: 0},
  ratios: {
    chinWidthToCheekWidth: 0.44,
    faceLengthToCheekWidth: 1.61,
    foreheadWidthToCheekWidth: 0.91,
    interEyeToCheekWidth: 0.3,
    jawWidthToCheekWidth: 0.78,
    noseLengthToCheekWidth: 0.31,
  },
  status: 'ok',
};
const depthResult = extractFaceProfileGeometry({...baseFixture, depth: highQualityDepth});
assert.equal(depthResult.faceBalance.faceLengthToCheekWidth.value, 1.61);
assert.equal(
  depthResult.faceBalance.faceLengthToCheekWidth.source,
  'truedepth_3d',
);
assert.equal(depthResult.eyesAndBrows.interEyeDistanceRatio.value, 0.3);
assert.equal(depthResult.nose.noseLengthRatio.value, 0.31);

const lowQualityDepth: NativeDepthSummary = {
  ...highQualityDepth,
  depthQuality: {...highQualityDepth.depthQuality, confidence: 0.69},
};
const depthFallbackResult = extractFaceProfileGeometry({
  ...baseFixture,
  depth: lowQualityDepth,
});
assert.equal(
  depthFallbackResult.faceBalance.faceLengthToCheekWidth.source,
  'mediapipe_2d',
);
assert.ok(depthFallbackResult.warnings.includes('depth_quality_insufficient'));

const exactDepthConfidenceResult = extractFaceProfileGeometry({
  ...baseFixture,
  depth: {
    ...highQualityDepth,
    depthQuality: {...highQualityDepth.depthQuality, confidence: 0.7},
  },
});
assert.equal(
  exactDepthConfidenceResult.faceBalance.faceLengthToCheekWidth.source,
  'truedepth_3d',
);

const exactDepthSampleResult = extractFaceProfileGeometry({
  ...baseFixture,
  depth: {
    ...highQualityDepth,
    depthQuality: {...highQualityDepth.depthQuality, validSampleRatio: 0.65},
  },
});
assert.equal(
  exactDepthSampleResult.faceBalance.faceLengthToCheekWidth.source,
  'truedepth_3d',
);

const belowDepthSampleResult = extractFaceProfileGeometry({
  ...baseFixture,
  depth: {
    ...highQualityDepth,
    depthQuality: {...highQualityDepth.depthQuality, validSampleRatio: 0.64},
  },
});
assert.equal(
  belowDepthSampleResult.faceBalance.faceLengthToCheekWidth.source,
  'mediapipe_2d',
);

const degenerateJawAngleFixture = buildFixture('round_symmetric');
const leftJawVertex = degenerateJawAngleFixture.landmarks[172]!;
const rightJawVertex = degenerateJawAngleFixture.landmarks[397]!;
setPoint(
  degenerateJawAngleFixture.landmarks,
  58,
  leftJawVertex.x,
  leftJawVertex.y,
);
setPoint(
  degenerateJawAngleFixture.landmarks,
  288,
  rightJawVertex.x,
  rightJawVertex.y,
);
const degenerateJawAngleResult = extractFaceProfileGeometry(
  degenerateJawAngleFixture,
);
assert.equal(degenerateJawAngleResult.faceBalance.jawAngleDeg.value, null);
assert.equal(
  degenerateJawAngleResult.faceBalance.jawAngleDeg.nullReason,
  'jaw_angle_unavailable',
);
assert.equal(degenerateJawAngleResult.faceBalance.jawAngleScore.value, null);
assert.ok(degenerateJawAngleResult.faceBalance.jawSoftness.value !== null);
assert.ok(
  degenerateJawAngleResult.faceBalance.jawSoftness.confidence <
    degenerateJawAngleResult.faceBalance.contourRoundness.confidence,
);

const unavailableLeftEyeFixture = buildFixture('round_symmetric');
const anatomicalLeftInner = unavailableLeftEyeFixture.landmarks[362]!;
setPoint(
  unavailableLeftEyeFixture.landmarks,
  263,
  anatomicalLeftInner.x,
  anatomicalLeftInner.y,
);
const unavailableLeftEyeResult = extractFaceProfileGeometry(
  unavailableLeftEyeFixture,
);
assert.equal(
  unavailableLeftEyeResult.eyesAndBrows.leftEyeAspectRatio.value,
  null,
);
assert.equal(
  unavailableLeftEyeResult.eyesAndBrows.leftEyeCanthalTiltDeg.value,
  null,
);
assert.ok(
  unavailableLeftEyeResult.eyesAndBrows.rightEyeAspectRatio.value !== null,
);
assert.equal(unavailableLeftEyeResult.eyesAndBrows.eyeAsymmetry.value, null);
assert.equal(
  unavailableLeftEyeResult.eyesAndBrows.eyeAsymmetry.nullReason,
  'eye_asymmetry_unavailable',
);

const degenerateContourFixture = buildFixture('round_symmetric');
for (const index of FACE_SHAPE_LANDMARKS.faceOval) {
  const point = degenerateContourFixture.landmarks[index]!;
  setPoint(degenerateContourFixture.landmarks, index, point.x, 600);
}
setPoint(degenerateContourFixture.landmarks, 172, 500, 600);
setPoint(degenerateContourFixture.landmarks, 397, 500, 600);
const degenerateContourResult = extractFaceProfileGeometry(
  degenerateContourFixture,
);
assert.equal(degenerateContourResult.faceBalance.contourRoundness.value, null);
assert.equal(
  degenerateContourResult.faceBalance.contourRoundness.nullReason,
  'contour_geometry_unavailable',
);
assert.equal(
  degenerateContourResult.faceBalance.jawWidthToCheekWidth.value,
  null,
);
assert.equal(degenerateContourResult.faceBalance.jawWidthScore.value, null);
assert.equal(degenerateContourResult.faceBalance.cheekDominance.value, null);
assert.equal(degenerateContourResult.faceBalance.chinPointedness.value, null);
assert.equal(degenerateContourResult.faceBalance.foreheadDominance.value, null);
assert.equal(degenerateContourResult.faceBalance.jawSoftness.value, null);
assert.equal(degenerateContourResult.faceBalance.lowerFaceWeight.value, null);
assertPublicMeasurementsComplete(degenerateContourResult);

const incompleteLandmarks = baseFixture.landmarks.slice();
delete incompleteLandmarks[234];
const incompleteResult = extractFaceProfileGeometry({
  ...baseFixture,
  landmarks: incompleteLandmarks,
});
assert.equal(incompleteResult.faceBalance.faceLengthToWidth.value, null);
assert.equal(
  incompleteResult.faceBalance.faceLengthToWidth.nullReason,
  'landmarks_incomplete',
);
assertPublicMeasurementsComplete(incompleteResult);

const goldenFixtures: Array<{
  input: FaceProfileGeometryInput;
  name: string;
}> = [
  {input: buildFixture('round_symmetric'), name: 'round/symmetric'},
  {input: buildFixture('long_narrow'), name: 'long/narrow'},
  {input: buildFixture('square_jaw'), name: 'square-jaw'},
  {input: buildFixture('heart'), name: 'heart'},
  {input: buildFixture('diamond'), name: 'diamond'},
  {input: buildFixture('triangle'), name: 'triangle'},
  {input: {...buildFixture('round_symmetric'), hairline: null}, name: 'hairline-missing'},
  {input: {...buildFixture('round_symmetric'), pose: null}, name: 'pose-missing'},
];

for (const fixture of goldenFixtures) {
  const result = extractFaceProfileGeometry(fixture.input);
  assertPublicMeasurementsComplete(result);
  assert.equal(
    Object.prototype.hasOwnProperty.call(result, 'landmarks'),
    false,
  );
  if (fixture.name === 'pose-missing') {
    assert.equal(result.faceBalance.faceLengthToWidth.value, null);
    assert.equal(
      result.faceBalance.faceLengthToWidth.nullReason,
      'pose_unavailable',
    );
  }
}

console.log('faceProfileGeometry tests passed');
