import type { BenchSide } from './arena';
import type { MatchRecord, Outcome } from './match';
import { emptyStats, type BehaviorStats } from './scrum';

/**
 * Your team's stats (#89): running totals over every match it plays, and a
 * log of its latest matches. Plain data, saved with the team by
 * `src/storage/`, and worked out here without touching the browser.
 *
 * Outcomes only (Decision 7): no skills, comps or pawn subtypes. Each spoof's
 * behavior stats are summed for later, but no screen shows them (design
 * notes, Stats).
 *
 * Averages (points per match, points per scrum, +/− per scrum) aren't saved:
 * they're worked out from these totals when shown.
 */

/** Your team plays home in every match (Decision 4), so its side of a match record is home. */
const YOURS: BenchSide = 'home';
const THEIRS: BenchSide = 'visitor';

/** How many matches the log keeps (the owner, #88). Older ones still count in the totals. */
export const LOG_LENGTH = 20;

/** A match's result for your team. A forfeit (#90) is a loss you walked away from. */
export type Result = Outcome | 'forfeited';

/** Wins, losses, ties and forfeits. */
export interface Results {
  readonly won: number;
  readonly lost: number;
  readonly tied: number;
  /** Matches left unfinished (#90). They count as losses in a record. */
  readonly forfeited: number;
}

/** A spoof's totals over every match it was on the team for. */
export interface SpoofTotals {
  /** Matches it played at least one scrum in. */
  readonly matches: number;
  readonly scrums: number;
  readonly points: number;
  /** For each scrum it played, its team's points minus the opponent's, summed. */
  readonly plusMinus: number;
  /** Summed over its scrums. Saved for later, never shown. */
  readonly behavior: BehaviorStats;
}

/** One match in the log. */
export interface LoggedMatch {
  /** The day it was played, as `YYYY-MM-DD`. */
  readonly date: string;
  /** The local time it was played, as `HH:MM` (#95). Missing for a match logged before it. */
  readonly time?: string;
  readonly opponent: { readonly name: string; readonly logo: string };
  readonly result: Result;
  /** The final score, or the score so far for a forfeit. */
  readonly score: { readonly yours: number; readonly theirs: number };
  readonly scoreByScrum: { readonly yours: readonly number[]; readonly theirs: readonly number[] };
  /** Your spoofs, with their names as they were that day, and their points by scrum (null: sat out). */
  readonly spoofs: readonly {
    readonly id: string;
    readonly name: string;
    readonly pointsByScrum: readonly (number | null)[];
  }[];
}

export interface TeamStats {
  /** The day the team was created, as `YYYY-MM-DD`, or null for a team saved before #89. */
  readonly joined: string | null;
  readonly results: Results;
  /** Points scored in finished matches. Forfeits don't count (#88). */
  readonly points: number;
  /** The highest score in a finished match, or null before the first. */
  readonly best: number | null;
  /** Your record against each opponent, by its name. */
  readonly opponents: Readonly<Record<string, Results>>;
  /** Each spoof's totals, by its id, so a renamed spoof keeps its line. */
  readonly spoofs: Readonly<Record<string, SpoofTotals>>;
  /** The latest matches, newest first, at most `LOG_LENGTH`. */
  readonly log: readonly LoggedMatch[];
}

export function noResults(): Results {
  return { won: 0, lost: 0, tied: 0, forfeited: 0 };
}

/** A new team's stats: no matches yet. */
export function emptyTeamStats(joined: string | null): TeamStats {
  return {
    joined,
    results: noResults(),
    points: 0,
    best: null,
    opponents: {},
    spoofs: {},
    log: [],
  };
}

/** Matches finished, not forfeited: the ones points per match and best score count. */
export function finishedMatches(results: Results): number {
  return results.won + results.lost + results.tied;
}

/** Every match played, forfeits included. */
export function matchesPlayed(results: Results): number {
  return finishedMatches(results) + results.forfeited;
}

function withResult(results: Results, result: Result): Results {
  return { ...results, [result]: results[result] + 1 };
}

function addBehavior(a: BehaviorStats, b: BehaviorStats): BehaviorStats {
  const sum = emptyStats();
  for (const key of Object.keys(sum) as (keyof BehaviorStats)[]) sum[key] = a[key] + b[key];
  return sum;
}

/**
 * The stats with one more match added: a finished one, or with `forfeit`, one
 * left unfinished (#90), whose record holds the scrums played so far. The log
 * keeps the newest `LOG_LENGTH` matches.
 */
export function addMatch(
  stats: TeamStats,
  record: MatchRecord,
  date: string,
  { forfeit = false, time }: { forfeit?: boolean; time?: string } = {},
): TeamStats {
  const result: Result = forfeit ? 'forfeited' : record.result;
  const opponent = record.teams[THEIRS];
  const byScrum = record.scoreByScrum;
  const yours = record.score[YOURS];

  const spoofs = { ...stats.spoofs };
  for (const line of record.spoofs) {
    if (line.team !== YOURS || line.scrumsPlayed === 0) continue;
    let plusMinus = 0;
    line.pointsByScrum.forEach((points, i) => {
      if (points !== null) plusMinus += (byScrum[YOURS][i] ?? 0) - (byScrum[THEIRS][i] ?? 0);
    });
    const before = spoofs[line.id] ?? {
      matches: 0,
      scrums: 0,
      points: 0,
      plusMinus: 0,
      behavior: emptyStats(),
    };
    spoofs[line.id] = {
      matches: before.matches + 1,
      scrums: before.scrums + line.scrumsPlayed,
      points: before.points + line.points,
      plusMinus: before.plusMinus + plusMinus,
      behavior: addBehavior(before.behavior, line.stats),
    };
  }

  const logged: LoggedMatch = {
    date,
    ...(time === undefined ? {} : { time }),
    opponent: { name: opponent, logo: record.logos[THEIRS] },
    result,
    score: { yours, theirs: record.score[THEIRS] },
    scoreByScrum: { yours: byScrum[YOURS], theirs: byScrum[THEIRS] },
    spoofs: record.spoofs
      .filter((s) => s.team === YOURS)
      .map((s) => ({ id: s.id, name: s.name, pointsByScrum: s.pointsByScrum })),
  };

  return {
    joined: stats.joined,
    results: withResult(stats.results, result),
    points: forfeit ? stats.points : stats.points + yours,
    best: forfeit || (stats.best !== null && stats.best >= yours) ? stats.best : yours,
    opponents: {
      ...stats.opponents,
      [opponent]: withResult(stats.opponents[opponent] ?? noResults(), result),
    },
    spoofs,
    log: [logged, ...stats.log].slice(0, LOG_LENGTH),
  };
}
