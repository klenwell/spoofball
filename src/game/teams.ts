import type { BenchSide } from './arena';
import type { TeamColorName } from '../design/tokens';
import type { Random } from './random';
import { generateSkills, sizeToRadius, skillNames, type Skills } from './skills';
import type { SpoofType } from './spoof-types';

/**
 * The spoof and team model: a spoof's type, hidden skills (#35) and size, and
 * a team's name, color and 5 spoofs. Names come later (#28); the Match epic
 * adds positions and fatigue during play.
 */

export interface Spoof {
  /** Unique within its team. */
  readonly id: string;
  readonly type: SpoofType;
  /** Hidden: never shown on screen (docs/design.md, Decision 7). */
  readonly skills: Skills;
  /** Base radius in court units, from the size skill (`sizeToRadius`), 10 to 24. */
  readonly radius: number;
}

/** A spoof with its radius worked out from its size skill. */
export function createSpoof(id: string, type: SpoofType, skills: Skills): Spoof {
  return { id, type, skills, radius: sizeToRadius(skills.size) };
}

/**
 * A new team's spoofs average 48 points a skill, the prototype's level for a
 * new team (`NEW_TEAM_SKILL_PTS` in `models/team.py`: 5 × 11 × 48).
 */
export const NEW_SPOOF_POINTS_PER_SKILL = 48;

/** A typical spoof's skill total when a new team is created: 528. */
export const NEW_SPOOF_SKILL_TOTAL = NEW_SPOOF_POINTS_PER_SKILL * skillNames.length;

/** Generates a spoof of a type with this skill total, from a random source. */
export function generateSpoof(id: string, type: SpoofType, total: number, random: Random): Spoof {
  return createSpoof(id, type, generateSkills(type, total, random));
}

export interface Team {
  name: string;
  color: TeamColorName;
  spoofs: Spoof[];
}

/**
 * 5, as in the prototype (the owner, on #44): with 3 on the court each scrum,
 * only 2 can rest, so who plays tired is a coaching decision.
 */
export const SPOOFS_PER_TEAM = 5;

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
