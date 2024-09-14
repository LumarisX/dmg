import * as math from '../math';

describe('Math', () => {
  test('abs', () => {
    expect(math.abs).toBe(Math.abs);
  });
  test('min', () => {
    expect(math.min).toBe(Math.min);
  });
  test('max', () => {
    expect(math.max).toBe(Math.max);
  });
  test('ceil', () => {
    expect(math.ceil).toBe(Math.ceil);
  });
  test('floor', () => {
    expect(math.floor).toBe(Math.floor);
  });

  test('round', () => {
    expect(math.round(2.4)).toBe(2);
    expect(math.round(2.5)).toBe(3);
    expect(math.round(2.6)).toBe(3);
  });

  test('roundDown', () => {
    expect(math.roundDown(2.4)).toBe(2);
    expect(math.roundDown(2.5)).toBe(2);
    expect(math.roundDown(2.6)).toBe(3);
  });

  test('clamp', () => {
    expect(math.clamp(-6, -8, 6)).toBe(-6);
    expect(math.clamp(-6, 0, 6)).toBe(0);
    expect(math.clamp(0, 1023, 999)).toBe(999);
  });

  test('trunc', () => {
    expect(math.trunc(65.124)).toBe(65);
    expect(math.trunc(0xffff + 1)).toBe(0xffff + 1);
    expect(math.trunc(0xffff + 1, 16)).toBe(0);
    expect(math.trunc(0xffffffff)).toBe(0xffffffff);
    expect(math.trunc(0xffffffff + 1)).toBe(0);
  });

  test('chainMod', () => {
    expect(math.chainMod(0x1000, 2732)).toBe(2732);
    expect(math.chainMod(2732, 0x800)).toBe(1366);
    expect(math.chainMod(1366, 0xc00)).toBe(1025);
    expect(math.chainMod(1025, 5324)).toBe(1332);
  });

  test('chain', () => {
    expect(math.chain(0x1000, 2732)).toBe(2732);
    expect(math.chain(2732)).toBe(2732);
  });

  test('applyMod', () => {
    expect(math.applyMod(108, 0xc00)).toBe(81);
  });

  test('apply', () => {
    expect(math.apply(108, 0xc00)).toBe(81);
    expect(math.apply(108)).toBe(108);
  });
});
