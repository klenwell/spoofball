import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import type { BenchSide } from './arena';
import {
  BREAK_RECOVERY_CAP,
  REST_RECOVERY_CAP,
  SCRUMS_PER_MATCH,
  isMatchOver,
  matchRecord,
  matchScore,
  miseRandom,
  nextMise,
  outcomeFor,
  playScrum,
  recover,
  restBetweenScrums,
  scoreByScrum,
  scrumEntries,
  scrumNumber,
  startMatch,
  type Match,
  type MatchSpoof,
} from './match';
import { computerMove, placeSpoof, whoseTurn, type MiseState } from './mise';
import { PRESET_HOME, PRESET_VISITOR } from './preset-teams';
import type { Random } from './random';
import type { Skills } from './skills';

const HOME = PRESET_HOME.team;
const VISITOR = PRESET_VISITOR.team;

/** Places every spoof of a mise with the computer's moves, for both teams. */
function computerMise(match: Match): MiseState {
  let mise = nextMise(match);
  const random = miseRandom(match);
  for (let team = whoseTurn(mise); team; team = whoseTurn(mise)) {
    const move = computerMove(mise, team, match.teams[team].spoofs, random);
    mise = placeSpoof(mise, move.spoof, team, move.spot);
  }
  return mise;
}

/** A whole match, with the computer placing for both teams. */
function computerMatch(seed: number): Match {
  let match = startMatch(HOME, VISITOR, seed);
  while (!isMatchOver(match)) match = playScrum(match, computerMise(match));
  return match;
}

/** A random source that always gives the top (or bottom) of every range. */
function always(end: 'top' | 'bottom'): Random {
  const pickEnd = (min: number, max: number) => (end === 'top' ? max : min);
  return {
    next: () => (end === 'top' ? 0.999 : 0),
    uniform: pickEnd,
    int: pickEnd,
    chance: () => end === 'top',
    pick: (items) => {
      const item = items[end === 'top' ? items.length - 1 : 0];
      if (item === undefined) throw new Error('empty');
      return item;
    },
    weighted: (choices) => {
      const choice = choices[0];
      if (!choice) throw new Error('empty');
      return choice[0];
    },
  };
}

function skillsWith(values: Partial<Skills>): Skills {
  const base = HOME.spoofs[0]?.skills;
  if (!base) throw new Error('no spoof');
  return {
    ...base,
    growth: 80,
    burst: 80,
    iq: 80,
    stamina: 50,
    impact: 50,
    constancy: 50,
    ...values,
  };
}

/** Each tiring skill down by 40 from its core. */
const tired = (core: Skills) => ({
  ...core,
  growth: core.growth - 40,
  burst: core.burst - 40,
  iq: core.iq - 40,
});
/** The share of a skill's loss regained, from core, tired and recovered values. */
const regained = (core: number, before: number, after: number) =>
  (after - before) / (core - before);

describe('startMatch', () => {
  it('starts every spoof fresh: no fatigue, its own skills', () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    for (const side of ['home', 'visitor'] as const) {
      for (const m of match.spoofs[side]) {
        expect(m.fatigue).toBe(0);
        expect(m.skills).toEqual(m.spoof.skills);
        expect(m.points).toEqual([]);
      }
    }
  });

  it('picks the host from the seed: the same seed, the same host, and either team over many seeds', () => {
    expect(startMatch(HOME, VISITOR, 5).host).toBe(startMatch(HOME, VISITOR, 5).host);
    const hosts = new Set(
      Array.from({ length: 20 }, (_, seed) => startMatch(HOME, VISITOR, seed).host),
    );
    expect(hosts).toEqual(new Set(['home', 'visitor']));
  });
});

