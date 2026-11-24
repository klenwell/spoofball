import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { courtRadius } from './court';
import {
  DRILLER_ID,
  DRILL_COURT,
  DRILL_FRAMES,
  DUMMY_ID,
  PLAYER_CHARISMA,
  drillFrames,
  drillNames,
  edgeFor,
  playbackSpeed,
  runDrill,
  type Direction,
  type DrillName,
} from './drills';
import { heedProbability } from './spoof-ai';
import { FRAMES_PER_SCRUM, SCRUM_SECONDS, SECONDS_PER_FRAME } from './spoof-motion';
import { skillNames, type Skills } from './skills';
import { createSpoof, type Spoof } from './teams';
import { distance } from './vec';

/** A rook with 50 in every skill but these. */
function spoofWith(skills: Partial<Skills> = {}): Spoof {
  const base = Object.fromEntries(skillNames.map((n) => [n, 50])) as Record<keyof Skills, number>;
  return createSpoof('c7', 'Test', 'rook', { ...base, ...skills });
}

/** The candidate's path through a run. */
function path(spoof: Spoof, drill: DrillName, seed: number, direction?: Direction) {
  return runDrill(spoof, drill, { seed, direction }).result.frames.map((f) => {
    const me = f.spoofs.find((s) => s.id === DRILLER_ID);
    if (!me) throw new Error('no candidate in the frame');
    return me;
  });
}

/** The average of a measure over many seeded runs. */
function average(runs: number, measure: (seed: number) => number): number {
  let total = 0;
  for (let i = 0; i < runs; i += 1) total += measure(TEST_SEED + i * 7919);
  return total / runs;
}

function travelled(points: readonly { x: number; y: number }[], from = 0, to = points.length) {
  let total = 0;
  for (let i = from + 1; i < to; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += distance(a, b);
  }
  return total;
}

/** The frame the candidate reaches the edge it was sent to, or -1. */
function arrival(spoof: Spoof, seed: number): number {
  const target = edgeFor(-1, spoof.radius);
  return path(spoof, 'teamwork', seed, 'left').findIndex((p) => distance(p, target) <= p.radius);
}

describe('drill lengths', () => {
  it('plays every drill in about 3 seconds', () => {
    for (const drill of drillNames) {
      const seconds = (drillFrames(drill) * SECONDS_PER_FRAME) / playbackSpeed(drill);
      expect(seconds, drill).toBeCloseTo(3, 1);
    }
  });

  it('sprint and blow simulate a whole scrum, played about 2.7 times as fast', () => {
    for (const drill of ['sprint', 'blow'] as const) {
      expect(drillFrames(drill)).toBe(FRAMES_PER_SCRUM);
      expect(playbackSpeed(drill)).toBeCloseTo(SCRUM_SECONDS / 3, 2);
      expect(runDrill(spoofWith(), drill, { seed: TEST_SEED }).result.frames).toHaveLength(
        FRAMES_PER_SCRUM,
      );
    }
  });

  it('hold and teamwork play 3 seconds at match speed', () => {
    for (const drill of ['hold', 'teamwork'] as const) {
      expect(drillFrames(drill)).toBe(DRILL_FRAMES);
      expect(playbackSpeed(drill)).toBeCloseTo(1, 2);
    }
  });
});

describe('runDrill', () => {
  it('comes from its seed, and a rerun with a new seed varies', () => {
    const spoof = spoofWith();
    for (const drill of drillNames) {
      const run = (seed: number) => path(spoof, drill, seed, 'left');
      expect(run(1), drill).toEqual(run(1));
      expect(run(2), drill).not.toEqual(run(1));
    }
  });

  it('keeps the candidate on the drill court', () => {
    for (const drill of drillNames) {
      for (const p of path(spoofWith({ size: 99, burst: 99 }), drill, TEST_SEED, 'right')) {
        expect(Math.hypot(p.x, p.y) + p.radius).toBeLessThanOrEqual(
          courtRadius(DRILL_COURT) + 1e-9,
        );
      }
    }
  });

  it('puts a dummy only in hold, pushing the candidate', () => {
    for (const drill of drillNames) {
      const run = runDrill(spoofWith(), drill, { seed: TEST_SEED });
      const ids = run.entries.map((e) => e.spoof.id);
      expect(ids, drill).toEqual(drill === 'hold' ? [DRILLER_ID, DUMMY_ID] : [DRILLER_ID]);
    }
    const hits = average(10, (seed) => {
      const run = runDrill(spoofWith(), 'hold', { seed });
      return run.result.finish.find((f) => f.id === DRILLER_ID)?.stats.dongs ?? 0;
    });
    expect(hits).toBeGreaterThan(1);
  });

  it("keeps the candidate's own name and traits", () => {
    const spoof = spoofWith({ mass: 77 });
    const [entry] = runDrill(spoof, 'blow', { seed: TEST_SEED }).entries;
    expect(entry?.spoof).toEqual({ ...spoof, id: DRILLER_ID });
  });
});

