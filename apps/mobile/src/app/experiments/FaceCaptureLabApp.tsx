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
import {colors, iconSize, spacing, typography} from '../../shared/theme';

type LabCapture = FaceCaptureUploadResult & {
  capturedAt: string;
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

function FaceCapturePreview({
  capture,
  onRetake,
}: {
  capture: LabCapture;
  onRetake: () => void;
}) {
  const insets = useSafeAreaInsets();

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
      onCapture={result => {
        if (result) {
          setCapture(result as LabCapture);
        }
      }}
      onClose={() => undefined}
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
