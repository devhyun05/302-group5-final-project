import React, {useCallback, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {RotateCcw} from 'lucide-react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../../tamagui.config';
import {FaceCaptureScreen} from '../../features/face-capture/screens/FaceCaptureScreen';
import {
  inferFaceCaptureContentType,
  type FaceCaptureImageInput,
  type FaceCaptureUploadResult,
} from '../../features/face-capture/services/faceCaptureUploadService';
import {
  type FaceCaptureGreenlightReport,
} from '../../features/face-capture/services/faceCaptureGreenlight';
import {
  appendGreenlightEvent,
} from '../../features/face-capture/services/faceCaptureGreenlightLogger';
import {colors, iconSize, spacing, typography} from '../../shared/theme';

type LabCapture = FaceCaptureUploadResult & {
  capturedAt: string;
  greenlightLogUri?: string;
  greenlightReport?: FaceCaptureGreenlightReport;
};

function createLabCaptureResult(imageInput: FaceCaptureImageInput): LabCapture {
  const id = `face-capture-lab-${Date.now()}`;

  return {
    bucket: 'local-face-capture-lab',
    capturedAt: new Date().toISOString(),
    contentType: imageInput.contentType ?? inferFaceCaptureContentType(imageInput.uri),
    imageUri: imageInput.uri,
    mediaId: id,
    objectKey: imageInput.uri,
    photoCaptureId: id,
    source: imageInput.source,
  };
}

function formatMetric(value: number | undefined, unit = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-';
  }

  return `${Number(value.toFixed(1))}${unit}`;
}

function FaceCapturePreview({
  capture,
  onRetake,
}: {
  capture: LabCapture;
  onRetake: () => void;
}) {
  const insets = useSafeAreaInsets();
  const report = capture.greenlightReport;

  return (
    <View style={styles.previewScreen}>
      <StatusBar style="light" />
      <Image
        resizeMode="contain"
        source={{uri: capture.imageUri}}
        style={styles.previewImage}
      />
      <View style={[styles.previewTopBar, {paddingTop: insets.top + spacing.md}]}>
        <View>
          <Text style={styles.previewTitle}>사진 확인</Text>
          <Text style={styles.previewCaption}>
            {capture.source === 'camera' ? '촬영한 사진' : '앨범 사진'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="다시 촬영"
          accessibilityRole="button"
          onPress={onRetake}
          style={styles.retakeButton}>
          <RotateCcw color={colors.white} size={iconSize.md} strokeWidth={2.2} />
          <Text style={styles.retakeButtonText}>다시 촬영</Text>
        </Pressable>
      </View>
      {report ? (
        <View style={[styles.greenlightPanel, {bottom: insets.bottom + spacing.xl}]}>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.greenlightBadge,
                report.mediaPipeAlignmentGreenlight
                  ? styles.greenlightBadgePass
                  : styles.greenlightBadgeFail,
              ]}>
              <Text style={styles.greenlightBadgeText}>
                MediaPipe 정렬 {report.mediaPipeAlignmentGreenlight ? '성공' : '실패'}
              </Text>
            </View>
            <View
              style={[
                styles.greenlightBadge,
                report.cameraStabilityGreenlight
                  ? styles.greenlightBadgePass
                  : styles.greenlightBadgeFail,
              ]}>
              <Text style={styles.greenlightBadgeText}>
                카메라 안정화 {report.cameraStabilityGreenlight ? '성공' : '실패'}
              </Text>
            </View>
          </View>
          <Text style={styles.metricText}>
            center {formatMetric(report.metrics.centerOffsetPx, 'px')} · yaw{' '}
            {formatMetric(report.metrics.yawDeg, '°')} · roll{' '}
            {formatMetric(report.metrics.rollDeg, '°')} · stable{' '}
            {formatMetric(report.metrics.cameraStableDurationMs, 'ms')}
          </Text>
          <Text style={styles.metricText}>
            lock exposure {report.nativeCameraMetadata?.exposureLocked ? 'on' : 'off'} · wb{' '}
            {report.nativeCameraMetadata?.whiteBalanceLocked ? 'on' : 'off'} · focus{' '}
            {report.nativeCameraMetadata?.focusLocked ? 'on' : 'off'}
          </Text>
          {capture.greenlightLogUri ? (
            <Text selectable style={styles.logPathText}>
              {capture.greenlightLogUri}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FaceCaptureLabContent() {
  const [capture, setCapture] = useState<LabCapture | null>(null);

  const uploadImage = useCallback(async (imageInput: FaceCaptureImageInput) => {
    return createLabCaptureResult(imageInput);
  }, []);

  if (capture) {
    return <FaceCapturePreview capture={capture} onRetake={() => setCapture(null)} />;
  }

  return (
    <FaceCaptureScreen
      onCapture={(result, greenlightReport) => {
        if (result) {
          const nextCapture = {
            ...(result as LabCapture),
            greenlightReport,
          };

          setCapture(nextCapture);

          if (greenlightReport) {
            void appendGreenlightEvent({
              imageUri: result.imageUri,
              report: greenlightReport,
            })
              .then(greenlightLogUri => {
                setCapture(current =>
                  current?.photoCaptureId === result.photoCaptureId
                    ? {...current, greenlightLogUri}
                    : current,
                );
              })
              .catch(error => {
                console.info('[aura:face-capture-greenlight] log-write:error', {
                  message: error instanceof Error ? error.message : String(error),
                });
              });
          }
        }
      }}
      onClose={() => undefined}
      requireGreenlight
      uploadImage={uploadImage}
    />
  );
}

export function FaceCaptureLabApp() {
  const [fontsLoaded] = useFonts({
    [typography.fontFamily.brand]: require('../../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <FaceCaptureLabContent />
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  previewCaption: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.xs,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewScreen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  greenlightBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  greenlightBadgeFail: {
    backgroundColor: colors.danger,
  },
  greenlightBadgePass: {
    backgroundColor: colors.guideReady,
  },
  greenlightBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  greenlightPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    gap: spacing.xs,
    left: spacing.lg,
    padding: spacing.md,
    position: 'absolute',
    right: spacing.lg,
  },
  logPathText: {
    color: 'rgba(255, 255, 255, 0.66)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  metricText: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  previewTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  previewTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  retakeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    borderColor: 'rgba(255, 255, 255, 0.38)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  retakeButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
