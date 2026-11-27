import { computerMatch } from '../game/computer-play';
import { DRAFT_BUDGET } from '../game/combine';
import { draftPool, draftedTeam, startDraft, togglePick } from '../game/draft';
import { LEAGUE } from '../game/league';
import { TEAM_LOGOS } from '../game/logos';
import { matchRecord, type MatchRecord, type Outcome } from '../game/match';
import { TEAM_SKILL_CEILING, prospectRange, teamSkillTotal } from '../game/pharm';
import { createRandom, type Random } from '../game/random';
import { PROSPECTS, type Roster } from '../game/roster';
import { skillTotal } from '../game/skills';
import { SPOOFS_PER_TEAM, type Team } from '../game/teams';
import { teamColorNames } from '../design/tokens';

/**
 * The QA console's logic (#117): everything but the browser glue in
 * `qa.ts`, so it's tested in Node. Dev only: nothing here ships, and the
 * hidden numbers it shows are for QA (the owner, 2026-11-27).
 */

/** A command's outcome: what it did, or what went wrong, in a line for the Console. */
export type QaResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/**
 * The league team named, ignoring case, or one drawn at random when no name
 * is given. An unknown name lists the league.
 */
export function findOpponent(name: string | undefined, random: Random): QaResult<Team> {
  if (name === undefined) return { ok: true, value: random.pick(LEAGUE) };
  const wanted = name.trim().toLowerCase();
  const team = LEAGUE.find((t) => t.name.toLowerCase() === wanted);
  if (team) return { ok: true, value: team };
  return {
    ok: false,
    message: `No league team called "${name}". The league: ${LEAGUE.map((t) => t.name).join(', ')}.`,
  };
}

/** The most matches `simUntil` plays looking for a result before it gives up. */
export const MAX_TRIES = 500;

/**
 * Plays matches, computer against computer, from `seed` on, until one ends
 * in `result` (any result when none is asked for). Its record, as play would
 * record it, and the seeds tried; or a message after `MAX_TRIES`.
 */
export function simUntil(
  team: Team,
  opponent: Team,
  result: Outcome | undefined,
  seed: number,
  maxTries = MAX_TRIES,
): QaResult<{ record: MatchRecord; tries: number }> {
  for (let tries = 1; tries <= maxTries; tries += 1) {
    const record = matchRecord(computerMatch(team, opponent, seed + tries - 1));
    if (result === undefined || record.result === result)
      return { ok: true, value: { record, tries } };
  }
  return {
    ok: false,
    message: `No ${String(result)} against ${opponent.name} in ${String(maxTries)} matches. Try another opponent.`,
  };
}

/** A line saying how a simulated match went. */
export function matchLine(record: MatchRecord): string {
  return `${record.result} ${String(record.score.home)}–${String(record.score.visitor)} against ${record.teams.visitor}`;
}

/**
 * A team drafted from a combine pool, as a finished draft would make it:
 * candidates taken in a random order, each while the budget still leaves
 * room for the rest at their cheapest. Its color and logo come from the seed.
 */
export function quickDraft(seed: number, name = 'QA Team'): Team {
  const random = createRandom(seed);
  let draft = startDraft(
    { name, color: random.pick(teamColorNames), logo: random.pick(TEAM_LOGOS) },
    seed,
  );
  const pool = draftPool(draft);
  const order = pool
    .map((candidate) => ({ candidate, key: random.next() }))
    .sort((a, b) => a.key - b.key)
    .map((c) => c.candidate);
  const byPrice = [...pool].sort((a, b) => a.price - b.price);
  for (const candidate of order) {
    if (draft.picks.length >= SPOOFS_PER_TEAM) break;
    const others = byPrice.filter((c) => c !== candidate && !draft.picks.includes(c.spoof.id));
    const stillNeeded = SPOOFS_PER_TEAM - draft.picks.length - 1;
    const room = others.slice(0, stillNeeded).reduce((sum, c) => sum + c.price, 0);
    const spent = draft.picks.reduce(
      (sum, id) => sum + (pool.find((c) => c.spoof.id === id)?.price ?? 0),
      0,
    );
    if (spent + candidate.price + room <= DRAFT_BUDGET)
      draft = togglePick(draft, pool, candidate.spoof.id);
  }
  const team = draftedTeam(draft);
  if (!team) throw new Error(`No affordable team in pool ${String(seed)}`);
  return team;
}

/** A row of `QA.team()`: one spoof, with its hidden type and skill total (dev only). */
export interface SpoofRow {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly mark: string;
  readonly total: number;
}

export function teamRows(team: Team): SpoofRow[] {
  return team.spoofs.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    mark: s.mark,
    total: skillTotal(s.skills),
  }));
}

/** The line under `QA.team()`: the team's total against the ceiling. */
export function teamLine(team: Team): string {
  return `${team.name}: ${String(teamSkillTotal(team))} of the ${String(TEAM_SKILL_CEILING)} ceiling`;
}

/** A row of `QA.prospects()`: a prospect, its total, and where it falls against the range. */
export interface ProspectRow extends SpoofRow {
  readonly range: 'in' | 'above' | 'below';
}

export function prospectRows(team: Team, roster: Roster): ProspectRow[] {
  const range = prospectRange(team);
  return roster.prospects.map((p) => {
    const total = skillTotal(p.skills);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      mark: p.mark,
      total,
      range: total > range.high ? 'above' : total < range.low ? 'below' : 'in',
    };
  });
}

/** The line under `QA.prospects()`: the range they're drawn from, and how many picks are held. */
export function prospectLine(team: Team, roster: Roster): string {
  const { low, high, cap } = prospectRange(team);
  const picks = `${String(roster.prospects.length)} of ${String(PROSPECTS)} picks`;
  return `${picks}. Range ${String(Math.round(low))}–${String(Math.round(high))}, cap ${String(Math.round(cap))}.`;
}
