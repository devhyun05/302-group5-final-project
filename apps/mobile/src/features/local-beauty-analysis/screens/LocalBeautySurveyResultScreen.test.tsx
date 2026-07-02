import React from 'react';

import {
  LocalBeautySurveyResultScreen,
  getLocalBeautyResultLayoutIntent,
} from './LocalBeautySurveyResultScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const layoutIntent = getLocalBeautyResultLayoutIntent();
const expectedUnknownReviewActionLabel:
  typeof layoutIntent.unknownReviewActionLabel = '모르겠음 항목 답하기';
const expectedRestartActionLabel:
  typeof layoutIntent.restartActionLabel = '다시 처음부터 설문하기';

expectEqual(
  layoutIntent.visualMaterial,
  'liquidGlass',
  'local beauty result visual material',
);
expectEqual(
  layoutIntent.headerBackButtonVisibility,
  'hidden',
  'local beauty result header back button visibility',
);
expectEqual(
  layoutIntent.recentResultsVisibility,
  'hidden',
  'local beauty result recent results visibility',
);
expectEqual(
  layoutIntent.startOverActionVisibility,
  'hidden',
  'local beauty result start over action visibility',
);
expectEqual(
  layoutIntent.unknownReviewActionLabel,
  expectedUnknownReviewActionLabel,
  'local beauty result unknown review action label',
);
expectEqual(
  layoutIntent.restartActionLabel,
  expectedRestartActionLabel,
  'local beauty result restart action label',
);
expectEqual(
  layoutIntent.secondaryAnalysisActionTone,
  'whiteGlass',
  'local beauty result secondary analysis action tone',
);
expectEqual(
  layoutIntent.shareActionTone,
  'auraLogo',
  'local beauty result share action tone',
);
expectEqual(
  layoutIntent.shareButtonBehavior,
  'nativeShareSheetDirect',
  'local beauty result share button behavior',
);
expectEqual(
  layoutIntent.actionButtonDesign,
  'matchesIntroButtons',
  'local beauty result action button design',
);
expectEqual(
  layoutIntent.summaryConfidencePrefix,
  '일치도',
  'local beauty result summary confidence prefix',
);
expectEqual(
  layoutIntent.standaloneConfidenceCardsVisibility,
  'hidden',
  'local beauty result standalone confidence cards visibility',
);

<LocalBeautySurveyResultScreen
  onRestart={() => undefined}
  resultId="result-id"
/>;