describe('a match', () => {
  it(`is ${String(SCRUMS_PER_MATCH)} scrums, then over`, () => {
    expect(SCRUMS_PER_MATCH).toBe(3);
    let match = startMatch(HOME, VISITOR, TEST_SEED);
    for (let n = 0; n < 3; n += 1) {
      expect(scrumNumber(match)).toBe(n);
      expect(isMatchOver(match)).toBe(false);
      match = playScrum(match, computerMise(match));
    }
    expect(isMatchOver(match)).toBe(true);
    expect(() => nextMise(match)).toThrow(/over/);
  });

  it('gives each scrum its own mise, with the host placing last', () => {
    const match = computerMatch(TEST_SEED);
    for (const scrum of match.scrums) expect(scrum.mise.order[5]).toBe(match.host);
  });

  it('draws a new turn order for each scrum', () => {
    const differs = Array.from({ length: 20 }, (_, seed) => computerMatch(seed)).some(
      (m) => m.scrums[0]?.mise.order.join() !== m.scrums[1]?.mise.order.join(),
    );
    expect(differs).toBe(true);
  });

  it("refuses a scrum whose mise isn't over", () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    expect(() => playScrum(match, nextMise(match))).toThrow(/not over/);
  });

  it('records each spoof’s points in every scrum, or null for a scrum it sat out', () => {
    const match = computerMatch(TEST_SEED);
    match.scrums.forEach((scrum, n) => {
      for (const side of ['home', 'visitor'] as const) {
        for (const m of match.spoofs[side]) {
          const placed = scrum.mise.placements.some(
            (p) => p.team === side && p.spoofId === m.spoof.id,
          );
          if (placed) expect(m.points[n]).toBe(scrum.scores.spoofs[m.spoof.id]);
          else expect(m.points[n]).toBeNull();
        }
      }
    });
  });

  it('adds up the match score from the scrums', () => {
    const match = computerMatch(TEST_SEED);
    const by = scoreByScrum(match);
    expect(by.home).toEqual(match.scrums.map((s) => s.scores.teams.home));
    expect(matchScore(match).home).toBe(by.home.reduce((a, b) => a + b, 0));
    expect(matchScore(match).visitor).toBe(by.visitor.reduce((a, b) => a + b, 0));
  });

  it('carries fatigue into the next scrum: a spoof that played starts the next one tired', () => {
    let match = startMatch(HOME, VISITOR, TEST_SEED);
    match = playScrum(match, computerMise(match));
    const carried = match.spoofs.home.filter((m) => m.fatigue > 0);
    expect(carried.length).toBeGreaterThan(0);

    match = playScrum(match, computerMise(match));

    const firstFrame = match.scrums[1]?.result.frames[0];
    for (const m of carried) {
      const inFrame = firstFrame?.spoofs.find((s) => s.team === 'home' && s.id === m.spoof.id);
      if (inFrame) expect(inFrame.fatigue).toBeGreaterThanOrEqual(m.fatigue);
    }
  });

  it('plays the next scrum with the skills each spoof has left, not fresh ones', () => {
    let match = startMatch(HOME, VISITOR, TEST_SEED);
    match = playScrum(match, computerMise(match));
    const mise = computerMise(match);

    const entries = scrumEntries(match, mise);

    for (const entry of entries) {
      const now = match.spoofs[entry.team as BenchSide].find((m) => m.spoof.id === entry.spoof.id);
      expect(entry.spoof.skills).toEqual(now?.skills);
    }
    expect(
      entries.some(
        (e) =>
          e.spoof.skills.burst <
          (HOME.spoofs.concat(VISITOR.spoofs).find((s) => s.id === e.spoof.id)?.skills.burst ?? 0),
      ),
    ).toBe(true);
  });

  it('resets fatigue at the start of each match', () => {
    const played = computerMatch(TEST_SEED);
    expect(played.spoofs.home.some((m) => m.fatigue > 0)).toBe(true);
    const next = startMatch(played.teams.home, played.teams.visitor, TEST_SEED + 1);
    expect(next.spoofs.home.every((m) => m.fatigue === 0)).toBe(true);
  });

  it('replays exactly from the same seed and the same placements', () => {
    expect(matchRecord(computerMatch(TEST_SEED))).toEqual(matchRecord(computerMatch(TEST_SEED)));
    expect(computerMatch(TEST_SEED).scrums.map((s) => s.result.frames)).toEqual(
      computerMatch(TEST_SEED).scrums.map((s) => s.result.frames),
    );
  });

  it('plays differently from another seed', () => {
    expect(matchRecord(computerMatch(TEST_SEED + 1))).not.toEqual(
      matchRecord(computerMatch(TEST_SEED)),
    );
  });

  it("doesn't recover after the last scrum: the match is over", () => {
    let match = startMatch(HOME, VISITOR, TEST_SEED);
    while (scrumNumber(match) < 2) match = playScrum(match, computerMise(match));
    const mise = computerMise(match);
    const last = playScrum(match, mise);
    for (const m of last.spoofs.home) {
      const finish = last.scrums[2]?.result.finish.find((f) => f.id === m.spoof.id);
      const placed = mise.placements.some((p) => p.team === 'home' && p.spoofId === m.spoof.id);
      if (placed) expect(m.fatigue).toBe(finish?.fatigue);
    }
  });
});

