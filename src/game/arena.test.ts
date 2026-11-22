import { describe, expect, it } from 'vitest';
import {
  BENCH_RADIUS,
  SEATS_PER_BENCH,
  SEAT_RADIUS,
  arenaBounds,
  benchRadius,
  benchSeats,
  seatAt,
} from './arena';
import { COURT_RADIUS, courtRadius, courtWithMosh } from './court';
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
    expect(benchSeats('home').map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('has 5 seats, one per spoof, as in the prototype (#44)', () => {
    expect(SEATS_PER_BENCH).toBe(5);
  });

  it('centers each bench on its side of the court, with the middle seat straight above or below', () => {
    for (const side of ['home', 'visitor'] as const) {
      const seats = benchSeats(side);
      const middle = seats[2];
      if (!middle) throw new Error('missing middle seat');
      expect(middle.x, side).toBeCloseTo(0);
      // Mirror image: seat i and seat 4 - i sit at the same height, opposite x.
      for (let i = 0; i < 2; i += 1) {
        const left = seats[i];
        const right = seats[seats.length - 1 - i];
        if (!left || !right) throw new Error('missing seat');
        expect(left.x, side).toBeCloseTo(-right.x);
        expect(left.y, side).toBeCloseTo(right.y);
      }
    }
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

describe('the arena on a court with a smaller mosh (#51)', () => {
  const small = courtWithMosh(70);
  const neighbourGap = (seats: { x: number; y: number }[]) => {
    const [a, b] = seats;
    if (!a || !b) throw new Error('missing seats');
    return Math.hypot(b.x - a.x, b.y - a.y);
  };

  it("puts the benches just outside the smaller court's edge", () => {
    expect(benchRadius(small)).toBe(courtRadius(small) + 15 + SEAT_RADIUS);
    for (const seat of benchSeats('home', small)) {
      expect(Math.hypot(seat.x, seat.y) - SEAT_RADIUS).toBeGreaterThan(courtRadius(small));
    }
  });

  it("keeps the seats as far apart as on the game's court, so they don't overlap", () => {
    expect(neighbourGap(benchSeats('home', small))).toBeCloseTo(neighbourGap(benchSeats('home')));
  });

  it("spaces the game's seats as on the prototype's court: 17° apart at radius 190 (#52 review)", () => {
    const prototypeGap = 2 * 190 * Math.sin((17 * Math.PI) / 360);
    expect(neighbourGap(benchSeats('home'))).toBeCloseTo(prototypeGap);
    expect(neighbourGap(benchSeats('visitor'))).toBeCloseTo(prototypeGap);
  });

  it('shrinks the bounds with the court', () => {
    const big = arenaBounds();
    const smaller = arenaBounds(small);
    expect(smaller.maxX - smaller.minX).toBeLessThan(big.maxX - big.minX);
    expect(smaller.maxY - smaller.minY).toBeLessThan(big.maxY - big.minY);
  });
});

describe('seatAt', () => {
  it("finds the seat under a point, on that side's bench", () => {
    const seat = benchSeats('home')[3];
    if (!seat) throw new Error('no seat');
    expect(seatAt('home', seat.x + SEAT_RADIUS - 1, seat.y)?.index).toBe(3);
  });

  it("is null off a seat, or on the other side's bench", () => {
    const seat = benchSeats('home')[3];
    if (!seat) throw new Error('no seat');
    expect(seatAt('home', seat.x + SEAT_RADIUS + 1, seat.y)).toBeNull();
    expect(seatAt('visitor', seat.x, seat.y)).toBeNull();
    expect(seatAt('home', 0, 0)).toBeNull();
  });
});
