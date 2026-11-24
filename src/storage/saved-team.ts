import { draftProblem, type Draft } from '../game/draft';
import { isTeamLogo } from '../game/logos';
import { createRandom } from '../game/random';
import { drawSpoofName } from '../game/spoof-names';
import { createSpoof, teamProblems, type Spoof, type Team } from '../game/teams';
import { skillNames, type Skills } from '../game/skills';
import type { SpoofType } from '../game/spoof-types';
import { teamColorNames, type TeamColorName } from '../design/tokens';

/**
 * Saving your team in the browser (#70). One key in `localStorage` holds a
 * versioned record, so later epics (Stats, Pharm) can add to it and still
 * read what's already there.
 *
 * The rules:
 * - Storage can be missing, full or blocked (Safari's private mode throws on
 *   every write). None of that breaks the game: loading returns "no saved
 *   team" with a reason, and saving says it couldn't.
 * - Data that can't be read (corrupt, the wrong shape, an invalid team, or a
 *   newer version than this code knows) is left in place. Only saving a new
 *   team replaces it.
 * - A team is checked (`teamProblems`) before it's saved and after it's
 *   loaded, so a team in play is always valid.
 *
 * Versions:
 * - 1 (#70): the team, and its spoofs' types and hidden traits.
 * - 2 (#28): each spoof's name too. A version 1 team is upgraded on load:
 *   its spoofs get names drawn from a seed made from the saved text, so they
 *   come out the same on every load, even where storage won't let the
 *   upgraded team be written back.
 * - 3 (#72): a draft in progress too, beside the saved team or without one.
 *   The team is optional: a first-time player mid-draft has none yet. A
 *   version 2 record reads as version 3 with no draft.
 *
 * The skills are saved with the team. They stay hidden on screen, but anyone
 * reading the browser's storage could see them: fine for a single-player game
 * (#69 Notes).
 */

/** The `localStorage` key. */
export const STORAGE_KEY = 'spoofball';

/** The version of the saved record this code writes. */
export const SAVE_VERSION = 3;

/** The part of the browser's `Storage` this module uses, so tests can pass a fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Why there's no team to load. */
export type LoadProblem = 'none' | 'unavailable' | 'unreadable' | 'newer';
/** Why a team couldn't be saved. */
export type SaveProblem = 'unavailable' | 'full' | 'invalid';

export type LoadResult =
  /** `upgraded` is there, true, when the team came from an older version and is worth saving again. */
  | { readonly ok: true; readonly team: Team; readonly upgraded?: true }
  | { readonly ok: false; readonly problem: LoadProblem };

export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: SaveProblem; readonly details?: readonly string[] };

/** What a screen can say about each problem. */
export const STORAGE_PROBLEM_TEXT: Readonly<Record<LoadProblem | SaveProblem, string>> = {
  none: 'No team saved yet.',
  unavailable:
    "This browser isn't saving data for the game, so your team won't be kept after you leave.",
  // The data stays in place (see above), but the player can't use it, so the
  // message says what to do: the owner's wording on #77.
  unreadable: "Your saved team couldn't be read, so you'll need to create a new one.",
  newer: 'Your team was saved by a newer version of the game. Reload to get the latest version.',
  full: "The browser's storage is full, so your team couldn't be saved.",
  invalid: "That team isn't complete yet, so it wasn't saved.",
};

/** The browser's `localStorage`, or null where it's missing or blocked. */
export function browserStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Some browsers throw on merely reading `localStorage` when storage is blocked.
    return null;
  }
}

/** How a spoof is saved: its radius is worked out again from its size on load. */
interface SavedSpoof {
  id: string;
  name: string;
  type: SpoofType;
  skills: Skills;
  temperament: number;
}

interface SavedTeam {
  name: string;
  color: TeamColorName;
  logo: string;
  spoofs: SavedSpoof[];
}

/** A draft is saved as it is: plain data (`Draft` in draft.ts). */
type SavedDraft = Draft;

interface SavedRecord {
  version: number;
  team?: SavedTeam;
  draft?: SavedDraft;
}

function savedTeam(team: Team): SavedTeam {
  return {
    name: team.name,
    color: team.color,
    logo: team.logo,
    spoofs: team.spoofs.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      skills: { ...s.skills },
      temperament: s.temperament,
    })),
  };
}

function savedDraft(draft: Draft): SavedDraft {
  return {
    name: draft.name,
    color: draft.color,
    logo: draft.logo,
    seed: draft.seed,
    picks: [...draft.picks],
    renames: { ...draft.renames },
  };
}

function write(store: KeyValueStore, record: SavedRecord): SaveResult {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: isQuotaError(error) ? 'full' : 'unavailable' };
  }
}

/**
 * Saves your team. A draft in progress is kept beside it, unless `endDraft`
 * says the team is the draft's result (#72), which ends it.
 */
export function saveTeam(
  store: KeyValueStore | null,
  team: Team,
  { endDraft = false }: { endDraft?: boolean } = {},
): SaveResult {
  const problems = teamProblems(team);
  if (problems.length > 0) return { ok: false, problem: 'invalid', details: problems };
  if (!store) return { ok: false, problem: 'unavailable' };
  const draft = endDraft ? null : loadDraft(store);
  const record: SavedRecord = { version: SAVE_VERSION, team: savedTeam(team) };
  if (draft) record.draft = savedDraft(draft);
  return write(store, record);
}

