import React, {useCallback, useEffect, useState} from 'react';
import {Alert} from 'react-native';

import {useAuthSession} from '../../../features/auth';
import {
  AccountDeletionScreen,
  AccountManagementScreen,
  AppSettingsScreen,
  type AccountDeletionReasonId,
  clearLocalAccountData,
  deleteMyAccount,
  FaqScreen,
  getPushNotificationSettings,
  isFirebaseMessagingConfigured,
  openSystemNotificationSettings,
  PushNotificationConfigurationError,
  PushNotificationPermissionError,
  setPushNotificationsEnabled,
  type PushNotificationSettings,
} from '../../../features/settings';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function AppSettingsRouteScreen({
  navigation,
}: RootScreenProps<'AppSettings'>) {
  const [pushSettings, setPushSettings] = useState<PushNotificationSettings>({
    deliveryConfigured: false,
    permissionStatus: 'unavailable',
    pushEnabled: false,
  });
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

  const loadPushSettings = useCallback(async () => {
    try {
      setPushSettings(await getPushNotificationSettings());
    } catch {
      setPushSettings(current => ({
        ...current,
        deliveryConfigured: false,
      }));
    }
  }, []);

  useEffect(() => {
    void loadPushSettings();
  }, [loadPushSettings]);

  const handleTogglePushNotifications = useCallback(async (enabled: boolean) => {
    setIsUpdatingPush(true);
    try {
      setPushSettings(await setPushNotificationsEnabled(enabled));
    } catch (error) {
      if (error instanceof PushNotificationPermissionError) {
        Alert.alert('알림 권한이 필요해요', error.message, [
          {style: 'cancel', text: '취소'},
          {onPress: () => void openSystemNotificationSettings(), text: '설정 열기'},
        ]);
      } else if (error instanceof PushNotificationConfigurationError) {
        Alert.alert('푸시 알림 준비 중', error.message);
      } else {
        Alert.alert('알림 설정 실패', '알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      await loadPushSettings();
    } finally {
      setIsUpdatingPush(false);
    }
  }, [loadPushSettings]);

  const clientConfigured = isFirebaseMessagingConfigured();
  const pushNotificationsAvailable =
    pushSettings.pushEnabled || (clientConfigured && pushSettings.deliveryConfigured);
  const notificationDescription = !clientConfigured
    ? 'Firebase 앱 연결 후 사용할 수 있어요'
    : !pushSettings.deliveryConfigured
      ? '알림 발송 서버 설정을 확인해 주세요'
      : pushSettings.permissionStatus === 'denied'
        ? 'iPhone 설정에서 알림을 허용해 주세요'
        : pushSettings.pushEnabled
          ? '예약, 메시지와 통화 알림을 받아요'
          : '백그라운드에서도 상담 소식을 받을 수 있어요';

  return (
    <DetailRouteChrome
      routeName="AppSettings"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <AppSettingsScreen
        isPushNotificationsEnabled={pushSettings.pushEnabled}
        isPushNotificationsUpdating={isUpdatingPush}
        notificationDescription={notificationDescription}
        onPressAccountManagement={() => navigation.navigate('AccountManagement')}
        onPressFaq={() => navigation.navigate('Faq')}
        onPressProfile={() => navigation.navigate('ProfileEdit')}
        onPressQuickActions={() => navigation.navigate('FloatingActionSettings')}
        onTogglePushNotifications={handleTogglePushNotifications}
        pushNotificationsAvailable={pushNotificationsAvailable}
      />
    </DetailRouteChrome>
  );
}

export function FaqRouteScreen({navigation}: RootScreenProps<'Faq'>) {
  return (
    <DetailRouteChrome
      routeName="Faq"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('AppSettings');
      }}>
      <FaqScreen />
    </DetailRouteChrome>
  );
}

export function AccountManagementRouteScreen({
  navigation,
}: RootScreenProps<'AccountManagement'>) {
  const {clearSession, session} = useAuthSession();
  const {resetNavigationFlowState} = useNavigationFlowState();

  const confirmLogout = () => {
    Alert.alert('로그아웃', '이 기기에서 로그아웃할까요?', [
      {style: 'cancel', text: '취소'},
      {
        onPress: () => {
          resetNavigationFlowState();
          void clearSession().finally(() => {
            navigation.reset({index: 0, routes: [{name: 'Login'}]});
          });
        },
        text: '로그아웃',
      },
    ]);
  };

  return (
    <DetailRouteChrome
      routeName="AccountManagement"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('AppSettings');
      }}>
      <AccountManagementScreen
        accountEmail={session?.user.email}
        accountName={session?.user.nickname || session?.user.name || 'AURA 사용자'}
        onLogout={confirmLogout}
        onPressAccountDeletion={() => navigation.navigate('AccountDeletion')}
      />
    </DetailRouteChrome>
  );
}

export function AccountDeletionRouteScreen({
  navigation,
}: RootScreenProps<'AccountDeletion'>) {
  const {clearSession, session} = useAuthSession();
  const {resetNavigationFlowState} = useNavigationFlowState();

  const handleDeleteAccount = async (reason: AccountDeletionReasonId | null) => {
    if (!session) {
      throw new Error('로그인 세션을 확인할 수 없어요. 다시 로그인해 주세요.');
    }

    let result: Awaited<ReturnType<typeof deleteMyAccount>>;

    try {
      result = await deleteMyAccount(reason);
    } catch {
      throw new Error('회원 탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    if (!result.deleted) {
      throw new Error('계정 삭제가 완료되지 않았어요.');
    }

    await clearLocalAccountData(session.user);
    resetNavigationFlowState();

    try {
      await clearSession();
    } finally {
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
    }
  };

  return (
    <DetailRouteChrome
      routeName="AccountDeletion"
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate('AccountManagement');
      }}>
      <AccountDeletionScreen onDeleteAccount={handleDeleteAccount} />
    </DetailRouteChrome>
  );
}
