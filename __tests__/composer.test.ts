/**
 * @format
 * composer/model — 레이어 스택 ↔ 브리지 재료(FilterParams + OverlayLayer[]) 변환 검증.
 * "모델은 RN에만, 브리지엔 컴파일된 커맨드만"(설계 섹션 00) — compileLayers/seedLayers는
 * 순수 함수이므로 RN 컴포넌트 렌더링 없이 입출력만 검증한다.
 */
import type { OverlayLayer } from '../src/bridge/types';
import {
  BUILTIN_DOT,
  MAX_OVERLAY_LAYERS,
  compileLayers,
  newLayer,
  seedLayers,
  type ComposerLayer,
} from '../src/composer/model';
import {
  DECO_REGION_KEYS,
  isDecoRegion,
  regionOwnKeys,
  REGION_GROUPS,
  REGION_MAP,
} from '../src/composer/regions';
import { BARE, PRESETS } from '../src/presets';

const natural = PRESETS.find(p => p.id === 'natural')!;

const sampleOverlay = (over: Partial<OverlayLayer> = {}): OverlayLayer => ({
  path: BUILTIN_DOT,
  intensity: 0.7,
  x: 0.35,
  y: 0.4,
  scale: 0.3,
  rotation: 0,
  blendMode: 1,
  color: '#F08FA0',
  ...over,
});

