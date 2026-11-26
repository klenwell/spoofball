import {
  finishedMatches,
  matchesPlayed,
  type Result,
  type Results,
  type SpoofTotals,
  type TeamStats,
} from '../game/stats';
import type { Record3 } from '../game/standings';
import type { RecordProblem, RecordResult } from '../storage/saved-team';

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

/** A spoof's line on the Stats tab (#92), each value as shown. */
export interface SpoofLineText {
  readonly matches: string;
  readonly scrums: string;
  readonly points: string;
  readonly pointsPerScrum: string;
  readonly plusMinusPerScrum: string;
}

/**
 * A spoof's line from its totals, or from none for a spoof that hasn't
 * played yet. Counts show 0, but averages show no number, with nothing to
 * divide by. Averages are to one decimal place.
 */
export function spoofLineText(totals: SpoofTotals | undefined): SpoofLineText {
  const scrums = totals?.scrums ?? 0;
  return {
    matches: String(totals?.matches ?? 0),
    scrums: String(scrums),
    points: String(totals?.points ?? 0),
    pointsPerScrum: totals && scrums > 0 ? (totals.points / scrums).toFixed(1) : NO_NUMBER,
    plusMinusPerScrum: totals && scrums > 0 ? signed(totals.plusMinus / scrums) : NO_NUMBER,
  };
}

/** A number to one decimal place with its sign: "+1.9", "−1.0" (a true minus sign), or "0.0". */
export function signed(value: number): string {
  const tenths = Math.round(value * 10);
  if (tenths === 0) return '0.0';
  const text = (Math.abs(tenths) / 10).toFixed(1);
  return tenths > 0 ? `+${text}` : `−${text}`;
}

/** A win percentage baseball-style, to three places: ".667", "1.000", ".000"; no number when there's none. */
export function pctText(pct: number | null): string {
  if (pct === null) return NO_NUMBER;
  const text = pct.toFixed(3);
  return text.startsWith('0') ? text.slice(1) : text;
}

/** A record as wins–losses–ties, for the standings, where forfeits are already losses. */
export function standingsRecordText(record: Record3): string {
  return `${String(record.won)}–${String(record.lost)}–${String(record.tied)}`;
}

/** Why a finished match wasn't recorded, for its scorecard (#94): it never claims it was. */
const NOT_RECORDED_TEXT: Readonly<Record<RecordProblem, string>> = {
  none: "Your team isn't saved in this browser any more, so this match wasn't recorded.",
  unavailable: "This browser isn't saving data for the game, so this match wasn't recorded.",
  unreadable: "Your team's stats couldn't be read, so this match wasn't recorded.",
  newer:
    "Your team was saved by a newer version of the game, so this match wasn't recorded. Reload to get the latest version.",
  full: "The browser's storage is full, so this match wasn't recorded.",
  invalid: "This match couldn't be recorded.",
};

/**
 * What the scorecard says about recording the match (#94): "Recorded.
 * Record 4–2–1", forfeits as losses, or why it wasn't.
 */
export function recordedText(result: RecordResult): {
  readonly recorded: boolean;
  readonly text: string;
} {
  return result.ok
    ? { recorded: true, text: `Recorded. Record ${recordText(result.stats.results)}` }
    : { recorded: false, text: NOT_RECORDED_TEXT[result.problem] };
}

/**
 * When a match was played, for the match log (#95): "Nov 25, 2:41 pm" in
 * local time, as the owner chose. A match logged before times were saved
 * shows its day only: "Nov 25".
 */
export function playedText(date: string, time?: string): string {
  const [, month, day] = date.split('-');
  const name = MONTHS[Number(month) - 1];
  const shownDay = name && day ? `${name} ${String(Number(day))}` : date;
  if (time === undefined) return shownDay;
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${shownDay}, ${String(hour)}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
}
