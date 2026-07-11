import type {
  FaceVerticalThirdsQuality,
  NativeFaceRatioAnalyzeResult,
  VerticalThirdsKeypointMap,
} from '../types';
import {APPLE_HAIRLINE_FULL_CONFIDENCE, HAIRLINE_WARNING} from '../constants';
import {FACE_ANALYSIS_POSE_LIMITS} from '../../../shared/contracts/faceAnalysisQuality';

export type FaceVerticalThirdsQualityGateResult = {
  keypoints: VerticalThirdsKeypointMap;
  quality: FaceVerticalThirdsQuality;
  statusReason?: string;
};

function isWithinPoseGate(value: number, limit: number) {
  return Number.isFinite(value) && Math.abs(value) <= limit;
}

function createBlockedResult(
  keypoints: VerticalThirdsKeypointMap,
  nativeResult: NativeFaceRatioAnalyzeResult,
  statusReason: string,
  warnings: string[],
): FaceVerticalThirdsQualityGateResult {
  const usablePose =
    nativeResult.pose?.poseSource === 'matrix' ? nativeResult.pose : undefined;
  return {
    keypoints,
    quality: {
      pitch: usablePose?.pitchDeg,
      roll: usablePose?.rollDeg,
      usable: false,
      warnings,
      yaw: usablePose?.yawDeg,
    },
    statusReason,
  };
}

export function evaluateFaceVerticalThirdsQuality(
  nativeResult: NativeFaceRatioAnalyzeResult,
  keypoints: VerticalThirdsKeypointMap,
): FaceVerticalThirdsQualityGateResult {
  const warnings: string[] = [];

  if (nativeResult.status === 'no_face' || nativeResult.faceCount === 0) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'face_not_detected',
      ['face_not_detected'],
    );
  }

  if (nativeResult.faceCount !== 1) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'multiple_faces_detected',
      ['multiple_faces_detected'],
    );
  }

  const pose = nativeResult.pose;
  if (
    !pose ||
    pose.poseSource !== 'matrix' ||
    !Number.isFinite(pose.yawDeg) ||
    !Number.isFinite(pose.pitchDeg) ||
    !Number.isFinite(pose.rollDeg)
  ) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'pose_unavailable',
      ['pose_unavailable'],
    );
  }

  if (
    !isWithinPoseGate(pose.yawDeg, FACE_ANALYSIS_POSE_LIMITS.yawAbsMaxDeg) ||
    !isWithinPoseGate(pose.pitchDeg, FACE_ANALYSIS_POSE_LIMITS.pitchAbsMaxDeg) ||
    !isWithinPoseGate(pose.rollDeg, FACE_ANALYSIS_POSE_LIMITS.rollAbsMaxDeg)
  ) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'pose_gate_failed',
      ['pose_gate_failed'],
    );
  }

  const glabella = keypoints.G;
  const subnasale = keypoints.Sn;
  const menton = keypoints.Me;

  if (!glabella || !subnasale || !menton) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'required_keypoints_missing',
      ['required_keypoints_missing'],
    );
  }

  if (!(glabella.y < subnasale.y && subnasale.y < menton.y)) {
    return createBlockedResult(
      keypoints,
      nativeResult,
      'vertical_keypoint_order_invalid',
      ['vertical_keypoint_order_invalid'],
    );
  }

  const nextKeypoints = {...keypoints};
  const hairline = nextKeypoints.H;

  if (!hairline) {
    nextKeypoints.H = null;
    warnings.push(HAIRLINE_WARNING.unavailable);
  } else if (!(hairline.y < glabella.y)) {
    nextKeypoints.H = null;
    warnings.push(
      hairline.provider === 'apple_semantic_matte'
        ? HAIRLINE_WARNING.invalidOrder
        : HAIRLINE_WARNING.approximatedUnusable,
    );
  } else if (hairline.provider === 'apple_semantic_matte') {
    warnings.push(
      hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE
        ? HAIRLINE_WARNING.appleMatte
        : HAIRLINE_WARNING.appleMatteLowConfidence,
    );
  } else {
    warnings.push(HAIRLINE_WARNING.approximated);
  }

  return {
    keypoints: nextKeypoints,
    quality: {
      pitch: nativeResult.pose?.pitchDeg,
      roll: nativeResult.pose?.rollDeg,
      usable: true,
      warnings,
      yaw: nativeResult.pose?.yawDeg,
    },
  };
}
