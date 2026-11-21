import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLISION_RULE,
  PROTOTYPE_SHOVE,
  collides,
  impact,
  overlaps,
  resolveCollision,
  type Body,
} from './body';
import { distance, dot, length, subtract, vec, type Vec } from './vec';

function body(x: number, y: number, overrides: Partial<Body> = {}): Body {
  return {
    position: vec(x, y),
    velocity: vec(0, 0),
    radius: 10,
    mass: 1,
    team: 'home',
    ...overrides,
  };
}

function momentum(...bodies: Body[]): Vec {
  return bodies.reduce(
    (sum, b) => vec(sum.x + b.velocity.x * b.mass, sum.y + b.velocity.y * b.mass),
    vec(0, 0),
  );
}

function kineticEnergy(...bodies: Body[]): number {
  return bodies.reduce((sum, b) => sum + 0.5 * b.mass * length(b.velocity) ** 2, 0);
}

/** Two spoofs running at each other head-on, a on the left moving right. */
function headOn(massA = 1, massB = 1): [Body, Body] {
  return [
    body(0, 0, { velocity: vec(2, 0), mass: massA }),
    body(15, 0, { velocity: vec(-2, 0), mass: massB, team: 'visitor' }),
  ];
}

describe('overlaps', () => {
  it('is true when two circles overlap', () => {
    expect(overlaps(body(0, 0), body(19, 0))).toBe(true);
  });

  it('is false when they only touch', () => {
    expect(overlaps(body(0, 0), body(20, 0))).toBe(false);
  });

  it('is false when they are apart', () => {
    expect(overlaps(body(0, 0), body(30, 0))).toBe(false);
  });
});

describe('collides', () => {
  it('is true for overlapping opponents', () => {
    expect(collides(body(0, 0), body(15, 0, { team: 'visitor' }))).toBe(true);
  });

  describe('when the bodies are teammates', () => {
    it('is false, however much they overlap', () => {
      expect(collides(body(0, 0), body(5, 0))).toBe(false);
      expect(collides(body(0, 0), body(0, 0))).toBe(false);
    });
  });
});

describe('impact', () => {
  it('makes an impact rule with a bounciness from 0 to 1', () => {
    expect(impact(0.25)).toEqual({ kind: 'impact', bounciness: 0.25 });
  });

  describe('when the bounciness is outside 0 to 1', () => {
    it('refuses it', () => {
      expect(() => impact(1.5)).toThrow(RangeError);
      expect(() => impact(-0.1)).toThrow(RangeError);
      expect(() => impact(Number.NaN)).toThrow(RangeError);
    });
  });
});

