/**
 * @format
 * catalogStore(§16 앱 배선) — 카탈로그 영속(finishStore 동형): 번들 기본+사용자 병합,
 * 붙여넣기 임포트, addEntry/removeEntry, AsyncStorage 라운드트립·방어.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CATALOG_SCHEMA_ID,
  loadCatalog,
  serializeCatalog,
  type AssetCatalogEntry,
} from '../src/assets/assetCatalog';
import {
  __resetCatalogStoreMirror,
  addEntry,
  fetchRemoteManifest,
  importManifestText,
  loadCatalogStore,
  removeEntry,
  saveCatalogStore,
} from '../src/storage/catalogStore';
import catalogDefault from '../src/assets/catalogDefault.json';

// 배포 시드(catalogDefault.json — 스타터 에셋 다수)는 loadCatalogStore 병합 결과에
// 항상 섞인다. 이 스위트는 store '병합 메커니즘'(사용자 레이어)을 검증하므로 시드
// id를 제외하고 사용자 항목만 본다. 시드-병합 자체는 아래 'isolateModules' 테스트가 커버.
const DEFAULT_IDS = new Set<string>(
  (catalogDefault as { entries: { id: string }[] }).entries.map(e => e.id),
);
const userIds = (cat: { entries: { id: string }[] }): string[] =>
  cat.entries.filter(e => !DEFAULT_IDS.has(e.id)).map(e => e.id);

const entry = (over: Partial<AssetCatalogEntry> = {}): AssetCatalogEntry => ({
  id: 'e1',
  kind: 'mask',
  region: 'blush',
  name: '자연 블러셔 존',
  tags: ['자연'],
  version: 1,
  uri: 'file:///assets/mask_blush.png',
  ...over,
});

const manifestJson = (entries: AssetCatalogEntry[]) =>
  JSON.stringify({ schema: CATALOG_SCHEMA_ID, version: 1, entries });

beforeEach(async () => {
  __resetCatalogStoreMirror();
  await AsyncStorage.clear();
});

describe('빈 상태', () => {
  test('저장물 없으면 사용자 레이어 비어 있음(시드만 남음)', async () => {
    const cat = await loadCatalogStore();
    expect(cat.schema).toBe(CATALOG_SCHEMA_ID);
    expect(userIds(cat)).toEqual([]);
  });
});

describe('saveCatalogStore / 라운드트립', () => {
  test('저장한 매니페스트를 그대로 읽어온다', async () => {
    const cat = loadCatalog(manifestJson([entry(), entry({ id: 'e2', kind: 'colorArt', region: 'lip' })]));
    const saved = await saveCatalogStore(cat);
    expect(userIds(saved)).toEqual(['e1', 'e2']);

    // 미러를 비워 AsyncStorage 영속 경로를 강제로 태운다.
    __resetCatalogStoreMirror();
    const reloaded = await loadCatalogStore();
    expect(userIds(reloaded)).toEqual(['e1', 'e2']);
  });
});

describe('importManifestText', () => {
  test('붙여넣기 JSON을 병합 저장', async () => {
    await saveCatalogStore(loadCatalog(manifestJson([entry({ id: 'a' })])));
    const next = await importManifestText(
      manifestJson([entry({ id: 'b', kind: 'colorArt', region: 'lip' })]),
    );
    expect(userIds(next).sort()).toEqual(['a', 'b']);
  });

  test('같은 id는 임포트(최신본)가 이긴다', async () => {
    await saveCatalogStore(loadCatalog(manifestJson([entry({ id: 'dup', version: 1, name: '구' })])));
    const next = await importManifestText(
      manifestJson([entry({ id: 'dup', version: 2, name: '신' })]),
    );
    const dup = next.entries.find(e => e.id === 'dup')!;
    expect(dup.version).toBe(2);
    expect(dup.name).toBe('신');
  });

  test('불량 JSON은 방어 — 기존 목록 유지', async () => {
    await saveCatalogStore(loadCatalog(manifestJson([entry({ id: 'a' })])));
    const next = await importManifestText('{ not json');
    expect(userIds(next)).toEqual(['a']);
  });
});

describe('fetchRemoteManifest (원격 URL 임포트 §16 v2)', () => {
  // tsconfig types=["jest"]라 node의 `global`이 없어 globalThis(내장)로 fetch를 모킹.
  const g = globalThis as unknown as { fetch: typeof fetch };
  const realFetch = g.fetch;
  afterEach(() => {
    g.fetch = realFetch;
  });

  test('원격 매니페스트를 페치→기존 목록에 병합', async () => {
    await saveCatalogStore(loadCatalog(manifestJson([entry({ id: 'local' })])));
    g.fetch = jest.fn().mockResolvedValue({
      text: () =>
        Promise.resolve(
          manifestJson([entry({ id: 'remote', kind: 'colorArt', region: 'lip' })]),
        ),
    }) as unknown as typeof fetch;

    const next = await fetchRemoteManifest('https://cdn.example/manifest.json');
    expect(userIds(next).sort()).toEqual(['local', 'remote']);
    expect(g.fetch).toHaveBeenCalledWith('https://cdn.example/manifest.json');
  });

  test('네트워크 실패는 방어 — 기존 목록 유지(빈 병합 없음)', async () => {
    await saveCatalogStore(loadCatalog(manifestJson([entry({ id: 'keep' })])));
    g.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const next = await fetchRemoteManifest('https://cdn.example/manifest.json');
    expect(userIds(next)).toEqual(['keep']);
  });

  test('원격 응답이 불량 JSON이어도 방어 — 기존 목록 유지', async () => {
    await saveCatalogStore(loadCatalog(manifestJson([entry({ id: 'keep' })])));
    g.fetch = jest.fn().mockResolvedValue({
      text: () => Promise.resolve('{ not json'),
    }) as unknown as typeof fetch;

    const next = await fetchRemoteManifest('https://cdn.example/manifest.json');
    expect(userIds(next)).toEqual(['keep']);
  });
});

describe('addEntry / removeEntry', () => {
  test('addEntry — 방금 임포트한 에셋 등록', async () => {
    const next = await addEntry(entry({ id: 'saved', name: '내 마스크' }));
    expect(userIds(next)).toEqual(['saved']);
    // 영속됨
    __resetCatalogStoreMirror();
    expect(userIds(await loadCatalogStore())).toEqual(['saved']);
  });

  test('addEntry — kind에 안 맞는 region은 거부(변화 없음)', async () => {
    const next = await addEntry(entry({ id: 'bad', kind: 'mask', region: 'lip' }));
    expect(userIds(next)).toEqual([]);
  });

  test('removeEntry — 사용자 항목 제거', async () => {
    await addEntry(entry({ id: 'a' }));
    await addEntry(entry({ id: 'b', kind: 'colorArt', region: 'lip' }));
    const next = await removeEntry('a');
    expect(userIds(next)).toEqual(['b']);
  });
});

describe('번들 기본 병합 (isolateModules로 default 모의)', () => {
  test('번들 기본 항목이 로드에 포함되고, 같은 id는 사용자가 이긴다', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('../src/assets/catalogDefault.json', () => ({
        schema: CATALOG_SCHEMA_ID,
        version: 1,
        entries: [
          { id: 'seed', kind: 'mask', region: 'blush', name: '시드', tags: [], version: 1, uri: 'file:///seed.png' },
          { id: 'shared', kind: 'colorArt', region: 'lip', name: '기본 립아트', tags: [], version: 1, uri: 'file:///d.png' },
        ],
      }));
      const store = require('../src/storage/catalogStore');
      store.__resetCatalogStoreMirror();
      await AsyncStorage.clear();

      // 저장물 없어도 시드가 보인다.
      const seeded = await store.loadCatalogStore();
      expect(seeded.entries.map((e: AssetCatalogEntry) => e.id).sort()).toEqual([
        'seed',
        'shared',
      ]);

      // 사용자가 같은 id(shared)를 저장하면 사용자 값이 이긴다.
      await store.addEntry({
        id: 'shared',
        kind: 'colorArt',
        region: 'lip',
        name: '내 립아트',
        tags: [],
        version: 5,
        uri: 'file:///mine.png',
      });
      const merged = await store.loadCatalogStore();
      const shared = merged.entries.find((e: AssetCatalogEntry) => e.id === 'shared')!;
      expect(shared.name).toBe('내 립아트');
      expect(shared.version).toBe(5);
      // 시드는 여전히 존재.
      expect(merged.entries.some((e: AssetCatalogEntry) => e.id === 'seed')).toBe(true);
    });
  });
});

describe('직렬화 대칭', () => {
  test('saveCatalogStore가 쓴 문자열은 loadCatalog로 되읽힌다', async () => {
    const cat = loadCatalog(manifestJson([entry()]));
    await saveCatalogStore(cat);
    const raw = await AsyncStorage.getItem('armakeup.assetCatalog.v1');
    expect(raw).not.toBeNull();
    expect(loadCatalog(raw!).entries).toEqual(cat.entries);
    // serializeCatalog 자체도 왕복 보존
    expect(loadCatalog(serializeCatalog(cat)).entries).toEqual(cat.entries);
  });
});
