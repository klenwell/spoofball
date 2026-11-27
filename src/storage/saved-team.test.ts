import { describe, expect, it } from 'vitest';
import { blockedStorage, fullStorage, memoryStorage } from '../test-support/storage';
import { EMBERS, SPOOFS } from '../game/preset-teams';
import { matchRecord, playScrum, startMatch } from '../game/match';
import { skillNames } from '../game/skills';
import { LOG_LENGTH, addMatch, emptyTeamStats } from '../game/stats';
import { computerMatch, computerMise } from '../test-support/match';
import { spoofLine } from '../test-support/match-record';
import { teamProblems, type Spoof, type Team } from '../game/teams';
import {
  SAVE_VERSION,
  STORAGE_KEY,
  STORAGE_PROBLEM_TEXT,
  browserStorage,
  loadDraft,
  loadRoster,
  loadStats,
  loadTeam,
  recordForfeit,
  recordMatch,
  saveDraft,
  saveMatchInProgress,
  saveRoster,
  saveTeam,
} from './saved-team';
import type { Roster } from '../game/roster';
import { createRandom } from '../game/random';
import { generateSpoof, NEW_SPOOF_SKILL_TOTAL } from '../game/teams';
import {
  chooseMark,
  draftPool,
  renameCandidate,
  startDraft,
  togglePick,
  type Draft,
} from '../game/draft';
import { defaultMark } from '../game/spoof-types';
import { TEST_SEED } from '../test-support/random';

/** A saved record's JSON, from a team as `saveTeam` would write it. */
function savedJson(team: Team = SPOOFS): string {
  const store = memoryStorage();
  saveTeam(store, team);
  const text = store.items.get(STORAGE_KEY);
  if (text === undefined) throw new Error('not saved');
  return text;
}

/** A saved record, loosely typed so tests can break it. */
interface LooseRecord {
  version?: number;
  team: {
    name: string;
    color: string;
    logo: string;
    spoofs: {
      name?: unknown;
      type: string;
      skills: Partial<Record<string, number>>;
      temperament?: unknown;
      mark?: unknown;
    }[];
  };
}

/** The record's first spoof. */
function firstSpoof(record: LooseRecord) {
  const spoof = record.team.spoofs[0];
  if (!spoof) throw new Error('no spoof');
  return spoof;
}

/** Saved JSON, changed by `edit` before it's stored. */
function storeWith(edit: (record: LooseRecord) => void) {
  const record = JSON.parse(savedJson()) as LooseRecord;
  edit(record);
  return memoryStorage({ [STORAGE_KEY]: JSON.stringify(record) });
}

describe('saveTeam and loadTeam', () => {
  it('load a saved team back unchanged: name, color, logo and spoofs with their hidden traits', () => {
    const store = memoryStorage();

    expect(saveTeam(store, SPOOFS)).toEqual({ ok: true });
    expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
  });

  it(`write one versioned record under "${STORAGE_KEY}"`, () => {
    const store = memoryStorage();

    saveTeam(store, SPOOFS);

    expect([...store.items.keys()]).toEqual([STORAGE_KEY]);
    expect(SAVE_VERSION).toBe(6);
    expect(JSON.parse(store.items.get(STORAGE_KEY) ?? '')).toMatchObject({
      version: 6,
      team: { name: 'Spoofs', color: 'blue', logo: '👻' },
    });
  });

  it("save each spoof's name (#28)", () => {
    const record = JSON.parse(savedJson()) as LooseRecord;

    expect(record.team.spoofs.map((s) => s.name)).toEqual(SPOOFS.spoofs.map((s) => s.name));
  });

  it("save each spoof's mark, and load a chosen one back (#74)", () => {
    const team: Team = {
      ...SPOOFS,
      spoofs: SPOOFS.spoofs.map((s, i) => (i === 0 ? { ...s, mark: 'glove' } : s)),
    };
    const store = memoryStorage();
    saveTeam(store, team);
    const record = JSON.parse(store.items.get(STORAGE_KEY) ?? '') as LooseRecord;

    expect(record.team.spoofs.map((s) => s.mark)).toEqual(team.spoofs.map((s) => s.mark));
    expect(loadTeam(store)).toEqual({ ok: true, team });
  });

  it("load a team saved before marks (version 3) with its types' marks, now the new defaults", () => {
    const store = storeWith((record) => {
      record.version = 3;
      for (const spoof of record.team.spoofs) delete spoof.mark;
    });

    const result = loadTeam(store);

    expect(result.ok && result.team.spoofs.map((s) => s.mark)).toEqual(
      SPOOFS.spoofs.map((s) => defaultMark(s.type)),
    );
  });

  it("save a spoof's radius as its size: the radius is worked out again on load", () => {
    const record = JSON.parse(savedJson()) as { team: { spoofs: object[] } };

    for (const spoof of record.team.spoofs) expect(spoof).not.toHaveProperty('radius');
  });

  it('replace the saved team with a new one', () => {
    const store = memoryStorage();
    saveTeam(store, SPOOFS);

    saveTeam(store, { ...SPOOFS, name: 'Owls' });

    expect(loadTeam(store)).toMatchObject({ ok: true, team: { name: 'Owls' } });
  });
});

