import { describe, expect, it } from 'vitest';
import { createRandom } from './random';
import {
  LOSSES_PER_PICK,
  MAX_DRAFT_PICKS,
  PROSPECTS,
  emptyRoster,
  rosterProblems,
  type Roster,
} from './roster';
import { generateSpoof, NEW_SPOOF_SKILL_TOTAL, type Spoof } from './teams';

/** A prospect, drawn as the combine draws a candidate. */
function prospect(id: string, name?: string): Spoof {
  const spoof = generateSpoof(id, 'rook', NEW_SPOOF_SKILL_TOTAL, createRandom(id.length * 101));
  return name === undefined ? spoof : { ...spoof, name };
}

/** A sound roster holding 3 prospects, changed by `overrides`. */
function rosterWith(overrides: Partial<Roster> = {}): Roster {
  return {
    ...emptyRoster(7),
    prospectsDrawn: 3,
    prospects: [prospect('x1', 'Ada One'), prospect('x2', 'Bo Two'), prospect('x3', 'Cy Three')],
    ...overrides,
  };
}

describe('emptyRoster', () => {
  it('starts a team with no picks, no progress toward one and no prospects (#105)', () => {
    expect(emptyRoster(42)).toEqual({
      seed: 42,
      picks: 0,
      lossesTowardPick: 0,
      prospectsDrawn: 0,
      prospects: [],
    });
    expect(rosterProblems(emptyRoster(42))).toEqual([]);
  });
});

describe('the rules (#105)', () => {
  it('holds at most 3 picks, earns one every 3 losses, and offers 3 prospects', () => {
    expect([MAX_DRAFT_PICKS, LOSSES_PER_PICK, PROSPECTS]).toEqual([3, 3, 3]);
  });
});

describe('rosterProblems', () => {
  it('finds nothing wrong with a sound roster', () => {
    expect(rosterProblems(rosterWith())).toEqual([]);
    expect(rosterProblems(rosterWith({ picks: 3, lossesTowardPick: 2 }))).toEqual([]);
  });

  it('allows 0 to 3 picks, whole numbers only', () => {
    expect(rosterProblems(rosterWith({ picks: 4 }))).toContain('Draft picks must be 0–3');
    expect(rosterProblems(rosterWith({ picks: -1 }))).toContain('Draft picks must be 0–3');
    expect(rosterProblems(rosterWith({ picks: 1.5 }))).toContain('Draft picks must be 0–3');
  });

  it('allows 0 to 2 losses toward the next pick: the 3rd earns it', () => {
    expect(rosterProblems(rosterWith({ lossesTowardPick: 3 }))).toContain(
      'Losses toward a pick must be 0–2',
    );
    expect(rosterProblems(rosterWith({ lossesTowardPick: -1 }))).toContain(
      'Losses toward a pick must be 0–2',
    );
  });

  it('needs a whole-number seed and a count of prospects drawn', () => {
    expect(rosterProblems(rosterWith({ seed: 0.5 }))).toContain('The seed must be a whole number');
    expect(rosterProblems(rosterWith({ prospectsDrawn: -1 }))).toContain(
      'Prospects drawn must be a count',
    );
  });

  it('holds at most 3 prospects, no more than were ever drawn', () => {
    const four = [...rosterWith().prospects, prospect('x4', 'Di Four')];
    expect(rosterProblems(rosterWith({ prospects: four, prospectsDrawn: 4 }))).toContain(
      'At most 3 prospects',
    );
    expect(rosterProblems(rosterWith({ prospectsDrawn: 2 }))).toContain(
      'More prospects than were ever drawn',
    );
  });

  it('needs distinct prospect ids and names, ignoring case', () => {
    const [a, b] = rosterWith().prospects;
    if (!a || !b) throw new Error('no prospects');
    expect(rosterProblems(rosterWith({ prospects: [a, { ...b, id: a.id }] }))).toContain(
      'Two prospects share an id',
    );
    expect(
      rosterProblems(rosterWith({ prospects: [a, { ...b, name: a.name.toUpperCase() }] })),
    ).toContain('Two prospects share a name');
  });

  it('checks each prospect as a spoof', () => {
    const [a] = rosterWith().prospects;
    if (!a) throw new Error('no prospect');
    const broken = { ...a, skills: { ...a.skills, burst: 120 } };

    expect(rosterProblems(rosterWith({ prospects: [broken], prospectsDrawn: 1 }))).toEqual([
      `Spoof ${a.id}: burst is out of range`,
    ]);
  });
});
