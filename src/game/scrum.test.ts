import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { presetScrumEntries } from '../test-support/scrum';
import { PROTOTYPE_SHOVE, impact } from './body';
import { COURT_RADIUS, zoneAt, zoneMultiplier } from './court';
import { createRandom } from './random';
import { headForCrush, simulateScrum, type Brain, type ScrumEntry, type ScrumFrame } from './scrum';
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

  it('moves spoofs toward their goal: with a brain that always picks the crush, they close in on it', () => {
    const start = presetScrumEntries();
    const toCrush = simulateScrum(start, { random: createRandom(TEST_SEED), brain: headForCrush });
    const end = toCrush.frames[toCrush.frames.length - 1];
    const before = start.reduce((sum, e) => sum + Math.hypot(e.position.x, e.position.y), 0);
    const after = end?.spoofs.reduce((sum, s) => sum + Math.hypot(s.x, s.y), 0) ?? Infinity;
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
      brain: (_self, scrum) => ({
        kind: 'goto',
        point: corner,
        value: 1,
        expires: scrum.secondsGone + 3,
      }),
    });
    const end = result2.frames[result2.frames.length - 1];
    const meanY = (end?.spoofs.reduce((sum, s) => sum + s.y, 0) ?? 0) / entries.length;
    expect(meanY).toBeGreaterThan(40);
  });

  describe('with the spoof AI', () => {
    const many = Array.from({ length: 20 }, (_, seed) => run(seed));

    it('follows or ignores every message it receives', () => {
      for (const r of many) {
        for (const f of r.finish) expect(f.stats.heeds + f.stats.jecks).toBe(f.stats.pongs);
      }
    });

    it('never receives more messages than were sent', () => {
      for (const r of many) {
        const sent = r.finish.reduce((sum, f) => sum + f.stats.pings, 0);
        const received = r.finish.reduce((sum, f) => sum + f.stats.pongs, 0);
        expect(received).toBeLessThanOrEqual(sent);
      }
    });

    it('counts every hit once for the hitter and once for the one hit', () => {
      for (const r of many) {
        const dings = r.finish.reduce((sum, f) => sum + f.stats.dings, 0);
        const dongs = r.finish.reduce((sum, f) => sum + f.stats.dongs, 0);
        expect(dings).toBe(dongs);
      }
    });

    it('thinks, messages, hits and overlaps teammates in a typical scrum', () => {
      const total = (key: keyof (typeof many)[number]['finish'][number]['stats']) =>
        many.reduce((sum, r) => sum + r.finish.reduce((s2, f) => s2 + f.stats[key], 0), 0);
      for (const key of [
        'imps',
        'pings',
        'pongs',
        'heeds',
        'jecks',
        'dings',
        'doves',
        'trees',
      ] as const) {
        expect(total(key), key).toBeGreaterThan(0);
      }
    });

    it('plays smart, far-sighted spoofs visibly better than dim, short-sighted ones', () => {
      // The same lineup, with one team's iq and vision at 95 and the other's at 5.
      const tune = (e: ScrumEntry, level: number): ScrumEntry => ({
        ...e,
        spoof: { ...e.spoof, skills: { ...e.spoof.skills, iq: level, vision: level } },
      });
      const zoneScore = (seedCount: number, home: number, visitor: number) => {
        let homeScore = 0;
        let visitorScore = 0;
        for (let seed = 0; seed < seedCount; seed += 1) {
          const entries = presetScrumEntries().map((e) =>
            tune(e, e.team === 'home' ? home : visitor),
          );
          const end = run(seed, entries).frames[FRAMES_PER_SCRUM - 1];
          for (const s of end?.spoofs ?? []) {
            const value = zoneMultiplier[zoneAt(s.x, s.y)];
            if (s.team === 'home') homeScore += value;
            else visitorScore += value;
          }
        }
        return { homeScore, visitorScore };
      };
      // Swap which team is smart, so the lineup itself can't explain the result.
      const homeSmart = zoneScore(30, 95, 5);
      const visitorSmart = zoneScore(30, 5, 95);
      expect(homeSmart.homeScore).toBeGreaterThan(homeSmart.visitorScore);
      expect(visitorSmart.visitorScore).toBeGreaterThan(visitorSmart.homeScore);
    });
  });

  describe('goals', () => {
    it('are given up when they expire, so a weaker new idea can take over', () => {
      // First idea: a far spot, worth a lot, given up after half a second.
      // Every idea after: the opposite side, worth little.
      let calls = 0;
      const brain: Brain = (_self, scrum) => {
        calls += 1;
        return calls === 1
          ? { kind: 'goto', point: { x: 0, y: -120 }, value: 100, expires: 0.5 }
          : { kind: 'goto', point: { x: 0, y: 120 }, value: 1, expires: scrum.secondsGone + 3 };
      };
      const [one, two] = presetScrumEntries();
      if (!one || !two) throw new Error('no entries');
      const alone = [{ ...one, position: { x: 0, y: 0 } }];
      const end = simulateScrum(alone, { random: createRandom(TEST_SEED), brain }).frames[
        FRAMES_PER_SCRUM - 1
      ];
      expect(end?.spoofs[0]?.y).toBeGreaterThan(40);
    });

    it('as a charge at an opponent lead to hits', () => {
      const charge: Brain = (self, scrum) => {
        const target = scrum.spoofs.find((s) => s.team !== self.team);
        return target
          ? { kind: 'crash', point: target.position, value: 5, expires: scrum.secondsGone + 1.5 }
          : null;
      };
      const r = simulateScrum(presetScrumEntries(), {
        random: createRandom(TEST_SEED),
        brain: charge,
      });
      expect(r.finish.reduce((sum, f) => sum + f.stats.dings, 0)).toBeGreaterThan(5);
    });
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
