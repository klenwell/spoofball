import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { createPool } from './combine';
import { courtRadius } from './court';
import { createRandom } from './random';
import { FRAMES_PER_SCRUM } from './spoof-motion';
import { createSpoof, generateSpoof, type Spoof } from './teams';
import { length, distance } from './vec';
import { WARM_UP_CELL, startWarmUp, stepWarmUp, warmUpSeed, type WarmUp } from './warm-up';

/** A warm-up run for `frames` frames, with every position it passed through. */
function run(spoof: Spoof, frames = FRAMES_PER_SCRUM * 2, seed = TEST_SEED) {
  let warmUp: WarmUp = startWarmUp(spoof, seed);
  const path = [warmUp.position];
  for (let i = 0; i < frames; i += 1) {
    warmUp = stepWarmUp(warmUp);
    path.push(warmUp.position);
  }
  return path;
}

/** How far a spoof travels in its path. */
const travelled = (path: ReturnType<typeof run>) =>
  path.slice(1).reduce((sum, p, i) => sum + distance(p, path[i] ?? p), 0);

/** A spoof with these skills, otherwise a typical rook. */
function spoofWith(skills: Partial<Spoof['skills']>): Spoof {
  const base = generateSpoof('a', 'rook', 528, createRandom(TEST_SEED));
  return createSpoof('a', 'Test', 'rook', { ...base.skills, ...skills }, base.temperament);
}

describe('stepWarmUp', () => {
  it('keeps the whole spoof inside its cell, every frame', () => {
    for (const { spoof } of createPool(TEST_SEED)) {
      for (const p of run(spoof)) {
        expect(length(p) + spoof.radius).toBeLessThanOrEqual(courtRadius(WARM_UP_CELL) + 1e-9);
      }
    }
  });

  it('moves: every candidate gets around its cell', () => {
    for (const { spoof } of createPool(TEST_SEED)) {
      expect(travelled(run(spoof))).toBeGreaterThan(100);
    }
  });

  it('shows burst: a quick spoof covers more ground than a slow one', () => {
    const quick = travelled(run(spoofWith({ burst: 90 })));
    const slow = travelled(run(spoofWith({ burst: 15 })));
    expect(quick).toBeGreaterThan(slow * 2);
  });

  it('comes from its seed: the same seed, the same warm-up', () => {
    const spoof = spoofWith({});
    expect(run(spoof, 200, 7)).toEqual(run(spoof, 200, 7));
    expect(run(spoof, 200, 8)).not.toEqual(run(spoof, 200, 7));
  });
});

describe('warmUpSeed', () => {
  it('gives each candidate in a pool its own whole-number seed', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => warmUpSeed(TEST_SEED, i));
    expect(new Set(seeds).size).toBe(10);
    for (const seed of seeds) expect(Number.isInteger(seed)).toBe(true);
  });
});
