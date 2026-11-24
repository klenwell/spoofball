import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { DRAFT_BUDGET, createPool } from './combine';
import {
  budgetLeft,
  draftPool,
  draftProblem,
  draftedTeam,
  isDraftComplete,
  pickProblem,
  renameCandidate,
  renameProblem,
  startDraft,
  togglePick,
  type Draft,
} from './draft';
import { teamProblems } from './teams';

const choices = { name: ' Night Owls ', color: 'teal' as const, logo: '🦉' };

/** A new draft on the test seed's pool. */
function newDraft(seed = TEST_SEED): Draft {
  return startDraft(choices, seed);
}

/** The pool's ids, cheapest first. */
function byPrice(draft: Draft): string[] {
  return [...draftPool(draft)].sort((a, b) => a.price - b.price).map((c) => c.spoof.id);
}

/** Picks these ids in order. */
function pickAll(draft: Draft, ids: readonly string[]): Draft {
  return ids.reduce((d, id) => togglePick(d, draftPool(d), id), draft);
}

describe('startDraft', () => {
  it('keeps your choices, with the name trimmed, and starts with no picks', () => {
    expect(newDraft()).toEqual({
      name: 'Night Owls',
      color: 'teal',
      logo: '🦉',
      seed: TEST_SEED,
      picks: [],
      renames: {},
    });
  });
});

