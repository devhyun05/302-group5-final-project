import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View as RNView} from 'react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ConsultingChip,
  ConsultingSectionTitle,
  PrimaryButton,
} from '../components/consultingComponents';
import {consultingCategories} from '../mocks/consulting.mock';
import type {
  ConsultingAdminExpertInput,
  ConsultingCategoryId,
  ConsultingExpert,
} from '../types';

type ConsultingAdminExpertNewScreenProps = {
  completingBooking?: boolean;
  submitting?: boolean;
  onCompleteBooking: (bookingId: string) => void;
  onSubmit: (payload: ConsultingAdminExpertInput) => void;
};

const avatarTones: readonly ConsultingExpert['avatarTone'][] = [
  'rose',
  'mauve',
  'sand',
];

const avatarToneLabels: Record<ConsultingExpert['avatarTone'], string> = {
  rose: '로즈',
  mauve: '모브',
  sand: '샌드',
};

function splitList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeDate(value: string): string {
  return value.trim();
}

export function ConsultingAdminExpertNewScreen({
  completingBooking = false,
  submitting = false,
  onCompleteBooking,
  onSubmit,
}: ConsultingAdminExpertNewScreenProps) {
  const [bookingId, setBookingId] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('메이크업 컨설턴트');
  const [signatureLine, setSignatureLine] = useState('');
  const [avatarTone, setAvatarTone] =
    useState<ConsultingExpert['avatarTone']>('rose');
  const [imageUrl, setImageUrl] = useState('');
  const [studioName, setStudioName] = useState('AURA 파트너 스튜디오');
  const [careerYears, setCareerYears] = useState('5');
  const [responseMinutes, setResponseMinutes] = useState('30');
  const [intro, setIntro] = useState('');
  const [availabilityNote, setAvailabilityNote] = useState(
    '평일 저녁 · 주말 상담 가능',
  );
  const [tagsText, setTagsText] = useState('데일리 메이크업, 퍼스널컬러');
  const [certificationsText, setCertificationsText] =
    useState('메이크업 국가자격');
  const [categoryIds, setCategoryIds] = useState<readonly ConsultingCategoryId[]>(
    ['makeupClinic'],
  );
  const [slotDate, setSlotDate] = useState('2026-07-15');
  const [slotTimes, setSlotTimes] = useState('18:00, 18:30, 19:00');
  const [d15Price, setD15Price] = useState('19000');
  const [d30Price, setD30Price] = useState('33000');

  const canSubmit = useMemo(
    () =>
      name.trim().length > 0 &&
      title.trim().length > 0 &&
      signatureLine.trim().length > 0 &&
      intro.trim().length > 0 &&
      normalizeDate(slotDate).length === 10 &&
      splitList(slotTimes).length > 0 &&
      !submitting,
    [intro, name, signatureLine, slotDate, slotTimes, submitting, title],
  );

  const toggleCategory = (categoryId: ConsultingCategoryId) => {
    setCategoryIds(current => {
      if (current.includes(categoryId)) {
        const next = current.filter(id => id !== categoryId);
        return next.length > 0 ? next : current;
      }

      return [...current, categoryId];
    });
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }

    const slots = splitList(slotTimes).map(time => ({
      isAvailable: true,
      slotDate: normalizeDate(slotDate),
      startTime: time,
    }));

    onSubmit({
      avatarTone,
      availabilityNote: availabilityNote.trim(),
      careerHistory: [
        {
          code: 'c1',
          period: '최근 경력',
          role: `${studioName.trim()} 컨설턴트`,
        },
      ],
      careerYears: Number(careerYears) || 0,
      categoryIds,
      certifications: splitList(certificationsText),
      durations: [
        {
          code: 'd15',
          description: '핵심 질문 1~2개',
          label: '15분',
          minutes: 15,
          price: Number(d15Price) || 0,
        },
        {
          code: 'd30',
          description: '진단 + 실습 피드백',
          label: '30분',
          minutes: 30,
          price: Number(d30Price) || 0,
          recommended: true,
        },
      ],
      imageUrl: imageUrl.trim() || undefined,
      initials: name.trim().slice(-2),
      intro: intro.trim(),
      name: name.trim(),
      responseMinutes: Number(responseMinutes) || 30,
      signatureLine: signatureLine.trim(),
      slots,
      studioName: studioName.trim(),
      tags: splitList(tagsText),
      title: title.trim(),
    });
  };

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xl}>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>운영자 등록</Text>
          <Text style={styles.noticeText}>
            등록한 상담사는 전문가 목록과 예약 슬롯 API에 바로 반영돼요.
          </Text>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>상담 완료 처리</ConsultingSectionTitle>
          <View style={styles.adminActionCard}>
            <Field
              label="예약 ID"
              onChangeText={setBookingId}
              placeholder="상담 완료 처리할 booking ID"
              value={bookingId}
            />
            <Pressable
              accessibilityRole="button"
              disabled={bookingId.trim().length === 0 || completingBooking}
              onPress={() => onCompleteBooking(bookingId.trim())}
              style={({pressed}) => [
                styles.adminActionButton,
                (bookingId.trim().length === 0 || completingBooking) &&
                  styles.adminActionButtonDisabled,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={styles.adminActionButtonText}>
                {completingBooking ? '완료 처리 중...' : '완료 처리'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>
            완료 처리된 상담은 사용자 마이페이지와 상담 내역에서 리뷰 작성 버튼이 보여요.
          </Text>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>기본 정보</ConsultingSectionTitle>
          <Field label="이름" onChangeText={setName} value={name} />
          <Field label="직함" onChangeText={setTitle} value={title} />
          <Field
            label="한 줄 소개"
            onChangeText={setSignatureLine}
            value={signatureLine}
          />
          <Field label="스튜디오" onChangeText={setStudioName} value={studioName} />
          <Field
            label="사진 URL"
            onChangeText={setImageUrl}
            placeholder="선택 입력"
            value={imageUrl}
          />
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>분야</ConsultingSectionTitle>
          <View style={styles.chipRow}>
            {consultingCategories.map(category => (
              <ConsultingChip
                key={category.id}
                label={category.title}
                onPress={() => toggleCategory(category.id)}
                selected={categoryIds.includes(category.id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>프로필 톤</ConsultingSectionTitle>
          <View style={styles.chipRow}>
            {avatarTones.map(tone => (
              <ConsultingChip
                key={tone}
                label={avatarToneLabels[tone]}
                onPress={() => setAvatarTone(tone)}
                selected={avatarTone === tone}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>상세 소개</ConsultingSectionTitle>
          <View style={styles.inlineRow}>
            <Field
              keyboardType="number-pad"
              label="경력"
              onChangeText={setCareerYears}
              value={careerYears}
            />
            <Field
              keyboardType="number-pad"
              label="응답"
              onChangeText={setResponseMinutes}
              value={responseMinutes}
            />
          </View>
          <Field label="가능 시간 안내" onChangeText={setAvailabilityNote} value={availabilityNote} />
          <Field label="태그" onChangeText={setTagsText} value={tagsText} />
          <Field
            label="자격"
            onChangeText={setCertificationsText}
            value={certificationsText}
          />
          <Field
            label="소개"
            multiline
            onChangeText={setIntro}
            value={intro}
          />
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>예약 슬롯</ConsultingSectionTitle>
          <Field label="날짜" onChangeText={setSlotDate} value={slotDate} />
          <Field label="시간" onChangeText={setSlotTimes} value={slotTimes} />
          <View style={styles.inlineRow}>
            <Field
              keyboardType="number-pad"
              label="15분 가격"
              onChangeText={setD15Price}
              value={d15Price}
            />
            <Field
              keyboardType="number-pad"
              label="30분 가격"
              onChangeText={setD30Price}
              value={d30Price}
            />
          </View>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          disabled={!canSubmit}
          label={submitting ? '등록 중...' : '상담사 등록'}
          onPress={handleSubmit}
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={consultingColors.textSoft}
        style={[styles.input, multiline ? styles.multilineInput : null]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  adminActionButton: {
    alignItems: 'center',
    backgroundColor: consultingColors.accent,
    borderRadius: consultingRadius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
  },
  adminActionButtonDisabled: {
    backgroundColor: consultingColors.textSoft,
  },
  adminActionButtonText: {
    color: consultingColors.onAccent,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  adminActionCard: {
    alignItems: 'flex-end',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  helperText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  input: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  multilineInput: {
    lineHeight: typography.lineHeight.sm,
    minHeight: 116,
  },
  noticeCard: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    gap: 6,
    padding: 16,
  },
  noticeText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  noticeTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  pressed: {
    opacity: 0.82,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
});
