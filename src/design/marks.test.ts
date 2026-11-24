import { describe, expect, it } from 'vitest';
import { markNames } from '../game/spoof-types';
import { MARK_SAFE_RADIUS, marks, shapeExtent } from './marks';

describe('marks', () => {
  it('defines a shape for every mark', () => {
    expect(Object.keys(marks).sort()).toEqual([...markNames].sort());
  });

  it.each(markNames)('keeps the %s mark inside the safe radius', (name) => {
    for (const shape of marks[name]) {
      expect(shapeExtent(shape)).toBeLessThanOrEqual(MARK_SAFE_RADIUS);
    }
  });

  it('gives every mark a different shape', () => {
    const signatures = markNames.map((name) => JSON.stringify(marks[name]));
    expect(new Set(signatures).size).toBe(markNames.length);
  });
});

describe('shapeExtent', () => {
  it('measures a circle from the center to its far edge', () => {
    expect(shapeExtent({ kind: 'circle', cx: 0.3, cy: 0.4, r: 0.1 })).toBeCloseTo(0.6);
  });

  it('includes half the stroke of a ring', () => {
    expect(shapeExtent({ kind: 'ring', cx: 0, cy: 0, r: 0.3, width: 0.1 })).toBeCloseTo(0.35);
  });

  it('uses the farthest vertex of a polygon', () => {
    const points = [
      [0, -0.5],
      [0.2, 0],
    ] as const;
    expect(shapeExtent({ kind: 'polygon', points })).toBeCloseTo(0.5);
  });
});
