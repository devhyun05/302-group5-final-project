/**
 * @format
 * 재귀 룩 트리(lookTree.ts) — 목업 v2에서 실검증된 의미론을 계약으로 고정.
 * copy-on-write 3규칙: 편집 중 무질문(dirty 전파만) · 시스템 프리셋 불변(자동
 * 사본) · 중간 계층 익명 흡수(☆승격으로만 등록). 유일한 실질 질문 = 내 룩이
 * 다른 저장 룩과 공유될 때(사본/원본 반영).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { compileLayers, seedLayers } from '../src/composer/model';
import { REGION_MAP, regionOwnKeys } from '../src/composer/regions';
import { BARE, PRESETS } from '../src/presets';
import {
  addGroupBundle,
  addRegionNode,
  addToGroup,
  applySaveDecisions,
  buildSystemLibrary,
  collectChanges,
  createGroup,
  emptyFaceLook,
  faceLookIdForPreset,
  findNode,
  firstVisibleLeaf,
  flattenTree,
  groupBundleDefs,
  groupOfRegion,
  instantiate,
  instantiateGroup,
  isLeaf,
  mirrorLeaf,
  newRegionNode,
  promoteGroup,
  regionDefsForSlot,
  removeFromGroup,
  removeGroup,
  removeNode,
  renameGroup,
  reviveTree,
  setGroupVisible,
  setNodeVisible,
  setSlotRegion,
  slotRegionNode,
  slotRegionNodes,
  snapshotTree,
  stackLeaf,
  swapRegionNode,
  treeDirty,
  updateBrowSharedAxis,
  updateLeaf,
} from '../src/composer/lookTree';
import type {
  LeafDef,
  LookLibrary,
  LookNode,
  ProductLeaf,
  SlotKey,
} from '../src/composer/lookTree';
import {
  __resetLookStoreMirrors,
  loadUserStylesV2,
} from '../src/storage/lookStore';

const rosy = PRESETS.find(p => p.id === 'rosy')!;

// ── 테스트 헬퍼 ──────────────────────────────────────────────────────────────

function regionBySlot(tree: LookNode, slot: SlotKey): LookNode {
  const node = tree.kids.find(k => !isLeaf(k) && k.slot === slot);
  if (!node || isLeaf(node)) throw new Error(`슬롯 ${slot} region 없음`);
  return node;
}

function firstSub(region: LookNode): LookNode {
  const sub = region.kids.find(k => !isLeaf(k));
  if (!sub || isLeaf(sub)) throw new Error('sub 룩 없음');
  return sub;
}

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

function lookById(root: LookNode, id: string): LookNode {
  const node = findNode(root, id);
  if (!node || isLeaf(node)) throw new Error(`룩 노드 ${id} 없음`);
  return node;
}

function leafById(root: LookNode, id: string): ProductLeaf {
  const node = findNode(root, id);
  if (!node || !isLeaf(node)) throw new Error(`잎 ${id} 없음`);
  return node;
}

/** 사용자 소유 립 정의(sub+region)를 심은 라이브러리 — 공유/choice 시나리오용 */
function libWithUserLip(): LookLibrary {
  const lib: LookLibrary = { ...buildSystemLibrary() };
  lib['usr:sub:lip'] = {
    id: 'usr:sub:lip',
    name: '벨벳 겹',
    level: 'sub',
    slot: '립',
    owner: 'user',
    kids: [
      {
        label: '립 (+라이너)',
        region: 'lip',
        params: { lipColor: '#AA1122', lipIntensity: 0.8 },
      },
    ],
  };
  lib['usr:reg:lip'] = {
    id: 'usr:reg:lip',
    name: '벨벳로즈+',
    level: 'region',
    slot: '립',
    owner: 'user',
    kids: ['usr:sub:lip'],
  };
  return lib;
}

// ── 1. 시스템 라이브러리 왕복 — 시각 무손상 ─────────────────────────────────

describe('buildSystemLibrary → instantiate → flattenTree → compileLayers', () => {
  test('로지 face 룩 컴파일 결과가 PRESETS 로지 params와 부위 필드에서 동일', () => {
    const lib = buildSystemLibrary();
    const tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    expect(tree).not.toBeNull();

    const fromTree = compileLayers(flattenTree(tree));
    // 기존 seedLayers 왕복과 완전 동일 (트리 승격이 시각을 바꾸지 않는다)
    const fromSeed = compileLayers(seedLayers(rosy.params, []));
    expect(fromTree.params).toEqual(fromSeed.params);

    // 프리셋 원본과 부위 소유 필드 대조 — 강도>0인 부위 전부
    for (const def of Object.values(REGION_MAP)) {
      if (def.key === 'deco') continue;
      const on = def.onKeys.some(k => ((rosy.params[k] as number) ?? 0) > 0);
      if (!on) continue;
      for (const k of regionOwnKeys(def)) {
        if (rosy.params[k] === undefined) continue;
        expect(fromTree.params[k]).toBe(rosy.params[k]);
      }
    }
  });
});

// ── 2. dirty 전파 ────────────────────────────────────────────────────────────

describe('updateLeaf', () => {
  test('잎 수정 → 잎·조상 sub·region·루트 전부 dirty, 형제 region은 깨끗', () => {
    const lib = buildSystemLibrary();
    const tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const region = regionBySlot(tree, '립');
    const sub = firstSub(region);
    const leaf = firstLeaf(sub);

    const next = updateLeaf(tree, leaf.id, { params: { lipColor: '#123456' } });

    expect(leafById(next, leaf.id).dirty).toBe(true);
    expect(leafById(next, leaf.id).params.lipColor).toBe('#123456');
    expect(lookById(next, sub.id).dirty).toBe(true);
    expect(lookById(next, region.id).dirty).toBe(true);
    expect(next.dirty).toBe(true);
    // 형제 region은 깨끗 (경로만 전파)
    expect(regionBySlot(next, '눈').dirty).toBe(false);
    // 불변 — 원본 트리는 안 바뀐다
    expect(tree.dirty).toBe(false);
    expect(leafById(tree, leaf.id).params.lipColor).toBe(rosy.params.lipColor);
  });
});

// ── 3. 같은 자리 교체 ────────────────────────────────────────────────────────

