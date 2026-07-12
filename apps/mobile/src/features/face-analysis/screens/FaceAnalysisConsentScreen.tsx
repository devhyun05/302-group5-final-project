import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Brain,
  CameraOff,
  Check,
  Database,
  ScanFace,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react-native';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  requiresThirdPartyAiConsent,
  type FaceAnalysisConsentStatus,
} from '../services/faceAnalysisConsentModel';
import type {FaceAnalysisConsentSurface} from '../services/faceAnalysisConsentGate';

type FaceAnalysisConsentScreenProps = {
  consent: FaceAnalysisConsentStatus | null;
  errorMessage?: string | null;
  isSubmitting?: boolean;
  onAccept?: () => void;
  onClose: () => void;
  onRetry?: () => void;
  surface: Exclude<FaceAnalysisConsentSurface, 'camera'>;
};

const DISCLOSURES = [
  {
    body: '얼굴 비율, 색상, 얼굴형을 분석하고 맞춤 메이크업과 제품을 추천해요.',
    icon: ScanFace,
    title: '이용 목적',
  },
  {
    body: '촬영 사진과 계산된 FaceProfile(비율·색상·얼굴형·품질 정보)을 저장해요.',
    icon: Database,
    title: '저장하는 정보',
  },
  {
    body: '478개 원본 랜드마크, 원본 depth map, semantic mattes, 카메라 calibration, ROI는 저장하지 않아요.',
    icon: ShieldCheck,
    title: '저장하지 않는 정보',
  },
  {
    body: '얼굴 분석 데이터는 모델 학습에 사용하지 않아요.',
    icon: Brain,
    title: '모델 학습 미사용',
  },
  {
    body: '사진과 분석 결과는 해당 보고서 또는 계정을 삭제할 때까지 보관해요.',
    icon: Trash2,
    title: '보관 및 삭제',
  },
] as const;

