import React from 'react';
import {StyleSheet} from 'react-native';
import {ScanLine, SlidersHorizontal} from 'lucide-react-native';
import {Button, Text, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';

type ARFilterFitWorkspaceProps = {
  onOpenDetailEdit?: () => void;
  onOpenShapeAdjust?: () => void;
};

export function ARFilterFitWorkspace({
  onOpenDetailEdit,
  onOpenShapeAdjust,
}: ARFilterFitWorkspaceProps) {
  return (
    <YStack style={styles.panel}>
      <YStack style={styles.introBlock}>
        <Text style={styles.title}>내 얼굴에 맞게 보정하기</Text>
        <Text style={styles.description}>
          메이크업 제품의 세부 값과 얼굴 위에 놓이는 위치를 각각 조절할 수 있습니다.
        </Text>
      </YStack>

      <Button
        accessibilityLabel="메이크업 제품 수정 화면 열기"
        disabled={!onOpenDetailEdit}
        onPress={onOpenDetailEdit}
        pressStyle={{scale: 0.99}}
        style={styles.actionCard}
        unstyled>
        <SlidersHorizontal color="#C9A15E" size={iconSize.md} strokeWidth={2} />
        <YStack style={styles.actionCopy}>
          <Text style={styles.actionTitle}>제품과 표현 수정</Text>
          <Text style={styles.actionDescription}>컬러, 타입, 질감과 농도를 세밀하게 조절해요.</Text>
        </YStack>
      </Button>

      <Button
        accessibilityLabel="메이크업 핏 수정 화면 열기"
        disabled={!onOpenShapeAdjust}
        onPress={onOpenShapeAdjust}
        pressStyle={{scale: 0.99}}
        style={styles.actionCard}
        unstyled>
        <ScanLine color="#C9A15E" size={iconSize.md} strokeWidth={2} />
        <YStack style={styles.actionCopy}>
          <Text style={styles.actionTitle}>얼굴 핏 수정</Text>
          <Text style={styles.actionDescription}>부위별 모양과 위치를 얼굴에 맞춰 조절해요.</Text>
        </YStack>
      </Button>
    </YStack>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  introBlock: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
  actionCard: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetMutedSurface,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-start',
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
  },
  actionCopy: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  actionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
});
