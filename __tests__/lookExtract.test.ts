/**
 * @format
 * composer/lookExtract — 사진 측정치(LookMeasurement) → 컴포저 룩 재료 번역 검증.
 * 순수 함수(measurementToLook/chromaDelta)라 RN 렌더 없이 입출력만 검증한다.
 */
import type {LookMeasurement} from '../src/bridge/types';
import {
  EXTRACT_K,
  chromaDelta,
  measurementToLook,
} from '../src/composer/lookExtract';

// 중립 스킨톤 — 모든 시나리오의 skinBase/화이트포인트 기준.
const SKIN = '#E8C4A8';

const measure = (over: Partial<LookMeasurement> = {}): LookMeasurement => ({
  hasFace: true,
  whitePoint: '#FFFFFF',
  lightingConf: 1,
  skinBase: SKIN,
  lip: SKIN,
  lipLine: '',
  lipConf: 1,
  blush: SKIN,
  blushConf: 1,
  eyeshadow: SKIN,
  eyeshadowConf: 1,
  brow: '#3A2A20',
  browConf: 1,
  iris: '#5A4636', // 자연 갈색(렌즈 아님)
  irisConf: 1,
  ...over,
});

describe('chromaDelta', () => {
  test('맨피부와 같은 색이면 0', () => {
    expect(chromaDelta(SKIN, SKIN)).toBe(0);
  });

  test('진한 색일수록 색차가 커진다(단조)', () => {
    const bold = chromaDelta('#C0304A', SKIN); // 진한 레드핑크
    const soft = chromaDelta('#DE9BA0', SKIN); // 옅은 로즈
    expect(bold).toBeGreaterThan(soft);
    expect(soft).toBeGreaterThan(0);
  });
});

describe('measurementToLook — 얼굴 미검출', () => {
  test('hasFace=false면 빈 결과', () => {
    const {params, lensLayers} = measurementToLook(measure({hasFace: false}));
    expect(params).toEqual({});
    expect(lensLayers).toEqual([]);
  });
});

describe('measurementToLook — 립', () => {
  test('진한 립 → lipIntensity>0 · lipColor 일치 · 그라데 기본 끔(B)', () => {
    const {params} = measurementToLook(measure({lip: '#C0304A'}));
    expect(params.lipColor).toBe('#C0304A');
    expect(params.lipIntensity).toBeGreaterThan(0);
    // 그라데 기본값 0 = 끔(B). EXTRACT_K.lipGradient도 0이라 함께 추적.
    expect(params.lipGradient).toBe(EXTRACT_K.lipGradient);
    expect(params.lipGradient).toBe(0);
    // lipColor2(안쪽 색)는 gradient가 꺼져도 계속 대입 — lipLine 미제공 시 lip에서 파생.
    expect(params.lipColor2).toBeDefined();
    expect(params.lipColor2).not.toBe('#C0304A');
  });

  test('lipLine 제공 시 그라데 스톱B로 그대로 사용', () => {
    const {params} = measurementToLook(
      measure({lip: '#C0304A', lipLine: '#8A1E30'}),
    );
    expect(params.lipColor2).toBe('#8A1E30');
  });

  test('입술색이 맨피부와 같으면 립 미포함', () => {
    const {params} = measurementToLook(measure({lip: SKIN}));
    expect(params.lipColor).toBeUndefined();
    expect(params.lipIntensity).toBeUndefined();
  });
});

describe('measurementToLook — 블러셔', () => {
  test('채도 낮은 볼 → blushIntensity 낮음(진한 볼보다 작음)', () => {
    const soft = measurementToLook(measure({blush: '#E3A9AC'})).params;
    const bold = measurementToLook(measure({blush: '#E86B7A'})).params;
    expect(soft.blushIntensity).toBeGreaterThan(0);
    expect(bold.blushIntensity).toBeGreaterThan(soft.blushIntensity!);
  });

  test('볼색이 맨피부와 같으면 블러셔 미포함', () => {
    const {params} = measurementToLook(measure({blush: SKIN}));
    expect(params.blushColor).toBeUndefined();
  });
});