export function FaceAnalysisConsentScreen({
  consent,
  errorMessage,
  isSubmitting = false,
  onAccept,
  onClose,
  onRetry,
  surface,
}: FaceAnalysisConsentScreenProps) {
  const [hasAcceptedCore, setHasAcceptedCore] = React.useState(false);
  const [hasAcceptedThirdParty, setHasAcceptedThirdParty] = React.useState(false);
  const needsThirdPartyConsent = consent
    ? requiresThirdPartyAiConsent(consent)
    : false;
  const consentSignature = consent ? JSON.stringify(consent) : '';

  React.useEffect(() => {
    setHasAcceptedCore(false);
    setHasAcceptedThirdParty(false);
  }, [consentSignature]);

  if (surface === 'loading') {
    return (
      <StateSurface
        description="카메라를 열기 전에 최신 동의 상태를 서버에서 확인하고 있어요."
        icon={<ActivityIndicator color={colors.textPrimary} size="large" />}
        onClose={onClose}
        title="얼굴 분석을 준비하고 있어요"
      />
    );
  }

  if (surface === 'retry') {
    return (
      <StateSurface
        actionLabel="다시 시도"
        description={
          errorMessage ??
          '최신 동의 상태를 확인하지 못했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
        }
        icon={<WifiOff color={colors.textPrimary} size={iconSize.xl} strokeWidth={1.8} />}
        onAction={onRetry}
        onClose={onClose}
        title="서버 확인이 필요해요"
      />
    );
  }

  if (surface === 'unsupported') {
    return (
      <StateSurface
        description="이 앱에서는 촬영 사진의 민감한 메타데이터를 안전하게 제거할 수 없어 카메라를 열지 않았어요. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요."
        icon={<CameraOff color={colors.textPrimary} size={iconSize.xl} strokeWidth={1.8} />}
        onClose={onClose}
        title="안전한 얼굴 분석을 지원하지 않아요"
      />
    );
  }

  const canAccept =
    consent !== null &&
    hasAcceptedCore &&
    (!needsThirdPartyConsent || hasAcceptedThirdParty) &&
    !isSubmitting;

  return (
    <AppScreen
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      topPadding="belowShellHeader">
      <View style={styles.heading}>
        <View style={styles.heroIcon}>
          <ShieldCheck color={colors.white} size={iconSize.xl} strokeWidth={1.8} />
        </View>
        <Text style={styles.eyebrow}>FACE ANALYSIS PRIVACY</Text>
        <Text style={styles.title}>얼굴 분석 전 확인해 주세요</Text>
        <Text style={styles.description}>
          아래 내용을 확인하고 동의해야 촬영과 분석을 시작할 수 있어요.
        </Text>
      </View>

      <View style={styles.disclosureList}>
        {DISCLOSURES.map(item => {
          const Icon = item.icon;
          return (
            <View key={item.title} style={styles.disclosureRow}>
              <View style={styles.disclosureIcon}>
                <Icon color={colors.textPrimary} size={iconSize.sm} strokeWidth={1.8} />
              </View>
              <View style={styles.disclosureCopy}>
                <Text style={styles.disclosureTitle}>{item.title}</Text>
                <Text style={styles.disclosureBody}>{item.body}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>동의를 거부할 수 있어요</Text>
        <Text style={styles.noticeBody}>
          거부해도 앱의 다른 기능은 이용할 수 있지만, 얼굴 분석 보고서와 이를 바탕으로 한
          맞춤 추천은 사용할 수 없어요.
        </Text>
        <Text style={styles.noticeBody}>
          삭제는 분석 보고서의 삭제 메뉴 또는 설정 &gt; 계정 관리 &gt; 회원 탈퇴에서 할 수
          있어요.
        </Text>
      </View>

      <ConsentCheckbox
        checked={hasAcceptedCore}
        disabled={isSubmitting}
        label="얼굴 촬영·분석 및 위 저장·보관 내용을 확인하고 동의합니다."
        onPress={() => setHasAcceptedCore(value => !value)}
      />

      {needsThirdPartyConsent ? (
        <View style={styles.thirdPartySection}>
          <Text style={styles.thirdPartyTitle}>외부 AI 처리 안내</Text>
          <Text style={styles.thirdPartyBody}>
            외부 AI 서비스에서 보고서와 추천 이미지를 생성하기 위해 필요한 얼굴 사진과 파생
            분석 정보가 외부 AI 처리 환경으로 전송될 수 있어요. 원본 랜드마크·depth map 등
            센서 원본은 전송하거나 저장하지 않으며, 모델 학습에도 사용하지 않아요.
          </Text>
          <ConsentCheckbox
            checked={hasAcceptedThirdParty}
            disabled={isSubmitting}
            label="외부 AI 처리 안내를 확인하고 동의합니다."
            onPress={() => setHasAcceptedThirdParty(value => !value)}
          />
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.buttonRow}>
        <Pressable
          accessibilityLabel="얼굴 분석 동의하지 않기"
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={onClose}
          style={({pressed}) => [
            styles.secondaryButton,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.secondaryButtonText}>나중에</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="얼굴 분석 동의하고 계속하기"
          accessibilityRole="button"
          accessibilityState={{disabled: !canAccept}}
          disabled={!canAccept}
          onPress={onAccept}
          style={({pressed}) => [
            styles.primaryButton,
            !canAccept ? styles.disabled : null,
            pressed ? styles.pressed : null,
          ]}>
          {isSubmitting ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : null}
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? '동의 저장 중' : '동의하고 계속'}
          </Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

function ConsentCheckbox({
  checked,
  disabled,
  label,
  onPress,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{checked, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.checkboxRow,
        pressed ? styles.checkboxPressed : null,
      ]}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
        {checked ? (
          <Check color={colors.white} size={iconSize.xs} strokeWidth={2.5} />
        ) : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function StateSurface({
  actionLabel,
  description,
  icon,
  onAction,
  onClose,
  title,
}: {
  actionLabel?: string;
  description: string;
  icon: React.ReactNode;
  onAction?: () => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <AppScreen
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      topPadding="belowShellHeader">
      <View style={styles.stateSpacer} />
      <View style={styles.stateCard}>
        <View style={styles.stateIcon}>{icon}</View>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDescription}>{description}</Text>
      </View>
      <View style={styles.stateSpacer} />
      {actionLabel && onAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onAction}
          style={({pressed}) => [
            styles.primaryButton,
            styles.stateActionButton,
            pressed ? styles.pressed : null,
          ]}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel="얼굴 분석 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={({pressed}) => [
          styles.secondaryFullButton,
          pressed ? styles.pressed : null,
        ]}>
        <Text style={styles.secondaryButtonText}>닫기</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  checkboxLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  checkboxPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  checkboxRow: {
    alignItems: 'flex-start',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disabled: {
    opacity: 0.42,
  },
  disclosureBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disclosureCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  disclosureIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  disclosureList: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  disclosureRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  disclosureTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  heading: {
    gap: spacing.sm,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 56,
  },
  noticeBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  noticeBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  noticeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.76,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flex: 1.7,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  secondaryFullButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.xxl,
  },
  stateActionButton: {
    flex: 0,
  },
  stateDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  stateIcon: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  stateSpacer: {
    flex: 1,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  thirdPartyBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  thirdPartySection: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  thirdPartyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
});
