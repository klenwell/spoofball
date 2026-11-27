import { spoofProblems, type Spoof } from './teams';

/**
 * The Pharm's state for your saved team (#105, #106): its draft picks, its
 * progress toward the next one, and its prospects. Plain data, saved beside
 * the team and its stats. The rules that change it (earning picks, drawing
 * and drafting prospects) are #107's.
 *
 * The owner's decisions (#105, 2026-11-27): a team starts with 0 picks, earns
 * one at every 3rd loss (forfeits don't count), and holds at most 3. It has 3
 * prospects to choose from, and each loss replaces the oldest.
 */

/** The most draft picks a team can hold. */
export const MAX_DRAFT_PICKS = 3;

/** Losses that earn a draft pick: so a team's losses toward the next one run from 0 to 2. */
export const LOSSES_PER_PICK = 3;

/** How many prospects a team has to choose from. */
export const PROSPECTS = 3;

export interface Roster {
  /**
   * Where the team's prospects come from: each prospect is drawn from this
   * seed and `prospectsDrawn`, so the same team draws the same prospects.
   */
  readonly seed: number;
  /** Draft picks held, from 0 to `MAX_DRAFT_PICKS`. */
  readonly picks: number;
  /** Losses since the last pick was earned, from 0 to `LOSSES_PER_PICK` − 1. */
  readonly lossesTowardPick: number;
  /** How many prospects the team has ever drawn: a new one's number, for its id and seed. */
  readonly prospectsDrawn: number;
  /**
   * The prospects not yet drafted, oldest first, so a loss replaces the
   * first (#105). At most `PROSPECTS`; none until #107 draws them.
   */
  readonly prospects: readonly Spoof[];
}

/** A new team's Pharm: no picks, no progress toward one, and no prospects yet. */
export function emptyRoster(seed: number): Roster {
  return { seed, picks: 0, lossesTowardPick: 0, prospectsDrawn: 0, prospects: [] };
}

/**
 * What's wrong with a roster, if anything: an empty list for a sound one.
 * Checked after it's loaded, as a team is, so a roster in play always holds
 * possible values. Prospects are checked as spoofs, with distinct ids and
 * names (ignoring case).
 */
export function rosterProblems(roster: Roster): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(roster.seed)) problems.push('The seed must be a whole number');
  if (!isWholeUpTo(roster.picks, MAX_DRAFT_PICKS)) {
    problems.push(`Draft picks must be 0–${String(MAX_DRAFT_PICKS)}`);
  }
  if (!isWholeUpTo(roster.lossesTowardPick, LOSSES_PER_PICK - 1)) {
    problems.push(`Losses toward a pick must be 0–${String(LOSSES_PER_PICK - 1)}`);
  }
  if (!Number.isInteger(roster.prospectsDrawn) || roster.prospectsDrawn < 0) {
    problems.push('Prospects drawn must be a count');
  }
  const { prospects } = roster;
  if (prospects.length > PROSPECTS) problems.push(`At most ${String(PROSPECTS)} prospects`);
  if (prospects.length > roster.prospectsDrawn) {
    problems.push('More prospects than were ever drawn');
  }
  if (new Set(prospects.map((s) => s.id)).size !== prospects.length) {
    problems.push('Two prospects share an id');
  }
  if (new Set(prospects.map((s) => s.name.toLowerCase())).size !== prospects.length) {
    problems.push('Two prospects share a name');
  }
  for (const prospect of prospects) problems.push(...spoofProblems(prospect));
  return problems;
}

function isWholeUpTo(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}
