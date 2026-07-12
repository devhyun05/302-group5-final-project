import {useState} from 'react';
import {StyleSheet} from 'react-native';
import {ChevronDown, ChevronUp} from 'lucide-react-native';
import {Button, Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceProfileMeasurementItem,
  FaceProfileMeasurementSectionModel,
} from '../services/faceAnalysisProfileSections';

type FaceProfileMeasurementSectionProps = {
  section: FaceProfileMeasurementSectionModel;
};

export function FaceProfileMeasurementDetails({
  measurements,
}: {
  measurements: FaceProfileMeasurementItem[];
}) {
  return (
    <View style={styles.detailList}>
      {measurements.map((measurement, index) => (
        <View
          key={measurement.id}
          style={[
            styles.detailRow,
            index > 0 ? styles.detailDivider : null,
          ]}>
          <View style={styles.valueRow}>
            <Text style={styles.detailLabel}>{measurement.label}</Text>
            <Text
              style={[
                styles.detailValue,
                measurement.value === '측정 불가'
                  ? styles.unavailableValue
                  : null,
              ]}>
              {measurement.value}
            </Text>
          </View>
          <Text style={styles.metaText}>
            {measurement.confidenceLabel} · {measurement.sourceLabel}
          </Text>
          {measurement.nullReason ? (
            <Text style={styles.reasonText}>
              측정 불가 사유 · {measurement.nullReason}
            </Text>
          ) : null}
          {measurement.warnings.map(warning => (
            <Text key={warning} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function FaceProfileMeasurementSection({
  section,
}: FaceProfileMeasurementSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const keyMeasurements = section.measurements.filter(item => item.isKey);
  const ToggleIcon = isExpanded ? ChevronUp : ChevronDown;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MEASUREMENT</Text>
        <Text style={styles.title}>{section.title}</Text>
        <Text style={styles.interpretation}>{section.interpretation}</Text>
      </View>

      {keyMeasurements.length > 0 ? (
        <View style={styles.keyGrid}>
          {keyMeasurements.map(item => (
            <View key={item.id} style={styles.keyItem}>
              <Text style={styles.keyLabel}>{item.label}</Text>
              <Text
                style={[
                  styles.keyValue,
                  item.value === '측정 불가'
                    ? styles.unavailableValue
                    : null,
                ]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button
        accessibilityLabel={`${section.title} 측정 상세 ${isExpanded ? '닫기' : '보기'}`}
        accessibilityRole="button"
        accessibilityState={{expanded: isExpanded}}
        onPress={() => setIsExpanded(previous => !previous)}
        pressStyle={{opacity: 0.72}}
        style={styles.disclosureButton}
        unstyled>
        <Text style={styles.disclosureText}>
          {isExpanded ? '측정 상세 닫기' : `측정 상세 ${section.measurements.length}개 보기`}
        </Text>
        <ToggleIcon color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
      </Button>

      {isExpanded ? (
        <FaceProfileMeasurementDetails measurements={section.measurements} />
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
  detailDivider: {
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  detailList: {
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
    maxWidth: '48%',
    textAlign: 'right',
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
  header: {
    gap: spacing.xs,
  },
  interpretation: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  keyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  keyItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 128,
    padding: spacing.md,
  },
  keyLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  keyValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  metaText: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  reasonText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  unavailableValue: {
    color: colors.textSecondary,
  },
  valueRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
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
