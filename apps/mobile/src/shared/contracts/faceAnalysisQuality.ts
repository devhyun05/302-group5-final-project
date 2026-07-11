export type FacePoseLimits = {
  readonly pitchAbsMaxDeg: number;
  readonly rollAbsMaxDeg: number;
  readonly yawAbsMaxDeg: number;
};

export const FACE_ANALYSIS_POSE_LIMITS = {
  yawAbsMaxDeg: 8,
  pitchAbsMaxDeg: 8,
  rollAbsMaxDeg: 5,
} as const satisfies FacePoseLimits;
