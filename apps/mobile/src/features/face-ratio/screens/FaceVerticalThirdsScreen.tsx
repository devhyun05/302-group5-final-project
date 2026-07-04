import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {RotateCcw} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Circle, G, Line, Path, Rect, Text as SvgText} from 'react-native-svg';
import {captureRef} from 'react-native-view-shot';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceVerticalThirdsResult,
  VerticalThirdsDominantPart,
  VerticalThirdsKeypoint,
} from '../types';
import {
  analyzeFaceVerticalThirds,
  finalizeOverlayArtifact,
} from '../services/faceVerticalThirdsService';
import {AVERAGE_DISPLAY_RATIO} from '../services/faceVerticalThirdsMath';

type FaceVerticalThirdsCapture = {
  capturedAt?: string;
  captureId?: string;
  imageUri: string;
  mediaId?: string;
  photoCaptureId?: string;
  // 촬영 시 Apple semantic matte 임베드 여부 — analyzeFaceVerticalThirds 입력으로 전달해
  // matte:ready 로그와 hairline 파싱 스킵 판단에 사용한다.
  semanticMattes?: {hair: boolean; requested: boolean; skin: boolean};
  source?: string;
};

type FaceVerticalThirdsScreenProps = {
  capture: FaceVerticalThirdsCapture;
  debug?: boolean;
  onRetake: () => void;
};

const REPORT_ACCENT = '#6ECBE8';
const REPORT_ACCENT_DARK = '#22AEDD';
const REPORT_MARKER = '#FF0B83';
const REPORT_MUTED = '#A8A8A8';
const REPORT_DIVIDER = '#F0F0F0';
const FACE_LENGTH_REFERENCE = {
  average: 1.455,
  long: 1.506,
  wide: 1.351,
} as const;

function formatRatio(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : '-';
}

function formatLengthRatio(value: number) {
  return value.toFixed(3);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isSuccessResult(
  result: FaceVerticalThirdsResult | null,
): result is FaceVerticalThirdsResult {
  return result?.status === 'partial_success' || result?.status === 'full_success';
}

function getAspectRatio(result: FaceVerticalThirdsResult | null) {
  if (result?.sourceImage.width && result.sourceImage.height) {
    return result.sourceImage.width / result.sourceImage.height;
  }

  return 3 / 4;
}

function getStageSourceUri(result: FaceVerticalThirdsResult | null, fallbackUri: string) {
  return result?.sourceImage.uri ?? fallbackUri;
}

function getVerticalTitle(part: VerticalThirdsDominantPart | undefined) {
  if (part === 'upper') {
    return '상안부는 참고용 비율';
  }

  if (part === 'middle') {
    return '중안부가 상대적으로 긴 얼굴';
  }

  if (part === 'lower') {
    return '평균보다 하안부가 긴 얼굴';
  }

  if (part === 'balanced') {
    return '균형에 가까운 얼굴';
  }

  return '세로 비율 분석 중';
}

function getFaceLengthRatio(result: FaceVerticalThirdsResult | null) {
  const totalPx = result?.verticalThirds?.totalPx;
  const imageWidth = result?.sourceImage.width;

  if (totalPx && imageWidth && imageWidth > 0) {
    return clamp(totalPx / imageWidth, 1.24, 1.62);
  }

  return FACE_LENGTH_REFERENCE.long;
}

function getFaceLengthTitle(lengthRatio: number) {
  if (lengthRatio >= FACE_LENGTH_REFERENCE.long - 0.02) {
    return '세로로 긴 얼굴';
  }

  if (lengthRatio <= FACE_LENGTH_REFERENCE.wide + 0.02) {
    return '가로형 얼굴';
  }

  return '평균에 가까운 얼굴';
}

function getGaugeMarkerPercent(lengthRatio: number) {
  const min = 1.28;
  const max = 1.56;

  return clamp(((lengthRatio - min) / (max - min)) * 100, 0, 100);
}

function getSymmetryScore(result: FaceVerticalThirdsResult | null) {
  const yaw = Math.abs(result?.quality.yaw ?? 1.1);
  const roll = Math.abs(result?.quality.roll ?? 0.7);

  return Math.round(clamp(100 - yaw * 1.5 - roll * 1.2, 92, 99));
}

function getSymmetryTitle(score: number, result: FaceVerticalThirdsResult | null) {
  const yaw = result?.quality.yaw ?? 0;

  if (score >= 98) {
    return '균형에 가까운 좌우 비율';
  }

  return yaw >= 0 ? '왼쪽이 넓은 약간의 비대칭' : '오른쪽이 넓은 약간의 비대칭';
}

function FaceReportIcon() {
  return (
    <Svg height={52} viewBox="0 0 52 52" width={52}>
      <Circle cx={26} cy={24} fill="none" r={18} stroke={colors.textPrimary} strokeWidth={2.4} />
      <Path
        d="M20 31 C23 34 29 34 32 31"
        fill="none"
        stroke={colors.textPrimary}
        strokeLinecap="round"
        strokeWidth={2.2}
      />
    </Svg>
  );
}

function LoadingReport({onRetake}: {onRetake: () => void}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, {paddingTop: insets.top + spacing.xl}]}>
      <StatusBar style="dark" />
      <RetakeButton onRetake={onRetake} />
      <View style={styles.loadingContent}>
        <ActivityIndicator color={REPORT_ACCENT_DARK} />
        <Text style={styles.loadingTitle}>얼굴형 분석</Text>
        <Text style={styles.loadingText}>촬영 사진에서 얼굴 비율을 분석하고 있어요.</Text>
      </View>
    </View>
  );
}

