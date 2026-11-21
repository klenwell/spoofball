import type { Kit } from '../design/kits';
import { marks, type MarkShape } from '../design/marks';
import { palette } from '../design/tokens';
import { avatarOf, type SpoofType } from '../game/spoof-types';

/**
 * Draws a spoof as a disc: filled and trimmed per its kit, with its type's
 * mark. The Match epic reuses this to animate spoofs, so it takes plain
 * values and a canvas context, and keeps no state.
 */

export interface SpoofDisc {
  x: number;
  y: number;
  /** Disc radius in CSS pixels. Grows and shrinks during a scrum. */
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

/** Room around a disc for its shadow and highlight ring, as a fraction of the radius. */
const LAYER_PADDING = 0.45;

let scratch: HTMLCanvasElement | null = null;

/** Draws the disc body (fill, trim, shadow, mark) centered on (0, 0), at full opacity. */
function drawBody(ctx: CanvasRenderingContext2D, radius: number, type: SpoofType, kit: Kit): void {
  const trim = trimWidth(radius);
  const inner = radius - trim;

  // Disc, with a light shadow to lift it off the white court. The fill stops
  // where the trim starts, so the two never overlap.
  ctx.save();
  ctx.shadowColor = 'rgb(0 0 0 / 35%)';
  ctx.shadowBlur = Math.max(1.5, radius * 0.15);
  ctx.shadowOffsetY = Math.max(0.5, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = kit.trim;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.fillStyle = kit.fill;
  ctx.fill();

  // Mark.
  ctx.fillStyle = kit.mark;
  ctx.strokeStyle = kit.mark;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const shape of marks[avatarOf(type)]) traceShape(ctx, shape, radius);
}

/**
 * Draws the body faded as one image. Fading each shape separately would make
 * overlaps (a club's lobes, the queen's spokes and dot) show through as
 * brighter seams, so the body is drawn at full opacity on a scratch canvas
 * first, then copied with the fade applied once.
 */
function drawFadedBody(
  ctx: CanvasRenderingContext2D,
  radius: number,
  type: SpoofType,
  kit: Kit,
  opacity: number,
): void {
  const transform = ctx.getTransform();
  const scale = Math.hypot(transform.a, transform.b) || 1;
  const half = radius * (1 + LAYER_PADDING);
  const size = Math.ceil(half * 2 * scale);

  scratch ??= document.createElement('canvas');
  if (scratch.width < size || scratch.height < size) {
    scratch.width = size;
    scratch.height = size;
  }
  const layer = scratch.getContext('2d');
  if (!layer) throw new Error('Canvas 2D is not supported');
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.clearRect(0, 0, size, size);
  layer.setTransform(scale, 0, 0, scale, size / 2, size / 2);
  drawBody(layer, radius, type, kit);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(scratch, 0, 0, size, size, -half, -half, size / scale, size / scale);
  ctx.restore();
}

export function drawSpoofDisc(ctx: CanvasRenderingContext2D, disc: SpoofDisc): void {
  const { x, y, radius, type, kit } = disc;
  const opacity = fatigueOpacity(disc.fatigue ?? 0);

  ctx.save();
  ctx.translate(x, y);

  if (opacity < 1) drawFadedBody(ctx, radius, type, kit, opacity);
  else drawBody(ctx, radius, type, kit);

  // Highlight: a dark ring just outside the disc, never faded.
  if (disc.highlighted) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + Math.max(2, radius * 0.18), 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, radius * 0.1);
    ctx.strokeStyle = palette.highlight;
    ctx.stroke();
  }

  ctx.restore();
}
