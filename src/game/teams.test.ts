import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { createRandom } from './random';
import { generateSkills, sizeToRadius, skillTotal } from './skills';
import { NEW_SPOOF_SKILL_TOTAL, createSpoof, generateSpoof } from './teams';

describe('createSpoof', () => {
  it('works out the radius from the size skill', () => {
    const skills = generateSpoof(
      'x',
      'king',
      NEW_SPOOF_SKILL_TOTAL,
      createRandom(TEST_SEED),
    ).skills;
    const spoof = createSpoof('a', 'king', skills);
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

describe('temperament on a spoof', () => {
  it('is 1, average, when a spoof is made without one', () => {
    const skills = generateSpoof(
      'x',
      'rook',
      NEW_SPOOF_SKILL_TOTAL,
      createRandom(TEST_SEED),
    ).skills;
    expect(createSpoof('a', 'rook', skills).temperament).toBe(1);
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
