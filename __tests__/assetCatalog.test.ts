/**
 * @format
 * 에셋 카탈로그 로더(§16) — 매니페스트 파싱·검증·필터·불량입력 방어 검증.
 * loadCatalog는 순수 함수라 RN 렌더링 없이 입출력만 확인한다(composer.test 선례).
 */
import {
  ASSET_KINDS,
  CATALOG_SCHEMA_ID,
  COLOR_ART_REGIONS,
  MASK_REGIONS,
  REGIONS_BY_KIND,
  TEXTURE_MAP_REGIONS,
  allTags,
  emptyCatalog,
  entriesByKind,
  entriesByKindAndRegion,
  entriesByRegion,
  findEntryById,
  isRenderableThumb,
  isValidRegionForKind,
  loadCatalog,
  normalizeEntry,
  regionsForKind,
  searchEntries,
  serializeCatalog,
  type AssetCatalogEntry,
} from '../src/assets/assetCatalog';

const entry = (over: Partial<AssetCatalogEntry> = {}): AssetCatalogEntry => ({
  id: 'e1',
  kind: 'mask',
  region: 'blush',
  name: '자연 블러셔 존',
  tags: ['자연', '데일리'],
  version: 1,
  uri: 'file:///assets/mask_blush.png',
  ...over,
});

const manifest = (entries: unknown[]) => ({
  schema: CATALOG_SCHEMA_ID,
  version: 1,
  entries,
});

describe('종류·부위 정합 (regions.ts와)', () => {
  test('종류별 유효 부위 배열이 regions.ts union 값과 일치', () => {
    expect([...MASK_REGIONS]).toEqual([
      'blush',
      'highlighter',
      'contour',
      'eyeshadow',
    ]);
    expect([...COLOR_ART_REGIONS]).toEqual([
      'brow',
      'eyeliner',
      'lip',
      'blush',
      'aegyo',
    ]);
    expect([...TEXTURE_MAP_REGIONS]).toEqual(['lip', 'eyeshadow', 'blush']);
  });

  test('regionsForKind / REGIONS_BY_KIND 일관', () => {
    for (const k of ASSET_KINDS) {
      expect(regionsForKind(k)).toBe(REGIONS_BY_KIND[k]);
    }
  });

  test('isValidRegionForKind — 종류별 소속만 통과', () => {
    expect(isValidRegionForKind('mask', 'blush')).toBe(true);
    expect(isValidRegionForKind('mask', 'lip')).toBe(false); // lip은 mask 부위 아님
    expect(isValidRegionForKind('colorArt', 'eyeliner')).toBe(true);
    expect(isValidRegionForKind('textureMap', 'eyeshadow')).toBe(true);
    expect(isValidRegionForKind('textureMap', 'contour')).toBe(false);
    expect(isValidRegionForKind('mask', 'nope')).toBe(false);
    expect(isValidRegionForKind('mask', 123)).toBe(false);
  });
});

describe('normalizeEntry 방어', () => {
  test('정상 항목 → 정규화 사본', () => {
    const e = normalizeEntry(entry());
    expect(e).not.toBeNull();
    expect(e!.id).toBe('e1');
    expect(e!.tags).toEqual(['자연', '데일리']);
  });

  test('필수 필드 누락(id/name/uri) → null', () => {
    expect(normalizeEntry({ ...entry(), id: '' })).toBeNull();
    expect(normalizeEntry({ ...entry(), name: undefined })).toBeNull();
    expect(normalizeEntry({ ...entry(), uri: 42 })).toBeNull();
  });

  test('알 수 없는 kind → null', () => {
    expect(normalizeEntry({ ...entry(), kind: 'hologram' })).toBeNull();
  });

  test('kind에 안 맞는 region → null', () => {
    // lip은 colorArt/textureMap엔 유효하나 mask엔 무효
    expect(normalizeEntry({ ...entry(), kind: 'mask', region: 'lip' })).toBeNull();
    expect(
      normalizeEntry({ ...entry(), kind: 'colorArt', region: 'lip' }),
    ).not.toBeNull();
  });

  test('불량 tags/version 보정', () => {
    const e = normalizeEntry({ ...entry(), tags: ['ok', 5, null], version: -3 })!;
    expect(e.tags).toEqual(['ok']); // 문자열만
    expect(e.version).toBe(1); // 양수 아니면 1
  });

  test('선택 필드는 유효할 때만 실림', () => {
    const e = normalizeEntry({
      ...entry(),
      thumbnail: 'data:image/png;base64,AAAA',
      note: '핑크 톤',
      createdAt: 1720000000000,
    })!;
    expect(e.thumbnail).toBe('data:image/png;base64,AAAA');
    expect(e.note).toBe('핑크 톤');
    expect(e.createdAt).toBe(1720000000000);

    const bare = normalizeEntry(entry())!;
    expect(bare.thumbnail).toBeUndefined();
    expect(bare.note).toBeUndefined();
  });
});

