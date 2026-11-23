import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { PRESET_HOME } from './preset-teams';
import { createRandom, randomFrom, type Random } from './random';
import {
  FORM_SCALE,
  MAX_SKEW,
  NUDGE_SCALE,
  SKEWED_SKILLS,
  courtMateNudge,
  matchForm,
  nudged,
} from './skew';
import { skillNames, type Skills } from './skills';

function skillsWith(values: Partial<Skills>): Skills {
  const base = PRESET_HOME.team.spoofs[0]?.skills;
  if (!base) throw new Error('no spoof');
  return {
    ...base,
    growth: 50,
    burst: 50,
    stamina: 50,
    iq: 50,
    vision: 50,
    charisma: 50,
    cooperation: 50,
    impact: 50,
    constancy: 50,
    ...values,
  };
}

/** A random source that always gives the top of every range (just under it, for `uniform`). */
const top: Random = randomFrom(() => 0.999999);

/** Many shifts of one skill, from many seeds. */
function burstShifts(own: Skills, draws = 4000): number[] {
  const random = createRandom(TEST_SEED);
  return Array.from({ length: draws }, () => matchForm(own, random).burst - own.burst);
}

function nudges(self: Skills, mates: readonly Skills[], draws = 4000): number[] {
  const random = createRandom(TEST_SEED);
  return Array.from({ length: draws }, () => courtMateNudge(self, mates, random).burst ?? 0);
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs: readonly number[]) => mean(xs.map(Math.abs));

describe('SKEWED_SKILLS', () => {
  it("are the prototype's seven: never size, mass, impact or constancy", () => {
    expect(SKEWED_SKILLS).toEqual([
      'growth',
      'burst',
      'stamina',
      'iq',
      'vision',
      'charisma',
      'cooperation',
    ]);
  });
});

describe('matchForm', () => {
  it('shifts each skewed skill, and leaves size, mass, impact and constancy alone', () => {
    const own = skillsWith({ impact: 90, constancy: 10 });

    const form = matchForm(own, createRandom(TEST_SEED));

    for (const name of skillNames) {
      if ((SKEWED_SKILLS as readonly string[]).includes(name)) {
        expect(form[name], name).not.toBe(own[name]);
      } else {
        expect(form[name], name).toBe(own[name]);
      }
    }
  });

  it('draws each skewed skill separately', () => {
    // Constancy 50 keeps every shift under the cap, so no two are capped alike.
    const form = matchForm(skillsWith({ impact: 90, constancy: 50 }), createRandom(TEST_SEED));

    const shifts = SKEWED_SKILLS.map((name) => form[name] - 50);

    expect(new Set(shifts).size).toBe(SKEWED_SKILLS.length);
  });

  it('is as likely to go up as down, even for high or low impact', () => {
    for (const impact of [10, 50, 90]) {
      const shifts = burstShifts(skillsWith({ impact, constancy: 10 }));
      const ups = shifts.filter((x) => x > 0).length / shifts.length;

      expect(Math.abs(mean(shifts)), `impact ${String(impact)}`).toBeLessThan(0.2);
      expect(ups, `impact ${String(impact)}`).toBeCloseTo(0.5, 1);
    }
  });

  it('swings widest at both extremes of impact, and least at 50', () => {
    const at = (impact: number) => spread(burstShifts(skillsWith({ impact, constancy: 50 })));

    expect(at(90)).toBeGreaterThan(at(50) * 1.3);
    expect(at(10)).toBeGreaterThan(at(50) * 1.3);
    expect(at(90)).toBeCloseTo(at(10), 0);
  });

  it('swings less with more constancy', () => {
    const at = (constancy: number) => spread(burstShifts(skillsWith({ impact: 50, constancy })));

    expect(at(90)).toBeLessThan(at(50) / 3);
    expect(at(50)).toBeLessThan(at(10) / 1.5);
  });

  it(`reaches the prototype's range, impact × ${String(FORM_SCALE)} × (100 − constancy)%, when uncapped`, () => {
    // Impact 60 (up to 60%), constancy 80 (up to 20%): 0.6 × 20 × 0.2 = 2.4.
    const form = matchForm(skillsWith({ impact: 60, constancy: 80 }), top);

    expect(form.burst - 50).toBeCloseTo(2.4, 3);
  });

  it(`stays within ${String(MAX_SKEW)} of its own skills, and within 1–99`, () => {
    // Impact 99 and constancy 1 would shift by 0.99 × 20 × 0.99 ≈ 19.6.
    const own = skillsWith({ impact: 99, constancy: 1, burst: 30, growth: 95 });

    const form = matchForm(own, top);

    expect(MAX_SKEW).toBe(10);
    expect(form.burst).toBe(40);
    expect(form.growth).toBe(99);
  });

  it('comes from the random source: the same seed, the same form', () => {
    const own = skillsWith({ impact: 80, constancy: 20 });

    expect(matchForm(own, createRandom(7))).toEqual(matchForm(own, createRandom(7)));
    expect(matchForm(own, createRandom(7))).not.toEqual(matchForm(own, createRandom(8)));
  });
});

