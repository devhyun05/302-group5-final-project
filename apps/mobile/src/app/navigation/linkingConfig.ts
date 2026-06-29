import type {LinkingOptions} from '@react-navigation/native';

import type {RootStackParamList, RootStackRouteName} from './routeTypes';
import {rootStackRoutes} from './routeTypes';

export const APP_DEEP_LINK_SCHEME = 'aiarmakeup';
export const APP_DEEP_LINK_PREFIX = `${APP_DEEP_LINK_SCHEME}://`;
export const EXPO_DEVELOPMENT_LINKING_PREFIXES = [
  'exp://127.0.0.1:8082/--/',
  'exp://localhost:8082/--/',
] as const;

type RootStackLinkingScreens = NonNullable<
  LinkingOptions<RootStackParamList>['config']
>['screens'];

type RootStackLinkingScreenConfig = NonNullable<
  RootStackLinkingScreens[RootStackRouteName]
>;

export const rootStackLinkingScreens = {
  Tutorial: 'tutorial',
  FaceCapture: 'face-capture',
  FaceAnalysisLoading: 'face-analysis-loading',
  FaceAnalysisReportDetail: 'face-analysis-report/:reportId?',
} as const satisfies Record<RootStackRouteName, RootStackLinkingScreenConfig>;

export const navigationLinking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    APP_DEEP_LINK_PREFIX,
    ...EXPO_DEVELOPMENT_LINKING_PREFIXES,
  ],
  config: {
    screens: rootStackLinkingScreens,
  },
};

export function getMissingRootStackLinkingRoutes() {
  return rootStackRoutes.filter(routeName => !(routeName in rootStackLinkingScreens));
}

export function getUnknownRootStackLinkingRoutes() {
  return Object.keys(rootStackLinkingScreens).filter(
    routeName => !rootStackRoutes.includes(routeName as keyof RootStackParamList),
  );
}