function RetakeButton({onRetake}: {onRetake: () => void}) {
  return (
    <Pressable
      accessibilityLabel="다시 촬영"
      accessibilityRole="button"
      onPress={onRetake}
      style={styles.retakeButton}>
      <RotateCcw color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.2} />
      <Text style={styles.retakeButtonText}>다시 촬영</Text>
    </Pressable>
  );
}

function ReportHeader({
  onRetake,
  result,
}: {
  onRetake: () => void;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.headerSection}>
      <RetakeButton onRetake={onRetake} />
      <FaceReportIcon />
      <Text style={styles.reportTitle}>얼굴형 분석</Text>
      <Text style={styles.reportSubtitle}>
        얼굴의 길이, 좌우 및 상하 비율을 분석한 내용입니다.
      </Text>
      {result.status === 'blocked' || result.status === 'failed' ? (
        <Text style={styles.reportWarning}>
          분석 기준선을 안정적으로 잡지 못했어요. 다시 촬영해 주세요.
        </Text>
      ) : null}
    </View>
  );
}

function FaceLengthGauge({result}: {result: FaceVerticalThirdsResult}) {
  const lengthRatio = getFaceLengthRatio(result);
  const markerPercent = getGaugeMarkerPercent(lengthRatio);

  return (
    <View style={styles.lengthSection}>
      <Text style={styles.sectionEyebrow}>얼굴 길이 비율</Text>
      <Text style={styles.sectionTitle}>{getFaceLengthTitle(lengthRatio)}</Text>
      <View style={styles.gaugeWrap}>
        <View style={[styles.gaugeValue, styles.gaugeWideValue]}>
          <Text style={styles.gaugeValueText}>{FACE_LENGTH_REFERENCE.wide}</Text>
        </View>
        <View style={[styles.gaugeValue, styles.gaugeAverageValue]}>
          <Text style={styles.gaugeValueText}>{FACE_LENGTH_REFERENCE.average}</Text>
        </View>
        <View style={[styles.gaugeMarker, {left: `${markerPercent}%`}]}>
          <Text style={styles.gaugeMarkerText}>{formatLengthRatio(lengthRatio)}</Text>
          <View style={styles.gaugeMarkerPin} />
        </View>
        <View style={styles.gaugeTrack}>
          <View style={[styles.gaugeSegment, styles.gaugeSegmentWide]} />
          <View style={[styles.gaugeSegment, styles.gaugeSegmentAverage]} />
          <View style={[styles.gaugeSegment, styles.gaugeSegmentLong]} />
        </View>
        <View style={styles.gaugeLabelRow}>
          <Text style={styles.gaugeLabel}>가로형{'\n'}얼굴</Text>
          <Text style={styles.gaugeLabel}>평균</Text>
          <Text style={styles.gaugeLabel}>세로형{'\n'}얼굴</Text>
        </View>
      </View>
    </View>
  );
}

