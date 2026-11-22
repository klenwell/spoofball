import { describe, expect, it } from 'vitest';
import { MIN_SPOOF_RADIUS } from '../game/spoof-types';
import { SEAT_MARK_RADIUS, SEAT_MARK_SPACING, crosshatch } from './seat-mark';

describe('crosshatch', () => {
  const lines = crosshatch();
  const slope = (s: (typeof lines)[number]) => (s.y2 - s.y1) / (s.x2 - s.x1);

  it('fits well inside the smallest spoof, so every fresh spoof hides it', () => {
    expect(SEAT_MARK_RADIUS).toBeLessThan(MIN_SPOOF_RADIUS * 0.75);
    for (const s of lines) {
      expect(Math.hypot(s.x1, s.y1)).toBeLessThanOrEqual(SEAT_MARK_RADIUS + 1e-9);
      expect(Math.hypot(s.x2, s.y2)).toBeLessThanOrEqual(SEAT_MARK_RADIUS + 1e-9);
    }
  });

  it('crosses diagonals both ways: a hatch, not a single set of stripes', () => {
    expect(lines.filter((s) => slope(s) > 0).length).toBeGreaterThan(1);
    expect(lines.filter((s) => slope(s) < 0).length).toBeGreaterThan(1);
    for (const s of lines) expect(Math.abs(slope(s))).toBeCloseTo(1);
  });

  it('spaces parallel lines evenly, including one through the center', () => {
    const offsets = lines
      .filter((s) => slope(s) > 0)
      .map((s) => (s.y1 - s.x1) * Math.SQRT1_2)
      .sort((a, b) => a - b);
    expect(offsets.some((o) => Math.abs(o) < 1e-9)).toBe(true);
    for (let i = 1; i < offsets.length; i += 1) {
      expect((offsets[i] ?? 0) - (offsets[i - 1] ?? 0)).toBeCloseTo(SEAT_MARK_SPACING);
    }
  });

  it('reaches the edge of the mark: each line is a full chord of its circle', () => {
    for (const s of lines) {
      expect(Math.hypot(s.x1, s.y1)).toBeCloseTo(SEAT_MARK_RADIUS);
      expect(Math.hypot(s.x2, s.y2)).toBeCloseTo(SEAT_MARK_RADIUS);
    }
  });
});
