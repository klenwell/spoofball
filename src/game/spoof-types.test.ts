import { describe, expect, it } from 'vitest';
import { avatarOf, spoofTypes } from './spoof-types';

describe('avatarOf', () => {
  it.each(['king', 'queen', 'rook', 'bishop', 'knight'] as const)(
    'shows a %s as itself',
    (type) => {
      expect(avatarOf(type)).toBe(type);
    },
  );

  it.each(['pawn-basic', 'pawn-noble', 'pawn-angry'] as const)(
    'hides the subtype of a %s, showing a plain pawn',
    (type) => {
      expect(avatarOf(type)).toBe('pawn');
    },
  );

  it('maps the 8 spoof types onto 6 avatars', () => {
    expect(new Set(spoofTypes.map(avatarOf)).size).toBe(6);
  });
});
