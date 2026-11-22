import { describe, expect, it } from 'vitest';
import type { Hit, ScrumFrame, SpoofFrame } from '../game/scrum';
import { SECONDS_PER_FRAME } from '../game/spoof-motion';
import {
  IMPACT_SECONDS,
  SQUASH_DEPTH,
  impactsAt,
  ringAt,
  showsRing,
  showsSquash,
  squashOf,
  squashPivot,
  type Impact,
} from './impacts';

const hit = (hitter = 'a', hitee = 'b', x = 0, y = 0): Hit => ({ hitter, hit: hitee, x, y });

/** Frames with no spoofs: only the hits matter here. `hitsOn[k]` go on frame k. */
function framesWith(count: number, hitsOn: Record<number, Hit[]>): ScrumFrame[] {
  return Array.from({ length: count }, (_, k) => ({ clock: 0, spoofs: [], hits: hitsOn[k] ?? [] }));
}

const spoofAt = (id: string, x: number, y: number): SpoofFrame => ({
  id,
  team: 'home',
  x,
  y,
  radius: 10,
  fatigue: 0,
});

describe('impactsAt', () => {
  const frames = framesWith(100, { 10: [hit()] });
  const hitTime = 10 * SECONDS_PER_FRAME;

  it('shows a cue from the moment of the hit, at age 0', () => {
    const showing = impactsAt(frames, hitTime);
    expect(showing).toHaveLength(1);
    expect(showing[0]?.age).toBeCloseTo(0);
  });

  it('shows nothing before the hit', () => {
    expect(impactsAt(frames, hitTime - SECONDS_PER_FRAME / 2)).toEqual([]);
  });

  it('ages the cue with the playback clock: halfway through, it is at age 0.5', () => {
    expect(impactsAt(frames, hitTime + IMPACT_SECONDS / 2)[0]?.age).toBeCloseTo(0.5);
  });

  it('ends the cue after its length, about a sixth of a second', () => {
    expect(IMPACT_SECONDS).toBeCloseTo(1 / 6);
    expect(impactsAt(frames, hitTime + IMPACT_SECONDS * 0.99)).toHaveLength(1);
    expect(impactsAt(frames, hitTime + IMPACT_SECONDS)).toEqual([]);
  });

  it('takes the length it is given', () => {
    expect(impactsAt(frames, hitTime + 0.3, 0.4)).toHaveLength(1);
    expect(impactsAt(frames, hitTime + 0.3, 0.2)).toEqual([]);
  });

  it('shows nothing with a length of 0', () => {
    expect(impactsAt(frames, hitTime, 0)).toEqual([]);
  });

  it('shows every hit still within its length, including several at once', () => {
    const busy = framesWith(100, { 10: [hit('a', 'b')], 12: [hit('c', 'd'), hit('e', 'f')] });
    const showing = impactsAt(busy, 12 * SECONDS_PER_FRAME);
    expect(showing.map((i) => i.hitter).sort()).toEqual(['a', 'c', 'e']);
  });

  it('depends only on the playback clock, so a paused scrum shows the same cue every frame', () => {
    const paused = hitTime + IMPACT_SECONDS / 3;
    expect(impactsAt(frames, paused)).toEqual(impactsAt(frames, paused));
  });

  it('shows each hit for several drawn frames at any common display rate', () => {
    // Every hit in a real scrum: frames 1 to 99, one each.
    const many = framesWith(
      100,
      Object.fromEntries(Array.from({ length: 99 }, (_, k) => [k + 1, [hit(`h${String(k + 1)}`)]])),
    );
    for (const rate of [30, 60, 120, 144]) {
      const seen = new Map<string, number>();
      for (let n = 0; n / rate < 100 * SECONDS_PER_FRAME + 1; n += 1) {
        for (const i of impactsAt(many, n / rate))
          seen.set(i.hitter, (seen.get(i.hitter) ?? 0) + 1);
      }
      for (let k = 1; k < 99; k += 1) {
        expect(seen.get(`h${String(k)}`), `${String(rate)} fps`).toBeGreaterThanOrEqual(
          Math.floor(rate / 6) - 1,
        );
      }
    }
  });
});