describe('compileLayers', () => {
  test('빈 스택 → params는 BARE 그대로, overlayLayers는 빈 배열', () => {
    const result = compileLayers([]);
    expect(result.params).toEqual(BARE);
    expect(result.overlayLayers).toEqual([]);
  });

  test('carry의 부위 밖 필드(얼굴형 워프)는 컴파일이 보존한다', () => {
    // 워프는 어느 부위 레이어도 소유하지 않는다 — BARE 리셋에 휩쓸리면
    // 컴포저에서 레이어 하나만 편집해도 얼굴형 보정이 소실된다(리뷰 확정 버그).
    const carry = { ...BARE, eyeEnlarge: 0.5, jawWidth: -0.3, chinLength: 0.2 };
    const result = compileLayers([newLayer('lip', BARE)], carry);
    expect(result.params.eyeEnlarge).toBe(0.5);
    expect(result.params.jawWidth).toBe(-0.3);
    expect(result.params.chinLength).toBe(0.2);
    // 부위 소유 필드는 여전히 레이어가 지배한다 (carry의 립은 무시).
    const carryLip = { ...carry, lipIntensity: 0.99 };
    expect(compileLayers([newLayer('lip', BARE)], carryLip).params.lipIntensity).toBe(0.6);
  });

  test('립 레이어 하나 → lipIntensity는 defaults값, 다른 부위 필드는 BARE 그대로', () => {
    const layer = newLayer('lip', BARE);
    const result = compileLayers([layer]);
    // 기대값을 region defaults 참조로 — defaults에 필드가 늘어도(립 입자 9종 등)
    // 이 테스트의 의도("켠 부위는 defaults, 나머지는 BARE")는 그대로 검증된다.
    expect(result.params).toEqual({ ...BARE, ...REGION_MAP.lip.defaults });
    expect(result.params.lipIntensity).toBe(0.6);
  });

  test('visible=false 레이어는 컴파일에서 제외된다 (필드가 BARE=0으로 남는다)', () => {
    const layer = newLayer('lip', BARE);
    layer.visible = false;
    const result = compileLayers([layer]);
    expect(result.params).toEqual(BARE);
    expect(result.params.lipIntensity).toBe(0);
  });

  test('같은 부위 레이어 둘이면 나중(위) 레이어가 이긴다', () => {
    const first: ComposerLayer = {
      id: 'a',
      region: 'lip',
      visible: true,
      params: { lipIntensity: 0.3 },
    };
    const second: ComposerLayer = {
      id: 'b',
      region: 'lip',
      visible: true,
      params: { lipIntensity: 0.9 },
    };
    const result = compileLayers([first, second]);
    expect(result.params.lipIntensity).toBe(0.9);
  });

  test('데코 레이어 → overlayLayers에 들어가고 faceOverlayIntensity가 자동으로 켜진다', () => {
    const layer = newLayer('deco', BARE);
    const result = compileLayers([layer]);
    expect(result.overlayLayers).toEqual([layer.overlay]);
    expect(result.params.faceOverlayIntensity).toBe(0.85);
    expect(layer.overlay?.path).toBe(BUILTIN_DOT);
  });

  test('데코 레이어 5장 이상이면 MAX_OVERLAY_LAYERS장까지만 컴파일된다', () => {
    const layers = Array.from({ length: 5 }, (_, i) => ({
      id: `d${i}`,
      region: 'deco' as const,
      visible: true,
      params: {},
      overlay: sampleOverlay({ x: i / 10 }),
    }));
    const result = compileLayers(layers);
    expect(result.overlayLayers).toHaveLength(MAX_OVERLAY_LAYERS);
    // compileLayers가 세부부위(kind)를 오버레이에 각인(왕복 보존) — 원본 leaf.region='deco'(점).
    expect(result.overlayLayers).toEqual(
      layers.slice(0, MAX_OVERLAY_LAYERS).map(l => ({ ...l.overlay, kind: 'deco' })),
    );
  });

  test('데코 배열 순서 = 레이어 스택 순서 (그리기 순서 보존)', () => {
    const layers = ['a', 'b', 'c'].map(tag => ({
      id: tag,
      region: 'deco' as const,
      visible: true,
      params: {},
      overlay: sampleOverlay({ path: `builtin:${tag}` }),
    }));
    const result = compileLayers(layers);
    expect(result.overlayLayers.map(o => o.path)).toEqual([
      'builtin:a',
      'builtin:b',
      'builtin:c',
    ]);
  });

  // 디자이너 마스크(모양 축) 룩 전환 화해의 전제 — App.reconcileMasks가 compiled.params의
  // *MaskImported 마커를 보고 부위별 set/clear를 정하므로, 마커가 룩을 따라다녀야 한다.
  test('마스크 적용 마커가 컴파일 결과에 실려 룩을 따라다닌다 (룩 누수 방지 전제)', () => {
    const withMask: ComposerLayer = {
      id: 'a',
      region: 'blush',
      visible: true,
      params: { blushIntensity: 0.5, blushMaskImported: 1 },
    };
    // A룩(마스크 있음) → 마커 1이 살아 화해 경로가 setRegionMask를 낸다.
    expect(compileLayers([withMask]).params.blushMaskImported).toBe(1);
    // B룩(블러셔는 있으나 마스크 없음) → 마커 0 → 화해가 절차 마스크로 clear.
    const noMask = newLayer('blush', BARE);
    expect(compileLayers([noMask]).params.blushMaskImported ?? 0).toBe(0);
  });

  test('maskImport 컨트롤의 appliedKey가 regionOwnKeys에 포함돼 시드 왕복에서 보존된다', () => {
    // seedLayers는 regionOwnKeys(def)로 부위 소유 필드를 옮긴다 — 마커가 빠지면
    // 저장 룩 재편집 시 마스크 적용 상태가 사라진다.
    expect(regionOwnKeys(REGION_MAP.blush)).toContain('blushMaskImported');
    expect(regionOwnKeys(REGION_MAP.highlighter)).toContain('highlightMaskImported');
    expect(regionOwnKeys(REGION_MAP.contour)).toContain('contourMaskImported');
    expect(regionOwnKeys(REGION_MAP.eyeshadow)).toContain('eyeshadowMaskImported');
  });

  test('제형 스튜디오(#21) 마감 세부 필드가 regionOwnKeys에 포함돼 시드 왕복에서 보존된다', () => {
    // finish 컨트롤의 detail 5종이 부위 소유가 아니면 저장 제형이 재편집 시 사라진다.
    for (const k of ['lipGlossLo', 'lipGlossGain', 'lipShimmerSize', 'lipShimmerDensity', 'lipMatte'])
      expect(regionOwnKeys(REGION_MAP.lip)).toContain(k);
    for (const k of ['eyeshadowGlossLo', 'eyeshadowGlossGain', 'eyeshadowShimmerSize', 'eyeshadowShimmerDensity', 'eyeshadowMatte'])
      expect(regionOwnKeys(REGION_MAP.eyeshadow)).toContain(k);
    for (const k of ['blushGlossLo', 'blushGlossGain', 'blushShimmerSize', 'blushShimmerDensity', 'blushMatte'])
      expect(regionOwnKeys(REGION_MAP.blush)).toContain(k);
  });

  test('제형 스튜디오 커스텀 제형이 컴파일·시드 왕복을 보존한다', () => {
    // 커스텀 제형 = 립 잎에 세부값을 얹은 상태. compile → seed 왕복에서 값 유지.
    const lip = newLayer('lip', BARE);
    lip.params = { ...lip.params, lipMatte: 0.6, lipGlossGain: 0.3 };
    const compiled = compileLayers([lip]).params;
    expect(compiled.lipMatte).toBe(0.6);
    expect(compiled.lipGlossGain).toBe(0.3);
    const reseeded = seedLayers(compiled, []).find(l => l.region === 'lip');
    expect(reseeded?.params.lipMatte).toBe(0.6);
    expect(reseeded?.params.lipGlossGain).toBe(0.3);
    // 세부 미지정(BARE)이면 컴파일 결과에 안 담긴다 → enum 레거시 경로(하위호환).
    const bareLip = compileLayers([newLayer('lip', BARE)]).params;
    expect(bareLip.lipMatte ?? 0).toBe(0);
    expect(bareLip.lipGlossGain ?? 0).toBe(0);
  });

  test('벨벳 시(sheen, ④) 필드가 regionOwnKeys에 포함돼 시드 왕복에서 보존된다', () => {
    expect(regionOwnKeys(REGION_MAP.lip)).toContain('lipSheen');
    expect(regionOwnKeys(REGION_MAP.eyeshadow)).toContain('eyeshadowSheen');
    expect(regionOwnKeys(REGION_MAP.blush)).toContain('blushSheen');
  });

  test('sheen 값이 compile→seed 왕복을 보존하고, 미설정=0(하위호환)', () => {
    const lip = newLayer('lip', BARE);
    lip.params = { ...lip.params, lipSheen: 0.7 };
    const compiled = compileLayers([lip]).params;
    expect(compiled.lipSheen).toBe(0.7);
    const reseeded = seedLayers(compiled, []).find(l => l.region === 'lip');
    expect(reseeded?.params.lipSheen).toBe(0.7);
    // sheen만 켜도 마감 5축 합은 0 유지 → 셰이더 enum 레거시 경로 무손상(바이트 동일 근거).
    expect(compiled.lipMatte ?? 0).toBe(0);
    expect(compiled.lipGlossLo ?? 0).toBe(0);
    // 미설정이면 컴파일에 안 담긴다(JsonUtility 0 = 무효).
    expect(compileLayers([newLayer('lip', BARE)]).params.lipSheen ?? 0).toBe(0);
  });

  // ── 아이섀도 하(A3, 하안검 아래 섀도 밴드) 컴파일/왕복 회귀 가드 ──────────────
  test('eyeshadowLower 레이어 하나 → intensity는 region defaults값, 색 필드도 채워진다', () => {
    const layer = newLayer('eyeshadowLower', BARE);
    const result = compileLayers([layer]);
    expect(result.params.eyeshadowLowerIntensity).toBe(
      REGION_MAP.eyeshadowLower.defaults.eyeshadowLowerIntensity,
    );
    expect(result.params.eyeshadowLowerIntensity).toBe(0.3);
    expect(result.params.eyeshadowLowerColor).toBeTruthy();
  });

  test('eyeshadowLower 강도 0 → 상(eyeshadow) 필드는 영향받지 않는다 (룩 불변 회귀 가드)', () => {
    const layer: ComposerLayer = {
      id: 'esLower0',
      region: 'eyeshadowLower',
      visible: true,
      params: { eyeshadowLowerIntensity: 0 },
    };
    const result = compileLayers([layer]);
    const baseline = compileLayers([]).params;
    expect(result.params.eyeshadowIntensity).toBe(baseline.eyeshadowIntensity);
    expect(result.params.eyeshadowColor).toBe(baseline.eyeshadowColor);
    expect(result.params.eyeshadowLowerIntensity).toBe(0);
  });

  test('상(eyeshadow)·하(eyeshadowLower)를 함께 컴파일해도 서로 필드를 덮지 않는다', () => {
    const upper: ComposerLayer = {
      id: 'esUpper',
      region: 'eyeshadow',
      visible: true,
      params: { eyeshadowColor: '#111111', eyeshadowIntensity: 0.5 },
    };
    const lower: ComposerLayer = {
      id: 'esLower',
      region: 'eyeshadowLower',
      visible: true,
      params: { eyeshadowLowerColor: '#222222', eyeshadowLowerIntensity: 0.6 },
    };
    const result = compileLayers([upper, lower]);
    expect(result.params.eyeshadowColor).toBe('#111111');
    expect(result.params.eyeshadowIntensity).toBe(0.5);
    expect(result.params.eyeshadowLowerColor).toBe('#222222');
    expect(result.params.eyeshadowLowerIntensity).toBe(0.6);
  });

  test('eyeshadowLower 라운드트립 — regionOwnKeys 4필드가 compile→seed에서 보존된다 (REGION_OWNED 누락 회귀 가드)', () => {
    expect(regionOwnKeys(REGION_MAP.eyeshadowLower)).toEqual(
      expect.arrayContaining([
        'eyeshadowLowerIntensity',
        'eyeshadowLowerColor',
        'eyeshadowLowerFinish',
        'eyeshadowLowerShimmer',
      ]),
    );
    const layer = newLayer('eyeshadowLower', BARE);
    layer.params = {
      ...layer.params,
      eyeshadowLowerColor: '#334455',
      eyeshadowLowerFinish: 3,
      eyeshadowLowerShimmer: 0.8,
    };
    const compiled = compileLayers([layer]).params;
    const reseeded = seedLayers(compiled, []).find(l => l.region === 'eyeshadowLower');
    expect(reseeded?.params.eyeshadowLowerIntensity).toBe(compiled.eyeshadowLowerIntensity);
    expect(reseeded?.params.eyeshadowLowerColor).toBe('#334455');
    expect(reseeded?.params.eyeshadowLowerFinish).toBe(3);
    expect(reseeded?.params.eyeshadowLowerShimmer).toBe(0.8);
  });
});

