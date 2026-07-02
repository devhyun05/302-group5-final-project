import {useCallback, useEffect, useRef, useState} from 'react';
import {ScrollView, Share, StyleSheet, View} from 'react-native';
import {Share2} from 'lucide-react-native';
import {Button, Text, XStack, YStack} from 'tamagui';
import {captureRef} from 'react-native-view-shot';

import {colors, iconSize, liquidGlass, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, AuraLogo} from '../../../shared/ui';
import {getLocalBeautyImageAnalysisPresentation} from '../services/localBeautyImageAnalysisPresentation';
import {
  getLocalBeautyHairTips,
  getLocalBeautyMakeupTips,
  getLocalBeautyRecommendedMoodDescription,
  getLocalBeautyResultDetailCards,
  getLocalBeautyStyleTips,
  type LocalBeautyMakeupTip,
  type LocalBeautyResultDetailCard,
} from '../services/localBeautyResultPresentation';
import {getLocalBeautyResultConfidencePresentation} from '../services/localBeautyResultConfidencePresentation';
import type {
  LocalBeautyColorAnalysisAxis,
  LocalBeautySituationAnalysis,
  LocalBeautySurveyResult,
} from '../services/localBeautySurveyScoring';
import {
  getLocalBeautyResultCaptureOptions,
  getLocalBeautyResultShareActions,
  getLocalBeautyResultShareFallbackMessage,
  normalizeLocalBeautyResultShareUrl,
  type LocalBeautyResultShareAction,
} from '../services/localBeautyResultSharing';
import {getLocalBeautySurveyResultById} from '../services/localBeautySurveyService';

type LocalBeautySurveyResultScreenProps = {
  onEditAnswers?: () => void;
  onRestart: () => void;
  onReviewUnknownAnswers?: () => void;
  resultId: string;
};

const localBeautyResultShareActions = getLocalBeautyResultShareActions();
const localBeautyResultLayoutIntent = {
  actionButtonDesign: 'matchesIntroButtons',
  contentOrder: [
    'palette',
    'summary',
    'detail',
    'colorAnalysis',
    'imageAnalysis',
    'recommendedMood',
    'makeup',
    'hair',
    'style',
    'situation',
    'avoid',
  ],
  headerBackButtonVisibility: 'hidden',
  heroDescriptionVisibility: 'hidden',
  heroEyebrowVisibility: 'hidden',
  recentResultsVisibility: 'hidden',
  restartActionLabel: '다시 처음부터 설문하기',
  secondaryAnalysisActionTone: 'whiteGlass',
  shareActionTone: 'black',
  shareButtonBehavior: 'nativeShareSheetDirect',
  startOverActionVisibility: 'hidden',
  standaloneConfidenceCardsVisibility: 'hidden',
  summaryConfidencePrefix: '일치도',
  unknownReviewActionLabel: '모르겠음 항목 답하기',
  visualMaterial: 'liquidGlass',
} as const;

export function getLocalBeautyResultLayoutIntent() {
  return localBeautyResultLayoutIntent;
}

