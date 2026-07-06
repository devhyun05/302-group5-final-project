import {Alert} from 'react-native';

import {
  ConsultingBookingCompleteScreen,
  ConsultingBookingScreen,
  ConsultingCallScreen,
  ConsultingExpertListScreen,
  ConsultingExpertProfileScreen,
  ConsultingHistoryScreen,
  ConsultingHomeScreen,
  ConsultingMembershipScreen,
  ConsultingPaymentScreen,
  ConsultingSummaryScreen,
  consultingMembershipPlans,
  createConsultingBooking,
  createConsultingPayment,
  findConsultingRecord,
  subscribeConsultingMembership,
  useConsultingExpert,
} from '../../../features/consulting';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

export function renderConsultingHome(navigation: RootNavigation) {
  return (
    <ConsultingHomeScreen
      onPressStartWithReport={() => navigation.navigate('ConsultingExpertList')}
      onPressCategory={categoryId =>
        navigation.navigate('ConsultingExpertList', {categoryId})
      }
      onPressExpert={expertId =>
        navigation.navigate('ConsultingExpertProfile', {expertId})
      }
      onPressExpertList={() => navigation.navigate('ConsultingExpertList')}
      onPressMembership={() => navigation.navigate('ConsultingMembership')}
      onPressHistory={() => navigation.navigate('ConsultingHistory')}
      onPressEnterUpcoming={recordId => {
        const record = findConsultingRecord(recordId);
        if (!record) {
          return;
        }

        navigation.navigate('ConsultingCall', {
          expertId: record.expertId,
          durationId: 'd30',
        });
      }}
    />
  );
}

function goBackToConsulting(navigation: RootNavigation) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }

  navigation.navigate('Consulting');
}

export function ConsultingExpertListRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingExpertList'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingExpertList"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingExpertListScreen
        initialCategoryId={route.params?.categoryId ?? null}
        onPressExpert={expertId =>
          navigation.navigate('ConsultingExpertProfile', {expertId})
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingExpertProfileRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingExpertProfile'>) {
  const expert = useConsultingExpert(route.params?.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingExpertProfile"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingExpertProfileScreen
        expert={expert}
        onReserve={durationId =>
          navigation.navigate('ConsultingBooking', {
            expertId: expert.id,
            durationId,
          })
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingBookingRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingBooking'>) {
  const expert = useConsultingExpert(route.params?.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingBooking"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingBookingScreen
        durationId={route.params.durationId}
        expert={expert}
        onNext={draft => navigation.navigate('ConsultingPayment', {draft})}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingPaymentRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingPayment'>) {
  const {draft} = route.params;
  const expert = useConsultingExpert(draft.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingPayment"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingPaymentScreen
        draft={draft}
        expert={expert}
        onPay={() => {
          // Create the booking in the background so the confirmation screen is
          // instant even if the backend is slow; History refetches on open.
          void createConsultingBooking(draft).then(record => {
            if (record) {
              void createConsultingPayment({
                kind: 'booking',
                bookingId: record.id,
              });
            }
          });
          navigation.navigate('ConsultingBookingComplete', {draft});
        }}
        onPressMembershipDetail={() =>
          navigation.navigate('ConsultingMembership')
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingBookingCompleteRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingBookingComplete'>) {
  const {draft} = route.params;
  const expert = useConsultingExpert(draft.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingBookingComplete"
      onBack={() => navigation.navigate('Consulting')}>
      <ConsultingBookingCompleteScreen
        draft={draft}
        expert={expert}
        onEnterCall={() =>
          navigation.navigate('ConsultingCall', {
            expertId: draft.expertId,
            durationId: draft.durationId,
          })
        }
        onGoToConsultingHome={() =>
          navigation.navigate('Consulting')
        }
      />
    </DetailRouteChrome>
  );
}

export function ConsultingCallRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingCall'>) {
  const expert = useConsultingExpert(route.params?.expertId);

  return (
    <ConsultingCallScreen
      durationId={route.params.durationId}
      expert={expert}
      onEndCall={() =>
        navigation.replace('ConsultingSummary', {expertId: expert.id})
      }
    />
  );
}

export function ConsultingSummaryRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingSummary'>) {
  const record = findConsultingRecord(route.params?.recordId);
  const expert = useConsultingExpert(record?.expertId ?? route.params?.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingSummary"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingSummaryScreen
        expert={expert}
        heroTitle={record ? '상담 요약 리포트' : undefined}
        summary={record?.summary}
        onGoToConsultingHome={() =>
          navigation.navigate('Consulting')
        }
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingHistoryRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingHistory'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingHistory"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingHistoryScreen
        onPressUpcoming={record =>
          navigation.navigate('ConsultingCall', {
            expertId: record.expertId,
            durationId: 'd30',
          })
        }
        onPressCompleted={record =>
          navigation.navigate('ConsultingSummary', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingMembershipRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingMembership'>) {
  return (
    <DetailRouteChrome
      routeName="ConsultingMembership"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingMembershipScreen
        onSubscribe={planId => {
          const plan = consultingMembershipPlans.find(
            membershipPlan => membershipPlan.id === planId,
          );

          void subscribeConsultingMembership(planId);
          Alert.alert(
            '멤버십 구독',
            `${plan?.name ?? ''} 플랜 구독을 접수했어요. 결제 연동은 순차 적용됩니다.`,
            [{text: '확인'}],
          );
        }}
      />
    </DetailRouteChrome>
  );
}
