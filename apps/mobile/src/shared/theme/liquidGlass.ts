import {colors} from './colors';

const glassShadow = {
  elevation: 4,
  shadowColor: colors.black,
  shadowOffset: {width: 0, height: 10},
  shadowOpacity: 0.08,
  shadowRadius: 24,
} as const;

export const liquidGlass = {
  control: {
    ...glassShadow,
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderWidth: 1,
  },
  navigation: {
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderWidth: 1,
  },
  panel: {
    ...glassShadow,
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderWidth: 1,
  },
  primaryControl: {
    ...glassShadow,
    backgroundColor: 'rgba(17, 17, 17, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1,
  },
  surface: {
    ...glassShadow,
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderWidth: 1,
  },
} as const;
