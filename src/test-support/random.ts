import { randomFrom, type Random } from '../game/random';

/** Seeds used across tests, so a failure can be reproduced by name. */
export const TEST_SEED = 20261121;

/**
 * A random source that returns exactly these numbers, in order, for tests that
 * need to control each draw. It throws when they run out, so a test notices
 * if the code draws more often than expected.
 */
export function sequenceRandom(values: readonly number[]): Random {
  let index = 0;
  return randomFrom(() => {
    const value = values[index];
    if (value === undefined)
      throw new Error(`sequenceRandom ran out after ${String(values.length)} draws`);
    index += 1;
    return value;
  });
}
