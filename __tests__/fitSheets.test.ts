/**
 * 핏 시트(§5 A13) — 캐스케이드 해석·적용·왕복 계약 고정.
 * 셀렉터 구체성(겹id>역할>부위) → 시트 근접(하위룩>룩>메인) 필드별 오버라이드,
 * 골드 화이트리스트 강제, 델타 0=baseline(부재), 트리 왕복(role/fitRef) 보존.
 */
import {
  applyFitToLayers,
  entryOf,
  fitCapableRegions,
  fitFieldsOfRegion,
  newFitSheet,
  removeEntry,
  resolveLeafFit,
  upsertEntry,
} from '../src/composer/fitSheets';
import type { FitSheet } from '../src/composer/fitSheets';
import type { ComposerLayer } from '../src/composer/model';
import { flattenTree, reviveTree, snapshotTree } from '../src/composer/lookTree';
import type { LookNode, ProductLeaf } from '../src/composer/lookTree';

const sheet = (id: string, entries: FitSheet['entries']): FitSheet => ({
  id,
  name: id,
  entries,
});

// ── 해석: 구체성 · 근접 · 폴스루 ─────────────────────────────────────────────

describe('resolveLeafFit', () => {
  it('구체성 — 겹id > 역할 > 부위 (같은 필드는 더 구체적인 항목이 이긴다)', () => {
    const s = sheet('m', [
      { region: 'eyeshadow', rules: { eyeshadowHeight: 0.1 } },
      { region: 'eyeshadow', role: 'point', rules: { eyeshadowHeight: 0.2 } },
      { region: 'eyeshadow', leafId: 'L1', rules: { eyeshadowHeight: 0.3 } },
    ]);
    expect(
      resolveLeafFit('eyeshadow', 'point', 'L1', [s])?.rules?.eyeshadowHeight,
    ).toBe(0.3);
    expect(
      resolveLeafFit('eyeshadow', 'point', 'L2', [s])?.rules?.eyeshadowHeight,
    ).toBe(0.2);
    expect(
      resolveLeafFit('eyeshadow', undefined, 'L3', [s])?.rules?.eyeshadowHeight,
    ).toBe(0.1);
  });

  it('근접 — 같은 구체성이면 가까운 시트가 이긴다(하위룩>룩>메인)', () => {
    const near = sheet('near', [{ region: 'blush', rules: { blushLift: 0.05 } }]);
    const main = sheet('main', [{ region: 'blush', rules: { blushLift: 0.01 } }]);
    expect(
      resolveLeafFit('blush', undefined, 'x', [near, main])?.rules?.blushLift,
    ).toBe(0.05);
  });

  it('폴스루 — 가까운 시트에 없는 필드는 먼 시트(메인)로 내려간다', () => {
    const near = sheet('near', [{ region: 'blush', rules: { blushLift: 0.05 } }]);
    const main = sheet('main', [
      { region: 'blush', rules: { blushSpread: -0.03 } },
    ]);
    const d = resolveLeafFit('blush', undefined, 'x', [near, main]);
    expect(d?.rules?.blushLift).toBe(0.05);
    expect(d?.rules?.blushSpread).toBe(-0.03);
  });

  it('역할 셀렉터 — 역할이 일치할 때만, 미태그 잎은 부위 셀렉터까지만', () => {
    const s = sheet('m', [
      { region: 'eyeshadow', role: 'point', dy: -0.02 },
      { region: 'eyeshadow', dy: 0.01 },
    ]);
    expect(resolveLeafFit('eyeshadow', 'point', 'a', [s])?.dy).toBe(-0.02);
    expect(resolveLeafFit('eyeshadow', 'main', 'a', [s])?.dy).toBe(0.01);
    expect(resolveLeafFit('eyeshadow', undefined, 'a', [s])?.dy).toBe(0.01);
  });

  it('타 부위 항목은 무매치 → null', () => {
    const s = sheet('m', [{ region: 'blush', dy: 0.05 }]);
    expect(resolveLeafFit('eyeshadow', undefined, 'a', [s])).toBeNull();
  });
});

// ── 적용: 화이트리스트 · 클램프 · 오버레이 · 항등 ────────────────────────────

const paramLayer = (
  id: string,
  region: ComposerLayer['region'],
  params: ComposerLayer['params'] = {},
  extra: Partial<ComposerLayer> = {},
): ComposerLayer => ({ id, region, visible: true, params, ...extra });

