/**
 * 편집 히스토리(undo/redo) 순수 모듈 검증 — 룩+보정 통합 스택.
 */
import {
  canRedo,
  canUndo,
  emptyHistory,
  HISTORY_LIMIT,
  record,
  redo,
  undo,
} from '../src/composer/history';
import type { EditSnapshot } from '../src/composer/history';
import { emptyWarpLane } from '../src/composer/warpPresets';

// opacity 값만 다르게 해 스냅샷을 구분(다른 필드는 무관하게 최소값).
function snap(opacity: number): EditSnapshot {
  return { look: null, lookSel: 'bare', warp: emptyWarpLane(), wpGain: 1, opacity };
}

test('빈 히스토리는 undo/redo 불가', () => {
  const h = emptyHistory();
  expect(canUndo(h)).toBe(false);
  expect(canRedo(h)).toBe(false);
  expect(undo(h, snap(0))).toBeNull();
  expect(redo(h, snap(0))).toBeNull();
});

test('record는 past에 쌓고 future(redo)를 비운다', () => {
  let h = emptyHistory();
  h = record(h, snap(0.1));
  expect(canUndo(h)).toBe(true);
  expect(canRedo(h)).toBe(false);
});

test('undo는 직전 상태를 복원하고 현재를 future로 옮긴다', () => {
  let h = emptyHistory();
  h = record(h, snap(0.1)); // 편집 직전 = 0.1
  // 현재 상태 = 0.9 (편집 후). undo하면 0.1로 되돌리고 0.9는 redo 대기.
  const res = undo(h, snap(0.9));
  expect(res).not.toBeNull();
  expect(res!.snapshot.opacity).toBe(0.1);
  expect(canRedo(res!.history)).toBe(true);
  expect(canUndo(res!.history)).toBe(false);
});

test('undo 후 redo는 되돌린 편집을 다시 적용', () => {
  let h = emptyHistory();
  h = record(h, snap(0.1));
  const u = undo(h, snap(0.9))!;
  const r = redo(u.history, u.snapshot); // 현재=복원된 0.1, redo하면 0.9로
  expect(r).not.toBeNull();
  expect(r!.snapshot.opacity).toBe(0.9);
  expect(canUndo(r!.history)).toBe(true);
  expect(canRedo(r!.history)).toBe(false);
});

test('새 record는 redo 스택을 무효화한다', () => {
  let h = emptyHistory();
  h = record(h, snap(0.1));
  const u = undo(h, snap(0.9))!;
  expect(canRedo(u.history)).toBe(true);
  const h2 = record(u.history, snap(0.5)); // 새 편집 분기
  expect(canRedo(h2)).toBe(false);
});

test('past는 HISTORY_LIMIT를 넘지 않고 가장 오래된 것부터 버린다', () => {
  let h = emptyHistory();
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
    h = record(h, snap(i / 100));
  }
  expect(h.past.length).toBe(HISTORY_LIMIT);
  // 가장 오래된 10개(0..9)는 버려지고 10번째가 맨 앞
  expect(h.past[0].opacity).toBeCloseTo(10 / 100);
});
