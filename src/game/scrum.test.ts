import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { presetScrumEntries } from '../test-support/scrum';
import { PROTOTYPE_SHOVE, impact } from './body';
import { generateSpoof } from './teams';
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
      brain: (_self, _scrum, _random, current) =>
        current ?? { kind: 'goto', point: corner, weight: 1, expires: null },
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

  describe('rules, one at a time', () => {
    // Small scrums of 2 or 3 spoofs, with a brain that controls each one.
    const base = presetScrumEntries()[0];
    if (!base) throw new Error('no entries');
    const entry = (
      id: string,
      team: string,
      position: { x: number; y: number },
      skills: Partial<typeof base.spoof.skills> = {},
    ): ScrumEntry => ({
      spoof: { ...base.spoof, id, skills: { ...base.spoof.skills, ...skills } },
      team,
      position,
      fatigue: 0,
    });
    const hold: Brain = (self, _scrum, _random, current) =>
      current ?? { kind: 'hold', point: self.position, weight: 1, expires: null };
    const statsOf = (r: ReturnType<typeof simulateScrum>, id: string) => {
      const f = r.finish.find((x) => x.id === id);
      if (!f) throw new Error(`no ${id}`);
      return f.stats;
    };

    it('gives the ding to the spoof that moves into a still opponent, and the dong to the one it hits', () => {
      const brain: Brain = (self, scrum, random, current) =>
        self.id === 'mover'
          ? (current ?? { kind: 'goto', point: { x: 0, y: 0 }, weight: 1, expires: null })
          : hold(self, scrum, random, current);
      const r = simulateScrum(
        [entry('mover', 'home', { x: 0, y: -80 }), entry('still', 'visitor', { x: 0, y: 0 })],
        { random: createRandom(TEST_SEED), brain },
      );
      expect(statsOf(r, 'mover').dings).toBeGreaterThan(0);
      expect(statsOf(r, 'mover').dongs).toBe(0);
      expect(statsOf(r, 'still').dongs).toBeGreaterThan(0);
      expect(statsOf(r, 'still').dings).toBe(0);
    });

    it('counts one hit when contact starts, not one for every frame two spoofs stay pressed together', () => {
      // The mover pushes on toward a spot beyond a heavy opponent, so with the
      // prototype shove they stay in contact for most of the scrum.
      const brain: Brain = (self, scrum, random, current) =>
        self.id === 'mover'
          ? (current ?? { kind: 'goto', point: { x: 0, y: 60 }, weight: 1, expires: null })
          : hold(self, scrum, random, current);
      const r = simulateScrum(
        [
          entry('mover', 'home', { x: 0, y: -60 }, { mass: 1 }),
          entry('wall', 'visitor', { x: 0, y: 0 }, { mass: 99 }),
        ],
        { random: createRandom(TEST_SEED), brain, collision: PROTOTYPE_SHOVE },
      );
      const inContact = r.frames.filter((f) => {
        const [a, b] = f.spoofs;
        return a && b && Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + 0.5;
      }).length;
      expect(inContact).toBeGreaterThan(100);
      expect(statsOf(r, 'mover').dings).toBeLessThan(5);
    });

    it('adds a dove, not a tree, for a frame overlapping exactly 1 teammate', () => {
      const r = simulateScrum(
        [entry('a', 'home', { x: -5, y: 0 }), entry('b', 'home', { x: 5, y: 0 })],
        { random: createRandom(TEST_SEED), brain: hold },
      );
      expect(statsOf(r, 'a').doves).toBe(FRAMES_PER_SCRUM);
      expect(statsOf(r, 'a').trees).toBe(0);
    });

    it('adds a tree, not a dove, for a frame overlapping 2 teammates', () => {
      const r = simulateScrum(
        [
          entry('a', 'home', { x: -5, y: 0 }),
          entry('b', 'home', { x: 5, y: 0 }),
          entry('c', 'home', { x: 0, y: 6 }),
        ],
        { random: createRandom(TEST_SEED), brain: hold },
      );
      expect(statsOf(r, 'a').trees).toBe(FRAMES_PER_SCRUM);
      expect(statsOf(r, 'a').doves).toBe(0);
    });

    it('ends a charge when it hits, so the next thought picks a new goal', () => {
      // The charge never expires on its own, so only a hit can end it. The
      // brain counts how often the charger has no goal when it thinks.
      let freshStarts = 0;
      const brain: Brain = (self, scrum, random, current) => {
        if (self.id !== 'charger') return hold(self, scrum, random, current);
        if (current) return current;
        freshStarts += 1;
        const target = scrum.spoofs.find((s) => s.id === 'target');
        return {
          kind: 'crash',
          point: target?.position ?? { x: 0, y: 0 },
          weight: 1,
          expires: 1000,
        };
      };
      simulateScrum(
        [entry('charger', 'home', { x: 0, y: -80 }), entry('target', 'visitor', { x: 0, y: 0 })],
        { random: createRandom(TEST_SEED), brain, collision: impact(1) },
      );
      expect(freshStarts).toBeGreaterThan(1);
    });

    describe('when a teammate sends a message', () => {
      // A leader (charisma 80, and impact and iq 99 so it messages often)
      // sends its goal to a receiver that otherwise holds.
      const exchange = (cooperation: number, seed: number, seen?: number[]) => {
        const brain: Brain = (self, _scrum, _random, current) => {
          if (self.id === 'leader') {
            return current ?? { kind: 'goto', point: { x: 0, y: 90 }, weight: 1, expires: null };
          }
          if (current && current.weight !== 1) seen?.push(current.weight);
          return current ?? { kind: 'hold', point: self.position, weight: 1, expires: null };
        };
        return simulateScrum(
          [
            entry('leader', 'home', { x: -60, y: 0 }, { charisma: 80, impact: 99, iq: 99 }),
            entry('receiver', 'home', { x: 60, y: 0 }, { cooperation }),
          ],
          { random: createRandom(seed), brain },
        );
      };

      it("passes the goal on with the sender's persuasion: charisma × 0.015", () => {
        const seen: number[] = [];
        for (let seed = 0; seed < 10; seed += 1) exchange(99, seed, seen);
        expect(seen.length).toBeGreaterThan(0);
        for (const weight of seen) expect(weight).toBeCloseTo(80 * 0.015);
      });

      it('is followed far more by a cooperative receiver: twice charisma × cooperation', () => {
        const followRate = (cooperation: number) => {
          let heeds = 0;
          let pongs = 0;
          for (let seed = 0; seed < 20; seed += 1) {
            const s = statsOf(exchange(cooperation, seed), 'receiver');
            heeds += s.heeds;
            pongs += s.pongs;
          }
          return heeds / pongs;
        };
        // 2 × 0.80 × 0.99 is over 1; 2 × 0.80 × 0.01 is 0.016.
        expect(followRate(99)).toBeGreaterThan(0.95);
        expect(followRate(1)).toBeLessThan(0.1);
      });
    });
  });

  describe("a teammate's message", () => {
    // A leader messages its goal (a spot at the bottom of the mosh) to a
    // teammate that otherwise just holds its spot. The teammate always
    // follows (charisma and cooperation 99), but only steers there at its
    // next thought, so a quick thinker moves off sooner than a slow one.
    const firstMove = (receiverIq: number, seed: number) => {
      const [leaderBase, receiverBase] = presetScrumEntries();
      if (!leaderBase || !receiverBase) throw new Error('no entries');
      const leaderSpoof = {
        ...leaderBase.spoof,
        id: 'leader',
        skills: { ...leaderBase.spoof.skills, charisma: 99, impact: 99, iq: 99 },
      };
      const receiverSpoof = {
        ...receiverBase.spoof,
        id: 'receiver',
        skills: { ...receiverBase.spoof.skills, cooperation: 99, iq: receiverIq },
      };
      const entries: ScrumEntry[] = [
        { spoof: leaderSpoof, team: 'home', position: { x: -60, y: 0 }, fatigue: 0 },
        { spoof: receiverSpoof, team: 'home', position: { x: 60, y: 0 }, fatigue: 0 },
      ];
      const brain: Brain = (self, _scrum, _random, current) =>
        current ??
        (self.id === 'leader'
          ? { kind: 'goto', point: { x: 0, y: 90 }, weight: 1, expires: null }
          : { kind: 'hold', point: self.position, weight: 1, expires: null });
      const r = simulateScrum(entries, { random: createRandom(seed), brain });
      const index = r.frames.findIndex((f) => {
        const s = f.spoofs[1];
        return s !== undefined && Math.hypot(s.x - 60, s.y) > 2;
      });
      return index === -1 ? FRAMES_PER_SCRUM : index;
    };
    const average = (iq: number) => {
      let sum = 0;
      for (let seed = 0; seed < 30; seed += 1) sum += firstMove(iq, seed);
      return sum / 30;
    };

    it('is acted on at the next thought, so a quick thinker moves off sooner', () => {
      expect(average(1)).toBeGreaterThan(average(99) + 30);
    });
  });

  describe('goals', () => {
    it('as a charge are given up when they expire', () => {
      // The first idea: charge a far spot, given up after half a second. The
      // brain keeps whatever goal it has, so only expiry can end the charge.
      // After it: the opposite side.
      let calls = 0;
      const brain: Brain = (_self, _scrum, _random, current) => {
        if (current) return current;
        calls += 1;
        return calls === 1
          ? { kind: 'crash', point: { x: 0, y: -120 }, weight: 1, expires: 0.5 }
          : { kind: 'goto', point: { x: 0, y: 120 }, weight: 1, expires: null };
      };
      const [one] = presetScrumEntries();
      if (!one) throw new Error('no entries');
      const alone = [{ ...one, position: { x: 0, y: 0 } }];
      const end = simulateScrum(alone, { random: createRandom(TEST_SEED), brain }).frames[
        FRAMES_PER_SCRUM - 1
      ];
      expect(end?.spoofs[0]?.y).toBeGreaterThan(40);
    });

    it('are re-aimed at every thought, so a spoof knocked off course heads back', () => {
      // A spoof heads for the crush, past a heavy opponent that holds its spot
      // and knocks it aside with a full bounce. Re-aiming at each thought
      // brings it back toward the crush.
      const runner = presetScrumEntries()[0];
      if (!runner) throw new Error('no entries');
      const wall = generateSpoof('wall', 'rook', 600, createRandom(5));
      const heavyWall = { ...wall, skills: { ...wall.skills, mass: 99 } };
      const keepGoing: Brain = (self, _scrum, _random, current) =>
        current ??
        (self.id === 'wall'
          ? { kind: 'hold', point: self.position, weight: 1, expires: null }
          : { kind: 'goto', point: { x: 0, y: 0 }, weight: 1, expires: null });
      let total = 0;
      for (let seed = 0; seed < 20; seed += 1) {
        const entries: ScrumEntry[] = [
          { ...runner, position: { x: 15, y: -110 } },
          { spoof: heavyWall, team: 'visitor', position: { x: 0, y: -60 }, fatigue: 0 },
        ];
        const r = simulateScrum(entries, {
          random: createRandom(seed),
          brain: keepGoing,
          collision: impact(1),
        });
        let near = 0;
        for (const frame of r.frames) {
          const s = frame.spoofs[0];
          if (s && Math.hypot(s.x, s.y) < 50) near += 1;
        }
        total += near / r.frames.length;
      }
      expect(total / 20).toBeGreaterThan(0.3);
    });

    it('as a charge at an opponent lead to hits', () => {
      const charge: Brain = (self, scrum) => {
        const target = scrum.spoofs.find((s) => s.team !== self.team);
        return target
          ? { kind: 'crash', point: target.position, weight: 1, expires: scrum.secondsGone + 1.5 }
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
