// 엔진 통합 검증 (fixture 기반). bug #1/#2 산출 + status 게이팅.
import { analyzePersonalColor } from './engine';
import { requireFixture } from './fixtureInventory';
import { PERSONAL_COLOR_SCHEMA_VERSION } from './contracts';

function expectTrue(value: boolean, label: string) {
  if (!value) throw new Error(`${label}: expected true`);
}
function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

export function runEngineTests() {
  // bug #1 센터링: value/chroma가 실제로 부호를 가짐
  const summer = analyzePersonalColor(requireFixture('light_cool_summer').native);
  expectTrue((summer.axes.value.value as number) < 0, 'light_cool_summer value < 0 (light)');
  expectTrue((summer.axes.temperature.value as number) < 0, 'light_cool_summer temperature < 0 (cool)');

  const autumn = analyzePersonalColor(requireFixture('deep_warm_autumn').native);
  expectTrue((autumn.axes.value.value as number) > 0, 'deep_warm_autumn value > 0 (deep)');
  expectTrue((autumn.axes.temperature.value as number) > 0, 'deep_warm_autumn temperature > 0 (warm)');

  const muted = analyzePersonalColor(requireFixture('muted_soft_summer').native);
  expectTrue((muted.axes.chroma.value as number) < 0, 'muted_soft_summer chroma < 0');

  const winter = analyzePersonalColor(requireFixture('bright_clear_winter').native);
  expectTrue((winter.axes.chroma.value as number) > 0, 'bright_clear_winter chroma > 0');

  // 결과 계약
  expectEqual(summer.schemaVersion, PERSONAL_COLOR_SCHEMA_VERSION, 'schemaVersion');
  expectEqual(summer.colorFrame, 'device-relative-awb-locked', 'colorFrame relative');
  expectEqual(summer.privacy.rawAnalyzerArtifactsLocalOnly, true, 'raw artifacts local only');
  expectEqual(summer.privacy.additionalRawFrameUpload, false, 'no additional raw upload');
  expectEqual(summer.privacy.derivedProfileUploadAllowed, true, 'derived profile upload allowed');
  expectEqual(
    summer.privacy.longTermRawAnalyzerArtifactStored,
    false,
    'no long-term raw analyzer artifact',
  );
  expectEqual(summer.privacy.trainingUseAllowed, false, 'training use disabled');
  expectEqual(summer.preCalibrationHedge, true, 'preCalibrationHedge default true');
  expectTrue(summer.tone == null || summer.status !== 'definitive', 'no definitive before calibration');
  for (const axis of Object.values(summer.axes)) {
    expectTrue(axis.basis === 'within-frame-relative', 'axis basis relative');
  }

  // 눈/눈썹 ROI는 FaceProfile 대비에만 쓰이며 개인색 분류 결과를 바꾸지 않는다.
  const withPixelQuality = analyzePersonalColor(
    requireFixture('light_cool_summer_pixel_quality').native,
  );
  expectEqual(JSON.stringify(summer.axes), JSON.stringify(withPixelQuality.axes), 'eye/brow do not change axes');
  expectEqual(summer.tone?.top, withPixelQuality.tone?.top, 'eye/brow do not change top tone');
  expectEqual(summer.status, withPixelQuality.status, 'eye/brow do not change status');
  for (const warning of [
    'eye_left_missing',
    'eye_right_missing',
    'brow_left_missing',
    'brow_right_missing',
  ]) {
    expectTrue(summer.warnings.includes(warning), `${warning} is reported`);
    expectTrue(!withPixelQuality.warnings.includes(warning), `${warning} absent with ROI`);
  }

  // bug #2 floor: 전부 저신뢰 → insufficient, tone null, 축 null
  const low = analyzePersonalColor(requireFixture('low_confidence_all').native);
  expectEqual(low.status, 'insufficient', 'low_confidence status insufficient');
  expectEqual(low.tone, null, 'low_confidence tone null');
  expectEqual(low.axes.temperature.value, null, 'low_confidence temperature null');
  expectTrue(low.measurementConfidence < 0.45, 'low_confidence mc < usable');

  // hair 없어도 동작
  const noHair = analyzePersonalColor(requireFixture('hair_missing').native);
  expectTrue(noHair.warnings.includes('hair_missing'), 'hair_missing warning');
  expectTrue(noHair.axes.temperature.value != null, 'temperature present without hair');

  // 과노출 경고 + qEff 하락
  const over = analyzePersonalColor(requireFixture('overexposed_skin').native);
  const skinM = over.regions.find(r => r.region === 'skin');
  expectTrue(!!skinM && skinM.warnings.includes('skin_overexposed'), 'skin_overexposed warning');
  expectTrue(!!skinM && skinM.qEff < skinM.qNative, 'exposure penalty lowers qEff');

  // 보정셋 적용 시 definitive 가능 (mc 충분 가정)
  const calibrated = analyzePersonalColor(requireFixture('deep_warm_autumn').native, {
    calibrationApplied: true,
    calibrationVersion: 'test-cal-v1',
    frameCount: 3,
  });
  expectEqual(calibrated.calibrationApplied, true, 'calibrationApplied true');
  expectEqual(calibrated.preCalibrationHedge, false, 'preCalibrationHedge false when calibrated');

  console.log('[personal-color] engine tests passed');
}

runEngineTests();