describe('recover', () => {
  it(`regains no more than ${String(BREAK_RECOVERY_CAP)}% of a loss at the break`, () => {
    expect(BREAK_RECOVERY_CAP).toBe(66);
    const core = skillsWith({ stamina: 99, impact: 99, constancy: 99 });
    const after = recover(core, tired(core), 10, BREAK_RECOVERY_CAP, always('top'));
    expect(regained(core.burst, core.burst - 40, after.skills.burst)).toBeCloseTo(0.66);
  });

  it(`can regain fully, up to ${String(REST_RECOVERY_CAP)}%, when allowed`, () => {
    expect(REST_RECOVERY_CAP).toBe(100);
    const core = skillsWith({ stamina: 99, impact: 99, constancy: 99 });
    const after = recover(core, tired(core), 10, REST_RECOVERY_CAP, always('top'));
    expect(regained(core.burst, core.burst - 40, after.skills.burst)).toBeCloseTo(0.99);
  });

  it('regains more with more stamina, and impact counts half as much', () => {
    const core = skillsWith({ stamina: 90, impact: 30 });
    const after = recover(core, tired(core), 10, REST_RECOVERY_CAP, always('top'));
    // (90 × 1 + 30 × 0.5) / 1.5 = 70%.
    expect(regained(core.growth, core.growth - 40, after.skills.growth)).toBeCloseTo(0.7);
  });

  it('narrows the range from below with constancy: a constant spoof never regains little', () => {
    const steady = skillsWith({ stamina: 80, impact: 80, constancy: 90 });
    const fickle = skillsWith({ stamina: 80, impact: 80, constancy: 10 });
    const low = (core: Skills) =>
      regained(
        core.iq,
        core.iq - 40,
        recover(core, tired(core), 10, REST_RECOVERY_CAP, always('bottom')).skills.iq,
      );
    // The least it regains is 80 × constancy × 0.5: 36% for a constant spoof, 4% for a fickle one.
    expect(low(steady)).toBeCloseTo(0.36);
    expect(low(fickle)).toBeCloseTo(0.04);
  });

  it('restores each tiring skill, growth, burst and iq, and leaves the rest alone', () => {
    const core = skillsWith({ stamina: 99, impact: 99 });
    const before = { ...tired(core), vision: core.vision - 5 };
    const after = recover(core, before, 10, REST_RECOVERY_CAP, always('top'));
    expect(after.skills.growth).toBeGreaterThan(before.growth);
    expect(after.skills.burst).toBeGreaterThan(before.burst);
    expect(after.skills.iq).toBeGreaterThan(before.iq);
    expect(after.skills.vision).toBe(before.vision);
  });

  it('lowers fatigue by the share of the loss regained', () => {
    const core = skillsWith({ stamina: 90, impact: 30 });
    expect(recover(core, tired(core), 10, REST_RECOVERY_CAP, always('top')).fatigue).toBe(3);
  });

  it('changes nothing for a spoof that has lost nothing', () => {
    const core = skillsWith({});
    expect(recover(core, { ...core }, 4, REST_RECOVERY_CAP, always('top'))).toEqual({
      skills: core,
      fatigue: 4,
    });
  });
});

