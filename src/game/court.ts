/**
 * The court, in **court units**, not pixels: a circle centered on (0, 0),
 * with y pointing down. The game's court has a radius of 130: a mosh of 80
 * inside an apron ring 50 wide.
 *
 * Every position, size and speed in the game is in court units: zones here,
 * seats in arena.ts, spoof radii in spoof-types.ts. Only drawing converts to
 * pixels. `fitArena` (ui/arena-view.ts) picks a scale for the canvas size,
 * and `createCanvas` (ui/canvas.ts) multiplies by the screen's pixel ratio,
 * so the arena scales cleanly to any screen and stays crisp. The game logic
 * never knows the screen size.
 *
 * Units match the prototype (court.py, and MatchMosh in match.js), where 1
 * unit was 1 pixel on a 300 px court (mosh 100), so its speeds and sizes
 * carry over. The owner shrank the mosh to 80 on #51 for livelier scrums.
 *
 * **The mosh's size can change; the rest can't** (the owner, #51). The crush
 * stays at radius 25, and the apron stays a ring 50 wide, room for a
 * full-size spoof to be placed. So a court is described by its mosh radius,
 * and its radius is always the mosh's plus 50.
 */

/** The crush, the red center spot. The prototype's "gooch" (court.py). */
export const CRUSH_RADIUS = 25;
/** The apron's width: a ring around the mosh, wide enough to place a full-size spoof. */
export const APRON_WIDTH = 50;

/** A court, described by the one thing that can change: its mosh's radius. */
export interface Court {
  /** The mosh, the large white circle. Everything outside it is apron. */
  readonly moshRadius: number;
}

/** The prototype's court: mosh radius 100, court radius 150. */
export const PROTOTYPE_COURT: Court = { moshRadius: 100 };

/** The game's court: mosh radius 80, so a court radius of 130 (the owner, on #51, 2026-11-22). */
export const DEFAULT_COURT: Court = { moshRadius: 80 };

/** The game's court radius, 130. */
export const COURT_RADIUS = courtRadius(DEFAULT_COURT);
/** The game's mosh radius, 80. */
export const MOSH_RADIUS = DEFAULT_COURT.moshRadius;

/** A court's radius: its mosh plus the apron ring. */
export function courtRadius(court: Court = DEFAULT_COURT): number {
  return court.moshRadius + APRON_WIDTH;
}

/** A court with this mosh radius, refusing one too small to hold the crush. */
export function courtWithMosh(moshRadius: number): Court {
  if (!(moshRadius > CRUSH_RADIUS)) {
    throw new RangeError(
      `The mosh must be bigger than the crush (${String(CRUSH_RADIUS)}), got ${String(moshRadius)}`,
    );
  }
  return { moshRadius };
}

export type Zone = 'crush' | 'mosh' | 'apron' | 'off';

/** Score multiplier for each zone. The apron scores nothing. */
export const zoneMultiplier: Record<Zone, number> = {
  crush: 3,
  mosh: 1,
  apron: 0,
  off: 0,
};

/** The zone a point falls in. A point on a boundary belongs to the inner zone. */
export function zoneAt(x: number, y: number, court: Court = DEFAULT_COURT): Zone {
  const distance = Math.hypot(x, y);
  if (distance <= CRUSH_RADIUS) return 'crush';
  if (distance <= court.moshRadius) return 'mosh';
  if (distance <= courtRadius(court)) return 'apron';
  return 'off';
}

/**
 * Whether a whole disc is on the court. Spoofs in play always are: the
 * prototype bounced any disc that crossed the edge back inside
 * (`enforce_boundaries` in court.py). Only while placing (the mise) can a
 * spoof be partly off the court.
 */
export function isOnCourt(
  x: number,
  y: number,
  radius: number,
  court: Court = DEFAULT_COURT,
): boolean {
  return Math.hypot(x, y) + radius <= courtRadius(court);
}

/**
 * Where a spot on one court lands on another, keeping it in the same zone and
 * the same place within it (#51). The crush doesn't move, the mosh between it
 * and its edge is stretched or squeezed in proportion, and the apron ring
 * moves by however much the mosh changed. So a spoof placed on the apron
 * stays on the apron. Spots are measured on `from`, the prototype's court
 * unless given.
 */
export function fitToCourt(
  x: number,
  y: number,
  court: Court,
  from: Court = PROTOTYPE_COURT,
): { x: number; y: number } {
  const d = Math.hypot(x, y);
  if (d === 0 || d <= CRUSH_RADIUS) return { x, y };
  let fitted: number;
  if (d <= from.moshRadius) {
    fitted =
      CRUSH_RADIUS +
      ((d - CRUSH_RADIUS) * (court.moshRadius - CRUSH_RADIUS)) / (from.moshRadius - CRUSH_RADIUS);
  } else {
    fitted = d - (from.moshRadius - court.moshRadius);
  }
  return { x: (x * fitted) / d, y: (y * fitted) / d };
}
