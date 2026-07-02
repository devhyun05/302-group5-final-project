import {colors} from './colors';
import {liquidGlass} from './liquidGlass';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  liquidGlass.surface.backgroundColor,
  colors.liquidGlassSurface,
  'liquid glass surface uses shared translucent color',
);
expectEqual(
  liquidGlass.control.borderColor,
  colors.liquidGlassBorder,
  'liquid glass control uses shared translucent border',
);
