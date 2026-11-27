import type { Kit } from '../design/kits';
import { palette } from '../design/tokens';
import { courtRadius } from '../game/court';
import type { MarkName } from '../game/spoof-types';
import { FRAMES_PER_SCRUM, SCRUM_SECONDS } from '../game/spoof-motion';
import { WARM_UP_CELL, type WarmUp } from '../game/warm-up';
import { backingSize } from './canvas';
import { drawSpoofDisc } from './spoof-disc';

/**
 * A spoof warming up in its own small round cell: the combine's (#71), and
 * since #108 the Pharm roster's. Shared, so a spoof moves the same in both.
 */

/** Warm-ups step at a match's frame rate. */
export const WARM_UP_FRAMES_PER_SECOND = FRAMES_PER_SCRUM / SCRUM_SECONDS;
/** The most frames a warm-up catches up in one animation frame, after a stall. */
export const WARM_UP_MAX_CATCH_UP = 4;

/** Sizes a canvas to `css` pixels square, sharp on this screen, and gives its context. */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  css: number,
): CanvasRenderingContext2D | null {
  const size = backingSize(css, css, window.devicePixelRatio);
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  canvas.style.width = `${String(css)}px`;
  canvas.style.height = `${String(css)}px`;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(size.scale, 0, 0, size.scale, 0, 0);
  return ctx;
}

/** Draws a warm-up's cell, `size` pixels square: its white court, and the spoof wearing `mark`. */
export function drawWarmUpCell(
  ctx: CanvasRenderingContext2D,
  size: number,
  warmUp: WarmUp,
  mark: MarkName,
  kit: Kit,
): void {
  const scale = size / (2 * courtRadius(WARM_UP_CELL) + 4);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  ctx.arc(0, 0, courtRadius(WARM_UP_CELL) * scale, 0, Math.PI * 2);
  ctx.fillStyle = palette.mosh;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = palette.courtEdge;
  ctx.stroke();
  ctx.restore();
  drawSpoofDisc(ctx, {
    x: size / 2 + warmUp.position.x * scale,
    y: size / 2 + warmUp.position.y * scale,
    radius: warmUp.spoof.radius * scale,
    mark,
    kit,
  });
}
