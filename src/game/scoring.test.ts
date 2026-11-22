import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { presetScrumEntries } from '../test-support/scrum';
import { createRandom } from './random';
import {
  SCORING_COEFFICIENT,
  estimatedScore,
  exactScore,
  finalScores,
  liveScores,
  pointValue,
} from './scoring';
import { simulateScrum, type SpoofFrame } from './scrum';

function at(id: string, team: string, x: number, y: number, radius = 16): SpoofFrame {
  return { id, team, x, y, radius, fatigue: 0 };
}

/** The area of a disc in court units, for checking scores by hand. */
const area = (r: number) => Math.PI * r * r;

describe('pointValue', () => {
  const me = at('me', 'home', 0, 0);

  it('is the zone multiplier for a lone spoof: crush 3, mosh 1, apron 0', () => {
    expect(pointValue(me, [me], 0, 0)).toBe(3);
    expect(pointValue(at('m', 'home', 60, 0), [at('m', 'home', 60, 0)], 60, 0)).toBe(1);
    expect(pointValue(at('a', 'home', 130, 0), [at('a', 'home', 130, 0)], 130, 0)).toBe(0);
  });

  it('multiplies by how many teammates cover the point, itself included', () => {
    const mate = at('mate', 'home', 5, 0);
    const mate2 = at('mate2', 'home', 0, 5);
    expect(pointValue(me, [me, mate], 2, 0)).toBe(6);
    expect(pointValue(me, [me, mate, mate2], 2, 2)).toBe(9);
  });

  it('is not changed by opponents covering the point', () => {
    const rival = at('rival', 'visitor', 0, 0);
    expect(pointValue(me, [me, rival], 0, 0)).toBe(3);
  });
});

describe('exactScore', () => {
  it('scores a lone spoof in the mosh about its area × 0.002', () => {
    const s = at('s', 'home', 60, 0, 20);
    expect(exactScore(s, [s])).toBe(Math.round(area(20) * SCORING_COEFFICIENT));
  });

  it('scores a spoof in the crush 3 times as much', () => {
    // r = 10 sits wholly inside the crush (radius 25).
    const s = at('s', 'home', 0, 0, 10);
    expect(exactScore(s, [s])).toBe(Math.round(area(10) * 3 * SCORING_COEFFICIENT));
  });

  it('scores nothing on the apron', () => {
    const s = at('s', 'home', 0, 125, 20);
    expect(exactScore(s, [s])).toBe(0);
  });

  describe('when two teammates sit on top of each other in the mosh', () => {
    // Each spoof's total is rounded once, as in the prototype, so compare
    // with the unrounded area: 2 × π × 20² × 0.002 ≈ 5.03 → 5 each.
    it('doubles each one: 4× for the team', () => {
      const a = at('a', 'home', 60, 0, 20);
      const b = at('b', 'home', 60, 0, 20);
      const each = Math.round(2 * area(20) * SCORING_COEFFICIENT);
      expect(exactScore(a, [a, b])).toBe(each);
      expect(finalScores({ clock: 0, spoofs: [a, b] }).teams.home).toBe(2 * each);
    });
  });

  describe('when an opponent sits on top', () => {
    it('changes nothing', () => {
      const a = at('a', 'home', 60, 0, 20);
      const rival = at('r', 'visitor', 60, 0, 20);
      expect(exactScore(a, [a, rival])).toBe(exactScore(a, [a]));
    });
  });
});

describe('finalScores', () => {
  it('scores a known layout: one lone spoof in the mosh, one on the crush, one on the apron', () => {
    const frame = {
      clock: 0,
      spoofs: [
        at('m', 'home', 60, 0, 20),
        at('c', 'home', 0, 0, 10),
        at('a', 'visitor', 0, 125, 20),
      ],
    };
    // Mosh: π × 20² × 0.002 ≈ 2.5 → 3. Crush: π × 10² × 3 × 0.002 ≈ 1.9 → 2. Apron: 0.
    expect(finalScores(frame)).toEqual({
      spoofs: { m: 3, c: 2, a: 0 },
      teams: { home: 5, visitor: 0 },
    });
  });

  it('gives each spoof its exact score from the last frame, not the live estimate', () => {
    // The known layout above happens to score the same on the live grid, so
    // check real end positions, where the two differ.
    for (let seed = 0; seed < 10; seed += 1) {
      const last = simulateScrum(presetScrumEntries(), { random: createRandom(seed) }).frames.at(
        -1,
      );
      if (!last) throw new Error('no frames');
      const { spoofs } = finalScores(last);
      for (const s of last.spoofs) {
        expect(spoofs[s.id], `seed ${String(seed)}`).toBe(exactScore(s, last.spoofs));
      }
    }
  });

  it("adds up a team's spoofs", () => {
    const r = simulateScrum(presetScrumEntries(), { random: createRandom(TEST_SEED) });
    const last = r.frames[r.frames.length - 1];
    if (!last) throw new Error('no frames');
    const { spoofs, teams } = finalScores(last);
    for (const team of ['home', 'visitor']) {
      const sum = last.spoofs
        .filter((s) => s.team === team)
        .reduce((t, s) => t + (spoofs[s.id] ?? 0), 0);
      expect(teams[team]).toBe(sum);
    }
  });

  it("lands on the prototype's scale: about 5–30 points a team for a scrum", () => {
    const totals: number[] = [];
    for (let seed = 0; seed < 40; seed += 1) {
      const r = simulateScrum(presetScrumEntries(), { random: createRandom(seed) });
      const last = r.frames[r.frames.length - 1];
      if (!last) throw new Error('no frames');
      totals.push(...Object.values(finalScores(last).teams));
    }
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(mean).toBeGreaterThan(5);
    expect(mean).toBeLessThan(30);
  });
});

describe('liveScores', () => {
  const r = simulateScrum(presetScrumEntries(), { random: createRandom(TEST_SEED) });
  const live = liveScores(r.frames);

  it('gives a scoreboard for every frame', () => {
    expect(live).toHaveLength(r.frames.length);
  });

  it('estimates every spoof in every frame', () => {
    for (const scores of live) expect(Object.keys(scores.spoofs)).toHaveLength(6);
  });

  // Measured over 300 scrums with the default tuning: within 2 points 99.8% of
  // the time, and 3 at worst.
  it('ends within 3 points of the exact final score, so the scoreboard barely moves at the whistle', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const run = simulateScrum(presetScrumEntries(), { random: createRandom(seed) });
      const last = run.frames[run.frames.length - 1];
      const lastLive = liveScores(run.frames).at(-1);
      if (!last || !lastLive) throw new Error('no frames');
      const exact = finalScores(last).teams;
      for (const team of ['home', 'visitor']) {
        expect(
          Math.abs((lastLive.teams[team] ?? 0) - (exact[team] ?? 0)),
          `seed ${String(seed)}`,
        ).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('estimatedScore', () => {
  it('is close to the exact score for a spoof in the mosh', () => {
    const s = at('s', 'home', 50, 10, 30);
    expect(Math.abs(estimatedScore(s, [s]) - exactScore(s, [s]))).toBeLessThanOrEqual(1);
  });
});
