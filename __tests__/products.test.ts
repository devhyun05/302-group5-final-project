/**
 * @format
 * 제품 — 채널 구조(§5, A12 Phase A) — 번역기·템플릿·시드 계약 고정.
 * 채널×테크닉 강도를 부위 소유 브리지 필드로만 번역(Unity 무변경), 제품군 슬롯 준수,
 * neon/blendability/pearl.shift/glitter 2번째+는 미매핑(데이터만 보존).
 */
import { REGION_MAP, regionOwnKeys } from '../src/composer/regions';
import {
  FAMILY_TEMPLATES,
  SYSTEM_PRODUCTS,
  findProduct,
  productsForRegion,
  translateProduct,
} from '../src/composer/products';
import type {
  ChannelSlot,
  ProductDef,
  ProductFamily,
} from '../src/composer/products';

const st = (strength: number) => ({ strength });

/** 제품이 실제로 채운 채널 슬롯. */
function filledSlots(p: ProductDef): ChannelSlot[] {
  const out: ChannelSlot[] = [];
  if (p.base) out.push('base');
  if (p.pearl) out.push('pearl');
  if (p.glitter && p.glitter.length > 0) out.push('glitter');
  if (p.neon) out.push('neon');
  return out;
}

// ── 번역기 ───────────────────────────────────────────────────────────────────

describe('translateProduct — coverage ⊗ 강도 곡선', () => {
  const lip: ProductDef = {
    id: 't:lip',
    name: '테스트 립',
    family: 'lip',
    base: { color: '#C0392B', coverage: 0.7 },
    form: { blendability: 0.5, buildability: 0.4, finish: 1 },
    owner: 'system',
  };

  it('강도 0 → 0, 강도 1 → coverage (양 끝 고정)', () => {
    expect(translateProduct(lip, st(0), 'lip').lipIntensity).toBeCloseTo(0, 6);
    expect(translateProduct(lip, st(1), 'lip').lipIntensity).toBeCloseTo(0.7, 6);
  });

  it('강도에 대해 단조 증가', () => {
    const vals = [0, 0.2, 0.4, 0.6, 0.8, 1].map(
      s => translateProduct(lip, st(s), 'lip').lipIntensity as number,
    );
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });

  it('강도 [0,1] 밖은 클램프(음수→0, 초과→coverage)', () => {
    expect(translateProduct(lip, st(-1), 'lip').lipIntensity).toBeCloseTo(0, 6);
    expect(translateProduct(lip, st(5), 'lip').lipIntensity).toBeCloseTo(0.7, 6);
  });

  it('buildability↑ = 같은 강도에서 더 빨리 쌓임', () => {
    const low: ProductDef = { ...lip, form: { ...lip.form, buildability: 0.1 } };
    const high: ProductDef = { ...lip, form: { ...lip.form, buildability: 0.9 } };
    const lowV = translateProduct(low, st(0.5), 'lip').lipIntensity as number;
    const highV = translateProduct(high, st(0.5), 'lip').lipIntensity as number;
    expect(highV).toBeGreaterThan(lowV);
  });
});

