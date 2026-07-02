import React from 'react';

import {
  LocalBeautySurveyScreen,
  formatLocalBeautySurveyProgressStageLabel,
  formatLocalBeautyUnknownGuideText,
  getLocalBeautySurveyAnswerStatus,
  getLocalBeautySurveyLayoutIntent,
  getLocalBeautySurveyStagePlan,
} from './LocalBeautySurveyScreen';
import {
  LOCAL_BEAUTY_UNKNOWN_OPTION_DESCRIPTION,
  localBeautySurveyQuestions,
} from '../services/localBeautySurveyScoring';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const layoutIntent = getLocalBeautySurveyLayoutIntent();
const stagePlan = getLocalBeautySurveyStagePlan(localBeautySurveyQuestions);
const firstStage = stagePlan[0];

if (!firstStage) {
  throw new Error('local beauty survey first stage is missing');
}

expectEqual(
  layoutIntent.saveDraftPlacement,
  'floatingBottomLeft',
  'local beauty survey save draft placement',
);
expectEqual(
  layoutIntent.navigationActionPlacement,
  'floatingBottom',
  'local beauty survey navigation action placement',
);
expectEqual(
  layoutIntent.progressSummaryPlacement,
  'floatingTop',
  'local beauty survey progress summary placement',
);
expectEqual(
  layoutIntent.progressStageMetaPlacement,
  'left',
  'local beauty survey progress stage meta placement',
);
expectEqual(
  layoutIntent.progressAnsweredMetaPlacement,
  'hidden',
  'local beauty survey progress answered meta placement',
);
expectEqual(
  layoutIntent.progressContainerBackground,
  'transparent',
  'local beauty survey progress container background',
);
expectEqual(
  layoutIntent.progressFillTone,
  'auraLogo',
  'local beauty survey progress fill tone',
);
expectEqual(
  layoutIntent.progressNumberPlacement,
  'right',
  'local beauty survey progress number placement',
);
expectEqual(
  layoutIntent.progressQuestionGap,
  'compact',
  'local beauty survey progress to question gap',
);
expectEqual(
  layoutIntent.unknownGuidePlacement,
  'questionHelperArea',
  'local beauty survey unknown guide placement',
);
expectEqual(
  layoutIntent.unknownGuideCopyStrategy,
  'questionSpecificUnique',
  'local beauty survey unknown guide copy strategy',
);
expectEqual(
  layoutIntent.questionTitleFontSize,
  18,
  'local beauty survey question title font size',
);
expectEqual(
  layoutIntent.unknownOptionDescriptionVisibility,
  'hidden',
  'local beauty survey unknown option description visibility',
);
expectEqual(
  LOCAL_BEAUTY_UNKNOWN_OPTION_DESCRIPTION,
  '',
  'local beauty survey unknown option description is empty',
);
expectEqual(
  layoutIntent.optionDensity,
  'compact',
  'local beauty survey option density',
);
expectEqual(
  layoutIntent.modeLabelVisibility,
  'hidden',
  'local beauty survey mode label visibility',
);
expectEqual(
  layoutIntent.visualMaterial,
  'liquidGlass',
  'local beauty survey visual material',
);
expectEqual(
  layoutIntent.navigationGesture,
  'horizontalSwipe',
  'local beauty survey navigation gesture',
);
expectEqual(
  layoutIntent.headerAction,
  'surveyToc',
  'local beauty survey header action',
);
expectEqual(
  layoutIntent.headerLogoAlignment,
  'absoluteCenter',
  'local beauty survey header logo alignment',
);
expectEqual(
  layoutIntent.stageBreakBehavior,
  'completionInterstitial',
  'local beauty survey stage break behavior',
);
expectEqual(
  layoutIntent.coreStageReportAvailability,
  'basicReportAfterRequiredStage',
  'local beauty survey core stage report availability',
);
expectEqual(
  layoutIntent.partialReportSubmission,
  'missingAnswersAsUnknown',
  'local beauty survey partial report submission',
);
expectEqual(
  layoutIntent.additionalAnswerReportUpdate,
  'resubmitAfterCompletedStage',
  'local beauty survey additional answer report update',
);
expectEqual(
  stagePlan.length,
  7,
  'local beauty survey is split into topic stages',
);
expectEqual(
  stagePlan.map(stage => stage.label).join(' / '),
  '필수 핵심 진단 / 퍼스널 컬러 세부 / 메이크업 세부 / 헤어 세부 / 체형·핏 세부 / 패션·스타일링 세부 / 이미지 무드 세부',
  'local beauty survey stage labels follow survey topics',
);
expectEqual(
  formatLocalBeautySurveyProgressStageLabel(firstStage),
  '1단계 필수 핵심 진단',
  'local beauty survey progress stage label hides total stage count',
);
expectEqual(
  `${stagePlan[0]?.startIndex}-${stagePlan[0]?.endIndex}`,
  '0-33',
  'local beauty survey core stage keeps required questions together',
);
expectEqual(
  `${stagePlan[6]?.startIndex}-${stagePlan[6]?.endIndex}`,
  '121-132',
  'local beauty survey final image stage is not a tiny leftover stage',
);
expectEqual(
  new Set(stagePlan.map(stage => stage.body)).size,
  stagePlan.length,
  'local beauty survey stage messages are varied',
);
expectEqual(
  getLocalBeautySurveyAnswerStatus(undefined),
  'unanswered',
  'local beauty survey unanswered status',
);
expectEqual(
  getLocalBeautySurveyAnswerStatus('unknown'),
  'unknown',
  'local beauty survey unknown status',
);
expectEqual(
  getLocalBeautySurveyAnswerStatus('pinkCool'),
  'answered',
  'local beauty survey answered status',
);
expectEqual(
  formatLocalBeautyUnknownGuideText('확인법: 자연광에서 비교해보세요.'),
  '자연광에서 비교해보세요.',
  'local beauty survey removes unknown guide prefix',
);

<LocalBeautySurveyScreen onComplete={() => undefined} />;
