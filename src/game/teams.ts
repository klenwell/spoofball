import type { BenchSide } from './arena';
import type { TeamColorName } from '../design/tokens';
import type { SpoofType } from './spoof-types';

/**
 * The spoof and team model, kept minimal for now (#22): a spoof's type and
 * size, and a team's name, color and 6 spoofs. The Expansion epic adds names
 * (#28) and the hidden skills; the Match epic adds positions and fatigue.
 */

export interface Spoof {
  /** Unique within its team. */
  id: string;
  type: SpoofType;
  /** Base radius in court units, between MIN_SPOOF_RADIUS and MAX_SPOOF_RADIUS. */
  radius: number;
}

export interface Team {
  name: string;
  color: TeamColorName;
  spoofs: Spoof[];
}

export const SPOOFS_PER_TEAM = 6;

/** Where a spoof is before play: a seat on its team's bench, or a spot on the court. */
export type Spot = { seat: number } | { x: number; y: number };

export interface Lineup {
  side: BenchSide;
  team: Team;
  /** A spot for each of the team's spoofs, by spoof id. */
  spots: Record<string, Spot>;
}

/** Royals (king, queen): at most 1 per team, as in the prototype's draft. */
export const ROYAL_TYPES: readonly SpoofType[] = ['king', 'queen'];
/** Face types (rook, bishop, knight): at most 2 of each per team. */
export const FACE_TYPES: readonly SpoofType[] = ['rook', 'bishop', 'knight'];