describe('seedLayers', () => {
  test('BARE(전부 0) → 빈 배열', () => {
    expect(seedLayers(BARE, [])).toEqual([]);
  });

  test("'내추럴' 프리셋 → 강도>0인 부위마다 레이어가 생기고, 각 레이어에 부위 소유 필드가 들어있다", () => {
    const layers = seedLayers(natural.params, []);
    // 내추럴 강도>0 부위: 톤·질감(피부)·블러셔·아이섀도·아이라인(상)·눈썹 결·눈썹 채움·립.
    // 순서는 REGION_DEFS 선언 순(카탈로그 스택). 눈썹은 결(brow)·채움(browPowder)
    // 두 제품이 각각 켜져 별도 부위로 분해된다(#19b 눈썹 제품 분리).
    expect(layers.map(l => l.region)).toEqual([
      'tone',
      'skin',
      'blush',
      'eyeshadow',
      'eyelinerUpper',
      'brow',
      'browPowder',
      'lip',
    ]);

    const lipLayer = layers.find(l => l.region === 'lip')!;
    expect(lipLayer.params.lipColor).toBe(natural.params.lipColor);
    expect(lipLayer.params.lipIntensity).toBe(natural.params.lipIntensity);
    // 립 레이어는 립 소유 필드만 담는다 (다른 부위 필드가 섞이지 않는다)
    expect(Object.keys(lipLayer.params)).toEqual(
      expect.arrayContaining(['lipColor', 'lipIntensity']),
    );
    for (const key of Object.keys(lipLayer.params)) {
      expect(regionOwnKeys(REGION_MAP.lip)).toContain(key);
    }

    const blushLayer = layers.find(l => l.region === 'blush')!;
    expect(blushLayer.params.blushColor).toBe(natural.params.blushColor);
    expect(blushLayer.params.blushIntensity).toBe(natural.params.blushIntensity);
  });

  test("라운드트립: seedLayers → compileLayers, 부위 소유 필드가 원본과 같고 overlayLayers도 보존된다 ('내추럴')", () => {
    const overlays = [sampleOverlay(), sampleOverlay({ path: 'builtin:second', x: 0.6 })];
    const layers = seedLayers(natural.params, overlays);
    const result = compileLayers(layers);

    for (const key of Object.keys(REGION_MAP)) {
      const def = REGION_MAP[key as keyof typeof REGION_MAP];
      if (def.key === 'deco') continue;
      const on = def.onKeys.some(
        k => ((natural.params[k] as number) ?? 0) > 0,
      );
      if (!on) continue;
      for (const k of regionOwnKeys(def)) {
        if (natural.params[k] === undefined) continue;
        expect(result.params[k]).toBe(natural.params[k]);
      }
    }
    // 오버레이는 kind 각인만 더해져 보존(kind 없던 원본 → '점'=deco로 복원).
    expect(result.overlayLayers).toEqual(overlays.map(o => ({ ...o, kind: 'deco' })));
  });

  test('오버레이가 있는 룩 → 데코 레이어로 분해된다', () => {
    const overlays = [sampleOverlay(), sampleOverlay({ path: 'builtin:second' })];
    const layers = seedLayers(BARE, overlays);
    expect(layers).toHaveLength(2);
    expect(layers.every(l => l.region === 'deco')).toBe(true);
    expect(layers.map(l => l.overlay)).toEqual(overlays);
  });
});

