/**
 * @format
 * 멀티유즈(#23 Phase 2) — 한 제품(잎)을 다른 부위에도 쓰기. 색·마감·농도만
 * 대상 부위 브리지 필드로 번역하고 모양·핏은 대상 기본값. 브리지 무변경(필드 재배치).
 */
import { BARE } from '../src/presets';
import { REGION_MAP } from '../src/composer/regions';
import {
  canMultiUse,
  categoryKeys,
  multiUseRegionNode,
  multiUseTargets,
  translateLeafParams,
} from '../src/composer/multiUse';
import {
  addRegionNode,
  emptyFaceLook,
  flattenTree,
  isLeaf,
  newRegionNode,
  regionNodeWith,
  swapRegionNode,
  updateLeaf,
} from '../src/composer/lookTree';
import type { LookNode, ProductLeaf } from '../src/composer/lookTree';
import { compileLayers } from '../src/composer/model';

function firstLeaf(node: LookNode): ProductLeaf {
  const queue: LookNode[] = [node];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const kid of cur.kids) {
      if (isLeaf(kid)) return kid;
      queue.push(kid);
    }
  }
  throw new Error('잎 없음');
}

describe('categoryKeys — 색/마감/농도 축 유도', () => {
  test('립: color=lipColor, finish=lipFinish(사다리), intensity=lipIntensity', () => {
    const ck = categoryKeys(REGION_MAP.lip);
    expect(ck.colorKey).toBe('lipColor');
    expect(ck.finishKey).toBe('lipFinish');
    expect(ck.shimmerKey).toBe('lipShimmer');
    expect(ck.finishIsLadder).toBe(true);
    expect(ck.intensityKey).toBe('lipIntensity');
  });

  test('파운데이션 마감은 segments형 → finishIsLadder=false (번역 제외 대상)', () => {
    const ck = categoryKeys(REGION_MAP.foundation);
    expect(ck.colorKey).toBe('foundationColor');
    expect(ck.finishKey).toBe('foundationFinish');
    expect(ck.finishIsLadder).toBe(false);
  });

  test('색 축 없는 부위(치아)는 colorKey 없음', () => {
    expect(categoryKeys(REGION_MAP.teeth).colorKey).toBeUndefined();
  });
});

describe('canMultiUse — 색이 양쪽에 있어야', () => {
  test('립 → 블러셔 가능 (립앤치크)', () => {
    expect(canMultiUse('lip', 'blush')).toBe(true);
  });
  test('아이섀도 → 컨투어 가능 (섀도셰이딩)', () => {
    expect(canMultiUse('eyeshadow', 'contour')).toBe(true);
  });
  test('같은 부위·데코·색없는 대상은 불가', () => {
    expect(canMultiUse('lip', 'lip')).toBe(false);
    expect(canMultiUse('lip', 'deco')).toBe(false);
    expect(canMultiUse('lip', 'teeth')).toBe(false); // teeth 색 축 없음
    expect(canMultiUse('skin', 'blush')).toBe(false); // skin 색 축 없음
    // (파우더는 컬러 파우더 신설로 색 축이 생겨 이제 멀티유즈 가능 — 예시에서 제외)
    expect(canMultiUse('powder', 'blush')).toBe(true);
  });
  test('multiUseTargets(lip)에 blush 포함·lip/deco/teeth 제외', () => {
    const t = multiUseTargets('lip');
    expect(t).toContain('blush');
    expect(t).not.toContain('lip');
    expect(t).not.toContain('deco');
    expect(t).not.toContain('teeth');
  });
});

