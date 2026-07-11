import {
  evaluateFacePitchGate,
  FACE_PITCH_GATE_MAX_ABS_DEG,
} from './faceCapturePitchGate';
import {FACE_ANALYSIS_POSE_LIMITS} from '../../../shared/contracts/faceAnalysisQuality';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// 정면 근처는 통과
expect(evaluateFacePitchGate(0).pitchOk, 'pitch 0 passes');
expect(evaluateFacePitchGate(8).pitchOk, 'pitch within limit passes');
expect(evaluateFacePitchGate(-FACE_PITCH_GATE_MAX_ABS_DEG).pitchOk, 'pitch at -limit passes');

// 한계 초과는 차단 (들거나 숙이거나 양방향)
expect(!evaluateFacePitchGate(FACE_PITCH_GATE_MAX_ABS_DEG + 1).pitchOk, 'pitch above limit blocks');
expect(!evaluateFacePitchGate(-20).pitchOk, 'large negative pitch blocks');

// 값 없음/비유한은 통과 (얼굴 미검출은 greenlight가 담당)
expect(evaluateFacePitchGate(undefined).pitchOk, 'missing pitch passes');
expect(evaluateFacePitchGate(undefined).pitchDeg === null, 'missing pitch reports null');
expect(evaluateFacePitchGate(Number.NaN).pitchOk, 'NaN pitch passes');

// 얼굴 분석 전용 공유 임계값은 촬영 후 gate와 같은 inclusive 8° 경계다.
expect(
  evaluateFacePitchGate(8, FACE_ANALYSIS_POSE_LIMITS, 'matrix').pitchOk,
  'face-analysis pitch at 8 degrees passes',
);
expect(
  !evaluateFacePitchGate(8.01, FACE_ANALYSIS_POSE_LIMITS, 'matrix').pitchOk,
  'face-analysis pitch above 8 degrees blocks',
);
expect(
  !evaluateFacePitchGate(undefined, FACE_ANALYSIS_POSE_LIMITS, 'matrix').pitchOk,
  'face-analysis missing pitch blocks',
);
expect(
  !evaluateFacePitchGate(Number.NaN, FACE_ANALYSIS_POSE_LIMITS, 'matrix').pitchOk,
  'face-analysis non-finite pitch blocks',
);
expect(
  !evaluateFacePitchGate(0, FACE_ANALYSIS_POSE_LIMITS, 'geometry_unavailable').pitchOk,
  'face-analysis geometry_unavailable pitch blocks',
);
expect(
  !evaluateFacePitchGate(0, FACE_ANALYSIS_POSE_LIMITS, undefined).pitchOk,
  'face-analysis missing pose source blocks',
);

console.log('faceCapturePitchGate tests passed');