describe('translateProduct — 채널→필드 매핑', () => {
  it('base.color → 부위 색 필드', () => {
    const p: ProductDef = {
      id: 't', name: 't', family: 'lip',
      base: { color: '#123456', coverage: 0.6 },
      form: { blendability: 0.5, buildability: 0.5, finish: 0 },
      owner: 'system',
    };
    expect(translateProduct(p, st(1), 'lip').lipColor).toBe('#123456');
  });

  it('pearl → finish 3(시머) + 게인, form.finish는 덮인다', () => {
    const p: ProductDef = {
      id: 't', name: 't', family: 'eyeshadow',
      base: { color: '#8A6A55', coverage: 0.5 },
      pearl: { color: '#C9A98A', gain: 0.55 },
      form: { blendability: 0.5, buildability: 0.5, finish: 1 },
      owner: 'system',
    };
    const patch = translateProduct(p, st(1), 'eyeshadow');
    expect(patch.eyeshadowFinish).toBe(3);
    expect(patch.eyeshadowShimmer).toBeCloseTo(0.55, 6);
  });

  it('pearl.shift(듀오크롬 색B)는 번역에 나타나지 않는다(A15 보존)', () => {
    const p: ProductDef = {
      id: 't', name: 't', family: 'eyeshadow',
      base: { color: '#6E5A8C', coverage: 0.45 },
      pearl: { color: '#8C7AB0', gain: 0.6, shift: '#3E7C6A' },
      form: { blendability: 0.5, buildability: 0.5, finish: 0 },
      owner: 'system',
    };
    const values = Object.values(translateProduct(p, st(1), 'eyeshadow'));
    expect(values).not.toContain('#3E7C6A');
  });

  it('glitter 첫 인스턴스만 *ShimmerSize·Density로(2번째는 무시)', () => {
    const p: ProductDef = {
      id: 't', name: 't', family: 'glitterTopper',
      glitter: [
        { color: '#E8E4F0', size: 0.25, density: 0.6 },
        { color: '#C0A0D8', size: 0.7, density: 0.35 },
      ],
      form: { blendability: 0.5, buildability: 0.5, finish: 0 },
      owner: 'system',
    };
    const patch = translateProduct(p, st(1), 'eyeshadow');
    expect(patch.eyeshadowShimmerSize).toBeCloseTo(0.25, 6);
    expect(patch.eyeshadowShimmerDensity).toBeCloseTo(0.6, 6);
    // 2번째 인스턴스 값은 어디에도 없다
    const values = Object.values(patch);
    expect(values).not.toContain(0.7);
    expect(values).not.toContain(0.35);
  });

  it('neon 채널은 매핑되지 않는다(base만 번역)', () => {
    const p: ProductDef = {
      id: 't', name: 't', family: 'neonPaint',
      base: { color: '#39FF14', coverage: 0.5 },
      neon: { color: '#39FF14', gain: 0.85 },
      form: { blendability: 0.4, buildability: 0.4, finish: 0 },
      owner: 'system',
    };
    const patch = translateProduct(p, st(1), 'lip');
    // base만 반영 — lipColor·lipIntensity·lipFinish(0=새틴 명시). neon 유래 필드 없음.
    expect(Object.keys(patch).sort()).toEqual(
      ['lipColor', 'lipFinish', 'lipIntensity'].sort(),
    );
    expect(patch.lipColor).toBe('#39FF14');
  });

  it('부위 비소유 필드는 반환하지 않는다(모든 시드 × 자기 부위)', () => {
    for (const p of SYSTEM_PRODUCTS) {
      for (const region of FAMILY_TEMPLATES[p.family].regions) {
        const own = new Set(regionOwnKeys(REGION_MAP[region]) as string[]);
        const patch = translateProduct(p, st(0.6), region);
        for (const k of Object.keys(patch)) {
          expect(own.has(k)).toBe(true);
        }
      }
    }
  });

  it('타 부위로 번역 시 소스 부위 필드는 새지 않는다(립 제품→블러셔)', () => {
    const lip = SYSTEM_PRODUCTS.find(p => p.family === 'lip')!;
    const patch = translateProduct(lip, st(0.8), 'blush');
    expect(patch).not.toHaveProperty('lipColor');
    expect(patch).not.toHaveProperty('lipIntensity');
    expect(patch.blushColor).toBe(lip.base!.color);
  });
});

// ── 제품군 템플릿 ─────────────────────────────────────────────────────────────

describe('FAMILY_TEMPLATES — §5 슬롯 사례', () => {
  it('파운데=베이스만', () => {
    expect(FAMILY_TEMPLATES.foundation.slots).toEqual(['base']);
  });
  it('하이라이터=펄 중심(펄 슬롯 노출)', () => {
    expect(FAMILY_TEMPLATES.highlighter.slots).toContain('pearl');
  });
  it('글리터 토퍼=글리터만', () => {
    expect(FAMILY_TEMPLATES.glitterTopper.slots).toEqual(['glitter']);
  });
  it('네온 페인팅=네온 중심(네온 슬롯 노출)', () => {
    expect(FAMILY_TEMPLATES.neonPaint.slots).toContain('neon');
  });
  it('아이섀도=베이스+펄', () => {
    expect(FAMILY_TEMPLATES.eyeshadow.slots).toContain('base');
    expect(FAMILY_TEMPLATES.eyeshadow.slots).toContain('pearl');
  });

  it('모든 템플릿의 regions는 유효한 RegionKey이고 비어있지 않다', () => {
    for (const key of Object.keys(FAMILY_TEMPLATES) as ProductFamily[]) {
      const tpl = FAMILY_TEMPLATES[key];
      expect(tpl.regions.length).toBeGreaterThan(0);
      for (const r of tpl.regions) expect(REGION_MAP[r]).toBeDefined();
    }
  });
});

// ── 시드 ─────────────────────────────────────────────────────────────────────

