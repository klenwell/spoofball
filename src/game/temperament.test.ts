import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { createRandom } from './random';
import { spoofTypes } from './spoof-types';
import {
  MAX_TEMPERAMENT,
  MIN_TEMPERAMENT,
  TEMPERAMENT_SPREAD,
  drawTemperament,
  typeTemperament,
} from './temperament';

describe('typeTemperament', () => {
  it('gives every spoof type an average', () => {
    expect(Object.keys(typeTemperament).sort()).toEqual([...spoofTypes].sort());
  });

  it('runs angry pawns hottest and noble pawns calmest', () => {
    const values = spoofTypes.map((t) => typeTemperament[t]);
    expect(typeTemperament['pawn-angry']).toBe(Math.max(...values));
    expect(typeTemperament['pawn-noble']).toBe(Math.min(...values));
  });
});

describe('drawTemperament', () => {
  it('gives the same temperament for the same seed', () => {
    expect(drawTemperament('knight', createRandom(TEST_SEED))).toBe(
      drawTemperament('knight', createRandom(TEST_SEED)),
    );
  });

  it.each(spoofTypes)("keeps a %s within its type's spread and the limits", (type) => {
    for (let seed = 0; seed < 100; seed += 1) {
      const value = drawTemperament(type, createRandom(seed));
      expect(value).toBeGreaterThanOrEqual(
        Math.max(MIN_TEMPERAMENT, typeTemperament[type] - TEMPERAMENT_SPREAD),
      );
      expect(value).toBeLessThanOrEqual(
        Math.min(MAX_TEMPERAMENT, typeTemperament[type] + TEMPERAMENT_SPREAD),
      );
    }
  });

  it("centers on the type's average", () => {
    const random = createRandom(TEST_SEED);
    let sum = 0;
    for (let i = 0; i < 2000; i += 1) sum += drawTemperament('rook', random);
    expect(sum / 2000).toBeCloseTo(typeTemperament.rook, 1);
  });
});