describe('loadTeam', () => {
  it('finds no team in empty storage', () => {
    expect(loadTeam(memoryStorage())).toEqual({ ok: false, problem: 'none' });
  });

  it('reports storage that is missing or blocked, without throwing', () => {
    expect(loadTeam(null)).toEqual({ ok: false, problem: 'unavailable' });
    expect(loadTeam(blockedStorage())).toEqual({ ok: false, problem: 'unavailable' });
  });

  describe('when the saved data can’t be read', () => {
    // Each case builds its own store, so no test sees another's changes.
    const cases: [string, () => ReturnType<typeof memoryStorage>][] = [
      ['not JSON', () => memoryStorage({ [STORAGE_KEY]: '{not json' })],
      ['not an object', () => memoryStorage({ [STORAGE_KEY]: '[1, 2]' })],
      ['no version', () => storeWith((r) => delete r.version)],
      ['an older version than any written', () => storeWith((r) => (r.version = 0))],
      [
        'no team, in a version 2 record',
        () =>
          storeWith((r) => {
            r.version = 2;
            delete (r as Partial<LooseRecord>).team;
          }),
      ],
      ['a spoof missing a skill', () => storeWith((r) => delete firstSpoof(r).skills.iq)],
      ['a skill out of range', () => storeWith((r) => (firstSpoof(r).skills.burst = 150))],
      ['a name too long', () => storeWith((r) => (r.team.name = 'A'.repeat(17)))],
      ['an unknown color', () => storeWith((r) => (r.team.color = 'beige'))],
      ['an unknown logo', () => storeWith((r) => (r.team.logo = 'X'))],
      ['4 spoofs', () => storeWith((r) => r.team.spoofs.pop())],
      ['an unknown type', () => storeWith((r) => (firstSpoof(r).type = 'jester'))],
      ['an unknown mark', () => storeWith((r) => (firstSpoof(r).mark = 'skull'))],
      ['a name that is not text', () => storeWith((r) => ((r.team as { name: unknown }).name = 5))],
      ['a logo that is not text', () => storeWith((r) => ((r.team as { logo: unknown }).logo = 1))],
      [
        'spoofs that are not a list',
        () => storeWith((r) => ((r.team as { spoofs: unknown }).spoofs = {})),
      ],
      ['a spoof that is null', () => storeWith((r) => ((r.team.spoofs as unknown[])[0] = null))],
      [
        'skills that are null',
        () => storeWith((r) => ((firstSpoof(r) as { skills: unknown }).skills = null)),
      ],
      [
        'a temperament that is not a number',
        () => storeWith((r) => (firstSpoof(r).temperament = 'hot')),
      ],
      ['a temperament out of range', () => storeWith((r) => (firstSpoof(r).temperament = 50))],
      ['a spoof with no name', () => storeWith((r) => delete firstSpoof(r).name)],
      ['a spoof name that is not text', () => storeWith((r) => (firstSpoof(r).name = 7))],
      ['a spoof name too long', () => storeWith((r) => (firstSpoof(r).name = 'B'.repeat(17)))],
      [
        'two spoofs with one name',
        () => storeWith((r) => (firstSpoof(r).name = r.team.spoofs[1]?.name)),
      ],
    ];

    it.each(cases)('reports it as unreadable: %s', (_what, makeStore) => {
      expect(loadTeam(makeStore())).toEqual({ ok: false, problem: 'unreadable' });
    });

    it.each(cases)('leaves it in place: %s', (_what, makeStore) => {
      const store = makeStore();
      const before = store.items.get(STORAGE_KEY);

      loadTeam(store);

      expect(store.items.get(STORAGE_KEY)).toBe(before);
    });
  });

  describe('a team saved by version 1, before spoofs had names', () => {
    /** The Spoofs as version 1 saved them: no names. */
    const versionOne = () =>
      storeWith((r) => {
        r.version = 1;
        for (const spoof of r.team.spoofs) delete spoof.name;
      });

    it('loads, with a name for every spoof, and says it was upgraded', () => {
      const result = loadTeam(versionOne());

      expect(result).toMatchObject({ ok: true, upgraded: true });
      const team = result.ok ? result.team : null;
      expect(team && teamProblems(team)).toEqual([]);
      const traits = (spoofs: readonly Spoof[]) => spoofs.map((spoof) => ({ ...spoof, name: '' }));
      expect(team && traits(team.spoofs)).toEqual(traits(SPOOFS.spoofs));
    });

    it('gets the same names on every load, without being written back', () => {
      const store = versionOne();
      const before = store.items.get(STORAGE_KEY);
      const names = () => {
        const result = loadTeam(store);
        return result.ok ? result.team.spoofs.map((s) => s.name) : [];
      };

      expect(names()).toEqual(names());
      expect(store.items.get(STORAGE_KEY)).toBe(before);
    });

    it('names each spoof unlike the others, with no word used twice', () => {
      for (let n = 0; n < 40; n += 1) {
        const store = storeWith((r) => {
          r.version = 1;
          r.team.name = `Owls ${String(n)}`;
          for (const spoof of r.team.spoofs) delete spoof.name;
        });
        const result = loadTeam(store);
        const words = result.ok ? result.team.spoofs.flatMap((s) => s.name.split(' ')) : [];
        expect(new Set(words).size).toBe(10);
      }
    });

    it('gets different names from a different team', () => {
      const other = storeWith((r) => {
        r.version = 1;
        r.team.name = 'Owls';
        for (const spoof of r.team.spoofs) delete spoof.name;
      });
      const names = (store: ReturnType<typeof memoryStorage>) => {
        const result = loadTeam(store);
        return result.ok ? result.team.spoofs.map((s) => s.name) : [];
      };

      expect(names(other)).not.toEqual(names(versionOne()));
    });

    it('keeps its names once saved again in the current version', () => {
      const store = versionOne();
      const first = loadTeam(store);
      if (!first.ok) throw new Error('not loaded');

      saveTeam(store, first.team);

      expect(loadTeam(store)).toEqual({ ok: true, team: first.team });
    });
  });

  it('loads a current record without calling it upgraded', () => {
    expect(loadTeam(memoryStorage({ [STORAGE_KEY]: savedJson() }))).not.toHaveProperty('upgraded');
  });

  it('leaves a record from a newer version alone, and says so', () => {
    const store = storeWith((r) => (r.version = SAVE_VERSION + 1));
    const before = store.items.get(STORAGE_KEY);

    expect(loadTeam(store)).toEqual({ ok: false, problem: 'newer' });
    expect(store.items.get(STORAGE_KEY)).toBe(before);
  });
});

describe('saveTeam', () => {
  it("refuses a team that isn't valid, and leaves storage alone", () => {
    const store = memoryStorage({ [STORAGE_KEY]: savedJson() });
    const before = store.items.get(STORAGE_KEY);

    const result = saveTeam(store, { ...SPOOFS, name: '' });

    expect(result).toMatchObject({ ok: false, problem: 'invalid' });
    expect(result.ok ? [] : result.details).toContain('The name must be 1–16 characters');
    expect(store.items.get(STORAGE_KEY)).toBe(before);
  });

  it('reports storage that is missing or blocked, without throwing', () => {
    expect(saveTeam(null, SPOOFS)).toEqual({ ok: false, problem: 'unavailable' });
    expect(saveTeam(blockedStorage(), SPOOFS)).toEqual({ ok: false, problem: 'unavailable' });
  });

  it('reports full storage', () => {
    expect(saveTeam(fullStorage(), SPOOFS)).toEqual({ ok: false, problem: 'full' });
  });

  it('replaces data that couldn’t be read', () => {
    const store = memoryStorage({ [STORAGE_KEY]: '{not json' });

    saveTeam(store, SPOOFS);

    expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
  });
});

