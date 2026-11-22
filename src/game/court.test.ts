import { describe, expect, it } from 'vitest';
import {
  APRON_WIDTH,
  COURT_RADIUS,
  CRUSH_RADIUS,
  DEFAULT_COURT,
  MOSH_RADIUS,
  courtRadius,
  courtWithMosh,
  fitToCourt,
  isOnCourt,
  zoneAt,
  zoneMultiplier,
} from './court';

describe('zoneAt', () => {
  it('puts the center in the crush', () => {
    expect(zoneAt(0, 0)).toBe('crush');
  });

  it('puts a point on a boundary in the inner zone', () => {
    expect(zoneAt(CRUSH_RADIUS, 0)).toBe('crush');
    expect(zoneAt(0, MOSH_RADIUS)).toBe('mosh');
    expect(zoneAt(-COURT_RADIUS, 0)).toBe('apron');
  });

  it('measures distance in every direction', () => {
    expect(zoneAt(60, 60)).toBe('mosh'); // about 85 from the center
    expect(zoneAt(80, -80)).toBe('apron'); // about 113
    expect(zoneAt(-110, 110)).toBe('off'); // about 156
  });
});

describe('zoneMultiplier', () => {
  it('scores the crush ×3, the mosh ×1, and the apron nothing', () => {
    expect(zoneMultiplier).toEqual({ crush: 3, mosh: 1, apron: 0, off: 0 });
  });
});

describe('isOnCourt', () => {
  it('is true for a disc wholly inside the court', () => {
    expect(isOnCourt(0, 0, 24)).toBe(true);
  });

  it('is true for a disc touching the edge from inside', () => {
    expect(isOnCourt(COURT_RADIUS - 15, 0, 15)).toBe(true);
  });

  it('is false for a disc overhanging the edge', () => {
    // The style guide's first draft had a bishop here: 139 from the center, radius 15.
    expect(isOnCourt(-88, 108, 15)).toBe(false);
  });
});

describe('a court with a smaller mosh (#51)', () => {
  const small = courtWithMosh(70);

  it("keeps today's court as the default: mosh 100, radius 150", () => {
    expect(DEFAULT_COURT.moshRadius).toBe(100);
    expect(courtRadius()).toBe(150);
  });

  it('keeps the apron a ring 50 wide, so the court is the mosh plus 50', () => {
    expect(APRON_WIDTH).toBe(50);
    expect(courtRadius(small)).toBe(120);
  });

  it('keeps the crush at 25', () => {
    expect(zoneAt(0, 25, small)).toBe('crush');
    expect(zoneAt(0, 26, small)).toBe('mosh');
  });

  it('moves the mosh and apron edges in with it', () => {
    expect(zoneAt(0, 70, small)).toBe('mosh');
    expect(zoneAt(0, 71, small)).toBe('apron');
    expect(zoneAt(0, 120, small)).toBe('apron');
    expect(zoneAt(0, 121, small)).toBe('off');
  });

  it('measures whether a disc is on it against its own edge', () => {
    expect(isOnCourt(0, 100, 20, small)).toBe(true);
    expect(isOnCourt(0, 101, 20, small)).toBe(false);
  });

  it('refuses a mosh no bigger than the crush', () => {
    expect(() => courtWithMosh(CRUSH_RADIUS)).toThrow(RangeError);
  });
});

describe('fitToCourt', () => {
  const small = courtWithMosh(70);

  it("leaves a spot alone on today's court", () => {
    expect(fitToCourt(30, -40, DEFAULT_COURT).x).toBeCloseTo(30);
    expect(fitToCourt(30, -40, DEFAULT_COURT).y).toBeCloseTo(-40);
  });

  it('leaves the crush where it is', () => {
    expect(fitToCourt(0, 20, small)).toEqual({ x: 0, y: 20 });
  });

  it('squeezes the mosh: its edge lands on the smaller edge', () => {
    expect(fitToCourt(0, MOSH_RADIUS, small).y).toBeCloseTo(70);
  });

  it("keeps an apron spot on the apron, the same distance in from the court's edge", () => {
    const moved = fitToCourt(0, 130, small);
    expect(zoneAt(moved.x, moved.y, small)).toBe('apron');
    expect(courtRadius(small) - moved.y).toBeCloseTo(COURT_RADIUS - 130);
  });

  it('keeps the direction from the center', () => {
    const moved = fitToCourt(60, 80, small);
    expect(Math.atan2(moved.y, moved.x)).toBeCloseTo(Math.atan2(80, 60));
  });
});
