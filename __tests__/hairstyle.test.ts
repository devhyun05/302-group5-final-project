/**
 * @format
 * 헤어스타일 추천 엔진 — 프로필(얼굴형·두상·모발)·세션 조건(기장·손질) 채점 규칙 검증.
 * 절대 순위 대신 상대 비교(같은 스타일이 조건에 따라 오르내리는가)로 검증해
 * 카탈로그 튜닝에 테스트가 덜 얽매이게 한다.
 */
import {
  DEFAULT_HAIR_CONTEXT,
  EFFORT_OPTIONS,
  HAIR_STYLES,
  LENGTH_OPTIONS,
  recommend,
  scoreStyle,
} from '../src/composer/hairstyle';
import type {HairContext} from '../src/composer/hairstyle';
import type {HairProfile} from '../src/composer/hairProfile';

const P = (o: Partial<HairProfile> = {}): HairProfile => ({
  lane: 'female',
  faceShape: 'oval',
  backHead: 'normal',
  crown: 'normal',
  texture: 'straight',
  thickness: 'medium',
  density: 'medium',
  createdAt: 0,
  ...o,
});

const C = (o: Partial<HairContext> = {}): HairContext => ({
  ...DEFAULT_HAIR_CONTEXT,
  ...o,
});

const styleById = (id: string) => HAIR_STYLES.find(s => s.id === id)!;

describe('recommend — 레인·기장 분류', () => {
  test('점수 내림차순으로 정렬된다', () => {
    const {picks} = recommend(P(), C());
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i - 1].score).toBeGreaterThanOrEqual(picks[i].score);
    }
  });

  test('레인에 맞는 스타일만 순위에 오른다', () => {
    const {picks} = recommend(P({lane: 'male'}), C());
    expect(picks.length).toBeGreaterThan(0);
    for (const s of picks) {
      expect(styleById(s.id).lane).toBe('male');
    }
  });

  test('기장 선호를 지정하면 picks는 해당 기장만, alternates는 나머지만 담는다', () => {
    const {picks, alternates} = recommend(P(), C({lengthPref: 'bob'}));
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every(s => s.length === 'bob')).toBe(true);
    expect(alternates.every(s => s.length !== 'bob')).toBe(true);
  });

  test('카탈로그에 없는 기장(남성 레인+단발)은 picks가 비고 alternates만 남는다', () => {
    const {picks, alternates} = recommend(P({lane: 'male'}), C({lengthPref: 'bob'}));
    expect(picks).toHaveLength(0);
    expect(alternates.length).toBeGreaterThan(0);
  });
});

describe('scoreStyle — 두상 규칙 (이 엔진의 차별점)', () => {
  test('두상을 드러내는 스타일(슬릭 롱)은 납작 뒤통수에서 점수가 깎이고 주의가 붙는다', () => {
    const sleek = styleById('sleek-long');
    const flat = scoreStyle(sleek, P({backHead: 'flat'}), C());
    const full = scoreStyle(sleek, P({backHead: 'full'}), C());
    expect(flat.score).toBeLessThan(full.score);
    expect(flat.cautions.join(' ')).toContain('뒤통수');
    // 볼록 두상에선 오히려 "두상 라인을 드러낸다"가 이유가 된다.
    expect(full.reasons.join(' ')).toContain('두상');
  });

  test('볼륨 스타일(C컬 보브)은 납작 뒤통수에서 보완 이유가 붙는다', () => {
    const r = scoreStyle(styleById('c-bob'), P({backHead: 'flat'}), C());
    expect(r.reasons.join(' ')).toContain('뒤통수');
  });

  test('납작 두상(뒤통수·정수리)에선 볼륨 펌이 무볼륨 컷을 앞선다 — 쉐도우펌 vs 크롭컷', () => {
    const profile = P({lane: 'male', backHead: 'flat', crown: 'flat', texture: 'wavy'});
    const {picks} = recommend(profile, C());
    const rank = (id: string) => picks.findIndex(s => s.id === id);
    expect(rank('shadow-perm')).toBeGreaterThanOrEqual(0);
    expect(rank('shadow-perm')).toBeLessThan(rank('crop'));
  });
});

