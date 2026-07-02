import {
  getDetailRouteTitle,
  routeChromeByRoute,
} from './routeChrome';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const expectedSurveyTitle: typeof routeChromeByRoute.LocalBeautySurvey.title =
  'AURA';
const expectedSurveyHeaderAction: typeof routeChromeByRoute.LocalBeautySurvey.rightActions[0] =
  'surveyToc';
const expectedResultBackButtonVisibility:
  typeof routeChromeByRoute.LocalBeautySurveyResult.backButtonVisibility = 'hidden';

expectEqual(
  getDetailRouteTitle('LocalBeautySurvey'),
  expectedSurveyTitle,
  'local beauty survey route title',
);
expectEqual(
  routeChromeByRoute.LocalBeautySurvey.rightActions[0],
  expectedSurveyHeaderAction,
  'local beauty survey header action',
);
expectEqual(
  routeChromeByRoute.LocalBeautySurveyResult.backButtonVisibility,
  expectedResultBackButtonVisibility,
  'local beauty result header back button visibility',
);
