import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { createRandom } from './random';
import { generateSkills, sizeToRadius, skillTotal } from './skills';
import { TEAM_LOGOS } from './logos';
import { drawSpoofName } from './spoof-names';
import { drawTemperament } from './temperament';
import { SPOOFS, EMBERS } from './preset-teams';
import {
  MAX_SPOOF_NAME_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  NEW_SPOOF_SKILL_TOTAL,
  SPOOFS_PER_TEAM,
  createSpoof,
  generateSpoof,
  teamProblems,
  type Spoof,
  type Team,
} from './teams';

describe('createSpoof', () => {
  it('works out the radius from the size skill', () => {
    const skills = generateSpoof(
      'x',
      'king',
      NEW_SPOOF_SKILL_TOTAL,
      createRandom(TEST_SEED),
    ).skills;
    const spoof = createSpoof('a', 'Dizzy Gus', 'king', skills);
    expect(spoof.radius).toBe(sizeToRadius(skills.size));
  });
});

describe('generateSpoof', () => {
  it('makes a spoof of the type with the skill total', () => {
    const spoof = generateSpoof('a', 'bishop', 520, createRandom(TEST_SEED));
    expect(spoof.type).toBe('bishop');
    expect(skillTotal(spoof.skills)).toBe(520);
  });

  it('makes the same spoof from the same seed', () => {
    expect(generateSpoof('a', 'knight', 520, createRandom(7))).toEqual(
      generateSpoof('a', 'knight', 520, createRandom(7)),
    );
  });
});

describe('a spoof name', () => {
  it('keeps the name it is made with', () => {
    const skills = generateSpoof('x', 'rook', 520, createRandom(TEST_SEED)).skills;
    expect(createSpoof('a', 'Wobbly Ida', 'rook', skills).name).toBe('Wobbly Ida');
  });

  it('comes from the generator last, so the skills and temperament are the same as without it', () => {
    const random = createRandom(TEST_SEED);
    const spoof = generateSpoof('a', 'knight', NEW_SPOOF_SKILL_TOTAL, random);
    const replay = createRandom(TEST_SEED);
    const skills = generateSkills('knight', NEW_SPOOF_SKILL_TOTAL, replay);
    const temperament = drawTemperament('knight', replay);
    expect(spoof.skills).toEqual(skills);
    expect(spoof.temperament).toBe(temperament);
    expect(spoof.name).toBe(drawSpoofName(replay));
  });

  it("is unlike the taken names it's given", () => {
    const random = createRandom(TEST_SEED);
    const taken = ['Dizzy Gus'];
    for (let i = 0; i < 50; i += 1) {
      const spoof = generateSpoof('a', 'rook', 520, random, taken);
      expect(spoof.name).not.toMatch(/Dizzy|Gus/);
    }
  });
});

describe('temperament on a spoof', () => {
  it('is 1, average, when a spoof is made without one', () => {
    const skills = generateSpoof(
      'x',
      'rook',
      NEW_SPOOF_SKILL_TOTAL,
      createRandom(TEST_SEED),
    ).skills;
    expect(createSpoof('a', 'Dizzy Gus', 'rook', skills).temperament).toBe(1);
  });

  it('comes from the generator, after the skills, so the skills are the same as without it', () => {
    const random = createRandom(TEST_SEED);
    const spoof = generateSpoof('a', 'knight', NEW_SPOOF_SKILL_TOTAL, random);
    expect(spoof.skills).toEqual(
      generateSkills('knight', NEW_SPOOF_SKILL_TOTAL, createRandom(TEST_SEED)),
    );
    expect(spoof.temperament).not.toBe(1);
  });
});

