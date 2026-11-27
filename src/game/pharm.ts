import { COMBINE_TYPE_ODDS } from './combine';
import type { Random } from './random';
import { createRandom } from './random';
import { PROSPECTS, type Roster } from './roster';
import { minimumTotal, skillNames, skillTotal, typeProfiles } from './skills';
import { spoofTypes, type SpoofType } from './spoof-types';
import type { Result } from './stats';
import { SPOOFS_PER_TEAM, generateSpoof, type Spoof, type Team } from './teams';

/**
 * The Pharm's rules (#107): draft picks, which are prospects, and drafting
 * one. Pure game logic: `src/storage/` saves the roster, and the Pharm
 * screens (#108–#110) show it.
 *
 * The owner's rules (#105, 2026-11-27):
 * - A draft pick is a prospect. Each loss, not a forfeit, brings one new
 *   prospect, up to 3; at 3, a loss replaces the oldest.
 * - A team drafts only with 3, and drafting cleans the slate: the chosen
 *   prospect replaces a spoof, the others go, and the team is back to 0.
 * - Prospects come from the team's level: mostly between its weakest and
 *   strongest spoof by raw skill total, rarely outside, under a hard
 *   ceiling on the team's total skill.
 *
 * Nothing here is ever shown: not a prospect's total, the range, or whether
 * it's an outlier (Decision 7).
 */

/**
 * The most skill a team may hold in total: 60 a skill on average (the owner,
 * 2026-11-27; Claude's proposal, for the #112 review). A new team averages
 * about 48, and the league's best team 55. #113 checks saves against it.
 */
export const TEAM_SKILL_CEILING = 60 * skillNames.length * SPOOFS_PER_TEAM;

/** The prospect rule's numbers, for the owner to tune in #112. */
export interface ProspectTuning {
  /** The share of prospects that fall outside the team's range (the owner: 3–5%). */
  readonly outlierRate: number;
  /** How far beyond the range an outlier may go, as a share of the range's edge. */
  readonly outlierReach: number;
  /** Half the narrowest the range may be, as a share of the team's average spoof: a tight range widens downward to twice this. */
  readonly minHalfWidth: number;
}

export const DEFAULT_PROSPECT_TUNING: ProspectTuning = {
  outlierRate: 0.04,
  outlierReach: 0.15,
  minHalfWidth: 0.05,
};

/** The face types, of which a team may hold 2 each, as in the prototype. */
const FACES: readonly SpoofType[] = ['rook', 'bishop', 'knight'];
const ROYALS: readonly SpoofType[] = ['king', 'queen'];
/** The most royals (kings and queens) a team may hold, as in the prototype. */
export const MAX_ROYALS = 1;
/** The most of each face type a team may hold, as in the prototype. */
export const MAX_EACH_FACE = 2;

/** The team's total skill: what the ceiling limits. */
export function teamSkillTotal(team: Team): number {
  return team.spoofs.reduce((sum, s) => sum + skillTotal(s.skills), 0);
}

/**
 * The types a prospect may be: those that, in place of any one spoof, keep
 * the team to 1 royal and 2 of each face type (the prototype's
 * `filter_draft_pick_avatar_options`). So any prospect can replace any spoof.
 * Pawns are always allowed.
 */
export function prospectTypes(team: Team): SpoofType[] {
  const count = (types: readonly SpoofType[]) =>
    team.spoofs.filter((s) => types.includes(s.type)).length;
  return spoofTypes.filter((type) => {
    if (ROYALS.includes(type)) return count(ROYALS) < MAX_ROYALS;
    if (FACES.includes(type)) return count([type]) < MAX_EACH_FACE;
    return true;
  });
}

/** Where a team's prospects' skill totals fall, and the most any may have. */
export interface ProspectRange {
  /** The bottom of the range: the weakest spoof's total, unless widened. */
  readonly low: number;
  /** The top of the range: the strongest spoof's total, unless widened or capped. */
  readonly high: number;
  /**
   * The most a prospect may have: swapping it in for the team's weakest
   * spoof then brings the team exactly to `TEAM_SKILL_CEILING`. Swapping it
   * for any other spoof leaves the team lower still.
   */
  readonly cap: number;
}

/**
 * The range a team's prospects are drawn from: its weakest to its strongest
 * spoof by raw skill total, kept under the cap, and widened downward to at
 * least twice `minHalfWidth`. Near the ceiling the cap pulls the range down
 * toward the weakest spoof.
 */
export function prospectRange(
  team: Team,
  tuning: ProspectTuning = DEFAULT_PROSPECT_TUNING,
): ProspectRange {
  const totals = team.spoofs.map((s) => skillTotal(s.skills));
  const weakest = Math.min(...totals);
  const cap = TEAM_SKILL_CEILING - (teamSkillTotal(team) - weakest);
  const halfWidth = tuning.minHalfWidth * (teamSkillTotal(team) / totals.length);
  // Widened downward only, so the top stays at the strongest spoof: widening
  // upward let every draft lift it a little, and teams climbed to the
  // ceiling (#107's balance check).
  const high = Math.min(Math.max(...totals), cap);
  const low = Math.min(weakest, high - 2 * halfWidth);
  return { low, high, cap };
}

/**
 * A prospect's skill total: in the range, with a soft middle (the mean of
 * two even draws, so mid-range is likelier than either end), or for
 * `outlierRate` of prospects, beyond it by up to `outlierReach` of the edge,
 * half above and half below. An outlier above the cap goes below instead.
 * Never above the cap, and never below 1 a skill.
 */
