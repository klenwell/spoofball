import { describe, expect, it } from 'vitest';
import { defaultMark, markNames, shownType, spoofTypes } from './spoof-types';

describe('shownType', () => {
  it.each(['king', 'queen', 'rook', 'bishop', 'knight'] as const)(
    'shows a %s as itself',
    (type) => {
      expect(shownType(type)).toBe(type);
    },
  );

  it.each(['pawn-basic', 'pawn-noble', 'pawn-angry'] as const)(
    'hides the subtype of a %s, showing a plain pawn',
    (type) => {
      expect(shownType(type)).toBe('pawn');
    },
  );

  it('maps the 8 spoof types onto 6 a player can know', () => {
    expect(new Set(spoofTypes.map(shownType)).size).toBe(6);
  });
});

describe('defaultMark', () => {
  it.each([
    ['king', 'crown'],
    ['queen', 'gem'],
    ['rook', 'mallet'],
    ['knight', 'shield'],
    ['bishop', 'starburst'],
    ['pawn-basic', 'dot'],
    ['pawn-noble', 'dot'],
    ['pawn-angry', 'dot'],
  ] as const)("gives a %s the owner's default mark, a %s", (type, mark) => {
    expect(defaultMark(type)).toBe(mark);
  });

  it('gives every shown type a different mark, from the 16', () => {
    const defaults = spoofTypes.map(defaultMark);
    expect(new Set(defaults).size).toBe(6);
    for (const mark of defaults) expect(markNames).toContain(mark);
    expect(markNames).toHaveLength(16);
    expect(new Set(markNames).size).toBe(16);
  });
});
