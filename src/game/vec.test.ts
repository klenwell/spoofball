import { describe, expect, it } from 'vitest';
import {
  ZERO,
  add,
  angle,
  distance,
  dot,
  length,
  normalize,
  rotate,
  scale,
  subtract,
  vec,
} from './vec';

describe('vec', () => {
  it('adds and subtracts', () => {
    expect(add(vec(1, 2), vec(3, -5))).toEqual(vec(4, -3));
    expect(subtract(vec(1, 2), vec(3, -5))).toEqual(vec(-2, 7));
  });

  it('scales', () => {
    expect(scale(vec(3, -4), 0.5)).toEqual(vec(1.5, -2));
  });

  it('measures length, distance and the dot product', () => {
    expect(length(vec(3, 4))).toBe(5);
    expect(distance(vec(1, 1), vec(4, 5))).toBe(5);
    expect(dot(vec(1, 2), vec(3, 4))).toBe(11);
  });

  describe('normalize', () => {
    it('scales a vector to length 1, keeping its direction', () => {
      const unit = normalize(vec(3, 4));
      expect(length(unit)).toBeCloseTo(1);
      expect(unit).toEqual(vec(0.6, 0.8));
    });

    describe('when the vector is zero', () => {
      it('stays zero instead of dividing by zero', () => {
        expect(normalize(ZERO)).toEqual(ZERO);
      });
    });
  });

  describe('rotate', () => {
    it('turns a vector by an angle in radians', () => {
      const turned = rotate(vec(1, 0), Math.PI / 2);
      expect(turned.x).toBeCloseTo(0);
      expect(turned.y).toBeCloseTo(1);
    });

    it('keeps the length', () => {
      expect(length(rotate(vec(3, 4), 1.234))).toBeCloseTo(5);
    });
  });

  describe('angle', () => {
    it('measures direction from the +x axis', () => {
      expect(angle(vec(1, 0))).toBe(0);
      expect(angle(vec(0, 1))).toBeCloseTo(Math.PI / 2);
      expect(angle(vec(-1, 0))).toBeCloseTo(Math.PI);
    });

    it('undoes rotate', () => {
      expect(angle(rotate(vec(1, 0), 0.7))).toBeCloseTo(0.7);
    });
  });
});