describe('a draft in progress (#72)', () => {
  /** A draft with 2 picks and a rename, on the test seed's pool. */
  function someDraft(): Draft {
    let draft = startDraft({ name: 'Night Owls', color: 'teal', logo: '🦉' }, TEST_SEED);
    const cheapest = [...draftPool(draft)].sort((a, b) => a.price - b.price);
    for (const c of cheapest.slice(0, 2)) draft = togglePick(draft, draftPool(draft), c.spoof.id);
    draft = renameCandidate(draft, draftPool(draft), draft.picks[0] ?? '', 'Hoot');
    return chooseMark(draft, draftPool(draft), draft.picks[1] ?? '', 'star');
  }

  it('saves and loads back unchanged', () => {
    const store = memoryStorage();

    expect(saveDraft(store, someDraft())).toEqual({ ok: true });
    expect(loadDraft(store)).toEqual(someDraft());
  });

  it("has none to load when there's none saved, or storage is missing or blocked", () => {
    expect(loadDraft(memoryStorage())).toBeNull();
    expect(loadDraft(null)).toBeNull();
    expect(loadDraft(blockedStorage())).toBeNull();
    expect(loadDraft(memoryStorage({ [STORAGE_KEY]: savedJson() }))).toBeNull();
  });

  it('keeps the saved team beside it, so starting a draft replaces nothing yet', () => {
    const store = memoryStorage({ [STORAGE_KEY]: savedJson() });

    saveDraft(store, someDraft());

    expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
    expect(loadDraft(store)).toEqual(someDraft());
  });

  it('is kept when the team is saved again, and ended when the team is the draft’s result', () => {
    const store = memoryStorage();
    saveDraft(store, someDraft());

    saveTeam(store, SPOOFS);
    expect(loadDraft(store)).toEqual(someDraft());

    saveTeam(store, SPOOFS, { endDraft: true });
    expect(loadDraft(store)).toBeNull();
    expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
  });

  it('leaves no team to load while a first-time player is mid-draft', () => {
    const store = memoryStorage();
    saveDraft(store, someDraft());

    expect(loadTeam(store)).toEqual({ ok: false, problem: 'none' });
  });

  it('keeps a version 1 team, upgraded, when a draft is saved beside it', () => {
    const store = storeWith((r) => {
      r.version = 1;
      for (const spoof of r.team.spoofs) delete spoof.name;
    });
    const upgraded = loadTeam(store);

    saveDraft(store, someDraft());

    expect(upgraded.ok && loadTeam(store)).toEqual({
      ok: true,
      team: upgraded.ok ? upgraded.team : null,
    });
  });

  it("refuses a draft that breaks the rules, and reports storage that won't save", () => {
    const store = memoryStorage();
    expect(saveDraft(store, { ...someDraft(), picks: ['p99'] })).toMatchObject({
      ok: false,
      problem: 'invalid',
    });
    expect(store.items.size).toBe(0);
    expect(saveDraft(null, someDraft())).toEqual({ ok: false, problem: 'unavailable' });
    expect(saveDraft(fullStorage(), someDraft())).toEqual({ ok: false, problem: 'full' });
  });

  it.each<[string, (draft: Record<string, unknown>) => void]>([
    ['picks that are not a list', (d) => (d.picks = 'p1')],
    ['a pick that is not text', (d) => (d.picks = [1])],
    ['renames that are not an object', (d) => (d.renames = [])],
    ['a rename that is not text', (d) => (d.renames = { p1: 5 })],
    ['a seed that is not a number', (d) => (d.seed = '7')],
    ['an unknown color', (d) => (d.color = 'beige')],
    ['an unknown logo', (d) => (d.logo = 'X')],
    ['a pick not in the pool', (d) => (d.picks = ['p99'])],
    ['marks that are not an object', (d) => (d.marks = ['star'])],
    ['an unknown mark', (d) => (d.marks = { p1: 'skull' })],
  ])('ignores a saved draft with %s, and leaves it in place', (_what, edit) => {
    const store = memoryStorage();
    saveDraft(store, someDraft());
    const record = JSON.parse(store.items.get(STORAGE_KEY) ?? '') as {
      draft: Record<string, unknown>;
    };
    edit(record.draft);
    const text = JSON.stringify(record);
    store.items.set(STORAGE_KEY, text);

    expect(loadDraft(store)).toBeNull();
    expect(store.items.get(STORAGE_KEY)).toBe(text);
  });
});

describe('STORAGE_PROBLEM_TEXT', () => {
  it('says something for every problem', () => {
    for (const problem of [
      'none',
      'unavailable',
      'unreadable',
      'newer',
      'full',
      'invalid',
    ] as const) {
      expect(STORAGE_PROBLEM_TEXT[problem].length).toBeGreaterThan(10);
    }
  });

  it('tells a player with an unreadable save what to do', () => {
    expect(STORAGE_PROBLEM_TEXT.unreadable).toBe(
      "Your saved team couldn't be read, so you'll need to create a new one.",
    );
  });
});

describe('browserStorage', () => {
  it('is null where there is no localStorage, as in Node', () => {
    expect(browserStorage()).toBeNull();
  });
});