describe('scoreStyle — 모발·손질 규칙', () => {
  test('직모 + 펌 스타일이면 시술 안내가 이유에 붙는다', () => {
    const r = scoreStyle(styleById('c-bob'), P({texture: 'straight'}), C());
    expect(r.reasons.join(' ')).toContain('펌');
  });

  test('맞지 않는 결(곱슬+태슬컷)은 주의가 붙고 어울리는 결보다 점수가 낮다', () => {
    const tassel = styleById('tassel');
    const curly = scoreStyle(tassel, P({texture: 'curly'}), C());
    const straight = scoreStyle(tassel, P({texture: 'straight'}), C());
    expect(curly.score).toBeLessThan(straight.score);
    expect(curly.cautions.join(' ')).toContain('잘 맞지 않아요');
  });

  test('숱 적음이면 풍성 스타일에 가산 이유가 붙는다', () => {
    const r = scoreStyle(styleById('shadow-perm'), P({lane: 'male', density: 'sparse'}), C());
    expect(r.reasons.join(' ')).toContain('숱');
  });

  test('손질 여유가 없는데 손이 많이 가는 스타일이면 주의가 붙고 점수가 깎인다', () => {
    const regent = styleById('regent');
    const busy = scoreStyle(regent, P({lane: 'male'}), C({effort: 'low'}));
    const relaxed = scoreStyle(regent, P({lane: 'male'}), C({effort: 'high'}));
    expect(busy.score).toBeLessThan(relaxed.score);
    expect(busy.cautions.join(' ')).toContain('스타일링');
  });
});

describe('recommend — 통합', () => {
  test('결정론적 — 같은 입력은 같은 결과', () => {
    const profile = P({faceShape: 'round', backHead: 'flat', texture: 'wavy'});
    expect(recommend(profile, C())).toEqual(recommend(profile, C()));
  });

  test('모든 프로필 조합에서 유효한 추천을 만든다 (스모크)', () => {
    const lanes = ['female', 'male'] as const;
    const faces = ['oval', 'round', 'square', 'long', 'heart', 'diamond'] as const;
    const backs = ['flat', 'normal', 'full'] as const;
    const crowns = ['flat', 'normal', 'high'] as const;
    const textures = ['straight', 'wavy', 'curly'] as const;
    const thicknesses = ['fine', 'medium', 'coarse'] as const;
    const densities = ['sparse', 'medium', 'dense'] as const;

    for (const lane of lanes)
      for (const faceShape of faces)
        for (const backHead of backs)
          for (const crown of crowns)
            for (const texture of textures)
              for (const thickness of thicknesses)
                for (const density of densities) {
                  const rec = recommend(
                    P({lane, faceShape, backHead, crown, texture, thickness, density}),
                    C(),
                  );
                  // 기장 무관이면 레인 카탈로그 전체가 순위에 오른다.
                  const laneCount = HAIR_STYLES.filter(s => s.lane === lane).length;
                  expect(rec.picks).toHaveLength(laneCount);
                  for (const s of rec.picks) {
                    expect(s.score).toBeGreaterThanOrEqual(0);
                    expect(s.score).toBeLessThanOrEqual(1);
                    expect(s.reasons.length).toBeGreaterThan(0);
                    expect(s.tips.length).toBeGreaterThan(0);
                  }
                  expect(rec.caveat.length).toBeGreaterThan(0);
                }
  });

  test('모든 세션 조건 조합에서도 유효하다 (기장×손질)', () => {
    for (const lane of ['female', 'male'] as const)
      for (const len of LENGTH_OPTIONS[lane])
        for (const effort of EFFORT_OPTIONS) {
          const rec = recommend(P({lane}), C({lengthPref: len.id, effort: effort.id}));
          const laneCount = HAIR_STYLES.filter(s => s.lane === lane).length;
          expect(rec.picks.length + rec.alternates.length).toBe(laneCount);
        }
  });
});
