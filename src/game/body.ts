import { add, distance, dot, normalize, scale, subtract, vec, type Vec } from './vec';

/**
 * Circle bodies and collisions (#34). A spoof on the court is a body: a circle
 * with a position, a velocity (court units per frame), a radius and a mass.
 *
 * - **Opponents collide.** Two overlapping opponents are pushed apart, the
 *   lighter one more. How their velocities change depends on the collision
 *   style (below).
 * - **Teammates pass through each other.** They never collide, so they can
 *   overlap freely. Overlapping teammates score a bonus (#38), so it's part of
 *   the game. (The prototype's `kiss()` did nothing too.)
 */

export interface Body {
  readonly position: Vec;
  readonly velocity: Vec;
  readonly radius: number;
  /** Must be greater than 0. */
  readonly mass: number;
  /** Bodies on the same team never collide. */
  readonly team: string;
}

/**
 * How opponents collide. Which one the game uses is the owner's call, to be
 * made while watching scrums (#38).
 *
 * - **`shove`**: push apart only, keeping both velocities. Spoofs that keep
 *   steering into each other keep pushing, and the heavier one wins. This is
 *   how the prototype actually played. It meant to bounce, but a bug (see
 *   `resolveCollision`) meant its bounce never changed a velocity.
 * - **`bounce`**: push apart, then a perfectly elastic bounce along the line
 *   between the centers. This is what the prototype's code was written to do.
 */
export type CollisionStyle = 'shove' | 'bounce';

/** The prototype's behavior as it actually played, until the owner chooses. */
export const DEFAULT_COLLISION_STYLE: CollisionStyle = 'shove';

/**
 * How much speed survives a bounce, from 0 (none) to 1 (all of it). The
 * prototype's code used 1, perfectly elastic.
 */
export const RESTITUTION = 1;

/** True when two circles overlap. Circles that only touch don't. */
export function overlaps(a: Body, b: Body): boolean {
  return distance(a.position, b.position) < a.radius + b.radius;
}

/** True when two bodies would collide: they overlap and they're opponents. */
export function collides(a: Body, b: Body): boolean {
  return a.team !== b.team && overlaps(a, b);
}

/**
 * The unit vector pointing from b's center to a's. When the centers are at the
 * same spot there's no such direction, so it picks +x. That's arbitrary but
 * deterministic, so a replay still matches.
 */
function contactNormal(a: Body, b: Body): Vec {
  const between = normalize(subtract(a.position, b.position));
  return between.x === 0 && between.y === 0 ? vec(1, 0) : between;
}

function checkMass(body: Body): void {
  if (!(body.mass > 0))
    throw new RangeError(`A body's mass must be greater than 0, got ${String(body.mass)}`);
}

/**
 * Resolves a collision between two bodies, returning both afterward. Bodies
 * that don't collide (teammates, or opponents that don't overlap) come back
 * unchanged.
 *
 * The contact normal is taken *before* the bodies are pushed apart. The
 * prototype took it after: `resolve_colliding_bodies` separated the bodies,
 * then `reflect_colliding_bodies` called `minimum_translation_vector` again.
 * By then the bodies only touched, so the normal was the zero vector, the
 * impulse was 0, and no collision ever changed a velocity. That's why the
 * prototype shoved instead of bouncing, and why `shove` is kept as a style.
 */
export function resolveCollision(
  a: Body,
  b: Body,
  style: CollisionStyle = DEFAULT_COLLISION_STYLE,
): [Body, Body] {
  if (!collides(a, b)) return [a, b];
  checkMass(a);
  checkMass(b);

  const normal = contactNormal(a, b);
  const overlap = a.radius + b.radius - distance(a.position, b.position);
  const inverseA = 1 / a.mass;
  const inverseB = 1 / b.mass;
  const inverseTotal = inverseA + inverseB;

  // Push apart along the normal, the lighter body moving more.
  const positionA = add(a.position, scale(normal, (overlap * inverseA) / inverseTotal));
  const positionB = subtract(b.position, scale(normal, (overlap * inverseB) / inverseTotal));

  // Bounce: only when the style says so, and only when the bodies are moving
  // toward each other along the normal.
  const closingSpeed = dot(subtract(a.velocity, b.velocity), normal);
  if (style === 'shove' || closingSpeed >= 0) {
    return [
      { ...a, position: positionA },
      { ...b, position: positionB },
    ];
  }
  const impulse = (-(1 + RESTITUTION) * closingSpeed) / inverseTotal;
  return [
    { ...a, position: positionA, velocity: add(a.velocity, scale(normal, impulse * inverseA)) },
    {
      ...b,
      position: positionB,
      velocity: subtract(b.velocity, scale(normal, impulse * inverseB)),
    },
  ];
}