describe('restBetweenScrums', () => {
  const core = skillsWith({ stamina: 99, impact: 99, constancy: 99 });
  const base = HOME.spoofs[0];
  if (!base) throw new Error('no spoof');
  const spoof = (id: string): MatchSpoof => ({
    spoof: { ...base, id, skills: core },
    skills: tired(core),
    fatigue: 10,
    points: [],
    stats: {
      imps: 0,
      pings: 0,
      pongs: 0,
      heeds: 0,
      jecks: 0,
      dings: 0,
      dongs: 0,
      doves: 0,
      trees: 0,
    },
  });

  it('lets a spoof that sat the scrum out rest fully first, then take the break like everyone', () => {
    const [rested, played] = restBetweenScrums(
      [spoof('rested'), spoof('played')],
      new Set(['played']),
      always('top'),
    );
    if (!rested || !played) throw new Error('missing');
    expect(regained(core.burst, core.burst - 40, played.skills.burst)).toBeCloseTo(0.66);
    // 99% back resting, then 66% of what's left at the break.
    expect(regained(core.burst, core.burst - 40, rested.skills.burst)).toBeCloseTo(1 - 0.01 * 0.34);
  });
});

describe('outcomeFor', () => {
  const finished = (home: number[], visitor: number[]): Match => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    const scrums = home.map((h, i) => ({
      scores: { teams: { home: h, visitor: visitor[i] ?? 0 }, spoofs: {} },
    }));
    return { ...match, scrums: scrums as unknown as Match['scrums'] };
  };

  it('is won, lost or tied by the total over the 3 scrums', () => {
    expect(outcomeFor(finished([10, 10, 10], [5, 5, 5]), 'home')).toBe('won');
    expect(outcomeFor(finished([10, 10, 10], [5, 5, 5]), 'visitor')).toBe('lost');
  });

  it('lets a tie stand: equal totals, with no overtime', () => {
    const tie = finished([20, 5, 5], [10, 10, 10]);
    expect(outcomeFor(tie, 'home')).toBe('tied');
    expect(outcomeFor(tie, 'visitor')).toBe('tied');
    expect(tie.scrums).toHaveLength(3);
  });

  it("refuses a match that isn't over", () => {
    expect(() => outcomeFor(finished([10], [5]), 'home')).toThrow(/not over/);
  });
});

describe('matchRecord', () => {
  const match = computerMatch(TEST_SEED);
  const record = matchRecord(match);

  it('records the teams, the score by scrum, the score and the home result', () => {
    expect(record.teams).toEqual({ home: HOME.name, visitor: VISITOR.name });
    expect(record.scoreByScrum).toEqual(scoreByScrum(match));
    expect(record.score).toEqual(matchScore(match));
    expect(record.result).toBe(outcomeFor(match, 'home'));
  });

  it("records every spoof's scrums played, points and behavior stats", () => {
    expect(record.spoofs).toHaveLength(HOME.spoofs.length + VISITOR.spoofs.length);
    for (const s of record.spoofs) {
      const m = match.spoofs[s.team].find((x) => x.spoof.id === s.id);
      expect(s.scrumsPlayed).toBe(m?.points.filter((p) => p !== null).length);
      expect(s.points).toBe(m?.points.reduce<number>((a, p) => a + (p ?? 0), 0));
      expect(s.stats).toEqual(m?.stats);
    }
    // 3 spoofs a team play each scrum.
    const played = (side: BenchSide) =>
      record.spoofs.filter((s) => s.team === side).reduce((a, s) => a + s.scrumsPlayed, 0);
    expect(played('home')).toBe(9);
    expect(played('visitor')).toBe(9);
  });

  it('sums each spoof’s behavior stats over the scrums it played', () => {
    const s = record.spoofs.find((x) => x.scrumsPlayed >= 2);
    if (!s) throw new Error('no spoof played twice');
    const dings = match.scrums
      .map((scrum) => scrum.result.finish.find((f) => f.id === s.id)?.stats.dings ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(s.stats.dings).toBe(dings);
  });

  it('records outcomes only, never skills', () => {
    expect(JSON.stringify(record)).not.toMatch(/"(skills|stamina|burst|iq|growth|temperament)"/);
  });

  it("refuses a match that isn't over", () => {
    expect(() => matchRecord(startMatch(HOME, VISITOR, TEST_SEED))).toThrow(/not over/);
  });
});