describe("your team's stats (#89)", () => {
  const DAY = '2026-11-25';
  /** A finished match your team (the Spoofs, saved) played against the Embers. */
  const PLAYED = matchRecord(computerMatch(SPOOFS, EMBERS, TEST_SEED));

  /** Storage holding the Spoofs, created on `DAY` with a fresh record. */
  function newTeamStore() {
    const store = memoryStorage();
    saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
    return store;
  }

  /** The saved record's raw data, to check or break. */
  function rawRecord(store: ReturnType<typeof memoryStorage>): Record<string, unknown> {
    return JSON.parse(store.items.get(STORAGE_KEY) ?? '') as Record<string, unknown>;
  }

  describe('loadStats', () => {
    it('gives a new team a fresh record, with the day it joined', () => {
      expect(loadStats(newTeamStore())).toEqual({ ok: true, stats: emptyTeamStats(DAY) });
    });

    it('gives a team saved before stats (version 4) an empty record and no join date', () => {
      const store = storeWith((record) => {
        record.version = 4;
      });

      expect(loadStats(store)).toEqual({ ok: true, stats: emptyTeamStats(null) });
    });

    it('has no stats without a team, and says why', () => {
      expect(loadStats(memoryStorage())).toEqual({ ok: false, problem: 'none' });
      expect(loadStats(blockedStorage())).toEqual({ ok: false, problem: 'unavailable' });
    });

    describe('when the saved stats can’t be read', () => {
      /** Storage holding the Spoofs with one recorded match, its stats changed by `edit`. */
      function storeWithStats(edit: (stats: Record<string, unknown>) => void) {
        const store = newTeamStore();
        recordMatch(store, PLAYED, DAY);
        const record = rawRecord(store);
        const stats = record.stats as Record<string, unknown>;
        edit(stats);
        store.items.set(STORAGE_KEY, JSON.stringify(record));
        return store;
      }
      const firstLogged = (stats: Record<string, unknown>) =>
        (stats.log as Record<string, unknown>[])[0] ?? {};

      it.each<[string, (stats: Record<string, unknown>) => void]>([
        ['negative points', (s) => (s.points = -1)],
        ['a join date that isn’t a day', (s) => (s.joined = 'Nov 25')],
        ['a best score that isn’t a number', (s) => (s.best = '12')],
        [
          'a result count that’s missing',
          (s) => delete (s.results as Record<string, unknown>).tied,
        ],
        [
          `a log longer than ${String(LOG_LENGTH)}`,
          (s) => (s.log = Array.from({ length: LOG_LENGTH + 1 }, () => firstLogged(s))),
        ],
        ['a logged result it doesn’t know', (s) => (firstLogged(s).result = 'won?')],
        ['a logged day that isn’t a day', (s) => (firstLogged(s).date = 'today')],
        [
          'logged points below 0',
          (s) =>
            ((firstLogged(s).spoofs as Record<string, unknown>[])[0] = {
              id: 'a',
              name: 'A',
              pointsByScrum: [-1],
            }),
        ],
        [
          'a spoof’s behavior stat that’s missing',
          (s) =>
            delete (Object.values(s.spoofs as object)[0] as { behavior: Record<string, unknown> })
              .behavior.dings,
        ],
        ['an opponent’s record that isn’t one', (s) => (s.opponents = { Embers: 3 })],
      ])('reports %s as unreadable', (_what, edit) => {
        expect(loadStats(storeWithStats(edit))).toEqual({ ok: false, problem: 'unreadable' });
      });

      it('reads the same stats unchanged', () => {
        expect(loadStats(storeWithStats(() => undefined)).ok).toBe(true);
      });
    });
  });

  describe('recordMatch', () => {
    it('saves the local time it was played with the match, and loads it back (#95)', () => {
      const store = newTeamStore();

      recordMatch(store, PLAYED, DAY, { time: '09:05' });

      const loaded = loadStats(store);
      expect(loaded.ok && loaded.stats.log[0]?.time).toBe('09:05');
    });

    it('refuses a time that isn’t HH:MM, saving nothing', () => {
      for (const time of ['9:05', '24:00', '12:60', '2:41 pm', '']) {
        const store = newTeamStore();

        expect(recordMatch(store, PLAYED, DAY, { time })).toEqual({
          ok: false,
          problem: 'invalid',
        });
        const loaded = loadStats(store);
        expect(loaded.ok && loaded.stats.log).toEqual([]);
      }
    });

    it('still reads a logged match saved before times, with no time', () => {
      const store = newTeamStore();
      recordMatch(store, PLAYED, DAY);

      const loaded = loadStats(store);
      expect(loaded.ok && loaded.stats.log[0]).not.toHaveProperty('time');
    });

    it('can’t read a logged match whose time has the wrong shape', () => {
      const store = newTeamStore();
      recordMatch(store, PLAYED, DAY, { time: '09:05' });
      const raw = JSON.parse(store.items.get(STORAGE_KEY) ?? '') as {
        stats: { log: { time: unknown }[] };
      };
      const first = raw.stats.log[0];
      if (first) first.time = 905;
      store.items.set(STORAGE_KEY, JSON.stringify(raw));

      expect(loadStats(store)).toEqual({ ok: false, problem: 'unreadable' });
    });

    it('adds the match to the saved stats, which load back the same', () => {
      const store = newTeamStore();

      const result = recordMatch(store, PLAYED, DAY);

      const expected = addMatch(emptyTeamStats(DAY), PLAYED, DAY);
      expect(result).toEqual({ ok: true, stats: expected });
      expect(loadStats(store)).toEqual({ ok: true, stats: expected });
    });

    it('keeps adding: the totals and log grow with each match', () => {
      const store = newTeamStore();

      recordMatch(store, PLAYED, DAY);
      recordMatch(store, PLAYED, '2026-11-26');

      const stats = loadStats(store);
      expect(stats.ok && stats.stats.log.map((m) => m.date)).toEqual(['2026-11-26', DAY]);
    });

    it('keeps the team and a draft in progress beside the stats', () => {
      const store = newTeamStore();
      const draft = startDraft({ name: 'Night Owls', color: 'teal', logo: '🦉' }, TEST_SEED);
      saveDraft(store, draft);

      recordMatch(store, PLAYED, DAY);

      expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
      expect(loadDraft(store)).toEqual(draft);
    });

    it('records a match for a team saved before stats, which then has no join date', () => {
      const store = storeWith((record) => {
        record.version = 4;
      });

      recordMatch(store, PLAYED, DAY);

      const stats = loadStats(store);
      expect(stats.ok && [stats.stats.joined, stats.stats.log.length]).toEqual([null, 1]);
    });

    it('refuses a match another team played, such as the quick start’s', () => {
      const store = memoryStorage();
      const other = { ...SPOOFS, name: 'Owls', spoofs: EMBERS.spoofs };
      saveTeam(store, other, { endDraft: true, joined: DAY });

      expect(recordMatch(store, PLAYED, DAY)).toEqual({ ok: false, problem: 'invalid' });
      expect(loadStats(store)).toEqual({ ok: true, stats: emptyTeamStats(DAY) });
    });

    it('refuses a match whose home team has the same spoofs but another name', () => {
      const store = memoryStorage();
      saveTeam(store, { ...SPOOFS, name: 'Owls' }, { endDraft: true, joined: DAY });

      expect(recordMatch(store, PLAYED, DAY)).toEqual({ ok: false, problem: 'invalid' });
    });

    it('refuses a match whose home team had a spoof more than the saved team', () => {
      const extra = spoofLine('extra', [1, null, null]);
      const record = { ...PLAYED, spoofs: [...PLAYED.spoofs, extra] };

      expect(recordMatch(newTeamStore(), record, DAY)).toEqual({
        ok: false,
        problem: 'invalid',
      });
    });

    it('refuses a date that isn’t a day', () => {
      expect(recordMatch(newTeamStore(), PLAYED, 'today')).toEqual({
        ok: false,
        problem: 'invalid',
      });
    });

    it('leaves stats it can’t read in place, and doesn’t add to them', () => {
      const store = newTeamStore();
      const record = rawRecord(store);
      record.stats = { broken: true };
      store.items.set(STORAGE_KEY, JSON.stringify(record));
      const before = store.items.get(STORAGE_KEY);

      expect(recordMatch(store, PLAYED, DAY)).toEqual({ ok: false, problem: 'unreadable' });
      expect(store.items.get(STORAGE_KEY)).toBe(before);
    });

    it('reports storage that is missing, blocked or full, without throwing', () => {
      const full = fullStorage({ [STORAGE_KEY]: newTeamStore().items.get(STORAGE_KEY) ?? '' });

      expect(recordMatch(null, PLAYED, DAY)).toEqual({ ok: false, problem: 'unavailable' });
      expect(recordMatch(blockedStorage(), PLAYED, DAY)).toEqual({
        ok: false,
        problem: 'unavailable',
      });
      expect(recordMatch(full, PLAYED, DAY)).toEqual({ ok: false, problem: 'full' });
    });

    it('saves no skills', () => {
      const store = newTeamStore();

      recordMatch(store, PLAYED, DAY);

      const stats = JSON.stringify(rawRecord(store).stats);
      for (const skill of skillNames) expect(stats).not.toContain(`"${skill}"`);
    });
  });

  describe('saving the team again', () => {
    it('keeps its stats when it’s the same team', () => {
      const store = newTeamStore();
      recordMatch(store, PLAYED, DAY);
      const before = loadStats(store);

      saveTeam(store, SPOOFS);

      expect(loadStats(store)).toEqual(before);
    });

    it('starts a fresh record for a new team, created on its own day', () => {
      const store = newTeamStore();
      recordMatch(store, PLAYED, DAY);

      saveTeam(store, { ...SPOOFS, name: 'Owls' }, { endDraft: true, joined: '2026-12-01' });

      expect(loadStats(store)).toEqual({ ok: true, stats: emptyTeamStats('2026-12-01') });
    });

    it('keeps stats it can’t read as they were, when a draft is saved beside them', () => {
      const store = newTeamStore();
      const record = rawRecord(store);
      record.stats = { broken: true };
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      saveDraft(store, startDraft({ name: 'Night Owls', color: 'teal', logo: '🦉' }, TEST_SEED));
      saveTeam(store, SPOOFS);

      expect(rawRecord(store).stats).toEqual({ broken: true });
    });

    it('refuses a join date that isn’t a day', () => {
      expect(saveTeam(memoryStorage(), SPOOFS, { joined: 'Nov 25' })).toMatchObject({
        ok: false,
        problem: 'invalid',
      });
    });
  });
});

