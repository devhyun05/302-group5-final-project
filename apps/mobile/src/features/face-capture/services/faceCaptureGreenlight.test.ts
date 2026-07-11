import {evaluateFaceCaptureGreenlight} from './faceCaptureGreenlight';
import {FACE_ANALYSIS_POSE_LIMITS} from '../../../shared/contracts/faceAnalysisQuality';
import {evaluateFaceVerticalThirdsQuality} from '../../face-ratio/services/faceVerticalThirdsQualityGate';
import type {
  NativeFaceRatioAnalyzeResult,
  VerticalThirdsKeypointMap,
} from '../../face-ratio/types';

const guide = {
  centerX: 180,
  centerY: 360,
  height: 420,
  width: 280,
};

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runFaceCaptureGreenlightTests() {
  const missingMediaPipeReport = evaluateFaceCaptureGreenlight({
    cameraStability: {
      isStable: true,
      stableDurationMs: 900,
      stableThresholdMs: 700,
      status: 'ok',
    },
    guide,
  });

  expect(
    missingMediaPipeReport.mediaPipeAlignmentGreenlight === false,
    'MediaPipe payload absence must never pass alignment greenlight.',
  );
  expect(
    missingMediaPipeReport.finalCaptureGreenlight === false,
    'MediaPipe payload absence must never pass final capture greenlight.',
  );
  expect(
    missingMediaPipeReport.failureReasons.includes('landmark_missing'),
    'Missing MediaPipe payload should report landmark_missing.',
  );

  const passingReport = evaluateFaceCaptureGreenlight({
    cameraStability: {
      isStable: true,
      stableDurationMs: 900,
      stableThresholdMs: 700,
      status: 'ok',
    },
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      rollDeg: 0.4,
      screenLandmarks: {
        chin: {left: 181, top: 540},
        forehead: {left: 178, top: 180},
        noseBridge: {left: 180, top: 300},
        noseTip: {left: 182, top: 380},
      },
      status: 'ok',
      yawDeg: -1.2,
    },
  });

  expect(
    passingReport.finalCaptureGreenlight === true,
    'Aligned MediaPipe payload plus stable camera should pass.',
  );

  const nativeNumericStableReport = evaluateFaceCaptureGreenlight({
    cameraStability: {
      isStable: 1,
      stableDurationMs: 900,
      stableThresholdMs: 700,
      status: 'ok',
    },
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      rollDeg: 0.4,
      screenLandmarks: {
        chin: {left: 181, top: 540},
        forehead: {left: 178, top: 180},
        noseBridge: {left: 180, top: 300},
        noseTip: {left: 182, top: 380},
      },
      status: 'ok',
      yawDeg: -1.2,
    },
  });

  expect(
    nativeNumericStableReport.cameraStabilityGreenlight === true,
    'Native numeric isStable=1 should pass camera stability greenlight.',
  );
  expect(
    nativeNumericStableReport.finalCaptureGreenlight === true,
    'Native numeric isStable=1 should pass final capture greenlight when aligned.',
  );

  const stableCamera = {
    isStable: true as const,
    stableDurationMs: 900,
    stableThresholdMs: 700,
    status: 'ok' as const,
  };
  const alignedLandmarks = {
    chin: {left: 181, top: 540},
    forehead: {left: 178, top: 180},
    noseBridge: {left: 180, top: 300},
    noseTip: {left: 182, top: 380},
  };

  const faceAnalysisBoundary = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: 8,
      poseSource: 'matrix',
      rollDeg: 5,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 8,
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    faceAnalysisBoundary.finalCaptureGreenlight,
    'Face-analysis yaw/roll boundary 8/5 should pass before capture.',
  );

  const faceAnalysisMissingPose = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      poseSource: 'matrix',
      screenLandmarks: alignedLandmarks,
      status: 'ok',
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    !faceAnalysisMissingPose.finalCaptureGreenlight &&
      faceAnalysisMissingPose.failureReasons.includes('not_forward'),
    'Face-analysis live gate must fail closed when pose angles are missing.',
  );

  const faceAnalysisNonFinitePose = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: Number.NaN,
      poseSource: 'matrix',
      rollDeg: 0,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 0,
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    !faceAnalysisNonFinitePose.finalCaptureGreenlight &&
      faceAnalysisNonFinitePose.failureReasons.includes('not_forward'),
    'Face-analysis live gate must fail closed for non-finite pose angles.',
  );

  const faceAnalysisUnavailablePose = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: 0,
      poseSource: 'geometry_unavailable',
      rollDeg: 0,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 0,
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    !faceAnalysisUnavailablePose.finalCaptureGreenlight &&
      faceAnalysisUnavailablePose.failureReasons.includes('not_forward'),
    'Face-analysis live gate must reject the native geometry_unavailable sentinel.',
  );

  const faceAnalysisMissingPoseSource = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: 0,
      rollDeg: 0,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 0,
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    !faceAnalysisMissingPoseSource.finalCaptureGreenlight &&
      faceAnalysisMissingPoseSource.failureReasons.includes('not_forward'),
    'Face-analysis live gate must fail closed when the pose source is missing.',
  );

  const faceAnalysisYawOverLimit = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: 8,
      poseSource: 'matrix',
      rollDeg: 5,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 8.01,
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    faceAnalysisYawOverLimit.failureReasons.includes('not_forward'),
    'Face-analysis yaw above 8 degrees should block before capture.',
  );

  const faceAnalysisRollOverLimit = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: 8,
      poseSource: 'matrix',
      rollDeg: 5.01,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 8,
    },
    poseLimits: FACE_ANALYSIS_POSE_LIMITS,
  });
  expect(
    faceAnalysisRollOverLimit.failureReasons.includes('not_forward'),
    'Face-analysis roll above 5 degrees should block before capture.',
  );

  const legacyBoundary = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg: 12,
      rollDeg: 8,
      screenLandmarks: alignedLandmarks,
      status: 'ok',
      yawDeg: 10,
    },
  });
  expect(
    legacyBoundary.finalCaptureGreenlight,
    'Capture modes without pose limits should preserve yaw/roll 10/8 defaults.',
  );

  const legacyUnavailablePose = evaluateFaceCaptureGreenlight({
    cameraStability: stableCamera,
    guide,
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      poseSource: 'geometry_unavailable',
      screenLandmarks: alignedLandmarks,
      status: 'ok',
    },
  });
  expect(
    legacyUnavailablePose.finalCaptureGreenlight,
    'Capture modes without pose limits must retain the legacy fail-open pose behavior.',
  );

  const keypoints: VerticalThirdsKeypointMap = {
    G: {confidence: 1, method: 'fixture', provider: 'mediapipe', x: 50, y: 30},
    H: {confidence: 1, method: 'fixture', provider: 'mediapipe', x: 50, y: 10},
    Me: {confidence: 1, method: 'fixture', provider: 'mediapipe', x: 50, y: 90},
    Sn: {confidence: 1, method: 'fixture', provider: 'mediapipe', x: 50, y: 60},
  };
  const nativeAtBoundary: NativeFaceRatioAnalyzeResult = {
    faceCount: 1,
    pose: {
      pitchDeg: FACE_ANALYSIS_POSE_LIMITS.pitchAbsMaxDeg,
      poseSource: 'matrix',
      rollDeg: FACE_ANALYSIS_POSE_LIMITS.rollAbsMaxDeg,
      yawDeg: FACE_ANALYSIS_POSE_LIMITS.yawAbsMaxDeg,
    },
    status: 'ok',
  };
  expect(
    evaluateFaceVerticalThirdsQuality(nativeAtBoundary, keypoints).quality.usable,
    'The post-capture quality gate should accept the same inclusive 8/8/5 boundary.',
  );

  const nativeOverBoundary: NativeFaceRatioAnalyzeResult = {
    ...nativeAtBoundary,
    pose: {...nativeAtBoundary.pose!, pitchDeg: 8.01},
  };
  expect(
    evaluateFaceVerticalThirdsQuality(nativeOverBoundary, keypoints).statusReason ===
      'pose_gate_failed',
    'The post-capture quality gate should reject values above the shared boundary.',
  );

  expect(
    evaluateFaceVerticalThirdsQuality(
      {...nativeAtBoundary, pose: undefined},
      keypoints,
    ).statusReason === 'pose_unavailable',
    'Missing pose must block with pose_unavailable instead of being treated as zero.',
  );
  expect(
    evaluateFaceVerticalThirdsQuality(
      {
        ...nativeAtBoundary,
        pose: {pitchDeg: 0, poseSource: 'unavailable', rollDeg: 0, yawDeg: 0},
      },
      keypoints,
    ).statusReason === 'pose_unavailable',
    'The native unavailable-pose sentinel must block with pose_unavailable.',
  );
}

runFaceCaptureGreenlightTests();

console.log('faceCaptureGreenlight tests passed');