describe('measurementToLook — 아이섀도', () => {
  test('어두운 브라운 섀도 → eyeshadowIntensity>0(명도차 반영)', () => {
    const {params} = measurementToLook(measure({eyeshadow: '#8A5A48'}));
    expect(params.eyeshadowColor).toBe('#8A5A48');
    expect(params.eyeshadowIntensity).toBeGreaterThan(0);
  });
});

describe('measurementToLook — 눈썹', () => {
  test('색 신뢰 · 강도는 고정값 × 기본 스케일(클램프)', () => {
    const {params} = measurementToLook(measure({brow: '#2A1E16'}));
    expect(params.browColor).toBe('#2A1E16');
    expect(params.browPowderColor).toBe('#2A1E16');
    // browConf=1 → EXTRACT_K.brow × scale, [0,1] 클램프(A). 마스카라·파우더 동일.
    expect(params.browIntensity).toBeCloseTo(
      Math.min(1, EXTRACT_K.brow * EXTRACT_K.scale),
      3,
    );
    expect(params.browPowderIntensity).toBe(params.browIntensity);
  });
});

describe('measurementToLook — 컬러렌즈 게이팅', () => {
  test('자연 갈색 홍채 → lensLayers 빈 배열', () => {
    const {lensLayers} = measurementToLook(measure({iris: '#5A4636'}));
    expect(lensLayers).toEqual([]);
  });

  test('뚜렷한 파란 렌즈색 + 높은 신뢰도 → lensLayers 1장', () => {
    const {lensLayers} = measurementToLook(
      measure({iris: '#3E6FA0', irisConf: 0.9}),
    );
    expect(lensLayers).toHaveLength(1);
    expect(lensLayers[0].color).toBe('#3E6FA0');
    expect(lensLayers[0].blendMode).toBe(1); // 멀티플라이(원래 눈색 비침)
    expect(lensLayers[0].intensity).toBeGreaterThan(0);
  });

  test('렌즈색이라도 신뢰도 낮으면 미생성(오탐 방지)', () => {
    const {lensLayers} = measurementToLook(
      measure({iris: '#3E6FA0', irisConf: 0.2}),
    );
    expect(lensLayers).toEqual([]);
  });
});

describe('measurementToLook — 게인 배율(개발용 농도 슬라이더)', () => {
  test('gain 생략 시 기본 1 — 하위호환(배율 없음)', () => {
    const base = measurementToLook(measure({lip: '#C0304A'})).params;
    const one = measurementToLook(measure({lip: '#C0304A'}), 1).params;
    expect(one.lipIntensity).toBe(base.lipIntensity);
  });

  test('게인이 클수록 최종 intensity가 커진다(클램프 전 대역·전 부위 비례)', () => {
    const m = measure({
      lip: '#C0304A',
      blush: '#E86B7A',
      eyeshadow: '#8A5A48',
    });
    // 기본 스케일이 커 기본 게인 1에선 대부분 1로 포화 — 비례성은 클램프 전 저대역에서 검증.
    const lo = measurementToLook(m, 0.1).params;
    const hi = measurementToLook(m, 0.2).params;
    expect(hi.lipIntensity!).toBeGreaterThan(lo.lipIntensity!);
    expect(hi.blushIntensity!).toBeGreaterThan(lo.blushIntensity!);
    expect(hi.eyeshadowIntensity!).toBeGreaterThan(lo.eyeshadowIntensity!);
  });

  test('게인이 커도 최종 intensity는 1로 클램프', () => {
    const {params} = measurementToLook(measure({lip: '#C0304A'}), 6);
    expect(params.lipIntensity!).toBeLessThanOrEqual(1);
    expect(params.lipIntensity!).toBe(1); // 0.7×5.5×6 → 클램프 1
  });

  test('gate로 꺼진 부위는 gain을 곱해도 되살아나지 않음', () => {
    // 립이 맨피부색이면 색차<gate → 0. 큰 gain에도 미포함.
    const {params} = measurementToLook(measure({lip: SKIN}), 6);
    expect(params.lipColor).toBeUndefined();
    expect(params.lipIntensity).toBeUndefined();
  });

  test('gain은 컬러렌즈 강도에도 적용', () => {
    // 렌즈도 기본 스케일이 곱해져 게인 1에선 포화 — 비례성은 저대역에서 검증.
    const lo = measurementToLook(measure({iris: '#3E6FA0', irisConf: 0.9}), 0.1)
      .lensLayers;
    const hi = measurementToLook(measure({iris: '#3E6FA0', irisConf: 0.9}), 0.2)
      .lensLayers;
    expect(hi[0].intensity).toBeGreaterThan(lo[0].intensity);
  });
});

