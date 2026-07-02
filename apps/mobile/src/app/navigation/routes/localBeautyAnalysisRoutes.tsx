import React from 'react';

import {
  LocalBeautySurveyResultScreen,
  LocalBeautySurveyScreen,
} from '../../../features/local-beauty-analysis';
import {DetailRouteChrome} from '../detailHeaderChrome';
import type {RootScreenProps} from './routeUtils';

export function LocalBeautySurveyRouteScreen({
  navigation,
  route,
}: RootScreenProps<'LocalBeautySurvey'>) {
  const [openTocAction, setOpenTocAction] = React.useState<(() => void) | undefined>();
  const handleOpenTocActionChange = React.useCallback((action?: () => void) => {
    setOpenTocAction(() => action);
  }, []);

  return (
    <DetailRouteChrome
      routeName="LocalBeautySurvey"
      onSurveyToc={openTocAction}
      onBack={() => navigation.navigate('Tutorial')}>
      <LocalBeautySurveyScreen
        mode={route.params?.mode}
        onBack={() => navigation.navigate('Tutorial')}
        onComplete={resultId =>
          navigation.navigate('LocalBeautySurveyResult', {resultId})
        }
        onOpenTocActionChange={handleOpenTocActionChange}
        sourceResultId={route.params?.resultId}
      />
    </DetailRouteChrome>
  );
}

export function LocalBeautySurveyResultRouteScreen({
  navigation,
  route,
}: RootScreenProps<'LocalBeautySurveyResult'>) {
  return (
    <DetailRouteChrome
      routeName="LocalBeautySurveyResult"
      onClose={() => navigation.navigate('Tutorial')}>
      <LocalBeautySurveyResultScreen
        resultId={route.params.resultId}
        onEditAnswers={() =>
          navigation.navigate('LocalBeautySurvey', {
            mode: 'editAll',
            resultId: route.params.resultId,
          })
        }
        onRestart={() => navigation.navigate('LocalBeautySurvey', {mode: 'new'})}
        onReviewUnknownAnswers={() =>
          navigation.navigate('LocalBeautySurvey', {
            mode: 'unknownOnly',
            resultId: route.params.resultId,
          })
        }
      />
    </DetailRouteChrome>
  );
}
