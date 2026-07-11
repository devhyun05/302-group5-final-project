import type {
  FaceShapeLabel,
  FaceShapeRuleFeatures,
  FaceVerticalThirdsSummary,
} from '../../../shared/types/faceProfile';
import {FACE_SHAPE_LANDMARKS} from '../constants/faceShapeLandmarks';
import {
  extractFaceProfileGeometry,
  type FaceLandmarkPoint,
  type FaceProfileGeometryInput,
} from './faceProfileGeometry';

export type GeometryFixtureName =
  | 'oval'
  | 'round_symmetric'
  | 'long_narrow'
  | 'square_jaw'
  | 'heart'
  | 'diamond'
  | 'triangle';

const IMAGE_LEFT_BROW = [46, 53, 52, 65, 55] as const;
const IMAGE_LEFT_IRIS = [468, 469, 470, 471, 472] as const;
const IMAGE_RIGHT_BROW = [276, 283, 282, 295, 285] as const;
const IMAGE_RIGHT_IRIS = [473, 474, 475, 476, 477] as const;

export const FACE_PROFILE_TEST_HAIRLINE: FaceVerticalThirdsSummary = {
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
  oval: {faceRx: 285, faceRy: 405, upperScale: 0.96, jawScale: 0.86},
  round_symmetric: {faceRx: 310, faceRy: 355, upperScale: 0.97, jawScale: 0.88},
  square_jaw: {faceRx: 310, faceRy: 405, upperScale: 0.98, jawScale: 0.98},
  triangle: {faceRx: 295, faceRy: 405, upperScale: 0.78, jawScale: 1.04},
};

const FIXTURE_BY_SHAPE: Record<FaceShapeLabel, GeometryFixtureName> = {
  diamond: 'diamond',
  heart: 'heart',
  oblong: 'long_narrow',
  oval: 'oval',
  round: 'round_symmetric',
  square: 'square_jaw',
  triangle: 'triangle',
};

export function setFaceProfileFixturePoint(
  landmarks: FaceLandmarkPoint[],
  index: number,
  x: number,
  y: number,
) {
  landmarks[index] = {i: index, x, y, z: 0};
}

export function buildFaceProfileGeometryFixture(
  name: GeometryFixtureName,
): FaceProfileGeometryInput {
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
    setFaceProfileFixturePoint(
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
  ].forEach(([index, x, y]) =>
    setFaceProfileFixturePoint(landmarks, index, x, y),
  );

  IMAGE_LEFT_IRIS.forEach((index, offset) => {
    const theta = (offset / IMAGE_LEFT_IRIS.length) * Math.PI * 2;
    setFaceProfileFixturePoint(
      landmarks,
      index,
      leftEyeCenterX + Math.cos(theta) * 10,
      eyeY + Math.sin(theta) * 10,
    );
  });
  IMAGE_RIGHT_IRIS.forEach((index, offset) => {
    const theta = (offset / IMAGE_RIGHT_IRIS.length) * Math.PI * 2;
    setFaceProfileFixturePoint(
      landmarks,
      index,
      rightEyeCenterX + Math.cos(theta) * 10,
      eyeY + Math.sin(theta) * 10,
    );
  });

  const browY = eyeY - eyeHeight * 2.1;
  IMAGE_LEFT_BROW.forEach((index, offset, all) => {
    const progress = offset / (all.length - 1);
    setFaceProfileFixturePoint(
      landmarks,
      index,
      leftEyeCenterX - eyeHalfWidth + progress * eyeHalfWidth * 2,
      browY - Math.sin(progress * Math.PI) * 9,
    );
  });
  IMAGE_RIGHT_BROW.forEach((index, offset, all) => {
    const progress = offset / (all.length - 1);
    setFaceProfileFixturePoint(
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
  ].forEach(([index, x, y]) =>
    setFaceProfileFixturePoint(landmarks, index, x, y),
  );

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
  ].forEach(([index, x, y]) =>
    setFaceProfileFixturePoint(landmarks, index, x, y),
  );

  return {
    faceCount: 1,
    hairline: FACE_PROFILE_TEST_HAIRLINE,
    imageHeight,
    imageWidth,
    landmarks,
    mirrored: false,
    pose: {pitchDeg: 0, rollDeg: 0, yawDeg: 0},
  };
}

export function extractFaceShapeRuleFixture(
  shape: FaceShapeLabel,
): FaceShapeRuleFeatures {
  return extractFaceProfileGeometry(
    buildFaceProfileGeometryFixture(FIXTURE_BY_SHAPE[shape]),
  ).ruleFeatures;
}