describe('measurementToLook — 조명 하향(단일 곱, 이중곱 회귀 방지)', () => {
  // Unity 계약: 각 부위 conf = rawConf × lightingConf로 이미 접혀 전달된다.
  // RN이 lightingConf를 다시 곱하면 제곱이 되어 전 부위가 ~3%로 뭉치는 버그(회귀 방지).

  test('밝은 사진(lightingConf=1) 진한 립 → 절대 강도가 정상 대역(≥0.2)', () => {
    // rawConf=1, lightingConf=1 → 부위 conf=1. 이중곱이 있었다면 0.7×1=0.7로 동일하나
    // 아래 어두운 케이스와의 절대값 대비로 이중곱을 검출한다.
    const {params} = measurementToLook(measure({lip: '#C0304A', lipConf: 1}));
    expect(params.lipIntensity!).toBeGreaterThanOrEqual(0.2);
  });

  test('어두운 사진(부위 conf에 lighting 접힘) → 0 아님 · 단일 하향만 유지', () => {
    // 어두운 사진: lightingConf=0.3, Unity가 rawConf(1)×0.3=0.3을 부위 conf로 전달.
    // 기본 스케일 포화를 피해 이중곱 회귀를 절대값으로 검출하려 저게인(0.1)에서 비교한다.
    const G = 0.1;
    const bright = measurementToLook(
      measure({
        lip: '#C0304A',
        lipConf: 1,
        blush: '#E86B7A',
        blushConf: 1,
        eyeshadow: '#8A5A48',
        eyeshadowConf: 1,
        lightingConf: 1,
      }),
      G,
    ).params;
    const dim = measurementToLook(
      measure({
        lip: '#C0304A',
        lipConf: 0.3, // = rawConf 1 × lightingConf 0.3 (Unity가 접어 전달)
        blush: '#E86B7A',
        blushConf: 0.3,
        eyeshadow: '#8A5A48',
        eyeshadowConf: 0.3,
        lightingConf: 0.3,
      }),
      G,
    ).params;
    // 단일곱: base(0.7)×conf(0.3)×scale(5.5)×gain(0.1)≈0.116. 이중곱이면 ×0.3 더해 ≈0.035.
    // 라운딩 경계를 피해 두 값을 분리하는 대역으로 회귀를 검출한다.
    expect(dim.lipIntensity!).toBeGreaterThan(0.08); // 이중곱(≈0.035)이면 실패
    expect(dim.lipIntensity!).toBeLessThan(0.13);
    expect(dim.lipIntensity!).toBeGreaterThan(0);
    // 단일 하향은 유지 — 어두운 쪽이 밝은 쪽보다 낮아야 한다.
    expect(dim.lipIntensity!).toBeLessThan(bright.lipIntensity!);
    expect(dim.blushIntensity!).toBeLessThan(bright.blushIntensity!);
    expect(dim.eyeshadowIntensity!).toBeLessThan(bright.eyeshadowIntensity!);
  });
});
