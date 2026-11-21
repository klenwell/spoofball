import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { presetScrumEntries } from '../test-support/scrum';
import { PROTOTYPE_SHOVE, impact } from './body';
import { COURT_RADIUS } from './court';
import { createRandom } from './random';
import { simulateScrum, type ScrumEntry, type ScrumFrame } from './scrum';
import { FRAMES_PER_SCRUM, MAX_BLOW_RADIUS, SCRUM_SECONDS } from './spoof-motion';

const run = (seed = TEST_SEED, entries: ScrumEntry[] = presetScrumEntries()) =>
  simulateScrum(entries, { random: createRandom(seed) });

function at(frame: ScrumFrame | undefined, id: string) {
  const spoof = frame?.spoofs.find((s) => s.id === id);
  if (!spoof) throw new Error(`no ${id} in frame`);
  return spoof;
}

describe('simulateScrum', () => {
  const result = run();
  const { frames } = result;
  const first = frames[0];
  const last = frames[frames.length - 1];

  it('runs 8 seconds as 300 frames, with the clock counting down to 0', () => {
    expect(frames).toHaveLength(FRAMES_PER_SCRUM);
    expect(first?.clock).toBeCloseTo(SCRUM_SECONDS - SCRUM_SECONDS / FRAMES_PER_SCRUM);
    expect(last?.clock).toBe(0);
  });

  it('records every placed spoof in every frame, with position, radius and fatigue', () => {
    for (const frame of frames) {
      expect(frame.spoofs.map((s) => s.id)).toEqual(presetScrumEntries().map((e) => e.spoof.id));
    }
    expect(Object.keys(first?.spoofs[0] ?? {}).sort()).toEqual(
      ['fatigue', 'id', 'radius', 'team', 'x', 'y'].sort(),
    );
  });

  it('gives exactly the same frames for the same seed', () => {
    expect(run()).toEqual(result);
  });

  it('gives different frames for a different seed', () => {
    expect(run(TEST_SEED + 1).frames).not.toEqual(frames);
  });

  it('keeps every spoof wholly on the court in every frame', () => {
    for (const frame of frames) {
      for (const s of frame.spoofs) {
        expect(Math.hypot(s.x, s.y) + s.radius).toBeLessThanOrEqual(COURT_RADIUS + 1e-9);
      }
    }
  });

  it('moves spoofs toward their goal: with the stand-in brain, they close in on the crush', () => {
    const start = presetScrumEntries();
    const before = start.reduce((sum, e) => sum + Math.hypot(e.position.x, e.position.y), 0);
    const after = last?.spoofs.reduce((sum, s) => sum + Math.hypot(s.x, s.y), 0) ?? Infinity;
    expect(after).toBeLessThan(before * 0.6);
  });

  it('grows spoofs over the scrum, never past the largest size', () => {
    for (const entry of presetScrumEntries()) {
      const end = at(last, entry.spoof.id);
      expect(end.radius, entry.spoof.id).toBeGreaterThan(entry.spoof.radius);
      expect(end.radius).toBeLessThanOrEqual(MAX_BLOW_RADIUS);
    }
  });

  it('only grows: a spoof never shrinks from one frame to the next', () => {
    for (let i = 1; i < frames.length; i += 1) {
      frames[i]?.spoofs.forEach((s, k) => {
        expect(s.radius).toBeGreaterThanOrEqual(frames[i - 1]?.spoofs[k]?.radius ?? 0);
      });
    }
  });

  it('tires spoofs: fatigue rises, and growth, burst and iq drop', () => {
    for (const entry of presetScrumEntries()) {
      const finish = result.finish.find((f) => f.id === entry.spoof.id);
      expect(finish?.fatigue, entry.spoof.id).toBeGreaterThan(3);
      expect(finish?.skills.burst).toBeLessThan(entry.spoof.skills.burst);
      expect(finish?.skills.growth).toBeLessThan(entry.spoof.skills.growth);
      expect(finish?.skills.iq).toBeLessThan(entry.spoof.skills.iq);
      expect(finish?.skills.mass).toBe(entry.spoof.skills.mass);
    }
  });

  it('carries fatigue in: a spoof starting tired ends more tired', () => {
    const tired = presetScrumEntries().map((e) => ({ ...e, fatigue: 30 }));
    const finish = run(TEST_SEED, tired).finish;
    for (const f of finish) expect(f.fatigue).toBeGreaterThan(30);
  });

  it('plays differently with a different collision rule', () => {
    const entries = presetScrumEntries();
    const shove = simulateScrum(entries, {
      random: createRandom(TEST_SEED),
      collision: PROTOTYPE_SHOVE,
    });
    const bounce = simulateScrum(entries, {
      random: createRandom(TEST_SEED),
      collision: impact(1),
    });
    expect(bounce.frames).not.toEqual(shove.frames);
  });

  it('uses the brain it is given to pick goals', () => {
    const corner = { x: 0, y: 120 };
    const entries = presetScrumEntries();
    const result2 = simulateScrum(entries, {
      random: createRandom(TEST_SEED),
      brain: () => corner,
    });
    const end = result2.frames[result2.frames.length - 1];
    const meanY = (end?.spoofs.reduce((sum, s) => sum + s.y, 0) ?? 0) / entries.length;
    expect(meanY).toBeGreaterThan(40);
  });

  describe('when two spoofs share an id', () => {
    it('refuses the entries', () => {
      const entries = presetScrumEntries();
      const [one] = entries;
      if (!one) throw new Error('no entries');
      expect(() => run(TEST_SEED, [one, one])).toThrow(RangeError);
    });
  });
});
