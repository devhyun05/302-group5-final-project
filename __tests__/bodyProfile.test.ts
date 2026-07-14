/**
 * @format
 * bodyProfile — 체형 설문 구조·분류(실루엣 트리/골격 투표)·스토어 검증.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BODY_QUESTIONS,
  FRAME_STYLES,
  SILHOUETTE_STYLES,
  VALID_ANSWERS,
  analyzeBody,
  classifyFrame,
  classifySilhouette,
  isBodyProfile,
  summarizeBody,
  type BodyAnswerKey,
  type BodyBalance,
  type BodyProfile,
  type CollarFeel,
  type FleshFeel,
  type Frame,
  type FrameWidth,
  type Silhouette,
  type VolumeSpot,
  type WaistShape,
  type WristFeel,
} from '../src/composer/bodyProfile';
import {
  __resetForTests,
  clearBodyProfile,
  loadBodyProfile,
  saveBodyProfile,
} from '../src/storage/bodyProfileStore';

const PROFILE = (o: Partial<BodyProfile> = {}): BodyProfile => ({
  frameWidth: 'even',
  waist: 'defined',
  volume: 'spread',
  wrist: 'flat',
  collar: 'subtle',
  flesh: 'soft',
  balance: 'lowerBody',
  createdAt: 1,
  ...o,
});

describe('BODY_QUESTIONS — 설문 구조', () => {
  test('문항은 7개, 비율 3 → 골격 질감 4 순서', () => {
    expect(BODY_QUESTIONS).toHaveLength(7);
    expect(BODY_QUESTIONS.map(q => q.group)).toEqual([
      '비율',
      '비율',
      '비율',
      '골격 질감',
      '골격 질감',
      '골격 질감',
      '골격 질감',
    ]);
    // key는 프로필 답 필드를 중복 없이 전부 커버한다.
    expect(BODY_QUESTIONS.map(q => q.key).sort()).toEqual(
      (Object.keys(VALID_ANSWERS) as BodyAnswerKey[]).sort(),
    );
  });

  test('각 문항의 옵션 id는 해당 필드 유니온 값 전체를 빠짐없이 담는다', () => {
    for (const q of BODY_QUESTIONS) {
      expect(q.options.map(o => o.id).sort()).toEqual([...VALID_ANSWERS[q.key]].sort());
      for (const opt of q.options) {
        expect(opt.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('classifySilhouette — 결정론적 분기 트리', () => {
  test('가로 비율이 기울면 그쪽이 우선한다', () => {
    // 어깨 넓음 → 역삼각(허리·볼륨 무관)
    expect(classifySilhouette('shoulder', 'defined', 'lower')).toBe('inverted');
    expect(classifySilhouette('shoulder', 'straight', 'upper')).toBe('inverted');
    // 골반 넓음 → 삼각(허리·볼륨 무관)
    expect(classifySilhouette('hip', 'defined', 'upper')).toBe('pear');
    expect(classifySilhouette('hip', 'soft', 'spread')).toBe('pear');
  });

  test('균형 비율에서 허리·볼륨이 가른다', () => {
    expect(classifySilhouette('even', 'defined', 'spread')).toBe('hourglass');
    expect(classifySilhouette('even', 'straight', 'upper')).toBe('apple');
    expect(classifySilhouette('even', 'straight', 'spread')).toBe('rect');
    expect(classifySilhouette('even', 'soft', 'lower')).toBe('rect');
  });

  test('전 27조합이 유효한 실루엣을 낸다(총망라·무예외)', () => {
    const silhouettes = Object.keys(SILHOUETTE_STYLES) as Silhouette[];
    const seen = new Set<Silhouette>();
    for (const fw of VALID_ANSWERS.frameWidth as FrameWidth[]) {
      for (const w of VALID_ANSWERS.waist as WaistShape[]) {
        for (const v of VALID_ANSWERS.volume as VolumeSpot[]) {
          const s = classifySilhouette(fw, w, v);
          expect(silhouettes).toContain(s);
          seen.add(s);
        }
      }
    }
    // 5종 전부 도달 가능하다(죽은 분기 없음).
    expect([...seen].sort()).toEqual([...silhouettes].sort());
  });
});

describe('classifyFrame — 4문항 다수결 + 손목 동률 해소', () => {
  test('다수결 — 3표 이상이면 그 골격', () => {
    expect(classifyFrame('round', 'hidden', 'firm', 'upperBody')).toBe('straight');
    expect(classifyFrame('flat', 'subtle', 'soft', 'lowerBody')).toBe('wave');
    expect(classifyFrame('bony', 'sharp', 'sinewy', 'frame')).toBe('natural');
    // 3-1도 다수가 이긴다.
    expect(classifyFrame('round', 'hidden', 'firm', 'lowerBody')).toBe('straight');
  });

  test('2-1-1이면 2표 골격', () => {
    // straight 2(wrist·collar), wave 1, natural 1
    expect(classifyFrame('round', 'hidden', 'soft', 'frame')).toBe('straight');
  });

  test('2-2 동률이면 손목 답의 골격이 이긴다', () => {
    // wave 2(wrist·collar) vs natural 2(flesh·balance) → 손목=wave
    expect(classifyFrame('flat', 'subtle', 'sinewy', 'frame')).toBe('wave');
    // natural 2(wrist·collar) vs straight 2(flesh·balance) → 손목=natural
    expect(classifyFrame('bony', 'sharp', 'firm', 'upperBody')).toBe('natural');
  });

  test('전 81조합이 유효한 골격을 낸다(총망라·무예외)', () => {
    const frames = Object.keys(FRAME_STYLES) as Frame[];
    for (const w of VALID_ANSWERS.wrist as WristFeel[]) {
      for (const c of VALID_ANSWERS.collar as CollarFeel[]) {
        for (const f of VALID_ANSWERS.flesh as FleshFeel[]) {
          for (const b of VALID_ANSWERS.balance as BodyBalance[]) {
            expect(frames).toContain(classifyFrame(w, c, f, b));
          }
        }
      }
    }
  });
});

describe('analyzeBody · summarizeBody — 리포트 유도', () => {
  test('리포트는 분류 결과와 해당 콘텐츠·한계 고지를 담는다', () => {
    const r = analyzeBody(PROFILE());
    expect(r.silhouette).toBe('hourglass');
    expect(r.frame).toBe('wave');
    expect(r.silhouetteStyle).toBe(SILHOUETTE_STYLES.hourglass);
    expect(r.frameStyle).toBe(FRAME_STYLES.wave);
    expect(r.caveat.length).toBeGreaterThan(0);
  });

  test('같은 입력은 같은 결과(결정론)', () => {
    const p = PROFILE({frameWidth: 'shoulder', wrist: 'bony'});
    expect(analyzeBody(p)).toEqual(analyzeBody(p));
  });

  test('요약은 두 축 라벨을 중점(·)으로 잇는다', () => {
    expect(summarizeBody(PROFILE())).toBe('모래시계형 · 웨이브 골격');
    expect(
      summarizeBody(PROFILE({frameWidth: 'hip', wrist: 'bony', collar: 'sharp'})),
    ).toBe('삼각형(하체 볼륨) · 내추럴 골격');
  });

  test('모든 타입 콘텐츠는 라벨·추천·피할 것을 갖춘다', () => {
    for (const s of Object.values(SILHOUETTE_STYLES)) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.points.length).toBeGreaterThan(0);
      expect(s.avoid.length).toBeGreaterThan(0);
    }
    for (const f of Object.values(FRAME_STYLES)) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.points.length).toBeGreaterThan(0);
      expect(f.avoid.length).toBeGreaterThan(0);
    }
  });
});

describe('isBodyProfile — 손상 데이터 방어', () => {
  test('온전한 프로필은 통과', () => {
    expect(isBodyProfile(PROFILE())).toBe(true);
  });

  test('유니온 밖 값·필드 누락·비객체는 불통과', () => {
    expect(isBodyProfile(null)).toBe(false);
    expect(isBodyProfile('hourglass')).toBe(false);
    const noCreatedAt: Record<string, unknown> = {...PROFILE()};
    delete noCreatedAt.createdAt;
    expect(isBodyProfile(noCreatedAt)).toBe(false);
    expect(isBodyProfile({...PROFILE(), waist: 'curvy'})).toBe(false); // 유니온 밖
    expect(isBodyProfile({...PROFILE(), wrist: 'thick'})).toBe(false);
    expect(isBodyProfile({...PROFILE(), createdAt: '1'})).toBe(false); // 타입 불일치
  });
});

describe('bodyProfileStore — 저장 라운드트립·손상 방어', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetForTests();
  });

  test('저장한 프로필을 그대로 읽어온다', async () => {
    const p = PROFILE({frameWidth: 'hip', createdAt: 42});
    await saveBodyProfile(p);
    __resetForTests(); // 미러를 비워 실제 저장소에서 재로드
    expect(await loadBodyProfile()).toEqual(p);
  });

  test('저장된 값이 없으면 null', async () => {
    expect(await loadBodyProfile()).toBeNull();
  });

  test('손상 데이터는 null로 폴백', async () => {
    await AsyncStorage.setItem(
      'armakeup.bodyProfile.v1',
      JSON.stringify({frameWidth: 'oops', createdAt: 1}),
    );
    __resetForTests();
    expect(await loadBodyProfile()).toBeNull();
  });

  test('clear 후에는 null', async () => {
    await saveBodyProfile(PROFILE());
    await clearBodyProfile();
    expect(await loadBodyProfile()).toBeNull();
    __resetForTests();
    expect(await loadBodyProfile()).toBeNull(); // 영속층에서도 지워졌다
  });
});
