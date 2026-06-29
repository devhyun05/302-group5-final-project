import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Image,
  ScrollView,
  Share,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {captureRef} from 'react-native-view-shot';
import {Text, View} from 'tamagui';

import {
  getFaceAnalysisReportById,
  getLatestFaceAnalysisReport,
} from '../../../shared/services/faceAnalysisService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisMakeupCard,
  FaceAnalysisReport,
} from '../../../shared/types/faceAnalysis';
import {AppScreen, AuraLogo} from '../../../shared/ui';
import {
  faceAnalysisReportLiquidGlassSurfaceStyle,
  getFaceAnalysisReportAvoidedMakeupRailPresentation,
  getFaceAnalysisReportPointGuideItems,
  getFaceAnalysisReportScreenFramePresentation,
  getFaceAnalysisReportSummaryItems,
} from '../services/faceAnalysisReportDetailModel';
import {
  type FaceAnalysisReportDetailLoadState,
  resolveFaceAnalysisReportDetailLoadState,
} from '../services/faceAnalysisReportDetailLoadState';

type FaceAnalysisReportDetailScreenProps = {
  capturedPhotoUri?: string | null;
  headerTitle?: string;
  reportId?: string | null;
  onBack?: () => void;
  onHeaderShareActionChange?: (action: FaceAnalysisReportShareAction | null) => void;
  onShare?: (report: FaceAnalysisReport) => void;
};

type FaceAnalysisReportShareAction = () => void;

const faceAnalysisReportAvoidedMakeupRailPresentation =
  getFaceAnalysisReportAvoidedMakeupRailPresentation();
const faceAnalysisReportScreenFramePresentation =
  getFaceAnalysisReportScreenFramePresentation();

