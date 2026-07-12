import {useState} from 'react';
import {StyleSheet} from 'react-native';
import {ChevronDown, ChevronUp, ShieldCheck} from 'lucide-react-native';
import {Button, Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {FaceProfileQualitySectionModel} from '../services/faceAnalysisProfileSections';
import {FaceProfileMeasurementDetails} from './FaceProfileMeasurementSection';

type FaceProfileQualityCardProps = {
  section: FaceProfileQualitySectionModel;
};

export function FaceProfileQualityCard({section}: FaceProfileQualityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const ToggleIcon = isExpanded ? ChevronUp : ChevronDown;
  const keyMeasurements = section.measurements.filter(item => item.isKey);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.iconWrap}>
          <ShieldCheck color={colors.textPrimary} size={iconSize.md} strokeWidth={1.9} />
        </View>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>ANALYSIS QUALITY</Text>
          <Text style={styles.title}>{section.title}</Text>
        </View>
      </View>

      <Text style={styles.interpretation}>{section.interpretation}</Text>
      <View style={styles.depthBadge}>
        <Text style={styles.depthText}>{section.quality.trueDepthLabel}</Text>
      </View>

      <View style={styles.keyList}>
        {keyMeasurements.map(item => (
          <View key={item.id} style={styles.keyRow}>
            <Text style={styles.keyLabel}>{item.label}</Text>
            <Text style={styles.keyValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      {section.quality.retakeReasons.length > 0 ? (
        <View style={styles.retakeBox}>
          {section.quality.retakeReasons.map(reason => (
            <Text key={reason} style={styles.retakeText}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}

      {section.warnings.length > 0 ? (
        <View style={styles.warningBox}>
          {section.warnings.map(warning => (
            <Text key={warning} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <Button
        accessibilityLabel={`분석 품질 상세 ${isExpanded ? '닫기' : '보기'}`}
        accessibilityRole="button"
        accessibilityState={{expanded: isExpanded}}
        onPress={() => setIsExpanded(previous => !previous)}
        pressStyle={{opacity: 0.72}}
        style={styles.disclosureButton}
        unstyled>
        <Text style={styles.disclosureText}>
          {isExpanded ? '품질 상세 닫기' : `품질 상세 ${section.measurements.length}개 보기`}
        </Text>
        <ToggleIcon color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
      </Button>

      {isExpanded ? (
        <FaceProfileMeasurementDetails measurements={section.measurements} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  depthBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  depthText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  disclosureButton: {
    alignItems: 'center',
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingTop: spacing.md,
    width: '100%',
  },
  disclosureText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  interpretation: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  keyLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  keyList: {
    gap: spacing.sm,
  },
  keyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  keyValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  retakeBox: {
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  retakeText: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  titleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  warningBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
});
