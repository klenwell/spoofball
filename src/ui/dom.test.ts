import { describe, expect, it } from 'vitest';
import { today } from './dom';

describe('today', () => {
  it('gives the local day as YYYY-MM-DD, with leading zeros', () => {
    expect(today(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(today(new Date(2026, 10, 25, 0, 1))).toBe('2026-11-25');
  });
});