describe('SYSTEM_PRODUCTS — 시드 검증', () => {
  it('id는 유일하다', () => {
    const ids = SYSTEM_PRODUCTS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('glitter 인스턴스는 ≤3', () => {
    for (const p of SYSTEM_PRODUCTS) {
      if (p.glitter) expect(p.glitter.length).toBeLessThanOrEqual(3);
    }
  });

  it('모든 시드는 자기 제품군 템플릿의 슬롯을 준수(채운 채널 ⊆ 노출 슬롯)', () => {
    for (const p of SYSTEM_PRODUCTS) {
      const allowed = new Set(FAMILY_TEMPLATES[p.family].slots);
      for (const slot of filledSlots(p)) {
        expect(allowed.has(slot)).toBe(true);
      }
    }
  });

  it('글리터 믹스 토퍼(glitter 2종)가 존재', () => {
    const mix = SYSTEM_PRODUCTS.find(
      p => p.family === 'glitterTopper' && (p.glitter?.length ?? 0) === 2,
    );
    expect(mix).toBeDefined();
  });

  it('듀오크롬 섀도(pearl.shift)가 존재', () => {
    const duo = SYSTEM_PRODUCTS.find(
      p => p.family === 'eyeshadow' && p.pearl?.shift !== undefined,
    );
    expect(duo).toBeDefined();
  });

  it('네온 페인트(neon 채널)가 존재', () => {
    const neon = SYSTEM_PRODUCTS.find(
      p => p.family === 'neonPaint' && p.neon !== undefined,
    );
    expect(neon).toBeDefined();
  });

  it('제품군당 2개 이상', () => {
    const byFamily = new Map<ProductFamily, number>();
    for (const p of SYSTEM_PRODUCTS) {
      byFamily.set(p.family, (byFamily.get(p.family) ?? 0) + 1);
    }
    for (const key of Object.keys(FAMILY_TEMPLATES) as ProductFamily[]) {
      expect(byFamily.get(key) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── 유틸 ─────────────────────────────────────────────────────────────────────

describe('productsForRegion / findProduct', () => {
  it('productsForRegion은 제품군 적합 부위만 돌려준다', () => {
    const list = productsForRegion('foundation');
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(FAMILY_TEMPLATES[p.family].regions).toContain('foundation');
    }
  });

  it('productsForRegion은 사용자 제품도 포함한다', () => {
    const user: ProductDef = {
      id: 'u:1', name: '내 립', family: 'lip',
      base: { color: '#000000', coverage: 0.5 },
      form: { blendability: 0.5, buildability: 0.5, finish: 0 },
      owner: 'user',
    };
    const list = productsForRegion('lip', [user]);
    expect(list.some(p => p.id === 'u:1')).toBe(true);
  });

  it('findProduct — 내장 우선, 사용자 폴백, 없으면 undefined', () => {
    const first = SYSTEM_PRODUCTS[0];
    expect(findProduct(first.id)).toBe(first);
    const user: ProductDef = {
      id: 'u:2', name: '내 섀도', family: 'eyeshadow',
      base: { color: '#111111', coverage: 0.5 },
      form: { blendability: 0.5, buildability: 0.5, finish: 0 },
      owner: 'user',
    };
    expect(findProduct('u:2', [user])).toBe(user);
    expect(findProduct('nope')).toBeUndefined();
  });
});

// ── 컴파일 통합 — applyProductsToLayers(§5 레이어 = 제품(참조) × 테크닉) ──────
import { applyProductsToLayers } from '../src/composer/products';
import type { ComposerLayer } from '../src/composer/model';

describe('applyProductsToLayers', () => {
  const lipProduct = SYSTEM_PRODUCTS.find(
    p => p.family === 'lip' && p.base,
  )!;
  const layer = (extra: Partial<ComposerLayer>): ComposerLayer => ({
    id: 'x',
    region: 'lip',
    visible: true,
    params: {},
    ...extra,
  });

  it('productId 잎에 번역값을 깔고, leaf.params 오버라이드가 이긴다', () => {
    const out = applyProductsToLayers([
      layer({ productId: lipProduct.id, technique: { strength: 1 } }),
      layer({
        productId: lipProduct.id,
        technique: { strength: 1 },
        params: { lipColor: '#123456' },
      }),
    ]);
    expect(out[0].params.lipColor).toBe(lipProduct.base!.color);
    expect((out[0].params.lipIntensity ?? 0) > 0).toBe(true);
    expect(out[1].params.lipColor).toBe('#123456'); // 오버라이드 승리
  });

  it('참조 없음/고아 참조는 항등(같은 배열 참조)', () => {
    const plain = [layer({})];
    expect(applyProductsToLayers(plain)).toBe(plain);
    const orphan = [layer({ productId: 'no-such-product' })];
    expect(applyProductsToLayers(orphan)).toBe(orphan);
  });

  it('강도가 낮으면 번역 농도도 낮다(coverage⊗강도 단조)', () => {
    const hi = applyProductsToLayers([
      layer({ productId: lipProduct.id, technique: { strength: 1 } }),
    ])[0].params.lipIntensity!;
    const lo = applyProductsToLayers([
      layer({ productId: lipProduct.id, technique: { strength: 0.3 } }),
    ])[0].params.lipIntensity!;
    expect(lo).toBeLessThan(hi);
    expect(lo).toBeGreaterThan(0);
  });
});
