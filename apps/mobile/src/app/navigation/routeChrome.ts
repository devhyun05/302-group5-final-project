import type {RouteName} from './routeTypes';
import {routes} from './routeTypes';

export type ScreenDepth = 'entry' | 'sub' | 'immersive';
export type ScreenCategory =
  | 'onboarding'
  | 'capture-runtime'
  | 'progress'
  | 'detail-report';

export type RouteChromeKind = 'detail' | 'fullscreen';
export type DetailHeaderRightAction = 'share' | 'close';

type RouteChromeBase = {
  category: ScreenCategory;
  depth: ScreenDepth;
};

export type RouteChrome =
  | (RouteChromeBase & {
      kind: 'detail';
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
  FaceCapture: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  FaceAnalysisLoading: {
    category: 'progress',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석',
  },
  FaceAnalysisReportDetail: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share', 'close'],
    statusBarStyle: 'dark',
    title: '맞춤 분석 보고서',
  },
} as const satisfies Record<RouteName, RouteChrome>;

export function getRouteChrome(route: RouteName): RouteChrome {
  return routeChromeByRoute[route];
}

export function getDetailRouteTitle(route: RouteName): string {
  const chrome = getRouteChrome(route);

  if (chrome.kind !== 'detail') {
    throw new Error(`${route} is not a detail route`);
  }

  return chrome.title;
}

export function getRoutesByDepth(depth: ScreenDepth): RouteName[] {
  return routes.filter((route) => routeChromeByRoute[route].depth === depth);
}
