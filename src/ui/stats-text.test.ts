import { describe, expect, it } from 'vitest';
import { emptyTeamStats, noResults, type TeamStats } from '../game/stats';
import {
  NO_NUMBER,
  bestText,
  forfeitText,
  joinedText,
  matchesText,
  pointsPerMatchText,
  recordText,
  scoreText,
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
  it('gives the best score, or no number before a finished match', () => {
    expect(bestText(statsWith({ best: 71 }))).toBe('71');
    expect(bestText(statsWith({ best: 0 }))).toBe('0');
    expect(bestText(emptyTeamStats(null))).toBe(NO_NUMBER);
  });
});

describe('scoreText', () => {
  it('gives your score first', () => {
    expect(scoreText({ yours: 47, theirs: 38 })).toBe('47–38');
  });
});
