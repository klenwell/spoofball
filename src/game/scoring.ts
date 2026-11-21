import { zoneAt, zoneMultiplier } from './court';
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
 * The live scoreboard's grid spacing, in court units (the prototype's 12).
 * The final score walks every whole-number point; the live estimate only
 * these, each standing for a 12 × 12 patch.
 */
export const LIVE_GRID_SPACING = 12;

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
): number {
  const zone = zoneMultiplier[zoneAt(x, y)];
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
function sumOver(spoof: SpoofFrame, spoofs: readonly SpoofFrame[], spacing: number): number {
  const minX = Math.ceil((spoof.x - spoof.radius) / spacing) * spacing;
  const minY = Math.ceil((spoof.y - spoof.radius) / spacing) * spacing;
  let total = 0;
  for (let y = minY; y <= spoof.y + spoof.radius; y += spacing) {
    for (let x = minX; x <= spoof.x + spoof.radius; x += spacing) {
      if (covers(spoof, x, y)) total += pointValue(spoof, spoofs, x, y);
    }
  }
  return total * spacing * spacing;
}

/** A spoof's exact points from where everyone is: every whole-number point it covers. */
export function exactScore(spoof: SpoofFrame, spoofs: readonly SpoofFrame[]): number {
  return Math.round(sumOver(spoof, spoofs, 1) * SCORING_COEFFICIENT);
}

/** A cheaper estimate of the same, on the live scoreboard's coarse grid. */
export function estimatedScore(spoof: SpoofFrame, spoofs: readonly SpoofFrame[]): number {
  return Math.round(sumOver(spoof, spoofs, LIVE_GRID_SPACING) * SCORING_COEFFICIENT);
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
export function finalScores(frame: ScrumFrame): Scores {
  const spoofs: Record<string, number> = {};
  for (const s of frame.spoofs) spoofs[s.id] = exactScore(s, frame.spoofs);
  return { spoofs, teams: teamTotals(frame, spoofs) };
}

/**
 * The live scoreboard for every frame, as in the prototype: each frame
 * re-estimates one spoof, in turn, and keeps every other spoof's latest
 * estimate. The final frame's live total can differ slightly from
 * `finalScores`, which is the score that counts.
 */
export function liveScores(frames: readonly ScrumFrame[]): Scores[] {
  const latest: Record<string, number> = {};
  const result: Scores[] = [];
  frames.forEach((frame, i) => {
    const turn = frame.spoofs[i % Math.max(1, frame.spoofs.length)];
    if (turn) latest[turn.id] = estimatedScore(turn, frame.spoofs);
    const spoofs = { ...latest };
    result.push({ spoofs, teams: teamTotals(frame, spoofs) });
  });
  return result;
}
