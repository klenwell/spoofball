import { palette } from '../design/tokens';
import {
  BENCH_HALF_WIDTH,
  BENCH_RADIUS,
  SEAT_RADIUS,
  benchArc,
  benchSeats,
  type BenchSide,
} from '../game/arena';
import { COURT_RADIUS, CRUSH_RADIUS, MOSH_RADIUS } from '../game/court';
import type { ArenaView } from './arena-view';
import { drawSpoofDisc, type SpoofDisc } from './spoof-disc';

/**
 * Draws the arena: both benches and the court with its apron, mosh,
 * diagonals and crush. Positions are in court units; `view` maps them to
 * the canvas.
 */

function circle(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
}

function drawBench(ctx: CanvasRenderingContext2D, side: BenchSide): void {
  const [start, end] = benchArc(side);
  ctx.beginPath();
  ctx.arc(0, 0, BENCH_RADIUS, start, end);
  ctx.lineWidth = BENCH_HALF_WIDTH * 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = palette.bench;
  ctx.stroke();

  for (const seat of benchSeats(side)) {
    ctx.beginPath();
    ctx.arc(seat.x, seat.y, SEAT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = palette.seat;
    ctx.fill();
  }
}

function drawCourt(ctx: CanvasRenderingContext2D): void {
  // Apron: the gray outer ring, under everything else.
  circle(ctx, COURT_RADIUS);
  ctx.fillStyle = palette.apron;
  ctx.fill();

  // Mosh: the large white circle.
  circle(ctx, MOSH_RADIUS);
  ctx.fillStyle = palette.mosh;
  ctx.fill();

  // Two diagonals quartering the whole court, clipped to its edge.
  ctx.save();
  circle(ctx, COURT_RADIUS);
  ctx.clip();
  const reach = COURT_RADIUS;
  ctx.beginPath();
  ctx.moveTo(-reach, -reach);
  ctx.lineTo(reach, reach);
  ctx.moveTo(reach, -reach);
  ctx.lineTo(-reach, reach);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.courtLine;
  ctx.stroke();
  ctx.restore();

  // The mosh's outline.
  circle(ctx, MOSH_RADIUS);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.moshLine;
  ctx.stroke();

  // Crush: the red center spot.
  circle(ctx, CRUSH_RADIUS);
  ctx.fillStyle = palette.crush;
  ctx.fill();
}

export function drawArena(ctx: CanvasRenderingContext2D, view: ArenaView): void {
  ctx.save();
  ctx.translate(view.cx, view.cy);
  ctx.scale(view.scale, view.scale);
  drawBench(ctx, 'visitor');
  drawBench(ctx, 'home');
  drawCourt(ctx);
  ctx.restore();
}

/** Draws a spoof given in court units. */
export function drawSpoofInArena(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  spoof: SpoofDisc,
): void {
  drawSpoofDisc(ctx, {
    ...spoof,
    x: view.cx + spoof.x * view.scale,
    y: view.cy + spoof.y * view.scale,
    radius: spoof.radius * view.scale,
  });
}
