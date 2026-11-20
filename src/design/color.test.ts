import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, relativeLuminance } from './color';

describe('hexToRgb', () => {
  it('parses a 6-digit hex color', () => {
    expect(hexToRgb('#4A86E8')).toEqual({ r: 74, g: 134, b: 232 });
  });

  it('accepts lowercase digits', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('rejects a shorthand or malformed color', () => {
    expect(() => hexToRgb('#fff')).toThrow('Invalid hex color: "#fff"');
    expect(() => hexToRgb('4A86E8')).toThrow('Invalid hex color');
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('is 1 for a color against itself', () => {
    expect(contrastRatio('#4A86E8', '#4A86E8')).toBe(1);
  });

  it('gives the same ratio whichever color comes first', () => {
    expect(contrastRatio('#FFFFFF', '#767676')).toBeCloseTo(contrastRatio('#767676', '#FFFFFF'));
  });

  it('matches the WCAG reference value for #767676 on white', () => {
    // #767676 is the classic lightest gray that passes 4.5:1 on white.
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});
