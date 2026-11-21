/**
 * A seeded random source (#34). Everything random in the game draws from one
 * of these, never from `Math.random()`, so a match can be replayed exactly
 * from its seed and tests get the same numbers every run.
 *
 * The generator is mulberry32: a few lines, fast, and good enough for a game.
 * It isn't for anything security-related.
 */

export interface Random {
  /** A number in [0, 1). */
  next(): number;
  /** A number in [min, max). */
  uniform(min: number, max: number): number;
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number;
  /** True with the given probability, from 0 (never) to 1 (always). */
  chance(probability: number): boolean;
  /** One item of a non-empty list, each equally likely. */
  pick<T>(items: readonly T[]): T;
  /** One item of a non-empty list, in proportion to its weight. */
  weighted<T>(choices: readonly (readonly [T, number])[]): T;
}

/** Wraps any source of numbers in [0, 1) with the helpers above. */
export function randomFrom(next: () => number): Random {
  const random: Random = {
    next,
    uniform: (min, max) => min + next() * (max - min),
    int: (min, max) => {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(
          `int needs whole numbers with min <= max, got ${String(min)}, ${String(max)}`,
        );
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    chance: (probability) => {
      if (!(probability >= 0 && probability <= 1)) {
        throw new RangeError(`A probability must be from 0 to 1, got ${String(probability)}`);
      }
      return next() < probability;
    },
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick needs at least one item');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (choices) => {
      const total = choices.reduce((sum, [, weight]) => {
        if (!(weight >= 0))
          throw new RangeError(`A weight must be 0 or more, got ${String(weight)}`);
        return sum + weight;
      }, 0);
      if (!(total > 0)) throw new RangeError('weighted needs a choice with a positive weight');
      let remaining = next() * total;
      for (const [item, weight] of choices) {
        if (remaining < weight) return item;
        remaining -= weight;
      }
      // Floating-point rounding can leave a sliver past the last weight:
      // fall back to the last choice that can be picked.
      for (let i = choices.length - 1; i >= 0; i -= 1) {
        const choice = choices[i];
        if (choice && choice[1] > 0) return choice[0];
      }
      throw new RangeError('weighted needs a choice with a positive weight');
    },
  };
  return random;
}

/** A random source that always gives the same sequence for the same seed. */
export function createRandom(seed: number): Random {
  if (!Number.isInteger(seed))
    throw new RangeError(`A seed must be a whole number, got ${String(seed)}`);
  let state = seed >>> 0;
  return randomFrom(() => {
    // mulberry32 (Tommy Ettinger, public domain).
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}
