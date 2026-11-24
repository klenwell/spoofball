/**
 * Spoof types, marks and disc sizes, following the prototype (backgammon-chrome:
 * `AVATAR_DIST` in models/rook.py, `MIN_ROOK_RADIUS`/`MAX_ROOK_RADIUS`).
 * A spoof's type is fixed when it's created; it sets its default mark and
 * shapes its skill rolls (#35).
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
 * The type a player can know. Pawn subtypes (noble, angry) are hidden: every
 * pawn is just a pawn, and a subtype only shows through how the pawn plays in
 * a match. The prototype did the same, sending only "pawn" to the browser
 * (`client_avatar` in lib/minrook/rooks.py).
 */
export const shownTypes = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;

export type ShownType = (typeof shownTypes)[number];

export function shownType(type: SpoofType): ShownType {
  return type.startsWith('pawn') ? 'pawn' : (type as Exclude<SpoofType, `pawn-${string}`>);
}

/**
 * The marks a spoof can wear on its disc (#74): one default for each shown
 * type, then ten more. Any spoof on your team can wear any of them. The game
 * never picks a mark from a spoof's skills, so a mark reveals nothing hidden.
 */
export const markNames = [
  'crown',
  'gem',
  'mallet',
  'starburst',
  'shield',
  'dot',
  'heart',
  'bolt',
  'infinity',
  'anchor',
  'bulb',
  'star',
  'glove',
  'diamond',
  'club',
  'spade',
] as const;

export type MarkName = (typeof markNames)[number];

/** Each shown type's mark, which every spoof starts with (the owner, 2026-11-24, on #74). */
export const DEFAULT_MARKS: Readonly<Record<ShownType, MarkName>> = {
  king: 'crown',
  queen: 'gem',
  rook: 'mallet',
  bishop: 'starburst',
  knight: 'shield',
  pawn: 'dot',
};

/** The mark a spoof of this type starts with. Every pawn's is the dot, whatever its subtype. */
export function defaultMark(type: SpoofType): MarkName {
  return DEFAULT_MARKS[shownType(type)];
}

/**
 * A spoof's base (starting) radius limits, in court units (the court's radius
 * is 130). During a scrum a spoof can blow from 8 up to 40 (the prototype's
 * MIN_BLOW_RADIUS and MAX_BLOW_RADIUS); the Match epic adds those limits.
 */
export const MIN_SPOOF_RADIUS = 10;
export const MAX_SPOOF_RADIUS = 24;
