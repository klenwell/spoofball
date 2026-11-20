import { describe, expect, it } from 'vitest';
import { MIN_FATIGUE_OPACITY, fatigueOpacity, trimWidth } from './spoof-disc';

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
});

describe('trimWidth', () => {
  it('scales with the disc', () => {
    expect(trimWidth(24)).toBeCloseTo(3.84);
  });

  it('never gets thinner than 1.5 px, so small discs keep a visible trim', () => {
    expect(trimWidth(5)).toBe(1.5);
  });
});
