/**
 * @format
 * 렌즈 레이어드(#25) — 3세부(베이스/내부/림) payload가 compileLayers/seedLayers/트리를
 * 통해 lensLayers 배열로 흐르는지, 하위호환(legacy irisColor/irisIntensity 무손상)이
 * 지켜지는지 검증. Unity 셰이더 4블렌드·존 마스크는 GPU라 여기선 데이터 모델만 본다.
 */
import type { LensLayer } from '../src/bridge/types';
import {
  MAX_LENS_LAYERS,
  compileLayers,
  newLayer,
  seedLayers,
  type ComposerLayer,
} from '../src/composer/model';
import {
  isLensRegion,
  LENS_BLEND_MODES,
  LENS_DEFAULTS,
  FINISH_ENUM_SEED,
  FINISH_STUDIO_SLIDERS,
} from '../src/composer/regions';
import {
  addRegionNode,
  buildSystemLibrary,
  emptyFaceLook,
  faceLookIdForPreset,
  flattenTree,
  instantiate,
  isLeaf,
  newRegionNode,
  stackLeaf,
} from '../src/composer/lookTree';
import { REGION_DEFS, REGION_GROUPS } from '../src/composer/regions';
import { BARE } from '../src/presets';

const lensLeaf = (
  region: 'lensBase' | 'lensDetail' | 'lensRim',
  over: Partial<LensLayer> = {},
): ComposerLayer => ({
  id: `t-${region}-${Math.random()}`,
  region,
  visible: true,
  params: {},
  lens: { ...LENS_DEFAULTS[region], ...over },
});

describe('iris 폐지 — 레이어드 렌즈로 이관', () => {
  test('카탈로그에 legacy iris 리전이 없다(렌즈 슬롯=레이어드 3세부만)', () => {
    expect(REGION_DEFS.some(d => (d.key as string) === 'iris')).toBe(false);
    const lensGroup = REGION_GROUPS.find(g => g.slot === '렌즈')!;
    expect(lensGroup.regions.map(d => d.key)).toEqual([
      'lensBase',
      'lensDetail',
      'lensRim',
    ]);
  });

  test('글램·스모키 프리셋은 lensBase 잎으로 이관됨(legacy irisIntensity=0)', () => {
    const lib = buildSystemLibrary();
    for (const [id, color, intensity] of [
      ['glam', '#5B7B8C', 0.5],
      ['smoky', '#7A6A9E', 0.55],
    ] as const) {
      const tree = instantiate(lib, faceLookIdForPreset(id))!;
      const compiled = compileLayers(flattenTree(tree));
      expect(compiled.lensLayers).toHaveLength(1);
      expect(compiled.lensLayers[0].part).toBe(0); // 베이스
      expect(compiled.lensLayers[0].color).toBe(color);
      expect(compiled.lensLayers[0].intensity).toBe(intensity);
      expect(compiled.params.irisIntensity).toBe(0); // legacy 경로 off
    }
  });
});

describe('렌즈 세부 판별·기본값', () => {
  test('isLensRegion — 3세부만 true, 그 외 부위는 false', () => {
    expect(isLensRegion('lensBase')).toBe(true);
    expect(isLensRegion('lensDetail')).toBe(true);
    expect(isLensRegion('lensRim')).toBe(true);
    expect(isLensRegion('deco')).toBe(false);
    expect(isLensRegion('lip')).toBe(false);
  });

  test('newLayer(렌즈 세부) — lens payload를 싣고 params는 비운다', () => {
    const base = newLayer('lensBase', BARE);
    expect(base.lens).toEqual(LENS_DEFAULTS.lensBase);
    expect(base.params).toEqual({});
    const rim = newLayer('lensRim', BARE);
    expect(rim.lens?.part).toBe(2);
  });
});

describe('compileLayers — 렌즈 배열 수집', () => {
  test('렌즈 세부 잎 → lensLayers에 모이고 overlayLayers·params(iris)는 불변', () => {
    const result = compileLayers([lensLeaf('lensBase')]);
    expect(result.lensLayers).toHaveLength(1);
    expect(result.lensLayers[0].part).toBe(0);
    expect(result.overlayLayers).toEqual([]);
    // 하위호환: 레이어드는 irisColor/irisIntensity를 건드리지 않는다(어댑터 경로 무손상).
    expect(result.params.irisIntensity).toBe(BARE.irisIntensity);
    expect(result.params.irisColor).toBe(BARE.irisColor);
  });

  test('세부 순서 고정 — 트리 순서와 무관하게 베이스<내부<림으로 정렬', () => {
    const result = compileLayers([
      lensLeaf('lensRim'),
      lensLeaf('lensDetail'),
      lensLeaf('lensBase'),
    ]);
    expect(result.lensLayers.map(l => l.part)).toEqual([0, 1, 2]);
  });

  test('같은 세부 겹 순서 보존(안정 정렬) — 삽입 순서 유지', () => {
    const a = lensLeaf('lensBase', { intensity: 0.5 });
    const b = lensLeaf('lensBase', { intensity: 0.2 });
    const result = compileLayers([a, b]);
    expect(result.lensLayers.map(l => l.intensity)).toEqual([0.5, 0.2]);
  });

  test('안 보이는 렌즈 잎은 컴파일에서 제외', () => {
    const hidden: ComposerLayer = { ...lensLeaf('lensBase'), visible: false };
    expect(compileLayers([hidden]).lensLayers).toEqual([]);
  });

  test(`MAX_LENS_LAYERS(${MAX_LENS_LAYERS}) 초과분은 잘린다`, () => {
    const many = Array.from({ length: MAX_LENS_LAYERS + 3 }, () => lensLeaf('lensBase'));
    expect(compileLayers(many).lensLayers).toHaveLength(MAX_LENS_LAYERS);
  });

  test('렌즈 없는 스택 → lensLayers 빈 배열(legacy 어댑터 경로)', () => {
    expect(compileLayers([newLayer('lip', BARE)]).lensLayers).toEqual([]);
    expect(compileLayers([]).lensLayers).toEqual([]);
  });
});

