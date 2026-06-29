export type RootStackParamList = {
  Tutorial: undefined;
  FaceCapture: undefined;
  FaceAnalysisLoading: {capturedPhotoUri?: string} | undefined;
  FaceAnalysisReportDetail: {capturedPhotoUri?: string; reportId?: string} | undefined;
};

export type RootStackRouteName = keyof RootStackParamList;
export type RouteName = RootStackRouteName;

export const rootStackRoutes = [
  'Tutorial',
  'FaceCapture',
  'FaceAnalysisLoading',
  'FaceAnalysisReportDetail',
] as const satisfies readonly RootStackRouteName[];

export const routes = rootStackRoutes satisfies readonly RouteName[];
