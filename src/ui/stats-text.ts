import {
  finishedMatches,
  matchesPlayed,
  type Result,
  type Results,
  type TeamStats,
} from '../game/stats';

/**
 * How the Stats screen words and formats your team's stats (#91). Plain
 * functions with no DOM, so they're tested in Node; `stats-screen.ts` puts
 * them on screen.
 */

/** Shown where there's no number yet, such as points per match before the first finished match. */
export const NO_NUMBER = '–';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Joined the league · Nov 2026" from a `YYYY-MM-DD` day, or null for a team with no join date. */
export function joinedText(joined: string | null): string | null {
  if (joined === null) return null;
  const [year, month] = joined.split('-');
  const name = MONTHS[Number(month) - 1];
  return name && year ? `Joined the league · ${name} ${year}` : null;
}

/** The record as wins–losses–ties. A forfeit is a loss (#88). */
export function recordText(results: Results): string {
  const lost = results.lost + results.forfeited;
  return `${String(results.won)}–${String(lost)}–${String(results.tied)}`;
}

/** "Including 1 forfeit", or null when there are none. */
export function forfeitText(results: Results): string | null {
  const n = results.forfeited;
  if (n === 0) return null;
  return `Including ${String(n)} ${n === 1 ? 'forfeit' : 'forfeits'}`;
}

/** Every match played, forfeits included. */
export function matchesText(stats: TeamStats): string {
  return String(matchesPlayed(stats.results));
}

/** Points per finished match, to one decimal place. Forfeits don't count (#88). */
export function pointsPerMatchText(stats: TeamStats): string {
  const finished = finishedMatches(stats.results);
  return finished === 0 ? NO_NUMBER : (stats.points / finished).toFixed(1);
}

/** The best score in a finished match. */
export function bestText(stats: TeamStats): string {
  return stats.best === null ? NO_NUMBER : String(stats.best);
}

/** A result's letter in the match log. */
export const RESULT_LETTER: Readonly<Record<Result, string>> = {
  won: 'W',
  lost: 'L',
  tied: 'T',
  forfeited: 'F',
};

/** A result in words, for screen readers. */
export const RESULT_WORD: Readonly<Record<Result, string>> = {
  won: 'Won',
  lost: 'Lost',
  tied: 'Tied',
  forfeited: 'Forfeited',
};

/** A score, yours first: "47–38". */
export function scoreText(score: { readonly yours: number; readonly theirs: number }): string {
  return `${String(score.yours)}–${String(score.theirs)}`;
}