describe('swapRegionNode', () => {
  test('교체는 구성 변경 — 루트만 dirty, 새 자식은 깨끗한 라이브 참조', () => {
    const lib = buildSystemLibrary();
    const tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const region = regionBySlot(tree, '립');
    const other = regionDefsForSlot(lib, '립').find(d => d.id !== region.ref)!;
    const fresh = instantiate(lib, other.id)!;

    const next = swapRegionNode(tree, region.id, fresh);

    expect(next.dirty).toBe(true);
    const swapped = regionBySlot(next, '립');
    expect(swapped.ref).toBe(other.id);
    expect(swapped.dirty).toBe(false);
    expect(regionBySlot(next, '눈').dirty).toBe(false);
  });
});

// ── 4. 사본 저장 (mode=copy) — 시스템 원본 불변 + ref 분리 ──────────────────

describe('applySaveDecisions — copy', () => {
  test('시스템 프리셋 수정분은 자동 사본: 라이브러리 불변, dirty ref는 분리·해제', () => {
    const lib = buildSystemLibrary();
    let tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const region = regionBySlot(tree, '립');
    const refBefore = region.ref!;
    const leaf = firstLeaf(region);
    tree = updateLeaf(tree, leaf.id, { params: { lipIntensity: 0.9 } });

    const items = collectChanges(tree, lib, []);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('auto'); // 시스템 → 질문 없음
    expect(items[0].mode).toBe('copy');

    const { root, lib: nextLib } = applySaveDecisions(tree, lib, items);

    // 원본 정의 불변
    expect(nextLib[refBefore]).toEqual(lib[refBefore]);
    // 수정 region은 참조 분리(익명 사본) + dirty 전부 해제
    const saved = regionBySlot(root, '립');
    expect(saved.ref).toBeNull();
    expect(saved.dirty).toBe(false);
    expect(root.dirty).toBe(false);
    expect(firstLeaf(saved).dirty).toBe(false);
    // 값은 유지 (사본에 반영)
    expect(firstLeaf(saved).params.lipIntensity).toBe(0.9);
  });
});

// ── 5. 원본 반영 (mode=apply) — 정의 갱신 + 공유처 전파 ─────────────────────

describe('applySaveDecisions — apply', () => {
  test('내 룩 원본 반영: 라이브러리 정의 갱신 → 다른 스냅샷 reviveTree 시 전파', () => {
    const lib = libWithUserLip();

    // 같은 정의를 공유하는 다른 저장 룩 스냅샷
    const otherSnap = snapshotTree(
      addRegionNode(emptyFaceLook('다른 룩'), instantiate(lib, 'usr:reg:lip')!),
    );

    // 작업본 — 같은 정의에서 잎 색 수정
    let tree = addRegionNode(
      emptyFaceLook('내 룩'),
      instantiate(lib, 'usr:reg:lip')!,
    );
    const leaf = firstLeaf(tree);
    tree = updateLeaf(tree, leaf.id, { params: { lipColor: '#00FF00' } });

    const items = collectChanges(tree, lib, [otherSnap]);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('choice');
    expect(items[0].sharedCount).toBe(1);
    items[0].mode = 'apply';

    const { root, lib: nextLib } = applySaveDecisions(tree, lib, items);

    // 정의가 새 sub 재료로 갱신됐다 (기존 sub 정의는 그대로 남는다)
    const def = nextLib['usr:reg:lip'];
    const newSubId = (def.kids as string[])[0];
    expect(newSubId).not.toBe('usr:sub:lip');
    expect((nextLib[newSubId].kids as LeafDef[])[0].params.lipColor).toBe('#00FF00');
    expect(nextLib['usr:sub:lip']).toEqual(lib['usr:sub:lip']);

    // 작업본 region은 ref 유지(라이브 참조) + dirty 해제
    const saved = regionBySlot(root, '립');
    expect(saved.ref).toBe('usr:reg:lip');
    expect(saved.dirty).toBe(false);

    // 다른 저장 룩이 revive되면 갱신된 정의로 해석 — 전파 확인
    const revived = reviveTree(otherSnap, nextLib);
    const layers = flattenTree(revived);
    expect(layers.find(l => l.region === 'lip')!.params.lipColor).toBe('#00FF00');
  });
});

// ── 6. 스냅샷 복원 — 라이브 해석 + 켬/끔 복원 / 동결값 복원 ─────────────────

describe('reviveTree', () => {
  test('ref가 살아있으면 라이브 해석 + visible(켬/끔) 복원(copyVisibility)', () => {
    const lib = buildSystemLibrary();
    let tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const cheek = regionBySlot(tree, '컨투어'); // 블러셔=컨투어 슬롯(#19b)
    tree = setNodeVisible(tree, cheek.id, false);
    expect(treeDirty(tree)).toBe(false); // 켬/끔은 구성 수정이 아니다

    const revived = reviveTree(snapshotTree(tree), lib);

    expect(revived.ref).toBe(faceLookIdForPreset('rosy')); // 라이브 참조 유지
    expect(regionBySlot(revived, '컨투어').visible).toBe(false);
    expect(regionBySlot(revived, '립').visible).toBe(true);
  });

  test('ref=null(사본 분리분)이면 동결값 복원', () => {
    const lib = buildSystemLibrary();
    let tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const leaf = firstLeaf(regionBySlot(tree, '립'));
    tree = updateLeaf(tree, leaf.id, { params: { lipColor: '#0000FF' } });
    // 사본 저장 → 립 region ref 분리
    const { root } = applySaveDecisions(tree, lib, collectChanges(tree, lib, []));

    const revived = reviveTree(snapshotTree(root), lib);

    expect(regionBySlot(revived, '립').ref).toBeNull();
    const params = compileLayers(flattenTree(revived)).params;
    expect(params.lipColor).toBe('#0000FF'); // 동결값이 살아있다
    // 라이브 참조 형제는 여전히 라이브러리에서 해석
    expect(regionBySlot(revived, '눈').ref).toBe(regionBySlot(tree, '눈').ref);
  });
});

// ── 7. 겹 쌓기 ───────────────────────────────────────────────────────────────

