import type {ReactNode} from 'react';
import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Button, View, XStack} from 'tamagui';

import {colors, iconSize, spacing} from '../theme';

export const FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE = iconSize.xl + spacing.xxl;

type FullscreenOverlayScreenProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'camera' | 'surface';
};

export function FullscreenOverlayScreen({
  children,
  style,
  variant = 'camera',
}: FullscreenOverlayScreenProps) {
  return (
    <View
      style={[
        styles.screen,
        variant === 'surface' ? styles.surfaceScreen : undefined,
        style,
      ]}>
      {children}
    </View>
  );
}

type CameraUtilityButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function CameraUtilityButton({
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  size = FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE,
  style,
}: CameraUtilityButtonProps) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={12}
      onPress={onPress}
      pressStyle={{scale: 0.96}}
      style={[
        styles.cameraUtilityButton,
        {
          height: size,
          opacity: disabled ? 0.46 : 1,
          width: size,
        },
        style,
      ]}
      unstyled>
      {children}
    </Button>
  );
}

type CameraCaptureControlRowProps = {
  bottom: number;
  centerSlot: ReactNode;
  horizontalPadding?: number;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  sideSlotSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function CameraCaptureControlRow({
  bottom,
  centerSlot,
  horizontalPadding = spacing.xxl + spacing.sm,
  leftSlot,
  rightSlot,
  sideSlotSize = FULLSCREEN_OVERLAY_CONTROL_BUTTON_SIZE,
  style,
}: CameraCaptureControlRowProps) {
  const sideStyle = {width: sideSlotSize};

  return (
    <XStack
      style={[
        styles.cameraControlRow,
        {
          bottom,
          paddingHorizontal: horizontalPadding,
        },
        style,
      ]}>
      <View style={[styles.cameraControlSide, sideStyle]}>{leftSlot}</View>
      <View style={styles.cameraControlCenter}>{centerSlot}</View>
      <View style={[styles.cameraControlSide, sideStyle]}>{rightSlot}</View>
    </XStack>
  );
}

const styles = StyleSheet.create({
  cameraControlCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraControlRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  cameraControlSide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraUtilityButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
    overflow: 'hidden',
  },
  surfaceScreen: {
    backgroundColor: colors.background,
  },
});
