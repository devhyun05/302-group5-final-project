import React, {type ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Text, XStack, YStack, type XStackProps} from 'tamagui';

import {colors, liquidGlass, radius, spacing, typography} from '../theme';
import {ChevronLeftIcon} from './LineIcons';

export const APP_HEADER_BASE_HEIGHT = 56;
export const APP_HEADER_VERTICAL_PADDING = spacing.sm;
export const APP_HEADER_ACTION_BUTTON_SIZE = 40;
export const APP_HEADER_SIDE_SIZE = 40;
export const APP_HEADER_CENTER_TITLE_FONT_SIZE = typography.title.fontSize;

type AppHeaderProps = {
  title?: string;
  titleSlot?: ReactNode;
  subtitle?: string;
  showTitle?: boolean;
  topInset?: number;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onBack?: () => void;
  containerProps?: XStackProps;
};

export function AppHeader({
  title = 'AI Makeup Guide',
  titleSlot,
  subtitle = 'MAKEUP GUIDE',
  showTitle = true,
  topInset,
  leftSlot,
  rightSlot,
  onBack,
  containerProps,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const resolvedTopInset = topInset ?? insets.top;
  const shouldUseCenteredTitle = Boolean(onBack || leftSlot);
  const leftContent =
    leftSlot ??
    (onBack ? (
      <HeaderIconButton accessibilityLabel="뒤로가기" onPress={onBack}>
        <ChevronLeftIcon />
      </HeaderIconButton>
    ) : null);
  const rightContent = rightSlot ?? null;

  return (
    <XStack
      {...containerProps}
      style={[
        styles.container,
        shouldUseCenteredTitle && styles.centeredContainer,
        {
          minHeight: APP_HEADER_BASE_HEIGHT + resolvedTopInset,
          paddingTop: APP_HEADER_VERTICAL_PADDING + resolvedTopInset,
        },
        containerProps?.style,
      ]}>
      {shouldUseCenteredTitle ? (
        <>
          <XStack style={styles.side}>{leftContent}</XStack>
          <XStack pointerEvents="none" style={styles.centerTitleSlot}>
            {titleSlot ?? (
              <Text numberOfLines={1} style={styles.centerTitle}>
                {title}
              </Text>
            )}
          </XStack>
          <XStack style={styles.side}>{rightContent}</XStack>
        </>
      ) : (
        <>
          {showTitle ? (
            <YStack style={styles.titleArea}>
              {titleSlot ?? (
                <>
                  <Text
                    color={colors.textSecondary}
                    fontSize={typography.caption.fontSize}
                    fontWeight={typography.caption.fontWeight}
                    letterSpacing={1.2}
                    lineHeight={typography.caption.lineHeight}
                    numberOfLines={1}>
                    {subtitle}
                  </Text>
                  <Text
                    color={colors.textPrimary}
                    fontSize={typography.title.fontSize}
                    fontWeight={typography.title.fontWeight}
                    letterSpacing={0}
                    lineHeight={typography.title.lineHeight}
                    numberOfLines={1}>
                    {title}
                  </Text>
                </>
              )}
            </YStack>
          ) : null}

          <XStack style={styles.actions}>{rightContent}</XStack>
        </>
      )}
    </XStack>
  );
}

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
};

function HeaderIconButton({
  accessibilityLabel,
  children,
  onPress,
}: HeaderIconButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={styles.actionButton}
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
    marginLeft: 'auto',
  },
  actionButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    borderRadius: radius.pill,
    height: APP_HEADER_ACTION_BUTTON_SIZE,
    justifyContent: 'center',
    padding: 0,
    width: APP_HEADER_ACTION_BUTTON_SIZE,
  },
  centeredContainer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  centerTitle: {
    color: colors.textPrimary,
    fontSize: APP_HEADER_CENTER_TITLE_FONT_SIZE,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.title.lineHeight,
    textAlign: 'center',
  },
  centerTitleSlot: {
    alignItems: 'center',
    bottom: APP_HEADER_VERTICAL_PADDING,
    height: APP_HEADER_SIDE_SIZE,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  container: {
    alignItems: 'center',
    backgroundColor: liquidGlass.navigation.backgroundColor,
    borderBottomColor: liquidGlass.navigation.borderColor,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    paddingBottom: APP_HEADER_VERTICAL_PADDING,
    paddingHorizontal: spacing.xl,
  },
  side: {
    alignItems: 'center',
    height: APP_HEADER_SIDE_SIZE,
    justifyContent: 'center',
    minWidth: APP_HEADER_SIDE_SIZE,
  },
  titleArea: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
});
