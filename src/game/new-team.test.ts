import { describe, expect, it } from 'vitest';
import { TEST_SEED, sequenceRandom } from '../test-support/random';
import {
  NEW_TEAM_SKILL_TOTAL,
  createTeam,
  newTeamSpoofs,
  shareTeamPoints,
  teamNameProblem,
} from './new-team';
import { createRandom } from './random';
import { skillTotal } from './skills';
import { FACE_TYPES, ROYAL_TYPES, SPOOFS_PER_TEAM, teamProblems } from './teams';

/** Many new teams' spoofs, one per seed. */
function manyTeams(count = 300) {
  return Array.from({ length: count }, (_, n) => newTeamSpoofs(createRandom(TEST_SEED + n)));
}

describe('shareTeamPoints', () => {
  it("adds up to the team's total, 5 shares from lowest to highest", () => {
    const shares = shareTeamPoints(NEW_TEAM_SKILL_TOTAL, createRandom(TEST_SEED));

    expect(NEW_TEAM_SKILL_TOTAL).toBe(2640);
    expect(shares).toHaveLength(SPOOFS_PER_TEAM);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(NEW_TEAM_SKILL_TOTAL);
    expect([...shares].sort((a, b) => a - b)).toEqual(shares);
  });

  it('can take 2 points back from a spoof as it goes round, as the prototype did', () => {
    // 10 points over 5 × 462: the first step takes 2 back, then 8 and 4 finish it.
    const shares = shareTeamPoints(5 * 462 + 10, sequenceRandom([0, 0.999, 0.999]));

    expect(shares).toEqual([460, 462, 462, 466, 470]);
  });

  it('gives each spoof close to an even share, but not exactly', () => {
    const spreads = Array.from({ length: 200 }, (_, n) => {
      const shares = shareTeamPoints(NEW_TEAM_SKILL_TOTAL, createRandom(TEST_SEED + n));
      return (shares.at(-1) ?? 0) - (shares[0] ?? 0);
    });

    expect(Math.min(...spreads)).toBeGreaterThan(0);
    // The prototype's share-out: 462 each to start, then a few points at a time.
    expect(Math.max(...spreads)).toBeLessThan(120);
  });
});

describe('newTeamSpoofs', () => {
  it(`makes ${String(SPOOFS_PER_TEAM)} spoofs with distinct ids, at a new team's strength`, () => {
    const spoofs = newTeamSpoofs(createRandom(TEST_SEED));

    expect(spoofs).toHaveLength(SPOOFS_PER_TEAM);
    expect(new Set(spoofs.map((s) => s.id)).size).toBe(SPOOFS_PER_TEAM);
    expect(spoofs.reduce((sum, s) => sum + skillTotal(s.skills), 0)).toBe(NEW_TEAM_SKILL_TOTAL);
  });

  it('always has at least 2 pawns and at least 1 spoof that is not a pawn', () => {
    for (const spoofs of manyTeams()) {
      const pawns = spoofs.filter((s) => s.type.startsWith('pawn')).length;

      expect(pawns).toBeGreaterThanOrEqual(2);
      expect(pawns).toBeLessThanOrEqual(4);
    }
  });

  it('gives its strongest share to a spoof that is not a pawn', () => {
    for (const spoofs of manyTeams(100)) {
      const top = Math.max(...spoofs.map((s) => skillTotal(s.skills)));
      // Another spoof can tie it, so one of the strongest is enough.
      const strongest = spoofs.filter((s) => skillTotal(s.skills) === top);

      expect(strongest.some((s) => !s.type.startsWith('pawn'))).toBe(true);
    }
  });

  it('keeps the roster rules: at most 1 royal, at most 2 of each face type', () => {
    for (const spoofs of manyTeams()) {
      const types = spoofs.map((s) => s.type);

      expect(types.filter((t) => ROYAL_TYPES.includes(t)).length).toBeLessThanOrEqual(1);
      for (const face of FACE_TYPES) {
        expect(types.filter((t) => t === face).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('draws every type, in no fixed order', () => {
    const teams = manyTeams();
    const types = new Set(teams.flat().map((s) => s.type));
    const firstTypes = new Set(teams.map((spoofs) => spoofs[0]?.type));

    expect(types.size).toBe(8);
    expect(firstTypes.size).toBeGreaterThan(3);
  });

  it('comes from the random source: the same seed, the same spoofs', () => {
    expect(newTeamSpoofs(createRandom(7))).toEqual(newTeamSpoofs(createRandom(7)));
    expect(newTeamSpoofs(createRandom(7))).not.toEqual(newTeamSpoofs(createRandom(8)));
  });
});

describe('createTeam', () => {
  const choices = { name: '  Night Owls ', color: 'purple', logo: '🦉' } as const;

  it("keeps the player's choices, with spaces trimmed from the name", () => {
    const team = createTeam(choices, createRandom(TEST_SEED));

    expect(team.name).toBe('Night Owls');
    expect(team.color).toBe('purple');
    expect(team.logo).toBe('🦉');
  });

  it('makes a valid team, ready to save', () => {
    for (let n = 0; n < 50; n += 1) {
      expect(teamProblems(createTeam(choices, createRandom(TEST_SEED + n)))).toEqual([]);
    }
  });
});

describe('teamNameProblem', () => {
  it('accepts 1 to 16 characters, not counting spaces at either end', () => {
    expect(teamNameProblem('A')).toBeNull();
    expect(teamNameProblem(`  ${'A'.repeat(16)}  `)).toBeNull();
  });

  it('counts an emoji as one character', () => {
    expect(teamNameProblem('👻'.repeat(16))).toBeNull();
    expect(teamNameProblem('👻'.repeat(17))).toBe('long');
  });

  it('needs a name', () => {
    expect(teamNameProblem('')).toBe('empty');
    expect(teamNameProblem('   ')).toBe('empty');
  });

  it('refuses more than 16 characters', () => {
    expect(teamNameProblem('A'.repeat(17))).toBe('long');
  });
});
