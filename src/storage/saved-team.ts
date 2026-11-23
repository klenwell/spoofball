import { createSpoof, teamProblems, type Spoof, type Team } from '../game/teams';
import { skillNames, type Skills } from '../game/skills';
import type { SpoofType } from '../game/spoof-types';
import type { TeamColorName } from '../design/tokens';

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
 * The skills are saved with the team. They stay hidden on screen, but anyone
 * reading the browser's storage could see them: fine for a single-player game
 * (#69 Notes).
 */

/** The `localStorage` key. */
export const STORAGE_KEY = 'spoofball';

/** The version of the saved record this code writes. */
export const SAVE_VERSION = 1;

/** The part of the browser's `Storage` this module uses, so tests can pass a fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Why there's no team to load. */
export type LoadProblem = 'none' | 'unavailable' | 'unreadable' | 'newer';
/** Why a team couldn't be saved. */
export type SaveProblem = 'unavailable' | 'full' | 'invalid';

export type LoadResult =
  | { readonly ok: true; readonly team: Team }
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

interface SavedRecord {
  version: number;
  team: SavedTeam;
}

export function saveTeam(store: KeyValueStore | null, team: Team): SaveResult {
  const problems = teamProblems(team);
  if (problems.length > 0) return { ok: false, problem: 'invalid', details: problems };
  if (!store) return { ok: false, problem: 'unavailable' };
  const record: SavedRecord = {
    version: SAVE_VERSION,
    team: {
      name: team.name,
      color: team.color,
      logo: team.logo,
      spoofs: team.spoofs.map((s) => ({
        id: s.id,
        type: s.type,
        skills: { ...s.skills },
        temperament: s.temperament,
      })),
    },
  };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: isQuotaError(error) ? 'full' : 'unavailable' };
  }
}

export function loadTeam(store: KeyValueStore | null): LoadResult {
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
  // Version 1 is the first; a later version upgrades older records here.
  if (data.version !== SAVE_VERSION) return { ok: false, problem: 'unreadable' };

  const team = teamFrom(data.team);
  if (!team || teamProblems(team).length > 0) return { ok: false, problem: 'unreadable' };
  return { ok: true, team };
}

/** A team from saved data of the right shape, or null. `teamProblems` checks its values. */
function teamFrom(data: unknown): Team | null {
  if (!isObject(data) || !Array.isArray(data.spoofs)) return null;
  const { name, color, logo } = data;
  if (typeof name !== 'string' || typeof color !== 'string' || typeof logo !== 'string')
    return null;
  const spoofs: Spoof[] = [];
  for (const item of data.spoofs) {
    const spoof = spoofFrom(item);
    if (!spoof) return null;
    spoofs.push(spoof);
  }
  return { name, color: color as TeamColorName, logo, spoofs };
}

function spoofFrom(data: unknown): Spoof | null {
  if (!isObject(data) || !isObject(data.skills)) return null;
  const { id, type, temperament, skills } = data;
  if (typeof id !== 'string' || typeof type !== 'string' || typeof temperament !== 'number') {
    return null;
  }
  const values: Partial<Record<(typeof skillNames)[number], number>> = {};
  for (const name of skillNames) {
    const value = skills[name];
    if (typeof value !== 'number') return null;
    values[name] = value;
  }
  return createSpoof(id, type as SpoofType, values as Skills, temperament);
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
