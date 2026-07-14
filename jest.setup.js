/**
 * jest 부트스트랩 — 네이티브 모듈이 없는 테스트 환경에서 AsyncStorage를
 * 공식 인메모리 목으로 대체한다 (styleStore 저장/재사용 테스트에 필요).
 */
/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SafeAreaProvider는 레이아웃 측정 전엔 자식을 렌더하지 않아 test-renderer에서 화면이
// 비어 버린다 — 공식 목(고정 인셋)으로 대체해 하단 UI가 즉시 렌더되게 한다.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// CameraRoll(갤러리 최신 사진 썸네일) — 네이티브 모듈 없는 테스트 환경에서 빈 결과 목.
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: { getPhotos: jest.fn().mockResolvedValue({ edges: [] }) },
}));
