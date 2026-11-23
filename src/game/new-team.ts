import type { TeamColorName } from '../design/tokens';
import type { Random } from './random';
import { skillNames } from './skills';
import { spoofTypes, type SpoofType } from './spoof-types';
import {
  FACE_TYPES,
  MAX_TEAM_NAME_LENGTH,
  NEW_SPOOF_SKILL_TOTAL,
  ROYAL_TYPES,
  SPOOFS_PER_TEAM,
  characterCount,
  generateSpoof,
  type Spoof,
  type Team,
} from './teams';

/**
 * A new player's team (#71): the name, color and logo they chose, and 5
 * generated spoofs at a new team's strength, each with its own name. It follows the prototype's
 * `Team.new` (backgammon-chrome, models/team.py) until the combine (#72)
 * lets the player draft their own.
 */

/** A new team's skill points, shared by its 5 spoofs: 2,640, the prototype's `NEW_TEAM_SKILL_PTS`. */
export const NEW_TEAM_SKILL_TOTAL = SPOOFS_PER_TEAM * NEW_SPOOF_SKILL_TOTAL;

/** The fewest points a spoof starts with: 42 a skill, the prototype's `rook_min_pts`. */
const MIN_POINTS_PER_SKILL = 42;

/** The most points one step of the share-out can add (it can also take 2 away). */
const MAX_STEP = 8;

/**
 * Shares a team's skill points among its 5 spoofs, lowest first. Each starts
 * at 462 (42 a skill), then points go round the spoofs a few at a time,
 * sometimes taking 2 back, until the team's total is reached: the
 * prototype's `distribute_team_points`.
 */
export function shareTeamPoints(total: number, random: Random): number[] {
  const shares: number[] = Array.from(
    { length: SPOOFS_PER_TEAM },
    () => MIN_POINTS_PER_SKILL * skillNames.length,
  );
  let sum = shares.reduce((a, b) => a + b, 0);
  let next = 0;
  while (sum < total) {
    const step = random.int(-2, Math.min(total - sum, MAX_STEP));
    shares[next] = (shares[next] ?? 0) + step;
    sum += step;
    // The prototype rotated a deque to the right, so it went round last to first.
    next = (next + SPOOFS_PER_TEAM - 1) % SPOOFS_PER_TEAM;
  }
  return shares.sort((a, b) => a - b);
}

const PAWN_TYPES: readonly SpoofType[] = spoofTypes.filter((t) => t.startsWith('pawn'));
/** The prototype's "face" types: every type that isn't a pawn, royals included. */
const NON_PAWN_TYPES: readonly SpoofType[] = spoofTypes.filter((t) => !t.startsWith('pawn'));

/**
 * The types a team can still take, keeping the roster rules: at most 1
 * royal, and at most 2 of each face type (teams.ts).
 */
function allowed(options: readonly SpoofType[], taken: readonly SpoofType[]): SpoofType[] {
  const royals = taken.filter((t) => ROYAL_TYPES.includes(t)).length;
  return options.filter((type) => {
    if (ROYAL_TYPES.includes(type)) return royals < 1;
    if (FACE_TYPES.includes(type)) return taken.filter((t) => t === type).length < 2;
    return true;
  });
}

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * A new team's 5 spoofs: 2 pawns on the two smallest shares of the points, 1
 * non-pawn on the largest, and 2 of any type on the rest, in a random order.
 * Each type is picked evenly from its group, as in the prototype.
 */
export function newTeamSpoofs(random: Random): Spoof[] {
  const [low, second, third, fourth, high] = shareTeamPoints(NEW_TEAM_SKILL_TOTAL, random) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const plan: [readonly SpoofType[], number][] = [
    [PAWN_TYPES, low],
    [PAWN_TYPES, second],
    [NON_PAWN_TYPES, high],
    [spoofTypes, third],
    [spoofTypes, fourth],
  ];
  const taken: SpoofType[] = [];
  const spoofs: Spoof[] = [];
  plan.forEach(([options, total], i) => {
    const type = random.pick(allowed(options, taken));
    taken.push(type);
    const names = spoofs.map((s) => s.name);
    spoofs.push(generateSpoof(`s${String(i + 1)}`, type, total, random, names));
  });
  return shuffled(spoofs, random);
}

/** What the player chooses on the create screen. */
export interface TeamChoices {
  readonly name: string;
  readonly color: TeamColorName;
  readonly logo: string;
}

/** A new team from the player's choices, with spaces trimmed from its name, and 5 new spoofs. */
export function createTeam(choices: TeamChoices, random: Random): Team {
  return {
    name: choices.name.trim(),
    color: choices.color,
    logo: choices.logo,
    spoofs: newTeamSpoofs(random),
  };
}

/** What's wrong with a typed team name: nothing left once trimmed, or too long. */
export type NameProblem = 'empty' | 'long';

/** The problem with a team name as typed, or null. Spaces at either end don't count. */
export function teamNameProblem(name: string): NameProblem | null {
  const length = characterCount(name.trim());
  if (length === 0) return 'empty';
  if (length > MAX_TEAM_NAME_LENGTH) return 'long';
  return null;
}