export function drawProspectTotal(
  range: ProspectRange,
  random: Random,
  tuning: ProspectTuning = DEFAULT_PROSPECT_TUNING,
): number {
  let total: number;
  if (random.chance(tuning.outlierRate)) {
    const reach = random.uniform(0, tuning.outlierReach);
    const above = random.chance(0.5) && range.high < range.cap;
    total = above ? range.high * (1 + reach) : range.low * (1 - reach);
  } else {
    const share = (random.next() + random.next()) / 2;
    total = range.low + (range.high - range.low) * share;
  }
  return Math.max(skillNames.length, Math.min(Math.round(total), Math.floor(range.cap)));
}

/** A whole-number seed for a team's `n`th prospect, from its roster's seed. */
export function prospectSeed(rosterSeed: number, n: number): number {
  return (Math.imul(rosterSeed ^ 0x2f6b1c3d, 0x85ebca6b) + n * 0x9e3779b1) >>> 0;
}

/**
 * The team's next prospect, drawn like a combine candidate: a type allowed
 * on the team, by the combine's odds, among those whose limits fit its skill
 * total; then its skills, temperament and a name unlike the team's spoofs
 * and its other prospects. Seeded from the roster, so the same team and
 * roster always draw the same prospect. Its id is `x` and its number.
 */
export function drawProspect(
  team: Team,
  roster: Roster,
  tuning: ProspectTuning = DEFAULT_PROSPECT_TUNING,
): Spoof {
  const n = roster.prospectsDrawn + 1;
  const random = createRandom(prospectSeed(roster.seed, n));
  const range = prospectRange(team, tuning);
  let total = drawProspectTotal(range, random, tuning);
  const allowed = prospectTypes(team);
  // Never more than the strongest allowed type can hold: without this, a
  // strong outlier beyond every type's limit fell through to the weakest
  // possible pawn below (#116 review).
  total = Math.min(total, Math.max(...allowed.map((type) => typeProfiles[type].maxTotal)));
  let fits = allowed.filter(
    (type) => minimumTotal(type) <= total && total <= typeProfiles[type].maxTotal,
  );
  if (fits.length === 0) {
    // Too low for every allowed type: the least a type can have.
    const lowest = Math.min(...allowed.map(minimumTotal));
    fits = allowed.filter((type) => minimumTotal(type) === lowest);
    total = lowest;
  }
  const type = random.weighted(fits.map((t) => [t, COMBINE_TYPE_ODDS[t]] as const));
  const taken = [...team.spoofs, ...roster.prospects].map((s) => s.name);
  return generateSpoof(`x${String(n)}`, type, total, random, taken);
}

/**
 * The roster after a match (#105): a loss brings a new prospect, and at 3
 * replaces the oldest. Wins, ties and forfeits change nothing.
 */
export function afterMatch(
  roster: Roster,
  team: Team,
  result: Result,
  tuning: ProspectTuning = DEFAULT_PROSPECT_TUNING,
): Roster {
  if (result !== 'lost') return roster;
  const prospect = drawProspect(team, roster, tuning);
  const kept = roster.prospects.length < PROSPECTS ? roster.prospects : roster.prospects.slice(1);
  return { ...roster, prospectsDrawn: roster.prospectsDrawn + 1, prospects: [...kept, prospect] };
}

/** Whether the team holds enough draft picks (prospects) to draft one. */
export function canDraft(roster: Roster): boolean {
  return roster.prospects.length >= PROSPECTS;
}

/** Why a prospect couldn't be drafted. */
export type DraftProblem = 'too-few' | 'no-prospect' | 'no-spoof' | 'type-limit';

export type DraftResult =
  | { readonly ok: true; readonly team: Team; readonly roster: Roster }
  | { readonly ok: false; readonly problem: DraftProblem };

/**
 * Drafts a prospect in place of a spoof (#105): it takes the spoof's place,
 * so its bench seat, and the slate is cleaned, back to 0 prospects. Refused
 * with fewer than 3, for a prospect or spoof that isn't there, or when the
 * swap would break the team's type limits (which the draw prevents, but a
 * team changed since could break).
 */
export function draftProspect(
  team: Team,
  roster: Roster,
  prospectId: string,
  spoofId: string,
): DraftResult {
  if (!canDraft(roster)) return { ok: false, problem: 'too-few' };
  const prospect = roster.prospects.find((p) => p.id === prospectId);
  if (!prospect) return { ok: false, problem: 'no-prospect' };
  const index = team.spoofs.findIndex((s) => s.id === spoofId);
  if (index < 0) return { ok: false, problem: 'no-spoof' };
  const others: Team = { ...team, spoofs: team.spoofs.filter((s) => s.id !== spoofId) };
  if (!prospectTypes(others).includes(prospect.type)) return { ok: false, problem: 'type-limit' };
  const spoofs = team.spoofs.map((s, i) => (i === index ? prospect : s));
  return { ok: true, team: { ...team, spoofs }, roster: { ...roster, prospects: [] } };
}

/**
 * The team with one spoof moved to `toIndex` (#108), the others keeping
 * their order: the roster's order is the bench order in the next match, seat
 * 1 first. The team unchanged for an unknown spoof, or an index off the end.
 */
export function moveSpoof(team: Team, spoofId: string, toIndex: number): Team {
  const from = team.spoofs.findIndex((s) => s.id === spoofId);
  const moving = team.spoofs[from];
  if (!moving || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= team.spoofs.length) {
    return team;
  }
  if (from === toIndex) return team;
  const others = team.spoofs.filter((s) => s.id !== spoofId);
  return { ...team, spoofs: [...others.slice(0, toIndex), moving, ...others.slice(toIndex)] };
}