export function FaceAnalysisReportDetailScreen({
  capturedPhotoUri,
  headerTitle = '맞춤 분석 보고서',
  reportId,
  onHeaderShareActionChange,
  onShare,
}: FaceAnalysisReportDetailScreenProps) {
  const [loadState, setLoadState] =
    useState<FaceAnalysisReportDetailLoadState>({status: 'loading'});
  const [isSharingReport, setIsSharingReport] = useState(false);
  const reportScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    let isMounted = true;

    setLoadState({status: 'loading'});

    resolveFaceAnalysisReportDetailLoadState(async () => {
      const nextReport = reportId
        ? await getFaceAnalysisReportById(reportId)
        : await getLatestFaceAnalysisReport();

      return {
        report: nextReport,
      };
    }).then((nextState) => {
      if (isMounted) {
        setLoadState(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [reportId]);

  const report = loadState.status === 'success' ? loadState.report : null;
  const emptyTitle =
    loadState.status === 'loading'
      ? '보고서를 불러오는 중이에요'
      : loadState.status === 'error'
        ? loadState.message
        : '얼굴 분석 결과를 찾을 수 없어요';
  const emptyDescription =
    loadState.status === 'loading'
      ? '잠시만 기다려 주세요.'
      : loadState.status === 'error'
        ? loadState.description
        : '목록에서 얼굴 분석 결과를 다시 선택해 주세요.';

  const guideItems = useMemo(
    () => (report ? getFaceAnalysisReportPointGuideItems(report) : []),
    [report],
  );
  const summaryItems = useMemo(
    () => (report ? getFaceAnalysisReportSummaryItems(report) : []),
    [report],
  );

  const shareReportAsImage = useCallback(async () => {
    if (!report || isSharingReport) {
      return;
    }

    if (onShare) {
      onShare(report);
      return;
    }

    const captureTarget = reportScrollRef.current;

    if (!captureTarget) {
      return;
    }

    setIsSharingReport(true);

    try {
      const capturedUri = await captureRef(captureTarget, {
        fileName: `aura-face-report-${report.id}`,
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
        snapshotContentContainer: true,
      });
      const shareUrl = capturedUri.startsWith('file://')
        ? capturedUri
        : `file://${capturedUri}`;

      await Share.share({
        title: headerTitle,
        url: shareUrl,
      });
    } catch {
      await Share.share({
        message: [
          `퍼스널 컬러: ${report.personalColor}`,
          `추천 무드: ${report.recommendedMood}`,
        ].join('\n'),
        title: headerTitle,
      });
    } finally {
      setIsSharingReport(false);
    }
  }, [headerTitle, isSharingReport, onShare, report]);

  useEffect(() => {
    if (!report) {
      onHeaderShareActionChange?.(null);
      return;
    }

    onHeaderShareActionChange?.(shareReportAsImage);

    return () => {
      onHeaderShareActionChange?.(null);
    };
  }, [onHeaderShareActionChange, report, shareReportAsImage]);

  if (!report) {
    return (
      <FaceAnalysisReportScaffold
        contentStyle={styles.empty}
        scroll={false}
      >
        <Text accessibilityLiveRegion="polite" style={styles.emptyTitle}>
          {emptyTitle}
        </Text>
        <Text style={styles.emptyDescription}>
          {emptyDescription}
        </Text>
      </FaceAnalysisReportScaffold>
    );
  }

  const heroImageSource: ImageSourcePropType = capturedPhotoUri
    ? {uri: capturedPhotoUri}
    : report.imageSource;

  return (
    <FaceAnalysisReportScaffold scrollRef={reportScrollRef}>
      <View style={styles.reportBrandHeader}>
        <AuraLogo variant="header" />
      </View>

      <View style={styles.heroCard}>
        <Image resizeMode="cover" source={heroImageSource} style={styles.heroImage} />
      </View>

      <View style={styles.summaryGrid}>
        {summaryItems.map((item) => (
          <SummaryItem key={item.label} label={item.label} value={item.value} />
        ))}
      </View>

      <ReportSection title="분석 요약">
        <Text style={styles.paragraph}>{report.skinAnalysisSummary}</Text>
        <Text style={styles.paragraphMuted}>{report.shortSummary}</Text>
      </ReportSection>

      <ReportSection title="포인트 가이드">
        <View style={styles.guideList}>
          {guideItems.map((guide) => (
            <View key={guide.key} style={styles.guideItem}>
              <View style={styles.guideMarker} />
              <View style={styles.guideLine} />
              <View style={styles.guideText}>
                <Text style={styles.guideLabel}>{guide.label}</Text>
                <Text style={styles.guidePoint}>{guide.point}</Text>
                <Text style={styles.guideDescription}>{guide.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ReportSection>

      <MakeupCardRail title="추천 메이크업" items={report.recommendedMakeups} />

      <MakeupCardRail
        title={faceAnalysisReportAvoidedMakeupRailPresentation.title}
        items={report.avoidedMakeups}
      />

      <Text style={styles.notice}>
        분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
      </Text>
    </FaceAnalysisReportScaffold>
  );
}

function FaceAnalysisReportScaffold({
  children,
  contentStyle,
  scrollRef,
  scroll = true,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollRef?: React.RefObject<ScrollView | null>;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const contentContainerStyle = [
    styles.reportContent,
    {
      paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl,
    },
    contentStyle,
  ];

  return (
    <AppScreen
      backgroundColor={colors.surfaceMuted}
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      {scroll ? (
        <ScrollView
          collapsable={false}
          contentContainerStyle={contentContainerStyle}
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={styles.scrollBody}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.staticBody, contentContainerStyle]}>{children}</View>
      )}
    </AppScreen>
  );
}

function SummaryItem({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function ReportSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MakeupCardRail({
  items,
  title,
}: {
  items: FaceAnalysisMakeupCard[];
  title: string;
}) {
  return (
    <ReportSection title={title}>
      <ScrollView
        contentContainerStyle={styles.railContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {items.map((item) => (
          <View key={item.id} style={styles.makeupCard}>
            <View style={styles.makeupImageWrap}>
              <Image
                resizeMode="cover"
                source={item.imageSource}
                style={styles.makeupImage}
              />
            </View>
            <View style={styles.makeupBody}>
              <Text numberOfLines={1} style={styles.makeupTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.makeupSubtitle}>
                {item.subtitle}
              </Text>
              <Text numberOfLines={3} style={styles.makeupDescription}>
                {item.description}
              </Text>
              <View style={styles.tagRow}>
                {item.tags.slice(0, 2).map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    {tag}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </ReportSection>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  emptyDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  guideDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  guideItem: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  guideLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  guideLine: {
    backgroundColor: colors.borderStrong,
    height: 1,
    marginRight: spacing.md,
    width: 34,
  },
  guideList: {
    gap: spacing.md,
  },
  guideMarker: {
    backgroundColor: colors.textPrimary,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  guidePoint: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  guideText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heroCard: {
    ...faceAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  heroImage: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 360,
    width: '100%',
  },
  makeupBody: {
    gap: 4,
    padding: spacing.md,
  },
  makeupCard: {
    ...faceAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.md,
    padding: spacing.xs,
    width: 170,
  },
  makeupDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  makeupImage: {
    height: 104,
    width: '100%',
  },
  makeupImageWrap: {
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  makeupSubtitle: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  makeupTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  notice: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  paragraph: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  paragraphMuted: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  railContent: {
    gap: spacing.md,
    paddingRight: spacing.screenX,
  },
  reportBrandHeader: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  reportContent: {
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: faceAnalysisReportScreenFramePresentation.contentTopPadding,
  },
  scrollBody: {
    backgroundColor: colors.surfaceMuted,
    flex: 1,
  },
  section: {
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  staticBody: {
    backgroundColor: colors.surfaceMuted,
    flex: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryItem: {
    ...faceAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.md,
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 72,
    padding: spacing.md,
    width: '47%',
  },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  tag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
});
