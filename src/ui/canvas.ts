/**
 * Canvas helpers. A canvas has a CSS size (how big it looks) and a backing
 * size (how many pixels it stores). On a high-density screen the backing
 * size must be larger, or drawings look blurry.
 */

export interface BackingSize {
  width: number;
  height: number;
  scale: number;
}

/** Backing pixels for a canvas of the given CSS size on a screen with this pixel ratio. */
export function backingSize(cssWidth: number, cssHeight: number, pixelRatio: number): BackingSize {
  const scale = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return {
    width: Math.round(cssWidth * scale),
    height: Math.round(cssHeight * scale),
    scale,
  };
}

/** Creates a canvas that stays crisp at `window.devicePixelRatio`. Draw in CSS pixels. */
export function createCanvas(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number = window.devicePixelRatio,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const size = backingSize(cssWidth, cssHeight, pixelRatio);
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.style.width = `${String(cssWidth)}px`;
  canvas.style.height = `${String(cssHeight)}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  ctx.scale(size.scale, size.scale);
  return { canvas, ctx };
}
