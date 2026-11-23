import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import type { BenchSide } from './arena';
import {
  BREAK_RECOVERY_CAP,
  REST_RECOVERY_CAP,
  SCRUMS_PER_MATCH,
  isMatchOver,
  matchRandom,
  matchRecord,
  matchScorecard,
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
  scrumSummary,
  startMatch,
  type Match,
  type MatchSpoof,
} from './match';
import { computerMove, placeSpoof, whoseTurn, type MiseState } from './mise';
import { PRESET_HOME, PRESET_VISITOR } from './preset-teams';
import type { Random } from './random';
import { MAX_SKEW, SKEWED_SKILLS } from './skew';
import { skillNames, type Skills } from './skills';

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
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('matchRandom', () => {
  // Seeds across the whole 32-bit range, as the screen draws them.
  const bigSeeds = Array.from({ length: 4000 }, (_, i) => Math.imul(i + 1, 2246822519) >>> 0);

  it('gives each purpose its own numbers, even for a large seed (#57 review)', () => {
    const match = { seed: 3_000_000_000 };
    const purposes = ['host', 'order', 'moves', 'scrum', 'recovery', 'form', 'nudge'] as const;

    const firsts = purposes.map((purpose) => matchRandom(match, purpose).next());

    expect(new Set(firsts).size).toBe(purposes.length);
  });

  it("spreads the first scrum's turn order evenly over the allowed orders, whoever hosts", () => {
    const counts = new Map<string, number>();
    for (const seed of bigSeeds) {
      const match = startMatch(HOME, VISITOR, seed);
      const key = `${match.host}:${nextMise(match).order.join()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // 9 orders for each host: about 4000 / 18 = 222 each.
    expect(counts.size).toBe(18);
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(150);
      expect(n).toBeLessThan(300);
    }
  });
});

describe('startMatch', () => {
  it('starts every spoof fresh: no fatigue, playing in its form', () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    for (const side of ['home', 'visitor'] as const) {
      for (const m of match.spoofs[side]) {
        expect(m.fatigue).toBe(0);
        expect(m.skills).toEqual(m.form);
        expect(m.points).toEqual([]);
      }
    }
  });

  it(`skews every spoof of both teams into a form, within ${String(MAX_SKEW)} of its own skills (#62)`, () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    for (const side of ['home', 'visitor'] as const) {
      for (const m of match.spoofs[side]) {
        expect(m.form, `${side} ${m.spoof.id}`).not.toEqual(m.spoof.skills);
        for (const name of skillNames) {
          const shift = Math.abs(m.form[name] - m.spoof.skills[name]);
          if ((SKEWED_SKILLS as readonly string[]).includes(name))
            expect(shift).toBeLessThanOrEqual(MAX_SKEW);
          else expect(shift, name).toBe(0);
        }
      }
    }
  });

  it('draws the form from the seed: the same for a replay, new for the next match', () => {
    const forms = (seed: number) => startMatch(HOME, VISITOR, seed).spoofs.home.map((m) => m.form);

    expect(forms(TEST_SEED)).toEqual(forms(TEST_SEED));
    expect(forms(TEST_SEED + 1)).not.toEqual(forms(TEST_SEED));
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

  it('gives each scrum its own mise, with the host placing last, whichever team hosts', () => {
    const matches = Array.from({ length: 8 }, (_, seed) => computerMatch(seed));
    expect(new Set(matches.map((m) => m.host))).toEqual(new Set(['home', 'visitor']));
    for (const match of matches) {
      for (const scrum of match.scrums) expect(scrum.mise.order[5]).toBe(match.host);
    }
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
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    const mise = computerMise(match);
    const worn = (m: MatchSpoof): MatchSpoof => ({
      ...m,
      skills: { ...m.skills, burst: m.skills.burst - 20 },
    });
    const tiredMatch = {
      ...match,
      spoofs: { home: match.spoofs.home.map(worn), visitor: match.spoofs.visitor.map(worn) },
    };

    const fresh = scrumEntries(match, mise);
    const tired = scrumEntries(tiredMatch, mise);

    // Down 20 for every spoof whose burst doesn't bottom out at 1.
    const unclamped = tired.filter((_, i) => (fresh[i]?.spoof.skills.burst ?? 0) > 21);
    expect(unclamped.length).toBeGreaterThan(3);
    tired.forEach((entry, i) => {
      const was = fresh[i]?.spoof.skills.burst ?? 0;
      if (was > 21) expect(entry.spoof.skills.burst).toBeCloseTo(was - 20, 9);
    });
  });

  it("nudges each spoof by its court-mates' impact, up for high impact and down for low (#62)", () => {
    // Every spoof the same but its impact: the home team all 95, the visitors all 5.
    const flat = (team: typeof HOME, impact: number) => ({
      ...team,
      spoofs: team.spoofs.map((s) => ({ ...s, skills: { ...s.skills, impact, constancy: 20 } })),
    });
    const lift = { home: [] as number[], visitor: [] as number[] };
    for (let seed = 0; seed < 40; seed += 1) {
      const match = startMatch(flat(HOME, 95), flat(VISITOR, 5), seed);
      for (const entry of scrumEntries(match, computerMise(match))) {
        const me = match.spoofs[entry.team as BenchSide].find((m) => m.spoof.id === entry.spoof.id);
        for (const name of SKEWED_SKILLS)
          lift[entry.team as BenchSide].push(entry.spoof.skills[name] - (me?.skills[name] ?? 0));
      }
    }

    expect(mean(lift.home)).toBeGreaterThan(2);
    expect(mean(lift.visitor)).toBeLessThan(-2);
  });

  it("doesn't nudge from the bench: a benched spoof's impact changes no one", () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    const mise = computerMise(match);
    const benched = match.spoofs.home.find(
      (m) => !mise.placements.some((p) => p.team === 'home' && p.spoofId === m.spoof.id),
    );
    if (!benched) throw new Error('no benched spoof');
    const withImpact = (impact: number) => ({
      ...match,
      teams: {
        ...match.teams,
        home: {
          ...HOME,
          spoofs: HOME.spoofs.map((s) =>
            s.id === benched.spoof.id ? { ...s, skills: { ...s.skills, impact } } : s,
          ),
        },
      },
    });

    expect(scrumEntries(withImpact(1), mise)).toEqual(scrumEntries(withImpact(99), mise));
    expect(
      scrumEntries(match, mise).some((e) => e.team === 'home' && e.spoof.id === benched.spoof.id),
    ).toBe(false);
  });

  it("isn't nudged by its own impact, only its court-mates'", () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    const mise = computerMise(match);
    const home = scrumEntries(match, mise).filter((e) => e.team === 'home');
    const [me, mate] = home;
    if (!me || !mate) throw new Error('need two home spoofs');
    const withImpact = (impact: number): Match => ({
      ...match,
      teams: {
        ...match.teams,
        home: {
          ...HOME,
          spoofs: HOME.spoofs.map((s) =>
            s.id === me.spoof.id ? { ...s, skills: { ...s.skills, impact } } : s,
          ),
        },
      },
    });
    const find = (m: Match, id: string) =>
      scrumEntries(m, mise).find((e) => e.team === 'home' && e.spoof.id === id)?.spoof.skills;

    expect(find(withImpact(1), me.spoof.id)).toEqual(find(withImpact(99), me.spoof.id));
    expect(find(withImpact(1), mate.spoof.id)).not.toEqual(find(withImpact(99), mate.spoof.id));
  });

  it('draws the nudge anew each scrum', () => {
    const match = startMatch(HOME, VISITOR, TEST_SEED);
    const mise = computerMise(match);
    // The same spoofs, as fresh, in the same spots, but a scrum later.
    const later = { ...playScrum(match, mise), spoofs: match.spoofs };

    expect(scrumEntries(later, mise)).not.toEqual(scrumEntries(match, mise));
  });

  it(`keeps every spoof's scrum skills within ${String(MAX_SKEW)} of its own, form and nudge together`, () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const match = startMatch(HOME, VISITOR, seed);
      for (const entry of scrumEntries(match, computerMise(match))) {
        const me = match.spoofs[entry.team as BenchSide].find((m) => m.spoof.id === entry.spoof.id);
        for (const name of SKEWED_SKILLS) {
          expect(
            Math.abs(entry.spoof.skills[name] - (me?.spoof.skills[name] ?? 0)),
          ).toBeLessThanOrEqual(MAX_SKEW + 1e-9);
        }
      }
    }
  });

  it("drops the court-mates' nudge after the scrum: it lasts only that scrum", () => {
    let match = startMatch(HOME, VISITOR, TEST_SEED);
    const mise = computerMise(match);
    const entries = scrumEntries(match, mise);

    match = playScrum(match, mise);

    for (const entry of entries) {
      const me = match.spoofs[entry.team as BenchSide].find((m) => m.spoof.id === entry.spoof.id);
      if (!me) throw new Error('missing');
      // Skills tiring doesn't touch are back to the form exactly; the tiring ones, no higher than it.
      for (const name of ['stamina', 'vision', 'charisma', 'cooperation'] as const) {
        expect(me.skills[name], name).toBeCloseTo(me.form[name], 9);
      }
      for (const name of ['growth', 'burst', 'iq'] as const) {
        expect(me.skills[name], name).toBeLessThanOrEqual(me.form[name] + 1e-9);
      }
    }
    expect(
      entries.some(
        (e) =>
          e.spoof.skills.vision !==
          match.spoofs.home.concat(match.spoofs.visitor).find((m) => m.spoof.id === e.spoof.id)
            ?.form.vision,
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

  it('gives both teams the break: a spoof that played comes out of it less tired', () => {
    for (const side of ['home', 'visitor'] as const) {
      let match = startMatch(HOME, VISITOR, TEST_SEED);
      match = playScrum(match, computerMise(match));
      const finish = match.scrums[0]?.result.finish;
      const tiredOnes = match.spoofs[side].filter((m) => {
        const f = finish?.find((x) => x.id === m.spoof.id);
        return f && f.fatigue > 2;
      });

      expect(tiredOnes.length, side).toBeGreaterThan(0);
      for (const m of tiredOnes) {
        expect(m.fatigue, `${side} ${m.spoof.id}`).toBeLessThan(
          finish?.find((x) => x.id === m.spoof.id)?.fatigue ?? 0,
        );
      }
    }
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
    form: core,
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

  it("restores toward the spoof's form, not its own skills (#62)", () => {
    // Its form 8 above its own: tired 40 below the form, it regains 99% of those 40.
    const own = { ...core, burst: core.burst - 8 };
    const [after] = restBetweenScrums(
      [{ ...spoof('formed'), spoof: { ...base, id: 'formed', skills: own } }],
      new Set(),
      always('top'),
    );

    expect(regained(core.burst, core.burst - 40, after?.skills.burst ?? 0)).toBeCloseTo(
      1 - 0.01 * 0.34,
    );
  });
});

describe('scrumSummary', () => {
  const match = computerMatch(TEST_SEED);

  it("gives each team's score in that scrum, and the match score after it", () => {
    const second = scrumSummary(match, 1);

    expect(second.scrum).toBe(2);
    expect(second.score).toEqual({
      home: match.scrums[1]?.scores.teams.home,
      visitor: match.scrums[1]?.scores.teams.visitor,
    });
    const by = scoreByScrum(match);
    expect(second.matchScore).toEqual({
      home: (by.home[0] ?? 0) + (by.home[1] ?? 0),
      visitor: (by.visitor[0] ?? 0) + (by.visitor[1] ?? 0),
    });
  });

  it('lists every spoof of both teams with its points, and null for one that sat the scrum out', () => {
    const first = scrumSummary(match, 0);
    const placed = match.scrums[0]?.mise.placements ?? [];

    for (const side of ['home', 'visitor'] as const) {
      expect(first.spoofs[side].map((l) => l.id)).toEqual(
        match.teams[side].spoofs.map((s) => s.id),
      );
      for (const line of first.spoofs[side]) {
        const played = placed.some((p) => p.team === side && p.spoofId === line.id);
        if (played) expect(line.points).toBe(match.scrums[0]?.scores.spoofs[line.id]);
        else expect(line.points).toBeNull();
      }
    }
  });

  it("gives each spoof's name and type, for its row", () => {
    for (const side of ['home', 'visitor'] as const) {
      expect(scrumSummary(match, 0).spoofs[side].map((l) => [l.name, l.type])).toEqual(
        match.teams[side].spoofs.map((s) => [s.name, s.type]),
      );
    }
  });

  it('shows outcomes only, never skills', () => {
    expect(JSON.stringify(scrumSummary(match, 0))).not.toMatch(
      /"(skills|stamina|burst|iq|growth|temperament|fatigue)"/,
    );
  });

  it("refuses a scrum that hasn't been played", () => {
    const fresh = startMatch(HOME, VISITOR, TEST_SEED);
    expect(() => scrumSummary(fresh, 0)).toThrow(RangeError);
    expect(() => scrumSummary(match, 3)).toThrow(RangeError);
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

describe('matchScorecard', () => {
  const match = computerMatch(TEST_SEED);
  const card = matchScorecard(match);

  it('gives the home result, as outcomeFor does', () => {
    expect(card.outcome).toBe(outcomeFor(match, 'home'));
  });

  it("gives each spoof's name and type, for its row", () => {
    for (const side of ['home', 'visitor'] as const) {
      expect(card.teams[side].lines.map((l) => [l.name, l.type])).toEqual(
        match.teams[side].spoofs.map((s) => [s.name, s.type]),
      );
    }
  });

  it("gives both teams' names, scores by scrum and totals", () => {
    const by = scoreByScrum(match);
    for (const side of ['home', 'visitor'] as const) {
      expect(card.teams[side].name).toBe(match.teams[side].name);
      expect(card.teams[side].byScrum).toEqual(by[side]);
      expect(card.teams[side].total).toBe(matchScore(match)[side]);
    }
  });

  it("gives every spoof's points in each scrum, null for a scrum it sat out, and its total", () => {
    for (const side of ['home', 'visitor'] as const) {
      expect(card.teams[side].lines.map((l) => l.id)).toEqual(
        match.teams[side].spoofs.map((s) => s.id),
      );
      for (const line of card.teams[side].lines) {
        expect(line.byScrum).toHaveLength(3);
        match.scrums.forEach((scrum, n) => {
          const played = scrum.mise.placements.some(
            (p) => p.team === side && p.spoofId === line.id,
          );
          if (played) expect(line.byScrum[n]).toBe(scrum.scores.spoofs[line.id]);
          else expect(line.byScrum[n]).toBeNull();
        });
        expect(line.total).toBe(line.byScrum.reduce<number>((a, p) => a + (p ?? 0), 0));
      }
    }
  });

  it("adds each team's spoofs up to its total", () => {
    for (const side of ['home', 'visitor'] as const) {
      const sum = card.teams[side].lines.reduce((a, l) => a + l.total, 0);
      expect(sum).toBe(card.teams[side].total);
    }
  });

  it('shows outcomes only, never skills', () => {
    expect(JSON.stringify(card)).not.toMatch(
      /"(skills|stamina|burst|iq|growth|temperament|fatigue)"/,
    );
  });

  it("refuses a match that isn't over", () => {
    expect(() => matchScorecard(startMatch(HOME, VISITOR, TEST_SEED))).toThrow(/not over/);
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

  it("records each spoof's name as it was at match time, both teams in order (#28)", () => {
    expect(record.spoofs.map((s) => s.name)).toEqual(
      [...HOME.spoofs, ...VISITOR.spoofs].map((s) => s.name),
    );
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
    expect(JSON.stringify(record)).not.toMatch(
      /"(skills|form|stamina|burst|iq|growth|temperament)"/,
    );
  });

  it("refuses a match that isn't over", () => {
    expect(() => matchRecord(startMatch(HOME, VISITOR, TEST_SEED))).toThrow(/not over/);
  });
});