// Each drill's outcome follows its traits (#73's criteria), over seeded runs.
// The PR has the full measurement: every skill, 200 runs each.
describe('the drills tell spoofs apart', () => {
  it('sprint shows burst: a quick spoof covers far more ground', () => {
    const ground = (burst: number) =>
      average(10, (seed) => travelled(path(spoofWith({ burst }), 'sprint', seed)));
    expect(ground(85)).toBeGreaterThan(ground(15) * 2.5);
  });

  it('sprint shows stamina: a tireless spoof keeps more of its pace in the second half', () => {
    const kept = (stamina: number) =>
      average(30, (seed) => {
        const p = path(spoofWith({ stamina }), 'sprint', seed);
        const half = Math.floor(p.length / 2);
        return travelled(p, half) / travelled(p, 0, half + 1);
      });
    expect(kept(85)).toBeGreaterThan(kept(15) + 0.12);
  });

  it('blow shows growth: a spoof that grows well ends far bigger than it started', () => {
    const growth = (g: number) =>
      average(10, (seed) => {
        const p = path(spoofWith({ growth: g }), 'blow', seed);
        return (p.at(-1)?.radius ?? 0) / (p[0]?.radius ?? 1);
      });
    expect(growth(85)).toBeGreaterThan(growth(15) + 0.25);
  });

  it('blow shows size: a big spoof starts and ends bigger', () => {
    const small = path(spoofWith({ size: 15 }), 'blow', TEST_SEED);
    const big = path(spoofWith({ size: 85 }), 'blow', TEST_SEED);
    expect(big[0]?.radius ?? 0).toBeGreaterThan((small[0]?.radius ?? 0) * 1.5);
    expect(big.at(-1)?.radius ?? 0).toBeGreaterThan(small.at(-1)?.radius ?? 0);
  });

  it('hold shows mass: a heavy spoof is pushed off the middle far less', () => {
    const drift = (mass: number) =>
      average(20, (seed) => {
        const p = path(spoofWith({ mass }), 'hold', seed);
        return p.reduce((sum, q) => sum + Math.hypot(q.x, q.y), 0) / p.length;
      });
    expect(drift(85)).toBeLessThan(drift(15) * 0.7);
  });

  it('teamwork shows cooperation: a cooperative spoof heeds you far more often', () => {
    const heeded = (cooperation: number) =>
      average(40, (seed) => (arrival(spoofWith({ cooperation }), seed) >= 0 ? 1 : 0));
    // An average sender: heeded as often as the spoof's cooperation, as a share.
    expect(heedProbability(PLAYER_CHARISMA, 70)).toBeCloseTo(0.7);
    expect(heeded(85)).toBeGreaterThan(0.7);
    expect(heeded(15)).toBeLessThan(0.3);
  });

  it('teamwork shows iq: a bright spoof that heeds you gets going sooner', () => {
    const soonest = (iq: number) => {
      const arrivals = Array.from({ length: 30 }, (_, i) =>
        arrival(spoofWith({ iq, cooperation: 99 }), TEST_SEED + i),
      ).filter((frame) => frame >= 0);
      return arrivals.reduce((a, b) => a + b, 0) / arrivals.length;
    };
    expect(soonest(85)).toBeLessThan(soonest(15) * 0.7);
  });

  it('teamwork without a message: the spoof waits in the middle', () => {
    for (const p of path(spoofWith(), 'teamwork', TEST_SEED)) {
      expect(Math.hypot(p.x, p.y)).toBe(0);
    }
  });

  it('teamwork sends it the way you said', () => {
    const spoof = spoofWith({ cooperation: 99, iq: 90 });
    for (const [direction, side] of [
      ['left', -1],
      ['right', 1],
    ] as const) {
      const end = path(spoof, 'teamwork', TEST_SEED, direction).at(-1);
      expect(Math.sign(end?.x ?? 0), direction).toBe(side);
    }
  });
});
