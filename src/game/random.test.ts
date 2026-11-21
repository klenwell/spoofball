import { describe, expect, it } from 'vitest';
import { TEST_SEED, sequenceRandom } from '../test-support/random';
import { createRandom } from './random';

function draws(seed: number, count = 20): number[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => random.next());
}

describe('createRandom', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draws(TEST_SEED)).toEqual(draws(TEST_SEED));
  });

  it('gives a different sequence for a different seed', () => {
    expect(draws(TEST_SEED)).not.toEqual(draws(TEST_SEED + 1));
  });

  it('stays in [0, 1) and spreads evenly over many draws', () => {
    const values = draws(TEST_SEED, 10_000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
  });

  describe('when the seed is not a whole number', () => {
    it('refuses it', () => {
      expect(() => createRandom(1.5)).toThrow(RangeError);
    });
  });
});

describe('Random', () => {
  describe('int', () => {
    it('includes both ends', () => {
      const random = sequenceRandom([0, 0.999999]);
      expect([random.int(4, 5), random.int(4, 5)]).toEqual([4, 5]);
    });

    it('covers the whole range over many draws', () => {
      const random = createRandom(TEST_SEED);
      const seen = new Set(Array.from({ length: 200 }, () => random.int(1, 6)));
      expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    describe('when the range is backwards or not whole', () => {
      it('refuses it', () => {
        const random = createRandom(TEST_SEED);
        expect(() => random.int(5, 4)).toThrow(RangeError);
        expect(() => random.int(0, 2.5)).toThrow(RangeError);
      });
    });
  });

  describe('uniform', () => {
    it('maps a draw into [min, max)', () => {
      expect(sequenceRandom([0.25]).uniform(10, 20)).toBe(12.5);
    });
  });

  describe('chance', () => {
    it('is true when the draw falls under the probability', () => {
      const random = sequenceRandom([0.29, 0.3]);
      expect([random.chance(0.3), random.chance(0.3)]).toEqual([true, false]);
    });

    it('never happens at 0 and always happens at 1', () => {
      const random = sequenceRandom([0, 0.999999]);
      expect(random.chance(0)).toBe(false);
      expect(random.chance(1)).toBe(true);
    });

    describe('when the probability is outside 0 to 1', () => {
      it('refuses it, as the prototype did', () => {
        const random = createRandom(TEST_SEED);
        expect(() => random.chance(1.2)).toThrow(RangeError);
        expect(() => random.chance(-0.1)).toThrow(RangeError);
        expect(() => random.chance(Number.NaN)).toThrow(RangeError);
      });
    });
  });

  describe('pick', () => {
    it('picks by position in the list', () => {
      const random = sequenceRandom([0, 0.5, 0.99]);
      expect([
        random.pick(['a', 'b', 'c']),
        random.pick(['a', 'b', 'c']),
        random.pick(['a', 'b', 'c']),
      ]).toEqual(['a', 'b', 'c']);
    });

    describe('when the list is empty', () => {
      it('refuses it', () => {
        expect(() => createRandom(TEST_SEED).pick([])).toThrow(RangeError);
      });
    });
  });

  describe('weighted', () => {
    const choices = [
      ['pawn', 65],
      ['king', 2],
      ['rook', 33],
    ] as const;

    it('picks in proportion to the weights', () => {
      const random = sequenceRandom([0.64, 0.66, 0.67, 0.99]);
      expect(Array.from({ length: 4 }, () => random.weighted(choices))).toEqual([
        'pawn',
        'king',
        'rook',
        'rook',
      ]);
    });

    it('matches the weights over many draws', () => {
      const random = createRandom(TEST_SEED);
      const count = 20_000;
      const pawns = Array.from({ length: count }, () => random.weighted(choices)).filter(
        (c) => c === 'pawn',
      ).length;
      expect(pawns / count).toBeCloseTo(0.65, 1);
    });

    it('never picks a choice with weight 0', () => {
      const random = createRandom(TEST_SEED);
      const picks = new Set(
        Array.from({ length: 500 }, () =>
          random.weighted([
            ['never', 0],
            ['always', 1],
          ]),
        ),
      );
      expect([...picks]).toEqual(['always']);
    });

    describe('when no weight is positive, or one is negative', () => {
      it('refuses them', () => {
        const random = createRandom(TEST_SEED);
        expect(() => random.weighted([['a', 0]])).toThrow(RangeError);
        expect(() =>
          random.weighted([
            ['a', 2],
            ['b', -1],
          ]),
        ).toThrow(RangeError);
      });
    });
  });
});

describe('sequenceRandom', () => {
  describe('when it runs out of numbers', () => {
    it('throws, so a test notices an unexpected draw', () => {
      const random = sequenceRandom([0.5]);
      random.next();
      expect(() => random.next()).toThrow(/ran out/);
    });
  });
});
