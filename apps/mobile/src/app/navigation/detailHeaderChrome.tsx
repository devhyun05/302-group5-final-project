import React, {type ReactNode} from 'react';
import {Share2} from 'lucide-react-native';
import {StyleSheet} from 'react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, liquidGlass, radius, spacing, typography} from '../../shared/theme';
import {AppHeader, AuraLogo, XIcon} from '../../shared/ui';
import {
  getDetailRouteTitle,
  getRouteChrome,
  type DetailHeaderBackButtonVisibility,
  type DetailHeaderRightAction,
} from './routeChrome';
import type {RootStackRouteName} from './routeTypes';

const DETAIL_HEADER_ICON_BUTTON_SIZE = 40;
const DETAIL_HEADER_REPORT_ACTIONS_OFFSET =
  DETAIL_HEADER_ICON_BUTTON_SIZE + spacing.sm;

export type DetailHeaderPresentation = {
  backButtonVisibility: DetailHeaderBackButtonVisibility;
  rightActions: readonly DetailHeaderRightAction[];
  title: string;
};

export function getDetailHeaderRightActions(
  routeName: RootStackRouteName,
): readonly DetailHeaderRightAction[] {
  const chrome = getRouteChrome(routeName);

  if (chrome.kind !== 'detail') {
    throw new Error(`${routeName} is not a detail route`);
  }

  return chrome.rightActions ?? [];
}

export function getDetailHeaderPresentation(
  routeName: RootStackRouteName,
): DetailHeaderPresentation {
  const chrome = getRouteChrome(routeName);

  if (chrome.kind !== 'detail') {
    throw new Error(`${routeName} is not a detail route`);
  }

  return {
    backButtonVisibility: chrome.backButtonVisibility ?? 'visible',
    rightActions: getDetailHeaderRightActions(routeName),
    title: getDetailRouteTitle(routeName),
  };
}

type DetailRouteChromeProps = {
  children: ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  onDone?: () => void;
  onShare?: () => void;
  onSurveyToc?: () => void;
  routeName: RootStackRouteName;
  shareDisabled?: boolean;
};

export function DetailRouteChrome({
  children,
  onBack,
  onClose,
  onDone,
  onShare,
  onSurveyToc,
  routeName,
  shareDisabled = false,
}: DetailRouteChromeProps) {
  const presentation = getDetailHeaderPresentation(routeName);
  const headerOnBack =
    presentation.backButtonVisibility === 'hidden' ? undefined : onBack;
  const titleSlot =
    routeName === 'LocalBeautySurvey' ? <AuraLogo variant="header" /> : undefined;
  const rightSlot = renderRightSlot({
    actions: presentation.rightActions,
    onBack,
    onClose,
    onDone,
    onShare,
    onSurveyToc,
    alignTrailingAction: false,
    shareDisabled,
  });
  const shouldReserveLeftSlot = !headerOnBack && presentation.rightActions.length > 0;

  return (
    <YStack style={styles.screen}>
      <AppHeader
        leftSlot={shouldReserveLeftSlot ? <View /> : undefined}
        onBack={headerOnBack}
        rightSlot={rightSlot}
        title={presentation.title}
        titleSlot={titleSlot}
      />
      <YStack style={styles.body}>{children}</YStack>
    </YStack>
  );
}

function renderRightSlot({
  actions,
  onBack,
  onClose,
  onDone,
  onShare,
  onSurveyToc,
  alignTrailingAction,
  shareDisabled,
}: {
  actions: readonly DetailHeaderRightAction[];
  alignTrailingAction: boolean;
  onBack?: () => void;
  onClose?: () => void;
  onDone?: () => void;
  onShare?: () => void;
  onSurveyToc?: () => void;
  shareDisabled: boolean;
}) {
  if (actions.length === 0) {
    return undefined;
  }

  return (
    <XStack
      style={[
        styles.actions,
        alignTrailingAction && styles.trailingAlignedActions,
      ]}>
      {actions.map(action => {
        if (action === 'share') {
          return (
            <HeaderIconAction
              accessibilityLabel="공유하기"
              disabled={shareDisabled || !onShare}
              key={action}
              onPress={onShare}>
              <Share2 color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
            </HeaderIconAction>
          );
        }

        if (action === 'close') {
          return (
            <HeaderIconAction
              accessibilityLabel="닫기"
              key={action}
              onPress={onClose ?? onBack}>
              <XIcon color={colors.textPrimary} size={iconSize.sm} />
            </HeaderIconAction>
          );
        }

        if (action === 'saveDraft') {
          return (
            <Button
              accessibilityLabel="중간 저장"
              accessibilityRole="button"
              key={action}
              onPress={onDone}
              pressStyle={{opacity: 0.78}}
              style={styles.saveDraftButton}
              unstyled>
              <Text style={styles.saveDraftText}>중간 저장</Text>
            </Button>
          );
        }

        if (action === 'surveyToc') {
          return (
            <Button
              accessibilityLabel="설문 목차"
              accessibilityRole="button"
              accessibilityState={{disabled: !onSurveyToc}}
              disabled={!onSurveyToc}
              disabledStyle={{opacity: 0.42}}
              key={action}
              onPress={onSurveyToc}
              pressStyle={{opacity: 0.78}}
              style={styles.saveDraftButton}
              unstyled>
              <Text style={styles.saveDraftText}>목차</Text>
            </Button>
          );
        }

        return (
          <Button
            accessibilityLabel="완료"
            accessibilityRole="button"
            key={action}
            onPress={onDone}
            pressStyle={{scale: 0.97}}
            style={styles.doneButton}
            unstyled>
            <Text style={styles.doneText}>완료</Text>
          </Button>
        );
      })}
    </XStack>
  );
}

function HeaderIconAction({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      disabledStyle={{opacity: 0.42}}
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={styles.iconButton}
      unstyled>
      {children}
    </Button>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  body: {
    flex: 1,
  },
  doneButton: {
    alignItems: 'center',
    height: DETAIL_HEADER_ICON_BUTTON_SIZE,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  doneText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  iconButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    height: DETAIL_HEADER_ICON_BUTTON_SIZE,
    justifyContent: 'center',
    padding: 0,
    width: DETAIL_HEADER_ICON_BUTTON_SIZE,
  },
  saveDraftButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    borderRadius: radius.pill,
    height: DETAIL_HEADER_ICON_BUTTON_SIZE,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  saveDraftText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  trailingAlignedActions: {
    marginLeft: -DETAIL_HEADER_REPORT_ACTIONS_OFFSET,
  },
});