describe('stackLeaf', () => {
  test('＋겹 — 마지막 잎 복제, 강도류는 절반 시작, sub·루트 dirty', () => {
    const lib = buildSystemLibrary();
    const tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const sub = firstSub(regionBySlot(tree, '립'));
    const before = sub.kids.length;
    const last = sub.kids[before - 1] as ProductLeaf;
    const baseIntensity = last.params.lipIntensity as number;

    const next = stackLeaf(tree, sub.id);
    const nextSub = lookById(next, sub.id);

    expect(nextSub.kids.length).toBe(before + 1);
    const dup = nextSub.kids[before] as ProductLeaf;
    expect(dup.params.lipIntensity).toBeCloseTo(
      Math.max(0.1, Math.round(baseIntensity * 50) / 100),
    );
    expect(dup.params.lipColor).toBe(last.params.lipColor); // 색 등은 그대로
    expect(dup.dirty).toBe(true);
    expect(nextSub.dirty).toBe(true);
    expect(next.dirty).toBe(true);
  });
});

// ── 7-1. 눈썹 슬롯 공통 축 브로드캐스트 (회귀: 형제 잎 last-writer-wins 덮어쓰기) ──

describe('updateBrowSharedAxis', () => {
  const browLeaves = (root: LookNode): ProductLeaf[] => {
    const out: ProductLeaf[] = [];
    const walk = (n: LookNode) => {
      for (const c of n.kids) {
        if (isLeaf(c)) {
          if (c.region.startsWith('brow')) out.push(c);
        } else {
          walk(c);
        }
      }
    };
    walk(root);
    return out;
  };

  test('결+파우더 2잎 — brow 잎에서 arch 편집이 전 눈썹 잎·컴파일 결과에 반영(안 덮임)', () => {
    const lib = buildSystemLibrary();
    // 내추럴 = 눈썹 결(brow, browIntensity>0) + 채움(browPowder, browPowderIntensity>0)
    let tree = instantiate(lib, faceLookIdForPreset('natural'))!;
    expect(browLeaves(tree).length).toBeGreaterThanOrEqual(2);

    // 슬롯 공통 축을 한 번에 브로드캐스트 (축 편집기가 한 눈썹 잎에서 조정하는 상황)
    tree = updateBrowSharedAxis(tree, { browArch: 0.5, browThickness: 1.4 });

    // 전 눈썹 잎에 동일 기입 — compile 병합 순서와 무관하게 값이 같아 안 덮인다
    for (const lf of browLeaves(tree)) {
      expect(lf.params.browArch).toBe(0.5);
      expect(lf.params.browThickness).toBe(1.4);
    }
    const params = compileLayers(flattenTree(tree)).params;
    expect(params.browArch).toBe(0.5);
    expect(params.browThickness).toBe(1.4);
    expect(tree.dirty).toBe(true); // 편집이므로 dirty 전파
  });
});

// ── 7b. 데코 좌우 미러 복제 ──────────────────────────────────────────────────

describe('mirrorLeaf', () => {
  test('같은 sub에 x=1−x·회전 부호 반전 사본 추가, 나머지 설정 유지 + dirty 전파', () => {
    let tree = addRegionNode(emptyFaceLook(), newRegionNode('deco', BARE));
    const src = firstLeaf(tree);
    tree = updateLeaf(tree, src.id, {
      overlay: { ...src.overlay!, x: 0.35, y: 0.4, rotation: 30 },
    });

    const next = mirrorLeaf(tree, src.id);

    const layers = flattenTree(next).filter(l => l.region === 'deco');
    expect(layers).toHaveLength(2);
    const [orig, dup] = layers.map(l => l.overlay!);
    expect(dup.x).toBeCloseTo(1 - orig.x);
    expect(dup.rotation).toBeCloseTo(-orig.rotation);
    expect(dup.y).toBe(orig.y); // 세로·크기·강도·블렌드는 그대로
    expect(dup.scale).toBe(orig.scale);
    expect(dup.blendMode).toBe(orig.blendMode);
    expect(next.dirty).toBe(true);
    // 원본 트리는 불변
    expect(flattenTree(tree).filter(l => l.region === 'deco')).toHaveLength(1);
  });

  test('잎이 아닌 id·오버레이 없는 잎은 무시(트리 무변화)', () => {
    const tree = addRegionNode(emptyFaceLook(), newRegionNode('lip', BARE));
    const leaf = firstLeaf(tree);
    expect(mirrorLeaf(tree, leaf.id)).toBe(tree); // overlay 없음
    expect(mirrorLeaf(tree, 'no-such-id')).toBe(tree);
  });
});

// ── 7c. 기본 모드 — 슬롯 칩 선택 → 트리 반영 (setSlotRegion) ─────────────────

describe('setSlotRegion (기본 모드 슬롯 칩 선택)', () => {
  test('빈 트리 + 립 부위 룩 선택 → 립 region 추가·라이브 참조, 컴파일에 반영', () => {
    const lib = buildSystemLibrary();
    const lipDef = regionDefsForSlot(lib, '립')[0];

    const next = setSlotRegion(null, lib, '립', lipDef.id)!;

    expect(next).not.toBeNull();
    const lip = slotRegionNode(next, '립')!;
    expect(lip.ref).toBe(lipDef.id); // 상세 모드 ⇄교체와 동일한 라이브 참조
    expect(next.dirty).toBe(true); // 구성 변경
    // 컴파일 결과에 립 강도가 살아난다
    const params = compileLayers(flattenTree(next)).params;
    expect((params.lipIntensity as number) > 0).toBe(true);
  });

  test('이미 있는 슬롯에 다른 룩 선택 → 그 슬롯만 교체(swap), 형제 슬롯 불변', () => {
    const lib = buildSystemLibrary();
    const tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const lipBefore = slotRegionNode(tree, '립')!;
    const eyeRefBefore = slotRegionNode(tree, '눈')!.ref;
    const other = regionDefsForSlot(lib, '립').find(d => d.id !== lipBefore.ref)!;

    const next = setSlotRegion(tree, lib, '립', other.id)!;

    expect(slotRegionNode(next, '립')!.ref).toBe(other.id);
    // 형제 슬롯(눈)은 그대로
    expect(slotRegionNode(next, '눈')!.ref).toBe(eyeRefBefore);
    expect(next.dirty).toBe(true);
    // 불변 — 원본 트리는 안 바뀐다
    expect(slotRegionNode(tree, '립')!.ref).toBe(lipBefore.ref);
  });

  test("'없음'(defId=null) → 그 슬롯 region 제거, 다른 슬롯 유지", () => {
    const lib = buildSystemLibrary();
    const tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    expect(slotRegionNode(tree, '립')).not.toBeNull();

    const next = setSlotRegion(tree, lib, '립', null)!;

    expect(slotRegionNode(next, '립')).toBeNull(); // 비워짐
    expect(slotRegionNode(next, '눈')).not.toBeNull(); // 형제 유지
    expect(compileLayers(flattenTree(next)).params.lipIntensity).toBe(0);
  });

  test('한 슬롯에 region 여럿(상세 모드 append) → 없음/교체가 전부 정규화(고아 없음)', () => {
    const lib = buildSystemLibrary();
    // 상세 모드처럼 눈 슬롯에 region 노드 2개 append (dedup 없음)
    let tree = emptyFaceLook();
    tree = addRegionNode(tree, newRegionNode('eyeshadow', BARE));
    tree = addRegionNode(tree, newRegionNode('eyelinerUpper', BARE));
    expect(slotRegionNodes(tree, '눈')).toHaveLength(2);

    // '없음' → 슬롯의 두 region 전부 제거(첫 것만 아님)
    const cleared = setSlotRegion(tree, lib, '눈', null)!;
    expect(slotRegionNodes(cleared, '눈')).toHaveLength(0);
    expect(compileLayers(flattenTree(cleared)).params.eyelinerIntensity).toBe(0);

    // 칩 선택 → 기존 전부 제거 후 하나로 정규화
    const eyeDef = regionDefsForSlot(lib, '눈')[0];
    const swapped = setSlotRegion(tree, lib, '눈', eyeDef.id)!;
    const eyes = slotRegionNodes(swapped, '눈');
    expect(eyes).toHaveLength(1);
    expect(eyes[0].ref).toBe(eyeDef.id);
  });
});

