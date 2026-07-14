/**
 * @format
 * ComposerSheet 카탈로그 배선(§16) — 카탈로그 항목 탭 = apply-by-uri.
 * 사진 라이브러리(launchImageLibrary) 없이, 썸네일 탭이 그 항목 uri로 바로 적용되는지
 * (onApply*가 (action/region, leafId, uri)로 호출되는지) 렌더+상호작용으로 검증한다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, Image, TouchableOpacity } from 'react-native';
import ComposerSheet from '../src/components/ComposerSheet';
import { BARE } from '../src/presets';
import {
  addRegionNode,
  emptyFaceLook,
  isLeaf,
  newRegionNode,
} from '../src/composer/lookTree';
import type { LookNode, ProductLeaf, TreeChild } from '../src/composer/lookTree';
import { loadCatalog } from '../src/assets/assetCatalog';

const LIP_ART_URI = 'file:///catalog/lip_art.png';
// 번들 항목 uri — Unity 전용 streaming: 스킴(RN Image 렌더 불가).
const LIP_BUNDLE_URI = 'streaming:catalog/colorArt/lip_cherry.png';

function firstLeaf(node: TreeChild): ProductLeaf | null {
  if (isLeaf(node)) return node;
  for (const kid of node.kids) {
    const found = firstLeaf(kid);
    if (found) return found;
  }
  return null;
}

// TestInstance의 모든 문자열 자식을 이어붙인다(라벨 매칭용).
// 축 탭 누르기 — 제품 탭 신설로 편집기 기본 탭이 '제품'이 되어, 텍스처 축 검증은
// 명시적으로 '텍스처' 탭을 눌러 연다(새 UI 현실 반영).
function pressTab(root: any, label: string) {
  const tab = root
    .findAll((i: any) => i.type === TouchableOpacity)
    .find((t: any) => collectText(t) === label);
  expect(tab).toBeDefined();
  act(() => {
    tab!.props.onPress();
  });
}

function collectText(inst: any): string {
  if (typeof inst === 'string') return inst;
  if (inst == null || typeof inst !== 'object') return '';
  const kids = inst.children ?? [];
  return kids.map(collectText).join('');
}

const noop = () => {};

function renderSheet(
  tree: LookNode,
  onApplyTexture: jest.Mock,
  onRemoveCatalogEntry?: jest.Mock,
  entries: unknown[] = [
    {
      id: 'lip-art-1',
      kind: 'colorArt',
      region: 'lip',
      name: '체리 립아트',
      tags: [],
      version: 1,
      uri: LIP_ART_URI,
    },
  ],
) {
  const catalog = loadCatalog({
    schema: 'armakeup.assetCatalog',
    version: 1,
    entries,
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <ComposerSheet
        tree={tree}
        library={{}}
        currentParams={BARE}
        onChangeTree={noop}
        onSave={noop}
        onClose={noop}
        onPickTexture={noop}
        onPickMask={noop}
        onPickTextureMap={noop}
        onPickOverlayImage={noop}
        onPickLensDesign={noop}
        catalog={catalog}
        onApplyTexture={onApplyTexture}
        onApplyMask={noop}
        onApplyTextureMap={noop}
        onApplyOverlayImage={noop}
        onApplyLensDesign={noop}
        onOpenCatalogImport={noop}
        onRemoveCatalogEntry={onRemoveCatalogEntry}
        userFinishes={[]}
        onSaveFinish={noop}
        onPromoteGroup={noop}
      />,
    );
  });
  return renderer;
}

test('카탈로그 립아트 썸네일 탭 → onApplyTexture(action, leafId, uri) (파일 선택 없이)', () => {
  const lipNode = newRegionNode('lip', BARE);
  const tree = addRegionNode(emptyFaceLook(), lipNode);
  const leaf = firstLeaf(tree)!;
  expect(leaf.region).toBe('lip');

  const onApplyTexture = jest.fn();
  const renderer = renderSheet(tree, onApplyTexture);
  const root = renderer.root;

  // 1) 립 잎 행을 눌러 축 편집기(texture 축)를 연다 — 잎 라벨로 행을 찾는다.
  const leafRow = root
    .findAll(i => i.type === TouchableOpacity)
    .find(t => collectText(t).includes('립스틱')); // 레이어 행 표시=제형명(립스틱) — 헤더 칩/이름과 구분
  expect(leafRow).toBeDefined();
  act(() => {
    leafRow!.props.onPress();
  });
  pressTab(root, '제품'); // 텍스처(제형) 섹션은 제품 그룹 안

  // 2) texture 축의 CatalogStrip에서 그 uri 썸네일을 담은 항목을 찾아 탭한다.
  const catalogItem = root
    .findAll(i => i.type === TouchableOpacity)
    .find(
      t =>
        t.findAll(x => x.type === Image && x.props.source?.uri === LIP_ART_URI)
          .length > 0,
    );
  expect(catalogItem).toBeDefined();
  act(() => {
    catalogItem!.props.onPress();
  });

  // apply-by-uri: 사진 라이브러리 없이 그 항목 uri로 바로 적용.
  expect(onApplyTexture).toHaveBeenCalledWith('lip', leaf.id, LIP_ART_URI);
});

test('카탈로그 썸네일 롱프레스 → 삭제 확인 → onRemoveCatalogEntry(id)', () => {
  const lipNode = newRegionNode('lip', BARE);
  const tree = addRegionNode(emptyFaceLook(), lipNode);

  const onRemove = jest.fn();
  // Alert.alert 확인 다이얼로그의 "삭제" 버튼을 즉시 눌러 삭제 경로를 태운다.
  const alertSpy = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_title, _msg, buttons) => {
      const del = (buttons ?? []).find(b => b.style === 'destructive');
      del?.onPress?.();
    });

  try {
    const renderer = renderSheet(tree, jest.fn(), onRemove);
    const root = renderer.root;

    // 립 잎 행을 눌러 편집기를 열고 텍스처 탭으로 전환(기본 탭=제품).
    const leafRow = root
      .findAll(i => i.type === TouchableOpacity)
      .find(t => collectText(t).includes('립스틱')); // 레이어 행 표시=제형명(립스틱) — 헤더 칩/이름과 구분
    act(() => {
      leafRow!.props.onPress();
    });
    pressTab(root, '제품');

    // 그 uri 썸네일 항목을 롱프레스.
    const catalogItem = root
      .findAll(i => i.type === TouchableOpacity)
      .find(
        t =>
          t.findAll(x => x.type === Image && x.props.source?.uri === LIP_ART_URI)
            .length > 0,
      );
    expect(catalogItem!.props.onLongPress).toBeDefined();
    act(() => {
      catalogItem!.props.onLongPress();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith('lip-art-1');
  } finally {
    alertSpy.mockRestore();
  }
});

test('번들 항목(streaming: uri, 썸네일 없음) → 이름 타일 폴백(깨진 Image 방지) + 탭은 여전히 uri로 apply', () => {
  const lipNode = newRegionNode('lip', BARE);
  const tree = addRegionNode(emptyFaceLook(), lipNode);
  const leaf = firstLeaf(tree)!;

  const onApplyTexture = jest.fn();
  const renderer = renderSheet(tree, onApplyTexture, undefined, [
    {
      id: 'lip-bundle-1',
      kind: 'colorArt',
      region: 'lip',
      name: '체리 번들립',
      tags: [],
      version: 1,
      uri: LIP_BUNDLE_URI, // streaming: — RN Image로 렌더 불가
    },
  ]);
  const root = renderer.root;

  // 립 잎 행을 눌러 편집기를 열고 텍스처 탭으로 전환(기본 탭=제품).
  const leafRow = root
    .findAll(i => i.type === TouchableOpacity)
    .find(t => collectText(t).includes('립스틱')); // 레이어 행 표시=제형명(립스틱) — 헤더 칩/이름과 구분
  act(() => {
    leafRow!.props.onPress();
  });
  pressTab(root, '제품');

  // streaming: uri는 어떤 <Image>에도 실리지 않아야 한다(깨진 이미지 방지).
  const imgs = root.findAll(x => x.type === Image);
  expect(imgs.some(x => x.props.source?.uri === LIP_BUNDLE_URI)).toBe(false);

  // 대신 이름 타일이 뜬다 — 그 항목 이름을 담고 uri로 apply되는 항목을 찾아 탭.
  const catalogItem = root
    .findAll(i => i.type === TouchableOpacity)
    .find(t => collectText(t).includes('체리 번들립'));
  expect(catalogItem).toBeDefined();
  act(() => {
    catalogItem!.props.onPress();
  });

  // apply-by-uri: 이름 타일이어도 탭하면 그 streaming: uri로 그대로 적용된다.
  expect(onApplyTexture).toHaveBeenCalledWith('lip', leaf.id, LIP_BUNDLE_URI);
});
