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
  pctText,
  draftPicksText,
  rosterOutcomeText,
  playedText,
  recordedText,
  scoreText,
  signed,
  standingsRecordText,
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

describe('pctText', () => {
  it('shows a win percentage baseball-style, to three places', () => {
    expect(pctText(2 / 3)).toBe('.667');
    expect(pctText(0.5)).toBe('.500');
    expect(pctText(0)).toBe('.000');
  });

  it('keeps the 1 of a perfect record', () => {
    expect(pctText(1)).toBe('1.000');
  });

  it('shows no number without a percentage', () => {
    expect(pctText(null)).toBe(NO_NUMBER);
  });
});

describe('standingsRecordText', () => {
  it('gives wins–losses–ties as they are', () => {
    expect(standingsRecordText({ won: 4, lost: 5, tied: 1 })).toBe('4–5–1');
  });
});

describe('recordedText', () => {
  it('says the match was recorded, with the record now, forfeits as losses', () => {
    const stats = statsWith({ results: { won: 4, lost: 1, tied: 1, forfeited: 1 } });

    expect(recordedText({ ok: true, stats })).toEqual({
      recorded: true,
      text: 'Recorded. Record 4–2–1',
    });
  });

  it('says why, and never that it was recorded, when it couldn’t be saved', () => {
    for (const problem of [
      'none',
      'unavailable',
      'unreadable',
      'newer',
      'full',
      'invalid',
    ] as const) {
      const note = recordedText({ ok: false, problem });

      expect(note.recorded).toBe(false);
      expect(note.text).toMatch(/wasn't recorded|couldn't be recorded/);
      expect(note.text).not.toMatch(/^Recorded/);
    }
  });

  it('names a full or blocked storage plainly', () => {
    expect(recordedText({ ok: false, problem: 'full' }).text).toBe(
      "The browser's storage is full, so this match wasn't recorded.",
    );
    expect(recordedText({ ok: false, problem: 'unavailable' }).text).toBe(
      "This browser isn't saving data for the game, so this match wasn't recorded.",
    );
  });
});

describe('playedText', () => {
  it('gives the day and the local time, 12-hour: "Nov 25, 2:41 pm"', () => {
    expect(playedText('2026-11-25', '14:41')).toBe('Nov 25, 2:41 pm');
    expect(playedText('2027-01-02', '09:05')).toBe('Jan 2, 9:05 am');
  });

  it('calls midnight 12 am and noon 12 pm', () => {
    expect(playedText('2026-11-25', '00:07')).toBe('Nov 25, 12:07 am');
    expect(playedText('2026-11-25', '12:30')).toBe('Nov 25, 12:30 pm');
    expect(playedText('2026-11-25', '11:59')).toBe('Nov 25, 11:59 am');
  });

  it('gives the day alone for a match logged before times were saved', () => {
    expect(playedText('2026-11-25')).toBe('Nov 25');
  });
});

describe('rosterOutcomeText', () => {
  const totals = { matches: 6, scrums: 12, points: 70, plusMinus: 23, behavior: emptyStats() };

  it('gives matches and points per scrum, after the wireframe', () => {
    expect(rosterOutcomeText(totals)).toBe('6 matches · 5.8 pts/scrum');
    expect(rosterOutcomeText({ ...totals, matches: 1, scrums: 2, points: 8 })).toBe(
      '1 match · 4.0 pts/scrum',
    );
  });

  it('says there are none yet before the spoof plays', () => {
    expect(rosterOutcomeText(undefined)).toBe('No matches yet');
  });
});

describe('draftPicksText', () => {
  it('fills a mark for each pick held, out of 3', () => {
    expect(draftPicksText(0, 3)).toEqual({
      marks: '○ ○ ○',
      label: 'Draft picks: 0 of 3',
      note: 'draft at 3',
    });
    expect(draftPicksText(2, 3).marks).toBe('● ● ○');
  });

  it('says you can draft at 3', () => {
    expect(draftPicksText(3, 3)).toEqual({
      marks: '● ● ●',
      label: 'Draft picks: 3 of 3',
      note: 'ready to draft',
    });
  });
});