// ── 7d. firstVisibleLeaf — 숨은 노드/잎 스킵 (기본 모드 죽은 슬라이더 방지) ────

describe('firstVisibleLeaf', () => {
  test('첫 sub를 끄면 그 잎 스킵 → 다음 보이는 잎, region을 끄면 null', () => {
    const lib = buildSystemLibrary();
    // 내추럴 눈썹 region = 결(brow) + 채움(browPowder) 2 sub
    let tree = instantiate(lib, faceLookIdForPreset('natural'))!;
    const brow = regionBySlot(tree, '눈썹');
    expect(brow.kids.length).toBeGreaterThanOrEqual(2);
    const firstLeafId = firstLeaf(brow).id;
    const firstSubId = brow.kids[0].id;

    // 전부 보이면 첫 잎
    expect(firstVisibleLeaf(regionBySlot(tree, '눈썹'))!.id).toBe(firstLeafId);

    // 첫 sub를 끄면 그 안 잎은 스킵 → 다른 잎 반환
    tree = setNodeVisible(tree, firstSubId, false);
    const vis = firstVisibleLeaf(regionBySlot(tree, '눈썹'));
    expect(vis).not.toBeNull();
    expect(vis!.id).not.toBe(firstLeafId);

    // region 자체를 끄면 보이는 잎 없음
    const off = setNodeVisible(tree, regionBySlot(tree, '눈썹').id, false);
    expect(firstVisibleLeaf(regionBySlot(off, '눈썹'))).toBeNull();
  });
});

// ── 8. 변경 수집 — auto / choice(sharedCount) / new ─────────────────────────

describe('collectChanges', () => {
  test('시스템=auto · 사용자 공유=choice(sharedCount) · ref없음=new', () => {
    const lib = libWithUserLip();
    const otherSnap = snapshotTree(
      addRegionNode(emptyFaceLook('다른 룩'), instantiate(lib, 'usr:reg:lip')!),
    );

    let tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    // 립 자리를 사용자 정의로 교체 후 잎 수정 → choice
    const lipRegion = regionBySlot(tree, '립');
    const userLip = instantiate(lib, 'usr:reg:lip')!;
    tree = swapRegionNode(tree, lipRegion.id, userLip);
    tree = updateLeaf(tree, firstLeaf(userLip).id, {
      params: { lipIntensity: 0.7 },
    });
    // 시스템 눈 region 잎 수정 → auto
    tree = updateLeaf(tree, firstLeaf(regionBySlot(tree, '눈')).id, {
      params: { eyeshadowIntensity: 0.6 },
    });
    // 새 부위 룩(ref 없음) → new
    tree = addRegionNode(tree, newRegionNode('concealer', BARE));

    const items = collectChanges(tree, lib, [otherSnap]);
    const byKind = Object.fromEntries(items.map(i => [i.kind, i]));

    expect(items).toHaveLength(3);
    expect(byKind.auto.owner).toBe('system');
    expect(byKind.choice.owner).toBe('user');
    expect(byKind.choice.sharedCount).toBe(1);
    expect(byKind.new.owner).toBe('user');
    expect(byKind.new.sharedCount).toBe(0);
  });
});

// ── 9. lookStore v1 → v2 마이그레이션 ───────────────────────────────────────

