import React from 'react';

import {
  TutorialIntroScreen,
  getTutorialIntroHeroContent,
  getTutorialIntroUsageNoticeContent,
} from './TutorialIntroScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const heroContent = getTutorialIntroHeroContent();
const pendingUsageNotice = getTutorialIntroUsageNoticeContent(null);
const remainingUsageNotice = getTutorialIntroUsageNoticeContent({
  hasRemaining: true,
  isLimitBypassed: false,
  limit: 2,
  remainingCount: 1,
  usedCount: 1,
});
const bypassedUsageNotice = getTutorialIntroUsageNoticeContent({
  hasRemaining: true,
  isLimitBypassed: true,
  limit: 2,
  remainingCount: 0,
  usedCount: 2,
});

expectEqual(heroContent.brand, 'AURA', 'tutorial intro brand');
expectEqual(heroContent.title, '얼굴 진단을 시작합니다.', 'tutorial intro title');
expectEqual(
  heroContent.subtitle,
  '내 얼굴에 맞는 메이크업을 추천받고,\n나만의 룩으로 자연스럽게 완성해보세요.',
  'tutorial intro subtitle',
);
expectEqual(heroContent.primaryActionLabel, '진단 시작', 'tutorial intro primary action');
expectEqual(
  pendingUsageNotice.limitText,
  '현재 버전에서는 한 사용자당 얼굴 분석을 최대 2회까지 사용할 수 있어요.',
  'tutorial intro usage limit text',
);
expectEqual(
  pendingUsageNotice.remainingText,
  '남은 횟수를 확인하고 있어요.',
  'tutorial intro pending remaining text',
);
expectEqual(
  remainingUsageNotice.remainingText,
  '남은 횟수: 1회',
  'tutorial intro remaining count text',
);
expectEqual(
  bypassedUsageNotice.remainingText,
  '개발 모드: 횟수 제한 해제',
  'tutorial intro bypassed remaining text',
);

<TutorialIntroScreen
  onStartCapture={() => undefined}
  onStartDiagnosis={() => undefined}
/>;
