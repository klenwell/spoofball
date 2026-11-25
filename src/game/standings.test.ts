import { describe, expect, it } from 'vitest';
import { LEAGUE } from './league';
import { leagueStandings, winPct } from './standings';
import { emptyTeamStats, noResults, type Results, type TeamStats } from './stats';

const YOURS = { name: 'Bumble Bees', logo: '🐝' };
const LEAGUE_TEAMS = [
  { name: 'Ants', logo: '🍕' },
  { name: 'Bats', logo: '🐸' },
  { name: 'Cats', logo: '🐶' },
];

/** Your stats: your overall results, and your results against each league team by name. */
function statsWith(results: Partial<Results>, opponents: Record<string, Partial<Results>> = {}) {
  const stats: TeamStats = {
    ...emptyTeamStats(null),
    results: { ...noResults(), ...results },
    opponents: Object.fromEntries(
      Object.entries(opponents).map(([name, r]) => [name, { ...noResults(), ...r }]),
    ),
  };
  return stats;
}

const names = (rows: ReturnType<typeof leagueStandings>) => rows.map((r) => r.name);

describe('winPct', () => {
  it('divides wins by wins and losses, ignoring ties', () => {
    expect(winPct({ won: 2, lost: 1, tied: 1 })).toBeCloseTo(2 / 3);
    expect(winPct({ won: 3, lost: 0, tied: 5 })).toBe(1);
    expect(winPct({ won: 0, lost: 2, tied: 0 })).toBe(0);
  });

  it('has none with no wins or losses', () => {
    expect(winPct({ won: 0, lost: 0, tied: 2 })).toBeNull();
    expect(winPct({ won: 0, lost: 0, tied: 0 })).toBeNull();
  });
});

describe('leagueStandings', () => {
  describe('the records', () => {
    it('gives a league team its own record: your losses and forfeits are its wins', () => {
      const stats = statsWith({}, { Ants: { won: 1, lost: 2, tied: 3, forfeited: 4 } });

      const ants = leagueStandings(stats, YOURS, LEAGUE_TEAMS).find((r) => r.name === 'Ants');

      expect(ants?.record).toEqual({ won: 6, lost: 1, tied: 3 });
      expect(ants?.yours).toBe(false);
    });

    it('gives your team its overall record, forfeits as losses, marked as yours', () => {
      const stats = statsWith({ won: 4, lost: 3, tied: 1, forfeited: 2 });

      const yours = leagueStandings(stats, YOURS, LEAGUE_TEAMS).find((r) => r.yours);

      expect(yours).toMatchObject({ name: 'Bumble Bees', record: { won: 4, lost: 5, tied: 1 } });
    });

    it('lists your team and every league team once', () => {
      const rows = leagueStandings(statsWith({}), YOURS, LEAGUE);

      expect(rows).toHaveLength(LEAGUE.length + 1);
      expect(new Set(names(rows)).size).toBe(LEAGUE.length + 1);
      expect(names(rows)).not.toContain('Embers');
    });
  });

  describe('the order', () => {
    it('puts the best win percentage first', () => {
      // Ants beat you 2 of 3 (.667), Bats 1 of 2 (.500), Cats 0 of 1 (.000); you're 2–3 (.400).
      const stats = statsWith(
        { won: 2, lost: 3 },
        { Ants: { won: 1, lost: 2 }, Bats: { won: 1, lost: 1 }, Cats: { won: 1 } },
      );

      expect(names(leagueStandings(stats, YOURS, LEAGUE_TEAMS))).toEqual([
        'Ants',
        'Bats',
        'Bumble Bees',
        'Cats',
      ]);
    });

    it('breaks an equal percentage by more matches played, then by name', () => {
      // Bats and Cats are both 1.000; Cats played 2 to Bats' 1. Ants and you are both .000 over 1.
      const stats = statsWith(
        { won: 0, lost: 1 },
        { Ants: { won: 1 }, Bats: { lost: 1 }, Cats: { lost: 2 } },
      );

      expect(names(leagueStandings(stats, YOURS, LEAGUE_TEAMS))).toEqual([
        'Cats',
        'Bats',
        'Ants',
        'Bumble Bees',
      ]);
    });

    it('puts a team with only ties after every team with a percentage', () => {
      const stats = statsWith(
        { won: 0, lost: 1, tied: 2 },
        { Ants: { tied: 2 }, Bats: { won: 1 } },
      );

      const rows = leagueStandings(stats, YOURS, LEAGUE_TEAMS);

      expect(names(rows)).toEqual(['Bumble Bees', 'Bats', 'Ants', 'Cats']);
      expect(rows[2]?.pct).toBeNull();
    });

    it('puts teams with no matches last, by name, whatever the league’s own order', () => {
      const rows = leagueStandings(statsWith({}), YOURS, [...LEAGUE_TEAMS].reverse());

      expect(names(rows)).toEqual(['Ants', 'Bats', 'Bumble Bees', 'Cats']);
      expect(rows.every((r) => r.played === 0 && r.pct === null)).toBe(true);
    });

    it('never follows the league’s own order (weakest first) for teams you haven’t played', () => {
      const rows = leagueStandings(statsWith({}), YOURS, LEAGUE);

      const leagueNames = LEAGUE.map((t) => t.name);
      const listed = names(rows).filter((n) => leagueNames.includes(n));
      expect(listed).toEqual([...leagueNames].sort((a, b) => a.localeCompare(b, 'en')));
      expect(listed).not.toEqual(leagueNames);
    });

    it('lists your team first beside a league team of the same name and record', () => {
      const twin = [{ name: 'Bumble Bees', logo: '🐸' }];

      const rows = leagueStandings(statsWith({}), YOURS, twin);

      expect(rows.map((r) => r.yours)).toEqual([true, false]);
    });
  });
});
