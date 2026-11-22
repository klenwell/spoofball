import { drawSeatMark } from './seat-mark';
import { palette } from '../design/tokens';
import {
  BENCH_HALF_WIDTH,
  benchRadius,
  SEAT_RADIUS,
  benchArc,
  benchSeats,
  type BenchSide,
} from '../game/arena';
import { CRUSH_RADIUS, DEFAULT_COURT, courtRadius, type Court } from '../game/court';
import type { ArenaView } from './arena-view';
import { drawSpoofDisc, type SpoofDisc } from './spoof-disc';

/**
 * Draws the arena: both benches and the court with its apron, mosh,
 * diagonals and crush. Positions are in court units; `view` maps them to
 * the canvas.
 */

/** Line widths in court units. */
const BENCH_EDGE_WIDTH = 1.5;
const COURT_EDGE_WIDTH = 2;

/**
 * The crush is drawn as a red ring and a red spot inside it, as in the
 * prototype (match.js). The ring's outer edge is the crush's edge,
 * CRUSH_RADIUS, where the ×3 zone ends (the owner, #22). A thin white gap
 * separates ring and spot: 1 unit, so it stays visible on a phone, where a
 * court unit draws at under a pixel.
 */
const CRUSH_RING_WIDTH = 2;
const CRUSH_GAP = 1;
const CRUSH_SPOT_RADIUS = CRUSH_RADIUS - CRUSH_RING_WIDTH - CRUSH_GAP;

function circle(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
}

function drawBench(ctx: CanvasRenderingContext2D, side: BenchSide, court: Court): void {
  const [start, end] = benchArc(side, court);
  // The band, drawn twice: a slightly wider pass in the edge color, then the
  // bench color on top, leaving a thin outline so the white band reads on the page.
  ctx.lineCap = 'round';
  for (const [width, color] of [
    [BENCH_HALF_WIDTH * 2 + BENCH_EDGE_WIDTH * 2, palette.benchEdge],
    [BENCH_HALF_WIDTH * 2, palette.bench],
  ] as const) {
    ctx.beginPath();
    ctx.arc(0, 0, benchRadius(court), start, end);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  for (const seat of benchSeats(side, court)) {
    ctx.beginPath();
    ctx.arc(seat.x, seat.y, SEAT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = palette.seat;
    ctx.fill();
    // The gauge a seated spoof's fatigue shows against (#59).
    drawSeatMark(ctx, seat.x, seat.y);
  }
}

function drawCourt(ctx: CanvasRenderingContext2D, court: Court): void {
  const edge = courtRadius(court);
  // Apron: the gray outer ring, under everything else.
  circle(ctx, edge);
  ctx.fillStyle = palette.apron;
  ctx.fill();

  // Mosh: the large white circle.
  circle(ctx, court.moshRadius);
  ctx.fillStyle = palette.mosh;
  ctx.fill();

  // Two diagonals quartering the whole court, clipped to its edge.
  ctx.save();
  circle(ctx, edge);
  ctx.clip();
  const reach = edge;
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
  circle(ctx, court.moshRadius);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.moshLine;
  ctx.stroke();

  // Crush: white inside, so the diagonals don't show in the gap, then the
  // red spot and the ring whose outer edge is the crush's edge.
  circle(ctx, CRUSH_RADIUS);
  ctx.fillStyle = palette.mosh;
  ctx.fill();
  circle(ctx, CRUSH_SPOT_RADIUS);
  ctx.fillStyle = palette.crush;
  ctx.fill();
  circle(ctx, CRUSH_RADIUS - CRUSH_RING_WIDTH / 2);
  ctx.lineWidth = CRUSH_RING_WIDTH;
  ctx.strokeStyle = palette.crush;
  ctx.stroke();

  // The court's edge, so the light apron stands out from the light page.
  circle(ctx, edge);
  ctx.lineWidth = COURT_EDGE_WIDTH;
  ctx.strokeStyle = palette.courtEdge;
  ctx.stroke();
}

export function drawArena(
  ctx: CanvasRenderingContext2D,
  view: ArenaView,
  court: Court = DEFAULT_COURT,
): void {
  ctx.save();
  ctx.translate(view.cx, view.cy);
  ctx.scale(view.scale, view.scale);
  drawBench(ctx, 'visitor', court);
  drawBench(ctx, 'home', court);
  drawCourt(ctx, court);
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
