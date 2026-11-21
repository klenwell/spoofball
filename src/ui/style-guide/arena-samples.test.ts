import { describe, expect, it } from 'vitest';
import { SEATS_PER_BENCH } from '../../game/arena';
import { isOnCourt, zoneAt } from '../../game/court';
import { SAMPLES } from './arena-samples';

describe('arena samples', () => {
  const onCourt = SAMPLES.flatMap((s) => (typeof s.at === 'number' ? [] : [{ ...s, at: s.at }]));
  const seated = SAMPLES.flatMap((s) => (typeof s.at === 'number' ? [{ ...s, at: s.at }] : []));

  it.each(onCourt.map((s) => [`${s.side} ${s.type}`, s] as const))(
    'keeps the %s wholly on the court',
    (_name, s) => {
      expect(isOnCourt(s.at.x, s.at.y, s.radius)).toBe(true);
    },
  );

  it('uses real seats, one spoof per seat', () => {
    for (const s of seated) {
      expect(s.at).toBeGreaterThanOrEqual(0);
      expect(s.at).toBeLessThan(SEATS_PER_BENCH);
    }
    const keys = seated.map((s) => `${s.side}:${String(s.at)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shows a spoof in every zone', () => {
    const zones = new Set(onCourt.map((s) => zoneAt(s.at.x, s.at.y)));
    expect([...zones].sort()).toEqual(['apron', 'crush', 'mosh']);
  });
});
