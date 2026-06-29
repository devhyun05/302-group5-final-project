import {ChevronLeft, X, type LucideProps} from 'lucide-react-native';

import {colors, iconSize} from '../theme';

type IconProps = LucideProps & {
  filled?: boolean;
};

const defaultStrokeWidth = 2;

export const LINE_ICON_LIBRARY_NAMES = {
  ChevronLeftIcon: 'ChevronLeft',
  XIcon: 'X',
} as const;

export function ChevronLeftIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <ChevronLeft
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}

export function XIcon({
  color = colors.textPrimary,
  size = iconSize.sm,
  strokeWidth = defaultStrokeWidth,
  ...props
}: IconProps) {
  return (
    <X
      color={color}
      pointerEvents="none"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
