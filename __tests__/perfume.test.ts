import {
  CLIMATE_OPTIONS,
  HUMIDITY_OPTIONS,
  INTENSITY_OPTIONS,
  OCCASION_OPTIONS,
  SKIN_OPTIONS,
  predictLongevity,
  predictProjection,
  rankFamilies,
  recommend,
  recommendConcentration,
} from '../src/composer/perfume';
import type {PerfumeContext} from '../src/composer/perfume';

const CTX = (o: Partial<PerfumeContext> = {}): PerfumeContext => ({
  skin: 'normal',
  climate: 'mild',
  humidity: 'normal',
  occasion: 'daily',
  intensity: 'moderate',
  ...o,
});

describe('predictLongevity — 체질·환경 배수', () => {
  test('유분이 많을수록 오래 간다 (건성<중성<지성)', () => {
    const dry = predictLongevity(CTX({skin: 'dry'}), 'edp', 'woody');
    const normal = predictLongevity(CTX({skin: 'normal'}), 'edp', 'woody');
    const oily = predictLongevity(CTX({skin: 'oily'}), 'edp', 'woody');
    expect(dry).toBeLessThan(normal);
    expect(normal).toBeLessThan(oily);
  });

  test('더울수록 빨리 사라진다 (추움>선선>더움)', () => {
    const cold = predictLongevity(CTX({climate: 'cold'}), 'edp', 'woody');
    const mild = predictLongevity(CTX({climate: 'mild'}), 'edp', 'woody');
    const hot = predictLongevity(CTX({climate: 'hot'}), 'edp', 'woody');
    expect(hot).toBeLessThan(mild);
    expect(mild).toBeLessThan(cold);
  });

  test('농도가 높을수록 오래 간다', () => {
    const edt = predictLongevity(CTX(), 'edt', 'woody');
    const parfum = predictLongevity(CTX(), 'parfum', 'woody');
    expect(parfum).toBeGreaterThan(edt);
  });
});

describe('recommendConcentration — 상황 규칙', () => {
  test('오피스는 EDP를 넘지 않는다 (강함 선호여도)', () => {
    const r = recommendConcentration(CTX({occasion: 'office', intensity: 'bold'}));
    expect(r.id).toBe('edp');
  });

  test('이브닝은 최소 EDP (은은 선호여도)', () => {
    const r = recommendConcentration(CTX({occasion: 'evening', intensity: 'subtle'}));
    expect(['edp', 'parfum']).toContain(r.id);
  });

  test('건성은 지속 보완을 위해 농도를 올린다', () => {
    const normal = recommendConcentration(CTX({skin: 'normal', occasion: 'daily', intensity: 'subtle'}));
    const dry = recommendConcentration(CTX({skin: 'dry', occasion: 'daily', intensity: 'subtle'}));
    expect(normal.id).toBe('edt');
    expect(dry.id).toBe('edp');
  });
});

describe('rankFamilies — 조건별 계열', () => {
  test('점수 내림차순으로 정렬된다', () => {
    const ranked = rankFamilies(CTX());
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  test('더운 날 액티브·은은 → 아쿠아틱이 1순위', () => {
    const top = rankFamilies(CTX({climate: 'hot', occasion: 'active', intensity: 'subtle'}))[0];
    expect(top.id).toBe('aquatic');
  });

  test('추운 이브닝·강함 → 앰버가 1순위', () => {
    const top = rankFamilies(CTX({climate: 'cold', occasion: 'evening', intensity: 'bold'}))[0];
    expect(top.id).toBe('amber');
  });

  test('각 계열은 이유를 최소 하나 갖는다', () => {
    for (const f of rankFamilies(CTX())) {
      expect(f.reasons.length).toBeGreaterThan(0);
      expect(f.reasons.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('predictProjection — 확산', () => {
  test('열에 피어나는 계열(앰버)은 더울 때 확산이 커진다', () => {
    const hot = predictProjection(CTX({climate: 'hot'}), 'edp', 'amber');
    const cold = predictProjection(CTX({climate: 'cold'}), 'edp', 'amber');
    expect(hot).toBeGreaterThan(cold);
  });

  test('습할수록 확산이 커진다', () => {
    const humid = predictProjection(CTX({humidity: 'humid'}), 'edp', 'floral');
    const dry = predictProjection(CTX({humidity: 'dry'}), 'edp', 'floral');
    expect(humid).toBeGreaterThan(dry);
  });

  test('0..1 범위로 클램프된다', () => {
    const p = predictProjection(CTX({climate: 'hot', humidity: 'humid', skin: 'oily'}), 'parfum', 'amber');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('recommend — 통합', () => {
  test('시간축은 탑·미들·베이스 3단, 강도는 0..1', () => {
    const {timeline} = recommend(CTX());
    expect(timeline.map(p => p.key)).toEqual(['top', 'heart', 'base']);
    for (const p of timeline) {
      expect(p.intensity).toBeGreaterThanOrEqual(0);
      expect(p.intensity).toBeLessThanOrEqual(1);
    }
  });

  test('결정론적 — 같은 입력은 같은 결과', () => {
    expect(recommend(CTX({climate: 'hot', occasion: 'date'}))).toEqual(
      recommend(CTX({climate: 'hot', occasion: 'date'})),
    );
  });

  test('모든 입력 조합에서 유효한 추천을 만든다', () => {
    for (const skin of SKIN_OPTIONS)
      for (const climate of CLIMATE_OPTIONS)
        for (const humidity of HUMIDITY_OPTIONS)
          for (const occasion of OCCASION_OPTIONS)
            for (const intensity of INTENSITY_OPTIONS) {
              const rec = recommend({
                skin: skin.id,
                climate: climate.id,
                humidity: humidity.id,
                occasion: occasion.id,
                intensity: intensity.id,
              });
              expect(rec.families.length).toBeGreaterThanOrEqual(1);
              expect(rec.families.length).toBeLessThanOrEqual(4);
              expect(rec.longevityHours).toBeGreaterThan(0);
              expect(rec.tips.length).toBeGreaterThan(0);
              expect(rec.caveat.length).toBeGreaterThan(0);
              expect(rec.timeline).toHaveLength(3);
            }
  });
});
