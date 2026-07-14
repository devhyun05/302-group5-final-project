/**
 * @format
 * App 하단 UI 재편 검증 — 도메인×깊이 전환, 농도 라우팅, undo/redo, 룩 상속.
 * react-test-renderer로 렌더 후 라벨로 버튼을 찾아 상호작용한다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, TouchableOpacity } from 'react-native';
import App from '../App';
import ComposerSheet from '../src/components/ComposerSheet';
import Icon from '../src/components/Icon';
import { isLeaf } from '../src/composer/lookTree';
import type { ProductLeaf, TreeChild } from '../src/composer/lookTree';

const ROSE = '#FF7E9D';

// TestInstance의 모든 문자열 자식을 이어붙인다(라벨 매칭용).
function collectText(inst: any): string {
  if (typeof inst === 'string') return inst;
  if (inst == null || typeof inst !== 'object') return '';
  const kids = inst.children ?? [];
  return kids.map(collectText).join('');
}

// 트리 첫 잎(id로 컴포저 임포트 프롭 호출용).
function firstLeaf(node: TreeChild | null): ProductLeaf | null {
  if (!node) return null;
  if (isLeaf(node)) return node;
  for (const kid of node.kids) {
    const found = firstLeaf(kid);
    if (found) return found;
  }
  return null;
}

// LOOK 칩이 선택 상태인지 — lookSel 하이라이트 검증.
function isLookChipSelected(root: any, text: string): boolean {
  const chip = root
    .findAll((i: any) => i.type === TouchableOpacity)
    .find((t: any) => collectText(t) === text);
  if (!chip) return false;
  // 선택 표시 — 카드 자신의 테두리(cardOn borderColor ROSE)가 1차. 자손의 테두리/
  // 텍스트색/배경도 함께 검사(레거시·오버레이 겸용). 어디든 히트하면 선택.
  const selfFlat = StyleSheet.flatten(chip.props.style) as any;
  if (selfFlat?.borderColor === ROSE || selfFlat?.backgroundColor === ROSE) {
    return true;
  }
  return chip.findAll(() => true).some((n: any) => {
    const s = StyleSheet.flatten(n.props?.style) as any;
    return (
      s?.borderColor === ROSE ||
      s?.color === ROSE ||
      s?.backgroundColor === ROSE
    );
  });
}

async function renderApp(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  return renderer;
}

// 정확히 그 텍스트를 가진 첫 TouchableOpacity 찾기(가장 안쪽 = 최소 텍스트 매칭).
function pressableByText(root: any, text: string): any {
  return root
    .findAll((i: any) => i.type === TouchableOpacity)
    .find((t: any) => collectText(t) === text);
}

function pressableContaining(root: any, text: string): any {
  return root
    .findAll((i: any) => i.type === TouchableOpacity)
    .find((t: any) => collectText(t).includes(text));
}

// SVG 아이콘 버튼 찾기 — 커스텀 아이콘 도입(e4c69a3)으로 유니코드 글리프(↶⌄ 등)가
// <Icon name>으로 교체됨. 해당 이름의 Icon을 품은 첫 TouchableOpacity를 돌려준다.
function pressableByIcon(root: any, name: string): any {
  return root
    .findAll((i: any) => i.type === TouchableOpacity)
    .find((t: any) =>
      t.findAll((n: any) => n.type === Icon && n.props?.name === name).length > 0,
    );
}

test('renders correctly', async () => {
  await renderApp();
});

test('도메인 세그먼트 — 메이크업·보정 상시 노출, 보정 선택 시 깊이 버튼 없음', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  // 세그먼트라 메이크업·보정 둘 다 상시 노출. 메이크업이면 깊이 버튼(기본)도 노출
  expect(pressableByText(root, '메이크업')).toBeDefined();
  expect(pressableByText(root, '보정')).toBeDefined();
  expect(pressableByText(root, '기본')).toBeDefined();
  // 보정 선택 → fit 도메인. 보정은 상세만 → 깊이 버튼(기본/상세) 사라짐
  act(() => {
    pressableByText(root, '보정').props.onPress();
  });
  expect(pressableByText(root, '기본')).toBeUndefined();
  expect(pressableByText(root, '상세')).toBeUndefined();
});

test('깊이 버튼 — 현재 모드 표시(기본↔상세) 토글', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  // 기본 진입 → 현재 모드 "기본" 라벨. 누르면 상세로 전환
  const depth = pressableByText(root, '기본');
  expect(depth).toBeDefined();
  act(() => {
    depth.props.onPress();
  });
  // 상세로 갔으니 라벨이 "상세"로 바뀐다
  expect(pressableByText(root, '상세')).toBeDefined();
  expect(pressableByText(root, '기본')).toBeUndefined();
  // 메이크업·상세 = 컴포저 시트가 뜬다(저장 버튼 존재로 확인)
  expect(pressableByText(root, '저장')).toBeDefined();
});

test('undo/redo — 편집 전 비활성, 룩 편집 후 ↶ 활성, undo 후 ↷ 활성', async () => {
  const renderer = await renderApp();
  const root = renderer.root;

  expect(pressableByIcon(root, 'undo').props.disabled).toBe(true);
  expect(pressableByIcon(root, 'redo').props.disabled).toBe(true);

  // 시스템 룩('내추럴') 선택 = 실제 트리 편집 → 히스토리 기록
  act(() => {
    pressableByText(root, '내추럴').props.onPress();
  });
  expect(pressableByIcon(root, 'undo').props.disabled).toBe(false);

  // undo → redo 활성화
  act(() => {
    pressableByIcon(root, 'undo').props.onPress();
  });
  expect(pressableByIcon(root, 'redo').props.disabled).toBe(false);
});

test('no-op 선택은 죽은 히스토리 엔트리를 만들지 않는다(MED#4)', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  // 이미 'bare'가 활성인데 '원본'을 다시 눌러도 상태 무변화 → 기록 안 됨(↶ 비활성 유지)
  act(() => {
    pressableByText(root, '원본').props.onPress();
  });
  expect(pressableByIcon(root, 'undo').props.disabled).toBe(true);
});

test('서로 다른 칩 개별 undo — <500ms여도 코얼레스 안 됨(MED#3)', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  // 내추럴 → 로지 연속 선택(동일 tick 수준). 유니크 태그라 각각 1스텝이어야 한다.
  act(() => {
    pressableByText(root, '내추럴').props.onPress();
  });
  act(() => {
    pressableByText(root, '로지').props.onPress();
  });
  expect(isLookChipSelected(root, '로지')).toBe(true);
  // 첫 undo → 로지가 아니라 내추럴로(둘이 병합됐다면 곧장 bare로 갔을 것)
  act(() => {
    pressableByIcon(root, 'undo').props.onPress();
  });
  expect(isLookChipSelected(root, '내추럴')).toBe(true);
  expect(isLookChipSelected(root, '로지')).toBe(false);
  // 아직 되돌릴 스텝이 남아 있다(로지→내추럴, 내추럴→bare 두 스텝) → ↶ 활성
  expect(pressableByIcon(root, 'undo').props.disabled).toBe(false);
  // 둘째 undo → bare(원본)로
  act(() => {
    pressableByIcon(root, 'undo').props.onPress();
  });
  expect(isLookChipSelected(root, '원본')).toBe(true);
  expect(pressableByIcon(root, 'undo').props.disabled).toBe(true);
});

test('undo가 lookSel(하이라이트)을 복원한다(MED#2)', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  act(() => {
    pressableByText(root, '내추럴').props.onPress();
  });
  act(() => {
    pressableByText(root, '로지').props.onPress();
  });
  expect(isLookChipSelected(root, '로지')).toBe(true);
  act(() => {
    pressableByIcon(root, 'undo').props.onPress();
  });
  // 트리뿐 아니라 활성 칩도 내추럴로 복원(하이라이트 desync 회귀 방지)
  expect(isLookChipSelected(root, '내추럴')).toBe(true);
  expect(isLookChipSelected(root, '로지')).toBe(false);
});

test('컴포저 에셋 임포트가 undo에 기록된다(MED-HIGH#1)', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  // 트리가 있어야 컴포저에 잎이 있다 — 시스템 룩 선택 후 상세로.
  act(() => {
    pressableByText(root, '내추럴').props.onPress();
  });
  act(() => {
    pressableByText(root, '기본').props.onPress();
  });
  const sheet = root.findByType(ComposerSheet);
  const leaf = firstLeaf(sheet.props.tree);
  expect(leaf).toBeTruthy();

  // 마스크 임포트 = 잎에 marker(blushMaskImported=1) 올림 → 트리 편집(히스토리 경로).
  act(() => {
    sheet.props.onApplyMask('blush', leaf!.id, 'file:///tmp/mask.png');
  });
  const afterLeaf = firstLeaf(root.findByType(ComposerSheet).props.tree);
  expect((afterLeaf!.params as any).blushMaskImported).toBe(1);

  // undo → 임포트가 되돌려져 marker가 사라진다(임포트가 changeTree 직접 호출로 undo를
  // 우회하던 버그의 회귀 방지).
  act(() => {
    pressableByIcon(root, 'undo').props.onPress();
  });
  const undoneLeaf = firstLeaf(root.findByType(ComposerSheet).props.tree);
  expect((undoneLeaf!.params as any).blushMaskImported ?? 0).toBe(0);
});

test('농도 라우팅 — 메이크업 기본은 룩카드 아래 슬라이더, 보정은 헤더 슬라이더', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  const headerDensity = () =>
    root.findAll(
      (i: any) => typeof i.type === 'string' && i.props?.testID === 'density-slider',
    );
  // 메이크업 기본 모드: 농도 슬라이더가 룩카드 아래(BasicMode)로 이동 — 헤더엔 없음.
  expect(headerDensity().length).toBe(0);
  // '전체' 카테고리라 '전체 농도' 슬라이더가 존재.
  const allText = () =>
    root.findAll((i: any) => typeof i.type === 'string' || true).map(collectText);
  expect(allText().some((t: string) => t === '전체 농도')).toBe(true);
  // 옛 "메이크업 농도"/"보정 강도" 라벨은 없어야 한다.
  expect(allText().some((t: string) => t === '메이크업 농도')).toBe(false);
  expect(allText().some((t: string) => t === '보정 강도')).toBe(false);
  // 보정으로 바꾸면 헤더에 단일 슬라이더(보정은 카테고리 라우팅 없음).
  act(() => {
    pressableByText(root, '보정').props.onPress();
  });
  expect(headerDensity().length).toBe(1);
});

test('사진/동영상 토글(셔터 아래) — 동영상 선택 시 녹화 모드', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  const pvBtn = pressableContaining(root, '사진');
  expect(pvBtn).toBeDefined();
  act(() => {
    pvBtn.props.onPress();
  });
  // 녹화 기능이 구현되어 "준비 중" 안내는 더 이상 없다.
  const texts = root.findAll(() => true).map(collectText);
  expect(texts.some((t: string) => t.includes('준비 중'))).toBe(false);
  // 셔터 버튼은 동영상 모드에서도 존재한다(녹화 시작/정지 토글).
  expect(
    root.findAll((i: any) => i.props?.testID === 'shutter-btn').length,
  ).toBeGreaterThan(0);
});

test('최소화(⌄/⌃) — 본문 숨겨도 카메라 줄은 유지', async () => {
  const renderer = await renderApp();
  const root = renderer.root;
  const mini = pressableByIcon(root, 'chevronDown');
  expect(mini).toBeDefined();
  act(() => {
    mini.props.onPress();
  });
  // 최소화 후에도 카메라 줄(갤러리 버튼)은 살아 있어야 한다
  expect(
    root.findAll((i: any) => i.props?.testID === 'gallery-btn').length,
  ).toBeGreaterThan(0);
  // 펼침 토글로 복귀
  expect(pressableByIcon(root, 'chevronUp')).toBeDefined();
});
