/**
 * @format
 * 부위 룩 변형 라이브러리(lookVariants.ts) 계약:
 *  - 모든 변형 def가 instantiate→flattenTree→compileLayers를 에러 없이 통과
 *  - 잎 params는 부위 소유 필드(regionOwnKeys)만 사용(브리지 필드 오염 방지)
 *  - id `sys:var:…` 규약 — buildSystemLibrary와 무충돌, owner='system'
 *  - ⇄ 교체 패널(regionDefsForSlot)에 슬롯별로 자동 노출
 */
import { compileLayers } from '../src/composer/model';
import { isLensRegion, REGION_MAP, regionOwnKeys } from '../src/composer/regions';
import type { RegionKey } from '../src/composer/regions';
import {
  buildSystemLibrary,
  flattenTree,
  instantiate,
  isLeaf,
  regionDefsForSlot,
  regionKeysOfDef,
} from '../src/composer/lookTree';
import { REGION_GROUPS } from '../src/composer/regions';
import type {
  LookDef,
  LookNode,
  ProductLeaf,
  SlotKey,
} from '../src/composer/lookTree';
import { buildVariantLibrary } from '../src/composer/lookVariants';

const variants = buildVariantLibrary();
const merged = { ...buildSystemLibrary(), ...variants };
const regionDefs = Object.values(variants).filter(d => d.level === 'region');

function leavesOf(node: LookNode): ProductLeaf[] {
  const out: ProductLeaf[] = [];
  const walk = (n: LookNode) => {
    for (const kid of n.kids) {
      if (isLeaf(kid)) out.push(kid);
      else walk(kid);
    }
  };
  walk(node);
  return out;
}

describe('buildVariantLibrary — id 규약·소유·무충돌', () => {
  test('모든 정의는 sys:var: 접두사 + owner=system, 시스템 라이브러리와 id 무충돌', () => {
    const sysIds = new Set(Object.keys(buildSystemLibrary()));
    for (const [id, def] of Object.entries(variants)) {
      expect(id.startsWith('sys:var:')).toBe(true);
      expect(def.id).toBe(id);
      expect(def.owner).toBe('system');
      expect(sysIds.has(id)).toBe(false);
    }
  });

  test('부위별 변형 개수 — 립 8 · 눈 6 · 렌즈 3 · 컨투어 6 · 눈썹 4 · 피부 3', () => {
    const bySlot = new Map<SlotKey, LookDef[]>();
    for (const def of regionDefs) {
      bySlot.set(def.slot, [...(bySlot.get(def.slot) ?? []), def]);
    }
    expect(bySlot.get('립')).toHaveLength(8);
    expect(bySlot.get('눈')).toHaveLength(6);
    expect(bySlot.get('렌즈')).toHaveLength(3); // 렌즈 슬롯 승격(분류체계 정의 A2)
    expect(bySlot.get('컨투어')).toHaveLength(6); // 블러셔가 컨투어 슬롯으로 이동(#19b)
    expect(bySlot.get('눈썹')).toHaveLength(4);
    expect(bySlot.get('피부')).toHaveLength(3);
    expect(regionDefs).toHaveLength(30);
  });
});

describe('buildVariantLibrary — instantiate→flattenTree→compileLayers 무에러', () => {
  test.each(regionDefs.map(d => [d.name, d.id] as const))(
    '%s (%s)',
    (_name, id) => {
      const tree = instantiate(merged, id);
      expect(tree).not.toBeNull();

      const layers = flattenTree(tree);
      expect(layers.length).toBeGreaterThan(0);

      const compiled = compileLayers(layers);
      expect(compiled.params).toBeDefined();
      expect(compiled.overlayLayers).toEqual([]); // 변형엔 데코 없음

      // 잎이 켠 부위는 컴파일 결과에서도 켜져 있어야 한다(강도 필드 유실 방지).
      // 렌즈 세부(#25)는 FilterParams onKeys가 없고 payload가 lensLayers로 흐르므로,
      // params 대신 lensLayers 비어있지 않음으로 검증한다.
      const regions = new Set<RegionKey>(layers.map(l => l.region));
      const hasLens = [...regions].some(isLensRegion);
      if (hasLens) expect(compiled.lensLayers.length).toBeGreaterThan(0);
      // 아이섀도 멀티밴드(A14): 같은 부위 2겹 이상은 params가 아니라 eyeshadowLayers
      // 배열로 흐른다(각 밴드 강도>0). 1겹이면 기존대로 params 스칼라.
      const esLeaves = layers.filter(l => l.region === 'eyeshadow');
      if (esLeaves.length >= 2) {
        expect(compiled.eyeshadowLayers.length).toBe(esLeaves.length);
        expect(
          compiled.eyeshadowLayers.every(b => b.intensity > 0),
        ).toBe(true);
      }
      for (const region of regions) {
        if (isLensRegion(region)) continue;
        if (region === 'eyeshadow' && esLeaves.length >= 2) continue; // 배열 경로
        const def = REGION_MAP[region];
        const on = def.onKeys.some(
          k => ((compiled.params[k] as number) ?? 0) > 0,
        );
        expect(on).toBe(true);
      }
    },
  );

  test('잎 params는 부위 소유 필드(regionOwnKeys)만 사용', () => {
    for (const def of regionDefs) {
      const tree = instantiate(merged, def.id)!;
      for (const leaf of leavesOf(tree)) {
        const owned = new Set(regionOwnKeys(REGION_MAP[leaf.region]));
        for (const key of Object.keys(leaf.params)) {
          if (!owned.has(key as keyof typeof leaf.params)) {
            throw new Error(
              `${def.name}의 잎 "${leaf.label}"(${leaf.region})이 비소유 필드 ${key} 사용`,
            );
          }
        }
      }
    }
  });
});