describe('resolveCollision', () => {
  it('defaults to a bit of bounce, 0.4, in the range the owner liked on #49', () => {
    expect(DEFAULT_COLLISION_RULE).toEqual(impact(0.4));
  });

  describe.each([
    ['the prototype shove', PROTOTYPE_SHOVE],
    ['a thud (bounciness 0)', impact(0)],
    ['a full bounce (bounciness 1)', impact(1)],
  ])('with %s', (_name, rule) => {
    it('pushes overlapping opponents apart until they only touch', () => {
      const [a2, b2] = resolveCollision(...headOn(), rule);
      expect(distance(a2.position, b2.position)).toBeCloseTo(20);
      expect(overlaps(a2, b2)).toBe(false);
    });

    it('moves the lighter one more', () => {
      const light = body(0, 0, { mass: 1 });
      const heavy = body(16, 0, { mass: 3, team: 'visitor' });
      const [light2, heavy2] = resolveCollision(light, heavy, rule);
      expect(distance(light.position, light2.position)).toBeCloseTo(3);
      expect(distance(heavy.position, heavy2.position)).toBeCloseTo(1);
    });

    it('separates two opponents on exactly the same spot, the same way every time', () => {
      const a = body(5, 5);
      const b = body(5, 5, { team: 'visitor' });
      const first = resolveCollision(a, b, rule);
      expect(overlaps(...first)).toBe(false);
      expect(resolveCollision(a, b, rule)).toEqual(first);
    });

    it('leaves overlapping teammates untouched', () => {
      const a = body(0, 0, { velocity: vec(2, 0) });
      const b = body(5, 0, { velocity: vec(-2, 0) });
      const [a2, b2] = resolveCollision(a, b, rule);
      expect(a2).toBe(a);
      expect(b2).toBe(b);
    });

    it('leaves opponents that do not overlap untouched', () => {
      const a = body(0, 0, { velocity: vec(2, 0) });
      const b = body(25, 0, { team: 'visitor' });
      expect(resolveCollision(a, b, rule)).toEqual([a, b]);
    });

    it('refuses a mass that is not positive', () => {
      const a = body(0, 0, { mass: 0 });
      const b = body(15, 0, { team: 'visitor' });
      expect(() => resolveCollision(a, b, rule)).toThrow(RangeError);
    });
  });

  describe("with the prototype's shove", () => {
    it('keeps both velocities, so spoofs steering into each other keep pushing', () => {
      const [a, b] = headOn();
      const [a2, b2] = resolveCollision(a, b, PROTOTYPE_SHOVE);
      expect([a2.velocity, b2.velocity]).toEqual([a.velocity, b.velocity]);
    });
  });

  describe('with an impact', () => {
    it.each([0, 0.25, 0.5, 1])('keeps momentum at bounciness %s', (bounciness) => {
      const [a, b] = headOn(1, 3);
      const before = momentum(a, b);
      const after = momentum(...resolveCollision(a, b, impact(bounciness)));
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    });

    it('rebounds with the bounciness share of the closing speed', () => {
      for (const bounciness of [0, 0.25, 0.5, 1]) {
        const [a, b] = headOn();
        const [a2, b2] = resolveCollision(a, b, impact(bounciness));
        const closingBefore = a.velocity.x - b.velocity.x;
        const separatingAfter = b2.velocity.x - a2.velocity.x;
        expect(separatingAfter, `bounciness ${String(bounciness)}`).toBeCloseTo(
          bounciness * closingBefore,
        );
      }
    });

    describe('at bounciness 0 (a thud)', () => {
      it('stops them closing: they move on together, the heavier one carrying the lighter', () => {
        const [a2, b2] = resolveCollision(...headOn(1, 3), impact(0));
        expect(a2.velocity.x).toBeCloseTo(b2.velocity.x);
        // Momentum (1 × 2) + (3 × -2) = -4, over a total mass of 4.
        expect(b2.velocity.x).toBeCloseTo(-1);
      });
    });

    describe('at bounciness 1 (a full bounce)', () => {
      it('rebounds equal spoofs at full speed and keeps kinetic energy', () => {
        const [a, b] = headOn();
        const [a2, b2] = resolveCollision(a, b, impact(1));
        expect(a2.velocity.x).toBeCloseTo(-2);
        expect(b2.velocity.x).toBeCloseTo(2);
        expect(kineticEnergy(a2, b2)).toBeCloseTo(kineticEnergy(a, b));
      });

      it('throws a light spoof back harder than a heavy one', () => {
        // Head-on at equal speed, masses 1 and 3: the light one flies back at
        // twice its speed and the heavy one stops dead.
        const [light2, heavy2] = resolveCollision(...headOn(1, 3), impact(1));
        expect(light2.velocity.x).toBeCloseTo(-4);
        expect(heavy2.velocity.x).toBeCloseTo(0);
      });
    });

    it('sends a spoof at rest off along the line between the centers', () => {
      const mover = body(0, 0, { velocity: vec(3, 0) });
      const still = body(12, 12, { team: 'visitor' });
      const [, still2] = resolveCollision(mover, still, impact(1));
      const line = subtract(still.position, mover.position);
      const cross = still2.velocity.x * line.y - still2.velocity.y * line.x;
      expect(cross).toBeCloseTo(0);
      expect(dot(still2.velocity, line)).toBeGreaterThan(0);
    });

    it('leaves velocities alone when the opponents are already moving apart', () => {
      const a = body(0, 0, { velocity: vec(-1, 0) });
      const b = body(15, 0, { velocity: vec(1, 0), team: 'visitor' });
      const [a2, b2] = resolveCollision(a, b, impact(1));
      expect([a2.velocity, b2.velocity]).toEqual([a.velocity, b.velocity]);
    });

    it('refuses a bounciness outside 0 to 1, even in a hand-built rule', () => {
      const [a, b] = headOn();
      expect(() => resolveCollision(a, b, { kind: 'impact', bounciness: 2 })).toThrow(RangeError);
    });
  });

  // The prototype took the bounce direction after pushing the bodies apart,
  // when the overlap had already gone to zero, so a head-on hit like this one
  // separated them but left them moving into each other. See body.ts.
  describe('regression: the prototype bug', () => {
    it('bounces a head-on collision when the rule says to, instead of only separating', () => {
      const [a2, b2] = resolveCollision(...headOn(), impact(1));
      // a was on the left moving right, b on the right moving left. After the
      // bounce they must be moving apart: a to the left, b to the right.
      expect(a2.velocity.x).toBeLessThan(0);
      expect(b2.velocity.x).toBeGreaterThan(0);
    });
  });
});
