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
 * How opponents collide. Which rule the game uses is the owner's call, made
 * on a bounciness slider while watching scrums (#38).
 *
 * - **An impact with a bounciness** (restitution) from 0 to 1. Both bodies
 *   are pushed apart, then their velocities change as in a real collision,
 *   keeping momentum. At 0 they thud and lose their closing speed: the
 *   heavier one carries on and their own steering does the pushing, like
 *   players in a scrum. At 1 they rebound with all their speed, like
 *   billiard balls. In between, a little rebound and mostly pushing.
 * - **`prototype-shove`**: push apart only, keeping both velocities, as the
 *   prototype actually played. Its code meant to bounce (restitution 1), but
 *   a bug (see `resolveCollision`) meant no collision ever changed a
 *   velocity. Kept for comparison on the slider.
 */
export type CollisionRule = { kind: 'prototype-shove' } | { kind: 'impact'; bounciness: number };

export const PROTOTYPE_SHOVE: CollisionRule = { kind: 'prototype-shove' };

function checkBounciness(bounciness: number): void {
  if (!(bounciness >= 0 && bounciness <= 1)) {
    throw new RangeError(`Bounciness must be from 0 to 1, got ${String(bounciness)}`);
  }
}

/** An impact rule with this bounciness, from 0 (thud) to 1 (full rebound). */
export function impact(bounciness: number): CollisionRule {
  checkBounciness(bounciness);
  return { kind: 'impact', bounciness };
}

/**
 * A bit of bounce: the owner liked 0.35–0.50 on #49 (2026-11-21), so 0.4
 * until the final pick. The prototype actually shoved (`PROTOTYPE_SHOVE`).
 */
export const DEFAULT_COLLISION_RULE: CollisionRule = { kind: 'impact', bounciness: 0.4 };

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
 * prototype shoved instead of bouncing, and why `PROTOTYPE_SHOVE` is kept.
 */
export function resolveCollision(
  a: Body,
  b: Body,
  rule: CollisionRule = DEFAULT_COLLISION_RULE,
): [Body, Body] {
  if (!collides(a, b)) return [a, b];
  checkMass(a);
  checkMass(b);
  if (rule.kind === 'impact') checkBounciness(rule.bounciness);

  const normal = contactNormal(a, b);
  const overlap = a.radius + b.radius - distance(a.position, b.position);
  const inverseA = 1 / a.mass;
  const inverseB = 1 / b.mass;
  const inverseTotal = inverseA + inverseB;

  // Push apart along the normal, the lighter body moving more.
  const positionA = add(a.position, scale(normal, (overlap * inverseA) / inverseTotal));
  const positionB = subtract(b.position, scale(normal, (overlap * inverseB) / inverseTotal));

  // The impact: only for the impact rule, and only when the bodies are moving
  // toward each other along the normal.
  const closingSpeed = dot(subtract(a.velocity, b.velocity), normal);
  if (rule.kind === 'prototype-shove' || closingSpeed >= 0) {
    return [
      { ...a, position: positionA },
      { ...b, position: positionB },
    ];
  }
  const impulse = (-(1 + rule.bounciness) * closingSpeed) / inverseTotal;
  return [
    { ...a, position: positionA, velocity: add(a.velocity, scale(normal, impulse * inverseA)) },
    {
      ...b,
      position: positionB,
      velocity: subtract(b.velocity, scale(normal, impulse * inverseB)),
    },
  ];
}
