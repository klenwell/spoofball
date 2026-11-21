/**
 * 2D vectors in court units (#34). Plain, immutable `{ x, y }` values and
 * functions, so positions and velocities can be stored in frames and compared
 * in tests. Angles are in radians; with y pointing down, a positive angle
 * turns clockwise on screen.
 */

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec = { x: 0, y: 0 };

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec, factor: number): Vec {
  return { x: v.x * factor, y: v.y * factor };
}

export function dot(a: Vec, b: Vec): number {
  return a.x * b.x + a.y * b.y;
}

export function length(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The vector scaled to length 1. The zero vector has no direction, so it stays zero. */
export function normalize(v: Vec): Vec {
  const len = length(v);
  return len === 0 ? ZERO : { x: v.x / len, y: v.y / len };
}

export function rotate(v: Vec, radians: number): Vec {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/** The vector's direction, from -π to π, measured from the +x axis. */
export function angle(v: Vec): number {
  return Math.atan2(v.y, v.x);
}