describe('translateLeafParams — 색·마감·농도만 번역', () => {
  test('립 잎(로즈+매트+0.8) → 블러셔: 색·마감·농도 이식, 모양 키는 없음', () => {
    const region = newRegionNode('lip', BARE);
    const leaf = firstLeaf(region);
    leaf.params = { ...leaf.params, lipColor: '#AA3355', lipFinish: 1, lipIntensity: 0.8 };

    const patch = translateLeafParams(leaf, 'blush');

    expect(patch.blushColor).toBe('#AA3355');
    expect(patch.blushFinish).toBe(1);
    expect(patch.blushIntensity).toBe(0.8);
    // 모양·핏 필드는 담기지 않는다(대상 기본값 사용)
    expect(patch).not.toHaveProperty('blushShape');
    expect(patch).not.toHaveProperty('blushLift');
  });

  test('마감 번역은 사다리끼리만 — 립(사다리)→파운데이션(segments)이면 마감 제외', () => {
    const region = newRegionNode('lip', BARE);
    const leaf = firstLeaf(region);
    leaf.params = { ...leaf.params, lipColor: '#AA3355', lipFinish: 3, lipShimmer: 0.6 };

    const patch = translateLeafParams(leaf, 'foundation');

    expect(patch.foundationColor).toBe('#AA3355');
    expect(patch).not.toHaveProperty('foundationFinish'); // segments형이라 미번역
  });
});

describe('multiUseRegionNode — 대상 부위 새 룩(기본 모양·핏 + 번역값)', () => {
  test('립 → 블러셔: blush region 노드, 잎 params에 번역된 색·농도', () => {
    const lipRegion = newRegionNode('lip', BARE);
    const lipLeaf = firstLeaf(lipRegion);
    lipLeaf.params = { ...lipLeaf.params, lipColor: '#C94F6D', lipIntensity: 0.7 };

    const node = multiUseRegionNode(lipLeaf, 'blush', BARE)!;

    expect(node).not.toBeNull();
    expect(node.slot).toBe('컨투어'); // 블러셔 슬롯
    const leaf = firstLeaf(node);
    expect(leaf.region).toBe('blush');
    expect(leaf.params.blushColor).toBe('#C94F6D');
    expect(leaf.params.blushIntensity).toBe(0.7);
    // ref 없음(사용자 커스텀), dirty 아님(추가 시 addRegionNode가 루트만 dirty)
    expect(node.ref).toBeNull();
  });

  test('번역 불가 대상이면 null', () => {
    const region = newRegionNode('lip', BARE);
    expect(multiUseRegionNode(firstLeaf(region), 'teeth', BARE)).toBeNull();
  });
});

// 대상 부위가 이미 트리에 있으면 append가 아니라 교체 — applyMultiUse(UI)가 쓰는
// regionNodeWith + swapRegionNode 조합. append 시 같은 브리지 필드라 컴파일
// last-writer-wins로 기존 설정이 소실되므로 교체가 맞다("립색을 볼에" 의도).
describe('멀티유즈 — 대상 부위 기존 region 처리(교체)', () => {
  test('이미 블러셔 있는 트리 + 립→블러셔 → blush region 1개(교체), 립색 반영', () => {
    let tree = addRegionNode(emptyFaceLook('내 룩'), newRegionNode('blush', BARE));
    tree = addRegionNode(tree, newRegionNode('lip', BARE));

    // 립 잎 색·농도 지정
    const lipNode = tree.kids.find(
      (c): c is LookNode => !isLeaf(c) && c.slot === '립',
    )!;
    const lipLeaf = firstLeaf(lipNode);
    tree = updateLeaf(tree, lipLeaf.id, {
      params: { lipColor: '#123456', lipIntensity: 0.7 },
    });

    // applyMultiUse의 코어: 기존 blush region 있으면 swap
    const freshLip = firstLeaf(
      tree.kids.find((c): c is LookNode => !isLeaf(c) && c.slot === '립')!,
    );
    const node = multiUseRegionNode(freshLip, 'blush', BARE)!;
    const existing = regionNodeWith(tree, 'blush')!;
    const next = swapRegionNode(tree, existing.id, node);

    // blush 잎을 가진 root region이 정확히 1개(append로 2개 안 됨) + 총 region 2개 유지
    const regionNodes = next.kids.filter((c): c is LookNode => !isLeaf(c));
    expect(regionNodes).toHaveLength(2);
    const blushRegions = regionNodes.filter(r => regionNodeWith(next, 'blush')?.id === r.id);
    expect(blushRegions).toHaveLength(1);

    // 컴파일 결과에 립색이 블러셔로 번역돼 살아있다(기존 블러셔 소실 없음)
    const params = compileLayers(flattenTree(next)).params;
    expect(params.blushColor).toBe('#123456');
    expect(params.blushIntensity).toBe(0.7);
  });
});
