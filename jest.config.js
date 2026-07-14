module.exports = {
  preset: '@react-native/jest-preset',
  // AsyncStorage 인메모리 목 등록 (네이티브 모듈 없는 테스트 환경).
  setupFiles: ['<rootDir>/jest.setup.js'],
  // 하네스가 .claude/worktrees/ 아래에 만든 별도 워크트리(다른 에이전트의 체크아웃)를
  // 스캔하지 않는다 — 그쪽 __tests__·node_modules까지 돌면 남의 진행 중 상태로 실패하고
  // haste 모듈명이 충돌한다. 본 프로젝트 테스트만 돌리도록 .claude 전체를 제외.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  // image-picker·safe-area-context·unity는 react-native 필드가 미변환 TS 소스를
  // 가리키므로 변환 허용 목록에 추가해야 한다 (기본 패턴 + 3개 확장).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-image-picker|react-native-safe-area-context|@azesmway/react-native-unity)/)',
  ],
};
