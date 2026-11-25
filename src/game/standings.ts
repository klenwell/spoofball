import type { Results, TeamStats } from './stats';

/**
 * League standings (#93): your team among the league's, by win percentage.
 *
 * League teams only ever play you, so each one's record is its own, from its
 * matches with you: your loss (a forfeit included) is its win (the owner,
 * #93). Your team's record is your overall record, forfeits as losses.
 *
 * The order follows results, never the league's own order (weakest first),
 * so teams you haven't played give nothing away (#75).
 */

/** A standings record: forfeits are already counted as losses. */
export interface Record3 {
  readonly won: number;
  readonly lost: number;
  readonly tied: number;
}

export interface StandingsRow {
  readonly name: string;
  readonly logo: string;
  /** True for your team's row, shown in bold. */
  readonly yours: boolean;
  readonly record: Record3;
  /** Wins ÷ (wins + losses), ties ignored (the owner, #93); null when there's nothing to divide. */
  readonly pct: number | null;
  /** Matches played, ties included. */
  readonly played: number;
}

/** A team as the standings name it. */
export interface StandingsTeam {
  readonly name: string;
  readonly logo: string;
}

/** Wins ÷ (wins + losses): ties are ignored. Null with no wins or losses. */
export function winPct(record: Record3): number | null {
  const decided = record.won + record.lost;
  return decided === 0 ? null : record.won / decided;
}

/** Your record, with forfeits as losses. */
function yourRecord(results: Results): Record3 {
  return { won: results.won, lost: results.lost + results.forfeited, tied: results.tied };
}

/** A league team's own record from your results against it: your losses and forfeits are its wins. */
function theirRecord(against: Results | undefined): Record3 {
  if (!against) return { won: 0, lost: 0, tied: 0 };
  return { won: against.lost + against.forfeited, lost: against.won, tied: against.tied };
}

function row(team: StandingsTeam, record: Record3, yours: boolean): StandingsRow {
  return {
    name: team.name,
    logo: team.logo,
    yours,
    record,
    pct: winPct(record),
    played: record.won + record.lost + record.tied,
  };
}

/** Rows with a percentage come before rows without one. */
function band(r: StandingsRow): number {
  return r.pct === null ? 1 : 0;
}

/**
 * The standings, best first: by win percentage, then more matches played,
 * then name. Teams without a percentage come after every team with one: by
 * matches played too, so teams with only ties come before teams with no
 * matches, which come last, by name.
 */
export function leagueStandings(
  stats: TeamStats,
  yourTeam: StandingsTeam,
  league: readonly StandingsTeam[],
): StandingsRow[] {
  const rows = [
    row(yourTeam, yourRecord(stats.results), true),
    ...league.map((team) => row(team, theirRecord(stats.opponents[team.name]), false)),
  ];
  // Sorting is stable and your row is first, so a team you named like a
  // league team, with the same record, lists yours first.
  return rows.sort(
    (a, b) =>
      band(a) - band(b) ||
      (b.pct ?? 0) - (a.pct ?? 0) ||
      b.played - a.played ||
      a.name.localeCompare(b.name, 'en'),
  );
}