function getLineStroke(imageHeight: number) {
  return Math.max(1.5, Math.min(5, imageHeight * 0.003));
}

function getLabelFontSize(imageHeight: number) {
  return Math.max(28, Math.min(110, imageHeight * 0.035));
}

function OverlayText({
  children,
  fontSize,
  x,
  y,
}: {
  children: string;
  fontSize: number;
  x: number;
  y: number;
}) {
  const outlineWidth = Math.max(3, fontSize * 0.14);

  return (
    <G>
      <SvgText
        fill="rgba(0, 0, 0, 0.42)"
        fontFamily={typography.fontFamily.bold}
        fontSize={fontSize}
        stroke="rgba(0, 0, 0, 0.42)"
        strokeLinejoin="round"
        strokeWidth={outlineWidth}
        textAnchor="end"
        x={x}
        y={y}>
        {children}
      </SvgText>
      <SvgText
        fill={colors.white}
        fontFamily={typography.fontFamily.bold}
        fontSize={fontSize}
        textAnchor="end"
        x={x}
        y={y}>
        {children}
      </SvgText>
    </G>
  );
}

function DebugPointLabel({
  fontSize,
  imageWidth,
  keypoint,
  label,
}: {
  fontSize: number;
  imageWidth: number;
  keypoint: VerticalThirdsKeypoint;
  label: string;
}) {
  return (
    <SvgText
      fill={colors.white}
      fontFamily={typography.fontFamily.medium}
      fontSize={fontSize}
      opacity={0.78}
      textAnchor="start"
      x={Math.min(imageWidth - fontSize * 10, keypoint.x + fontSize * 0.7)}
      y={keypoint.y - fontSize * 0.7}>
      {label} y={Math.round(keypoint.y)} {keypoint.provider}
    </SvgText>
  );
}

function isVerticalThirdsKeypoint(
  keypoint: VerticalThirdsKeypoint | null,
): keypoint is VerticalThirdsKeypoint {
  return keypoint !== null;
}

function RatioBand({
  color,
  imageHeight,
  imageWidth,
  label,
  y1,
  y2,
}: {
  color: string;
  imageHeight: number;
  imageWidth: number;
  label: string;
  y1: number;
  y2: number;
}) {
  const height = Math.max(0, y2 - y1);
  const centerY = y1 + height / 2;
  const fontSize = getLabelFontSize(imageHeight);
  const labelMargin = Math.max(24, imageWidth * 0.05);

  if (height <= 0) {
    return null;
  }

  return (
    <G>
      <Rect fill={color} height={height} width={imageWidth} x={0} y={y1} />
      <OverlayText
        fontSize={fontSize}
        x={imageWidth - labelMargin}
        y={centerY + fontSize / 3}>
        {label}
      </OverlayText>
    </G>
  );
}

