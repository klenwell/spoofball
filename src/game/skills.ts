import type { Random } from './random';
import { MAX_SPOOF_RADIUS, MIN_SPOOF_RADIUS, spoofTypes, type SpoofType } from './spoof-types';

/**
 * A spoof's hidden abilities (#35). Every spoof has 11 skills, each from 1 to
 * 99, that roll up into 5 comps. They shape how it plays, and **nothing on
 * screen ever shows them** (docs/design.md, Decision 7): players learn them
 * by watching.
 *
 * The prototype is the reference (`models/rook.py`: `AVATAR_DIST`,
 * `distribute_skill_points`, `skills_to_comps`, `size_to_radius`).
 */

export const skillNames = [
  'size',
  'mass',
  'growth',
  'burst',
  'stamina',
  'iq',
  'vision',
  'charisma',
  'cooperation',
  'impact',
  'constancy',
] as const;

export type SkillName = (typeof skillNames)[number];
export type Skills = Readonly<Record<SkillName, number>>;

export const compNames = ['force', 'zip', 'smarts', 'mesh', 'will'] as const;
export type CompName = (typeof compNames)[number];
export type Comps = Readonly<Record<CompName, number>>;

export const MIN_SKILL = 1;
export const MAX_SKILL = 99;

/** Each comp is a weighted average of a few skills, as in the prototype. */
const COMP_WEIGHTS: Record<CompName, Partial<Record<SkillName, number>>> = {
  force: { mass: 1, burst: 0.5 },
  zip: { burst: 1, vision: 0.5 },
  smarts: { iq: 1, vision: 0.5 },
  mesh: { cooperation: 1, constancy: 0.5 },
  will: { charisma: 1, impact: 1 },
};

export function clampSkill(value: number): number {
  return Math.min(MAX_SKILL, Math.max(MIN_SKILL, value));
}

export function comps(skills: Skills): Comps {
  const result = {} as Record<CompName, number>;
  for (const comp of compNames) {
    let weighted = 0;
    let totalWeight = 0;
    for (const [skill, weight] of Object.entries(COMP_WEIGHTS[comp]) as [SkillName, number][]) {
      weighted += skills[skill] * weight;
      totalWeight += weight;
    }
    result[comp] = clampSkill(Math.round(weighted / totalWeight));
  }
  return result;
}

export function skillTotal(skills: Skills): number {
  return skillNames.reduce((sum, name) => sum + skills[name], 0);
}

/** A spoof's base radius in court units, from its size skill: 10 at size 1, 24 at 99. */
export function sizeToRadius(size: number): number {
  const scale = (MAX_SPOOF_RADIUS - MIN_SPOOF_RADIUS) / MAX_SKILL;
  return Math.round(MIN_SPOOF_RADIUS + clampSkill(size) * scale);
}

export interface TypeProfile {
  /**
   * How strong the type is in each skill, from 1 (weak) to 5 (strong), in
   * `skillNames` order. Each step above 1 is worth 20 points to start with.
   */
  weights: readonly number[];
  /** The most skill points a spoof of this type can have in total. */
  maxTotal: number;
  /** Relative odds of drawing this type for a pool, out of 100. */
  draftOdds: number;
}

/** Each type's profile: the prototype's `AVATAR_DIST`, unchanged. */
export const typeProfiles: Readonly<Record<SpoofType, TypeProfile>> = {
  king: { weights: [5, 2, 1, 3, 1, 4, 3, 5, 1, 4, 2], maxTotal: 792, draftOdds: 2 },
  queen: { weights: [4, 4, 4, 4, 4, 3, 4, 3, 2, 1, 1], maxTotal: 792, draftOdds: 3 },
  rook: { weights: [3, 5, 5, 1, 2, 2, 1, 2, 5, 5, 4], maxTotal: 748, draftOdds: 10 },
  bishop: { weights: [1, 1, 2, 2, 3, 5, 5, 4, 4, 2, 3], maxTotal: 748, draftOdds: 10 },
  knight: { weights: [2, 3, 3, 5, 5, 1, 2, 1, 3, 3, 5], maxTotal: 748, draftOdds: 10 },
  'pawn-basic': { weights: [2, 2, 3, 3, 2, 2, 3, 2, 3, 2, 3], maxTotal: 704, draftOdds: 30 },
  'pawn-noble': { weights: [2, 2, 2, 3, 3, 2, 2, 2, 4, 2, 3], maxTotal: 704, draftOdds: 20 },
  'pawn-angry': { weights: [2, 2, 3, 3, 2, 3, 2, 3, 2, 3, 2], maxTotal: 704, draftOdds: 15 },
};

/** Each skill's starting points for a type, before random points are added. At least 1. */
export function baseSkills(type: SpoofType): Skills {
  const { weights } = typeProfiles[type];
  const base = {} as Record<SkillName, number>;
  skillNames.forEach((name, i) => {
    base[name] = Math.max(MIN_SKILL, 20 * ((weights[i] ?? 1) - 1));
  });
  return base;
}

/** The fewest skill points a spoof of this type can have. */
export function minimumTotal(type: SpoofType): number {
  return skillTotal(baseSkills(type));
}

/**
 * The share of a skill's points handed out at a time, so points spread over
 * many skills rather than piling onto one. The prototype used 10%.
 */
const CHUNK_SHARE = 0.1;

/**
 * How often a chunk goes to the type's weakest skill instead of a random one,
 * which keeps spoofs from being all spikes. The prototype's comment said 10%,
 * but its code did it 19% of the time; 19% is what it actually played with.
 */
const EVEN_OUT_CHANCE = 0.19;

/**
 * Generates a spoof's skills: its type's base, plus random points up to
 * `total` (or the type's cap, if lower). The same random sequence always
 * gives the same skills.
 */
export function generateSkills(type: SpoofType, total: number, random: Random): Skills {
  const minimum = minimumTotal(type);
  if (!Number.isInteger(total) || total < minimum) {
    throw new RangeError(
      `A ${type} needs a whole skill total of at least ${String(minimum)}, got ${String(total)}`,
    );
  }
  const skills = { ...baseSkills(type) } as Record<SkillName, number>;
  const target = Math.min(total, typeProfiles[type].maxTotal);
  let remaining = target - skillTotal(skills);
  const chunk = Math.max(1, Math.round(remaining * CHUNK_SHARE));

  while (remaining > 0) {
    const open = skillNames.filter((name) => skills[name] < MAX_SKILL);
    const name = random.chance(EVEN_OUT_CHANCE)
      ? open.reduce((low, n) => (skills[n] < skills[low] ? n : low))
      : random.pick(open);
    const points = Math.min(random.int(1, chunk), remaining, MAX_SKILL - skills[name]);
    skills[name] += points;
    remaining -= points;
  }
  return skills;
}

/** Draws a spoof type with each type's draft odds: pawns about 65% of the time, kings 2%. */
export function drawSpoofType(random: Random): SpoofType {
  return random.weighted(spoofTypes.map((type) => [type, typeProfiles[type].draftOdds] as const));
}
