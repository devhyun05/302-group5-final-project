import {StyleSheet} from 'react-native';
import {Text, View, YStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

const privacySections = [
  {
    body: 'AURA는 얼굴 촬영, 사진 선택, AI 메이크업 분석 미리보기를 제공하기 위해 필요한 범위에서만 카메라와 사진 접근 권한을 사용합니다.',
    title: '수집 및 이용 목적',
  },
  {
    body: '촬영한 얼굴 이미지는 분석 화면 전환과 결과 미리보기에 우선 로컬 이미지 URI로 사용됩니다. 서버 분석이 필요한 경우에만 이미지가 백엔드로 전송될 수 있습니다.',
    title: '얼굴 이미지 처리',
  },
  {
    body: 'AI 얼굴 분석은 백엔드를 통해 OpenAI API 또는 별도 AI 분석 시스템을 사용할 수 있습니다. OpenAI API key는 앱 안에 저장하지 않습니다.',
    title: 'OpenAI API 분석',
  },
  {
    body: '얼굴 이미지와 얼굴 분석 데이터는 광고, 마케팅, 사용자 추적, 데이터 마이닝 목적으로 사용하지 않습니다.',
    title: '사용하지 않는 목적',
  },
  {
    body: '분석용 원본 이미지는 서비스 제공에 필요한 기간 동안만 처리하며, 운영 정책 확정 후 보관 기간과 삭제 절차를 앱과 문서에 명확히 고지합니다.',
    title: '보관 및 삭제',
  },
  {
    body: '문의: support@aura-makeup.example',
    title: '문의',
  },
] as const;

export function PrivacyPolicyScreen() {
  return (
    <AppScreen
      backgroundColor={colors.background}
      contentGap={spacing.xl}
      topPadding="standalone">
      <YStack style={styles.header}>
        <Text style={styles.eyebrow}>AURA Privacy</Text>
        <Text style={styles.title}>개인정보 처리방침</Text>
        <Text style={styles.description}>
          현재 버전은 로그인 없이 얼굴 촬영과 AI 분석 기능을 사용할 수 있도록
          필요한 권한과 데이터 처리 방식을 최소화합니다.
        </Text>
      </YStack>

      <YStack style={styles.sectionList}>
        {privacySections.map(section => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  header: {
    gap: spacing.sm,
  },
  sectionBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  sectionList: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
  },
});
