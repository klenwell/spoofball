import { teamColorNames, type TeamColorName } from '../design/tokens';
import { DRAFT_BUDGET, createPool, type Candidate } from './combine';
import { isTeamLogo } from './logos';
import { teamNameProblem, type NameProblem } from './new-team';
import { markNames, type MarkName } from './spoof-types';
import { SPOOFS_PER_TEAM, type Team } from './teams';

/**
 * A draft in progress (#72): the team's name, color and logo from the create
 * screen, the pool's seed, the candidates picked so far, and any renames
 * and marks you chose (#74).
 * It's plain data, so it's saved as it changes and a reload brings it back.
 * The rules: at most 5 picks, within the budget, and a spoof's name is 1–16
 * characters, unlike every other in the pool (so it's unique on your team).
 */

export interface Draft {
  readonly name: string;
  readonly color: TeamColorName;
  readonly logo: string;
  readonly seed: number;
  /** Candidate ids, in the order they were picked. */
  readonly picks: readonly string[];
  /** New names, by candidate id. */
  readonly renames: Readonly<Record<string, string>>;
  /** Marks you chose (#74), by candidate id. The rest wear their type's. */
  readonly marks: Readonly<Record<string, MarkName>>;
}

/** A new draft, with nothing picked. */
export function startDraft(choices: Pick<Draft, 'name' | 'color' | 'logo'>, seed: number): Draft {
  return { ...choices, name: choices.name.trim(), seed, picks: [], renames: {}, marks: {} };
}

/** The draft's pool, with any renames and chosen marks applied. */
export function draftPool(draft: Draft): Candidate[] {
  return createPool(draft.seed).map((candidate) => {
    const { id } = candidate.spoof;
    const name = draft.renames[id];
    const mark = draft.marks[id];
    if (name === undefined && mark === undefined) return candidate;
    const spoof = {
      ...candidate.spoof,
      ...(name === undefined ? {} : { name }),
      ...(mark === undefined ? {} : { mark }),
    };
    return { ...candidate, spoof };
  });
}

function priceOf(pool: readonly Candidate[], id: string): number {
  return pool.find((c) => c.spoof.id === id)?.price ?? 0;
}

/** What's left of the budget after the picks so far. */
export function budgetLeft(draft: Draft, pool: readonly Candidate[]): number {
  return draft.picks.reduce((left, id) => left - priceOf(pool, id), DRAFT_BUDGET);
}

/** Why a candidate can't be picked: the team is full, or it costs more than what's left. */
export type PickProblem = 'full' | 'over-budget';

export function pickProblem(
  draft: Draft,
  pool: readonly Candidate[],
  id: string,
): PickProblem | null {
  if (draft.picks.includes(id)) return null;
  if (draft.picks.length >= SPOOFS_PER_TEAM) return 'full';
  if (priceOf(pool, id) > budgetLeft(draft, pool)) return 'over-budget';
  return null;
}

/** Picks a candidate, or unpicks one already picked. A pick with a problem changes nothing. */
export function togglePick(draft: Draft, pool: readonly Candidate[], id: string): Draft {
  if (!pool.some((c) => c.spoof.id === id)) return draft;
  if (draft.picks.includes(id)) return { ...draft, picks: draft.picks.filter((p) => p !== id) };
  if (pickProblem(draft, pool, id)) return draft;
  return { ...draft, picks: [...draft.picks, id] };
}

/** Why a new name can't be used: one of the name rules, or another spoof in the pool has it. */
export type RenameProblem = NameProblem | 'taken';

export function renameProblem(
  pool: readonly Candidate[],
  id: string,
  name: string,
): RenameProblem | null {
  const problem = teamNameProblem(name);
  if (problem) return problem;
  const wanted = name.trim().toLowerCase();
  const taken = pool.some((c) => c.spoof.id !== id && c.spoof.name.toLowerCase() === wanted);
  return taken ? 'taken' : null;
}

/** Renames a candidate, with spaces trimmed. A name with a problem changes nothing. */
export function renameCandidate(
  draft: Draft,
  pool: readonly Candidate[],
  id: string,
  name: string,
): Draft {
  if (!pool.some((c) => c.spoof.id === id) || renameProblem(pool, id, name)) return draft;
  return { ...draft, renames: { ...draft.renames, [id]: name.trim() } };
}

/**
 * Gives a candidate a mark (#74): any of the 16, even one a teammate wears
 * (the owner's choice: no block and no warning). An unknown mark changes nothing.
 */
export function chooseMark(
  draft: Draft,
  pool: readonly Candidate[],
  id: string,
  mark: MarkName,
): Draft {
  if (!pool.some((c) => c.spoof.id === id) || !isMarkName(mark)) return draft;
  return { ...draft, marks: { ...draft.marks, [id]: mark } };
}

function isMarkName(value: string): value is MarkName {
  return (markNames as readonly string[]).includes(value);
}

/** True once 5 are picked: the team can be finished. */
export function isDraftComplete(draft: Draft): boolean {
  return draft.picks.length === SPOOFS_PER_TEAM;
}

/** The finished team: your choices and your 5 picks, in pick order. Null until 5 are picked. */
export function draftedTeam(draft: Draft): Team | null {
  if (!isDraftComplete(draft)) return null;
  const pool = draftPool(draft);
  const spoofs = draft.picks.flatMap((id) => pool.filter((c) => c.spoof.id === id));
  if (spoofs.length !== SPOOFS_PER_TEAM) return null;
  return {
    name: draft.name,
    color: draft.color,
    logo: draft.logo,
    spoofs: spoofs.map((c) => c.spoof),
  };
}

/**
 * What's wrong with a draft, if anything: used after loading one, so a draft
 * in play always follows the rules. Null for a valid draft.
 */
export function draftProblem(draft: Draft): string | null {
  if (!Number.isInteger(draft.seed)) return 'The seed must be a whole number';
  if (teamNameProblem(draft.name) || draft.name.trim() !== draft.name) return 'Bad team name';
  if (!(teamColorNames as readonly string[]).includes(draft.color)) return 'Unknown color';
  if (!isTeamLogo(draft.logo)) return 'Unknown logo';
  const pool = draftPool(draft);
  const ids = new Set(pool.map((c) => c.spoof.id));
  if (new Set(draft.picks).size !== draft.picks.length) return 'A candidate is picked twice';
  if (draft.picks.some((id) => !ids.has(id))) return 'A pick is not in the pool';
  if (draft.picks.length > SPOOFS_PER_TEAM) return 'Too many picks';
  if (budgetLeft(draft, pool) < 0) return 'The picks cost more than the budget';
  for (const [id, name] of Object.entries(draft.renames)) {
    if (!ids.has(id)) return 'A rename is not in the pool';
    if (renameProblem(pool, id, name) || name.trim() !== name) return 'Bad spoof name';
  }
  for (const [id, mark] of Object.entries(draft.marks)) {
    if (!ids.has(id)) return 'A mark is not in the pool';
    if (!isMarkName(mark)) return 'Unknown mark';
  }
  return null;
}
