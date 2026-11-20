/**
 * Spoof types and disc sizes, following the prototype (backgammon-chrome:
 * `AVATAR_DIST` in models/rook.py, `MIN_ROOK_RADIUS`/`MAX_ROOK_RADIUS`).
 * A spoof's type is fixed when it's created; it sets the avatar mark and
 * (in the Expansion epic) shapes its skill rolls.
 */

export const spoofTypes = [
  'king',
  'queen',
  'rook',
  'bishop',
  'knight',
  'pawn-basic',
  'pawn-noble',
  'pawn-angry',
] as const;

export type SpoofType = (typeof spoofTypes)[number];

/** Disc radius limits in court units (the court's radius is 150). */
export const MIN_SPOOF_RADIUS = 10;
export const MAX_SPOOF_RADIUS = 24;
