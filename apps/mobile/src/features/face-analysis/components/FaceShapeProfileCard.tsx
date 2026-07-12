import {StyleSheet} from 'react-native';
import {ScanFace} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {FaceShapeProfileSectionModel} from '../services/faceAnalysisProfileSections';

type FaceShapeProfileCardProps = {
  section: FaceShapeProfileSectionModel;
};

export function FaceShapeProfileCard({section}: FaceShapeProfileCardProps) {
  const {faceShape} = section;
  const isBlocked = faceShape.status === 'blocked';

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.iconWrap}>
          <ScanFace color={colors.textPrimary} size={iconSize.md} strokeWidth={1.9} />
        </View>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>FACE SHAPE</Text>
          <Text style={styles.title}>{section.title}</Text>
        </View>
      </View>

      <View style={[styles.headlineBox, isBlocked ? styles.blockedBox : null]}>
        <Text style={styles.headline}>{faceShape.headline}</Text>
        <Text style={styles.detail}>{faceShape.detail}</Text>
      </View>

      {!isBlocked && faceShape.topTwo.length > 0 ? (
        <View style={styles.scoreList}>
          <Text style={styles.listCaption}>규칙 기반 Top 2</Text>
          {faceShape.topTwo.map((candidate, index) => (
            <View key={`${candidate.label}-${index}`} style={styles.scoreRow}>
              <Text style={styles.scoreRank}>{index + 1}</Text>
              <Text style={styles.scoreLabel}>{candidate.label}</Text>
              <Text style={styles.scoreValue}>{candidate.scoreLabel}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isBlocked && faceShape.traits.length > 0 ? (
        <View style={styles.traitList}>
          <Text style={styles.listCaption}>판단 근거</Text>
          {faceShape.traits.map(trait => (
            <View key={trait} style={styles.traitRow}>
              <View style={styles.traitDot} />
              <Text style={styles.traitText}>{trait}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {faceShape.retakeReasons.length > 0 ? (
        <View style={styles.retakeBox}>
          <Text style={styles.retakeTitle}>다시 측정해 주세요</Text>
          {faceShape.retakeReasons.map(reason => (
            <Text key={reason} style={styles.retakeText}>
              {reason}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blockedBox: {
    backgroundColor: colors.surfaceMuted,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  headline: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  headlineBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  listCaption: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  retakeBox: {
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  retakeText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  retakeTitle: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  scoreLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  scoreList: {
    gap: spacing.sm,
  },
  scoreRank: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
    width: 20,
  },
  scoreRow: {
    alignItems: 'center',
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  scoreValue: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
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
  traitDot: {
    backgroundColor: colors.brandMuted,
    borderRadius: radius.pill,
    height: 5,
    marginTop: 7,
    width: 5,
  },
  traitList: {
    gap: spacing.sm,
  },
  traitRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  traitText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
});
