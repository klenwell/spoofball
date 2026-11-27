import { draftProblem, type Draft } from '../game/draft';
import { isTeamLogo } from '../game/logos';
import type { MatchRecord } from '../game/match';
import { createRandom } from '../game/random';
import { emptyStats, type BehaviorStats } from '../game/scrum';
import {
  LOG_LENGTH,
  addMatch,
  emptyTeamStats,
  type LoggedMatch,
  type Result,
  type Results,
  type SpoofTotals,
  type TeamStats,
} from '../game/stats';
import { afterMatch } from '../game/pharm';
import { emptyRoster, rosterProblems, type Roster } from '../game/roster';
import { drawSpoofName } from '../game/spoof-names';
import { createSpoof, teamProblems, type Spoof, type Team } from '../game/teams';
import { skillNames, type Skills } from '../game/skills';
import { markNames, type MarkName, type SpoofType } from '../game/spoof-types';
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
 * - 4 (#74): each spoof's mark, and the marks chosen in a draft. An older
 *   team's spoofs, and an older draft's candidates, wear their types' marks
 *   (since #74, the new defaults).
 * - 5 (#89): the team's stats: when it joined, its totals and its match log.
 *   A version 4 team loads with an empty record and no join date. Stats that
 *   can't be read are left in place, like the rest: a match isn't added to
 *   them, and saving the same team again keeps them as they are.
 *   Since #90 it can also hold the match in progress: the scrums played so
 *   far, recorded as a forfeit if the game loads with it still there. Older
 *   version 5 code ignores it, so the version stays 5.
 * - 6 (#106): the team's Pharm (`Roster`): its prospects, which are its
 *   draft picks (#105). Each spoof's totals also keep the name and mark it
 *   had in its latest match, for when it leaves the team (#100). A version 5
 *   team loads with no prospects, so no picks, its stats kept. The version
 *   changes because version 5 code, saving the team again, would drop the
 *   roster.
 *
 * The skills are saved with the team. They stay hidden on screen, but anyone
 * reading the browser's storage could see them: fine for a single-player game
 * (#69 Notes).
 */

/** The `localStorage` key. */
export const STORAGE_KEY = 'spoofball';

/** The version of the saved record this code writes. */
export const SAVE_VERSION = 6;

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
  /** Since version 4 (#74). */
  mark: MarkName;
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
  /**
   * The team's stats (#89): `TeamStats`, plain data, or whatever was saved
   * before, kept as it was when it can't be read.
   */
  stats?: unknown;
  /**
   * Your saved team's match in progress (#90), saved once its first scrum
   * starts and after each scrum, until it ends: `MatchInProgress`, or
   * whatever was saved, kept as it was when it can't be read.
   */
  inProgress?: unknown;
  /**
   * The team's Pharm (#106): `Roster`, with its prospects saved as spoofs
   * are, or whatever was saved, kept as it was when it can't be read.
   */
  roster?: unknown;
}

/** The parts of the record that belong to the saved team, beside it: kept as they are by saves that don't change them. */
const TEAM_PARTS = ['stats', 'inProgress', 'roster'] as const;

/** Copies the saved team's parts from the record `before` into `record`, as they were, except those named in `except`. */
function keepTeamParts(
  before: Record<string, unknown> | null,
  record: SavedRecord,
  except: readonly (typeof TEAM_PARTS)[number][] = [],
): void {
  for (const part of TEAM_PARTS) {
    if (except.includes(part)) continue;
    const value = before?.[part];
    if (value !== undefined) record[part] = value;
  }
}

/** A match in progress (#90): its scrums so far, and the day and local time (#95) they were played. */
interface MatchInProgress {
  date: string;
  time?: string;
  record: MatchRecord;
}

/** When a match was played: `time` is the local `HH:MM` (#95), for its line in the match log. */
export interface PlayedAt {
  readonly time?: string;
}

function savedSpoof(spoof: Spoof): SavedSpoof {
  return {
    id: spoof.id,
    name: spoof.name,
    type: spoof.type,
    skills: { ...spoof.skills },
    temperament: spoof.temperament,
    mark: spoof.mark,
  };
}

function savedTeam(team: Team): SavedTeam {
  return {
    name: team.name,
    color: team.color,
    logo: team.logo,
    spoofs: team.spoofs.map(savedSpoof),
  };
}

/** How a roster is saved: its prospects as spoofs are. */
interface SavedRoster {
  seed: number;
  prospectsDrawn: number;
  prospects: SavedSpoof[];
}

function savedRoster(roster: Roster): SavedRoster {
  return {
    seed: roster.seed,
    prospectsDrawn: roster.prospectsDrawn,
    prospects: roster.prospects.map(savedSpoof),
  };
}

/**
 * A version 5 team's roster seed, from what doesn't change about the team:
 * its name and its spoofs' ids, in any order. So it draws the same prospects
 * on every load, even after a spoof is renamed or the roster reordered,
 * until its roster is first saved.
 */
function version5RosterSeed(team: Team): number {
  const ids = team.spoofs.map((s) => s.id).sort();
  return textSeed(JSON.stringify([team.name, ids]));
}

/**
 * A new team's roster seed, from the whole team, skills included. A
 * re-drafted team keeps its name, and every draft numbers its pool `p1`–`p10`,
 * so its ids alone could give back its old seed, and its old prospects (#114
 * review). Its skills come from the new draft's seed, so they don't.
 */
function newTeamRosterSeed(team: Team): number {
  return textSeed(JSON.stringify(savedTeam(team)));
}

function savedDraft(draft: Draft): SavedDraft {
  return {
    name: draft.name,
    color: draft.color,
    logo: draft.logo,
    seed: draft.seed,
    picks: [...draft.picks],
    renames: { ...draft.renames },
    marks: { ...draft.marks },
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

/** The saved record's data, or null when there's none that can be read. */
function savedData(store: KeyValueStore): Record<string, unknown> | null {
  const read = readRecord(store);
  return read.ok ? read.data : null;
}

/**
 * Saves your team. A draft in progress is kept beside it, unless `endDraft`
 * says the team is the draft's result (#72), which ends it.
 *
 * `joined` says this is a new team, created that day (`YYYY-MM-DD`): it
 * starts a fresh record (#89), and the old team's goes with it. Without it,
 * the team is the one already saved, and its stats are kept.
 */
export function saveTeam(
  store: KeyValueStore | null,
  team: Team,
  { endDraft = false, joined }: { endDraft?: boolean; joined?: string } = {},
): SaveResult {
  const problems = teamProblems(team);
  if (joined !== undefined && !isDay(joined))
    problems.push('The join date must be a day, as YYYY-MM-DD.');
  if (problems.length > 0) return { ok: false, problem: 'invalid', details: problems };
  if (!store) return { ok: false, problem: 'unavailable' };
  const draft = endDraft ? null : loadDraft(store);
  const record: SavedRecord = { version: SAVE_VERSION, team: savedTeam(team) };
  if (draft) record.draft = savedDraft(draft);
  if (joined === undefined) {
    keepTeamParts(savedData(store), record);
  } else {
    // A new team replaces the old one, its record and its Pharm, so the old
    // team's match in progress goes too: a forfeit would be discarded as it
    // was written (#90).
    record.stats = emptyTeamStats(joined);
    record.roster = savedRoster(emptyRoster(newTeamRosterSeed(team)));
  }
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
  // Starting a new team doesn't forfeit the match in progress (#90): it waits.
  keepTeamParts(savedData(store), record);
  return write(store, record);
}

export type StatsResult =
  | { readonly ok: true; readonly stats: TeamStats }
  | { readonly ok: false; readonly problem: LoadProblem };

/**
 * The saved team's stats (#89). A team saved before them has an empty
 * record with no join date. With no team to load, the reason there's none.
 */
export function loadStats(store: KeyValueStore | null): StatsResult {
  const loaded = loadTeam(store);
  if (!loaded.ok) return loaded;
  const data = store ? savedData(store) : null;
  if (data?.stats === undefined) return { ok: true, stats: emptyTeamStats(null) };
  const stats = statsFrom(data.stats);
  return stats ? { ok: true, stats } : { ok: false, problem: 'unreadable' };
}

export type RosterResult =
  | { readonly ok: true; readonly roster: Roster }
  | { readonly ok: false; readonly problem: LoadProblem };

/**
 * The saved team's Pharm (#106). A team saved before it has no prospects, so
 * no draft picks. With no team to load, the reason there's none. A roster
 * that can't be read, or holds impossible values, is left in place
 * (`unreadable`).
 */
export function loadRoster(store: KeyValueStore | null): RosterResult {
  const loaded = loadTeam(store);
  if (!loaded.ok) return loaded;
  const data = store ? savedData(store) : null;
  if (data?.roster === undefined)
    return { ok: true, roster: emptyRoster(version5RosterSeed(loaded.team)) };
  const roster = rosterFrom(data.roster);
  return roster && rosterProblems(roster).length === 0
    ? { ok: true, roster }
    : { ok: false, problem: 'unreadable' };
}

/**
 * Saves the saved team's Pharm (#106), keeping the rest of the record as it
 * is. Refused (`invalid`) when it holds impossible values, and with no team
 * saved (`none`) or one that can't be read.
 */
export function saveRoster(
  store: KeyValueStore | null,
  roster: Roster,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: RecordProblem; readonly details?: readonly string[] } {
  const problems = rosterProblems(roster);
  if (problems.length > 0) return { ok: false, problem: 'invalid', details: problems };
  const loaded = loadTeam(store);
  if (!loaded.ok) return loaded;
  if (!store) return { ok: false, problem: 'unavailable' };
  const saved: SavedRecord = { version: SAVE_VERSION, team: savedTeam(loaded.team) };
  const draft = loadDraft(store);
  if (draft) saved.draft = savedDraft(draft);
  keepTeamParts(savedData(store), saved, ['roster']);
  saved.roster = savedRoster(roster);
  return write(store, saved);
}

/** Why a match couldn't be added to the record. */
export type RecordProblem = LoadProblem | SaveProblem;

export type RecordResult =
  | { readonly ok: true; readonly stats: TeamStats }
  | { readonly ok: false; readonly problem: RecordProblem };

/**
 * Adds a match your saved team played to its stats (#89), on `date`
 * (`YYYY-MM-DD`), and saves them. Refused (`invalid`) when the match's home
 * team isn't the saved team: only your own team is recorded (#88), never the
 * quick start's. Stats that can't be read are left alone (`unreadable`).
 *
 * The match is over, so the match in progress (#90) is cleared, even if the
 * stats can't be saved: a finished match must never turn into a forfeit.
 */
export function recordMatch(
  store: KeyValueStore | null,
  record: MatchRecord,
  date: string,
  { time }: PlayedAt = {},
): RecordResult {
  const result = addToStats(store, record, date, { forfeit: false, time });
  if (!result.ok && store) clearMatchInProgress(store);
  return result;
}

/**
 * Saves your saved team's match in progress (#90): the scrums played so far
 * (`matchRecord(match, { soFar: true })`), on `date`. If the game next loads
 * with it still there, `recordForfeit` records it as a forfeit. Refused
 * (`invalid`) for any team but the saved one.
 */
export function saveMatchInProgress(
  store: KeyValueStore | null,
  record: MatchRecord,
  date: string,
  { time }: PlayedAt = {},
): { readonly ok: true } | { readonly ok: false; readonly problem: RecordProblem } {
  const loaded = loadTeam(store);
  if (!loaded.ok) return loaded;
  if (!store) return { ok: false, problem: 'unavailable' };
  if (!isDay(date) || !isTimeOrNone(time) || !playedBy(record, loaded.team))
    return { ok: false, problem: 'invalid' };
  const saved: SavedRecord = { version: SAVE_VERSION, team: savedTeam(loaded.team) };
  const draft = loadDraft(store);
  if (draft) saved.draft = savedDraft(draft);
  keepTeamParts(savedData(store), saved, ['inProgress']);
  const inProgress: MatchInProgress = { date, ...(time === undefined ? {} : { time }), record };
  saved.inProgress = inProgress;
  return write(store, saved);
}

/**
 * Whether a match is in progress (#90): saved once its first scrum starts,
 * until it ends. The roster's order can't change then (#108).
 */
export function hasMatchInProgress(store: KeyValueStore | null): boolean {
  const data = store ? savedData(store) : null;
  return data?.inProgress !== undefined;
}

/**
 * Records a match left unfinished as a forfeit (#90), and clears it: called
 * as the game loads. Null when there's no match in progress. One that can't
 * be read, or isn't the saved team's, is left in place.
 */
export function recordForfeit(store: KeyValueStore | null): RecordResult | null {
  const data = store ? savedData(store) : null;
  if (data?.inProgress === undefined) return null;
  const inProgress = matchInProgressFrom(data.inProgress);
  if (!inProgress) return { ok: false, problem: 'unreadable' };
  return addToStats(store, inProgress.record, inProgress.date, {
    forfeit: true,
    time: inProgress.time,
  });
}

/**
 * Adds a match to the saved stats and writes them, without a match in
 * progress: the match it was is now recorded. A loss also brings the team a
 * prospect (#107), saved in the same write.
 */
function addToStats(
  store: KeyValueStore | null,
  record: MatchRecord,
  date: string,
  { forfeit, time }: { forfeit: boolean; time: string | undefined },
): RecordResult {
  const loaded = loadTeam(store);
  if (!loaded.ok) return loaded;
  if (!store) return { ok: false, problem: 'unavailable' };
  const before = loadStats(store);
  if (!before.ok) return before;
  if (!isDay(date) || !isTimeOrNone(time) || !playedBy(record, loaded.team))
    return { ok: false, problem: 'invalid' };

  const stats = addMatch(before.stats, record, date, {
    forfeit,
    ...(time === undefined ? {} : { time }),
  });
  const saved: SavedRecord = { version: SAVE_VERSION, team: savedTeam(loaded.team), stats };
  const draft = loadDraft(store);
  if (draft) saved.draft = savedDraft(draft);
  // The match it was is now recorded, so the match in progress goes.
  keepTeamParts(savedData(store), saved, ['stats', 'inProgress']);
  // A loss brings a prospect (#107), in the same write as the stats. A roster
  // that can't be read is left as it was.
  const roster = loadRoster(store);
  if (roster.ok) {
    saved.roster = savedRoster(
      afterMatch(roster.roster, loaded.team, forfeit ? 'forfeited' : record.result),
    );
  }
  const written = write(store, saved);
  return written.ok ? { ok: true, stats } : written;
}

/**
 * Removes the match in progress, keeping the rest of the record as it is.
 * Smaller than what was there, so it can be written even when storage is
 * full. Nothing to do when the record can't be read.
 */
function clearMatchInProgress(store: KeyValueStore): void {
  const before = savedData(store);
  if (before?.inProgress === undefined) return;
  const rest = { ...before };
  delete rest.inProgress;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Storage is blocked: the next load records a forfeit, the best it can do.
  }
}

/**
 * Whether the match's home team is this team: the same name and the same
 * spoofs, by id. Ids alone aren't enough: every drafted team's spoofs are
 * numbered from the same pool (`p1`–`p10`), so a new team could match an old
 * one's match from another browser tab (#96 review).
 */
function playedBy(record: MatchRecord, team: Team): boolean {
  const ids = record.spoofs.filter((s) => s.team === 'home').map((s) => s.id);
  const teamIds = team.spoofs.map((s) => s.id);
  return (
    record.teams.home === team.name &&
    ids.length === teamIds.length &&
    teamIds.every((id) => ids.includes(id))
  );
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
  if (Number(data.version) >= 3 && data.team === undefined) return { ok: false, problem: 'none' };

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
  // Before version 4 (#74) a draft had no marks: every candidate wears its type's.
  const marks: Record<string, MarkName> = {};
  if (data.marks !== undefined) {
    if (!isObject(data.marks)) return null;
    for (const [id, mark] of Object.entries(data.marks)) {
      if (!isMarkName(mark)) return null;
      marks[id] = mark;
    }
  }
  return { name, color: color as TeamColorName, logo, seed, picks, renames, marks };
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
  // Before version 4 (#74) a spoof had no saved mark: it wears its type's.
  const { mark } = data;
  if (mark !== undefined && !isMarkName(mark)) return null;
  return createSpoof(id, name, type as SpoofType, values as Skills, temperament, mark);
}

/** Stats from saved data, or null when any part has the wrong shape or an impossible value. */
function statsFrom(data: unknown): TeamStats | null {
  if (!isObject(data) || !isObject(data.opponents) || !isObject(data.spoofs)) return null;
  const { joined, points, best } = data;
  const results = resultsFrom(data.results);
  if (!results || !isCount(points) || !(joined === null || isDay(joined))) return null;
  if (!(best === null || isCount(best))) return null;
  if (!Array.isArray(data.log) || data.log.length > LOG_LENGTH) return null;

  const opponents: Record<string, Results> = {};
  for (const [name, value] of Object.entries(data.opponents)) {
    const against = resultsFrom(value);
    if (!against) return null;
    opponents[name] = against;
  }
  const spoofs: Record<string, SpoofTotals> = {};
  for (const [id, value] of Object.entries(data.spoofs)) {
    const totals = spoofTotalsFrom(value);
    if (!totals) return null;
    spoofs[id] = totals;
  }
  const log: LoggedMatch[] = [];
  for (const value of data.log as unknown[]) {
    const logged = loggedMatchFrom(value);
    if (!logged) return null;
    log.push(logged);
  }
  return { joined, results, points, best, opponents, spoofs, log };
}

/** A roster from saved data of the right shape, or null. `rosterProblems` checks its values. */
function rosterFrom(data: unknown): Roster | null {
  if (!isObject(data) || !Array.isArray(data.prospects)) return null;
  const { seed, prospectsDrawn } = data;
  if (typeof seed !== 'number' || typeof prospectsDrawn !== 'number') return null;
  const prospects: Spoof[] = [];
  for (const item of data.prospects as unknown[]) {
    // Prospects are new in version 6, so each has its name and mark.
    if (!isObject(item) || item.mark === undefined) return null;
    const prospect = spoofFrom(item, undefined);
    if (!prospect) return null;
    prospects.push(prospect);
  }
  return { seed, prospectsDrawn, prospects };
}

/** A match in progress from saved data, or null when any part has the wrong shape. */
function matchInProgressFrom(data: unknown): MatchInProgress | null {
  if (!isObject(data) || !isDay(data.date) || !isTimeOrNone(data.time)) return null;
  const record = matchRecordFrom(data.record);
  if (!record) return null;
  return { date: data.date, ...(data.time === undefined ? {} : { time: data.time }), record };
}

const SIDES = ['home', 'visitor'] as const;
const OUTCOMES: readonly unknown[] = ['won', 'lost', 'tied'];

/** A match record from saved data, or null: every field `addMatch` reads is checked. */
function matchRecordFrom(data: unknown): MatchRecord | null {
  if (!isObject(data) || !isObject(data.teams) || !isObject(data.logos)) return null;
  if (!isObject(data.scoreByScrum) || !isObject(data.score) || !Array.isArray(data.spoofs))
    return null;
  const { seed, host, result, teams, logos, scoreByScrum, score } = data;
  if (typeof seed !== 'number' || !(SIDES as readonly unknown[]).includes(host)) return null;
  if (!OUTCOMES.includes(result)) return null;
  const home = countsFrom(scoreByScrum.home);
  const visitor = countsFrom(scoreByScrum.visitor);
  if (!home || !visitor || !isCount(score.home) || !isCount(score.visitor)) return null;
  if (typeof teams.home !== 'string' || typeof teams.visitor !== 'string') return null;
  if (typeof logos.home !== 'string' || typeof logos.visitor !== 'string') return null;

  const spoofs: MatchRecord['spoofs'][number][] = [];
  for (const value of data.spoofs as unknown[]) {
    if (!isObject(value) || !(SIDES as readonly unknown[]).includes(value.team)) return null;
    const { id, name, mark, scrumsPlayed, points } = value;
    if (typeof id !== 'string' || typeof name !== 'string') return null;
    // A match in progress saved before version 6 (#106) has no marks.
    if (mark !== undefined && !isMarkName(mark)) return null;
    if (!isCount(scrumsPlayed) || !isCount(points) || !Array.isArray(value.pointsByScrum))
      return null;
    const pointsByScrum: (number | null)[] = [];
    for (const p of value.pointsByScrum as unknown[]) {
      if (p !== null && !isCount(p)) return null;
      pointsByScrum.push(p);
    }
    const stats = behaviorFrom(value.stats);
    if (!stats) return null;
    spoofs.push({
      team: value.team as (typeof SIDES)[number],
      id,
      name,
      ...(mark === undefined ? {} : { mark }),
      scrumsPlayed,
      points,
      pointsByScrum,
      stats,
    });
  }
  return {
    seed,
    host: host as (typeof SIDES)[number],
    teams: { home: teams.home, visitor: teams.visitor },
    logos: { home: logos.home, visitor: logos.visitor },
    scoreByScrum: { home, visitor },
    score: { home: score.home, visitor: score.visitor },
    result: result as MatchRecord['result'],
    spoofs,
  };
}

const RESULTS: readonly Result[] = ['won', 'lost', 'tied', 'forfeited'];

function resultsFrom(data: unknown): Results | null {
  if (!isObject(data)) return null;
  const { won, lost, tied, forfeited } = data;
  return isCount(won) && isCount(lost) && isCount(tied) && isCount(forfeited)
    ? { won, lost, tied, forfeited }
    : null;
}

function spoofTotalsFrom(data: unknown): SpoofTotals | null {
  if (!isObject(data) || !isObject(data.behavior)) return null;
  const { matches, scrums, points, plusMinus } = data;
  if (!isCount(matches) || !isCount(scrums) || !isCount(points)) return null;
  if (typeof plusMinus !== 'number' || !Number.isFinite(plusMinus)) return null;
  const behavior = behaviorFrom(data.behavior);
  if (!behavior) return null;
  // Since version 6 (#106): the name and mark it had in its latest match.
  const { name, mark } = data;
  if (name !== undefined && typeof name !== 'string') return null;
  if (mark !== undefined && !isMarkName(mark)) return null;
  return {
    matches,
    scrums,
    points,
    plusMinus,
    behavior,
    ...(name === undefined ? {} : { name }),
    ...(mark === undefined ? {} : { mark }),
  };
}

/** Behavior stats from saved data, or null unless every one is a count. */
function behaviorFrom(data: unknown): BehaviorStats | null {
  if (!isObject(data)) return null;
  const behavior = emptyStats();
  for (const key of Object.keys(behavior) as (keyof BehaviorStats)[]) {
    const value = data[key];
    if (!isCount(value)) return null;
    behavior[key] = value;
  }
  return behavior;
}

function loggedMatchFrom(data: unknown): LoggedMatch | null {
  if (!isObject(data) || !isObject(data.opponent) || !isObject(data.score)) return null;
  if (!isObject(data.scoreByScrum) || !Array.isArray(data.spoofs)) return null;
  const { date, time, result } = data;
  const { name, logo } = data.opponent;
  const { yours, theirs } = data.score;
  if (!isDay(date) || !isTimeOrNone(time)) return null;
  if (typeof name !== 'string' || typeof logo !== 'string') return null;
  if (!(RESULTS as readonly unknown[]).includes(result)) return null;
  if (!isCount(yours) || !isCount(theirs)) return null;
  const byYours = countsFrom(data.scoreByScrum.yours);
  const byTheirs = countsFrom(data.scoreByScrum.theirs);
  if (!byYours || !byTheirs) return null;
  const spoofs: LoggedMatch['spoofs'][number][] = [];
  for (const value of data.spoofs as unknown[]) {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string')
      return null;
    if (!Array.isArray(value.pointsByScrum)) return null;
    const pointsByScrum: (number | null)[] = [];
    for (const p of value.pointsByScrum as unknown[]) {
      if (p !== null && !isCount(p)) return null;
      pointsByScrum.push(p);
    }
    spoofs.push({ id: value.id, name: value.name, pointsByScrum });
  }
  return {
    date,
    ...(time === undefined ? {} : { time }),
    opponent: { name, logo },
    result: result as Result,
    score: { yours, theirs },
    scoreByScrum: { yours: byYours, theirs: byTheirs },
    spoofs,
  };
}

function countsFrom(data: unknown): number[] | null {
  if (!Array.isArray(data)) return null;
  const counts: number[] = [];
  for (const value of data as unknown[]) {
    if (!isCount(value)) return null;
    counts.push(value);
  }
  return counts;
}

/** A finite number, not below 0: a count, a score or a total of points. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A day as `YYYY-MM-DD`. */
function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** A local time as `HH:MM`, 24-hour (#95), or none: matches saved before it have no time. */
function isTimeOrNone(value: unknown): value is string | undefined {
  return (
    value === undefined || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
  );
}

function isMarkName(value: unknown): value is MarkName {
  return typeof value === 'string' && (markNames as readonly string[]).includes(value);
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