describe('courtMateNudge', () => {
  const mate = (impact: number) => skillsWith({ impact });
  const self = skillsWith({ constancy: 10 });

  it('lifts on average from a high-impact court-mate, and drags down from a low-impact one', () => {
    // A court-mate's draw averages (impact − 50)% × 8: +3.2 at 90, −3.2 at 10, damped here by 90%.
    expect(mean(nudges(self, [mate(90)]))).toBeCloseTo(3.2 * 0.9, 0);
    expect(mean(nudges(self, [mate(10)]))).toBeCloseTo(-3.2 * 0.9, 0);
    expect(Math.abs(mean(nudges(self, [mate(50)])))).toBeLessThan(0.2);
  });

  it('adds up each court-mate', () => {
    expect(mean(nudges(self, [mate(90), mate(90)]))).toBeCloseTo(2 * 3.2 * 0.9, 0);
    expect(Math.abs(mean(nudges(self, [mate(90), mate(10)])))).toBeLessThan(0.3);
  });

  it("is damped by the spoof's own constancy, but a high-impact court-mate still lifts it", () => {
    const steady = mean(nudges(skillsWith({ constancy: 90 }), [mate(90)]));
    const fickle = mean(nudges(skillsWith({ constancy: 10 }), [mate(90)]));

    expect(steady).toBeLessThan(fickle / 5);
    expect(steady).toBeGreaterThan(0.2);
  });

  it(`reaches impact × ${String(NUDGE_SCALE)} × (100 − constancy)% at the top of the range`, () => {
    // Impact 90 (up to 90%), constancy 75: 0.9 × 8 × 0.25 = 1.8.
    const nudge = courtMateNudge(skillsWith({ constancy: 75 }), [mate(90)], top);

    for (const name of SKEWED_SKILLS) expect(nudge[name], name).toBeCloseTo(1.8, 3);
  });

  it('nudges only the skewed skills', () => {
    const nudge = courtMateNudge(self, [mate(90)], top);

    expect(Object.keys(nudge).sort()).toEqual([...SKEWED_SKILLS].sort());
  });

  it('is nothing without court-mates', () => {
    const nudge = courtMateNudge(self, [], createRandom(TEST_SEED));

    for (const name of SKEWED_SKILLS) expect(nudge[name]).toBe(0);
  });
});

describe('nudged', () => {
  const own = skillsWith({ burst: 50, iq: 50, vision: 50 });

  it('adds the nudge to the skills a spoof has now', () => {
    const form = { ...own, burst: 52 };
    const now = { ...form, burst: 40 };

    const skills = nudged(own, form, now, { burst: 3 });

    expect(skills.burst).toBe(43);
    expect(skills.size).toBe(now.size);
  });

  it(`caps the form and the nudge together within ${String(MAX_SKEW)} of its own skills`, () => {
    // Form 58 + nudge 5 would be 63: only 2 more is allowed. Tired to 40, it plays at 42.
    const form = { ...own, burst: 58, iq: 44 };
    const now = { ...form, burst: 40 };

    const skills = nudged(own, form, now, { burst: 5, iq: -9 });

    expect(skills.burst).toBe(42);
    expect(skills.iq).toBe(40);
  });

  it('stays within 1–99', () => {
    const high = skillsWith({ vision: 95 });

    expect(nudged(high, high, high, { vision: 8 }).vision).toBe(99);
  });
});
