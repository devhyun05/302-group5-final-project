import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';
import {TutorialRouteScreen} from './routes/onboardingRoutes';
import {
  LocalBeautySurveyResultRouteScreen,
  LocalBeautySurveyRouteScreen,
} from './routes/localBeautyAnalysisRoutes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Tutorial"
      screenOptions={{headerShown: false}}>
      <Stack.Screen name="Tutorial" component={TutorialRouteScreen} />
      <Stack.Screen
        name="LocalBeautySurvey"
        component={LocalBeautySurveyRouteScreen}
      />
      <Stack.Screen
        name="LocalBeautySurveyResult"
        component={LocalBeautySurveyResultRouteScreen}
      />
    </Stack.Navigator>
  );
}
