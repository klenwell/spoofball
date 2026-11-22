import type { Random } from './random';
import type { SpoofType } from './spoof-types';

/**
 * Temperament (#51): how keen a spoof is to attack. It's a hidden trait of
 * its own, **not a skill** (the owner, 2026-11-22): it sits outside the skill
 * budget, so it's a style of play, neither better nor worse. A brawler and a
 * cautious spoof can be equally good. Like skills, it's never shown on screen
 * (docs/design.md, Decision 7).
 *
 * 1 is average. A spoof above 0.7 is drawn to opponents, more so the hotter
 * it is; one below 0.7 is shy of them (`appetite` in spoof-ai.ts).
 */

/** The lowest and highest temperament a spoof can have. */
export const MIN_TEMPERAMENT = 0.1;
export const MAX_TEMPERAMENT = 2;

/** How far a spoof's temperament can stray from its type's average, either way. */
export const TEMPERAMENT_SPREAD = 0.4;

/**
 * Each type's average temperament, set on #51.
 * The hidden angry pawns run hottest, so their subtype shows through play,
 * and noble pawns calmest.
 */
export const typeTemperament: Readonly<Record<SpoofType, number>> = {
  'pawn-angry': 1.7,
  knight: 1.4,
  rook: 1.2,
  king: 1,
  'pawn-basic': 1,
  queen: 0.8,
  bishop: 0.7,
  'pawn-noble': 0.5,
};

/** Draws a spoof's temperament: its type's average, give or take up to the spread. */
export function drawTemperament(type: SpoofType, random: Random): number {
  const value = typeTemperament[type] + random.uniform(-TEMPERAMENT_SPREAD, TEMPERAMENT_SPREAD);
  return Math.min(MAX_TEMPERAMENT, Math.max(MIN_TEMPERAMENT, value));
}