describe('a match in progress (#90)', () => {
  const DAY = '2026-11-25';
  const LATER = '2026-11-26';
  /** The Spoofs against the Embers after one scrum, and the same match finished. */
  const partway = (() => {
    let match = startMatch(SPOOFS, EMBERS, TEST_SEED);
    match = playScrum(match, computerMise(match));
    return match;
  })();
  const SO_FAR = matchRecord(partway, { soFar: true });
  const FINISHED = matchRecord(computerMatch(SPOOFS, EMBERS, TEST_SEED));

  /** Storage holding the Spoofs, created on `DAY`, with their match in progress saved. */
  function storeMidMatch() {
    const store = memoryStorage();
    saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
    saveMatchInProgress(store, SO_FAR, DAY);
    return store;
  }

  const rawRecord = (store: ReturnType<typeof memoryStorage>) =>
    JSON.parse(store.items.get(STORAGE_KEY) ?? '') as Record<string, unknown>;

  describe('recordForfeit', () => {
    it('records a match left unfinished as a forfeit, on the day it was played', () => {
      const store = storeMidMatch();

      const result = recordForfeit(store);

      const expected = addMatch(emptyTeamStats(DAY), SO_FAR, DAY, { forfeit: true });
      expect(result).toEqual({ ok: true, stats: expected });
      expect(loadStats(store)).toEqual({ ok: true, stats: expected });
      expect(expected.results.forfeited).toBe(1);
      expect(expected.log[0]?.result).toBe('forfeited');
    });

    it('logs the forfeit at the time its match in progress was last saved (#95)', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      saveMatchInProgress(store, SO_FAR, DAY, { time: '21:58' });

      const result = recordForfeit(store);

      expect(result?.ok && result.stats.log[0]).toMatchObject({ date: DAY, time: '21:58' });
    });

    it('leaves a match in progress with a malformed time in place, unread', () => {
      const store = storeMidMatch();
      const raw = rawRecord(store);
      (raw.inProgress as Record<string, unknown>).time = '25:00';
      store.items.set(STORAGE_KEY, JSON.stringify(raw));

      expect(recordForfeit(store)).toEqual({ ok: false, problem: 'unreadable' });
      expect(rawRecord(store)).toHaveProperty('inProgress');
    });

    it('records it once: the match in progress is cleared', () => {
      const store = storeMidMatch();
      recordForfeit(store);

      expect(recordForfeit(store)).toBeNull();
      expect(rawRecord(store)).not.toHaveProperty('inProgress');
    });

    it('records a match left before any scrum finished as a 0–0 forfeit, crediting no spoof', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      const start = matchRecord(startMatch(SPOOFS, EMBERS, TEST_SEED), { soFar: true });
      saveMatchInProgress(store, start, DAY);

      const result = recordForfeit(store);

      expect(result?.ok && result.stats.log[0]?.score).toEqual({ yours: 0, theirs: 0 });
      expect(result?.ok && result.stats.spoofs).toEqual({});
    });

    it('does nothing without a match in progress', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });

      expect(recordForfeit(store)).toBeNull();
      expect(recordForfeit(memoryStorage())).toBeNull();
      expect(recordForfeit(null)).toBeNull();
    });

    it('leaves a match in progress it can’t read in place, and records nothing', () => {
      const store = storeMidMatch();
      const record = rawRecord(store);
      record.inProgress = { date: DAY, record: { ...SO_FAR, score: { home: -1, visitor: 0 } } };
      store.items.set(STORAGE_KEY, JSON.stringify(record));
      const before = store.items.get(STORAGE_KEY);

      expect(recordForfeit(store)).toEqual({ ok: false, problem: 'unreadable' });
      expect(store.items.get(STORAGE_KEY)).toBe(before);
    });

    it.each<[string, (inProgress: Record<string, unknown>) => void]>([
      ['a day that isn’t a day', (p) => (p.date = 'today')],
      ['no record', (p) => delete p.record],
      ['an unknown result', (p) => ((p.record as Record<string, unknown>).result = 'won?')],
      ['a host that isn’t a side', (p) => ((p.record as Record<string, unknown>).host = 'away')],
      ['a seed that isn’t a number', (p) => ((p.record as Record<string, unknown>).seed = '7')],
      [
        'an opponent’s name that isn’t text',
        (p) => ((p.record as { teams: Record<string, unknown> }).teams.visitor = 7),
      ],
      [
        'a spoof on no side',
        (p) => {
          const spoofs = (p.record as { spoofs: Record<string, unknown>[] }).spoofs;
          if (spoofs[0]) spoofs[0].team = 'bench';
        },
      ],
      [
        'a spoof with no id',
        (p) => {
          const spoofs = (p.record as { spoofs: Record<string, unknown>[] }).spoofs;
          delete spoofs[0]?.id;
        },
      ],
      [
        'a spoof whose name isn’t text',
        (p) => {
          const spoofs = (p.record as { spoofs: Record<string, unknown>[] }).spoofs;
          if (spoofs[0]) spoofs[0].name = null;
        },
      ],
      [
        'a spoof’s points by scrum holding text',
        (p) => {
          const spoofs = (p.record as { spoofs: Record<string, unknown>[] }).spoofs;
          if (spoofs[0]) spoofs[0].pointsByScrum = ['3'];
        },
      ],
      [
        'a spoof with a missing behavior stat',
        (p) => {
          const spoofs = (p.record as { spoofs: { stats: Record<string, unknown> }[] }).spoofs;
          delete spoofs[0]?.stats.dings;
        },
      ],
      [
        'a spoof with points below 0',
        (p) => {
          const spoofs = (p.record as { spoofs: Record<string, unknown>[] }).spoofs;
          if (spoofs[0]) spoofs[0].points = -2;
        },
      ],
      [
        'a score by scrum that isn’t a list',
        (p) => ((p.record as Record<string, unknown>).scoreByScrum = { home: 1, visitor: [] }),
      ],
      [
        'a logo that isn’t text',
        (p) => ((p.record as Record<string, unknown>).logos = { home: 1 }),
      ],
    ])('reports a match in progress with %s as unreadable', (_what, edit) => {
      const store = storeMidMatch();
      const record = rawRecord(store);
      edit(record.inProgress as Record<string, unknown>);
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      expect(recordForfeit(store)).toEqual({ ok: false, problem: 'unreadable' });
    });
  });

  describe('saveMatchInProgress', () => {
    it('refuses a time that isn’t HH:MM, saving no match in progress (#104 review)', () => {
      for (const time of ['25:00', '9:05', '2:41 pm']) {
        const store = memoryStorage();
        saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });

        expect(saveMatchInProgress(store, SO_FAR, DAY, { time })).toEqual({
          ok: false,
          problem: 'invalid',
        });
        expect(rawRecord(store)).not.toHaveProperty('inProgress');
      }
    });

    it('refuses a match another team is playing', () => {
      const store = memoryStorage();
      saveTeam(store, { ...SPOOFS, name: 'Owls' }, { endDraft: true, joined: DAY });

      expect(saveMatchInProgress(store, SO_FAR, DAY)).toEqual({ ok: false, problem: 'invalid' });
      expect(recordForfeit(store)).toBeNull();
    });

    it('refuses without a saved team, or a day', () => {
      expect(saveMatchInProgress(memoryStorage(), SO_FAR, DAY)).toEqual({
        ok: false,
        problem: 'none',
      });
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      expect(saveMatchInProgress(store, SO_FAR, 'today')).toEqual({
        ok: false,
        problem: 'invalid',
      });
    });

    it('keeps the team, its stats and a draft beside it', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      recordMatch(store, FINISHED, DAY);
      const stats = loadStats(store);
      const draft = startDraft({ name: 'Night Owls', color: 'teal', logo: '🦉' }, TEST_SEED);
      saveDraft(store, draft);

      saveMatchInProgress(store, SO_FAR, DAY);

      expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
      expect(loadStats(store)).toEqual(stats);
      expect(loadDraft(store)).toEqual(draft);
    });

    it('replaces the last save of the same match, so a forfeit records the latest scrums', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      const start = matchRecord(startMatch(SPOOFS, EMBERS, TEST_SEED), { soFar: true });
      saveMatchInProgress(store, start, DAY);

      saveMatchInProgress(store, SO_FAR, LATER);

      const result = recordForfeit(store);
      expect(result?.ok && result.stats.log[0]?.date).toBe(LATER);
      expect(result?.ok && result.stats.log[0]?.scoreByScrum.yours).toHaveLength(1);
    });
  });

  describe('when the match ends', () => {
    it('records it as finished, and clears the match in progress: no forfeit follows', () => {
      const store = storeMidMatch();

      recordMatch(store, FINISHED, DAY);

      expect(recordForfeit(store)).toBeNull();
      const stats = loadStats(store);
      expect(stats.ok && stats.stats.results.forfeited).toBe(0);
    });

    it('clears the match in progress even when its stats can’t be added', () => {
      const store = storeMidMatch();
      const record = rawRecord(store);
      record.stats = { broken: true };
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      expect(recordMatch(store, FINISHED, DAY)).toEqual({ ok: false, problem: 'unreadable' });

      expect(recordForfeit(store)).toBeNull();
      expect(rawRecord(store).stats).toEqual({ broken: true });
    });

    it('clears the match in progress when storage is too full to add the match', () => {
      const store = storeMidMatch();
      // Full, as a browser's storage can be: room for the record without the
      // match in progress, but not for the stats with the match added.
      const cleared = rawRecord(store);
      delete cleared.inProgress;
      const room = JSON.stringify(cleared).length;
      const full = {
        getItem: store.getItem,
        setItem: (key: string, value: string) => {
          if (value.length > room) {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          }
          store.setItem(key, value);
        },
      };

      expect(recordMatch(full, FINISHED, DAY)).toEqual({ ok: false, problem: 'full' });

      expect(recordForfeit(store)).toBeNull();
      expect(loadStats(store)).toEqual({ ok: true, stats: emptyTeamStats(DAY) });
    });
  });

  describe('other saves', () => {
    it('keep it: saving the same team again, or a draft for a new one', () => {
      const store = storeMidMatch();

      saveTeam(store, SPOOFS);
      saveDraft(store, startDraft({ name: 'Night Owls', color: 'teal', logo: '🦉' }, TEST_SEED));

      expect(recordForfeit(store)?.ok).toBe(true);
    });

    it('drop it when a new team replaces the old one, with its record (the owner, #90)', () => {
      const store = storeMidMatch();

      saveTeam(store, { ...SPOOFS, name: 'Owls' }, { endDraft: true, joined: LATER });

      expect(recordForfeit(store)).toBeNull();
      expect(loadStats(store)).toEqual({ ok: true, stats: emptyTeamStats(LATER) });
    });
  });
});