describe('teamProblems', () => {
  const valid = SPOOFS;
  const first = SPOOFS.spoofs[0];
  if (!first) throw new Error('no spoof');
  const withSpoof = (spoof: Spoof): Team => ({
    ...valid,
    spoofs: [spoof, ...valid.spoofs.slice(1)],
  });

  it('finds nothing wrong with a valid team', () => {
    expect(teamProblems(valid)).toEqual([]);
    expect(teamProblems(EMBERS)).toEqual([]);
  });

  it(`takes names of 1 to ${String(MAX_TEAM_NAME_LENGTH)} characters, counting an emoji as one`, () => {
    expect(MAX_TEAM_NAME_LENGTH).toBe(16);
    expect(teamProblems({ ...valid, name: 'A' })).toEqual([]);
    expect(teamProblems({ ...valid, name: 'A'.repeat(16) })).toEqual([]);
    expect(teamProblems({ ...valid, name: '🦉'.repeat(16) })).toEqual([]);
    expect(teamProblems({ ...valid, name: '' })).not.toEqual([]);
    expect(teamProblems({ ...valid, name: 'A'.repeat(17) })).not.toEqual([]);
  });

  it('refuses a name with spaces at either end', () => {
    expect(teamProblems({ ...valid, name: ' Owls' })).not.toEqual([]);
    expect(teamProblems({ ...valid, name: 'Owls ' })).not.toEqual([]);
    expect(teamProblems({ ...valid, name: 'Night Owls' })).toEqual([]);
  });

  it('takes only the 8 colors and the logos in the set', () => {
    expect(teamProblems({ ...valid, color: 'beige' as Team['color'] })).not.toEqual([]);
    expect(teamProblems({ ...valid, logo: 'X' })).not.toEqual([]);
    for (const logo of TEAM_LOGOS) expect(teamProblems({ ...valid, logo })).toEqual([]);
  });

  it(`needs exactly ${String(SPOOFS_PER_TEAM)} spoofs, with distinct ids`, () => {
    expect(teamProblems({ ...valid, spoofs: valid.spoofs.slice(1) })).not.toEqual([]);
    expect(teamProblems({ ...valid, spoofs: [...valid.spoofs, first] })).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, id: valid.spoofs[1]?.id ?? '' }))).not.toEqual([]);
  });

  it(`gives every spoof a name of 1 to ${String(MAX_SPOOF_NAME_LENGTH)} characters, with no spaces at either end`, () => {
    expect(MAX_SPOOF_NAME_LENGTH).toBe(16);
    expect(teamProblems(withSpoof({ ...first, name: 'B' }))).toEqual([]);
    expect(teamProblems(withSpoof({ ...first, name: 'B'.repeat(16) }))).toEqual([]);
    expect(teamProblems(withSpoof({ ...first, name: '🦉'.repeat(16) }))).toEqual([]);
    expect(teamProblems(withSpoof({ ...first, name: '' }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, name: 'B'.repeat(17) }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, name: ' Bo' }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, name: 'Bo ' }))).not.toEqual([]);
  });

  it('needs every spoof name on a team to be different, ignoring case', () => {
    const other = valid.spoofs[1]?.name ?? '';
    expect(teamProblems(withSpoof({ ...first, name: other }))).toContain('Two spoofs share a name');
    expect(teamProblems(withSpoof({ ...first, name: other.toUpperCase() }))).toContain(
      'Two spoofs share a name',
    );
  });

  it('checks each spoof: id, type, skills from 1 to 99, radius and temperament', () => {
    expect(teamProblems(withSpoof({ ...first, id: '' }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, type: 'jester' as Spoof['type'] }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, skills: { ...first.skills, iq: 0 } }))).not.toEqual(
      [],
    );
    expect(teamProblems(withSpoof({ ...first, skills: { ...first.skills, iq: 100 } }))).not.toEqual(
      [],
    );
    expect(
      teamProblems(withSpoof({ ...first, skills: { ...first.skills, iq: Number.NaN } })),
    ).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, radius: first.radius + 1 }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, temperament: 0 }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, temperament: 0.09 }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, temperament: 2.01 }))).not.toEqual([]);
    expect(teamProblems(withSpoof({ ...first, temperament: 0.1 }))).toEqual([]);
    expect(teamProblems(withSpoof({ ...first, temperament: 2 }))).toEqual([]);
    expect(teamProblems(withSpoof({ ...first, skills: { ...first.skills, iq: 1 } }))).toEqual([]);
    expect(teamProblems(withSpoof({ ...first, skills: { ...first.skills, iq: 99 } }))).toEqual([]);
  });
});
