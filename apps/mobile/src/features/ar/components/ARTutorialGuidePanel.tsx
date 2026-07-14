import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {
  ARTutorialGuideConfig,
  ARTutorialGuideRegion,
  ARTutorialGuideStep,
} from '../services/arTutorialGuide';

type ARTutorialGuidePanelProps = {
  config: ARTutorialGuideConfig;
  onChange: (config: ARTutorialGuideConfig) => void;
  steps: readonly ARTutorialGuideStep[];
};

const GUIDE_SKY = '#7FD0FF';

const OPACITY_OPTIONS = [
  {label: '연하게', value: 0.45},
  {label: '보통', value: 0.72},
  {label: '선명하게', value: 1},
] as const;

export function ARTutorialGuidePanel({
  config,
  onChange,
  steps,
}: ARTutorialGuidePanelProps) {
  const selectedStepId =
    config.selectedStepId === 'all' ||
    steps.some(step => step.id === config.selectedStepId)
      ? config.selectedStepId
      : 'all';
  const updateBoolean = (
    key: 'dash' | 'midline' | 'pairs' | 'pulse',
  ) => {
    onChange({...config, [key]: !config[key]});
  };

  const selectStep = (selectedStepId: 'all' | ARTutorialGuideRegion) => {
    onChange({...config, selectedStepId});
  };

  return (
    <YStack style={styles.panel}>
      <YStack style={styles.introBlock}>
        <Text style={styles.title}>따라 바르는 AR 가이드</Text>
        <Text style={styles.description}>
          선택한 메이크업 부위 카드를 누르면 얼굴 위에 해당 가이드 선만 표시됩니다.
        </Text>
      </YStack>

      <XStack style={styles.effectRow}>
        <ToggleChip
          active={config.pulse}
          label="호흡"
          onPress={() => updateBoolean('pulse')}
        />
        <ToggleChip
          active={config.dash}
          label="점선"
          onPress={() => updateBoolean('dash')}
        />
        <ToggleChip
          active={config.midline}
          label="중심축"
          onPress={() => updateBoolean('midline')}
        />
        <ToggleChip
          active={config.pairs}
          label="대칭쌍"
          onPress={() => updateBoolean('pairs')}
        />
      </XStack>

      <XStack style={styles.opacityRow}>
        <Text style={styles.optionLabel}>가이드 농도</Text>
        <XStack style={styles.opacityOptions}>
          {OPACITY_OPTIONS.map(option => {
            const isActive = Math.abs(config.opacity - option.value) < 0.02;

            return (
              <Button
                key={option.label}
                accessibilityLabel={`가이드 농도 ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{selected: isActive}}
                onPress={() => onChange({...config, opacity: option.value})}
                pressStyle={{opacity: 0.76}}
                style={[styles.opacityButton, isActive ? styles.opacityButtonActive : undefined]}
                unstyled>
                <Text
                  style={[
                    styles.opacityButtonText,
                    isActive ? styles.opacityButtonTextActive : undefined,
                  ]}>
                  {option.label}
                </Text>
              </Button>
            );
          })}
        </XStack>
      </XStack>

      {steps.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>메이크업을 먼저 선택해 주세요.</Text>
          <Text style={styles.emptyDescription}>
            립, 브로우, 아이 또는 치크를 고르면 따라 바를 순서가 나타납니다.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          contentContainerStyle={styles.stepRow}
          showsHorizontalScrollIndicator={false}>
          <GuideStepCard
            active={selectedStepId === 'all'}
            color={GUIDE_SKY}
            label="전체"
            marker="★"
            onPress={() => selectStep('all')}
          />
          {steps.map((step, index) => (
            <GuideStepCard
              key={step.id}
              active={selectedStepId === step.id}
              color={step.color}
              label={step.label}
              marker={String(index + 1)}
              onPress={() => selectStep(step.id)}
            />
          ))}
        </ScrollView>
      )}
    </YStack>
  );
}

function ToggleChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={`${label} 가이드 ${active ? '끄기' : '켜기'}`}
      accessibilityRole="switch"
      accessibilityState={{checked: active}}
      onPress={onPress}
      pressStyle={{opacity: 0.76}}
      style={[styles.effectChip, active ? styles.effectChipActive : undefined]}
      unstyled>
      <Text style={[styles.effectText, active ? styles.effectTextActive : undefined]}>
        {label}
      </Text>
    </Button>
  );
}

function GuideStepCard({
  active,
  color,
  label,
  marker,
  onPress,
}: {
  active: boolean;
  color: string;
  label: string;
  marker: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={`${label} 가이드 보기`}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={[
        styles.stepCard,
        active ? {borderColor: GUIDE_SKY, borderWidth: 2} : undefined,
      ]}
      unstyled>
      <View style={styles.stepMarkerArea}>
        <Text style={[styles.stepMarker, active ? styles.stepMarkerActive : undefined]}>
          {marker}
        </Text>
      </View>
      <View style={[styles.stepLabelBar, {backgroundColor: color}]}>
        <Text numberOfLines={1} style={styles.stepLabel}>
          {label}
        </Text>
      </View>
    </Button>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.md,
  },
  introBlock: {
    gap: spacing.xs,
  },
  title: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
  effectRow: {
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  effectChip: {
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
  },
  effectChipActive: {
    backgroundColor: 'rgba(127, 208, 255, 0.18)',
    borderColor: GUIDE_SKY,
  },
  effectText: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
  effectTextActive: {
    color: '#DFF2FF',
  },
  opacityRow: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  optionLabel: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
  opacityOptions: {
    gap: spacing.xs,
  },
  opacityButton: {
    borderColor: 'rgba(255, 255, 255, 0.20)',
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 28,
    paddingHorizontal: spacing.sm,
  },
  opacityButtonActive: {
    backgroundColor: 'rgba(127, 208, 255, 0.18)',
    borderColor: GUIDE_SKY,
  },
  opacityButtonText: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
  },
  opacityButtonTextActive: {
    color: '#DFF2FF',
  },
  emptyState: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  emptyTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
  },
  emptyDescription: {
    color: 'rgba(255, 255, 255, 0.56)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
  stepRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  stepCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: colors.transparent,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'column',
    height: 92,
    overflow: 'hidden',
    padding: 0,
    width: 76,
  },
  stepMarkerArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  stepMarker: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
  },
  stepMarkerActive: {
    color: GUIDE_SKY,
  },
  stepLabelBar: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: spacing.xs,
    width: '100%',
  },
  stepLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 2,
  },
});
