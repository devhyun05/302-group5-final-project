/**
 * @format
 * styleStore — 저장/재사용(R10) 로직 검증.
 */
import {
  loadUserStyles,
  saveUserStyles,
  suggestStyleName,
  type UserStyle,
} from '../src/storage/styleStore';
import { BARE } from '../src/presets';

const sample = (over: Partial<UserStyle> = {}): UserStyle => ({
  id: 's1',
  name: '내추럴',
  createdAt: 1,
  params: BARE,
  overlayLayers: [],
  opacity: 1,
  ...over,
});

describe('suggestStyleName', () => {
  test('기본은 베이스 이름 그대로', () => {
    expect(suggestStyleName(BARE, [], '내추럴', [])).toBe('내추럴');
  });

  test('오버립 워프가 있으면 태그를 붙인다', () => {
    expect(suggestStyleName({ ...BARE, lipOverline: 0.4 }, [], '로지', [])).toBe(
      '로지 + 오버립',
    );
  });

  test('오버레이 데코가 있으면 태그를 붙인다', () => {
    const layers = [
      { path: 'builtin:dot', intensity: 1, x: 0.5, y: 0.5, scale: 1, rotation: 0, blendMode: 1 },
    ];
    expect(suggestStyleName(BARE, layers, '피치', [])).toBe('피치 + 데코');
  });

  test('빈 베이스는 "내 룩"으로 대체', () => {
    expect(suggestStyleName(BARE, [], '  ', [])).toBe('내 룩');
  });

  test('이름이 겹치면 번호를 매긴다', () => {
    expect(suggestStyleName(BARE, [], '내추럴', ['내추럴'])).toBe('내추럴 2');
    expect(suggestStyleName(BARE, [], '내추럴', ['내추럴', '내추럴 2'])).toBe(
      '내추럴 3',
    );
  });
});

describe('save/load 라운드트립', () => {
  test('저장한 룩을 그대로 읽어온다', async () => {
    const styles = [sample(), sample({ id: 's2', name: '글램' })];
    await saveUserStyles(styles);
    const loaded = await loadUserStyles();
    expect(loaded).toHaveLength(2);
    expect(loaded.map(s => s.name)).toEqual(['내추럴', '글램']);
  });
});
