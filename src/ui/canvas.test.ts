import { describe, expect, it } from 'vitest';
import { backingSize } from './canvas';

describe('backingSize', () => {
  it('matches the CSS size on a standard screen', () => {
    expect(backingSize(300, 200, 1)).toEqual({ width: 300, height: 200, scale: 1 });
  });

  it('stores more pixels on a high-density screen', () => {
    expect(backingSize(300, 200, 3)).toEqual({ width: 900, height: 600, scale: 3 });
  });

  it('rounds fractional pixel ratios to whole pixels', () => {
    expect(backingSize(101, 50, 1.5)).toEqual({ width: 152, height: 75, scale: 1.5 });
  });

  it('falls back to 1 for a missing or invalid ratio', () => {
    expect(backingSize(10, 10, 0).scale).toBe(1);
    expect(backingSize(10, 10, Number.NaN).scale).toBe(1);
  });
});
