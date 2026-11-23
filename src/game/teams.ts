import type { BenchSide } from './arena';
import type { ScrumEntry } from './scrum';
import { teamColorNames, type TeamColorName } from '../design/tokens';
import { isTeamLogo } from './logos';
import type { Random } from './random';
import {
  MAX_SKILL,
  MIN_SKILL,
  generateSkills,
  sizeToRadius,
  skillNames,
  type Skills,
} from './skills';
import { MAX_TEMPERAMENT, MIN_TEMPERAMENT, drawTemperament } from './temperament';
import { spoofTypes, type SpoofType } from './spoof-types';

/**
 * The spoof and team model: a spoof's type, hidden skills (#35) and size, and
 * a team's name, color, logo and 5 spoofs. Spoof names come later (#28); the
 * Match epic adds positions and fatigue during play.
 */

export interface Spoof {
  /** Unique within its team. */
  readonly id: string;
  readonly type: SpoofType;
  /** Hidden: never shown on screen (docs/design.md, Decision 7). */
  readonly skills: Skills;
  /** Base radius in court units, from the size skill (`sizeToRadius`), 10 to 24. */
  readonly radius: number;
  /**
   * How keen it is to attack: 1 is average (#51). Hidden, like its skills,
   * and not a skill itself: a style of play, neither better nor worse.
   */
  readonly temperament: number;
}

/** A spoof with its radius worked out from its size skill. */
export function createSpoof(id: string, type: SpoofType, skills: Skills, temperament = 1): Spoof {
  return { id, type, skills, radius: sizeToRadius(skills.size), temperament };
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
  // Skills first, then temperament, so adding temperament left every
  // existing spoof's skills unchanged.
  const skills = generateSkills(type, total, random);
  return createSpoof(id, type, skills, drawTemperament(type, random));
}

export interface Team {
  name: string;
  color: TeamColorName;
  /** An emoji from `TEAM_LOGOS` (logos.ts). */
  logo: string;
  spoofs: Spoof[];
}

/** A team name's most characters, as in the prototype. */
export const MAX_TEAM_NAME_LENGTH = 16;

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

/**
 * What's wrong with a team, if anything: an empty list for a valid one. Used
 * before saving a team and after loading one (#70), so a team in play always
 * has a name of 1–16 characters with no spaces at either end, one of the 8
 * colors, a logo from the set, and 5 spoofs with distinct ids and sound
 * hidden traits.
 */
export function teamProblems(team: Team): string[] {
  const problems: string[] = [];
  const name = team.name;
  if (name.trim() !== name) problems.push('The name has spaces at the start or end');
  const length = characterCount(name);
  if (length < 1 || length > MAX_TEAM_NAME_LENGTH) {
    problems.push(`The name must be 1–${String(MAX_TEAM_NAME_LENGTH)} characters`);
  }
  if (!(teamColorNames as readonly string[]).includes(team.color)) problems.push('Unknown color');
  if (!isTeamLogo(team.logo)) problems.push('Unknown logo');
  if (team.spoofs.length !== SPOOFS_PER_TEAM) {
    problems.push(`A team has ${String(SPOOFS_PER_TEAM)} spoofs`);
  }
  if (new Set(team.spoofs.map((s) => s.id)).size !== team.spoofs.length) {
    problems.push('Two spoofs share an id');
  }
  for (const spoof of team.spoofs) problems.push(...spoofProblems(spoof));
  return problems;
}

/**
 * Characters as a person counts them: an emoji, even one built from several
 * code points such as a flag, counts as one.
 */
function characterCount(text: string): number {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text))
    .length;
}

function spoofProblems(spoof: Spoof): string[] {
  const problems: string[] = [];
  const label = `Spoof ${spoof.id || '(no id)'}`;
  if (spoof.id === '') problems.push('A spoof has no id');
  if (!(spoofTypes as readonly string[]).includes(spoof.type))
    problems.push(`${label}: unknown type`);
  for (const name of skillNames) {
    const value = spoof.skills[name];
    if (!Number.isFinite(value) || value < MIN_SKILL || value > MAX_SKILL) {
      problems.push(`${label}: ${name} is out of range`);
    }
  }
  if (spoof.radius !== sizeToRadius(spoof.skills.size))
    problems.push(`${label}: radius doesn't match size`);
  if (
    !Number.isFinite(spoof.temperament) ||
    spoof.temperament < MIN_TEMPERAMENT ||
    spoof.temperament > MAX_TEMPERAMENT
  ) {
    problems.push(`${label}: temperament is out of range`);
  }
  return problems;
}

/** The spoofs a lineup has placed on the court, as scrum entries. Benched spoofs sit out. */
export function lineupEntries(lineup: Lineup): ScrumEntry[] {
  return lineup.team.spoofs.flatMap((spoof) => {
    const spot = lineup.spots[spoof.id];
    return spot && 'x' in spot
      ? [{ spoof, team: lineup.side, position: { x: spot.x, y: spot.y }, fatigue: 0 }]
      : [];
  });
}
