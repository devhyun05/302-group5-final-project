import {
  angleDeg,
  distance,
  midpoint,
  normalizedAsymmetry,
  polygonArea,
  polygonPerimeter,
  robustMean,
  rotateAround,
} from './faceProfileMath';

const assert = {
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(actual)} to deeply equal ${JSON.stringify(expected)}`,
      );
    }
  },
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) {
      throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
    }
  },
  ok(value: unknown, message = 'Expected value to be truthy') {
    if (!value) {
      throw new Error(message);
    }
  },
};

const assertCloseTo = (actual: number, expected: number, epsilon: number) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );

assertCloseTo(distance({x: 0, y: 0}, {x: 3, y: 4}), 5, 1e-9);
assert.deepEqual(midpoint({x: 2, y: 6}, {x: 4, y: 10}), {x: 3, y: 8});
assertCloseTo(angleDeg({x: 1, y: 1}, {x: 2, y: 2}), 45, 1e-9);

const rotated = rotateAround({x: 2, y: 1}, {x: 1, y: 1}, 90);
assertCloseTo(rotated.x, 1, 1e-9);
assertCloseTo(rotated.y, 2, 1e-9);

const rectangle = [
  {x: 0, y: 0},
  {x: 4, y: 0},
  {x: 4, y: 3},
  {x: 0, y: 3},
];
assertCloseTo(polygonPerimeter(rectangle), 14, 1e-9);
assertCloseTo(polygonArea(rectangle), 12, 1e-9);
assertCloseTo(robustMean([1, 1, 2, 2, 100]) ?? Number.NaN, 1.5, 1e-9);
assert.equal(robustMean([]), null);
assertCloseTo(normalizedAsymmetry(0.3, 0.3), 0, 1e-9);
assertCloseTo(normalizedAsymmetry(0.2, 0.3), 1 / 3, 1e-9);
assertCloseTo(normalizedAsymmetry(0, 0), 0, 1e-9);

console.log('faceProfileMath tests passed');
