import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';
import {TutorialRouteScreen} from './routes/onboardingRoutes';
import {
  FaceAnalysisLoadingRouteScreen,
  FaceAnalysisReportDetailRouteScreen,
  FaceCaptureRouteScreen,
} from './routes/faceAnalysisRoutes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Tutorial"
      screenOptions={{headerShown: false}}>
      <Stack.Screen name="Tutorial" component={TutorialRouteScreen} />
      <Stack.Screen name="FaceCapture" component={FaceCaptureRouteScreen} />
      <Stack.Screen name="FaceAnalysisLoading" component={FaceAnalysisLoadingRouteScreen} />
      <Stack.Screen
        name="FaceAnalysisReportDetail"
        component={FaceAnalysisReportDetailRouteScreen}
      />
    </Stack.Navigator>
  );
}
