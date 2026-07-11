export type Point2D = {
  x: number;
  y: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function distance(left: Point2D, right: Point2D): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function midpoint(left: Point2D, right: Point2D): Point2D {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

export function angleDeg(from: Point2D, to: Point2D): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function rotateAround(
  point: Point2D,
  center: Point2D,
  degrees: number,
): Point2D {
  const radians = toRadians(degrees);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const translatedX = point.x - center.x;
  const translatedY = point.y - center.y;

  return {
    x: center.x + translatedX * cosine - translatedY * sine,
    y: center.y + translatedX * sine + translatedY * cosine,
  };
}

export function polygonPerimeter(points: readonly Point2D[]): number {
  if (points.length < 2) {
    return 0;
  }

  return points.reduce((perimeter, point, index) => {
    const next = points[(index + 1) % points.length];
    return perimeter + distance(point, next);
  }, 0);
}

export function polygonArea(points: readonly Point2D[]): number {
  if (points.length < 3) {
    return 0;
  }

  const signedDoubleArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(signedDoubleArea) / 2;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export function robustMean(values: readonly number[]): number | null {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return null;
  }
  if (finiteValues.length < 3) {
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  }

  const center = median(finiteValues);
  const medianAbsoluteDeviation = median(
    finiteValues.map(value => Math.abs(value - center)),
  );
  const inliers = finiteValues.filter(value =>
    medianAbsoluteDeviation === 0
      ? value === center
      : Math.abs(value - center) <= medianAbsoluteDeviation * 3,
  );
  const usableValues = inliers.length > 0 ? inliers : finiteValues;

  return usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length;
}

export function normalizedAsymmetry(left: number, right: number): number {
  const denominator = Math.max(Math.abs(left), Math.abs(right));
  if (denominator === 0) {
    return 0;
  }
  return Math.abs(left - right) / denominator;
}
