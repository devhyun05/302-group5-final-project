import React from 'react';

import {
  TutorialIntroScreen,
  getTutorialIntroHeroContent,
  getTutorialIntroLayoutIntent,
  getTutorialIntroLegalLinks,
} from './TutorialIntroScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const heroContent = getTutorialIntroHeroContent();
const layoutIntent = getTutorialIntroLayoutIntent();
const legalLinks = getTutorialIntroLegalLinks();
const expectedPrimaryActionLabel: typeof heroContent.primaryActionLabel = '시작하기';
const expectedLatestResultActionLabel: typeof heroContent.latestResultActionLabel =
  '최근 결과 보기';
const expectedResumeActionLabel: typeof heroContent.resumeActionLabel =
  '저장한 설문 이어하기';
const expectedTitle: typeof heroContent.title = '빛나는 나를 알아가는 여정';
const expectedSubtitle: typeof heroContent.subtitle =
  '설문을 통해 나에게 어울리는 컬러, 이미지 무드, 메이크업, 헤어, 패션 스타일링 방향을 가볍게 확인해보세요.';
const expectedPrivacyPolicyLabel: typeof legalLinks[0]['label'] =
  '개인정보 처리방침';
const expectedPrivacyPolicyUrl: typeof legalLinks[0]['url'] =
  'https://app.notion.com/p/391571b96b5d80b8a87dfca201f00b81?source=copy_link';
const expectedLicenseNoticeLabel: typeof legalLinks[1]['label'] =
  '라이선스 고지';
const expectedLicenseNoticeUrl: typeof legalLinks[1]['url'] =
  'https://app.notion.com/p/391571b96b5d80999e03c11c1f34fb29?source=copy_link';

expectEqual(heroContent.brand, 'AURA', 'tutorial intro brand');
expectEqual(layoutIntent.logoPlacement, 'top', 'tutorial intro logo placement');
expectEqual(
  layoutIntent.copyPlacement,
  'betweenLogoAndPrimaryAction',
  'tutorial intro copy placement',
);
expectEqual(layoutIntent.actionPlacement, 'bottom', 'tutorial intro action placement');
expectEqual(layoutIntent.visualMaterial, 'liquidGlass', 'tutorial intro visual material');
expectEqual(heroContent.title, expectedTitle, 'tutorial intro title');
expectEqual(
  heroContent.subtitle,
  expectedSubtitle,
  'tutorial intro subtitle',
);
expectEqual(
  heroContent.primaryActionLabel,
  expectedPrimaryActionLabel,
  'tutorial intro primary action',
);
expectEqual(
  heroContent.latestResultActionLabel,
  expectedLatestResultActionLabel,
  'tutorial intro latest result action',
);
expectEqual(
  heroContent.resumeActionLabel,
  expectedResumeActionLabel,
  'tutorial intro resume action',
);
expectEqual(legalLinks.length, 2, 'tutorial intro legal link count');
expectEqual(
  legalLinks[0].label,
  expectedPrivacyPolicyLabel,
  'tutorial intro privacy policy link label',
);
expectEqual(
  legalLinks[0].url,
  expectedPrivacyPolicyUrl,
  'tutorial intro privacy policy link url',
);
expectEqual(
  legalLinks[1].label,
  expectedLicenseNoticeLabel,
  'tutorial intro license notice link label',
);
expectEqual(
  legalLinks[1].url,
  expectedLicenseNoticeUrl,
  'tutorial intro license notice link url',
);
<TutorialIntroScreen
  hasDraft
  hasLatestResult
  onOpenLatestResult={() => undefined}
  onResumeSurvey={() => undefined}
  onStartSurvey={() => undefined}
/>;
