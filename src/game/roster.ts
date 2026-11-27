import { spoofProblems, type Spoof } from './teams';

/**
 * The Pharm's state for your saved team (#105, #106): its prospects, which
 * are its draft picks. Plain data, saved beside the team and its stats. The
 * rules that change it (drawing prospects after a loss, and drafting one)
 * are #107's.
 *
 * The owner's rule (#105, 2026-11-27): a draft pick is a prospect. Each loss
 * (not a forfeit) brings one, and a team holds at most 3; at 3, another loss
 * replaces the oldest. A team can draft only with 3, and drafting cleans the
 * slate: the one chosen joins the team, the others go, and it's back to 0.
 */

/** The most prospects (draft picks) a team holds, and how many it needs to draft one. */
export const PROSPECTS = 3;

export interface Roster {
  /**
   * Where the team's prospects come from: each prospect is drawn from this
   * seed and `prospectsDrawn`, so the same team draws the same prospects.
   */
  readonly seed: number;
  /** How many prospects the team has ever drawn: a new one's number, for its id and seed. */
  readonly prospectsDrawn: number;
  /**
   * The prospects not yet drafted, oldest first, so a loss at 3 replaces the
   * first (#105). From 0 to `PROSPECTS`: how many draft picks the team holds.
   */
  readonly prospects: readonly Spoof[];
}

/** A new team's Pharm: no prospects, so no draft picks. */
export function emptyRoster(seed: number): Roster {
  return { seed, prospectsDrawn: 0, prospects: [] };
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
