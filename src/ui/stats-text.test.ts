import { describe, expect, it } from 'vitest';
import { emptyStats } from '../game/scrum';
import { emptyTeamStats, noResults, type TeamStats } from '../game/stats';
import {
  NO_NUMBER,
  RESULT_LETTER,
  RESULT_WORD,
  bestText,
  forfeitText,
  joinedText,
  matchesText,
  pointsPerMatchText,
  recordText,
  scoreText,
  signed,
  spoofLineText,
} from './stats-text';

/** Stats with these totals, and nothing else. */
function statsWith(overrides: Partial<TeamStats>): TeamStats {
  return { ...emptyTeamStats('2026-11-25'), ...overrides };
}

describe('joinedText', () => {
  it('gives the month and year the team joined', () => {
    expect(joinedText('2026-11-25')).toBe('Joined the league · Nov 2026');
    expect(joinedText('2027-01-02')).toBe('Joined the league · Jan 2027');
  });

  it('gives nothing for a team with no join date', () => {
    expect(joinedText(null)).toBeNull();
  });

  it('gives nothing for a date with no such month', () => {
    expect(joinedText('2026-13-01')).toBeNull();
    expect(joinedText('2026-00-01')).toBeNull();
  });
});

describe('recordText', () => {
  it('gives wins–losses–ties', () => {
    expect(recordText({ won: 3, lost: 2, tied: 1, forfeited: 0 })).toBe('3–2–1');
  });

  it('counts forfeits as losses', () => {
    expect(recordText({ won: 3, lost: 2, tied: 1, forfeited: 2 })).toBe('3–4–1');
  });
});

describe('forfeitText', () => {
  it('says how many of the losses were forfeits', () => {
    expect(forfeitText({ ...noResults(), forfeited: 1 })).toBe('Including 1 forfeit');
    expect(forfeitText({ ...noResults(), forfeited: 2 })).toBe('Including 2 forfeits');
  });

  it('says nothing without forfeits', () => {
    expect(forfeitText({ ...noResults(), lost: 4 })).toBeNull();
  });
});

describe('matchesText', () => {
  it('counts every match, forfeits included', () => {
    expect(matchesText(statsWith({ results: { won: 1, lost: 1, tied: 1, forfeited: 1 } }))).toBe(
      '4',
    );
  });
});

describe('pointsPerMatchText', () => {
  it('averages over finished matches, to one decimal place, leaving forfeits out', () => {
    const stats = statsWith({ results: { won: 2, lost: 1, tied: 0, forfeited: 5 }, points: 100 });

    expect(pointsPerMatchText(stats)).toBe('33.3');
  });

  it('shows no number before a finished match', () => {
    expect(pointsPerMatchText(emptyTeamStats(null))).toBe(NO_NUMBER);
    expect(pointsPerMatchText(statsWith({ results: { ...noResults(), forfeited: 1 } }))).toBe(
      NO_NUMBER,
    );
  });
});

describe('bestText', () => {
  it('gives the best score, 0 included', () => {
    expect(bestText(statsWith({ best: 71 }))).toBe('71');
    expect(bestText(statsWith({ best: 0 }))).toBe('0');
  });

  it('shows no number before a finished match', () => {
    expect(bestText(emptyTeamStats(null))).toBe(NO_NUMBER);
  });
});

describe('RESULT_LETTER', () => {
  it('gives W, L and T, and F for a forfeit', () => {
    expect(RESULT_LETTER).toEqual({ won: 'W', lost: 'L', tied: 'T', forfeited: 'F' });
  });
});

describe('RESULT_WORD', () => {
  it('names each result for screen readers', () => {
    expect(RESULT_WORD).toEqual({ won: 'Won', lost: 'Lost', tied: 'Tied', forfeited: 'Forfeited' });
  });
});

describe('scoreText', () => {
  it('gives your score first', () => {
    expect(scoreText({ yours: 47, theirs: 38 })).toBe('47–38');
  });
});

describe('spoofLineText', () => {
  const totals = {
    matches: 6,
    scrums: 12,
    points: 70,
    plusMinus: 23,
    behavior: emptyStats(),
  };

  it("gives a spoof's matches, scrums and points", () => {
    expect(spoofLineText(totals)).toMatchObject({ matches: '6', scrums: '12', points: '70' });
  });

  it('averages points and +/− over its scrums, to one decimal place', () => {
    expect(spoofLineText(totals)).toMatchObject({
      pointsPerScrum: '5.8',
      plusMinusPerScrum: '+1.9',
    });
  });

  it('shows 0 for its counts, but no number for its averages, before it plays', () => {
    expect(spoofLineText(undefined)).toEqual({
      matches: '0',
      scrums: '0',
      points: '0',
      pointsPerScrum: NO_NUMBER,
      plusMinusPerScrum: NO_NUMBER,
    });
  });

  it('shows no averages for totals with no scrums', () => {
    const none = { ...totals, matches: 0, scrums: 0, points: 0, plusMinus: 0 };

    expect(spoofLineText(none)).toMatchObject({
      pointsPerScrum: NO_NUMBER,
      plusMinusPerScrum: NO_NUMBER,
    });
  });
});

describe('signed', () => {
  it('shows a plus sign on a positive number', () => {
    expect(signed(1.94)).toBe('+1.9');
  });

  it('shows a true minus sign on a negative number', () => {
    expect(signed(-1)).toBe('−1.0');
    expect(signed(-1)).not.toContain('-');
  });

  it('shows 0.0 with no sign, including for numbers that round to it', () => {
    expect(signed(0)).toBe('0.0');
    expect(signed(-0.04)).toBe('0.0');
    expect(signed(0.04)).toBe('0.0');
  });

  it('rounds to the nearest tenth before choosing the sign', () => {
    expect(signed(-0.06)).toBe('−0.1');
    expect(signed(0.05)).toBe('+0.1');
  });
});