describe('togglePick', () => {
  it('picks a candidate, and unpicks it on a second toggle', () => {
    const draft = newDraft();
    const pool = draftPool(draft);

    const picked = togglePick(draft, pool, 'p3');

    expect(picked.picks).toEqual(['p3']);
    expect(togglePick(picked, pool, 'p3').picks).toEqual([]);
  });

  it('spends from the budget as you pick', () => {
    const draft = newDraft();
    const pool = draftPool(draft);
    const price = pool.find((c) => c.spoof.id === 'p2')?.price ?? 0;

    expect(budgetLeft(draft, pool)).toBe(DRAFT_BUDGET);
    expect(budgetLeft(togglePick(draft, pool, 'p2'), pool)).toBe(DRAFT_BUDGET - price);
  });

  it("refuses a pick that costs more than what's left, and says why", () => {
    // Over many pools: pick the dearest first until one more doesn't fit.
    let refused = 0;
    for (let n = 0; n < 100; n += 1) {
      let draft = newDraft(TEST_SEED + n);
      const pool = draftPool(draft);
      for (const id of byPrice(draft).reverse()) {
        const problem = pickProblem(draft, pool, id);
        const next = togglePick(draft, pool, id);
        if (problem === 'over-budget') {
          expect(next).toBe(draft);
          refused += 1;
        }
        draft = next;
        expect(budgetLeft(draft, pool)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(refused).toBeGreaterThan(0);
  });

  it("allows a pick that costs exactly what's left", () => {
    const draft = newDraft();
    const prices = [100, 100, 50, 51, 1, 1, 1, 1, 1, 1];
    const pool = draftPool(draft).map((c, i) => ({ ...c, price: prices[i] ?? 1 }));
    const two = togglePick(togglePick(draft, pool, 'p1'), pool, 'p2');

    expect(budgetLeft(two, pool)).toBe(50);
    expect(pickProblem(two, pool, 'p4')).toBe('over-budget');
    expect(pickProblem(two, pool, 'p3')).toBeNull();
    expect(budgetLeft(togglePick(two, pool, 'p3'), pool)).toBe(0);
  });

  it('refuses a sixth pick: the team is full', () => {
    const draft = pickAll(newDraft(), byPrice(newDraft()).slice(0, 5));
    const pool = draftPool(draft);
    const sixth = byPrice(draft)[5] ?? '';

    expect(pickProblem(draft, pool, sixth)).toBe('full');
    expect(togglePick(draft, pool, sixth)).toBe(draft);
  });

  it('ignores an id not in the pool', () => {
    const draft = newDraft();
    expect(togglePick(draft, draftPool(draft), 'p99')).toBe(draft);
  });
});

describe('renaming', () => {
  it('renames a candidate, with spaces trimmed, wherever its name shows', () => {
    const draft = newDraft();

    const renamed = renameCandidate(draft, draftPool(draft), 'p1', '  Hoot  ');

    expect(renamed.renames).toEqual({ p1: 'Hoot' });
    expect(draftPool(renamed).find((c) => c.spoof.id === 'p1')?.spoof.name).toBe('Hoot');
  });

  it('refuses an empty name, one over 16 characters, or one another candidate has', () => {
    const draft = newDraft();
    const pool = draftPool(draft);
    const other = pool[1]?.spoof.name ?? '';

    expect(renameProblem(pool, 'p1', '  ')).toBe('empty');
    expect(renameProblem(pool, 'p1', 'A'.repeat(17))).toBe('long');
    expect(renameProblem(pool, 'p1', other.toUpperCase())).toBe('taken');
    expect(renameCandidate(draft, pool, 'p1', other)).toBe(draft);
  });

  it('lets a candidate keep its own name, in any case', () => {
    const pool = draftPool(newDraft());
    const own = pool[0]?.spoof.name ?? '';
    expect(renameProblem(pool, 'p1', own.toLowerCase())).toBeNull();
  });
});

describe('draftedTeam', () => {
  it('is null until 5 are picked', () => {
    const four = pickAll(newDraft(), byPrice(newDraft()).slice(0, 4));
    expect(isDraftComplete(four)).toBe(false);
    expect(draftedTeam(four)).toBeNull();
  });

  it('makes a valid team from your choices and your picks, in pick order, renames and all', () => {
    let draft = pickAll(newDraft(), byPrice(newDraft()).slice(0, 5).reverse());
    draft = renameCandidate(draft, draftPool(draft), draft.picks[0] ?? '', 'Hoot');

    const team = draftedTeam(draft);

    expect(team && teamProblems(team)).toEqual([]);
    expect(team?.name).toBe('Night Owls');
    expect(team?.spoofs.map((s) => s.id)).toEqual(draft.picks);
    expect(team?.spoofs[0]?.name).toBe('Hoot');
  });
});

describe('draftProblem', () => {
  const valid = renameCandidate(
    pickAll(newDraft(), byPrice(newDraft()).slice(0, 3)),
    draftPool(newDraft()),
    'p1',
    'Hoot',
  );

  it('finds nothing wrong with a draft made by the rules', () => {
    expect(draftProblem(valid)).toBeNull();
  });

  it.each<[string, Partial<Draft>]>([
    ['a seed that is not whole', { seed: 1.5 }],
    ['no team name', { name: '' }],
    ['an unknown color', { color: 'beige' as Draft['color'] }],
    ['an unknown logo', { logo: 'X' }],
    ['a pick twice', { picks: ['p1', 'p1'] }],
    ['a pick not in the pool', { picks: ['p99'] }],
    ['6 picks', { picks: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] }],
    ['a rename not in the pool', { renames: { p99: 'Hoot' } }],
    ['a rename too long', { renames: { p1: 'A'.repeat(17) } }],
    ['a rename with spaces at the end', { renames: { p1: 'Hoot ' } }],
  ])('finds %s', (_what, change) => {
    expect(draftProblem({ ...valid, ...change })).not.toBeNull();
  });

  it('finds picks that cost more than the budget', () => {
    const pool = draftPool(valid);
    const dearest = [...pool].sort((a, b) => b.price - a.price).slice(0, 5);
    const total = dearest.reduce((a, c) => a + c.price, 0);
    expect(total).toBeGreaterThan(DRAFT_BUDGET);
    expect(draftProblem({ ...valid, picks: dearest.map((c) => c.spoof.id) })).not.toBeNull();
  });

  it('finds a rename that matches another candidate', () => {
    const other = createPool(TEST_SEED)[1]?.spoof.name ?? '';
    expect(draftProblem({ ...valid, renames: { p1: other } })).not.toBeNull();
  });
});
