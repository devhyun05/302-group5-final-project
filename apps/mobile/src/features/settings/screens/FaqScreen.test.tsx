import React from 'react';

import {
  AccountDeletionScreen,
  ACCOUNT_DELETION_REASONS,
} from './AccountDeletionScreen';
import {AccountManagementScreen} from './AccountManagementScreen';
import {AppSettingsScreen, APP_SETTINGS_LABELS} from './AppSettingsScreen';
import {FAQ_ITEMS, FaqScreen} from './FaqScreen';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(APP_SETTINGS_LABELS.faq, 'FAQ', 'settings FAQ label');
expectEqual(
  APP_SETTINGS_LABELS.accountManagement,
  '계정 관리',
  'settings account management label',
);
expectEqual(
  FAQ_ITEMS.some(item => item.id.includes('deletion')),
  false,
  'FAQ excludes account deletion actions',
);
expectEqual(
  ACCOUNT_DELETION_REASONS.length,
  6,
  'account deletion offers standard reason choices',
);

<AppSettingsScreen
  isPushNotificationsEnabled={false}
  isPushNotificationsUpdating={false}
  notificationDescription="백그라운드에서도 상담 소식을 받을 수 있어요"
  onPressAccountManagement={() => undefined}
  onPressFaq={() => undefined}
  onPressProfile={() => undefined}
  onPressQuickActions={() => undefined}
  onTogglePushNotifications={() => undefined}
  pushNotificationsAvailable
/>;
<FaqScreen />;
<AccountManagementScreen
  accountEmail="user@example.com"
  accountName="AURA 사용자"
  onLogout={() => undefined}
  onPressAccountDeletion={() => undefined}
/>;
<AccountDeletionScreen onDeleteAccount={async () => undefined} />;
