/**
 * @format
 * catalogPicker(§16) — 임포트 컨트롤 ↔ 카탈로그 kind 매핑 + 컨트롤별 후보(apply-by-uri
 * 대상 선택). 픽커가 "이 컨트롤 탭 시 어떤 uri 목록을 노출/적용할지" 결정하는 순수 로직.
 */
import { loadCatalog, type AssetCatalogEntry } from '../src/assets/assetCatalog';
import {
  CONTROL_KIND,
  designEntries,
  entriesForControl,
} from '../src/assets/catalogPicker';

const e = (over: Partial<AssetCatalogEntry> = {}): AssetCatalogEntry => ({
  id: 'x',
  kind: 'mask',
  region: 'blush',
  name: 'n',
  tags: [],
  version: 1,
  uri: 'file:///x.png',
  ...over,
});

const catalog = loadCatalog({
  schema: 'armakeup.assetCatalog',
  version: 1,
  entries: [
    e({ id: 'mask-blush', kind: 'mask', region: 'blush' }),
    e({ id: 'mask-eye', kind: 'mask', region: 'eyeshadow' }),
    e({ id: 'art-lip', kind: 'colorArt', region: 'lip' }),
    e({ id: 'art-brow', kind: 'colorArt', region: 'brow' }),
    e({ id: 'map-lip', kind: 'textureMap', region: 'lip' }),
  ],
});

describe('CONTROL_KIND 매핑', () => {
  test('컨트롤 타입 → 카탈로그 종류', () => {
    expect(CONTROL_KIND.maskImport).toBe('mask');
    expect(CONTROL_KIND.textureMap).toBe('textureMap');
    expect(CONTROL_KIND.import).toBe('colorArt');
  });
});

describe('entriesForControl — 컨트롤별 후보(kind+region)', () => {
  test('maskImport → 그 부위의 mask만', () => {
    expect(entriesForControl(catalog, 'maskImport', 'blush').map(x => x.id)).toEqual([
      'mask-blush',
    ]);
  });

  test('textureMap → 그 부위의 textureMap만', () => {
    expect(entriesForControl(catalog, 'textureMap', 'lip').map(x => x.id)).toEqual([
      'map-lip',
    ]);
  });

  test('import(컬러 아트) → action이 곧 부위(colorArt region)', () => {
    // 립 컬러아트 컨트롤(action:"lip")은 colorArt/lip만 노출한다.
    expect(entriesForControl(catalog, 'import', 'lip').map(x => x.id)).toEqual([
      'art-lip',
    ]);
    expect(entriesForControl(catalog, 'import', 'brow').map(x => x.id)).toEqual([
      'art-brow',
    ]);
  });

  test('해당 없으면 빈 목록', () => {
    expect(entriesForControl(catalog, 'maskImport', 'lip')).toEqual([]);
  });

  test('탭 대상 uri가 그대로 실린다 (apply-by-uri에 넘길 값)', () => {
    const picked = entriesForControl(catalog, 'import', 'lip')[0];
    expect(picked.uri).toBe('file:///x.png');
  });
});

describe('designEntries — 렌즈/오버레이 디자인 풀(부위 무관 컬러 아트 전체)', () => {
  test('colorArt 전부(부위 무관)', () => {
    expect(designEntries(catalog).map(x => x.id).sort()).toEqual([
      'art-brow',
      'art-lip',
    ]);
  });
});
