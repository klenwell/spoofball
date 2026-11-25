import { describe, expect, it } from 'vitest';
import { blockedStorage, fullStorage, memoryStorage } from '../test-support/storage';
import { EMBERS, SPOOFS } from '../game/preset-teams';
import { matchRecord } from '../game/match';
import { skillNames } from '../game/skills';
import { addMatch, emptyTeamStats } from '../game/stats';
import { computerMatch } from '../test-support/match';
import { teamProblems, type Spoof, type Team } from '../game/teams';
import {
  SAVE_VERSION,
  STORAGE_KEY,
  STORAGE_PROBLEM_TEXT,
  browserStorage,
  loadDraft,
  loadStats,
  loadTeam,
  recordMatch,
  saveDraft,
  saveTeam,
} from './saved-team';
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
    expect(SAVE_VERSION).toBe(5);
    expect(JSON.parse(store.items.get(STORAGE_KEY) ?? '')).toMatchObject({
      version: 5,
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

    it('reports stats it can’t read', () => {
      const store = newTeamStore();
      const record = rawRecord(store);
      record.stats = { ...(record.stats as object), points: -1 };
      store.items.set(STORAGE_KEY, JSON.stringify(record));

      expect(loadStats(store)).toEqual({ ok: false, problem: 'unreadable' });
    });
  });

  describe('recordMatch', () => {
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
