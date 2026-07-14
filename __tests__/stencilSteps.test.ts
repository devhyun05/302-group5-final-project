/**
 * @format
 * 튜토리얼 가이드 잎별(레이어=제품×적용) 스텝 유도 계약:
 *  - 룩 트리 잎을 바르는 순서대로, 부위로 묶지 않고 잎 하나=한 스텝
 *  - 같은 부위 여러 잎(립 4겹 등)도 각각 별도 스텝
 *  - 가이드 윤곽 있는 부위만(피부·데코 등 미지원 제외)
 *  - isolateStencilStep은 그 부위 하나만 켜고 연출·농도는 유지
 */
import type { StencilParams } from '../src/bridge/types';
import {
  isolateStencilStep,
  maskStencilByKeys,
  stencilStepsFromTree,
} from '../src/composer/stencilSteps';
import {
  addRegionNode,
  emptyFaceLook,
  newRegionNode,
} from '../src/composer/lookTree';
import { BARE } from '../src/presets';

const BASE: StencilParams = {
  opacity: 0.85,
  lips: false,
  brows: false,
  eyeshadow: false,
  eyeliner: false,
  aegyo: false,
  blush: false,
  highlighter: false,
  contour: false,
  pulse: true,
  dash: true,
};

describe('stencilStepsFromTree — 잎별 스텝', () => {
  test('빈 룩 → 스텝 없음', () => {
    expect(stencilStepsFromTree(null)).toEqual([]);
    expect(stencilStepsFromTree(emptyFaceLook())).toEqual([]);
  });

  test('잎을 바르는 순서대로(삽입 순서) 스텝화 — 부위로 안 묶음', () => {
    let tree = addRegionNode(emptyFaceLook(), newRegionNode('blush', BARE));
    tree = addRegionNode(tree, newRegionNode('eyeshadow', BARE));
    tree = addRegionNode(tree, newRegionNode('lip', BARE));
    expect(stencilStepsFromTree(tree).map(s => s.key)).toEqual([
      'blush',
      'eyeshadow',
      'lips',
    ]);
  });

  test('★같은 부위 여러 잎(립 3종)은 각각 별도 스텝(잎=레이어)', () => {
    let tree = addRegionNode(emptyFaceLook(), newRegionNode('lipBase', BARE));
    tree = addRegionNode(tree, newRegionNode('lip', BARE));
    tree = addRegionNode(tree, newRegionNode('lipGloss', BARE));
    const steps = stencilStepsFromTree(tree);
    expect(steps).toHaveLength(3); // 묶지 않고 3스텝
    expect(steps.every(s => s.key === 'lips')).toBe(true);
    expect(steps.every(s => s.zone === '립')).toBe(true);
    // 제품 라벨은 잎마다 다름(무엇을)
    expect(steps.map(s => s.label)).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
    expect(new Set(steps.map(s => s.id)).size).toBe(3); // 잎 id 고유
  });

  test('아이라인·애교살도 스텝(가이드 부위 매핑)', () => {
    let tree = addRegionNode(emptyFaceLook(), newRegionNode('eyelinerUpper', BARE));
    tree = addRegionNode(tree, newRegionNode('aegyo', BARE));
    expect(stencilStepsFromTree(tree).map(s => s.key)).toEqual([
      'eyeliner',
      'aegyo',
    ]);
  });

  test('가이드 윤곽 없는 부위(파우더·데코)는 스텝에서 제외', () => {
    let tree = addRegionNode(emptyFaceLook(), newRegionNode('powder', BARE));
    tree = addRegionNode(tree, newRegionNode('deco', BARE));
    tree = addRegionNode(tree, newRegionNode('eyeshadow', BARE));
    expect(stencilStepsFromTree(tree).map(s => s.key)).toEqual(['eyeshadow']);
  });

  test('눈썹 세부부위(browPencil 등)는 눈썹 가이드로 매핑', () => {
    const tree = addRegionNode(emptyFaceLook(), newRegionNode('browPencil', BARE));
    expect(stencilStepsFromTree(tree).map(s => s.key)).toEqual(['brows']);
  });
});

describe('isolateStencilStep', () => {
  test('그 부위 하나만 켜고 나머지 부위는 끔, 연출·농도 유지', () => {
    const on = { ...BASE, lips: true, blush: true };
    const result = isolateStencilStep(on, 'eyeliner');
    expect(result.eyeliner).toBe(true);
    expect(result.lips).toBe(false);
    expect(result.blush).toBe(false);
    expect(result.opacity).toBe(0.85);
    expect(result.pulse).toBe(true);
  });

  test('key=null → 전 부위 끔', () => {
    const r = isolateStencilStep({ ...BASE, brows: true, aegyo: true }, null);
    expect(
      r.lips || r.brows || r.eyeshadow || r.eyeliner || r.aegyo || r.blush || r.contour,
    ).toBe(false);
  });
});

describe('maskStencilByKeys — 룩에 없는 부위 가이드 방지', () => {
  test('룩에 있는 부위만 통과, 나머지는 강제 끔(연출·농도 유지)', () => {
    const on = {
      ...BASE,
      lips: true,
      brows: true,
      eyeshadow: true,
      opacity: 0.9,
    };
    // 룩엔 립만 있음 → 립만 통과, 눈썹·섀도는 꺼짐
    const r = maskStencilByKeys(on, new Set(['lips']));
    expect(r.lips).toBe(true);
    expect(r.brows).toBe(false);
    expect(r.eyeshadow).toBe(false);
    expect(r.opacity).toBe(0.9);
    expect(r.pulse).toBe(true);
  });

  test('빈 룩(집합 없음) → 켜둔 부위도 전부 꺼짐', () => {
    const on = { ...BASE, lips: true, brows: true, blush: true };
    const r = maskStencilByKeys(on, new Set());
    expect(r.lips || r.brows || r.blush).toBe(false);
  });
});
