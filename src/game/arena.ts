import { COURT_RADIUS } from './court';
import { MAX_SPOOF_RADIUS } from './spoof-types';

/**
 * The arena: the court plus a bench for each team, curving around it like
 * the prototype's arena mockup. The visitor's bench is above the court and
 * the home team's (the player's) below. All values are in court units.
 */

export type BenchSide = 'home' | 'visitor';

export const SEATS_PER_BENCH = 6;
/** Room for the largest spoof. */
export const SEAT_RADIUS = MAX_SPOOF_RADIUS + 1;
/** Distance from the court's center to each seat's center. */
export const BENCH_RADIUS = COURT_RADIUS + 15 + SEAT_RADIUS;
/** Angle between neighboring seats, as in the prototype (seatRotationDegrees). */
export const SEAT_SPACING_DEGREES = 17;
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
export function benchArc(side: BenchSide): [number, number] {
  const half = ((SEATS_PER_BENCH - 1) / 2) * ((SEAT_SPACING_DEGREES * Math.PI) / 180);
  const center = benchCenterAngle(side);
  return [center - half, center + half];
}

/** A bench's seats, left to right as the player sees them. */
export function benchSeats(side: BenchSide): Seat[] {
  const [start, end] = benchArc(side);
  const step = (end - start) / (SEATS_PER_BENCH - 1);
  const seats = Array.from({ length: SEATS_PER_BENCH }, (_, i) => {
    const angle = start + step * i;
    return { side, index: i, x: BENCH_RADIUS * Math.cos(angle), y: BENCH_RADIUS * Math.sin(angle) };
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
export function arenaBounds(): Bounds {
  const seats = [...benchSeats('home'), ...benchSeats('visitor')];
  const reach = BENCH_HALF_WIDTH;
  const xs = seats.flatMap((s) => [s.x - reach, s.x + reach]);
  const ys = seats.flatMap((s) => [s.y - reach, s.y + reach]);
  return {
    minX: Math.min(-COURT_RADIUS, ...xs),
    maxX: Math.max(COURT_RADIUS, ...xs),
    minY: Math.min(-COURT_RADIUS, ...ys),
    maxY: Math.max(COURT_RADIUS, ...ys),
  };
}