describe('lookStore v1 마이그레이션', () => {
  test('v1 저장물 → 트리 없음(fast-path) + 워프는 내 FIT 필터로 분리 이관(레인 분리 저장)', async () => {
    __resetLookStoreMirrors();
    await AsyncStorage.clear();
    const v1 = [
      {
        id: 'u1',
        name: '옛 룩',
        createdAt: 123,
        params: { ...BARE, lipIntensity: 0.5, eyeEnlarge: 0.4, jawWidth: -0.2 },
        overlayLayers: [],
        opacity: 0.8,
      },
    ];
    await AsyncStorage.setItem('armakeup.userStyles.v1', JSON.stringify(v1));

    const styles = await loadUserStylesV2();

    expect(styles).toHaveLength(1);
    const style = styles[0];
    expect(style.lookTree).toBeNull(); // 편집 진입 시 decomposeToTree
    expect(style.mkGain).toBe(0.8);
    // 레인 분리 저장(splitWarpLane) — 저장물은 메이크업 단독, 보정 필드는 비워진다
    expect(style.warpParams).toEqual({});
    expect(style.warpRef).toBe('fit-none');
    expect(style.warpName).toBe('');
    expect(style.includeMk).toBe(true);
    expect(style.includeWp).toBe(false);
    // 워프는 내 FIT 필터로 이관 (id 결정적 — 재실행 안전)
    const fitRaw = await AsyncStorage.getItem('armakeup.fitFilters.v1');
    const fits = JSON.parse(fitRaw!);
    expect(fits).toHaveLength(1);
    expect(fits[0].id).toBe('u1:wp');
    expect(fits[0].name).toBe('옛 룩 보정');
    expect(fits[0].params).toEqual({ eyeEnlarge: 0.4, jawWidth: -0.2 });
    // 컴파일 결과(fast-path)는 원본 params 그대로
    expect(style.compiled.params.lipIntensity).toBe(0.5);
    // v2 키로 재기록 (v1은 롤백 안전을 위해 남는다)
    const v2raw = await AsyncStorage.getItem('armakeup.userStyles.v2');
    expect(v2raw).toBeTruthy();
    expect(await AsyncStorage.getItem('armakeup.userStyles.v1')).toBeTruthy();

    __resetLookStoreMirrors();
    await AsyncStorage.clear();
  });

  test('보정 전용 v2 저장물(includeMk=false)은 필터로 이관 후 목록에서 제거', async () => {
    __resetLookStoreMirrors();
    await AsyncStorage.clear();
    const v2 = [
      {
        id: 'u2',
        name: '보정만',
        createdAt: 456,
        lookTree: null,
        warpRef: 'fit-vline',
        warpName: 'V라인',
        warpParams: { jawWidth: -0.3 },
        mkGain: 1,
        wpGain: 0.7,
        includeMk: false,
        includeWp: true,
        compiled: { params: { ...BARE }, overlayLayers: [] },
      },
    ];
    await AsyncStorage.setItem('armakeup.userStyles.v2', JSON.stringify(v2));

    const styles = await loadUserStylesV2();

    expect(styles).toHaveLength(0); // 메이크업 없는 항목은 이관 후 제거
    const fits = JSON.parse(
      (await AsyncStorage.getItem('armakeup.fitFilters.v1'))!,
    );
    expect(fits).toHaveLength(1);
    expect(fits[0].id).toBe('u2:wp');
    expect(fits[0].params).toEqual({ jawWidth: -0.3 });

    __resetLookStoreMirrors();
    await AsyncStorage.clear();
  });
});

// ── 10. 자유 그룹핑 (#23 Phase 3) — 슬롯 무관 사용자 그룹, 렌더 투명 ──────────

describe('사용자 그룹 CRUD', () => {
  /** 립+블러셔+아이섀도 3부위를 담은 커스텀 트리 */
  function threeRegionTree(): LookNode {
    let tree = emptyFaceLook('내 룩');
    tree = addRegionNode(tree, newRegionNode('lip', BARE));
    tree = addRegionNode(tree, newRegionNode('blush', BARE));
    tree = addRegionNode(tree, newRegionNode('eyeshadow', BARE));
    return tree;
  }
  const regionIds = (tree: LookNode) =>
    tree.kids.filter((c): c is LookNode => !isLeaf(c)).map(c => c.id);

  test('createGroup — 슬롯 무관 2+ region 묶기, dirty 전파, 2개 미만은 무변경', () => {
    const tree = threeRegionTree();
    const [lip, blush] = regionIds(tree);

    const grouped = createGroup(tree, '내 포인트 세트', [lip, blush]);
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups![0].name).toBe('내 포인트 세트');
    expect(grouped.groups![0].memberIds).toEqual([lip, blush]);
    expect(grouped.dirty).toBe(true);

    // 멤버 1개(또는 유효 멤버 없음)면 무변경
    expect(createGroup(tree, 'x', [lip])).toBe(tree);
    expect(createGroup(tree, 'x', ['no-such'])).toBe(tree);
  });

  test('flatten 투명성 — 그룹을 만들어도 렌더 결과(레이어)는 불변', () => {
    const tree = threeRegionTree();
    const before = flattenTree(tree).map(l => l.region);
    const [lip, eye] = [regionIds(tree)[0], regionIds(tree)[2]];
    const grouped = createGroup(tree, '세트', [lip, eye]);
    expect(flattenTree(grouped).map(l => l.region)).toEqual(before);
  });

  test('setGroupVisible — 통째 끔이 멤버 region visible을 내려 flatten에서 빠진다', () => {
    let tree = threeRegionTree();
    const [lip, blush] = regionIds(tree);
    tree = createGroup(tree, '세트', [lip, blush]);

    const off = setGroupVisible(tree, tree.groups![0].id, false);
    // 멤버 region이 꺼져 컴파일 강도가 0
    const params = compileLayers(flattenTree(off)).params;
    expect(params.lipIntensity).toBe(0);
    expect(params.blushIntensity).toBe(0);
    // 그룹 밖(아이섀도)은 유지
    expect((params.eyeshadowIntensity as number) > 0).toBe(true);
    expect(off.groups![0].visible).toBe(false);
    // visible 토글은 dirty 아님(구성 수정 아님)
    expect(off.groups![0].memberIds.length).toBe(2);

    // 다시 켜면 복구
    const on = setGroupVisible(off, off.groups![0].id, true);
    expect((compileLayers(flattenTree(on)).params.lipIntensity as number) > 0).toBe(true);
  });

  test('rename / addTo / removeFrom / removeGroup', () => {
    let tree = threeRegionTree();
    const [lip, blush, eye] = regionIds(tree);
    tree = createGroup(tree, '세트', [lip, blush]);
    const gidv = tree.groups![0].id;

    tree = renameGroup(tree, gidv, '포인트');
    expect(tree.groups![0].name).toBe('포인트');

    tree = addToGroup(tree, gidv, eye);
    expect(tree.groups![0].memberIds).toEqual([lip, blush, eye]);
    expect(groupOfRegion(tree, eye)!.id).toBe(gidv);

    tree = removeFromGroup(tree, gidv, eye);
    expect(tree.groups![0].memberIds).toEqual([lip, blush]);
    expect(groupOfRegion(tree, eye)).toBeNull();

    // removeGroup — 메타만 제거, 멤버 region은 트리에 남는다
    const ungrouped = removeGroup(tree, gidv);
    expect(ungrouped.groups ?? []).toHaveLength(0);
    expect(regionIds(ungrouped)).toEqual([lip, blush, eye]);
  });

  test('removeNode(멤버) → 그룹 멤버에서 자동 정리, 마지막이면 그룹 소멸', () => {
    let tree = threeRegionTree();
    const [lip, blush] = regionIds(tree);
    tree = createGroup(tree, '세트', [lip, blush]);

    const afterOne = removeNode(tree, lip);
    expect(afterOne.groups![0].memberIds).toEqual([blush]);

    const afterBoth = removeNode(afterOne, blush);
    expect(afterBoth.groups ?? []).toHaveLength(0); // 빈 그룹 제거
  });

  test('swapRegionNode(그룹 멤버 ⇄교체) → memberIds 새 id로 remap, 카운트·저장 왕복 보존', () => {
    const lib = buildSystemLibrary();
    let tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const lip = regionBySlot(tree, '립');
    const eye = regionBySlot(tree, '눈');
    tree = createGroup(tree, '세트', [lip.id, eye.id]);
    const gidv = tree.groups![0].id;

    // 립 자리를 라이브러리의 다른 립 룩으로 교체(새 id의 fresh 노드)
    const other = regionDefsForSlot(lib, '립').find(d => d.id !== lip.ref)!;
    const fresh = instantiate(lib, other.id)!;
    const swapped = swapRegionNode(tree, lip.id, fresh);

    const newLip = regionBySlot(swapped, '립');
    expect(newLip.id).toBe(fresh.id);
    expect(newLip.id).not.toBe(lip.id);
    // 그룹 멤버가 새 립 id로 갱신(옛 id dangling 아님), 눈은 그대로, 카운트 2 유지
    expect(swapped.groups![0].memberIds).toEqual([fresh.id, eye.id]);
    expect(groupOfRegion(swapped, fresh.id)!.id).toBe(gidv);
    expect(groupOfRegion(swapped, lip.id)).toBeNull(); // 옛 id는 어느 그룹에도 없음

    // 저장 왕복 — 순번이 살아 revive 후에도 그룹 2멤버 보존(findIndex<0 소실 없음)
    const revived = reviveTree(snapshotTree(swapped), lib);
    expect(revived.groups).toHaveLength(1);
    expect(revived.groups![0].memberIds).toHaveLength(2);
  });

  test('createGroup — 이미 다른 그룹 멤버인 region은 배제(다중 소속 금지)', () => {
    let tree = threeRegionTree();
    tree = addRegionNode(tree, newRegionNode('contour', BARE));
    const [lip, blush, eye, contour] = regionIds(tree);
    tree = createGroup(tree, 'A', [lip, blush]);
    const gA = tree.groups![0].id;

    // B에 lip(이미 A)+eye+contour → lip 배제, eye·contour로만 형성
    const withB = createGroup(tree, 'B', [lip, eye, contour]);
    expect(withB.groups).toHaveLength(2);
    const gB = withB.groups!.find(g => g.id !== gA)!;
    expect(gB.memberIds).toEqual([eye, contour]); // lip 제외됨
    expect(groupOfRegion(withB, lip)!.id).toBe(gA); // lip은 여전히 A만

    // 이미 그룹된 것만으로는 새 그룹 못 만듦(유효 멤버 2 미만 → 무변경)
    expect(createGroup(tree, 'C', [lip, blush])).toBe(tree);
  });

  test('snapshot/revive — 그룹이 새 인스턴스 id로 안전 재매핑(순번 기반)', () => {
    let tree = threeRegionTree();
    const [lip, eye] = [regionIds(tree)[0], regionIds(tree)[2]];
    tree = createGroup(tree, '내 세트', [lip, eye]);
    tree = setGroupVisible(tree, tree.groups![0].id, false);

    const snap = snapshotTree(tree);
    expect(snap.groups).toHaveLength(1);
    expect(snap.groups![0].memberIndexes).toEqual([0, 2]); // region 순번

    const revived = reviveTree(snap, buildSystemLibrary());
    expect(revived.groups).toHaveLength(1);
    expect(revived.groups![0].name).toBe('내 세트');
    expect(revived.groups![0].visible).toBe(false);
    // 멤버 id는 새로 생성됐지만 순번상 립·아이섀도 region을 정확히 가리킨다
    const rIds = regionIds(revived);
    expect(revived.groups![0].memberIds).toEqual([rIds[0], rIds[2]]);
  });
});

