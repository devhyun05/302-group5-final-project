import type {NativeDepthSummary as GeometryNativeDepthSummary} from './faceProfileGeometry';

export type NativeDepthSummary = GeometryNativeDepthSummary;
export type NativeDepthOkSummary = Extract<NativeDepthSummary, {status: 'ok'}>;
export type NativeDepthFailureSummary = Exclude<NativeDepthSummary, {status: 'ok'}>;

export type FaceProfileTransientCaptureResult = {
  uri: string;
  width?: number;
  height?: number;
  format?: 'jpg' | 'png' | 'heic';
  nativeDepthToken?: string;
  nativeMatteToken?: string;
  trueDepth?: {
    requested: boolean;
    supported: boolean;
    captured: boolean;
    expiresInMs?: number;
    failureReason?: string;
  };
};

export type FaceProfileDepthResolution =
  | {
      kind: 'depth';
      summary: NativeDepthOkSummary;
      warnings: [];
    }
  | {
      kind: 'fallback_2d';
      summary: NativeDepthFailureSummary;
      warnings: string[];
    };

const DEPTH_STATUSES = [
  'ok',
  'unsupported',
  'not_found',
  'expired',
  'invalid_landmarks',
  'insufficient_depth',
  'error',
] as const;

type NativeDepthStatus = (typeof DEPTH_STATUSES)[number];

const OK_KEYS = [
  'cameraDistanceMeters',
  'consumed',
  'depthQuality',
  'facePlane',
  'ratios',
  'status',
] as const;

const FAILURE_KEYS = ['consumed', 'status'] as const;

