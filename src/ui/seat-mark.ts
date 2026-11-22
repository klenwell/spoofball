import { palette } from '../design/tokens';
import { MIN_SPOOF_RADIUS } from '../game/spoof-types';

/**
 * The mark in the middle of every bench seat (#59): a small dark crosshatch
 * the spoof sits on. A fresh spoof hides it; the more tired a spoof, the more
 * see-through it is, and the more plainly the mark shows through. So it's a
 * gauge to read a spoof's fatigue against, without changing the spoof. A
 * pattern rather than a shape, so it shows how see-through a spoof is, and
 * not a dot, which is the pawn's mark.
 */

/** The mark's radius, in court units: well inside the smallest spoof, so every fresh spoof hides it. */
export const SEAT_MARK_RADIUS = MIN_SPOOF_RADIUS * 0.6;
/** The gap between the crosshatch's lines, in court units. */
export const SEAT_MARK_SPACING = 3;
/** The lines' width, in court units. */
export const SEAT_MARK_LINE = 1;

export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The crosshatch's lines, centered on (0, 0): diagonals both ways, `spacing`
 * apart, each cut off at the circle of `radius`.
 */
export function crosshatch(
  radius: number = SEAT_MARK_RADIUS,
  spacing: number = SEAT_MARK_SPACING,
): Segment[] {
  const segments: Segment[] = [];
  const steps = Math.floor(radius / spacing);
  for (const slope of [1, -1]) {
    // Along the line, and across it (its normal), as unit vectors.
    const along = { x: Math.SQRT1_2, y: slope * Math.SQRT1_2 };
    const across = { x: -slope * Math.SQRT1_2, y: Math.SQRT1_2 };
    for (let k = -steps; k <= steps; k += 1) {
      const offset = k * spacing;
      const half = Math.sqrt(Math.max(0, radius * radius - offset * offset));
      if (half === 0) continue;
      const cx = across.x * offset;
      const cy = across.y * offset;
      segments.push({
        x1: cx - along.x * half,
        y1: cy - along.y * half,
        x2: cx + along.x * half,
        y2: cy + along.y * half,
      });
    }
  }
  return segments;
}

/** Draws the mark centered on a seat, in court units (the arena's transform already set). */
export function drawSeatMark(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (const s of crosshatch()) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.lineWidth = SEAT_MARK_LINE;
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.highlight;
  ctx.stroke();
  ctx.restore();
}