describe('데코 세부부위 5종 (중분류)', () => {
  test('데코 슬롯에 점·타투·젬·페인팅·기타 5개 세부부위가 있다', () => {
    const decoGroup = REGION_GROUPS.find(g => g.slot === '데코')!;
    expect(decoGroup.regions.map(d => d.key)).toEqual(DECO_REGION_KEYS);
    expect(decoGroup.regions.map(d => d.label)).toEqual([
      '점',
      '타투',
      '젬',
      '페인팅',
      '기타',
    ]);
    for (const key of DECO_REGION_KEYS) expect(isDecoRegion(key)).toBe(true);
  });

  test('newLayer(데코 세부) — 오버레이에 kind=세부부위, 점=틴트/그 외=스티커', () => {
    expect(newLayer('deco', BARE).overlay?.kind).toBe('deco');
    expect(newLayer('deco', BARE).overlay?.blendMode).toBe(1); // 점=색소 틴트
    const gem = newLayer('decoGem', BARE);
    expect(gem.overlay?.kind).toBe('decoGem');
    expect(gem.overlay?.blendMode).toBe(0); // 젬=스티커(원본색)
  });

  test('왕복: 젬·타투 세부부위가 compile→seed로 보존된다(kind 각인)', () => {
    const gem = newLayer('decoGem', BARE);
    const tattoo = newLayer('decoTattoo', BARE);
    const compiled = compileLayers([gem, tattoo]);
    expect(compiled.overlayLayers.map(o => o.kind)).toEqual([
      'decoGem',
      'decoTattoo',
    ]);
    // seedLayers가 kind로 세부부위 역복원 (순서=part 아닌 배열 순서 그대로)
    const back = seedLayers(BARE, compiled.overlayLayers);
    expect(back.map(l => l.region)).toEqual(['decoGem', 'decoTattoo']);
  });

  test('kind 없는 legacy 오버레이는 점(deco)으로 복원된다', () => {
    const back = seedLayers(BARE, [sampleOverlay()]);
    expect(back[0].region).toBe('deco');
  });
});

