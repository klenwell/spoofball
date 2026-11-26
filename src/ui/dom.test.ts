import { describe, expect, it } from 'vitest';
import { timeOfDay, today } from './dom';

describe('timeOfDay', () => {
  it('gives the local time as HH:MM, 24-hour, with leading zeros', () => {
    expect(timeOfDay(new Date(2026, 0, 5, 0, 7))).toBe('00:07');
    expect(timeOfDay(new Date(2026, 10, 25, 14, 41, 59))).toBe('14:41');
  });
});

describe('today', () => {
  it('gives the local day as YYYY-MM-DD, with leading zeros', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(today(new Date(2026, 10, 25, 0, 1))).toBe('2026-11-25');
  });
});