describe('loadCatalog', () => {
  test('JSON 문자열 파싱', () => {
    const json = JSON.stringify(manifest([entry()]));
    const cat = loadCatalog(json);
    expect(cat.entries).toHaveLength(1);
    expect(cat.schema).toBe(CATALOG_SCHEMA_ID);
  });

  test('이미 파싱된 객체도 받는다', () => {
    const cat = loadCatalog(manifest([entry({ id: 'a' }), entry({ id: 'b' })]));
    expect(cat.entries.map(e => e.id)).toEqual(['a', 'b']);
  });

  test('불량 항목은 버리고 정상만 남긴다', () => {
    const cat = loadCatalog(
      manifest([
        entry({ id: 'good' }),
        { id: 'bad', kind: 'mask' }, // uri/name 없음
        entry({ id: 'good2', kind: 'colorArt', region: 'lip' }),
        null,
        'garbage',
      ]),
    );
    expect(cat.entries.map(e => e.id)).toEqual(['good', 'good2']);
  });

  test('중복 id는 뒤가 이긴다', () => {
    const cat = loadCatalog(
      manifest([
        entry({ id: 'dup', version: 1, name: '구' }),
        entry({ id: 'dup', version: 2, name: '신' }),
      ]),
    );
    expect(cat.entries).toHaveLength(1);
    expect(cat.entries[0].version).toBe(2);
    expect(cat.entries[0].name).toBe('신');
  });

  test('완전 불량 입력 → 빈 카탈로그(방어)', () => {
    expect(loadCatalog('{ not json').entries).toEqual([]);
    expect(loadCatalog(null).entries).toEqual([]);
    expect(loadCatalog(42).entries).toEqual([]);
    expect(loadCatalog([]).entries).toEqual([]); // 배열 루트는 무효
    expect(loadCatalog({}).entries).toEqual([]); // entries 없음
  });

  test('emptyCatalog 스키마 형태', () => {
    const e = emptyCatalog();
    expect(e.schema).toBe(CATALOG_SCHEMA_ID);
    expect(e.entries).toEqual([]);
  });
});

describe('serializeCatalog 왕복', () => {
  test('serialize → loadCatalog 라운드트립 보존', () => {
    const cat = loadCatalog(
      manifest([entry({ id: 'a' }), entry({ id: 'b', kind: 'textureMap', region: 'lip' })]),
    );
    const round = loadCatalog(serializeCatalog(cat));
    expect(round.entries).toEqual(cat.entries);
    expect(round.schema).toBe(CATALOG_SCHEMA_ID);
  });
});

describe('필터 헬퍼', () => {
  const cat = loadCatalog(
    manifest([
      entry({ id: 'm1', kind: 'mask', region: 'blush', tags: ['핑크'] }),
      entry({ id: 'm2', kind: 'mask', region: 'contour', tags: ['쉐딩'] }),
      entry({ id: 'c1', kind: 'colorArt', region: 'lip', tags: ['핑크', '글리터'] }),
      entry({ id: 't1', kind: 'textureMap', region: 'lip', tags: ['글로시'] }),
    ]),
  );

  test('entriesByKind', () => {
    expect(entriesByKind(cat, 'mask').map(e => e.id)).toEqual(['m1', 'm2']);
  });

  test('entriesByRegion', () => {
    expect(entriesByRegion(cat, 'lip').map(e => e.id)).toEqual(['c1', 't1']);
  });

  test('entriesByKindAndRegion', () => {
    expect(entriesByKindAndRegion(cat, 'colorArt', 'lip').map(e => e.id)).toEqual([
      'c1',
    ]);
  });

  test('findEntryById', () => {
    expect(findEntryById(cat, 't1')?.region).toBe('lip');
    expect(findEntryById(cat, 'zzz')).toBeUndefined();
  });

  test('searchEntries — 종류/부위/태그/텍스트', () => {
    expect(searchEntries(cat, { kind: 'mask' }).map(e => e.id)).toEqual(['m1', 'm2']);
    expect(searchEntries(cat, { region: 'lip', kind: 'colorArt' }).map(e => e.id)).toEqual(['c1']);
    expect(searchEntries(cat, { tag: '핑크' }).map(e => e.id)).toEqual(['m1', 'c1']);
    expect(searchEntries(cat, { text: '글' }).map(e => e.id)).toEqual(['c1', 't1']);
    expect(searchEntries(cat, {}).map(e => e.id)).toEqual(['m1', 'm2', 'c1', 't1']);
  });

  test('allTags — 정렬·중복제거', () => {
    // 핑크는 m1·c1 둘에 있으나 한 번만.
    expect(allTags(cat)).toEqual(['핑크', '글로시', '글리터', '쉐딩'].sort());
  });
});

describe('isRenderableThumb — RN <Image> 렌더 가능 스킴 판별(§16 번들 방어)', () => {
  test('렌더 가능한 스킴은 true', () => {
    expect(isRenderableThumb('https://cdn.example.com/a.png')).toBe(true);
    expect(isRenderableThumb('http://example.com/a.png')).toBe(true);
    expect(isRenderableThumb('file:///var/mobile/a.png')).toBe(true);
    expect(isRenderableThumb('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isRenderableThumb('content://media/1')).toBe(true);
    expect(isRenderableThumb('asset:/thumb.png')).toBe(true);
  });

  test('번들 streaming: 스킴은 false (Unity 전용 — RN Image 불가)', () => {
    expect(isRenderableThumb('streaming:catalog/mask/blush_natural.png')).toBe(false);
  });

  test('스킴 없는 상대경로·빈값·비문자열은 false', () => {
    expect(isRenderableThumb('catalog/mask/x.png')).toBe(false);
    expect(isRenderableThumb('')).toBe(false);
    expect(isRenderableThumb(undefined)).toBe(false);
    expect(isRenderableThumb(null)).toBe(false);
  });

  test('대소문자·선행 공백 무관 + https는 http 스킴과 혼동 없음', () => {
    expect(isRenderableThumb('  DATA:image/png;base64,AAAA')).toBe(true);
    expect(isRenderableThumb('HTTPS://x/y.png')).toBe(true);
    // https는 http:로 시작하지 않으므로 각각 독립적으로 매칭돼야 한다.
    expect(isRenderableThumb('httpx://nope')).toBe(false);
  });
});
