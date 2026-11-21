import { describe, expect, it } from 'vitest';
import { BENCH_RADIUS, SEATS_PER_BENCH, SEAT_RADIUS, arenaBounds, benchSeats } from './arena';
import { COURT_RADIUS } from './court';
import { MAX_SPOOF_RADIUS } from './spoof-types';

describe('benchSeats', () => {
  it('gives each bench a seat per spoof on a team', () => {
    expect(benchSeats('home')).toHaveLength(SEATS_PER_BENCH);
    expect(benchSeats('visitor')).toHaveLength(SEATS_PER_BENCH);
  });

  it('puts the home bench below the court and the visitor bench above', () => {
    expect(benchSeats('home').every((s) => s.y > 0)).toBe(true);
    expect(benchSeats('visitor').every((s) => s.y < 0)).toBe(true);
  });

  it('numbers seats left to right', () => {
    const xs = benchSeats('visitor').map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(benchSeats('home').map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps every seat clear of the court', () => {
    for (const seat of [...benchSeats('home'), ...benchSeats('visitor')]) {
      expect(Math.hypot(seat.x, seat.y) - SEAT_RADIUS).toBeGreaterThan(COURT_RADIUS);
    }
  });

  it('leaves room between neighboring seats', () => {
    const seats = benchSeats('home');
    for (let i = 1; i < seats.length; i++) {
      const a = seats[i - 1];
      const b = seats[i];
      if (!a || !b) throw new Error('missing seat');
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(SEAT_RADIUS * 2);
    }
  });

  it('fits the largest spoof in a seat', () => {
    expect(SEAT_RADIUS).toBeGreaterThanOrEqual(MAX_SPOOF_RADIUS);
  });

  it('is a mirror image between the two benches', () => {
    const home = benchSeats('home');
    const visitor = benchSeats('visitor');
    home.forEach((seat, i) => {
      expect(seat.x).toBeCloseTo(visitor[i]?.x ?? Number.NaN);
      expect(seat.y).toBeCloseTo(-(visitor[i]?.y ?? Number.NaN));
    });
  });
});

describe('arenaBounds', () => {
  it('contains the court and both benches', () => {
    const bounds = arenaBounds();
    expect(bounds.minX).toBeLessThanOrEqual(-COURT_RADIUS);
    expect(bounds.maxY).toBeGreaterThanOrEqual(BENCH_RADIUS + SEAT_RADIUS);
    expect(bounds.minY).toBeLessThanOrEqual(-(BENCH_RADIUS + SEAT_RADIUS));
  });

  it('is taller than wide, to suit a phone in portrait', () => {
    const { minX, maxX, minY, maxY } = arenaBounds();
    expect(maxY - minY).toBeGreaterThan(maxX - minX);
  });
});