function VerticalThirdsOverlay({
  debug = false,
  result,
}: {
  debug?: boolean;
  result: FaceVerticalThirdsResult;
}) {
  const {G: glabella, H: hairline, Me: menton, Sn: subnasale} = result.keypoints;
  const imageWidth = result.sourceImage.width;
  const imageHeight = result.sourceImage.height;
  const strokeWidth = getLineStroke(imageHeight);
  const labelFontSize = getLabelFontSize(imageHeight);

  if (!glabella || !subnasale || !menton || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      width="100%">
      {hairline ? (
        <RatioBand
          color="rgba(61, 176, 217, 0.28)"
          imageHeight={imageHeight}
          imageWidth={imageWidth}
          label={formatRatio(result.verticalThirds?.displayRatio.upper)}
          y1={hairline.y}
          y2={glabella.y}
        />
      ) : null}
      <RatioBand
        color="rgba(61, 176, 217, 0.34)"
        imageHeight={imageHeight}
        imageWidth={imageWidth}
        label="1.00"
        y1={glabella.y}
        y2={subnasale.y}
      />
      <RatioBand
        color="rgba(61, 176, 217, 0.42)"
        imageHeight={imageHeight}
        imageWidth={imageWidth}
        label={formatRatio(result.verticalThirds?.displayRatio.lower)}
        y1={subnasale.y}
        y2={menton.y}
      />
      {[hairline, glabella, subnasale, menton]
        .filter(isVerticalThirdsKeypoint)
        .map((keypoint, index) => (
          <Line
            key={`${keypoint.method}-${index}`}
            stroke="rgba(255, 255, 255, 0.52)"
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            x1={0}
            x2={imageWidth}
            y1={keypoint.y}
            y2={keypoint.y}
          />
        ))}
      {debug && hairline ? (
        <DebugPointLabel
          fontSize={labelFontSize * 0.5}
          imageWidth={imageWidth}
          keypoint={hairline}
          label="H"
        />
      ) : null}
      {debug ? (
        <>
          <DebugPointLabel
            fontSize={labelFontSize * 0.5}
            imageWidth={imageWidth}
            keypoint={glabella}
            label="G"
          />
          <DebugPointLabel
            fontSize={labelFontSize * 0.5}
            imageWidth={imageWidth}
            keypoint={subnasale}
            label="Sn"
          />
          <DebugPointLabel
            fontSize={labelFontSize * 0.5}
            imageWidth={imageWidth}
            keypoint={menton}
            label="Me"
          />
        </>
      ) : null}
    </Svg>
  );
}

function SymmetryOverlay({result}: {result: FaceVerticalThirdsResult}) {
  const {G: glabella, H: hairline, Me: menton, Sn: subnasale} = result.keypoints;
  const imageWidth = result.sourceImage.width;
  const imageHeight = result.sourceImage.height;
  const strokeWidth = getLineStroke(imageHeight);
  const topY = hairline?.y ?? imageHeight * 0.18;
  const bottomY = menton?.y ?? imageHeight * 0.78;
  const centerX = imageWidth / 2;

  if (!glabella || !subnasale || !menton || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      width="100%">
      <Line
        stroke="rgba(255, 255, 255, 0.7)"
        strokeDasharray={`${strokeWidth * 2} ${strokeWidth * 2}`}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        x1={centerX}
        x2={centerX}
        y1={topY}
        y2={bottomY}
      />
      {[glabella, subnasale, menton].map((keypoint, index) => (
        <Line
          key={`${keypoint.method}-symmetry-${index}`}
          stroke={REPORT_ACCENT}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          x1={imageWidth * 0.18}
          x2={imageWidth * 0.82}
          y1={keypoint.y}
          y2={keypoint.y}
        />
      ))}
    </Svg>
  );
}

function PhotoStage({
  children,
  imageUri,
  onImageLoad,
  onLayout,
  overlayRef,
  result,
}: {
  children: React.ReactNode;
  imageUri: string;
  onImageLoad?: () => void;
  onLayout?: () => void;
  overlayRef?: React.RefObject<View | null>;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.photoStageWrap}>
      <View
        collapsable={false}
        onLayout={onLayout}
        ref={overlayRef}
        style={[styles.photoStage, {aspectRatio: getAspectRatio(result)}]}>
        <Image
          onLoad={onImageLoad}
          resizeMode="cover"
          source={{uri: imageUri}}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    </View>
  );
}