describe('applyFitToLayers', () => {
  it('룰 델타 — 잎 파라미터에 가산되고 컨트롤 범위로 클램프된다', () => {
    const main = sheet('main', [
      { region: 'blush', rules: { blushLift: 99 } }, // max로 클램프될 큰 값
    ]);
    const layers = [
      paramLayer('a', 'blush', { blushLift: 0 }, { fitChain: undefined }),
    ];
    const out = applyFitToLayers(layers, { sheets: [main], mainId: 'main' });
    const f = fitFieldsOfRegion('blush').find(x => x.key === 'blushLift')!;
    expect(out[0].params.blushLift).toBe(f.max);
    expect(layers[0].params.blushLift).toBe(0); // 원본 불변
  });

  it('공간 한정 — 골드 화이트리스트 밖 키(색·농도)는 무시된다', () => {
    const main = sheet('main', [
      { region: 'blush', rules: { blushIntensity: 0.5 } as any },
    ]);
    const layers = [paramLayer('a', 'blush', { blushIntensity: 0.3 })];
    const out = applyFitToLayers(layers, { sheets: [main], mainId: 'main' });
    expect(out).toBe(layers); // 변경 없음 = 같은 참조
  });

  it('데코 오버레이 — dx/dy/sx/rot가 배치에 얹히고 x·y는 0..1 클램프', () => {
    const main = sheet('main', [
      { region: 'deco', dx: 0.9, dy: -0.1, sx: 0.5, rot: 30 },
    ]);
    const layers: ComposerLayer[] = [
      {
        id: 'd1',
        region: 'deco',
        visible: true,
        params: {},
        overlay: {
          path: 'builtin:dot',
          intensity: 0.7,
          x: 0.35,
          y: 0.05,
          scale: 0.3,
          rotation: 10,
          blendMode: 1,
          color: '#fff',
          kind: 'deco',
        },
      },
    ];
    const out = applyFitToLayers(layers, { sheets: [main], mainId: 'main' });
    expect(out[0].overlay!.x).toBe(1); // 0.35+0.9 → 클램프
    expect(out[0].overlay!.y).toBe(0); // 0.05-0.1 → 클램프
    expect(out[0].overlay!.scale).toBeCloseTo(0.45); // ×(1+0.5)
    expect(out[0].overlay!.rotation).toBe(40);
  });

  it('fitChain — 잎에 주석된 가까운 시트가 메인보다 우선한다', () => {
    const look = sheet('look', [{ region: 'blush', rules: { blushLift: 0.06 } }]);
    const main = sheet('main', [{ region: 'blush', rules: { blushLift: 0.02 } }]);
    const layers = [
      paramLayer('a', 'blush', { blushLift: 0 }, { fitChain: ['look'] }),
      paramLayer('b', 'blush', { blushLift: 0 }), // 사슬 없음 → 메인만
    ];
    const out = applyFitToLayers(layers, {
      sheets: [look, main],
      mainId: 'main',
    });
    expect(out[0].params.blushLift).toBeCloseTo(0.06);
    expect(out[1].params.blushLift).toBeCloseTo(0.02);
  });

  it('항등 — 시트 없음/무매치면 입력 배열 그대로(참조 동일)', () => {
    const layers = [paramLayer('a', 'blush', { blushLift: 0 })];
    expect(applyFitToLayers(layers, { sheets: [], mainId: null })).toBe(layers);
    const other = sheet('m', [{ region: 'lip', rules: { lipOverline: 0.1 } }]);
    expect(
      applyFitToLayers(layers, { sheets: [other], mainId: 'm' }),
    ).toBe(layers);
  });
});

// ── 화이트리스트 유도 — 카탈로그 단일 출처 ───────────────────────────────────

describe('fitFieldsOfRegion / fitCapableRegions', () => {
  it('블러셔 = 리프트·퍼짐, 눈썹 = 타 축 골드 슬라이더(두께·아치)도 포함', () => {
    const blush = fitFieldsOfRegion('blush').map(f => f.key);
    expect(blush).toEqual(expect.arrayContaining(['blushLift', 'blushSpread']));
    const brow = fitFieldsOfRegion('brow').map(f => f.key);
    expect(brow).toEqual(
      expect.arrayContaining(['browThickness', 'browArch']),
    );
  });

  it('데코 부위는 골드 필드 없이도 핏 가능 부위(배치 아핀)', () => {
    expect(fitCapableRegions()).toEqual(expect.arrayContaining(['deco']));
  });
});

