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
  leftBrow: [276, 283, 282, 295, 285],
  leftEyeContour: [362, 385, 387, 263, 373, 380],
  leftIris: [473, 474, 475, 476, 477],
  mouth: [61, 291, 13, 14, 78, 308, 0, 17],
  nose: [168, 6, 197, 195, 5, 4, 129, 358, 2],
  rightBrow: [46, 53, 52, 65, 55],
  rightEyeContour: [33, 160, 158, 133, 153, 144],
  rightIris: [468, 469, 470, 471, 472],
  jawAndChin: [
    234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379,
    365, 397, 288, 361, 323, 454,
  ],
} as const;

/**
 * MediaPipe Face Mesh 478 indices consumed by the in-memory geometry extractor.
 * Keeping the groups above explicit makes fixture coverage and model upgrades auditable.
 */
export const FACE_PROFILE_GEOMETRY_REQUIRED_LANDMARKS: readonly number[] = [
  ...new Set<number>(Object.values(FACE_SHAPE_LANDMARKS).flat()),
];

export const FACE_PROFILE_GEOMETRY_ANCHORS = {
  cheekWidth: [234, 454],
  chinWidth: [148, 377],
  faceLength: [10, 152],
  foreheadWidthFallback: [103, 332],
  jawWidth: [172, 397],
  templeWidth: [127, 356],
} as const;

export type {FaceShapeLabel} from '../../../shared/types/faceProfile';
