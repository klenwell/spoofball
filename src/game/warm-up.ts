import { APRON_WIDTH, courtRadius, type Court } from './court';
import { createRandom, type Random } from './random';
import {
  burstSpeed,
  keepOnCourt,
  limitSpeed,
  move,
  skid,
  steerToward,
  thoughtProbability,
} from './spoof-motion';
import type { Spoof } from './teams';
import { distance, length, ZERO, type Vec } from './vec';

/**
 * A combine warm-up (#72): one spoof alone in a small round cell, wandering.
 * It moves by the match's own rules (`spoof-motion.ts`): it thinks as often
 * as its iq lets it, dashes at its burst speed toward a spot it picks, skids
 * on arrival as its grace allows, and bounces off the cell's edge. So a quick
 * spoof looks quick, a dim one dawdles, and a clumsy one skids wide, with no
 * numbers shown. It doesn't tire or grow: those show in matches and drills.
 *
 * A warm-up runs at the match's frame rate, for as long as the combine is
 * open. Each one has its own random source, from the pool's seed and the
 * candidate, so it's the same every time the combine opens.
 */

/**
 * The cell's radius, in court units: 60, so the biggest spoof (24) still has
 * room to move, and spoofs draw large enough in a phone's small cells to show
 * their marks. A match court is 130.
 */
export const WARM_UP_CELL_RADIUS = 60;

/** The cell as a court, for `keepOnCourt`: only its radius matters, since a cell has no zones. */
export const WARM_UP_CELL: Court = { moshRadius: WARM_UP_CELL_RADIUS - APRON_WIDTH };

export interface WarmUp {
  readonly spoof: Spoof;
  readonly position: Vec;
  readonly velocity: Vec;
  /** Where it's heading, or null when it's coasting after a skid. */
  readonly goal: Vec | null;
  readonly random: Random;
}

/** A whole-number seed for a candidate's warm-up, from the pool's seed and its index. */
export function warmUpSeed(poolSeed: number, index: number): number {
  return (Math.imul(poolSeed ^ 0x5bd1e995, 31) + index * 0x9e3779b1) >>> 0;
}

/** A warm-up starting at rest in the middle of the cell. */
export function startWarmUp(spoof: Spoof, seed: number): WarmUp {
  return { spoof, position: ZERO, velocity: ZERO, goal: null, random: createRandom(seed) };
}

/** A random spot in the cell that the whole spoof fits inside. */
function spotInCell(random: Random, radius: number): Vec {
  const room = Math.max(0, courtRadius(WARM_UP_CELL) - radius);
  // The square root spreads spots evenly over the disc, not bunched in the middle.
  const r = room * Math.sqrt(random.next());
  const a = random.uniform(0, Math.PI * 2);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** One frame of a warm-up. */
export function stepWarmUp(warmUp: WarmUp): WarmUp {
  const { spoof, random } = warmUp;
  const { skills, radius } = spoof;
  let { position, velocity, goal } = warmUp;

  if (random.chance(thoughtProbability(skills, 0))) {
    goal = spotInCell(random, radius);
    velocity = steerToward(position, goal, burstSpeed(skills));
  }
  if (goal && distance(position, goal) <= length(velocity)) {
    // Arriving: it reaches the spot, then skids on as its grace allows.
    position = goal;
    velocity = skid(velocity, skills, random);
    goal = null;
  } else {
    position = move(position, limitSpeed(velocity));
  }
  const kept = keepOnCourt(position, velocity, radius, WARM_UP_CELL);
  return { ...warmUp, position: kept.position, velocity: kept.velocity, goal };
}
