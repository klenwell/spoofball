import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import {
  COMBINE_TYPE_ODDS,
  DEFAULT_POOL_TUNING,
  MAX_POOL_PAWNS,
  MIN_POOL_ROYALS,
  DRAFT_BUDGET,
  MAX_PRICE,
  MIN_PRICE,
  POOL_SIZE,
  POOL_VALUE,
  createPool,
  scalePrices,
  type Candidate,
} from './combine';
import { minimumTotal, skillTotal, typeProfiles } from './skills';
import { spoofTypes } from './spoof-types';
import { NEW_SPOOF_SKILL_TOTAL, teamProblems } from './teams';

/** Many pools, one per seed. */
function manyPools(count = 300, tuning = DEFAULT_POOL_TUNING) {
  return Array.from({ length: count }, (_, n) => createPool(TEST_SEED + n, tuning));
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * 1,000 pools, made once and shared by the two tests that count types. Making
 * 4,000 for one test ran past the 5-second test timeout on CI, which runs
 * about 1.5 times slower than a laptop. 1,000 is plenty: the counts come out
 * within 0.002 of what 2,000 pools give.
 */
let typeCountPools: Candidate[][] | undefined;
const poolsForTypeCounts = () => (typeCountPools ??= manyPools(1000));

describe('createPool', () => {
  it(`draws ${String(POOL_SIZE)} named candidates with ids p1 to p${String(POOL_SIZE)}, no two named alike`, () => {
    const pool = createPool(TEST_SEED);

    expect(pool.map((c) => c.spoof.id)).toEqual(
      Array.from({ length: POOL_SIZE }, (_, i) => `p${String(i + 1)}`),
    );
    expect(new Set(pool.map((c) => c.spoof.name.toLowerCase())).size).toBe(POOL_SIZE);
  });

  it('never uses a name word twice in a pool, so every pick has its own name', () => {
    for (const pool of manyPools()) {
      const words = pool.flatMap((c) => c.spoof.name.toLowerCase().split(' '));
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it('comes from its seed: the same seed, the same pool', () => {
    expect(createPool(TEST_SEED)).toEqual(createPool(TEST_SEED));
    expect(createPool(TEST_SEED + 1)).not.toEqual(createPool(TEST_SEED));
  });

  it(`prices every pool at exactly ${String(POOL_VALUE)}, twice the budget, each price from 1 to 100`, () => {
    expect(POOL_VALUE).toBe(2 * DRAFT_BUDGET);
    for (const pool of manyPools()) {
      expect(sum(pool.map((c) => c.price))).toBe(POOL_VALUE);
      for (const { price } of pool) {
        expect(Number.isInteger(price)).toBe(true);
        expect(price).toBeGreaterThanOrEqual(MIN_PRICE);
        expect(price).toBeLessThanOrEqual(MAX_PRICE);
      }
    }
  });

  it('always has 5 candidates you can afford together', () => {
    for (const pool of manyPools()) {
      const cheapest = pool.map((c) => c.price).sort((a, b) => a - b);
      expect(sum(cheapest.slice(0, 5))).toBeLessThanOrEqual(DRAFT_BUDGET);
    }
  });

  it('has at most 6 pawns and at least 1 royal in every pool', () => {
    expect([MAX_POOL_PAWNS, MIN_POOL_ROYALS]).toEqual([6, 1]);
    for (const pool of manyPools(500)) {
      const types = pool.map((c) => c.spoof.type);
      expect(types.filter((t) => t.startsWith('pawn')).length).toBeLessThanOrEqual(MAX_POOL_PAWNS);
      expect(types.filter((t) => t === 'king' || t === 'queen').length).toBeGreaterThanOrEqual(
        MIN_POOL_ROYALS,
      );
    }
  });

  it("draws types with the combine's odds: about 4 or 5 pawns a pool, and often a second royal", () => {
    const pools = poolsForTypeCounts();
    const count = (pred: (t: string) => boolean) =>
      pools.map((pool) => pool.filter((c) => pred(c.spoof.type)).length);
    const pawns = count((t) => t.startsWith('pawn'));
    const royals = count((t) => t === 'king' || t === 'queen');
    const mean = (xs: number[]) => sum(xs) / xs.length;

    // As simulated over 100,000 pools when the owner picked these odds (#72 QA): 4.6 and 1.37.
    expect(Math.abs(mean(pawns) - 4.6)).toBeLessThan(0.1);
    expect(Math.abs(mean(royals) - 1.37)).toBeLessThan(0.1);
    expect(royals.filter((r) => r >= 2).length / pools.length).toBeGreaterThan(0.2);
  });

  it("draws the first candidate, before any limit applies, with the combine's odds", () => {
    const counts = Object.fromEntries(spoofTypes.map((t) => [t, 0])) as Record<string, number>;
    const pools = poolsForTypeCounts();
    for (const pool of pools) {
      const first = pool[0]?.spoof.type ?? 'king';
      counts[first] = (counts[first] ?? 0) + 1;
    }
    const odds = sum(spoofTypes.map((t) => COMBINE_TYPE_ODDS[t]));
    expect(odds).toBe(100);
    for (const type of spoofTypes) {
      expect((counts[type] ?? 0) / pools.length, type).toBeCloseTo(
        COMBINE_TYPE_ODDS[type] / odds,
        1,
      );
    }
  });

  it(`spreads strength widely around a new team's level, within each type's limits`, () => {
    const totals = manyPools().flatMap((pool) =>
      pool.map((c) => {
        const total = skillTotal(c.spoof.skills);
        expect(total).toBeGreaterThanOrEqual(minimumTotal(c.spoof.type));
        expect(total).toBeLessThanOrEqual(typeProfiles[c.spoof.type].maxTotal);
        return total;
      }),
    );
    const low = NEW_SPOOF_SKILL_TOTAL - DEFAULT_POOL_TUNING.spread;
    const high = NEW_SPOOF_SKILL_TOTAL + DEFAULT_POOL_TUNING.spread;
    expect(Math.min(...totals)).toBe(low);
    expect(Math.max(...totals)).toBe(high);
    // Wider than the generated teams before the combine, 476 to 595.
    expect(high - low).toBeGreaterThan(595 - 476);
    expect(Math.abs(sum(totals) / totals.length - NEW_SPOOF_SKILL_TOTAL)).toBeLessThan(10);
  });

  it('makes candidates that can play: each is a valid spoof', () => {
    const pool = createPool(TEST_SEED);
    const team = {
      name: 'Pool',
      color: 'blue' as const,
      logo: '🦉',
      spoofs: pool.slice(0, 5).map((c) => c.spoof),
    };
    expect(teamProblems(team)).toEqual([]);
  });

  describe('prices', () => {
    /** Over many pools: how prices follow skill totals. */
    function measure(tuning = DEFAULT_POOL_TUNING) {
      let pairs = 0;
      let cheaperStronger = 0;
      const byTotal: [number, number][] = [];
      for (const pool of manyPools(300, tuning)) {
        for (const c of pool) byTotal.push([skillTotal(c.spoof.skills), c.price]);
        for (let i = 0; i < pool.length; i += 1) {
          for (let j = i + 1; j < pool.length; j += 1) {
            const a = pool[i];
            const b = pool[j];
            if (!a || !b) continue;
            const [ta, tb] = [skillTotal(a.spoof.skills), skillTotal(b.spoof.skills)];
            if (a.price === b.price || ta === tb) continue;
            pairs += 1;
            if (a.price < b.price !== ta < tb) cheaperStronger += 1;
          }
        }
      }
      return { byTotal, cheaperStronger: cheaperStronger / pairs };
    }

    it('cost more, on average, for stronger spoofs', () => {
      const { byTotal } = measure();
      byTotal.sort((a, b) => a[0] - b[0]);
      const third = Math.floor(byTotal.length / 3);
      const mean = (xs: [number, number][]) => sum(xs.map(([, p]) => p)) / xs.length;
      const weakest = mean(byTotal.slice(0, third));
      const middle = mean(byTotal.slice(third, 2 * third));
      const strongest = mean(byTotal.slice(2 * third));
      expect(middle).toBeGreaterThan(weakest + 10);
      expect(strongest).toBeGreaterThan(middle + 10);
    });

    it('jitter enough that the cheaper of two spoofs is sometimes the stronger', () => {
      const { cheaperStronger } = measure();
      // About a quarter of the time with the owner's picks (#72).
      expect(cheaperStronger).toBeGreaterThan(0.15);
      expect(cheaperStronger).toBeLessThan(0.33);
    });

    it('keep even the weakest candidates well off the floor: a coin or two is rare', () => {
      const prices = manyPools().flatMap((pool) => pool.map((c) => c.price));
      const low = prices.filter((p) => p < 10).length / prices.length;
      expect(low).toBeLessThan(0.005);
    });

    it('follow skill totals exactly with no jitter, so the jitter is all that blurs them', () => {
      expect(measure({ ...DEFAULT_POOL_TUNING, jitter: 0 }).cheaperStronger).toBe(0);
    });
  });
});

describe('scalePrices', () => {
  it('shares the total in proportion, rounding so the sum is exact', () => {
    expect(scalePrices([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(sum(scalePrices([10, 20, 30, 40], 250))).toBe(250);
    expect(scalePrices([10, 20, 30, 40], 100)).toEqual([10, 20, 30, 40]);
  });

  it('keeps every price from 1 to 100, sharing out what the limits leave', () => {
    const prices = scalePrices([1000, 1, 1, 1, 1, 1, 1, 1, 1, 1], 500);
    expect(sum(prices)).toBe(500);
    expect(Math.max(...prices)).toBe(MAX_PRICE);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(MIN_PRICE);
    expect(scalePrices([0, -5, 50, 50], 4)).toEqual([1, 1, 1, 1]);
  });

  it("refuses a total the prices can't reach", () => {
    expect(() => scalePrices([1, 1], 1)).toThrow(RangeError);
    expect(() => scalePrices([1, 1], 201)).toThrow(RangeError);
    expect(() => scalePrices([], 0)).toThrow(RangeError);
  });
});