/**
 * Saves a draft in progress (#72), keeping the saved team beside it. Data
 * that can't be read is replaced, as when saving a team: the player is
 * making a new one.
 */
export function saveDraft(store: KeyValueStore | null, draft: Draft): SaveResult {
  const problem = draftProblem(draft);
  if (problem) return { ok: false, problem: 'invalid', details: [problem] };
  if (!store) return { ok: false, problem: 'unavailable' };
  const loaded = loadTeam(store);
  const record: SavedRecord = { version: SAVE_VERSION, draft: savedDraft(draft) };
  if (loaded.ok) record.team = savedTeam(loaded.team);
  return write(store, record);
}

/** The record's data and text, or why there's none to read. */
type ReadResult =
  | { readonly ok: true; readonly data: Record<string, unknown>; readonly text: string }
  | { readonly ok: false; readonly problem: LoadProblem };

function readRecord(store: KeyValueStore | null): ReadResult {
  if (!store) return { ok: false, problem: 'unavailable' };
  let text: string | null;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, problem: 'unavailable' };
  }
  if (text === null) return { ok: false, problem: 'none' };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'unreadable' };
  }
  if (!isObject(data) || typeof data.version !== 'number' || !Number.isInteger(data.version)) {
    return { ok: false, problem: 'unreadable' };
  }
  if (data.version > SAVE_VERSION) return { ok: false, problem: 'newer' };
  if (data.version < 1) return { ok: false, problem: 'unreadable' };
  return { ok: true, data, text };
}

export function loadTeam(store: KeyValueStore | null): LoadResult {
  const read = readRecord(store);
  if (!read.ok) return read;
  const { data, text } = read;
  // Since version 3, a record can hold just a draft, with no team yet.
  if (data.version === 3 && data.team === undefined) return { ok: false, problem: 'none' };

  // Version 1 had no spoof names: they're drawn here, from the saved text.
  const upgrading = data.version === 1;
  const team = teamFrom(data.team, upgrading ? nameDrawer(text) : null);
  if (!team || teamProblems(team).length > 0) return { ok: false, problem: 'unreadable' };
  return upgrading ? { ok: true, team, upgraded: true } : { ok: true, team };
}

/**
 * The draft in progress (#72), or null: when there's none, or it can't be
 * read or doesn't follow the draft's rules. An unreadable draft is left in
 * place until the next save replaces it.
 */
export function loadDraft(store: KeyValueStore | null): Draft | null {
  const read = readRecord(store);
  if (!read.ok) return null;
  const draft = draftFrom(read.data.draft);
  return draft && draftProblem(draft) === null ? draft : null;
}

/** A draft from saved data of the right shape, or null. `draftProblem` checks its values. */
function draftFrom(data: unknown): Draft | null {
  if (!isObject(data) || !Array.isArray(data.picks) || !isObject(data.renames)) return null;
  const { name, color, logo, seed } = data;
  if (
    typeof name !== 'string' ||
    typeof color !== 'string' ||
    typeof logo !== 'string' ||
    typeof seed !== 'number'
  ) {
    return null;
  }
  if (!(teamColorNames as readonly string[]).includes(color) || !isTeamLogo(logo)) return null;
  const picks: string[] = [];
  for (const pick of data.picks) {
    if (typeof pick !== 'string') return null;
    picks.push(pick);
  }
  const renames: Record<string, string> = {};
  for (const [id, newName] of Object.entries(data.renames)) {
    if (typeof newName !== 'string') return null;
    renames[id] = newName;
  }
  return { name, color: color as TeamColorName, logo, seed, picks, renames };
}

/** Names a version 1 team's spoofs, in order, from a seed made from the saved text. */
type NameDrawer = (taken: readonly string[]) => string;

function nameDrawer(text: string): NameDrawer {
  const random = createRandom(textSeed(text));
  return (taken) => drawSpoofName(random, taken);
}

/** A whole-number seed from a text: its 32-bit FNV-1a hash. */
function textSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * A team from saved data of the right shape, or null. `teamProblems` checks
 * its values. With `drawName`, the spoofs have no saved names (version 1),
 * so each is given one.
 */
function teamFrom(data: unknown, drawName: NameDrawer | null): Team | null {
  if (!isObject(data) || !Array.isArray(data.spoofs)) return null;
  const { name, color, logo } = data;
  if (typeof name !== 'string' || typeof color !== 'string' || typeof logo !== 'string')
    return null;
  const spoofs: Spoof[] = [];
  for (const item of data.spoofs) {
    const name = drawName ? drawName(spoofs.map((s) => s.name)) : undefined;
    const spoof = spoofFrom(item, name);
    if (!spoof) return null;
    spoofs.push(spoof);
  }
  return { name, color: color as TeamColorName, logo, spoofs };
}

/** A spoof from saved data of the right shape, or null. `drawnName` stands in for a version 1 spoof's missing name. */
function spoofFrom(data: unknown, drawnName: string | undefined): Spoof | null {
  if (!isObject(data) || !isObject(data.skills)) return null;
  const { id, type, temperament, skills } = data;
  const name = drawnName ?? data.name;
  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof type !== 'string' ||
    typeof temperament !== 'number'
  ) {
    return null;
  }
  const values: Partial<Record<(typeof skillNames)[number], number>> = {};
  for (const name of skillNames) {
    const value = skills[name];
    if (typeof value !== 'number') return null;
    values[name] = value;
  }
  return createSpoof(id, name, type as SpoofType, values as Skills, temperament);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A full-storage error, which browsers name differently. */
function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}
