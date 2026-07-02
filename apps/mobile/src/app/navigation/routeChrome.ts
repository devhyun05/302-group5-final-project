import type {RootStackRouteName, RouteName} from './routeTypes';
import {routes} from './routeTypes';

export type ScreenDepth = 'entry' | 'sub' | 'immersive';
export type ScreenCategory =
  | 'onboarding'
  | 'survey'
  | 'survey-result';

export type RouteChromeKind = 'detail' | 'fullscreen';
export type DetailHeaderRightAction = 'share' | 'close' | 'saveDraft' | 'surveyToc';
export type DetailHeaderBackButtonVisibility = 'hidden' | 'visible';

type RouteChromeBase = {
  category: ScreenCategory;
  depth: ScreenDepth;
};

export type RouteChrome =
  | (RouteChromeBase & {
      kind: 'detail';
      backButtonVisibility?: DetailHeaderBackButtonVisibility;
      rightActions?: readonly DetailHeaderRightAction[];
      statusBarStyle: 'dark';
      title: string;
    })
  | (RouteChromeBase & {
      kind: 'fullscreen';
      statusBarStyle: 'dark' | 'light';
    });

export const routeChromeByRoute = {
  Tutorial: {
    category: 'onboarding',
    depth: 'entry',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  LocalBeautySurvey: {
    category: 'survey',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['surveyToc'],
    statusBarStyle: 'dark',
    title: 'AURA',
  },
  LocalBeautySurveyResult: {
    backButtonVisibility: 'hidden',
    category: 'survey-result',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: '설문 분석 결과',
  },
} as const satisfies Record<RootStackRouteName, RouteChrome>;

export function getRouteChrome(route: RootStackRouteName): RouteChrome {
  return routeChromeByRoute[route];
}

export function getDetailRouteTitle(route: RootStackRouteName): string {
  const chrome = getRouteChrome(route);

  if (chrome.kind !== 'detail') {
    throw new Error(`${route} is not a detail route`);
  }

  return chrome.title;
}

export function getRoutesByDepth(depth: ScreenDepth): RouteName[] {
  return routes.filter((route) => routeChromeByRoute[route].depth === depth);
}
