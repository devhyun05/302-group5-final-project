import {Alert} from 'react-native';
import {useEffect, useState} from 'react';

import {
  ConsultingAdminExpertNewScreen,
  ConsultingBookingCompleteScreen,
  ConsultingBookingScreen,
  ConsultingCallScreen,
  ConsultingExpertListScreen,
  ConsultingExpertProfileScreen,
  ConsultingHistoryScreen,
  ConsultingHomeScreen,
  ConsultingMembershipScreen,
  ConsultingPaymentScreen,
  ConsultingReviewScreen,
  ConsultingSummaryScreen,
  consultingMembershipPlans,
  completeConsultingAdminBooking,
  createConsultingAdminExpert,
  createConsultingBooking,
  createConsultingPayment,
  createConsultingReview,
  findConsultingRecord,
  getConsultingBooking,
  subscribeConsultingMembership,
  useConsultingExpert,
  type ConsultingRecord,
  type ConsultingReviewDraft,
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
      onPressExpert={expertId =>
        navigation.navigate('ConsultingExpertProfile', {expertId})
      }
      onPressExpertList={() => navigation.navigate('ConsultingExpertList')}
      onPressMembership={() => navigation.navigate('ConsultingMembership')}
      onPressHistory={() => navigation.navigate('ConsultingHistory')}
      onPressAdmin={() => navigation.navigate('ConsultingAdminExpertNew')}
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
  const [submitting, setSubmitting] = useState(false);

  return (
    <DetailRouteChrome
      routeName="ConsultingPayment"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingPaymentScreen
        draft={draft}
        expert={expert}
        submitting={submitting}
        onPay={async () => {
          if (submitting) {
            return;
          }

          setSubmitting(true);
          try {
            const record = await createConsultingBooking(draft);
            if (!record) {
              Alert.alert(
                '예약 저장 실패',
                '백엔드에 예약을 저장하지 못했어요. 네트워크와 API 설정을 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

            await createConsultingPayment({
              kind: 'booking',
              bookingId: record.id,
            });
            navigation.navigate('ConsultingBookingComplete', {
              bookingId: record.id,
              draft,
              record,
            });
          } finally {
            setSubmitting(false);
          }
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
  const {draft, record} = route.params;
  const expert = useConsultingExpert(draft.expertId);

  return (
    <DetailRouteChrome
      routeName="ConsultingBookingComplete"
      onBack={() => navigation.navigate('Consulting')}>
      <ConsultingBookingCompleteScreen
        draft={draft}
        expert={expert}
        bookingId={route.params.bookingId}
        record={record}
        onPressHistory={() => navigation.navigate('ConsultingHistory')}
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
      bookingId={route.params.bookingId}
      durationId={route.params.durationId}
      expert={expert}
      onEndCall={() => navigation.navigate('ConsultingHistory')}
    />
  );
}

export function ConsultingSummaryRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingSummary'>) {
  const [record, setRecord] = useState<ConsultingRecord | null>(() =>
    route.params?.recordId ? findConsultingRecord(route.params.recordId) ?? null : null,
  );
  useEffect(() => {
    let isMounted = true;

    if (route.params?.recordId) {
      getConsultingBooking(route.params.recordId).then(data => {
        if (isMounted && data) {
          setRecord(data);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [route.params?.recordId]);

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
        onPressCompleted={record =>
          navigation.navigate('ConsultingSummary', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressReview={record =>
          navigation.navigate('ConsultingReview', {
            expertId: record.expertId,
            recordId: record.id,
          })
        }
        onPressFindExpert={() => navigation.navigate('ConsultingExpertList')}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingReviewRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ConsultingReview'>) {
  const expert = useConsultingExpert(route.params.expertId);
  const [record, setRecord] = useState<ConsultingRecord | null>(
    () => findConsultingRecord(route.params.recordId) ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getConsultingBooking(route.params.recordId).then(data => {
      if (isMounted && data) {
        setRecord(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [route.params.recordId]);

  const handleSubmit = async (draft: ConsultingReviewDraft) => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const review = await createConsultingReview(route.params.recordId, draft);
      if (!review) {
        Alert.alert(
          '리뷰 저장 실패',
          '리뷰를 저장하지 못했어요. 완료된 상담인지 확인해 주세요.',
          [{text: '확인'}],
        );
        return;
      }

      Alert.alert('리뷰 저장', '상담사 프로필에 리뷰가 반영됐어요.', [
        {text: '확인', onPress: () => navigation.replace('ConsultingHistory')},
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DetailRouteChrome
      routeName="ConsultingReview"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingReviewScreen
        expert={expert}
        onSubmit={handleSubmit}
        record={record}
        submitting={submitting}
      />
    </DetailRouteChrome>
  );
}

export function ConsultingAdminExpertNewRouteScreen({
  navigation,
}: RootScreenProps<'ConsultingAdminExpertNew'>) {
  const [completingBooking, setCompletingBooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <DetailRouteChrome
      routeName="ConsultingAdminExpertNew"
      onBack={() => goBackToConsulting(navigation)}>
      <ConsultingAdminExpertNewScreen
        completingBooking={completingBooking}
        submitting={submitting}
        onCompleteBooking={async bookingId => {
          if (completingBooking) {
            return;
          }

          setCompletingBooking(true);
          try {
            const record = await completeConsultingAdminBooking(bookingId);
            if (!record) {
              Alert.alert(
                '완료 처리 실패',
                '예약 ID를 확인하거나 API 연결 상태를 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

            Alert.alert(
              '상담 완료',
              `${record.dateLabel} 상담을 완료 처리했어요. 사용자가 리뷰를 작성할 수 있어요.`,
              [{text: '확인'}],
            );
          } finally {
            setCompletingBooking(false);
          }
        }}
        onSubmit={async payload => {
          if (submitting) {
            return;
          }

          setSubmitting(true);
          try {
            const expert = await createConsultingAdminExpert(payload);
            if (!expert) {
              Alert.alert(
                '상담사 등록 실패',
                '백엔드에 상담사를 저장하지 못했어요. API 설정을 확인해 주세요.',
                [{text: '확인'}],
              );
              return;
            }

            Alert.alert('상담사 등록', `${expert.name} 상담사를 등록했어요.`, [
              {
                text: '확인',
                onPress: () =>
                  navigation.navigate('ConsultingExpertProfile', {
                    expertId: expert.id,
                  }),
              },
            ]);
          } finally {
            setSubmitting(false);
          }
        }}
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
