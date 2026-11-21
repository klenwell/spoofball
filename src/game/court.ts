/**
 * The court, in **court units**, not pixels: a circle of radius 150 centered
 * on (0, 0), with y pointing down.
 *
 * Every position, size and (later) speed in the game is in court units:
 * zones here, seats in arena.ts, spoof radii in spoof-types.ts. Only drawing
 * converts to pixels. `fitArena` (ui/arena-view.ts) picks a scale for the
 * canvas size, and `createCanvas` (ui/canvas.ts) multiplies by the screen's
 * pixel ratio, so the arena scales cleanly to any screen and stays crisp.
 * The game logic never knows the screen size.
 *
 * The numbers match the prototype (court.py, and MatchMosh in match.js),
 * where 1 unit was 1 pixel on a 300 px court, so its tuning carries over.
 */

export const COURT_RADIUS = 150;
/** The mosh, the large white circle. Everything outside it is apron. */
export const MOSH_RADIUS = 100;
/** The crush, the red center spot. The prototype's "gooch" (court.py). */
export const CRUSH_RADIUS = 25;

export type Zone = 'crush' | 'mosh' | 'apron' | 'off';

/** Score multiplier for each zone. The apron scores nothing. */
export const zoneMultiplier: Record<Zone, number> = {
  crush: 3,
  mosh: 1,
  apron: 0,
  off: 0,
};

/** The zone a point falls in. A point on a boundary belongs to the inner zone. */
export function zoneAt(x: number, y: number): Zone {
  const distance = Math.hypot(x, y);
  if (distance <= CRUSH_RADIUS) return 'crush';
  if (distance <= MOSH_RADIUS) return 'mosh';
  if (distance <= COURT_RADIUS) return 'apron';
  return 'off';
}

/**
 * Whether a whole disc is on the court. Spoofs in play always are: the
 * prototype bounced any disc that crossed the edge back inside
 * (`enforce_boundaries` in court.py). Only while placing (the mise) can a
 * spoof be partly off the court.
 */
export function isOnCourt(x: number, y: number, radius: number): boolean {
  return Math.hypot(x, y) + radius <= COURT_RADIUS;
}