describe('cue styles', () => {
  it('draws the ring for "ring" and "both" only', () => {
    expect([showsRing('ring'), showsRing('both'), showsRing('squash'), showsRing('none')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('squashes for "squash" and "both" only', () => {
    expect([
      showsSquash('squash', false),
      showsSquash('both', false),
      showsSquash('ring', false),
      showsSquash('none', false),
    ]).toEqual([true, true, false, false]);
  });

  it('never squashes when the player has asked for reduced motion', () => {
    expect(showsSquash('squash', true)).toBe(false);
    expect(showsSquash('both', true)).toBe(false);
  });
});

describe('ringAt', () => {
  it('bursts outward and thins as the cue goes on', () => {
    const early = ringAt(0, false);
    const late = ringAt(0.8, false);
    expect(late.radius).toBeGreaterThan(early.radius);
    expect(late.width).toBeLessThan(early.width);
  });

  it('fades from fully drawn to gone', () => {
    expect(ringAt(0, false).opacity).toBe(1);
    expect(ringAt(0.5, false).opacity).toBeCloseTo(0.5);
    expect(ringAt(1, false).opacity).toBe(0);
  });

  it('eases out: it grows more in the first half than the second', () => {
    const start = ringAt(0, false).radius;
    const middle = ringAt(0.5, false).radius;
    const end = ringAt(1, false).radius;
    expect(middle - start).toBeGreaterThan(end - middle);
  });

  it('with reduced motion, stays one size and only fades', () => {
    expect(ringAt(0, true).radius).toBe(ringAt(0.9, true).radius);
    expect(ringAt(0.5, true).opacity).toBeCloseTo(0.5);
  });
});

describe('squashOf', () => {
  const impact = (age: number, x: number, y: number, hitter = 'a', hitee = 'b'): Impact => ({
    hitter,
    hit: hitee,
    x,
    y,
    age,
  });

  it('leaves a spoof alone when it is in no showing impact', () => {
    expect(squashOf(spoofAt('c', 0, 0), [impact(0, 10, 0)])).toBeNull();
  });

  it('squashes both the hitter and the one hit', () => {
    expect(squashOf(spoofAt('a', 0, 0), [impact(0, 10, 0)])).not.toBeNull();
    expect(squashOf(spoofAt('b', 20, 0), [impact(0, 10, 0)])).not.toBeNull();
  });

  it('flattens a spoof toward where it was hit', () => {
    expect(squashOf(spoofAt('a', 0, 0), [impact(0, 0, 10)])?.angle).toBeCloseTo(Math.PI / 2);
    expect(squashOf(spoofAt('b', 20, 0), [impact(0, 10, 0)])?.angle).toBeCloseTo(Math.PI);
  });

  it('is deepest at the hit and eases back as the cue ends', () => {
    expect(squashOf(spoofAt('a', 0, 0), [impact(0, 10, 0)])?.amount).toBeCloseTo(SQUASH_DEPTH);
    expect(squashOf(spoofAt('a', 0, 0), [impact(0.75, 10, 0)])?.amount).toBeCloseTo(
      SQUASH_DEPTH / 4,
    );
  });

  it('follows the freshest hit when a spoof is in two at once', () => {
    const squash = squashOf(spoofAt('a', 0, 0), [impact(0.8, 10, 0), impact(0.1, 0, 10, 'c', 'a')]);
    expect(squash?.angle).toBeCloseTo(Math.PI / 2);
    expect(squash?.amount).toBeCloseTo(SQUASH_DEPTH * 0.9);
  });
});

describe('squashPivot', () => {
  it("is the disc's edge on the side it was hit, so that edge stays touching", () => {
    const pivot = squashPivot({ x: 100, y: 50 }, 20, { angle: Math.PI / 2, amount: 0.2 });
    expect(pivot.x).toBeCloseTo(100);
    expect(pivot.y).toBeCloseTo(70);
  });
});
