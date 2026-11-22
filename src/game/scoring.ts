import { DEFAULT_COURT, zoneAt, zoneMultiplier, type Court } from './court';
import type { ScrumFrame, SpoofFrame } from './scrum';

/**
 * Scoring (#38), following the prototype (`lib/minrook/scorekeeper.py`).
 *
 * A scrum scores a snapshot of where the spoofs end up. Each spoof scores
 * every point of court it covers: the zone's multiplier (apron ×0, mosh ×1,
 * crush ×3) times **how many teammates cover the same point, itself
 * included**. So where 2 teammates overlap each scores ×2 there (4× for the
 * team), and 3 overlapping score ×3 each (9×). Opponents don't change it. A
 * spoof's points are that sum × 0.002, rounded, and a team's score is the sum
 * of its spoofs'. A scrum is usually 5–30 points a team.
 */

/** What each unit of court area is worth: the prototype's `SCORING_COEFFICIENT`. */
export const SCORING_COEFFICIENT = 0.002;

/**
 * The live scoreboard's grid spacing, in court units. The final score walks
 * every whole-number point; the live estimate only these, each standing for
 * a 4 × 4 patch. (The prototype used 12, and one spoof a frame; see
 * `liveScores`.)
 */
export const LIVE_GRID_SPACING = 4;

function covers(spoof: SpoofFrame, x: number, y: number): boolean {
  const dx = x - spoof.x;
  const dy = y - spoof.y;
  return dx * dx + dy * dy <= spoof.radius * spoof.radius;
}

/** A point's worth to a spoof covering it: zone × teammates covering it (itself included). */
export function pointValue(
  spoof: SpoofFrame,
  others: readonly SpoofFrame[],
  x: number,
  y: number,
  court: Court = DEFAULT_COURT,
): number {
  const zone = zoneMultiplier[zoneAt(x, y, court)];
  if (zone === 0) return 0;
  let team = 0;
  for (const other of others) {
    if (other.team === spoof.team && covers(other, x, y)) team += 1;
  }
  return zone * team;
}

/**
 * Walks the points of a grid with this spacing (aligned to the court's
 * center) that fall inside a spoof, adding up their value.
 */
function sumOver(
  spoof: SpoofFrame,
  spoofs: readonly SpoofFrame[],
  spacing: number,
  court: Court,
): number {
  const minX = Math.ceil((spoof.x - spoof.radius) / spacing) * spacing;
  const minY = Math.ceil((spoof.y - spoof.radius) / spacing) * spacing;
  let total = 0;
  for (let y = minY; y <= spoof.y + spoof.radius; y += spacing) {
    for (let x = minX; x <= spoof.x + spoof.radius; x += spacing) {
      if (covers(spoof, x, y)) total += pointValue(spoof, spoofs, x, y, court);
    }
  }
  return total * spacing * spacing;
}

/** A spoof's exact points from where everyone is: every whole-number point it covers. */
export function exactScore(
  spoof: SpoofFrame,
  spoofs: readonly SpoofFrame[],
  court: Court = DEFAULT_COURT,
): number {
  return Math.round(sumOver(spoof, spoofs, 1, court) * SCORING_COEFFICIENT);
}

/** A cheaper estimate of the same, on the live scoreboard's coarse grid. */
export function estimatedScore(
  spoof: SpoofFrame,
  spoofs: readonly SpoofFrame[],
  court: Court = DEFAULT_COURT,
): number {
  return Math.round(sumOver(spoof, spoofs, LIVE_GRID_SPACING, court) * SCORING_COEFFICIENT);
}

export interface Scores {
  /** Points by spoof id. */
  readonly spoofs: Readonly<Record<string, number>>;
  /** Points by team: the sum of its spoofs'. */
  readonly teams: Readonly<Record<string, number>>;
}

function teamTotals(
  frame: ScrumFrame,
  spoofScores: Record<string, number>,
): Record<string, number> {
  const teams: Record<string, number> = {};
  for (const s of frame.spoofs) teams[s.team] = (teams[s.team] ?? 0) + (spoofScores[s.id] ?? 0);
  return teams;
}

/** The scrum's result: exact points from the last frame. */
export function finalScores(frame: ScrumFrame, court: Court = DEFAULT_COURT): Scores {
  const spoofs: Record<string, number> = {};
  for (const s of frame.spoofs) spoofs[s.id] = exactScore(s, frame.spoofs, court);
  return { spoofs, teams: teamTotals(frame, spoofs) };
}

/**
 * The live scoreboard for every frame: every spoof estimated on the 4-unit
 * grid. The prototype estimated one spoof a frame, in turn, on a 12-unit grid,
 * to save server time; its estimates were up to 6 frames stale, and a team's
 * live score could end 8 points off the final one, so the scoreboard jumped
 * at the whistle. This ends within about 2 points of `finalScores`, which is
 * the score that counts, for about 6 ms of work a scrum (#49).
 */
export function liveScores(frames: readonly ScrumFrame[], court: Court = DEFAULT_COURT): Scores[] {
  const latest: Record<string, number> = {};
  const result: Scores[] = [];
  frames.forEach((frame) => {
    for (const s of frame.spoofs) latest[s.id] = estimatedScore(s, frame.spoofs, court);
    const spoofs = { ...latest };
    result.push({ spoofs, teams: teamTotals(frame, spoofs) });
  });
  return result;
}
