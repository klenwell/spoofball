import { describe, expect, it } from 'vitest';
import { FADED_AT_FATIGUE, MIN_FATIGUE_OPACITY, fatigueOpacity, trimWidth } from './spoof-disc';

describe('fatigueOpacity', () => {
  it('is fully opaque for a fresh spoof', () => {
    expect(fatigueOpacity(0)).toBe(1);
  });

  it('fades to the minimum for a spent spoof, never to invisible', () => {
    expect(fatigueOpacity(100)).toBeCloseTo(MIN_FATIGUE_OPACITY);
  });

  it('fades in proportion to fatigue', () => {
    expect(fatigueOpacity(50)).toBeCloseTo(1 - 0.5 * (1 - MIN_FATIGUE_OPACITY));
  });

  it('clamps fatigue outside 0 to 100', () => {
    expect(fatigueOpacity(-20)).toBe(1);
    expect(fatigueOpacity(150)).toBeCloseTo(MIN_FATIGUE_OPACITY);
  });

  describe('when it reaches its most see-through sooner (#59)', () => {
    it('fades over that range instead: halfway there at half the fatigue', () => {
      expect(fatigueOpacity(20, 40)).toBeCloseTo(1 - 0.5 * (1 - MIN_FATIGUE_OPACITY));
    });

    it('stays at the minimum past that fatigue', () => {
      expect(fatigueOpacity(40, 40)).toBeCloseTo(MIN_FATIGUE_OPACITY);
      expect(fatigueOpacity(90, 40)).toBeCloseTo(MIN_FATIGUE_OPACITY);
    });
  });

  it(`reaches its most see-through at fatigue ${String(FADED_AT_FATIGUE)} unless told otherwise`, () => {
    expect(fatigueOpacity(FADED_AT_FATIGUE)).toBeCloseTo(MIN_FATIGUE_OPACITY);
    expect(fatigueOpacity(FADED_AT_FATIGUE * 0.99)).toBeGreaterThan(MIN_FATIGUE_OPACITY);
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
