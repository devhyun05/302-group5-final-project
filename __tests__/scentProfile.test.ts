/**
 * @format
 * scentProfile — 체향 프로필 로직·스토어·추천 반영(#7 보강) 검증.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PROFILE_QUESTIONS,
  isScentProfile,
  profileFactors,
  summarizeProfile,
  type ScentProfile,
} from '../src/composer/scentProfile';
import {
  __resetForTests,
  clearScentProfile,
  loadScentProfile,
  saveScentProfile,
} from '../src/storage/scentProfileStore';
import {recommend} from '../src/composer/perfume';
import type {PerfumeContext} from '../src/composer/perfume';

const PROFILE = (o: Partial<ScentProfile> = {}): ScentProfile => ({
  skin: 'oily',
  fade: 'normal',
  warmth: 'neutral',
  createdAt: 1,
  ...o,
});

const CTX = (o: Partial<PerfumeContext> = {}): PerfumeContext => ({
  skin: 'normal',
  climate: 'mild',
  humidity: 'normal',
  occasion: 'date',
  intensity: 'moderate',
  ...o,
});

// 각 문항 key가 채우는 필드의 유효 유니온 값(옵션 id는 이 안에 있어야 UI가 그대로 캐스팅한다).
const VALID_IDS: Record<'skin' | 'fade' | 'warmth', string[]> = {
  skin: ['dry', 'normal', 'oily'],
  fade: ['fast', 'normal', 'slow'],
  warmth: ['cool', 'neutral', 'warm'],
};

describe('PROFILE_QUESTIONS — 설문 구조', () => {
  test('문항은 3개, 순서는 skin → fade → warmth', () => {
    expect(PROFILE_QUESTIONS).toHaveLength(3);
    expect(PROFILE_QUESTIONS.map(q => q.key)).toEqual(['skin', 'fade', 'warmth']);
  });

  test('모든 옵션 id는 해당 필드의 유효 유니온 값이다', () => {
    for (const q of PROFILE_QUESTIONS) {
      expect(q.options.length).toBeGreaterThan(0);
      for (const opt of q.options) {
        expect(VALID_IDS[q.key]).toContain(opt.id);
        expect(opt.label.length).toBeGreaterThan(0);
      }
    }
  });

  test('각 문항의 옵션 id는 유효 유니온 값 전체를 빠짐없이 담는다', () => {
    for (const q of PROFILE_QUESTIONS) {
      expect(q.options.map(o => o.id).sort()).toEqual([...VALID_IDS[q.key]].sort());
    }
  });
});

describe('profileFactors — 개인 보정 계수', () => {
  test('프로필 미설정(null/undefined)이면 무보정', () => {
    expect(profileFactors(null)).toEqual({longevity: 1, projection: 0});
    expect(profileFactors(undefined)).toEqual({longevity: 1, projection: 0});
  });

  test('지속 배수는 fade가 빠를수록 작다 (fast < normal < slow)', () => {
    const fast = profileFactors(PROFILE({fade: 'fast'})).longevity;
    const normal = profileFactors(PROFILE({fade: 'normal'})).longevity;
    const slow = profileFactors(PROFILE({fade: 'slow'})).longevity;
    expect(fast).toBeLessThan(normal);
    expect(normal).toBeLessThan(slow);
  });

  test('확산 가감은 열감이 높을수록 크다 (cool < neutral < warm)', () => {
    const cool = profileFactors(PROFILE({warmth: 'cool'})).projection;
    const neutral = profileFactors(PROFILE({warmth: 'neutral'})).projection;
    const warm = profileFactors(PROFILE({warmth: 'warm'})).projection;
    expect(cool).toBeLessThan(neutral);
    expect(neutral).toBeLessThan(warm);
    expect(warm).toBeGreaterThan(cool);
  });

  test('지속은 fade·warmth 배수의 곱으로 결합된다', () => {
    // fast(0.85) × cool(1.05)
    expect(profileFactors(PROFILE({fade: 'fast', warmth: 'cool'})).longevity).toBeCloseTo(
      0.85 * 1.05,
    );
  });
});

describe('summarizeProfile — 한 줄 요약', () => {
  test('세 필드를 중점(·)으로 잇는다', () => {
    expect(summarizeProfile(PROFILE({skin: 'oily', fade: 'fast', warmth: 'warm'}))).toBe(
      '지성 피부 · 향 빨리 사라짐 · 열감 높음',
    );
    expect(summarizeProfile(PROFILE({skin: 'dry', fade: 'slow', warmth: 'cool'}))).toBe(
      '건성 피부 · 향 오래 남음 · 체온 낮음',
    );
  });
});

describe('isScentProfile — 손상 데이터 방어', () => {
  test('온전한 프로필은 통과', () => {
    expect(isScentProfile(PROFILE())).toBe(true);
  });

  test('유니온 밖 값·필드 누락·비객체는 불통과', () => {
    expect(isScentProfile(null)).toBe(false);
    expect(isScentProfile('oily')).toBe(false);
    expect(isScentProfile({skin: 'oily', fade: 'normal', warmth: 'neutral'})).toBe(false); // createdAt 없음
    expect(isScentProfile({...PROFILE(), skin: 'combination'})).toBe(false); // 유니온 밖
    expect(isScentProfile({...PROFILE(), warmth: 'hot'})).toBe(false);
    expect(isScentProfile({...PROFILE(), createdAt: '1'})).toBe(false); // 타입 불일치
  });
});

describe('scentProfileStore — 저장 라운드트립·손상 방어', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetForTests();
  });

  test('저장한 프로필을 그대로 읽어온다', async () => {
    const p = PROFILE({skin: 'dry', fade: 'slow', warmth: 'cool', createdAt: 42});
    await saveScentProfile(p);
    __resetForTests(); // 미러를 비워 실제 저장소에서 재로드
    expect(await loadScentProfile()).toEqual(p);
  });

  test('저장된 값이 없으면 null', async () => {
    expect(await loadScentProfile()).toBeNull();
  });

  test('손상 데이터는 null로 폴백', async () => {
    await AsyncStorage.setItem(
      'armakeup.scentProfile.v1',
      JSON.stringify({skin: 'oops', createdAt: 1}),
    );
    __resetForTests();
    expect(await loadScentProfile()).toBeNull();
  });

  test('clear 후에는 null', async () => {
    await saveScentProfile(PROFILE());
    await clearScentProfile();
    expect(await loadScentProfile()).toBeNull();
    __resetForTests();
    expect(await loadScentProfile()).toBeNull(); // 영속층에서도 지워졌다
  });
});

describe('recommend — 체향 프로필 반영', () => {
  test('프로필이 없으면 기존과 완전히 동일한 결과', () => {
    const ctx = CTX({climate: 'hot', occasion: 'date'});
    const base = recommend(ctx);
    expect(recommend(ctx, null)).toEqual(base);
    expect(recommend(ctx, undefined)).toEqual(base);
  });

  test('fade가 빠를수록 예측 지속이 짧아진다', () => {
    const ctx = CTX();
    const fast = recommend(ctx, PROFILE({fade: 'fast'})).longevityHours;
    const normal = recommend(ctx, PROFILE({fade: 'normal'})).longevityHours;
    const slow = recommend(ctx, PROFILE({fade: 'slow'})).longevityHours;
    expect(fast).toBeLessThanOrEqual(normal);
    expect(normal).toBeLessThanOrEqual(slow);
    expect(fast).toBeLessThan(slow);
  });

  test('열감이 높을수록 확산이 커진다', () => {
    const ctx = CTX();
    const warm = recommend(ctx, PROFILE({warmth: 'warm'})).projection;
    const cool = recommend(ctx, PROFILE({warmth: 'cool'})).projection;
    expect(warm).toBeGreaterThan(cool);
  });

  test('fast 체질·warm 체질에 개인화 팁이 붙는다', () => {
    const ctx = CTX();
    const fastTips = recommend(ctx, PROFILE({fade: 'fast'})).tips;
    expect(fastTips.some(t => t.includes('재분사'))).toBe(true);
    const warmTips = recommend(ctx, PROFILE({warmth: 'warm'})).tips;
    expect(warmTips.some(t => t.includes('분사 수를 한 번 줄이'))).toBe(true);
    // 반대 조건에선 해당 팁이 없다.
    const calm = recommend(ctx, PROFILE({fade: 'slow', warmth: 'cool'})).tips;
    expect(calm.some(t => t.includes('재분사'))).toBe(false);
  });

  test('프로필을 넣어도 결정론적 — 같은 입력은 같은 결과', () => {
    const ctx = CTX({climate: 'hot'});
    const p = PROFILE({fade: 'fast', warmth: 'warm'});
    expect(recommend(ctx, p)).toEqual(recommend(ctx, p));
  });
});
