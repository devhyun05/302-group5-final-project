import {useEffect, useRef} from 'react';

import {useAuthSession} from '../../auth';
import {
  invalidateCurrentPushToken,
  subscribeToPushNotificationOpens,
  subscribeToPushTokenRefresh,
  syncPushNotificationRegistration,
  type PushNotificationOpenData,
} from '../services/pushNotificationService';

type PushNotificationGateProps = {
  onOpenNotification: (data: PushNotificationOpenData) => void;
};

export function PushNotificationGate({onOpenNotification}: PushNotificationGateProps) {
  const {isRestoringSession, session} = useAuthSession();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = session?.user.id ?? null;
    const previousUserId = previousUserIdRef.current;
    previousUserIdRef.current = currentUserId;

    if (previousUserId && previousUserId !== currentUserId) {
      void invalidateCurrentPushToken().catch(() => undefined);
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (isRestoringSession || !session) return undefined;

    let disposed = false;
    let unsubscribeToken: () => void = () => undefined;
    let unsubscribeOpen: () => void = () => undefined;

    void syncPushNotificationRegistration().catch(error => {
      console.info('[aura:push] registration sync skipped', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    });

    void subscribeToPushTokenRefresh().then(unsubscribe => {
      if (disposed) {
        unsubscribe();
        return;
      }
      unsubscribeToken = unsubscribe;
    });

    void subscribeToPushNotificationOpens(onOpenNotification).then(unsubscribe => {
      if (disposed) {
        unsubscribe();
        return;
      }
      unsubscribeOpen = unsubscribe;
    });

    return () => {
      disposed = true;
      unsubscribeToken();
      unsubscribeOpen();
    };
  }, [isRestoringSession, onOpenNotification, session]);

  return null;
}
