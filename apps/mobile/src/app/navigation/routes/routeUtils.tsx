import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {RootStackParamList} from '../routeTypes';

export type RootScreenProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;
