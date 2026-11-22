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

/**
 * What a player sees. Pawn subtypes (noble, angry) are hidden: every pawn
 * shows the same avatar, and a subtype only shows through how the pawn plays
 * in a match. The prototype did the same, sending only "pawn" to the browser
 * (`client_avatar` in lib/minrook/rooks.py).
 */
export const avatars = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;

export type Avatar = (typeof avatars)[number];

export function avatarOf(type: SpoofType): Avatar {
  return type.startsWith('pawn') ? 'pawn' : (type as Exclude<SpoofType, `pawn-${string}`>);
}

/**
 * A spoof's base (starting) radius limits, in court units (the court's radius
 * is 130). During a scrum a spoof can blow from 8 up to 40 (the prototype's
 * MIN_BLOW_RADIUS and MAX_BLOW_RADIUS); the Match epic adds those limits.
 */
export const MIN_SPOOF_RADIUS = 10;
export const MAX_SPOOF_RADIUS = 24;