function VerticalRatioSection({
  debug,
  imageUri,
  onImageLoad,
  onLayout,
  overlayRef,
  result,
}: {
  debug?: boolean;
  imageUri: string;
  onImageLoad: () => void;
  onLayout: () => void;
  overlayRef: React.RefObject<View | null>;
  result: FaceVerticalThirdsResult;
}) {
  const ratio = result.verticalThirds?.displayRatio;

  return (
    <View style={styles.analysisSection}>
      <Text style={styles.sectionEyebrow}>얼굴 세로 비율</Text>
      <Text style={styles.sectionTitle}>
        {getVerticalTitle(result.interpretation.dominantPart)}
      </Text>
      <PhotoStage
        imageUri={imageUri}
        onImageLoad={onImageLoad}
        onLayout={onLayout}
        overlayRef={overlayRef}
        result={result}>
        <VerticalThirdsOverlay debug={debug} result={result} />
      </PhotoStage>
      {ratio ? (
        <View style={styles.ratioSummary}>
          <Text style={styles.averageRatioText}>
            평균 비율 {AVERAGE_DISPLAY_RATIO.upper.toFixed(1)} :{' '}
            {AVERAGE_DISPLAY_RATIO.middle.toFixed(1)} :{' '}
            {AVERAGE_DISPLAY_RATIO.lower.toFixed(1)}
          </Text>
          <Text style={styles.myRatioText}>
            나의 비율 {formatRatio(ratio.upper)} : 1.00 : {formatRatio(ratio.lower)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SymmetrySection({
  imageUri,
  result,
}: {
  imageUri: string;
  result: FaceVerticalThirdsResult;
}) {
  const score = getSymmetryScore(result);

  return (
    <View style={styles.analysisSection}>
      <Text style={styles.sectionEyebrow}>얼굴 좌우 비대칭</Text>
      <Text style={styles.sectionTitle}>{getSymmetryTitle(score, result)}</Text>
      <PhotoStage imageUri={imageUri} result={result}>
        <SymmetryOverlay result={result} />
      </PhotoStage>
      <View style={styles.ratioSummary}>
        <Text style={styles.averageRatioText}>평균 대칭 95%</Text>
        <Text style={styles.myRatioText}>나의 대칭 {score}%</Text>
      </View>
    </View>
  );
}

function TerminalSection({
  onRetake,
  result,
}: {
  onRetake: () => void;
  result: FaceVerticalThirdsResult;
}) {
  return (
    <View style={styles.terminalSection}>
      <Text style={styles.sectionEyebrow}>분석 상태</Text>
      <Text style={styles.sectionTitle}>
        {result.status === 'blocked' ? '재촬영이 필요해요' : '분석 중 오류가 발생했어요'}
      </Text>
      <Text style={styles.terminalText}>
        {result.statusReason ?? '촬영 조건을 확인한 뒤 다시 시도해 주세요.'}
      </Text>
      <Pressable
        accessibilityLabel="다시 촬영"
        accessibilityRole="button"
        onPress={onRetake}
        style={styles.primaryRetakeButton}>
        <Text style={styles.primaryRetakeButtonText}>다시 촬영</Text>
      </Pressable>
    </View>
  );
}

function ArtifactFooter({result}: {result: FaceVerticalThirdsResult}) {
  return (
    <View style={styles.artifactFooter}>
      {result.quality.warnings.includes('hairline_approximated_mediapipe') ? (
        <Text style={styles.warningText}>이마 기준선은 근사값이에요.</Text>
      ) : null}
      {result.artifacts.logJsonlUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.logJsonlUri}
        </Text>
      ) : null}
      {result.artifacts.resultJsonUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.resultJsonUri}
        </Text>
      ) : null}
      {result.artifacts.overlayImageUri ? (
        <Text selectable style={styles.artifactPathText}>
          {result.artifacts.overlayImageUri}
        </Text>
      ) : null}
    </View>
  );
}

export function FaceVerticalThirdsScreen({
  capture,
  debug = false,
  onRetake,
}: FaceVerticalThirdsScreenProps) {
  const insets = useSafeAreaInsets();
  const overlayRef = useRef<View>(null);
  const overlayCaptureStartedRef = useRef(false);
  const fallbackCaptureId = useMemo(
    () => `face-ratio-${Date.now()}`,
    [capture.imageUri],
  );
  const captureId =
    capture.captureId ?? capture.photoCaptureId ?? capture.mediaId ?? fallbackCaptureId;
  const [result, setResult] = useState<FaceVerticalThirdsResult | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [stageLaidOut, setStageLaidOut] = useState(false);
  const imageUri = getStageSourceUri(result, capture.imageUri);

  useEffect(() => {
    let isMounted = true;

    overlayCaptureStartedRef.current = false;
    setResult(null);
    setStageLaidOut(false);

    void analyzeFaceVerticalThirds({
      captureId,
      createdAt: capture.capturedAt ?? new Date().toISOString(),
      imageUri: capture.imageUri,
      sessionId: captureId,
    }).then(nextResult => {
      if (isMounted) {
        setResult(nextResult);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [capture.capturedAt, capture.imageUri, captureId]);

  useEffect(() => {
    setImageLoaded(false);
  }, [imageUri]);

  useEffect(() => {
    if (
      !isSuccessResult(result) ||
      !imageLoaded ||
      !stageLaidOut ||
      !overlayRef.current ||
      overlayCaptureStartedRef.current
    ) {
      return;
    }

    let isMounted = true;
    const captureTimer = setTimeout(() => {
      overlayCaptureStartedRef.current = true;

      void captureRef(overlayRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      })
        .then(tmpUri => finalizeOverlayArtifact(result, tmpUri))
        .then(nextResult => {
          if (isMounted) {
            setResult(nextResult);
          }
        })
        .catch(error => {
          console.info('[aura:face-ratio]', 'overlay:failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(captureTimer);
    };
  }, [imageLoaded, result, stageLaidOut]);

  if (!result) {
    return <LoadingReport onRetake={onRetake} />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + spacing.xxl,
            paddingTop: insets.top + spacing.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <ReportHeader onRetake={onRetake} result={result} />
        {isSuccessResult(result) ? (
          <>
            <FaceLengthGauge result={result} />
            <View style={styles.sectionDivider} />
            <VerticalRatioSection
              debug={debug}
              imageUri={imageUri}
              onImageLoad={() => setImageLoaded(true)}
              onLayout={() => setStageLaidOut(true)}
              overlayRef={overlayRef}
              result={result}
            />
            <View style={styles.sectionDivider} />
            <SymmetrySection imageUri={imageUri} result={result} />
            <ArtifactFooter result={result} />
          </>
        ) : (
          <TerminalSection onRetake={onRetake} result={result} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  analysisSection: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 54,
  },
  artifactFooter: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  artifactPathText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  averageRatioText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  content: {
    backgroundColor: colors.background,
  },
  gaugeAverageValue: {
    left: '47%',
  },
  gaugeLabel: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  gaugeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    width: '100%',
  },
  gaugeMarker: {
    alignItems: 'center',
    bottom: 20,
    marginLeft: -23,
    position: 'absolute',
    width: 46,
    zIndex: 2,
  },
  gaugeMarkerPin: {
    backgroundColor: REPORT_MARKER,
    borderRadius: 8,
    height: 28,
    marginTop: -4,
    transform: [{rotate: '45deg'}],
    width: 28,
  },
  gaugeMarkerText: {
    backgroundColor: REPORT_MARKER,
    borderRadius: radius.pill,
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  gaugeSegment: {
    flex: 1,
    height: 12,
  },
  gaugeSegmentAverage: {
    backgroundColor: '#52C6E9',
  },
  gaugeSegmentLong: {
    backgroundColor: '#16AFE2',
    borderBottomRightRadius: radius.pill,
    borderTopRightRadius: radius.pill,
  },
  gaugeSegmentWide: {
    backgroundColor: '#9ADDF2',
    borderBottomLeftRadius: radius.pill,
    borderTopLeftRadius: radius.pill,
  },
  gaugeTrack: {
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  gaugeValue: {
    bottom: 34,
    position: 'absolute',
  },
  gaugeValueText: {
    color: REPORT_MARKER,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  gaugeWideValue: {
    left: '28%',
  },
  gaugeWrap: {
    marginTop: 50,
    width: '78%',
  },
  headerSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  lengthSection: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 64,
    paddingBottom: 72,
  },
  loadingContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  loadingTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  myRatioText: {
    color: REPORT_ACCENT,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  photoStage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    overflow: 'hidden',
    width: '100%',
  },
  photoStageWrap: {
    alignSelf: 'center',
    width: '64%',
  },
  primaryRetakeButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  primaryRetakeButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  ratioSummary: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  reportSubtitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  reportTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 42,
    lineHeight: 52,
    textAlign: 'center',
  },
  reportWarning: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingTop: spacing.sm,
    textAlign: 'center',
  },
  retakeButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  retakeButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionDivider: {
    backgroundColor: REPORT_DIVIDER,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  sectionEyebrow: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  terminalSection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 80,
  },
  terminalText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  warningText: {
    color: REPORT_MUTED,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
});
