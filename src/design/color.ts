/**
 * Color math for the design system, following WCAG 2.x definitions.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses a 6-digit hex color such as "#4A86E8". */
export function hexToRgb(hex: string): Rgb {
  if (!HEX_COLOR.test(hex)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Contrast ratio between two colors, from 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}
