import {
  hexToHsv,
  hexToRgb,
  hsToPos,
  hsvToHex,
  hsvToRgb,
  posToHS,
  rgbToHsv,
} from '../src/composer/color';

describe('hsvToHex / hexToHsv round-trip', () => {
  // 대표 색: 순색 6종 + 흑/백/회색(무채색) + 임의색.
  const cases = [
    '#ff0000', // red   H=0
    '#ffff00', // yellow H=1/6
    '#00ff00', // green  H=1/3
    '#00ffff', // cyan   H=1/2
    '#0000ff', // blue   H=2/3
    '#ff00ff', // magenta H=5/6
    '#000000', // black  V=0
    '#ffffff', // white  S=0,V=1
    '#808080', // gray   S=0
    '#3a7bd5',
    '#c0ffee',
    '#123456',
  ];

  test.each(cases)('hex→hsv→hex is idempotent for %s', hex => {
    const {h, s, v} = hexToHsv(hex);
    expect(hsvToHex(h, s, v)).toBe(hex);
  });
});

describe('hue boundaries', () => {
  test('H=0 and H=1 both map to red (wrap)', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(1, 1, 1)).toBe('#ff0000');
  });

  test('primary/secondary hues land on pure colors', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000');
    expect(hsvToHex(1 / 6, 1, 1)).toBe('#ffff00');
    expect(hsvToHex(2 / 6, 1, 1)).toBe('#00ff00');
    expect(hsvToHex(3 / 6, 1, 1)).toBe('#00ffff');
    expect(hsvToHex(4 / 6, 1, 1)).toBe('#0000ff');
    expect(hsvToHex(5 / 6, 1, 1)).toBe('#ff00ff');
  });
});

describe('achromatic (S=0) and value clamp', () => {
  test('S=0 gives gray regardless of hue', () => {
    expect(hsvToHex(0.3, 0, 0.5)).toBe('#808080');
    expect(hsvToHex(0.7, 0, 1)).toBe('#ffffff');
    expect(hsvToHex(0.9, 0, 0)).toBe('#000000');
  });

  test('white and black round-trip to S=0', () => {
    expect(hexToHsv('#ffffff').s).toBe(0);
    expect(hexToHsv('#000000').s).toBe(0);
    expect(hexToHsv('#000000').v).toBe(0);
    expect(hexToHsv('#ffffff').v).toBe(1);
  });

  test('out-of-range V/S are clamped', () => {
    expect(hsvToHex(0, 1, 2)).toBe('#ff0000');
    expect(hsvToHex(0, -1, 1)).toBe('#ffffff'); // S<0 → 0 → white
    expect(hsvToHex(0, 2, -1)).toBe('#000000'); // V<0 → 0 → black
  });
});

describe('hex parsing', () => {
  test('short #rgb expands', () => {
    expect(hexToRgb('#f00')).toEqual({r: 255, g: 0, b: 0});
    expect(hexToRgb('#fff')).toEqual({r: 255, g: 255, b: 255});
  });

  test('accepts missing leading #', () => {
    expect(hexToRgb('00ff00')).toEqual({r: 0, g: 255, b: 0});
  });

  test('invalid falls back to black', () => {
    expect(hexToRgb('nope')).toEqual({r: 0, g: 0, b: 0});
    expect(hexToRgb('#12')).toEqual({r: 0, g: 0, b: 0});
  });
});

describe('rgb<->hsv sanity', () => {
  test('rgbToHsv/hsvToRgb round-trip on pure red', () => {
    const hsv = rgbToHsv(255, 0, 0);
    expect(hsv).toEqual({h: 0, s: 1, v: 1});
    expect(hsvToRgb(hsv.h, hsv.s, hsv.v)).toEqual({r: 255, g: 0, b: 0});
  });
});

describe('color-wheel coordinate inversion (posToHS)', () => {
  const R = 120; // radius

  // 이미지 규약: 각도 atan2(dy,dx), dy 아래 양수. H=0 오른쪽=빨강.
  test('right (dx>0,dy=0) → H=0 (red)', () => {
    const {h, s} = posToHS(R, 0, R);
    expect(h).toBeCloseTo(0, 5);
    expect(s).toBeCloseTo(1, 5);
  });

  test('bottom (dy>0) → H=1/4', () => {
    expect(posToHS(0, R, R).h).toBeCloseTo(0.25, 5);
  });

  test('left (dx<0) → H=1/2 (cyan side)', () => {
    expect(posToHS(-R, 0, R).h).toBeCloseTo(0.5, 5);
  });

  test('top (dy<0) → H=3/4 (blue/purple side)', () => {
    expect(posToHS(0, -R, R).h).toBeCloseTo(0.75, 5);
  });

  test('center → S=0', () => {
    expect(posToHS(0, 0, R).s).toBeCloseTo(0, 5);
  });

  test('radius = saturation, clamped to 1 outside circle', () => {
    expect(posToHS(R / 2, 0, R).s).toBeCloseTo(0.5, 5);
    expect(posToHS(R * 2, 0, R).s).toBe(1); // 원 밖 클램프
  });
});

describe('hsToPos is the inverse of posToHS', () => {
  const R = 100;
  const samples = [
    {h: 0, s: 1},
    {h: 0.25, s: 0.5},
    {h: 0.5, s: 0.8},
    {h: 0.75, s: 0.3},
    {h: 0.9, s: 1},
  ];
  test.each(samples)('round-trips %o', ({h, s}) => {
    const {x, y} = hsToPos(h, s, R);
    const back = posToHS(x, y, R);
    expect(back.h).toBeCloseTo(h, 5);
    expect(back.s).toBeCloseTo(s, 5);
  });
});
