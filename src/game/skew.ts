import type { Random } from './random';
import { clampSkill, type SkillName, type Skills } from './skills';
import type { ScrumSkills } from './spoof-motion';

/**
 * Skills skew by match and by scrum (#62). Two hidden rules, after the
 * prototype's `apply_constancy_skew` and `apply_teammate_impact`
 * (`lib/minrook/rooks.py` and `teams.py`):
 *
 * - **Its form, once per match.** At the start of a match, each spoof's
 *   skewed skills shift at random, as likely up as down. Impact sets how wide
 *   the shift can be (widest at both extremes), and constancy narrows it. A
 *   spoof keeps that form all match: recovery restores toward it.
 * - **A nudge from its court-mates, every scrum.** At the start of a scrum,
 *   each spoof on the court is nudged by each court-mate: lifted on average by
 *   a high-impact one, dragged down by a low-impact one. Its own constancy
 *   damps the nudge. The nudge lasts only that scrum.
 *
 * Both together stay within `MAX_SKEW` of the spoof's own skills, and 1–99.
 * Nothing on screen shows either (docs/design.md, Decision 7).
 */

/** The skills that skew: the prototype's `ROOK_SKEWERS`. Size, mass, impact and constancy never do. */
export const SKEWED_SKILLS = [
  'growth',
  'burst',
  'stamina',
  'iq',
  'vision',
  'charisma',
  'cooperation',
] as const satisfies readonly SkillName[];

/** The most a spoof's form and its court-mates' nudge together move a skill from its own (the owner, #62). */
export const MAX_SKEW = 10;

/** How far impact can swing a spoof's own form: the prototype's `MAX_RAW_CONSTANCY_SKEW`. */
export const FORM_SCALE = 20;

/** How far each court-mate's impact can nudge a spoof: the prototype's `MAX_RAW_IMPACT_SKEW`. */
export const NUDGE_SCALE = 8;

/**
 * A draw from impact's range, the prototype's `impact_range`: from
 * (impact − 100)% to impact%. High impact leans up and low impact leans down;
 * either extreme is wider from 0 than impact 50's −0.5 to 0.5.
 */
function impactDraw(impact: number, random: Random): number {
  return random.uniform((impact - 100) * 0.01, impact * 0.01);
}

/** How much of a skew constancy lets through: (100 − constancy)%. */
function inconstancy(skills: Skills): number {
  return (100 - skills.constancy) * 0.01;
}

/**
 * A spoof's form for a match: its own skills, each skewed skill shifted by
 * the prototype's constancy skew. The impact draw is multiplied by a share of
 * ±(100 − constancy)% with a random sign, so the shift is as likely up as
 * down, whatever the impact. Held within `MAX_SKEW` of its own skills.
 */
export function matchForm(own: Skills, random: Random): Skills {
  const form: Record<SkillName, number> = { ...own };
  const share = inconstancy(own);
  for (const name of SKEWED_SKILLS) {
    const shift = impactDraw(own.impact, random) * FORM_SCALE * random.uniform(-share, share);
    form[name] = withinSkew(own[name], own[name] + shift);
  }
  return form;
}

/**
 * The nudge a spoof gets from its court-mates in one scrum: for each skewed
 * skill, each court-mate's impact draw × `NUDGE_SCALE`, summed, then damped
 * by the spoof's own constancy. Unlike the form, the damping has no random
 * sign, so a high-impact court-mate still lifts it on average.
 */
export function courtMateNudge(
  self: Skills,
  courtMates: readonly Skills[],
  random: Random,
): Partial<Record<SkillName, number>> {
  const damping = inconstancy(self);
  const nudge: Partial<Record<SkillName, number>> = {};
  for (const name of SKEWED_SKILLS) {
    let sum = 0;
    for (const mate of courtMates) sum += impactDraw(mate.impact, random) * NUDGE_SCALE;
    nudge[name] = sum * damping;
  }
  return nudge;
}

/**
 * A spoof's skills for one scrum: its current skills (its form, worn down by
 * any tiring) plus its court-mates' nudge. The cap applies to the form and
 * the nudge together, so the nudge moves each skill only as far as the
 * nudged form stays within `MAX_SKEW` of its own skills.
 */
export function nudged(
  own: Skills,
  form: Skills,
  current: Readonly<ScrumSkills>,
  nudge: Partial<Record<SkillName, number>>,
): ScrumSkills {
  const result = { ...current };
  for (const name of SKEWED_SKILLS) {
    const applied = withinSkew(own[name], form[name] + (nudge[name] ?? 0)) - form[name];
    result[name] = clampSkill(current[name] + applied);
  }
  return result;
}

/** A skewed value held within `MAX_SKEW` of the spoof's own, and within 1–99. */
function withinSkew(own: number, value: number): number {
  return clampSkill(Math.min(own + MAX_SKEW, Math.max(own - MAX_SKEW, value)));
}
