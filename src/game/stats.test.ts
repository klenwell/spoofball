import { describe, expect, it } from 'vitest';
import { aMatchRecord, spoofLine } from '../test-support/match-record';
import { computerMatch } from '../test-support/match';
import { TEST_SEED } from '../test-support/random';
import { matchRecord } from './match';
import { EMBERS, SPOOFS } from './preset-teams';
import { emptyStats } from './scrum';
import {
  LOG_LENGTH,
  addMatch,
  emptyTeamStats,
  finishedMatches,
  matchesPlayed,
  type TeamStats,
} from './stats';

const DAY = '2026-11-25';

/** The stats after adding each record in turn, on the same day. */
function afterMatches(...records: ReturnType<typeof aMatchRecord>[]): TeamStats {
  return records.reduce((stats, record) => addMatch(stats, record, DAY), emptyTeamStats(DAY));
}

describe('emptyTeamStats', () => {
  it('starts with no matches, no points, no best score and an empty log', () => {
    const stats = emptyTeamStats(DAY);

    expect(stats).toEqual({
      joined: DAY,
      results: { won: 0, lost: 0, tied: 0, forfeited: 0 },
      points: 0,
      best: null,
      opponents: {},
      spoofs: {},
      log: [],
    });
  });
});

describe('addMatch', () => {
  describe("the team's totals", () => {
    it('counts the result', () => {
      const stats = afterMatches(
        aMatchRecord(),
        aMatchRecord({ result: 'lost' }),
        aMatchRecord({ result: 'lost' }),
        aMatchRecord({ result: 'tied' }),
      );

      expect(stats.results).toEqual({ won: 1, lost: 2, tied: 1, forfeited: 0 });
      expect(matchesPlayed(stats.results)).toBe(4);
    });

    it('adds up your points, not the opponent’s', () => {
      const stats = afterMatches(
        aMatchRecord(),
        aMatchRecord({ score: { home: 30, visitor: 40 }, result: 'lost' }),
      );

      expect(stats.points).toBe(42);
    });

    it('keeps your best score', () => {
      const scores = [12, 30, 20].map((home) =>
        aMatchRecord({ score: { home, visitor: 99 }, result: 'lost' }),
      );

      expect(afterMatches(...scores).best).toBe(30);
      expect(afterMatches(aMatchRecord({ score: { home: 0, visitor: 5 } })).best).toBe(0);
    });

    it('keeps the day the team joined', () => {
      expect(addMatch(emptyTeamStats(null), aMatchRecord(), DAY).joined).toBeNull();
      expect(addMatch(emptyTeamStats('2026-01-02'), aMatchRecord(), DAY).joined).toBe('2026-01-02');
    });

    it('leaves the stats it was given unchanged', () => {
      const before = emptyTeamStats(DAY);

      addMatch(before, aMatchRecord(), DAY);

      expect(before).toEqual(emptyTeamStats(DAY));
    });
  });

  describe('the record against each opponent', () => {
    it('counts results by the opponent’s name', () => {
      const goats = { home: 'Yours', visitor: 'Goats' };
      const stats = afterMatches(
        aMatchRecord(),
        aMatchRecord({ teams: goats, result: 'lost' }),
        aMatchRecord({ teams: goats, result: 'tied' }),
      );

      expect(stats.opponents).toEqual({
        Pawns: { won: 1, lost: 0, tied: 0, forfeited: 0 },
        Goats: { won: 0, lost: 1, tied: 1, forfeited: 0 },
      });
    });
  });

  describe("each spoof's totals", () => {
    it('counts the matches and scrums it played, and its points', () => {
      const stats = afterMatches(aMatchRecord(), aMatchRecord());

      expect(stats.spoofs.a).toMatchObject({ matches: 2, scrums: 4, points: 6 });
      expect(stats.spoofs.c).toMatchObject({ matches: 2, scrums: 6, points: 10 });
    });

    it('sums +/− over only the scrums it played: its team’s points minus the opponent’s', () => {
      // Scrums: +2 (5–3), 0 (4–4), +1 (3–2).
      const stats = afterMatches(aMatchRecord());

      expect(stats.spoofs.a?.plusMinus).toBe(3);
      expect(stats.spoofs.b?.plusMinus).toBe(2);
      expect(stats.spoofs.c?.plusMinus).toBe(3);
      expect(stats.spoofs.d?.plusMinus).toBe(1);
    });

    it('gives a negative +/− for scrums its team lost', () => {
      const stats = afterMatches(
        aMatchRecord({
          scoreByScrum: { home: [1, 0, 0], visitor: [4, 0, 0] },
          spoofs: [spoofLine('a', [1, null, null])],
        }),
      );

      expect(stats.spoofs.a?.plusMinus).toBe(-3);
    });

    it('gives no line to a spoof that sat the whole match out, until it plays', () => {
      expect(afterMatches(aMatchRecord()).spoofs.e).toBeUndefined();
    });

    it('keeps opponents’ spoofs out', () => {
      expect(Object.keys(afterMatches(aMatchRecord()).spoofs).sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('keeps a spoof’s line by its id, so a new name adds to it', () => {
      const renamed = aMatchRecord({ spoofs: [spoofLine('a', [1, 1, 1], { name: 'New name' })] });

      expect(afterMatches(aMatchRecord(), renamed).spoofs.a?.matches).toBe(2);
    });

    it('sums its behavior stats', () => {
      const dings = (n: number) =>
        aMatchRecord({ spoofs: [spoofLine('a', [1], { stats: { ...emptyStats(), dings: n } })] });

      expect(afterMatches(dings(2), dings(3)).spoofs.a?.behavior.dings).toBe(5);
    });
  });

  describe('the log', () => {
    it('logs the local time it was played, when given (#95)', () => {
      const stats = addMatch(emptyTeamStats(DAY), aMatchRecord(), DAY, { time: '14:41' });

      expect(stats.log[0]).toMatchObject({ date: DAY, time: '14:41' });
    });

    it('logs no time when none is given', () => {
      expect(addMatch(emptyTeamStats(DAY), aMatchRecord(), DAY).log[0]).not.toHaveProperty('time');
    });

    it('logs the match newest first: day, opponent, result and score', () => {
      const stats = afterMatches(aMatchRecord());
      const later = addMatch(stats, aMatchRecord({ result: 'lost' }), '2026-11-26');

      expect(later.log.map((m) => [m.date, m.result])).toEqual([
        ['2026-11-26', 'lost'],
        [DAY, 'won'],
      ]);
      expect(later.log[1]).toMatchObject({
        opponent: { name: 'Pawns', logo: '🍕' },
        score: { yours: 12, theirs: 9 },
        scoreByScrum: { yours: [5, 4, 3], theirs: [3, 4, 2] },
      });
    });

    it('logs your spoofs with their names that day and points by scrum', () => {
      const logged = afterMatches(aMatchRecord()).log[0];

      expect(logged?.spoofs.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(logged?.spoofs[0]).toEqual({ id: 'a', name: 'Spoof a', pointsByScrum: [2, null, 1] });
    });

    it(`keeps only the last ${String(LOG_LENGTH)} matches, while the totals count them all`, () => {
      const records = Array.from({ length: LOG_LENGTH + 1 }, (_, i) => aMatchRecord({ seed: i }));
      let stats = emptyTeamStats(DAY);
      records.forEach((record, i) => {
        stats = addMatch(stats, record, `2026-11-${String(i + 1).padStart(2, '0')}`);
      });

      expect(stats.log).toHaveLength(LOG_LENGTH);
      expect(stats.log[0]?.date).toBe('2026-11-21');
      expect(stats.log.at(-1)?.date).toBe('2026-11-02');
      expect(stats.results.won).toBe(LOG_LENGTH + 1);
    });
  });

  describe('when the match was forfeited (#90)', () => {
    const forfeit = (stats: TeamStats) =>
      addMatch(
        stats,
        aMatchRecord({
          scoreByScrum: { home: [5], visitor: [3] },
          score: { home: 50, visitor: 3 },
          spoofs: [spoofLine('a', [2])],
        }),
        DAY,
        { forfeit: true },
      );

    it('counts a forfeit, overall and against the opponent, whatever the score so far', () => {
      const stats = forfeit(emptyTeamStats(DAY));

      expect(stats.results).toEqual({ won: 0, lost: 0, tied: 0, forfeited: 1 });
      expect(stats.opponents.Pawns?.forfeited).toBe(1);
      expect(finishedMatches(stats.results)).toBe(0);
      expect(matchesPlayed(stats.results)).toBe(1);
    });

    it('leaves points and the best score to finished matches', () => {
      const stats = forfeit(afterMatches(aMatchRecord()));

      expect(stats.points).toBe(12);
      expect(stats.best).toBe(12);
    });

    it('credits spoofs with the scrums they finished, and logs it as forfeited', () => {
      const stats = forfeit(emptyTeamStats(DAY));

      expect(stats.spoofs.a).toMatchObject({ matches: 1, scrums: 1, points: 2, plusMinus: 2 });
      expect(stats.log[0]).toMatchObject({ result: 'forfeited', score: { yours: 50, theirs: 3 } });
    });
  });

  describe('with a real match', () => {
    it('agrees with the match: your points, scrums and spoofs’ points add up', () => {
      const record = matchRecord(computerMatch(SPOOFS, EMBERS, TEST_SEED));

      const stats = addMatch(emptyTeamStats(DAY), record, DAY);

      const spoofs = Object.values(stats.spoofs);
      expect(stats.points).toBe(record.score.home);
      expect(spoofs.reduce((a, s) => a + s.scrums, 0)).toBe(9);
      expect(spoofs.reduce((a, s) => a + s.points, 0)).toBe(record.score.home);
      expect(stats.opponents.Embers).toBeDefined();
    });
  });
});
