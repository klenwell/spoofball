import { DEFAULT_COURT, courtRadius, type Court } from './court';
import { MAX_SPOOF_RADIUS } from './spoof-types';

/**
 * The arena: the court plus a bench for each team, curving around it like
 * the prototype's arena mockup. The visitor's bench is above the court and
 * the home team's (the player's) below. All values are in court units.
 */

export type BenchSide = 'home' | 'visitor';

export const SEATS_PER_BENCH = 5;
/** Room for the largest spoof. */
export const SEAT_RADIUS = MAX_SPOOF_RADIUS + 1;
/** Distance from the court's center to each seat's center: just outside the court's edge. */
export function benchRadius(court: Court = DEFAULT_COURT): number {
  return courtRadius(court) + 15 + SEAT_RADIUS;
}
/** Today's bench radius, 190. */
export const BENCH_RADIUS = benchRadius(DEFAULT_COURT);
/** Angle between neighboring seats on today's court, as in the prototype (seatRotationDegrees). */
export const SEAT_SPACING_DEGREES = 17;

/**
 * Angle between neighboring seats on a court: the same distance apart as on
 * today's court, so seats on a smaller court (#51) don't squeeze together.
 */
export function seatSpacing(court: Court = DEFAULT_COURT): number {
  const apart = 2 * BENCH_RADIUS * Math.sin((SEAT_SPACING_DEGREES * Math.PI) / 360);
  return 2 * Math.asin(apart / (2 * benchRadius(court)));
}
/** Half the bench's thickness: the seat plus a margin. */
export const BENCH_HALF_WIDTH = SEAT_RADIUS + 6;

export interface Seat {
  side: BenchSide;
  index: number;
  x: number;
  y: number;
}

/** Angle (radians, y down) of a bench's middle: below the court for home, above for the visitor. */
function benchCenterAngle(side: BenchSide): number {
  return side === 'home' ? Math.PI / 2 : -Math.PI / 2;
}

/** The angular span of a bench's seats, as [start, end] in radians. */
export function benchArc(side: BenchSide, court: Court = DEFAULT_COURT): [number, number] {
  const half = ((SEATS_PER_BENCH - 1) / 2) * seatSpacing(court);
  const center = benchCenterAngle(side);
  return [center - half, center + half];
}

/** A bench's seats, left to right as the player sees them. */
export function benchSeats(side: BenchSide, court: Court = DEFAULT_COURT): Seat[] {
  const [start, end] = benchArc(side, court);
  const step = (end - start) / (SEATS_PER_BENCH - 1);
  const r = benchRadius(court);
  const seats = Array.from({ length: SEATS_PER_BENCH }, (_, i) => {
    const angle = start + step * i;
    return { side, index: i, x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
  return seats.sort((a, b) => a.x - b.x).map((seat, index) => ({ ...seat, index }));
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The smallest box holding the court and both benches, including the benches' rounded ends. */
export function arenaBounds(court: Court = DEFAULT_COURT): Bounds {
  const seats = [...benchSeats('home', court), ...benchSeats('visitor', court)];
  const edge = courtRadius(court);
  const reach = BENCH_HALF_WIDTH;
  const xs = seats.flatMap((s) => [s.x - reach, s.x + reach]);
  const ys = seats.flatMap((s) => [s.y - reach, s.y + reach]);
  return {
    minX: Math.min(-edge, ...xs),
    maxX: Math.max(edge, ...xs),
    minY: Math.min(-edge, ...ys),
    maxY: Math.max(edge, ...ys),
  };
}
