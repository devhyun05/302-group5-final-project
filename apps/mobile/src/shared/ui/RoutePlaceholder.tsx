import { StyleSheet } from 'react-native';
import { Button, Text, View } from 'tamagui';

import { colors, radius, spacing, typography } from '../theme';
import { AppHeader } from './AppHeader';
import { AppScreen } from './AppScreen';

type RoutePlaceholderProps = {
  actionLabel?: string;
  title: string;
  description: string;
  onAction?: () => void;
  onBack?: () => void;
  showHeader?: boolean;
};

export function RoutePlaceholder({
  actionLabel,
  title,
  description,
  onAction,
  onBack,
  showHeader = true,
}: RoutePlaceholderProps) {
  return (
    <AppScreen scroll={false} topPadding="none">
      {showHeader ? <AppHeader onBack={onBack} title={title} /> : null}
      <View style={styles.centerArea}>
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {actionLabel && onAction ? (
            <Button
              accessibilityLabel={actionLabel}
              accessibilityRole="button"
              onPress={onAction}
              pressStyle={{opacity: 0.78}}
              style={styles.actionButton}
              unstyled>
              <Text style={styles.actionButtonText}>{actionLabel}</Text>
            </Button>
          ) : null}
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 46,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  body: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xxl,
    width: '100%',
  },
  centerArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
});
