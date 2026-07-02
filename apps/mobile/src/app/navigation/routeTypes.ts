import type {LocalBeautySurveyMode} from '../../features/local-beauty-analysis';

export type RootStackParamList = {
  Tutorial: undefined;
  LocalBeautySurvey:
    | {
        mode?: LocalBeautySurveyMode;
        resultId?: string;
      }
    | undefined;
  LocalBeautySurveyResult: {resultId: string};
};

export type RootStackRouteName = keyof RootStackParamList;
export type ActiveRootStackRouteName = RootStackRouteName;
export type RouteName = ActiveRootStackRouteName;

export const rootStackRoutes = [
  'Tutorial',
  'LocalBeautySurvey',
  'LocalBeautySurveyResult',
] as const satisfies readonly ActiveRootStackRouteName[];

export const routes = rootStackRoutes satisfies readonly RouteName[];
