// 캡처 품질 사전 게이트 (순수). 엔진 실행 전에 명백한 실패를 분류.
// 세밀한 축/신뢰도 게이팅은 엔진(measurementConfidence)이 담당.

import type {
  NativePersonalColorResult,
  NativeRegionKey,
  NativeRegionStats,
} from './personalColorCore/contracts';

export type PersonalColorQualityGate = {
  usable: boolean;
  warnings: string[];
};

// Task 4 이전 capture exposure gate가 소비하던 정확한 ROI 집합이다.
// FaceProfile 전용 eye/brow ROI는 자체 통계를 유지하되 legacy capture 판정을
// 완화하거나 억제해서는 안 된다.
const LEGACY_CAPTURE_EXPOSURE_REGION_KEYS = [
  'skinCheekLeft',
  'skinCheekRight',
  'skinForehead',
  'hair',
  'lip',
] as const satisfies readonly NativeRegionKey[];

export function evaluatePersonalColorQuality(native: NativePersonalColorResult): PersonalColorQualityGate {
  const warnings: string[] = [];

  if (native.status === 'unsupported') {
    return { usable: false, warnings: ['native_unsupported'] };
  }
  if (native.status === 'error') {
    return { usable: false, warnings: [`native_error_${native.error ?? 'unknown'}`] };
  }
  if (native.status === 'no_face' || native.faceCount < 1) {
    return { usable: false, warnings: ['no_face'] };
  }

  const regions = native.regions ?? {};
  const hasSkin = !!(regions.skinCheekLeft || regions.skinCheekRight || regions.skinForehead);
  if (!hasSkin) warnings.push('skin_region_missing');
  if (!regions.lip) warnings.push('lip_region_missing');
  if (!regions.eyeLeft) warnings.push('eye_left_missing');
  if (!regions.eyeRight) warnings.push('eye_right_missing');
  if (!regions.browLeft) warnings.push('brow_left_missing');
  if (!regions.browRight) warnings.push('brow_right_missing');
  if (native.matte && !native.matte.skinAvailable) warnings.push('skin_matte_unavailable');

  if (!native.quality) {
    warnings.push('pixel_quality_missing');
  } else {
    if (native.quality.blur.score < 0.45) warnings.push('blur_risk');
    if (native.quality.lighting.score < 0.4) warnings.push('lighting_low');
    if (native.quality.lighting.uniformityScore < 0.5) {
      warnings.push('lighting_uneven');
    }
  }

  // 기존 skin/hair/lip ROI 전부의 과노출/저노출 경향.
  const stats = LEGACY_CAPTURE_EXPOSURE_REGION_KEYS
    .map(key => regions[key])
    .filter((region): region is NativeRegionStats => region !== undefined);
  const overHeavy = stats.length > 0 && stats.every(s => s.overexposedRatio > 0.25);
  const underHeavy = stats.length > 0 && stats.every(s => s.underexposedRatio > 0.25);
  if (overHeavy) warnings.push('capture_overexposed');
  if (underHeavy) warnings.push('capture_underexposed');

  return { usable: hasSkin, warnings };
}