export function LocalBeautySurveyResultScreen({
  onEditAnswers,
  onRestart,
  onReviewUnknownAnswers,
  resultId,
}: LocalBeautySurveyResultScreenProps) {
  const [result, setResult] = useState<LocalBeautySurveyResult | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSharingResult, setIsSharingResult] = useState(false);
  const resultCaptureRef = useRef<View | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoaded(false);
    getLocalBeautySurveyResultById(resultId).then((nextResult) => {
      if (isMounted) {
        setResult(nextResult);
        setIsLoaded(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [resultId]);

  const captureResultImage = useCallback(async () => {
    if (!result) {
      throw new Error('Missing local beauty result');
    }

    const captureTarget = resultCaptureRef.current;

    if (!captureTarget) {
      throw new Error('Missing local beauty result capture target');
    }

    const capturedUri = await captureRef(
      captureTarget,
      getLocalBeautyResultCaptureOptions(result),
    );

    return normalizeLocalBeautyResultShareUrl(capturedUri);
  }, [result]);

  const shareResultImage = useCallback(async (
    action: LocalBeautyResultShareAction,
  ) => {
    if (!result || isSharingResult) {
      return;
    }

    setIsSharingResult(true);

    try {
      const imageUri = await captureResultImage();

      await Share.share({
        title: action.shareTitle,
        url: imageUri,
      });
    } catch {
      await Share.share({
        message: getLocalBeautyResultShareFallbackMessage(result),
        title: action.shareTitle,
      });
    } finally {
      setIsSharingResult(false);
    }
  }, [captureResultImage, isSharingResult, result]);

  if (!isLoaded) {
    return (
      <ResultEmptyState
        description="설문 답변을 정리하고 있어요."
        title="결과를 불러오는 중이에요"
      />
    );
  }

  if (!result) {
    return (
      <ResultEmptyState
        actionLabel={localBeautyResultLayoutIntent.restartActionLabel}
        description="저장된 설문 결과를 찾을 수 없어요."
        onAction={onRestart}
        title="결과가 사라졌어요"
      />
    );
  }

  const imageAnalysis = getLocalBeautyImageAnalysisPresentation(result);
  const confidencePresentation = getLocalBeautyResultConfidencePresentation({
    faceImageConfidence: result.faceImage.confidence,
    personalColorConfidence: result.personalColor.confidence,
  });
  const detailCards = getLocalBeautyResultDetailCards(result);
  const hairTips = getLocalBeautyHairTips(result);
  const makeupTips = getLocalBeautyMakeupTips(result);
  const personalColorDisplayLabel =
    result.personalColor.blendLabel ?? result.personalColor.label;
  const personalColorSecondaryLabel =
    result.personalColor.secondary?.label ?? '보조 톤 확인 중';
  const recommendedMoodDescription = getLocalBeautyRecommendedMoodDescription(result);
  const styleTips = getLocalBeautyStyleTips(result);

  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={0}
      scroll={false}
      topPadding="belowShellHeader">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollBody}>
        <View
          collapsable={false}
          ref={resultCaptureRef}
          style={styles.captureReport}>
          <YStack style={styles.hero}>
            <AuraLogo variant="header" />
            <Text style={styles.heroTitle}>
              {personalColorDisplayLabel}
              {'\n'}
              {imageAnalysis.headline}
            </Text>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>컬러 팔레트</Text>
            <XStack style={styles.paletteRow}>
              {result.personalColor.palette.map(color => (
                <View
                  accessibilityLabel={`추천 색상 ${color}`}
                  key={color}
                  style={[styles.paletteSwatch, {backgroundColor: color}]}
                />
              ))}
            </XStack>
          </YStack>

          <YStack style={styles.resultSummaryGrid}>
            <ResultSummary
              label="퍼스널 컬러"
              value={personalColorDisplayLabel}
              confidence={confidencePresentation.personalColor.value}
            />
            <ResultSummary
              label={imageAnalysis.title}
              value={imageAnalysis.headline}
              confidence={confidencePresentation.faceImage.value}
            />
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>결과 상세</Text>
            <YStack style={styles.detailCardList}>
              {detailCards.map(card => (
                <ResultDetailCard card={card} key={card.title} />
              ))}
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>컬러 세부 성향</Text>
            <YStack style={styles.imageAnalysisPanel}>
              <Text style={styles.imageAnalysisHeadline}>
                {result.personalColor.colorAnalysis.priorityLabel}
              </Text>
              <YStack style={styles.imageAnalysisItemList}>
                <XStack style={styles.imageAnalysisItem}>
                  <Text style={styles.imageAnalysisItemLabel}>1순위 컬러</Text>
                  <Text style={styles.imageAnalysisItemValue}>
                    {result.personalColor.label}
                  </Text>
                </XStack>
                <XStack style={styles.imageAnalysisItem}>
                  <Text style={styles.imageAnalysisItemLabel}>2순위 컬러</Text>
                  <Text style={styles.imageAnalysisItemValue}>
                    {personalColorSecondaryLabel}
                  </Text>
                </XStack>
                <XStack style={styles.imageAnalysisItem}>
                  <Text style={styles.imageAnalysisItemLabel}>판정 방식</Text>
                  <Text style={styles.imageAnalysisItemValue}>
                    {result.personalColor.resultMode === 'mixed'
                      ? '혼합형'
                      : '1순위 우세'}
                  </Text>
                </XStack>
              </YStack>
              <Text style={styles.paragraph}>
                {result.personalColor.colorAnalysis.prioritySummary}
              </Text>
              <YStack style={styles.colorAxisList}>
                {result.personalColor.colorAnalysis.axes.map(axis => (
                  <ColorAxisRow axis={axis} key={axis.id} />
                ))}
              </YStack>
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <XStack style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{imageAnalysis.title}</Text>
              <Text style={styles.sectionMeta}>{imageAnalysis.confidenceLabel}</Text>
            </XStack>
            <YStack style={styles.imageAnalysisPanel}>
              <Text style={styles.imageAnalysisHeadline}>
                {imageAnalysis.headline}
              </Text>
              <Text style={styles.paragraph}>{imageAnalysis.summary}</Text>
              <YStack style={styles.imageAnalysisItemList}>
                {imageAnalysis.items.map(item => (
                  <XStack key={item.label} style={styles.imageAnalysisItem}>
                    <Text style={styles.imageAnalysisItemLabel}>{item.label}</Text>
                    <Text style={styles.imageAnalysisItemValue}>{item.value}</Text>
                  </XStack>
                ))}
              </YStack>
              <Text style={styles.imageAnalysisGuide}>{imageAnalysis.guide}</Text>
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>추천 무드</Text>
            <Text style={styles.recommendedMood}>{result.recommendedMood}</Text>
            <Text style={styles.paragraph}>{recommendedMoodDescription}</Text>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>추천 메이크업 팁</Text>
            <YStack style={styles.tipList}>
              {makeupTips.map((tip, index) => (
                <MakeupTipRow index={index} key={tip.title} tip={tip} />
              ))}
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>추천 헤어</Text>
            <YStack style={styles.imageAnalysisPanel}>
              <Text style={styles.imageAnalysisHeadline}>
                {result.hairRecommendation.label}
              </Text>
              <Text style={styles.paragraph}>{result.hairRecommendation.summary}</Text>
              <XStack style={styles.imageAnalysisItem}>
                <Text style={styles.imageAnalysisItemLabel}>추천 컬러</Text>
                <Text style={styles.imageAnalysisItemValue}>
                  {result.hairRecommendation.color}
                </Text>
              </XStack>
              <YStack style={styles.noteList}>
                {hairTips.map(tip => (
                  <XStack key={tip} style={styles.noteRow}>
                    <View style={styles.noteMarker} />
                    <Text style={styles.noteText}>{tip}</Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>추천 패션/핏</Text>
            <YStack style={styles.imageAnalysisPanel}>
              <Text style={styles.imageAnalysisHeadline}>
                {result.styleRecommendation.label}
              </Text>
              <Text style={styles.paragraph}>{result.styleRecommendation.summary}</Text>
              <YStack style={styles.imageAnalysisItemList}>
                <XStack style={styles.imageAnalysisItem}>
                  <Text style={styles.imageAnalysisItemLabel}>추천 핏</Text>
                  <Text style={styles.imageAnalysisItemValue}>
                    {result.styleRecommendation.fit}
                  </Text>
                </XStack>
                <XStack style={styles.imageAnalysisItem}>
                  <Text style={styles.imageAnalysisItemLabel}>실루엣</Text>
                  <Text style={styles.imageAnalysisItemValue}>
                    {result.styleRecommendation.silhouette}
                  </Text>
                </XStack>
              </YStack>
              <YStack style={styles.noteList}>
                {styleTips.map(tip => (
                  <XStack key={tip} style={styles.noteRow}>
                    <View style={styles.noteMarker} />
                    <Text style={styles.noteText}>{tip}</Text>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>상황별 분석</Text>
            <YStack style={styles.situationList}>
              {result.situationAnalysis.map(item => (
                <SituationAnalysisCard item={item} key={item.id} />
              ))}
            </YStack>
          </YStack>

          <YStack style={styles.section}>
            <Text style={styles.sectionTitle}>피하면 좋은 표현</Text>
            <YStack style={styles.noteList}>
              {result.avoidedMakeupNotes.map(note => (
                <XStack key={note} style={styles.noteRow}>
                  <View style={styles.noteMarker} />
                  <Text style={styles.noteText}>{note}</Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        </View>

        <YStack style={styles.shareActions}>
          <ResultShareButton
            action={localBeautyResultShareActions[0]}
            disabled={isSharingResult}
            onPress={shareResultImage}
          />
        </YStack>

        <YStack style={styles.actions}>
          {result.unknownQuestionIds.length > 0 && onReviewUnknownAnswers ? (
            <Button
              accessibilityLabel={localBeautyResultLayoutIntent.unknownReviewActionLabel}
              accessibilityRole="button"
              onPress={onReviewUnknownAnswers}
              pressStyle={{opacity: 0.78}}
              style={styles.analysisActionButton}
              unstyled>
              <Text style={styles.analysisActionButtonText}>
                {localBeautyResultLayoutIntent.unknownReviewActionLabel}
              </Text>
            </Button>
          ) : null}
          {onEditAnswers ? (
            <Button
              accessibilityLabel="답변 수정하기"
              accessibilityRole="button"
              onPress={onEditAnswers}
              pressStyle={{opacity: 0.78}}
              style={styles.analysisActionButton}
              unstyled>
              <Text style={styles.analysisActionButtonText}>답변 수정하기</Text>
            </Button>
          ) : null}
          <Button
            accessibilityLabel={localBeautyResultLayoutIntent.restartActionLabel}
            accessibilityRole="button"
            onPress={onRestart}
            pressStyle={{opacity: 0.78}}
            style={styles.analysisActionButton}
            unstyled>
            <Text style={styles.analysisActionButtonText}>
              {localBeautyResultLayoutIntent.restartActionLabel}
            </Text>
          </Button>
        </YStack>
      </ScrollView>
    </AppScreen>
  );
}

function ResultDetailCard({card}: {card: LocalBeautyResultDetailCard}) {
  return (
    <YStack style={styles.detailCard}>
      <Text style={styles.detailCardTitle}>{card.title}</Text>
      <Text style={styles.detailCardValue}>{card.value}</Text>
      <Text style={styles.detailCardBody}>{card.body}</Text>
    </YStack>
  );
}

function ColorAxisRow({axis}: {axis: LocalBeautyColorAnalysisAxis}) {
  return (
    <YStack style={styles.colorAxisRow}>
      <XStack style={styles.colorAxisHeader}>
        <Text style={styles.colorAxisLabel}>{axis.label}</Text>
        <Text style={styles.colorAxisValue}>{axis.value}</Text>
      </XStack>
      <Text style={styles.colorAxisSummary}>{axis.summary}</Text>
    </YStack>
  );
}

function SituationAnalysisCard({item}: {item: LocalBeautySituationAnalysis}) {
  return (
    <YStack style={styles.situationCard}>
      <Text style={styles.detailCardTitle}>{item.label}</Text>
      <Text style={styles.detailCardValue}>{item.title}</Text>
      <Text style={styles.detailCardBody}>{item.summary}</Text>
      <YStack style={styles.noteList}>
        {item.tips.map(tip => (
          <XStack key={tip} style={styles.noteRow}>
            <View style={styles.noteMarker} />
            <Text style={styles.noteText}>{tip}</Text>
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

function ResultSummary({
  confidence,
  label,
  value,
}: {
  confidence: string;
  label: string;
  value: string;
}) {
  return (
    <YStack style={styles.resultSummaryItem}>
      <XStack style={styles.resultSummaryHeader}>
        <Text style={styles.resultSummaryLabel}>{label}</Text>
        <Text style={styles.resultSummaryConfidence}>
          {localBeautyResultLayoutIntent.summaryConfidencePrefix} {confidence}
        </Text>
      </XStack>
      <Text numberOfLines={2} style={styles.resultSummaryValue}>
        {value}
      </Text>
    </YStack>
  );
}

function MakeupTipRow({index, tip}: {index: number; tip: LocalBeautyMakeupTip}) {
  return (
    <XStack style={styles.tipRow}>
      <View style={styles.tipNumber}>
        <Text style={styles.tipNumberText}>{index + 1}</Text>
      </View>
      <YStack style={styles.tipTextGroup}>
        <Text style={styles.tipTitle}>{tip.title}</Text>
        <Text style={styles.tipBody}>{tip.body}</Text>
      </YStack>
    </XStack>
  );
}

function ResultShareButton({
  action,
  disabled,
  onPress,
}: {
  action: LocalBeautyResultShareAction;
  disabled: boolean;
  onPress: (action: LocalBeautyResultShareAction) => void;
}) {
  return (
    <Button
      accessibilityLabel={action.label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onPress(action)}
      pressStyle={{opacity: 0.78}}
      style={styles.shareButton}
      unstyled>
      <Share2 color={colors.white} size={iconSize.sm} strokeWidth={2} />
      <Text numberOfLines={1} style={styles.shareButtonText}>
        {action.label}
      </Text>
    </Button>
  );
}

function ResultEmptyState({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  description: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      scroll={false}
      topPadding="belowShellHeader">
      <YStack style={styles.emptyState}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyDescription}>{description}</Text>
        {actionLabel && onAction ? (
          <Button
            accessibilityLabel={actionLabel}
            accessibilityRole="button"
            onPress={onAction}
            pressStyle={{opacity: 0.78}}
            style={styles.analysisActionButton}
            unstyled>
            <Text style={styles.analysisActionButtonText}>{actionLabel}</Text>
          </Button>
        ) : null}
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
  },
  analysisActionButton: {
    alignItems: 'center',
    ...liquidGlass.control,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  analysisActionButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  captureReport: {
    backgroundColor: colors.background,
    gap: spacing.xxl,
  },
  colorAxisHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorAxisLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  colorAxisList: {
    gap: spacing.sm,
  },
  colorAxisRow: {
    gap: spacing.xs,
  },
  colorAxisSummary: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  colorAxisValue: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  detailCard: {
    ...liquidGlass.panel,
    borderRadius: radius.sm,
    gap: spacing.xs,
    padding: spacing.md,
  },
  detailCardBody: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  detailCardList: {
    gap: spacing.sm,
  },
  detailCardTitle: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  detailCardValue: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  emptyDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xxl,
    textAlign: 'center',
  },
  imageAnalysisGuide: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  imageAnalysisHeadline: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  imageAnalysisItem: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
    width: '100%',
  },
  imageAnalysisItemLabel: {
    color: colors.textTertiary,
    flexShrink: 0,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    width: 76,
  },
  imageAnalysisItemList: {
    gap: spacing.sm,
  },
  imageAnalysisItemValue: {
    color: colors.textPrimary,
    flex: 1,
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
    minWidth: 0,
    textAlign: 'right',
  },
  imageAnalysisPanel: {
    ...liquidGlass.panel,
    borderRadius: radius.sm,
    gap: spacing.md,
    padding: spacing.md,
  },
  noteList: {
    gap: spacing.sm,
  },
  noteMarker: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: spacing.xs,
    marginTop: spacing.sm,
    width: spacing.xs,
  },
  noteRow: {
    gap: spacing.sm,
  },
  noteText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  paletteRow: {
    gap: spacing.sm,
  },
  paletteSwatch: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    height: 56,
  },
  paragraph: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  recommendedMood: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  resultSummaryConfidence: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  resultSummaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resultSummaryHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultSummaryItem: {
    ...liquidGlass.panel,
    borderRadius: radius.sm,
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.md,
  },
  resultSummaryLabel: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  resultSummaryValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionMeta: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  scrollContent: {
    gap: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  scrollBody: {
    flex: 1,
  },
  shareActions: {
    gap: spacing.sm,
  },
  shareButton: {
    alignItems: 'center',
    ...liquidGlass.primaryControl,
    backgroundColor: colors.black,
    borderColor: colors.black,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    height: iconSize.xl + spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  shareButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  situationCard: {
    ...liquidGlass.panel,
    borderRadius: radius.sm,
    gap: spacing.sm,
    padding: spacing.md,
  },
  situationList: {
    gap: spacing.sm,
  },
  tipBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  tipList: {
    gap: spacing.sm,
  },
  tipNumber: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  tipNumberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  tipRow: {
    alignItems: 'flex-start',
    ...liquidGlass.panel,
    borderRadius: radius.sm,
    gap: spacing.md,
    padding: spacing.md,
  },
  tipTextGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  tipTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
});
