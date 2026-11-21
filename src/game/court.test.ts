import { describe, expect, it } from 'vitest';
import { COURT_RADIUS, CRUSH_RADIUS, MOSH_RADIUS, zoneAt, zoneMultiplier } from './court';

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
