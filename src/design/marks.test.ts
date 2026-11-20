import { describe, expect, it } from 'vitest';
import { spoofTypes } from '../game/spoof-types';
import { MARK_SAFE_RADIUS, marks, shapeExtent } from './marks';

describe('marks', () => {
  it('defines a mark for every spoof type', () => {
    expect(Object.keys(marks).sort()).toEqual([...spoofTypes].sort());
  });

  it.each(spoofTypes)('keeps the %s mark inside the safe radius', (type) => {
    for (const shape of marks[type]) {
      expect(shapeExtent(shape)).toBeLessThanOrEqual(MARK_SAFE_RADIUS);
    }
  });

  it('gives every type a different mark', () => {
    const signatures = spoofTypes.map((type) => JSON.stringify(marks[type]));
    expect(new Set(signatures).size).toBe(spoofTypes.length);
  });

  describe('pawns', () => {
    it('share the same dot, so the extra stroke is what tells them apart', () => {
      expect(marks['pawn-noble'][0]).toEqual(marks['pawn-basic'][0]);
      expect(marks['pawn-angry'][0]).toEqual(marks['pawn-basic'][0]);
      expect(marks['pawn-noble']).toHaveLength(2);
      expect(marks['pawn-angry']).toHaveLength(2);
    });
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