describe('seedLayers — 렌즈 라운드트립', () => {
  test('lensLayers → seedLayers → compileLayers 가 payload를 보존한다', () => {
    const src: LensLayer[] = [
      { part: 0, color: '#8A8F96', blendMode: 1, intensity: 0.5, inner: 0, outer: 1 },
      { part: 2, color: '#2A2A2E', blendMode: 1, intensity: 0.65, inner: 0.8, outer: 1 },
    ];
    const seeded = seedLayers(BARE, [], src);
    const compiled = compileLayers(seeded);
    expect(compiled.lensLayers).toEqual(src);
  });

  test('part → 부위 역매핑(0→lensBase, 1→lensDetail, 2→lensRim)', () => {
    const seeded = seedLayers(BARE, [], [
      { part: 1, color: '#fff', blendMode: 0, intensity: 0.4, inner: 0, outer: 0.4 },
    ]);
    const lensSeed = seeded.filter(l => isLensRegion(l.region));
    expect(lensSeed).toHaveLength(1);
    expect(lensSeed[0].region).toBe('lensDetail');
  });
});

describe('렌즈 블렌드 모드 확장(0~9)', () => {
  test('코드표 0~9가 순서대로·빠짐없이 선언됨 (Unity IrisRenderer 클램프 [0,9]와 1:1)', () => {
    expect(LENS_BLEND_MODES.map(m => m.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // 확장 코드 4~9 한국어 라벨 (커밋된 Unity 계약 코드표와 일치).
    const byValue = Object.fromEntries(LENS_BLEND_MODES.map(m => [m.value, m.label]));
    expect(byValue[4]).toBe('소프트라이트');
    expect(byValue[5]).toBe('컬러닷지');
    expect(byValue[6]).toBe('컬러번');
    expect(byValue[7]).toBe('라이튼');
    expect(byValue[8]).toBe('다큰');
    expect(byValue[9]).toBe('하드라이트');
  });

  test('기존 저장물(0~3) 라벨 무손상 — 값·의미 불변', () => {
    expect(LENS_BLEND_MODES.slice(0, 4).map(m => m.label)).toEqual([
      '노말',
      '멀티플라이',
      '스크린',
      '오버레이',
    ]);
  });

  test('blendMode payload가 compile을 그대로 통과(4~9 무변조)', () => {
    for (const bm of [4, 6, 9]) {
      const compiled = compileLayers([lensLeaf('lensBase', { blendMode: bm })]);
      expect(compiled.lensLayers[0].blendMode).toBe(bm);
    }
  });
});

describe('제형 마감 — 벨벳 시(sheen) 축', () => {
  test('FINISH_STUDIO_SLIDERS 6번째 축 = sheen', () => {
    expect(FINISH_STUDIO_SLIDERS.map(s => s.axis)).toContain('sheen');
  });

  test('FINISH_ENUM_SEED 전 enum(0~3)에서 sheen=0 (점프 결함 재발 방지)', () => {
    for (const v of [0, 1, 2, 3]) {
      expect(FINISH_ENUM_SEED[v].sheen).toBe(0);
    }
  });
});

describe('트리 — 렌즈 세부 겹 쌓기(stackLeaf)', () => {
  test('＋겹이 lens payload를 절반 농도로 복제해 flatten→compile에 실린다', () => {
    const region = newRegionNode('lensBase', BARE); // region › sub › leaf(1)
    const sub = region.kids.find(k => !isLeaf(k))!;
    const root = addRegionNode(emptyFaceLook(), region);
    const stacked = stackLeaf(root, sub.id);
    const compiled = compileLayers(flattenTree(stacked));
    expect(compiled.lensLayers).toHaveLength(2);
    // 원본 농도(LENS_DEFAULTS.lensBase.intensity=0.45)의 절반으로 겹이 시작.
    expect(compiled.lensLayers[0].intensity).toBe(LENS_DEFAULTS.lensBase.intensity);
    expect(compiled.lensLayers[1].intensity).toBeCloseTo(0.23, 2);
  });

  test('flattenTree가 렌즈 payload를 통과시킨다', () => {
    const node = newRegionNode('lensRim', BARE);
    const layers = flattenTree(node);
    expect(layers).toHaveLength(1);
    expect(layers[0].lens?.part).toBe(2);
  });
});
