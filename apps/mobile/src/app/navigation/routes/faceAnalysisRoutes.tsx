import React from 'react';

import {FaceAnalysisReportDetailScreen} from '../../../features/face-analysis';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
import {
  consumeFaceAnalysisUsage,
  getFaceAnalysisUsageState,
  type FaceAnalysisUsageState,
} from '../../../features/face-analysis/services/faceAnalysisUsageLimit';
import {FaceCaptureScreen} from '../../../features/face-capture/screens/FaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {RoutePlaceholder} from '../../../shared/ui';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import type {RootScreenProps} from './routeUtils';

type HeaderShareAction = {
  cb: () => void;
};

export function FaceCaptureRouteScreen({navigation}: RootScreenProps<'FaceCapture'>) {
  const {setSelectedFaceCapture} = useNavigationFlowState();
  const [usageState, setUsageState] =
    React.useState<FaceAnalysisUsageState | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    getFaceAnalysisUsageState().then(nextUsageState => {
      if (isMounted) {
        setUsageState(nextUsageState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCapture = React.useCallback(
    async (result?: FaceCaptureUploadResult) => {
      const consumption = await consumeFaceAnalysisUsage();

      setUsageState(consumption.state);

      if (!consumption.allowed) {
        return;
      }

      if (result) {
        setSelectedFaceCapture(result);
      }

      navigation.navigate('FaceAnalysisLoading', {
        capturedPhotoUri: result?.imageUri,
      });
    },
    [navigation, setSelectedFaceCapture],
  );

  if (!usageState) {
    return (
      <RoutePlaceholder
        description="잠시만 기다려 주세요."
        showHeader={false}
        title="분석 가능 횟수를 확인하고 있어요"
      />
    );
  }

  if (!usageState.hasRemaining) {
    return (
      <RoutePlaceholder
        actionLabel="홈화면으로 돌아가기"
        description={`현재 버전에서는 한 사용자당 얼굴 분석을 최대 ${usageState.limit}회까지 사용할 수 있어요.\n남은 횟수: ${usageState.remainingCount}회`}
        onAction={() => navigation.navigate('Tutorial')}
        showHeader={false}
        title="분석 가능 횟수를 모두 사용했어요"
      />
    );
  }

  return (
    <FaceCaptureScreen
      onCapture={handleCapture}
      onClose={() => navigation.navigate('Tutorial')}
    />
  );
}

export function FaceAnalysisLoadingRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisLoading'>) {
  return (
    <DetailRouteChrome
      routeName="FaceAnalysisLoading"
      onBack={() => navigation.navigate('FaceCapture')}>
      <FaceAnalysisLoadingScreen
        capturedPhotoUri={route.params?.capturedPhotoUri}
        onComplete={() =>
          navigation.navigate('FaceAnalysisReportDetail', {
            capturedPhotoUri: route.params?.capturedPhotoUri,
          })
        }
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisReportDetail'>) {
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      routeName="FaceAnalysisReportDetail"
      onClose={() => navigation.navigate('Tutorial')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <FaceAnalysisReportDetailScreen
        capturedPhotoUri={route.params?.capturedPhotoUri}
        onHeaderShareActionChange={handleHeaderShareActionChange}
        reportId={route.params?.reportId ?? null}
      />
    </DetailRouteChrome>
  );
}
