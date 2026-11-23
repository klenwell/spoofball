import { describe, expect, it } from 'vitest';
import { blockedStorage, fullStorage, memoryStorage } from '../test-support/storage';
import { SPOOFS } from '../game/preset-teams';
import type { Team } from '../game/teams';
import {
  SAVE_VERSION,
  STORAGE_KEY,
  STORAGE_PROBLEM_TEXT,
  browserStorage,
  loadTeam,
  saveTeam,
} from './saved-team';

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
    spoofs: { type: string; skills: Partial<Record<string, number>>; temperament?: unknown }[];
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
    expect(SAVE_VERSION).toBe(1);
    expect(JSON.parse(store.items.get(STORAGE_KEY) ?? '')).toMatchObject({
      version: 1,
      team: { name: 'Spoofs', color: 'blue', logo: '👻' },
    });
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
      ['no team', () => storeWith((r) => delete (r as Partial<LooseRecord>).team)],
      ['a spoof missing a skill', () => storeWith((r) => delete firstSpoof(r).skills.iq)],
      ['a skill out of range', () => storeWith((r) => (firstSpoof(r).skills.burst = 150))],
      ['a name too long', () => storeWith((r) => (r.team.name = 'A'.repeat(17)))],
      ['an unknown color', () => storeWith((r) => (r.team.color = 'beige'))],
      ['an unknown logo', () => storeWith((r) => (r.team.logo = 'X'))],
      ['4 spoofs', () => storeWith((r) => r.team.spoofs.pop())],
      ['an unknown type', () => storeWith((r) => (firstSpoof(r).type = 'jester'))],
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
});

describe('browserStorage', () => {
  it('is null where there is no localStorage, as in Node', () => {
    expect(browserStorage()).toBeNull();
  });
});