// ── 시트 CRUD — 0=baseline=부재 ──────────────────────────────────────────────

describe('upsertEntry / removeEntry', () => {
  it('델타 0은 필드를 지우고, 전부 비면 항목 자체가 사라진다', () => {
    let s = newFitSheet('테스트');
    s = upsertEntry(s, { region: 'blush' }, { rules: { blushLift: 0.05 } });
    expect(entryOf(s, { region: 'blush' })?.rules?.blushLift).toBe(0.05);
    s = upsertEntry(s, { region: 'blush' }, { rules: { blushLift: 0 } });
    expect(entryOf(s, { region: 'blush' })).toBeUndefined();
  });

  it('역할 셀렉터 항목은 부위 항목과 별개로 관리된다', () => {
    let s = newFitSheet('t');
    s = upsertEntry(s, { region: 'eyeshadow' }, { dy: 0.01 });
    s = upsertEntry(s, { region: 'eyeshadow', role: 'point' }, { dy: -0.02 });
    expect(s.entries).toHaveLength(2);
    s = removeEntry(s, { region: 'eyeshadow', role: 'point' });
    expect(s.entries).toHaveLength(1);
    expect(entryOf(s, { region: 'eyeshadow' })?.dy).toBe(0.01);
  });
});

// ── 트리 통합 — fitChain 주석과 role/fitRef 스냅샷 왕복 ──────────────────────

const leaf = (id: string, role?: string): ProductLeaf => ({
  kind: 'app',
  id,
  label: '아이섀도',
  region: 'eyeshadow',
  visible: true,
  dirty: false,
  params: {},
  ...(role ? { role } : {}),
});

const node = (
  id: string,
  kids: LookNode['kids'],
  fitRef?: string,
  level: LookNode['level'] = 'region',
): LookNode => ({
  kind: 'look',
  id,
  ref: null,
  name: id,
  level,
  slot: '눈',
  owner: 'user',
  visible: true,
  dirty: false,
  kids,
  ...(fitRef ? { fitRef } : {}),
});

describe('flattenTree × 핏 주석', () => {
  it('fitChain = 가까운 조상 fitRef 먼저, role은 잎에서 그대로', () => {
    const tree = node(
      'root',
      [
        node('sub', [leaf('L1', 'point')], 'subSheet'),
        leaf('L2'),
      ],
      'lookSheet',
      'face',
    );
    const flat = flattenTree(tree);
    expect(flat.find(l => l.id === 'L1')?.fitChain).toEqual([
      'subSheet',
      'lookSheet',
    ]);
    expect(flat.find(l => l.id === 'L1')?.role).toBe('point');
    expect(flat.find(l => l.id === 'L2')?.fitChain).toEqual(['lookSheet']);
    expect(flat.find(l => l.id === 'L2')?.role).toBeUndefined();
  });
});

describe('스냅샷 왕복 — role·fitRef·잎 id 보존', () => {
  it('snapshotTree → reviveTree(동결 경로)에서 살아남는다', () => {
    const tree = node(
      'root',
      [node('sub', [leaf('L1', 'point')], 'mySheet')],
      'lookSheet',
      'face',
    );
    const revived = reviveTree(snapshotTree(tree), {});
    expect(revived.fitRef).toBe('lookSheet');
    const sub = revived.kids[0] as LookNode;
    expect(sub.fitRef).toBe('mySheet');
    const l = sub.kids[0] as ProductLeaf;
    expect(l.role).toBe('point');
    // 잎 id 왕복 보존 — '#겹id' 핏 셀렉터가 저장/재로드를 견디는 전제(§5 A13)
    expect(l.id).toBe('L1');
  });

  it('id 없는 옛 스냅샷은 새 id를 발급받는다(하위호환)', () => {
    const snap = snapshotTree(node('root', [leaf('L9')], undefined, 'face'));
    delete (snap.kids[0] as {id?: string}).id;
    const revived = reviveTree(snap, {});
    const l = revived.kids[0] as ProductLeaf;
    expect(l.id).toBeTruthy();
    expect(l.id).not.toBe('L9');
  });
});
