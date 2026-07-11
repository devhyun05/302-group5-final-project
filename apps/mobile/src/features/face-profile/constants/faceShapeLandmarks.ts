import type {FaceShapeLabel} from '../../../shared/types/faceProfile';

export const FACE_SHAPE_LABELS = [
  'oval',
  'round',
  'square',
  'heart',
  'oblong',
  'diamond',
  'triangle',
] as const satisfies readonly FaceShapeLabel[];

export const FACE_SHAPE_LANDMARKS = {
  faceOval: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
    379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234,
    127, 162, 21, 54, 103, 67, 109,
  ],
  leftBrow: [46, 53, 52, 65, 55],
  leftEyeContour: [33, 160, 158, 133, 153, 144],
  leftIris: [468, 469, 470, 471, 472],
  mouth: [61, 291, 13, 14, 78, 308, 0, 17],
  nose: [168, 6, 197, 195, 5, 4, 129, 358, 2],
  rightBrow: [276, 283, 282, 295, 285],
  rightEyeContour: [362, 385, 387, 263, 373, 380],
  rightIris: [473, 474, 475, 476, 477],
  jawAndChin: [
    234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379,
    365, 397, 288, 361, 323, 454,
  ],
} as const;

export type {FaceShapeLabel} from '../../../shared/types/faceProfile';