// ── 9. 그룹 라이브러리 승격/재사용 (#23 Phase 3) ─────────────────────────────

describe('그룹 번들 승격·재사용·copy-on-write', () => {
  const regionNodes = (tree: LookNode) =>
    tree.kids.filter((c): c is LookNode => !isLeaf(c));
  const regionIds = (tree: LookNode) => regionNodes(tree).map(c => c.id);

  /** 립+블러셔를 묶은 그룹이 있는 커스텀 트리 */
  function groupedTree(): { tree: LookNode; groupId: string } {
    let tree = emptyFaceLook('내 룩');
    tree = addRegionNode(tree, newRegionNode('lip', BARE));
    tree = addRegionNode(tree, newRegionNode('blush', BARE));
    const [lip, blush] = regionIds(tree);
    tree = createGroup(tree, '내 포인트', [lip, blush]);
    return { tree, groupId: tree.groups![0].id };
  }

  /** 트리에서 특정 부위 첫 잎 */
  function leafOfRegion(tree: LookNode, region: string): ProductLeaf {
    const found: ProductLeaf[] = [];
    const walk = (n: LookNode) => {
      for (const c of n.kids) {
        if (isLeaf(c)) {
          if (c.region === region) found.push(c);
        } else walk(c);
      }
    };
    walk(tree);
    if (found.length === 0) throw new Error(`${region} 잎 없음`);
    return found[0];
  }

  test('promoteGroup — 재사용 번들(kind:group,user) 등록 + 멤버 region 정의 생성 + 그룹 ref 링크', () => {
    const { tree, groupId } = groupedTree();
    const lib = buildSystemLibrary();

    const res = promoteGroup(tree, lib, groupId, '데일리 세트')!;
    expect(res).not.toBeNull();

    const bundle = res.lib[res.defId];
    expect(bundle.kind).toBe('group');
    expect(bundle.owner).toBe('user');
    expect(bundle.name).toBe('★ 데일리 세트');
    expect((bundle.kids as string[]).length).toBe(2);
    // 멤버 region 정의가 라이브러리에 등록됐다(사용자 소유)
    for (const rid of bundle.kids as string[]) {
      expect(res.lib[rid].level).toBe('region');
      expect(res.lib[rid].owner).toBe('user');
    }
    // 작업본 그룹에 ref 링크·이름 반영, 멤버 re-ref + dirty 해제
    const grp = res.root.groups![0];
    expect(grp.ref).toBe(res.defId);
    expect(grp.name).toBe('데일리 세트');
    for (const m of regionNodes(res.root)) {
      expect(m.ref).toBeTruthy();
      expect(m.dirty).toBe(false);
    }
    // 원본 lib 불변(사본에만 추가)
    expect(lib[res.defId]).toBeUndefined();
    // groupBundleDefs가 새 번들을 노출
    expect(groupBundleDefs(res.lib).map(d => d.id)).toContain(res.defId);
  });

  test('promoteGroup — 그룹 없거나 멤버 없으면 null', () => {
    const { tree } = groupedTree();
    expect(promoteGroup(tree, buildSystemLibrary(), 'no-such', 'x')).toBeNull();
  });

  test('addGroupBundle / instantiateGroup — 새 id로 인스턴스화, 그룹 재구성, flatten 반영', () => {
    const { tree, groupId } = groupedTree();
    const { lib, defId } = promoteGroup(tree, buildSystemLibrary(), groupId, '세트')!;

    const inst = instantiateGroup(lib, defId)!;
    expect(inst.nodes).toHaveLength(2);
    expect(inst.group.ref).toBe(defId);
    expect(inst.group.memberIds).toEqual(inst.nodes.map(n => n.id));

    // 빈 트리에 번들 추가 — 멤버 전체가 새 그룹으로
    let fresh = addGroupBundle(emptyFaceLook('재사용'), lib, defId);
    expect(fresh.groups).toHaveLength(1);
    expect(fresh.groups![0].ref).toBe(defId);
    expect(fresh.groups![0].memberIds).toEqual(regionIds(fresh));
    expect(fresh.dirty).toBe(true);
    // 렌더 반영 — 립·블러셔 레이어
    const regions = flattenTree(fresh).map(l => l.region);
    expect(regions).toContain('lip');
    expect(regions).toContain('blush');

    // 같은 번들을 한 트리에 두 번 넣어도 인스턴스 id가 겹치지 않는다
    fresh = addGroupBundle(fresh, lib, defId);
    expect(fresh.groups).toHaveLength(2);
    const allIds = regionIds(fresh);
    expect(new Set(allIds).size).toBe(allIds.length);

    // 없는 번들 id는 무변경
    expect(addGroupBundle(fresh, lib, 'no-such')).toBe(fresh);
    expect(instantiateGroup(lib, 'no-such')).toBeNull();
  });

  test('collectChanges — 번들 링크 그룹의 멤버 편집은 region 개별 아닌 그룹 항목 1개로', () => {
    const { tree: base, groupId } = groupedTree();
    const promoted = promoteGroup(base, buildSystemLibrary(), groupId, '세트')!;
    const lib = promoted.lib;
    const defId = promoted.defId;

    // 같은 번들을 쓰는 다른 저장 룩(공유 카운트용)
    const otherSnap = snapshotTree(addGroupBundle(emptyFaceLook('다른 룩'), lib, defId));

    // 작업본 — 번들 인스턴스의 립 잎 색 수정(멤버 dirty)
    let work = addGroupBundle(emptyFaceLook('작업'), lib, defId);
    const lipLeaf = leafOfRegion(work, 'lip');
    work = updateLeaf(work, lipLeaf.id, { params: { lipColor: '#00FF00' } });

    const items = collectChanges(work, lib, [otherSnap]);
    expect(items).toHaveLength(1); // 멤버 2개지만 그룹 항목 1개(개별 억제)
    expect(items[0].target).toBe('group');
    expect(items[0].kind).toBe('choice');
    expect(items[0].sharedCount).toBe(1); // 다른 룩 1곳도 같은 번들
  });

  test('그룹 원본 반영(apply) — 번들 멤버 정의 in-place 갱신 → 다른 스타일에 전파', () => {
    const { tree: base, groupId } = groupedTree();
    const promoted = promoteGroup(base, buildSystemLibrary(), groupId, '세트')!;
    const lib = promoted.lib;
    const defId = promoted.defId;

    const otherSnap = snapshotTree(addGroupBundle(emptyFaceLook('다른 룩'), lib, defId));

    let work = addGroupBundle(emptyFaceLook('작업'), lib, defId);
    const lipLeaf = leafOfRegion(work, 'lip');
    work = updateLeaf(work, lipLeaf.id, { params: { lipColor: '#00FF00' } });

    const items = collectChanges(work, lib, [otherSnap]);
    items[0].mode = 'apply';
    const applied = applySaveDecisions(work, lib, items);

    // 작업본 그룹 ref 유지(공유 링크), 멤버 dirty 해제
    const wg = applied.root.groups![0];
    expect(wg.ref).toBe(defId);
    for (const m of regionNodes(applied.root)) expect(m.dirty).toBe(false);

    // 다른 스타일 revive 시 갱신된 색으로 해석(전파 확인)
    const revived = reviveTree(otherSnap, applied.lib);
    const params = compileLayers(flattenTree(revived)).params;
    expect(params.lipColor).toBe('#00FF00');
  });

  test('그룹 사본(copy) — 공유 번들 불변, 작업본 그룹은 익명으로 분리', () => {
    const { tree: base, groupId } = groupedTree();
    const promoted = promoteGroup(base, buildSystemLibrary(), groupId, '세트')!;
    const lib = promoted.lib;
    const defId = promoted.defId;
    const bundleBefore = JSON.parse(JSON.stringify(lib[defId]));

    const otherSnap = snapshotTree(addGroupBundle(emptyFaceLook('다른 룩'), lib, defId));

    let work = addGroupBundle(emptyFaceLook('작업'), lib, defId);
    const lipLeaf = leafOfRegion(work, 'lip');
    work = updateLeaf(work, lipLeaf.id, { params: { lipColor: '#123456' } });

    const items = collectChanges(work, lib, [otherSnap]);
    expect(items[0].mode).toBe('copy'); // 기본
    const applied = applySaveDecisions(work, lib, items);

    // 작업본 그룹은 번들에서 분리(익명), 멤버 ref도 분리(사본)
    expect(applied.root.groups![0].ref).toBeNull();
    // 원본 번들 정의 불변
    expect(applied.lib[defId]).toEqual(bundleBefore);
    // 수정값은 작업본 사본에 살아있다
    const params = compileLayers(flattenTree(applied.root)).params;
    expect(params.lipColor).toBe('#123456');
    // 다른 스타일은 원본 번들로 해석 — 전파 없음(사본이므로)
    const revivedOther = compileLayers(flattenTree(reviveTree(otherSnap, applied.lib))).params;
    expect(revivedOther.lipColor).not.toBe('#123456');
  });

  test('저장 시트 그룹 promote 토글 — 사본이면서 새 번들로도 등록', () => {
    const { tree: base, groupId } = groupedTree();
    const promoted = promoteGroup(base, buildSystemLibrary(), groupId, '세트')!;
    const lib = promoted.lib;
    const defId = promoted.defId;

    let work = addGroupBundle(emptyFaceLook('작업'), lib, defId);
    const lipLeaf = leafOfRegion(work, 'lip');
    work = updateLeaf(work, lipLeaf.id, { params: { lipColor: '#AA00AA' } });

    const items = collectChanges(work, lib, []);
    items[0].promote = true; // 사본(copy) + 승격
    const applied = applySaveDecisions(work, lib, items);

    // 새 그룹 번들이 하나 더 등록됨(원본 + 승격본)
    const bundles = groupBundleDefs(applied.lib);
    expect(bundles.length).toBe(2);
    expect(bundles.some(d => d.id !== defId && d.kind === 'group')).toBe(true);
  });

  test('직렬화 왕복 — group.ref가 snapshot/revive에서 보존', () => {
    const { tree: base, groupId } = groupedTree();
    const promoted = promoteGroup(base, buildSystemLibrary(), groupId, '세트')!;
    const lib = promoted.lib;
    const work = addGroupBundle(emptyFaceLook('작업'), lib, promoted.defId);

    const snap = snapshotTree(work);
    expect(snap.groups![0].ref).toBe(promoted.defId);

    const revived = reviveTree(snap, lib);
    expect(revived.groups![0].ref).toBe(promoted.defId);
    expect(revived.groups![0].memberIds).toEqual(regionIds(revived));
  });

  test('C1 회귀 — 시스템 멤버 그룹 apply가 시스템 region 정의를 오염시키지 않음(rule 2)', () => {
    const lib = buildSystemLibrary();
    const baseLipColor = compileLayers(
      flattenTree(instantiate(lib, faceLookIdForPreset('rosy'))!),
    ).params.lipColor;

    // 시스템 프리셋 인스턴스 — 립·눈 region은 sys def를 라이브 참조(ref='sys:...')
    let seed = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const sysLip = seed.kids.find(
      (c): c is LookNode => !isLeaf(c) && c.slot === '립',
    )!;
    const sysEye = seed.kids.find(
      (c): c is LookNode => !isLeaf(c) && c.slot === '눈',
    )!;
    const sysLipDefId = sysLip.ref!;
    expect(lib[sysLipDefId].owner).toBe('system');
    const sysDefBefore = JSON.parse(JSON.stringify(lib[sysLipDefId]));

    seed = createGroup(seed, '시스템 세트', [sysLip.id, sysEye.id]);
    const promoted = promoteGroup(seed, lib, seed.groups![0].id, '세트')!;

    // (b) 승격 시 시스템 멤버는 사용자 사본 def로 승격 — 번들·멤버 ref가 sys가 아님
    for (const rid of promoted.lib[promoted.defId].kids as string[]) {
      expect(promoted.lib[rid].owner).toBe('user');
    }
    // 그룹 멤버(립·눈)만 검사 — 비멤버 slot은 여전히 sys 라이브 참조가 정상
    const memberIds = promoted.root.groups![0].memberIds;
    for (const m of regionNodes(promoted.root)) {
      if (!memberIds.includes(m.id)) continue;
      expect(promoted.lib[m.ref!].owner).toBe('user');
    }
    // 시스템 def는 승격만으로 이미 불변
    expect(promoted.lib[sysLipDefId]).toEqual(sysDefBefore);

    // 재사용 → 립 잎 편집 → 그룹 "원본 반영"(apply)
    let work = addGroupBundle(emptyFaceLook('작업'), promoted.lib, promoted.defId);
    const lipLeaf = leafOfRegion(work, 'lip');
    work = updateLeaf(work, lipLeaf.id, { params: { lipColor: '#00FF00' } });
    const items = collectChanges(work, promoted.lib, []);
    items[0].mode = 'apply';
    const applied = applySaveDecisions(work, promoted.lib, items);

    // ★ 핵심: 시스템 region 정의가 세션 내에서 변형되지 않았다(오염 없음)
    expect(applied.lib[sysLipDefId]).toEqual(sysDefBefore);
    // 시스템 프리셋을 라이브 참조하는 별도 스타일이 원래 색으로 렌더(전파 없음)
    const sysStyle = compileLayers(
      flattenTree(instantiate(applied.lib, faceLookIdForPreset('rosy'))!),
    ).params;
    expect(sysStyle.lipColor).toBe(baseLipColor);
    expect(sysStyle.lipColor).not.toBe('#00FF00');
    // 편집은 작업본 사용자 사본에만 반영
    expect(compileLayers(flattenTree(applied.root)).params.lipColor).toBe('#00FF00');
  });

  test('하위호환 — ref 없는 옛 그룹 스냅샷은 익명 그룹으로 로드(개별 region 항목)', () => {
    // 옛 저장물 재현: GroupSnapshot에 ref 필드 없음
    const lib = buildSystemLibrary();
    let tree = instantiate(lib, faceLookIdForPreset('rosy'))!;
    const lip = tree.kids.find((c): c is LookNode => !isLeaf(c) && c.slot === '립')!;
    const eye = tree.kids.find((c): c is LookNode => !isLeaf(c) && c.slot === '눈')!;
    tree = createGroup(tree, '옛 세트', [lip.id, eye.id]);

    const snap = snapshotTree(tree);
    // 익명 그룹이라 ref 필드가 직렬화되지 않는다(바이트 절약·하위호환)
    expect(snap.groups![0].ref).toBeUndefined();

    const revived = reviveTree(snap, lib);
    expect(revived.groups![0].ref).toBeNull(); // 익명 복원

    // 멤버 편집 → 번들 그룹 항목이 아니라 개별 region 항목으로 수집(기존 규칙 유지)
    const leaf = leafOfRegion(revived, 'lip');
    const edited = updateLeaf(revived, leaf.id, { params: { lipIntensity: 0.9 } });
    const items = collectChanges(edited, lib, []);
    expect(items.every(i => i.target !== 'group')).toBe(true);
    expect(items.some(i => i.slot === '립')).toBe(true);
  });
});
