export type FaceVerticalThirdsStatus =
  | 'full_success'
  | 'partial_success'
  | 'blocked'
  | 'failed';

export type VerticalThirdsKeypointProvider =
  | 'mediapipe'
  | 'mediapipe_forehead_approx'
  | 'apple_semantic_matte'
  | 'face_parsing';

export type VerticalThirdsKeypoint = {
  confidence: number;
  method: string;
  provider: VerticalThirdsKeypointProvider;
  x: number;
  y: number;
};

export type VerticalThirdsKeypointMap = {
  G: VerticalThirdsKeypoint | null;
  H: VerticalThirdsKeypoint | null;
  Me: VerticalThirdsKeypoint | null;
  Sn: VerticalThirdsKeypoint | null;
};

export type VerticalThirdsDisplayRatio = {
  lower: number;
  middle: 1.0;
  upper: number | null;
};

export type VerticalThirdsRatio = {
  confidence: number;
  displayRatio: VerticalThirdsDisplayRatio;
  lowerNormalized: number | null;
  lowerPx: number;
  middleNormalized: number | null;
  middlePx: number;
  totalPx: number | null;
  upperNormalized: number | null;
  upperPx: number | null;
  warnings: string[];
};

export type VerticalThirdsDominantPart =
  | 'upper'
  | 'middle'
  | 'lower'
  | 'balanced'
  | 'unknown';

export type FaceVerticalThirdsQuality = {
  pitch?: number;
  roll?: number;
  usable: boolean;
  warnings: string[];
  yaw?: number;
};

export type FaceVerticalThirdsInput = {
  captureId: string;
  createdAt: string;
  imageUri: string;
  sessionId: string;
};

export type FaceVerticalThirdsResult = {
  artifacts: {
    logJsonlUri?: string;
    overlayImageUri?: string;
    resultJsonUri?: string;
  };
  captureId: string;
  createdAt: string;
  interpretation: {
    dominantPart?: VerticalThirdsDominantPart;
    summary: string;
    title: string;
  };
  keypoints: VerticalThirdsKeypointMap;
  quality: FaceVerticalThirdsQuality;
  schemaVersion: 'aura-face-vertical-thirds-v1';
  sessionId: string;
  sourceImage: {
    height: number;
    uri: string;
    width: number;
  };
  status: FaceVerticalThirdsStatus;
  statusReason?: string;
  verticalThirds?: VerticalThirdsRatio;
};

export type NativeFaceRatioPoint = {
  x: number;
  y: number;
  z?: number;
};

export type NativeFaceRatioKeypointKey =
  | 'hApprox'
  | 'glabella'
  | 'subnasale'
  | 'menton';

export type NativeFaceRatioPose = {
  pitchDeg: number;
  poseSource: 'matrix' | 'unavailable';
  rollDeg: number;
  yawDeg: number;
};

export type NativeFaceRatioAnalyzeResult = {
  debugPoints?: Partial<Record<string, NativeFaceRatioPoint>>;
  error?: string;
  faceCount: number;
  imageHeight?: number;
  imageWidth?: number;
  keypoints?: Partial<Record<NativeFaceRatioKeypointKey, NativeFaceRatioPoint>>;
  landmarkCount?: number;
  pose?: NativeFaceRatioPose;
  status: 'ok' | 'no_face' | 'unsupported';
};
