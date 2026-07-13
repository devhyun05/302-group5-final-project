import {Linking, Platform} from 'react-native';

import * as SecureStore from '../../../shared/services/localSecureStore';
import {requestBackendJson} from '../../../shared/services/backendApi';

const PUSH_STATE_STORAGE_KEY = 'aura.push-notifications.v1';
const FIREBASE_MESSAGING_ENABLED =
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_ENABLED?.trim().toLowerCase() === 'true';

export type PushPermissionStatus =
  | 'authorized'
  | 'denied'
  | 'not_determined'
  | 'provisional'
  | 'unavailable';

export type PushNotificationSettings = {
  deliveryConfigured: boolean;
  permissionStatus: PushPermissionStatus;
  pushEnabled: boolean;
};

export type PushNotificationOpenData = {
  bookingId?: string;
  durationId?: string;
  expertId?: string;
  type?: string;
};

type StoredPushState = {
  enabled: boolean;
  token?: string;
};

type NotificationSettingsResponse = {
  settings: {
    deliveryConfigured: boolean;
    pushEnabled: boolean;
  };
};

type MessagingModule = typeof import('@react-native-firebase/messaging');

type MessagingRuntime = {
  messaging: ReturnType<MessagingModule['getMessaging']>;
  module: MessagingModule;
};

export class PushNotificationConfigurationError extends Error {
  constructor() {
    super('Firebase 푸시 설정이 아직 완료되지 않았어요.');
    this.name = 'PushNotificationConfigurationError';
  }
}

export class PushNotificationPermissionError extends Error {
  constructor() {
    super('기기 설정에서 AURA 알림을 허용해 주세요.');
    this.name = 'PushNotificationPermissionError';
  }
}

export function isFirebaseMessagingConfigured(): boolean {
  return FIREBASE_MESSAGING_ENABLED;
}

async function getMessagingRuntime(): Promise<MessagingRuntime> {
  if (!FIREBASE_MESSAGING_ENABLED) {
    throw new PushNotificationConfigurationError();
  }

  const [appModule, messagingModule] = await Promise.all([
    import('@react-native-firebase/app'),
    import('@react-native-firebase/messaging'),
  ]);

  return {
    messaging: messagingModule.getMessaging(appModule.getApp()),
    module: messagingModule,
  };
}

function normalizePermissionStatus(status: number): PushPermissionStatus {
  if (status === 1) return 'authorized';
  if (status === 2) return 'provisional';
  if (status === 0) return 'denied';
  if (status === -1) return 'not_determined';
  return 'unavailable';
}

function isPermissionGranted(status: PushPermissionStatus): boolean {
  return status === 'authorized' || status === 'provisional';
}

async function readStoredPushState(): Promise<StoredPushState> {
  const value = await SecureStore.getItemAsync(PUSH_STATE_STORAGE_KEY);
  if (!value) return {enabled: false};

  try {
    const parsed = JSON.parse(value) as StoredPushState;
    return {enabled: parsed.enabled === true, token: parsed.token};
  } catch {
    return {enabled: false};
  }
}

