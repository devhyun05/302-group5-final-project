import {rootStackRoutes} from './routeTypes';

type PublicSurveyRoute =
  | 'Tutorial'
  | 'LocalBeautySurvey'
  | 'LocalBeautySurveyResult';

const activeRoutes: readonly PublicSurveyRoute[] = rootStackRoutes;

activeRoutes satisfies readonly PublicSurveyRoute[];
