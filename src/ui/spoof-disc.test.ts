import { describe, expect, it } from 'vitest';
import { FADED_AT_FATIGUE, MIN_FATIGUE_OPACITY, fatigueOpacity, trimWidth } from './spoof-disc';

describe('fatigueOpacity', () => {
  it('is fully opaque for a fresh spoof', () => {
    expect(fatigueOpacity(0)).toBe(1);
  });

  it('fades to the minimum for a spent spoof, never to invisible', () => {
    expect(fatigueOpacity(100)).toBeCloseTo(MIN_FATIGUE_OPACITY);
  });

  it('fades in proportion to fatigue: 80% opaque at 20, 70% at 30, 50% at 50', () => {
    expect(fatigueOpacity(20)).toBeCloseTo(0.8);
    expect(fatigueOpacity(30)).toBeCloseTo(0.7);
    expect(fatigueOpacity(50)).toBeCloseTo(0.5);
  });

  it('clamps fatigue outside 0 to 100', () => {
    expect(fatigueOpacity(-20)).toBe(1);
    expect(fatigueOpacity(150)).toBeCloseTo(MIN_FATIGUE_OPACITY);
  });

  it("reaches its most see-through at fatigue 70, the owner's pick on #59", () => {
    expect(FADED_AT_FATIGUE).toBe(70);
    expect(fatigueOpacity(70)).toBeCloseTo(MIN_FATIGUE_OPACITY);
    expect(fatigueOpacity(69)).toBeGreaterThan(MIN_FATIGUE_OPACITY);
  });
});

describe('trimWidth', () => {
  it('scales with the disc', () => {
    expect(trimWidth(24)).toBeCloseTo(3.84);
  });

  it('never gets thinner than 1.5 px, so small discs keep a visible trim', () => {
    expect(trimWidth(5)).toBe(1.5);
  });
});
