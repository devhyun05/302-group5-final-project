/**
 * @format
 * HairstylePanel — 헤어 프로필 설문 UI 검증.
 * 스토어가 비면 설문 뷰가 뜨고, 7문항을 답해 저장하면 추천 뷰로 전환되며 프로필이
 * 영속화된다. 이미 프로필이 있으면 추천 뷰가 뜨고 '수정'으로 현재 답을 프리필한 설문
 * 뷰로 되돌아간다. 비동기 로드/저장은 act로 흘려보낸다(AsyncStorage는 jest.setup 목).
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {TouchableOpacity} from 'react-native';

import HairstylePanel from '../src/components/HairstylePanel';
import {HAIR_QUESTIONS} from '../src/composer/hairProfile';
import type {HairProfile} from '../src/composer/hairProfile';
import {
  clearHairProfile,
  loadHairProfile,
  saveHairProfile,
} from '../src/storage/hairProfileStore';

const noop = () => {};

// TestInstance의 모든 문자열 자식을 이어붙인다(라벨/문구 매칭용).
function collectText(inst: any): string {
  if (typeof inst === 'string') return inst;
  if (inst == null || typeof inst !== 'object') return '';
  const kids = inst.children ?? [];
  return kids.map(collectText).join('');
}

// testID를 단 TouchableOpacity(합성 컴포넌트)만 집는다 — 하위 host View 중복 매칭 방지.
function touchables(root: any, testID: string) {
  return root.findAll(
    (i: any) => i.type === TouchableOpacity && i.props.testID === testID,
  );
}

// 비동기 로드/저장 이펙트를 흘려보낸다.
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountPanel() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<HairstylePanel onClose={noop} />);
  });
  await flush();
  return renderer;
}

beforeEach(async () => {
  // 파일 내 테스트 간 스토어(AsyncStorage 목 + 세션 미러) 격리.
  await clearHairProfile();
});

describe('HairstylePanel — 헤어 프로필 설문', () => {
  test('스토어가 비어 있으면 설문 뷰가 뜬다 (질문 텍스트 존재)', async () => {
    const renderer = await mountPanel();
    const text = collectText(renderer.root);
    for (const q of HAIR_QUESTIONS) {
      expect(text).toContain(q.question);
    }
    // 아직 프로필이 없으니 저장 버튼은 있고, 요약 행의 '수정' 버튼은 없다.
    expect(touchables(renderer.root, 'hair-save')).toHaveLength(1);
    expect(touchables(renderer.root, 'hair-edit')).toHaveLength(0);
  });

  test('7문항 답 → 저장 → 추천 뷰로 전환되고 프로필이 저장된다', async () => {
    const renderer = await mountPanel();
    const root = renderer.root;

    // 각 문항의 첫 옵션을 고른다(문안에 의존하지 않게 testID로).
    for (const q of HAIR_QUESTIONS) {
      const first = q.options[0];
      act(() => {
        touchables(root, `hair-opt-${q.key}-${first.id}`)[0].props.onPress();
      });
    }

    // 저장 → 추천 뷰
    await act(async () => {
      touchables(root, 'hair-save')[0].props.onPress();
    });
    await flush();

    const text = collectText(root);
    expect(text).toContain('내 조건'); // 요약 행
    expect(text).toContain('어울리는 스타일'); // 순위 블록
    expect(touchables(root, 'hair-edit')).toHaveLength(1);
    expect(touchables(root, 'hair-save')).toHaveLength(0); // 더는 설문 뷰가 아님

    // 저장 반영 — 스토어에 첫 옵션 값으로 프로필이 남는다.
    const saved = await loadHairProfile();
    expect(saved).not.toBeNull();
    const firstId = (key: string) =>
      HAIR_QUESTIONS.find(q => q.key === key)!.options[0].id;
    expect(saved!.lane).toBe(firstId('lane'));
    expect(saved!.faceShape).toBe(firstId('faceShape'));
    expect(saved!.texture).toBe(firstId('texture'));
  });

  test('수정 버튼 → 설문 뷰가 현재 답으로 프리필된다', async () => {
    const seed: HairProfile = {
      lane: 'male',
      faceShape: 'round',
      backHead: 'flat',
      crown: 'normal',
      texture: 'wavy',
      thickness: 'medium',
      density: 'dense',
      createdAt: 123,
    };
    await saveHairProfile(seed);

    const renderer = await mountPanel();
    const root = renderer.root;

    // 프로필이 있으니 추천 뷰(수정 버튼 존재).
    expect(touchables(root, 'hair-edit')).toHaveLength(1);

    // 수정 진입 → 설문 뷰
    act(() => {
      touchables(root, 'hair-edit')[0].props.onPress();
    });

    // 질문 텍스트가 다시 뜨고, 답이 프리필(선택 상태)되어 있다.
    expect(collectText(root)).toContain(HAIR_QUESTIONS[0].question);
    for (const [key, val] of [
      ['lane', 'male'],
      ['faceShape', 'round'],
      ['backHead', 'flat'],
      ['texture', 'wavy'],
    ] as const) {
      const chip = touchables(root, `hair-opt-${key}-${val}`)[0];
      expect(chip.props.accessibilityState?.selected).toBe(true);
    }
    // 일곱 답이 다 차 있으니 저장 버튼은 활성.
    expect(touchables(root, 'hair-save')[0].props.disabled).toBe(false);

    // 취소 → 추천 뷰로 복귀
    const cancelBtn = root
      .findAll((i: any) => i.type === TouchableOpacity)
      .find((t: any) => collectText(t) === '취소');
    expect(cancelBtn).toBeDefined();
    act(() => {
      cancelBtn!.props.onPress();
    });
    expect(touchables(root, 'hair-edit')).toHaveLength(1);
  });
});
