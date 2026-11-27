import { describe, expect, it } from 'vitest';
import { createRandom } from './random';
import { PROSPECTS, emptyRoster, rosterProblems, type Roster } from './roster';
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
  it('starts a team with no prospects, so no draft picks (#105)', () => {
    expect(emptyRoster(42)).toEqual({ seed: 42, prospectsDrawn: 0, prospects: [] });
    expect(rosterProblems(emptyRoster(42))).toEqual([]);
  });
});

describe('the rule (#105)', () => {
  it('holds at most 3 prospects, which are its draft picks', () => {
    expect(PROSPECTS).toBe(3);
  });
});

describe('rosterProblems', () => {
  it('finds nothing wrong with a sound roster, holding 0 to 3 prospects', () => {
    const { prospects } = rosterWith();
    for (let held = 0; held <= 3; held += 1) {
      expect(rosterProblems(rosterWith({ prospects: prospects.slice(0, held) }))).toEqual([]);
    }
  });

  it('needs a whole-number seed and a count of prospects drawn', () => {
    expect(rosterProblems(rosterWith({ seed: 0.5 }))).toContain('The seed must be a whole number');
    expect(rosterProblems(rosterWith({ prospectsDrawn: -1 }))).toContain(
      'Prospects drawn must be a count',
    );
    expect(rosterProblems(rosterWith({ prospectsDrawn: 3.5 }))).toContain(
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