describe('regionKeysOfDef — 기본 모드 중분류 필터 계약', () => {
  test('region 룩이 건드리는 세부부위(RegionKey)를 잎까지 내려가 수집한다', () => {
    // 버건디 매트 = 메인립(lip) + 라이너(lipLiner) 2 sub
    const burgundy = regionDefs.find(d => d.name === '버건디 매트')!;
    const keys = regionKeysOfDef(merged, burgundy.id);
    expect(keys.has('lip')).toBe(true);
    expect(keys.has('lipLiner')).toBe(true);
    // 단일 sub 룩은 그 부위 하나만
    const red = regionDefs.find(d => d.name === '레드 매트')!;
    expect([...regionKeysOfDef(merged, red.id)]).toEqual(['lip']);
  });

  test('중분류(세부부위)로 부위 룩 카드를 필터한다 — 룩 없는 세부부위는 빈 목록', () => {
    // 기본 모드 카드 필터 로직: midCat === 'all'이면 전부, 아니면 그 RegionKey 포함 룩만.
    const cardsFor = (slot: SlotKey, midCat: RegionKey | 'all'): string[] => {
      const defs = regionDefsForSlot(merged, slot);
      return defs
        .filter(d => midCat === 'all' || regionKeysOfDef(merged, d.id).has(midCat))
        .map(d => d.name);
    };
    // 눈: 아이라인 상으로 필터 → 상안검 라이너를 포함한 룩만(로즈골드 시머 등)
    const eyeLiner = cardsFor('눈', 'eyelinerUpper');
    expect(eyeLiner.length).toBeGreaterThan(0);
    expect(eyeLiner).toContain('로즈골드 시머');
    expect(cardsFor('눈', 'eyeshadow').length).toBeGreaterThan(eyeLiner.length);
    // 룩이 없는 세부부위(삼각존)는 카드 0장 — 카테고리로는 떠도 카드는 '없음'만
    // (애교살은 핑크물광·핑크청순·피치볼터치 등 레퍼런스 룩에 실려 더는 비어있지 않음)
    expect(cardsFor('눈', 'triangleZone')).toEqual([]);
    // 립: 립라이너 포함 룩만(버건디 매트 등)
    expect(cardsFor('립', 'lipLiner')).toContain('버건디 매트');
  });

  test('중분류 후보 = 슬롯의 세부부위 전부(룩 유무 무관, 카탈로그 순서)', () => {
    const midCatsFor = (slot: SlotKey): RegionKey[] => {
      const g = REGION_GROUPS.find(gr => gr.slot === slot);
      return (g?.regions ?? []).map(rd => rd.key);
    };
    // 컨투어: 룩은 블러셔뿐이어도 하이라이터·섀딩까지 카테고리로 노출
    expect(midCatsFor('컨투어')).toEqual(['blush', 'highlighter', 'contour']);
  });
});

describe('buildVariantLibrary — ⇄ 교체 패널 노출·스택 예시', () => {
  test('regionDefsForSlot이 슬롯별 변형을 전부 돌려준다(시스템 병합 라이브러리)', () => {
    for (const slot of ['피부', '컨투어', '렌즈', '눈', '눈썹', '립'] as SlotKey[]) {
      const shown = new Set(regionDefsForSlot(merged, slot).map(d => d.id));
      for (const def of regionDefs.filter(d => d.slot === slot)) {
        expect(shown.has(def.id)).toBe(true);
      }
    }
  });

  test('같은 부위 2겹 스택 예시가 존재한다(눈 — sub 하나에 같은 region 잎 2장)', () => {
    const stacked = regionDefs.some(def => {
      if (def.slot !== '눈') return false;
      const tree = instantiate(merged, def.id)!;
      return tree.kids.some(sub => {
        if (isLeaf(sub)) return false;
        const leaves = sub.kids.filter(isLeaf);
        return (
          leaves.length >= 2 &&
          leaves.every(l => l.region === leaves[0].region)
        );
      });
    });
    expect(stacked).toBe(true);
  });
});