const RATIO_KEYS = [
  'faceLengthToCheekWidth',
  'jawWidthToCheekWidth',
  'chinWidthToCheekWidth',
  'foreheadWidthToCheekWidth',
  'interEyeToCheekWidth',
  'noseLengthToCheekWidth',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new TypeError(`${path} has unexpected key ${key}`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new TypeError(`${path}.${key} is required`);
    }
  }
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be finite`);
  }
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  const parsed = finiteNumber(value, path);
  if (parsed <= 0) {
    throw new TypeError(`${path} must be positive`);
  }
  return parsed;
}

function boundedNumber(value: unknown, path: string): number {
  const parsed = finiteNumber(value, path);
  if (parsed < 0 || parsed > 1) {
    throw new TypeError(`${path} must be between 0 and 1`);
  }
  return parsed;
}

function parseStatus(value: unknown): NativeDepthStatus {
  if (
    typeof value !== 'string' ||
    !(DEPTH_STATUSES as readonly string[]).includes(value)
  ) {
    throw new TypeError('depth.status is invalid');
  }
  return value as NativeDepthStatus;
}

function parseConsumed(value: unknown, status: NativeDepthStatus): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError('depth.consumed must be boolean');
  }
  const mustBeConsumed =
    status === 'ok' ||
    status === 'invalid_landmarks' ||
    status === 'insufficient_depth' ||
    status === 'error';
  if (value !== mustBeConsumed) {
    throw new TypeError(`depth.consumed is invalid for status ${status}`);
  }
  return value;
}

function parseDepthQuality(value: unknown) {
  const quality = record(value, 'depth.depthQuality');
  exactKeys(
    quality,
    [
      'accuracy',
      'confidence',
      'filtered',
      'medianAbsoluteDeviationMeters',
      'validSampleRatio',
    ],
    [
      'accuracy',
      'confidence',
      'filtered',
      'medianAbsoluteDeviationMeters',
      'validSampleRatio',
    ],
    'depth.depthQuality',
  );
  if (quality.accuracy !== 'absolute' && quality.accuracy !== 'relative') {
    throw new TypeError('depth.depthQuality.accuracy is invalid');
  }
  const accuracy: 'absolute' | 'relative' = quality.accuracy;
  if (typeof quality.filtered !== 'boolean') {
    throw new TypeError('depth.depthQuality.filtered must be boolean');
  }
  const medianAbsoluteDeviationMeters = finiteNumber(
    quality.medianAbsoluteDeviationMeters,
    'depth.depthQuality.medianAbsoluteDeviationMeters',
  );
  if (medianAbsoluteDeviationMeters < 0) {
    throw new TypeError(
      'depth.depthQuality.medianAbsoluteDeviationMeters must be non-negative',
    );
  }
  return {
    accuracy,
    confidence: boundedNumber(
      quality.confidence,
      'depth.depthQuality.confidence',
    ),
    filtered: quality.filtered,
    medianAbsoluteDeviationMeters,
    validSampleRatio: boundedNumber(
      quality.validSampleRatio,
      'depth.depthQuality.validSampleRatio',
    ),
  };
}

function parseFacePlane(value: unknown) {
  const plane = record(value, 'depth.facePlane');
  exactKeys(
    plane,
    ['confidence', 'pitchDeg', 'rollDeg', 'yawDeg'],
    ['confidence', 'pitchDeg', 'rollDeg', 'yawDeg'],
    'depth.facePlane',
  );
  return {
    confidence: boundedNumber(plane.confidence, 'depth.facePlane.confidence'),
    pitchDeg: finiteNumber(plane.pitchDeg, 'depth.facePlane.pitchDeg'),
    rollDeg: finiteNumber(plane.rollDeg, 'depth.facePlane.rollDeg'),
    yawDeg: finiteNumber(plane.yawDeg, 'depth.facePlane.yawDeg'),
  };
}

function parseRatios(value: unknown) {
  const ratios = record(value, 'depth.ratios');
  exactKeys(ratios, RATIO_KEYS, RATIO_KEYS, 'depth.ratios');
  return Object.fromEntries(
    RATIO_KEYS.map(key => [key, positiveNumber(ratios[key], `depth.ratios.${key}`)]),
  ) as Record<(typeof RATIO_KEYS)[number], number>;
}

export function parseNativeDepthSummary(value: unknown): NativeDepthSummary {
  const summary = record(value, 'depth');
  const status = parseStatus(summary.status);
  const consumed = parseConsumed(summary.consumed, status);

  if (status !== 'ok') {
    exactKeys(summary, FAILURE_KEYS, FAILURE_KEYS, 'depth');
    return {consumed, status} as NativeDepthFailureSummary;
  }

  exactKeys(
    summary,
    OK_KEYS,
    ['consumed', 'depthQuality', 'facePlane', 'ratios', 'status'],
    'depth',
  );
  const depthQuality = parseDepthQuality(summary.depthQuality);
  const cameraDistanceMeters =
    summary.cameraDistanceMeters === undefined
      ? undefined
      : positiveNumber(summary.cameraDistanceMeters, 'depth.cameraDistanceMeters');
  if (depthQuality.accuracy === 'absolute' && cameraDistanceMeters === undefined) {
    throw new TypeError(
      'depth.cameraDistanceMeters is required for absolute accuracy',
    );
  }
  if (depthQuality.accuracy === 'relative' && cameraDistanceMeters !== undefined) {
    throw new TypeError(
      'depth.cameraDistanceMeters is invalid for relative accuracy',
    );
  }

  return {
    ...(cameraDistanceMeters === undefined ? {} : {cameraDistanceMeters}),
    consumed,
    depthQuality,
    facePlane: parseFacePlane(summary.facePlane),
    ratios: parseRatios(summary.ratios),
    status,
  };
}

export function resolveNativeDepthSummary(
  value: unknown,
): FaceProfileDepthResolution {
  const summary = parseNativeDepthSummary(value);
  if (summary.status === 'ok') {
    return {kind: 'depth', summary, warnings: []};
  }
  return {
    kind: 'fallback_2d',
    summary,
    warnings: [`depth_${summary.status}`],
  };
}
