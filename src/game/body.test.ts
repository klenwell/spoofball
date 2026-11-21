import { describe, expect, it } from 'vitest';
import { DEFAULT_COLLISION_STYLE, collides, overlaps, resolveCollision, type Body } from './body';
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

describe('resolveCollision', () => {
  it("defaults to shoving, the prototype's behavior as it played", () => {
    expect(DEFAULT_COLLISION_STYLE).toBe('shove');
  });

  describe('when two opponents overlap and shove', () => {
    const a = body(0, 0, { velocity: vec(2, 0) });
    const b = body(15, 0, { velocity: vec(-2, 0), team: 'visitor' });
    const [a2, b2] = resolveCollision(a, b, 'shove');

    it('pushes them apart until they only touch', () => {
      expect(distance(a2.position, b2.position)).toBeCloseTo(20);
      expect(overlaps(a2, b2)).toBe(false);
    });

    it('keeps both velocities, so spoofs steering into each other keep pushing', () => {
      expect([a2.velocity, b2.velocity]).toEqual([a.velocity, b.velocity]);
    });
  });

  describe('when two opponents overlap and bounce', () => {
    const a = body(0, 0, { velocity: vec(2, 0) });
    const b = body(15, 0, { velocity: vec(-2, 0), team: 'visitor' });
    const [a2, b2] = resolveCollision(a, b, 'bounce');

    it('pushes them apart until they only touch', () => {
      expect(distance(a2.position, b2.position)).toBeCloseTo(20);
      expect(overlaps(a2, b2)).toBe(false);
    });

    it('bounces them back along the line between them', () => {
      expect(a2.velocity.x).toBeCloseTo(-2);
      expect(b2.velocity.x).toBeCloseTo(2);
    });

    it('keeps momentum and, being elastic, kinetic energy', () => {
      const before = momentum(a, b);
      const after = momentum(a2, b2);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
      expect(kineticEnergy(a2, b2)).toBeCloseTo(kineticEnergy(a, b));
    });
  });

  describe('when one opponent is heavier', () => {
    const light = body(0, 0, { mass: 1 });
    const heavy = body(16, 0, { mass: 3, team: 'visitor' });
    const [light2, heavy2] = resolveCollision(light, heavy);

    it('moves the lighter one more', () => {
      const lightMoved = distance(light.position, light2.position);
      const heavyMoved = distance(heavy.position, heavy2.position);
      expect(lightMoved).toBeCloseTo(3);
      expect(heavyMoved).toBeCloseTo(1);
    });
  });

  describe('when a fast spoof hits one at rest at an angle', () => {
    const mover = body(0, 0, { velocity: vec(3, 0) });
    const still = body(12, 12, { team: 'visitor' });
    const [mover2, still2] = resolveCollision(mover, still, 'bounce');

    it('sends the one at rest off along the line between their centers', () => {
      const line = subtract(still.position, mover.position);
      const cross = still2.velocity.x * line.y - still2.velocity.y * line.x;
      expect(cross).toBeCloseTo(0);
      expect(dot(still2.velocity, line)).toBeGreaterThan(0);
    });

    it('keeps momentum', () => {
      const before = momentum(mover, still);
      const after = momentum(mover2, still2);
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    });
  });

  describe('when bouncing opponents are already moving apart', () => {
    it('separates them without changing their velocities', () => {
      const a = body(0, 0, { velocity: vec(-1, 0) });
      const b = body(15, 0, { velocity: vec(1, 0), team: 'visitor' });
      const [a2, b2] = resolveCollision(a, b, 'bounce');
      expect(overlaps(a2, b2)).toBe(false);
      expect([a2.velocity, b2.velocity]).toEqual([a.velocity, b.velocity]);
    });
  });

  describe('when two opponents sit on exactly the same spot', () => {
    it('still separates them, the same way every time', () => {
      const a = body(5, 5);
      const b = body(5, 5, { team: 'visitor' });
      const first = resolveCollision(a, b);
      expect(overlaps(...first)).toBe(false);
      expect(resolveCollision(a, b)).toEqual(first);
    });
  });

  describe('when the bodies are teammates', () => {
    it('leaves them overlapping, untouched', () => {
      const a = body(0, 0, { velocity: vec(2, 0) });
      const b = body(5, 0, { velocity: vec(-2, 0) });
      const [a2, b2] = resolveCollision(a, b);
      expect(a2).toBe(a);
      expect(b2).toBe(b);
    });
  });

  describe('when the opponents do not overlap', () => {
    it('leaves them untouched', () => {
      const a = body(0, 0, { velocity: vec(2, 0) });
      const b = body(25, 0, { team: 'visitor' });
      expect(resolveCollision(a, b)).toEqual([a, b]);
    });
  });

  describe('when a mass is not positive', () => {
    it('refuses it', () => {
      const a = body(0, 0, { mass: 0 });
      const b = body(15, 0, { team: 'visitor' });
      expect(() => resolveCollision(a, b)).toThrow(RangeError);
    });
  });

  // The prototype took the bounce direction after pushing the bodies apart,
  // when the overlap had already gone to zero, so a head-on hit like this one
  // separated them but left them moving into each other. See body.ts.
  describe('regression: the prototype bug', () => {
    it('bounces a head-on collision instead of only separating the bodies', () => {
      const a = body(0, 0, { velocity: vec(1, 0) });
      const b = body(15, 0, { velocity: vec(-1, 0), team: 'visitor' });
      const [a2, b2] = resolveCollision(a, b, 'bounce');
      // a was on the left moving right, b on the right moving left. After the
      // bounce they must be moving apart: a to the left, b to the right.
      expect(a2.velocity.x).toBeLessThan(0);
      expect(b2.velocity.x).toBeGreaterThan(0);
    });
  });
});