describe("the team's Pharm (#106)", () => {
  const DAY = '2026-11-27';
  const PLAYED = matchRecord(computerMatch(SPOOFS, EMBERS, TEST_SEED));
  const SO_FAR = (() => {
    let match = startMatch(SPOOFS, EMBERS, TEST_SEED);
    match = playScrum(match, computerMise(match));
    return matchRecord(match, { soFar: true });
  })();

  /** A roster holding 3 prospects, so 3 draft picks, the oldest drawn 2nd. */
  function aRoster(seed = 11): Roster {
    const names = ['Ada One', 'Bo Two', 'Cy Three'];
    return {
      seed,
      prospectsDrawn: 4,
      prospects: names.map((name, i) => ({
        ...generateSpoof(`x${String(i + 2)}`, 'knight', NEW_SPOOF_SKILL_TOTAL, createRandom(i + 1)),
        name,
        mark: 'star' as const,
      })),
    };
  }

  /** Storage holding the Spoofs, created on `DAY`, with `aRoster()` saved. */
  function storeWithRoster() {
    const store = memoryStorage();
    saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
    expect(saveRoster(store, aRoster())).toEqual({ ok: true });
    return store;
  }

  const raw = (store: ReturnType<typeof memoryStorage>) =>
    JSON.parse(store.items.get(STORAGE_KEY) ?? '') as Record<string, unknown>;

  const rosterOf = (store: ReturnType<typeof memoryStorage>) => {
    const loaded = loadRoster(store);
    if (!loaded.ok) throw new Error(loaded.problem);
    return loaded.roster;
  };

  describe('a new team', () => {
    it('starts with no prospects, so no draft picks', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });

      expect(rosterOf(store)).toMatchObject({ prospectsDrawn: 0, prospects: [] });
    });

    it('saves its fresh roster with it', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });

      expect(raw(store).roster).toEqual({
        seed: rosterOf(store).seed,
        prospectsDrawn: 0,
        prospects: [],
      });
    });

    it('gets a new seed when re-drafted with the same name and spoof ids (#114 review)', () => {
      const first = memoryStorage();
      saveTeam(first, SPOOFS, { endDraft: true, joined: DAY });
      const redrafted = memoryStorage();
      const others = SPOOFS.spoofs.map((s, i) => {
        const fresh = generateSpoof(s.id, s.type, NEW_SPOOF_SKILL_TOTAL, createRandom(500 + i));
        return { ...fresh, name: s.name };
      });
      saveTeam(redrafted, { ...SPOOFS, spoofs: others }, { endDraft: true, joined: DAY });

      expect(rosterOf(redrafted).seed).not.toBe(rosterOf(first).seed);
    });

    it('starts fresh, replacing the old team’s prospects', () => {
      const store = storeWithRoster();

      saveTeam(store, { ...SPOOFS, name: 'Owls' }, { endDraft: true, joined: DAY });

      expect(rosterOf(store)).toMatchObject({ prospectsDrawn: 0, prospects: [] });
    });
  });

  describe('saveRoster and loadRoster', () => {
    it('saves the roster, prospects and all, and loads it back the same', () => {
      const store = storeWithRoster();

      expect(rosterOf(store)).toEqual(aRoster());
      expect(raw(store).version).toBe(6);
    });

    it('keeps the team, its stats, a draft and the match in progress', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      recordMatch(store, PLAYED, DAY);
      saveMatchInProgress(store, SO_FAR, DAY);
      const draft = startDraft({ name: 'Next', color: 'red', logo: '🐝' }, TEST_SEED);
      saveDraft(store, draft);
      const before = raw(store);

      saveRoster(store, aRoster());

      const after = raw(store);
      expect(after.team).toEqual(before.team);
      expect(after.stats).toEqual(before.stats);
      expect(after.inProgress).toEqual(before.inProgress);
      expect(loadDraft(store)).toEqual(draft);
    });

    it('refuses impossible values, saving nothing', () => {
      const store = storeWithRoster();
      const before = store.items.get(STORAGE_KEY);

      const [first] = aRoster().prospects;
      if (!first) throw new Error('no prospect');
      const result = saveRoster(store, { ...aRoster(), prospects: [first, first] });

      expect(result).toMatchObject({ ok: false, problem: 'invalid' });
      expect(store.items.get(STORAGE_KEY)).toBe(before);
    });

    it('refuses without a saved team, or storage', () => {
      expect(saveRoster(memoryStorage(), aRoster())).toEqual({ ok: false, problem: 'none' });
      expect(saveRoster(null, aRoster())).toEqual({ ok: false, problem: 'unavailable' });
      expect(loadRoster(memoryStorage())).toEqual({ ok: false, problem: 'none' });
    });

    it('says when storage is full', () => {
      const store = storeWithRoster();
      const full = fullStorage({ [STORAGE_KEY]: store.items.get(STORAGE_KEY) ?? '' });

      expect(saveRoster(full, aRoster(12))).toEqual({ ok: false, problem: 'full' });
    });
  });

  describe('every save keeps it', () => {
    it('saving the same team again', () => {
      const store = storeWithRoster();
      saveTeam(store, SPOOFS);
      expect(rosterOf(store)).toEqual(aRoster());
    });

    it('saving a draft', () => {
      const store = storeWithRoster();
      saveDraft(store, startDraft({ name: 'Next', color: 'red', logo: '🐝' }, TEST_SEED));
      expect(rosterOf(store)).toEqual(aRoster());
    });

    it('recording a match', () => {
      const store = storeWithRoster();
      expect(recordMatch(store, PLAYED, DAY).ok).toBe(true);
      expect(rosterOf(store)).toEqual(aRoster());
    });

    it('saving a match in progress, and recording it as a forfeit', () => {
      const store = storeWithRoster();
      saveMatchInProgress(store, SO_FAR, DAY);
      expect(rosterOf(store)).toEqual(aRoster());

      expect(recordForfeit(store)?.ok).toBe(true);
      expect(rosterOf(store)).toEqual(aRoster());
    });

    it('clearing the match in progress when the stats can’t be read', () => {
      const store = storeWithRoster();
      saveMatchInProgress(store, SO_FAR, DAY);
      const record = raw(store);
      record.stats = 'broken';
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      recordMatch(store, PLAYED, DAY);

      expect(raw(store)).not.toHaveProperty('inProgress');
      expect(rosterOf(store)).toEqual(aRoster());
    });
  });

  describe('a version 5 team', () => {
    /** The Spoofs saved as version 5 wrote them: no roster. */
    function version5Store() {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      recordMatch(store, PLAYED, DAY);
      const record = raw(store);
      record.version = 5;
      delete record.roster;
      store.items.set(STORAGE_KEY, JSON.stringify(record));
      return store;
    }

    it('loads with no prospects, so no picks, its stats kept', () => {
      const store = version5Store();

      expect(rosterOf(store)).toMatchObject({ prospectsDrawn: 0, prospects: [] });
      const stats = loadStats(store);
      expect(stats.ok && stats.stats.log).toHaveLength(1);
    });

    it('gets the same roster seed on every load, so it draws the same prospects', () => {
      expect(rosterOf(version5Store()).seed).toBe(rosterOf(version5Store()).seed);
      const other = memoryStorage();
      saveTeam(other, { ...SPOOFS, name: 'Owls' });
      expect(rosterOf(other).seed).not.toBe(rosterOf(version5Store()).seed);
    });

    it('keeps its roster seed when a spoof is renamed or the roster reordered', () => {
      const seed = rosterOf(version5Store()).seed;
      const store = version5Store();
      const [first, ...rest] = SPOOFS.spoofs;
      if (!first) throw new Error('no spoof');
      saveTeam(store, { ...SPOOFS, spoofs: [...rest, { ...first, name: 'Renamed Rex' }] });
      const record = raw(store);
      delete record.roster;
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      expect(rosterOf(store).seed).toBe(seed);
    });

    it('is still read by its stats and team', () => {
      const store = version5Store();
      expect(loadTeam(store)).toEqual({ ok: true, team: SPOOFS });
    });
  });

  describe('a roster that can’t be read', () => {
    /** Storage whose saved roster is changed by `edit`. */
    function brokenStore(edit: (roster: Record<string, unknown>) => void) {
      const store = storeWithRoster();
      const record = raw(store);
      edit(record.roster as Record<string, unknown>);
      store.items.set(STORAGE_KEY, JSON.stringify(record));
      return store;
    }

    it.each([
      ['the wrong shape', (r: Record<string, unknown>) => (r.prospects = 'none')],
      ['a missing count', (r: Record<string, unknown>) => delete r.prospectsDrawn],
      ['a missing seed', (r: Record<string, unknown>) => delete r.seed],
      ['fewer drawn than held', (r: Record<string, unknown>) => (r.prospectsDrawn = 2)],
      [
        'a prospect with no mark',
        (r: Record<string, unknown>) => {
          delete (r.prospects as Record<string, unknown>[])[0]?.mark;
        },
      ],
      [
        'a prospect with a skill out of range',
        (r: Record<string, unknown>) => {
          const first = (r.prospects as { skills: Record<string, number> }[])[0];
          if (first) first.skills.burst = 500;
        },
      ],
    ])('is unreadable with %s, and left in place', (_label, edit) => {
      const store = brokenStore(edit);
      const before = raw(store).roster;

      expect(loadRoster(store)).toEqual({ ok: false, problem: 'unreadable' });
      recordMatch(store, PLAYED, DAY);
      expect(raw(store).roster).toEqual(before);
    });

    it('doesn’t stop the team or its stats loading', () => {
      const store = brokenStore((r) => (r.prospectsDrawn = 2));

      expect(loadTeam(store).ok).toBe(true);
      expect(loadStats(store).ok).toBe(true);
    });
  });

  describe("each spoof's latest name and mark (#100's data gap)", () => {
    it('are saved with its totals, and load back', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      recordMatch(store, PLAYED, DAY);

      const loaded = loadStats(store);
      if (!loaded.ok) throw new Error(loaded.problem);
      const played = SPOOFS.spoofs.filter((s) => loaded.stats.spoofs[s.id] !== undefined);
      expect(played.length).toBeGreaterThan(0);
      for (const spoof of played) {
        expect(loaded.stats.spoofs[spoof.id]).toMatchObject({ name: spoof.name, mark: spoof.mark });
      }
    });

    it('can’t be read with the wrong shape', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      recordMatch(store, PLAYED, DAY);
      const record = raw(store) as { stats: { spoofs: Record<string, Record<string, unknown>> } };
      const first = Object.values(record.stats.spoofs)[0];
      if (first) first.mark = 'nonesuch';
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      expect(loadStats(store)).toEqual({ ok: false, problem: 'unreadable' });
    });

    it('can’t be read with a name that isn’t text', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      recordMatch(store, PLAYED, DAY);
      const record = raw(store) as { stats: { spoofs: Record<string, Record<string, unknown>> } };
      const first = Object.values(record.stats.spoofs)[0];
      if (first) first.name = 42;
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      expect(loadStats(store)).toEqual({ ok: false, problem: 'unreadable' });
    });

    it('leaves a match in progress with a bad mark unread, and in place (#114 review)', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      saveMatchInProgress(store, SO_FAR, DAY);
      const record = raw(store) as {
        inProgress: { record: { spoofs: Record<string, unknown>[] } };
      };
      const line = record.inProgress.record.spoofs[0];
      if (line) line.mark = 'nonesuch';
      store.items.set(STORAGE_KEY, JSON.stringify(record));
      const before = raw(store).inProgress;

      expect(recordForfeit(store)).toEqual({ ok: false, problem: 'unreadable' });
      expect(raw(store).inProgress).toEqual(before);
      expect(loadStats(store).ok).toBe(true);
    });

    it('records a forfeit from a match in progress saved before marks', () => {
      const store = memoryStorage();
      saveTeam(store, SPOOFS, { endDraft: true, joined: DAY });
      saveMatchInProgress(store, SO_FAR, DAY);
      const record = raw(store) as {
        inProgress: { record: { spoofs: Record<string, unknown>[] } };
      };
      for (const line of record.inProgress.record.spoofs) delete line.mark;
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      const result = recordForfeit(store);

      expect(result?.ok).toBe(true);
      const totals = result?.ok ? Object.values(result.stats.spoofs) : [];
      expect(totals.length).toBeGreaterThan(0);
      for (const t of totals) expect(t).not.toHaveProperty('mark');
    });
  });
});
