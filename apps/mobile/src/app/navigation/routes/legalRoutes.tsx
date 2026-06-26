import React from 'react';

import {PrivacyPolicyScreen} from '../../../features/legal';
import {DetailRouteChrome} from '../detailHeaderChrome';
import type {RootScreenProps} from './routeUtils';

export function PrivacyPolicyRouteScreen({
  navigation,
}: RootScreenProps<'PrivacyPolicy'>) {
  return (
    <DetailRouteChrome
      routeName="PrivacyPolicy"
      onBack={() => navigation.goBack()}>
      <PrivacyPolicyScreen />
    </DetailRouteChrome>
  );
}
