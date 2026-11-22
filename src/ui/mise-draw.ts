import { palette } from '../design/tokens';
import type { Court } from '../game/court';
import type { Vec } from '../game/vec';
import type { ArenaView } from './arena-view';

/**
 * What the mise draws over the arena while you place a spoof (#39): the halo
 * on a spot it may go, the dashed ring on one it may not, the red line
 * stressed when it would use your one spot inside, and the ring that fills
 * through the grace period. Thin canvas code; the rules are in mise-hand.ts.
 */

const toPx = (view: ArenaView, at: Vec) => ({
  x: view.cx + at.x * view.scale,
  y: view.cy + at.y * view.scale,
});

/** Gap between a spoof's edge and a ring around it, in court units. */
const RING_GAP = 4;

/** A green halo: this spot is allowed. Drawn on a white edge, so it reads on the red crush too. */
export function drawPlacingHalo(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  at: Vec,
  radius: number,
): void {
  const p = toPx(view, at);
  const r = (radius + RING_GAP) * view.scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = palette.white;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.placeOk;
  ctx.stroke();
  ctx.restore();
}

/** A dashed dark ring: this spot isn't allowed, and letting go sends the spoof back. */
export function drawRefusedRing(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  at: Vec,
  radius: number,
): void {
  const p = toPx(view, at);
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, (radius + RING_GAP) * view.scale, 0, Math.PI * 2);
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.highlight;
  ctx.stroke();
  ctx.restore();
}

/** The red line drawn heavier: the spoof would use your one spot inside it. */
export function drawInsideLine(ctx: CanvasRenderingContext2D, view: ArenaView, court: Court): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(view.cx, view.cy, court.moshRadius * view.scale, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = palette.moshLine;
  ctx.stroke();
  ctx.restore();
}

/**
 * The grace ring around a placed spoof: a faint track, filled clockwise from
 * the top as `progress` goes from 0 to 1. When it's full, the spoof locks.
 */
export function drawGraceRing(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  at: Vec,
  radius: number,
  progress: number,
): void {
  const p = toPx(view, at);
  const r = (radius + RING_GAP) * view.scale;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = palette.white;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.strokeStyle = palette.highlight;
  ctx.stroke();
  ctx.restore();
}