// ── 아이섀도 멀티밴드(A14) — 겹 수 분기 + 왕복 계약 ──────────────────────────
describe('아이섀도 멀티밴드', () => {
  const esLeaf = (color: string, intensity: number, height: number): ComposerLayer => ({
    id: `es-${color}`,
    region: 'eyeshadow',
    visible: true,
    params: { eyeshadowColor: color, eyeshadowIntensity: intensity, eyeshadowHeight: height },
  });

  test('1겹은 legacy 스칼라(params), 배열 비움', () => {
    const c = compileLayers([esLeaf('#8A5A44', 0.4, 1)]);
    expect(c.eyeshadowLayers).toEqual([]);
    expect(c.params.eyeshadowIntensity).toBe(0.4);
  });

  test('2겹은 배열(순서=아래→위), params엔 안 실림', () => {
    const c = compileLayers([
      esLeaf('#8A5A44', 0.45, 1),
      esLeaf('#5C4A46', 0.6, 1.25),
    ]);
    expect(c.eyeshadowLayers.map(b => b.color)).toEqual(['#8A5A44', '#5C4A46']);
    expect(c.eyeshadowLayers[1].height).toBe(1.25);
    expect(c.params.eyeshadowIntensity).toBe(0); // BARE — 스칼라 경로 안 씀
  });

  test('안 보이는 겹은 제외', () => {
    const hidden = { ...esLeaf('#111', 0.5, 1), visible: false };
    const c = compileLayers([esLeaf('#8A5A44', 0.45, 1), hidden]);
    expect(c.eyeshadowLayers).toEqual([]); // 보이는 건 1겹 → 스칼라
    expect(c.params.eyeshadowColor).toBe('#8A5A44');
  });

  test('왕복 — 2겹 배열 → seedLayers → 아이섀도 잎 2개 복원', () => {
    const c = compileLayers([
      esLeaf('#8A5A44', 0.45, 1),
      esLeaf('#5C4A46', 0.6, 1.25),
    ]);
    const back = seedLayers(BARE, [], [], c.eyeshadowLayers);
    const es = back.filter(l => l.region === 'eyeshadow');
    expect(es).toHaveLength(2);
    expect(es[0].params.eyeshadowColor).toBe('#8A5A44');
    expect(es[1].params.eyeshadowHeight).toBe(1.25);
  });
});
