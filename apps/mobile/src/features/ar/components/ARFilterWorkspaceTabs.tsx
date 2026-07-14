import React from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text, XStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';

export type ARFilterWorkspaceLane = 'makeup' | 'fit' | 'guide';

type ARFilterWorkspaceTabsProps = {
  activeLane: ARFilterWorkspaceLane;
  onLaneChange: (lane: ARFilterWorkspaceLane) => void;
};

const LANE_OPTIONS = [
  {accent: '#FF7E9D', id: 'makeup', label: '메이크업'},
  {accent: '#C9A15E', id: 'fit', label: '보정'},
  {accent: '#7FD0FF', id: 'guide', label: '가이드'},
] as const;

export function ARFilterWorkspaceTabs({
  activeLane,
  onLaneChange,
}: ARFilterWorkspaceTabsProps) {
  return (
    <XStack accessibilityRole="tablist" style={styles.container}>
      {LANE_OPTIONS.map(option => {
        const isActive = option.id === activeLane;

        return (
          <Button
            key={option.id}
            accessibilityLabel={`${option.label} 레인 열기`}
            accessibilityRole="tab"
            accessibilityState={{selected: isActive}}
            onPress={() => onLaneChange(option.id)}
            pressStyle={{opacity: 0.78}}
            style={[
              styles.tab,
              isActive
                ? {
                    backgroundColor: `${option.accent}20`,
                    borderColor: option.accent,
                  }
                : undefined,
            ]}
            unstyled>
            <Text
              style={[
                styles.tabLabel,
                isActive ? {color: option.accent} : undefined,
              ]}>
              {option.label}
            </Text>
          </Button>
        );
      })}
    </XStack>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    gap: spacing.xs,
    padding: spacing.xs / 2,
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  tabLabel: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
});
