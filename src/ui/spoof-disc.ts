import type { Kit } from '../design/kits';
import { marks, type MarkShape } from '../design/marks';
import { palette } from '../design/tokens';
import { avatarOf, type SpoofType } from '../game/spoof-types';

/**
 * Draws a spoof as a disc: filled and trimmed per its kit, with its type's
 * mark. The Scrum epic reuses this to animate spoofs, so it takes plain
 * values and a canvas context, and keeps no state.
 */

export interface SpoofDisc {
  x: number;
  y: number;
  /** Disc radius in CSS pixels. Grows during a round. */
  radius: number;
  type: SpoofType;
  kit: Kit;
  /** 0 (fresh) to 100 (spent). The disc fades as it tires. */
  fatigue?: number;
  highlighted?: boolean;
}

/** A spent spoof stays this visible, so it never vanishes from the court. */
export const MIN_FATIGUE_OPACITY = 0.3;

/** Opacity for a fatigue level, from 1 (fresh) down to MIN_FATIGUE_OPACITY (spent). */
export function fatigueOpacity(fatigue: number): number {
  const level = Math.min(100, Math.max(0, fatigue)) / 100;
  return 1 - level * (1 - MIN_FATIGUE_OPACITY);
}

/** Width of the kit's trim ring for a disc of this radius. */
export function trimWidth(radius: number): number {
  return Math.max(1.5, radius * 0.16);
}

function traceShape(ctx: CanvasRenderingContext2D, shape: MarkShape, scale: number): void {
  ctx.beginPath();
  switch (shape.kind) {
    case 'circle':
      ctx.arc(shape.cx * scale, shape.cy * scale, shape.r * scale, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'ring':
      ctx.lineWidth = shape.width * scale;
      ctx.arc(shape.cx * scale, shape.cy * scale, shape.r * scale, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 'polygon':
    case 'line': {
      shape.points.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px * scale, py * scale);
        else ctx.lineTo(px * scale, py * scale);
      });
      if (shape.kind === 'polygon') {
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.lineWidth = shape.width * scale;
        ctx.stroke();
      }
      return;
    }
  }
}

export function drawSpoofDisc(ctx: CanvasRenderingContext2D, disc: SpoofDisc): void {
  const { x, y, radius, kit } = disc;
  const trim = trimWidth(radius);

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = fatigueOpacity(disc.fatigue ?? 0);

  // Disc, with a light shadow to lift it off the white court.
  ctx.save();
  ctx.shadowColor = 'rgb(0 0 0 / 35%)';
  ctx.shadowBlur = Math.max(1.5, radius * 0.15);
  ctx.shadowOffsetY = Math.max(0.5, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius - trim / 2, 0, Math.PI * 2);
  ctx.fillStyle = kit.fill;
  ctx.fill();
  ctx.restore();

  // Trim.
  ctx.beginPath();
  ctx.arc(0, 0, radius - trim / 2, 0, Math.PI * 2);
  ctx.lineWidth = trim;
  ctx.strokeStyle = kit.trim;
  ctx.stroke();

  // Mark.
  ctx.fillStyle = kit.mark;
  ctx.strokeStyle = kit.mark;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const shape of marks[avatarOf(disc.type)]) traceShape(ctx, shape, radius);

  // Highlight: a dark ring just outside the disc.
  if (disc.highlighted) {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius + Math.max(2, radius * 0.18), 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, radius * 0.1);
    ctx.strokeStyle = palette.highlight;
    ctx.stroke();
  }

  ctx.restore();
}
