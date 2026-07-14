/**
 * @format
 * 사용자 제품 저장(§5 A12) — save→load 왕복 + 검증 필터.
 * FitSheetsStore와 같은 원칙: AsyncStorage best-effort + 세션 미러 폴백.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetLookStoreMirrors,
  loadUserProducts,
  saveUserProducts,
} from '../src/storage/lookStore';
import type { ProductDef } from '../src/composer/products';

const USER_PRODUCTS_KEY = 'armakeup.userProducts.v1';

const product = (over: Partial<ProductDef> = {}): ProductDef => ({
  id: 'usr:prod:a',
  name: '내 립',
  family: 'lip',
  base: { color: '#C0392B', coverage: 0.6 },
  form: { blendability: 0.5, buildability: 0.4, finish: 0 },
  owner: 'user',
  ...over,
});

beforeEach(async () => {
  __resetLookStoreMirrors();
  await AsyncStorage.clear();
});

describe('save/load 라운드트립', () => {
  test('저장한 제품을 그대로 읽어온다', async () => {
    const products = [
      product(),
      product({ id: 'usr:prod:b', name: '내 섀도', family: 'eyeshadow' }),
    ];
    await saveUserProducts(products);
    __resetLookStoreMirrors(); // 미러 우회 — 실제 직렬화 왕복 확인
    const loaded = await loadUserProducts();
    expect(loaded).toHaveLength(2);
    expect(loaded.map(p => p.name)).toEqual(['내 립', '내 섀도']);
    expect(loaded[0].base?.coverage).toBe(0.6);
    expect(loaded[1].family).toBe('eyeshadow');
  });

  test('저장 직후 미러가 곧바로 최신값을 돌려준다', async () => {
    await saveUserProducts([product()]);
    const loaded = await loadUserProducts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('usr:prod:a');
  });

  test('저장된 적 없으면 빈 배열', async () => {
    expect(await loadUserProducts()).toEqual([]);
  });
});

describe('검증 필터 — 불량 항목 배제', () => {
  test('id·name·family 비문자열 / owner≠user 항목은 걸러진다', async () => {
    const raw = [
      product(), // 정상
      { id: 42, name: '숫자 id', family: 'lip', owner: 'user' }, // id 비문자열
      { id: 'x', name: 7, family: 'lip', owner: 'user' }, // name 비문자열
      { id: 'y', name: '패밀리 없음', owner: 'user' }, // family 비문자열
      { id: 'z', name: '시스템', family: 'lip', owner: 'system' }, // owner≠user
      null,
    ];
    await AsyncStorage.setItem(USER_PRODUCTS_KEY, JSON.stringify(raw));
    __resetLookStoreMirrors();
    const loaded = await loadUserProducts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('usr:prod:a');
  });

  test('배열이 아닌 저장값은 빈 배열로 폴백', async () => {
    await AsyncStorage.setItem(USER_PRODUCTS_KEY, JSON.stringify({ nope: true }));
    __resetLookStoreMirrors();
    expect(await loadUserProducts()).toEqual([]);
  });
});
