import React from 'react';
import {useFocusEffect} from '@react-navigation/native';

import {
  getLatestLocalBeautySurveyResult,
  getLocalBeautySurveyDraft,
} from '../../../features/local-beauty-analysis/services/localBeautySurveyService';
import {TutorialIntroScreen} from '../../../features/onboarding';
import type {RootScreenProps} from './routeUtils';

export function TutorialRouteScreen({navigation}: RootScreenProps<'Tutorial'>) {
  const [latestResultId, setLatestResultId] = React.useState<string | null>(null);
  const [hasDraft, setHasDraft] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;

      Promise.all([
        getLatestLocalBeautySurveyResult(),
        getLocalBeautySurveyDraft(),
      ]).then(([result, draft]) => {
        if (isActive) {
          setLatestResultId(result?.id ?? null);
          setHasDraft(Boolean(draft));
        }
      });

      return () => {
        isActive = false;
      };
    }, []),
  );

  return (
    <TutorialIntroScreen
      hasDraft={hasDraft}
      hasLatestResult={Boolean(latestResultId)}
      onOpenLatestResult={
        latestResultId
          ? () => navigation.navigate('LocalBeautySurveyResult', {resultId: latestResultId})
          : undefined
      }
      onResumeSurvey={() => navigation.navigate('LocalBeautySurvey', {mode: 'resume'})}
      onStartSurvey={() => navigation.navigate('LocalBeautySurvey', {mode: 'new'})}
    />
  );
}
