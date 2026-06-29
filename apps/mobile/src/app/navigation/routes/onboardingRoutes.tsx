import React from 'react';
import {useFocusEffect} from '@react-navigation/native';

import {TutorialIntroScreen} from '../../../features/onboarding';
import {
  getFaceAnalysisUsageState,
  type FaceAnalysisUsageState,
} from '../../../features/face-analysis/services/faceAnalysisUsageLimit';
import type {RootScreenProps} from './routeUtils';

export function TutorialRouteScreen({navigation}: RootScreenProps<'Tutorial'>) {
  const [usageState, setUsageState] =
    React.useState<FaceAnalysisUsageState | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;

      getFaceAnalysisUsageState().then((nextUsageState) => {
        if (isActive) {
          setUsageState(nextUsageState);
        }
      });

      return () => {
        isActive = false;
      };
    }, []),
  );

  return (
    <TutorialIntroScreen
      onStartCapture={() => navigation.navigate('FaceCapture')}
      usageState={usageState}
    />
  );
}