async function writeStoredPushState(state: StoredPushState): Promise<void> {
  await SecureStore.setItemAsync(PUSH_STATE_STORAGE_KEY, JSON.stringify(state), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function getPermissionStatus(): Promise<PushPermissionStatus> {
  if (!FIREBASE_MESSAGING_ENABLED) return 'unavailable';

  try {
    const {messaging, module} = await getMessagingRuntime();
    return normalizePermissionStatus(await module.hasPermission(messaging));
  } catch {
    return 'unavailable';
  }
}

async function registerCurrentDevice(): Promise<string> {
  const {messaging, module} = await getMessagingRuntime();
  const permissionStatus = normalizePermissionStatus(
    await module.requestPermission(messaging, {
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      provisional: false,
      sound: true,
    }),
  );

  if (!isPermissionGranted(permissionStatus)) {
    throw new PushNotificationPermissionError();
  }

  await module.registerDeviceForRemoteMessages(messaging);
  const token = await module.getToken(messaging);

  await requestBackendJson<{device: {registered: boolean}}>('users/me/push-devices', {
    body: {
      platform: Platform.OS,
      provider: 'fcm',
      token,
    },
    method: 'POST',
  });

  return token;
}

export async function getPushNotificationSettings(): Promise<PushNotificationSettings> {
  const response = await requestBackendJson<NotificationSettingsResponse>(
    'users/me/notification-settings',
  );

  return {
    deliveryConfigured:
      FIREBASE_MESSAGING_ENABLED && response.settings.deliveryConfigured,
    permissionStatus: await getPermissionStatus(),
    pushEnabled: response.settings.pushEnabled,
  };
}

export async function setPushNotificationsEnabled(
  enabled: boolean,
): Promise<PushNotificationSettings> {
  const storedState = await readStoredPushState();
  let token = storedState.token;

  if (enabled) {
    token = await registerCurrentDevice();
  }

  await requestBackendJson<NotificationSettingsResponse>('users/me/notification-settings', {
    body: {pushEnabled: enabled},
    method: 'PUT',
  });

  if (!enabled && token) {
    await requestBackendJson<{device: {disabled: boolean}}>(
      'users/me/push-devices/disable',
      {
        body: {token},
        method: 'POST',
      },
    );
  }

  await writeStoredPushState({enabled, token});
  return getPushNotificationSettings();
}

export async function syncPushNotificationRegistration(): Promise<void> {
  if (!FIREBASE_MESSAGING_ENABLED) return;

  const storedState = await readStoredPushState();
  if (!storedState.enabled) return;

  const token = await registerCurrentDevice();
  await writeStoredPushState({enabled: true, token});
}

export async function subscribeToPushTokenRefresh(): Promise<() => void> {
  if (!FIREBASE_MESSAGING_ENABLED) return () => undefined;

  const {messaging, module} = await getMessagingRuntime();
  return module.onTokenRefresh(messaging, token => {
    void readStoredPushState().then(storedState => {
      if (!storedState.enabled) return;

      return requestBackendJson<{device: {registered: boolean}}>('users/me/push-devices', {
        body: {
          platform: Platform.OS,
          provider: 'fcm',
          token,
        },
        method: 'POST',
      }).then(() => writeStoredPushState({enabled: true, token}));
    });
  });
}

export async function invalidateCurrentPushToken(): Promise<void> {
  if (!FIREBASE_MESSAGING_ENABLED) return;

  const storedState = await readStoredPushState();
  if (!storedState.token) return;

  try {
    const {messaging, module} = await getMessagingRuntime();
    await module.deleteToken(messaging);
  } finally {
    await writeStoredPushState({enabled: storedState.enabled});
  }
}

function stringValue(value: string | object | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeOpenData(
  data: Record<string, string | object> | undefined,
): PushNotificationOpenData {
  return {
    bookingId: stringValue(data?.bookingId),
    durationId: stringValue(data?.durationId),
    expertId: stringValue(data?.expertId),
    type: stringValue(data?.type),
  };
}

export async function subscribeToPushNotificationOpens(
  listener: (data: PushNotificationOpenData) => void,
): Promise<() => void> {
  if (!FIREBASE_MESSAGING_ENABLED) return () => undefined;

  const {messaging, module} = await getMessagingRuntime();
  const initialNotification = await module.getInitialNotification(messaging);
  if (initialNotification?.data) {
    listener(normalizeOpenData(initialNotification.data));
  }

  return module.onNotificationOpenedApp(messaging, message => {
    listener(normalizeOpenData(message.data));
  });
}

export function registerPushNotificationBackgroundHandler(): void {
  if (!FIREBASE_MESSAGING_ENABLED) return;

  void getMessagingRuntime()
    .then(({messaging, module}) => {
      module.setBackgroundMessageHandler(messaging, async () => undefined);
    })
    .catch(error => {
      console.info('[aura:push] background handler unavailable', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    });
}

export function openSystemNotificationSettings(): Promise<void> {
  return Linking.openSettings();
}
