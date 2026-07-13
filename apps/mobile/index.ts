import {registerRootComponent} from 'expo';
import {LogBox} from 'react-native';

import App from './App';
import {registerPushNotificationBackgroundHandler} from './src/features/settings';

LogBox.ignoreAllLogs(true);
registerPushNotificationBackgroundHandler();

registerRootComponent(App);
