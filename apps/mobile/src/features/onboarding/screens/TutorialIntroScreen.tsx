import {useEffect, useRef} from 'react';
import {Animated, Linking, StyleSheet, useWindowDimensions} from 'react-native';
import {Button, Text, View, YStack} from 'tamagui';

import {colors, iconSize, liquidGlass, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, AuraLogo} from '../../../shared/ui';

type TutorialIntroScreenProps = {
  hasDraft?: boolean;
  hasLatestResult?: boolean;
  onOpenLatestResult?: () => void;
  onResumeSurvey?: () => void;
  onStartSurvey?: () => void;
};

type TutorialIntroHeroContent = {
  brand: 'AURA';
  title: string;
  subtitle: string;
  primaryActionLabel: string;
  latestResultActionLabel: string;
  resumeActionLabel: string;
};

type TutorialIntroLayoutIntent = {
  actionPlacement: 'bottom';
  copyPlacement: 'betweenLogoAndPrimaryAction';
  logoPlacement: 'top';
  visualMaterial: 'liquidGlass';
};

type TutorialIntroLegalLink = {
  id: 'privacyPolicy' | 'licenseNotice';
  label: string;
  url: string;
};

const tutorialIntroHeroContent = {
  brand: 'AURA',
  title: '빛나는 나를 알아가는 여정',
  subtitle: '설문을 통해 나에게 어울리는 컬러, 이미지 무드, 메이크업, 헤어, 패션 스타일링 방향을 가볍게 확인해보세요.',
  primaryActionLabel: '시작하기',
  latestResultActionLabel: '최근 결과 보기',
  resumeActionLabel: '저장한 설문 이어하기',
} as const satisfies TutorialIntroHeroContent;

const tutorialIntroLayoutIntent = {
  actionPlacement: 'bottom',
  copyPlacement: 'betweenLogoAndPrimaryAction',
  logoPlacement: 'top',
  visualMaterial: 'liquidGlass',
} as const satisfies TutorialIntroLayoutIntent;

const tutorialIntroLegalLinks = [
  {
    id: 'privacyPolicy',
    label: '개인정보 처리방침',
    url: 'https://app.notion.com/p/391571b96b5d80b8a87dfca201f00b81?source=copy_link',
  },
  {
    id: 'licenseNotice',
    label: '라이선스 고지',
    url: 'https://app.notion.com/p/391571b96b5d80999e03c11c1f34fb29?source=copy_link',
  },
] as const satisfies readonly TutorialIntroLegalLink[];

export function getTutorialIntroHeroContent() {
  return tutorialIntroHeroContent;
}

export function getTutorialIntroLayoutIntent() {
  return tutorialIntroLayoutIntent;
}

export function getTutorialIntroLegalLinks() {
  return tutorialIntroLegalLinks;
}

export function TutorialIntroScreen({
  hasDraft = false,
  hasLatestResult = false,
  onOpenLatestResult,
  onResumeSurvey,
  onStartSurvey,
}: TutorialIntroScreenProps) {
  const {height} = useWindowDimensions();
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const isCompactHeight = height < 760;
  const content = getTutorialIntroHeroContent();
  const screenPaddingTop = isCompactHeight ? spacing.xxl : 72;
  const screenPaddingBottom = isCompactHeight ? spacing.xl : 44;
  const legalLinks = getTutorialIntroLegalLinks();

  useEffect(() => {
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      duration: 720,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity]);

  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="safeArea">
      <YStack
        style={[
          styles.screen,
          {
            paddingBottom: screenPaddingBottom,
            paddingTop: screenPaddingTop,
          },
        ]}>
        <YStack style={styles.logoArea}>
          <AuraLogo variant="intro" />
        </YStack>

        <Animated.View style={[styles.middleArea, {opacity: contentOpacity}]}>
          <YStack style={styles.copyArea}>
            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>
          </YStack>
        </Animated.View>

        <Animated.View style={[styles.actionShell, {opacity: contentOpacity}]}>
          <YStack style={styles.actionArea}>
            <Button
              accessibilityLabel={content.primaryActionLabel}
              accessibilityRole="button"
              onPress={onStartSurvey}
              pressStyle={{opacity: 0.78}}
              style={styles.primaryButton}
              unstyled>
              <Text style={styles.primaryButtonText}>{content.primaryActionLabel}</Text>
            </Button>
            {hasDraft ? (
              <Button
                accessibilityLabel={content.resumeActionLabel}
                accessibilityRole="button"
                onPress={onResumeSurvey}
                pressStyle={{opacity: 0.78}}
                style={styles.latestResultButton}
                unstyled>
                <Text style={styles.latestResultButtonText}>
                  {content.resumeActionLabel}
                </Text>
              </Button>
            ) : null}
            {hasLatestResult ? (
              <Button
                accessibilityLabel={content.latestResultActionLabel}
                accessibilityRole="button"
                onPress={onOpenLatestResult}
                pressStyle={{opacity: 0.78}}
                style={styles.latestResultButton}
                unstyled>
                <Text style={styles.latestResultButtonText}>
                  {content.latestResultActionLabel}
                </Text>
              </Button>
            ) : null}
          </YStack>
          <View style={styles.legalLinkRow}>
            <Button
              accessibilityLabel={legalLinks[0].label}
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(legalLinks[0].url);
              }}
              pressStyle={{opacity: 0.72}}
              style={styles.legalLinkButton}
              unstyled>
              <Text style={styles.legalLinkText}>{legalLinks[0].label}</Text>
            </Button>
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={styles.legalDivider}>
              ·
            </Text>
            <Button
              accessibilityLabel={legalLinks[1].label}
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(legalLinks[1].url);
              }}
              pressStyle={{opacity: 0.72}}
              style={styles.legalLinkButton}
              unstyled>
              <Text style={styles.legalLinkText}>{legalLinks[1].label}</Text>
            </Button>
          </View>
        </Animated.View>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    gap: spacing.md,
    width: '100%',
  },
  actionShell: {
    width: '100%',
    zIndex: 1,
  },
  copyArea: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.sm,
    width: '100%',
  },
  middleArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  logoArea: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1,
  },
  primaryButton: {
    alignItems: 'center',
    ...liquidGlass.primaryControl,
    borderRadius: radius.pill,
    height: iconSize.xl + spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  latestResultButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  latestResultButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  legalDivider: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  legalLinkButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.xs,
  },
  legalLinkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.lg,
    width: '100%',
  },
  legalLinkText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textDecorationLine: 'underline',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
});
