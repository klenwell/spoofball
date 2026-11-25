import type { DiscColors } from '../design/kits';
import { marks, type MarkShape } from '../design/marks';
import { palette } from '../design/tokens';
import type { MarkName } from '../game/spoof-types';

/**
 * Draws a spoof as a disc: filled and trimmed per its kit, with its
 * mark. The Match epic reuses this to animate spoofs, so it takes plain
 * values and a canvas context, and keeps no state.
 */

export interface SpoofDisc {
  x: number;
  y: number;
  /** Disc radius in CSS pixels. Grows and shrinks during a scrum. */
  radius: number;
  /** The mark on the disc (#74): its type's default, or one you chose. */
  mark: MarkName;
  kit: DiscColors;
  /** 0 (fresh) to 100 (spent). The disc fades as it tires. */
  fatigue?: number;
  highlighted?: boolean;
  /** How strongly the highlight ring shows, 0 to 1: 1 unless it's fading out (#76). */
  highlightOpacity?: number;
  /**
   * The highlight ring's color: the dark highlight unless given one. A
   * colored ring is drawn on a white track, as the mise's countdown ring is,
   * so it keeps its contrast on any ground (#76).
   */
  highlightColor?: string;
}

/** A spent spoof stays this visible, so it never vanishes from the court. */
export const MIN_FATIGUE_OPACITY = 0.3;

/**
 * The fatigue at which a spoof is at its most see-through: 70, the owner's
 * pick on #59 (2026-11-22). Spoofs typically carry 20–30 fatigue into a
 * mise; at 70 that's 80% to 70% opaque, where at 100 (before #59) they
 * barely faded.
 */
export const FADED_AT_FATIGUE = 70;

/**
 * Opacity for a fatigue level: from 1 (fresh) down to MIN_FATIGUE_OPACITY at
 * `FADED_AT_FATIGUE` and beyond.
 */
export function fatigueOpacity(fatigue: number): number {
  const level = Math.min(1, Math.max(0, fatigue) / FADED_AT_FATIGUE);
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
    case 'line':
    case 'cut': {
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

/** Room around a disc for its highlight ring, as a fraction of the radius. */
const LAYER_PADDING = 0.45;

let scratch: HTMLCanvasElement | null = null;

/** Draws the disc body (fill, trim, mark) centered on (0, 0), at full opacity. */
function drawBody(
  ctx: CanvasRenderingContext2D,
  radius: number,
  mark: MarkName,
  kit: DiscColors,
): void {
  const trim = trimWidth(radius);
  const inner = radius - trim;

  // Disc: flat, with no shadow (the owner's choice on #30). The fill stops
  // where the trim starts, so the two never overlap.
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = kit.trim;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.fillStyle = kit.fill;
  ctx.fill();

  // Mark.
  ctx.fillStyle = kit.mark;
  ctx.strokeStyle = kit.mark;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const shape of marks[mark]) {
    // A cut is drawn in the disc's fill, as a gap through the mark.
    ctx.strokeStyle = shape.kind === 'cut' ? kit.fill : kit.mark;
    traceShape(ctx, shape, radius);
  }
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
  mark: MarkName,
  kit: DiscColors,
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
  // Clear the whole canvas, not just the part this disc uses: when the copy
  // below is smoothed, the browser samples a pixel or two past its edge, and
  // anything left there by a bigger disc earlier showed as thin lines (#49).
  layer.clearRect(0, 0, scratch.width, scratch.height);
  layer.setTransform(scale, 0, 0, scale, size / 2, size / 2);
  drawBody(layer, radius, mark, kit);

  // Centered exactly on the disc: the layer is `size` device pixels across.
  const across = size / scale;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(scratch, 0, 0, size, size, -across / 2, -across / 2, across, across);
  ctx.restore();
}

export function drawSpoofDisc(ctx: CanvasRenderingContext2D, disc: SpoofDisc): void {
  const { x, y, radius, mark, kit } = disc;
  const opacity = fatigueOpacity(disc.fatigue ?? 0);

  ctx.save();
  ctx.translate(x, y);

  if (opacity < 1) drawFadedBody(ctx, radius, mark, kit, opacity);
  else drawBody(ctx, radius, mark, kit);

  // Highlight: a dark ring just outside the disc, never faded by fatigue.
  if (disc.highlighted) {
    ctx.globalAlpha = Math.min(1, Math.max(0, disc.highlightOpacity ?? 1));
    const ringRadius = radius + Math.max(2, radius * 0.18);
    const width = Math.max(1.5, radius * 0.1);
    if (disc.highlightColor) {
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.lineWidth = width + 2;
      ctx.strokeStyle = palette.white;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = disc.highlightColor ?? palette.highlight;
    ctx.stroke();
  }

  ctx.restore();
}
