import { describe, expect, it } from 'vitest';
import { TEST_SEED } from '../test-support/random';
import { createRandom } from './random';
import { FIRST_NAMES, NAME_WORDS, drawSpoofName } from './spoof-names';
import { spoofTypes } from './spoof-types';
import { MAX_SPOOF_NAME_LENGTH, characterCount } from './teams';

describe('the name lists', () => {
  it(`make names of at most ${String(MAX_SPOOF_NAME_LENGTH)} characters, every pairing`, () => {
    const longestWord = Math.max(...NAME_WORDS.map(characterCount));
    const longestFirst = Math.max(...FIRST_NAMES.map(characterCount));
    expect(longestWord + 1 + longestFirst).toBeLessThanOrEqual(MAX_SPOOF_NAME_LENGTH);
  });

  it('have no repeats and no spaces inside a word', () => {
    const all = [...NAME_WORDS, ...FIRST_NAMES].map((w) => w.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
    for (const word of all) expect(word).toMatch(/^[a-z]+$/);
  });

  it("leave out the game's own words, so a name is never taken for a type or a rule", () => {
    const gameWords = [
      ...spoofTypes.flatMap((t) => t.split('-')),
      'pawn',
      'royal',
      'kit',
      'mise',
      'scrum',
      'mosh',
      'apron',
      'crush',
      'pharm',
      'draft',
      'combine',
    ];
    for (const word of [...NAME_WORDS, ...FIRST_NAMES]) {
      expect(gameWords, word).not.toContain(word.toLowerCase());
    }
  });
});

describe('drawSpoofName', () => {
  it('pairs a word and a first name', () => {
    const [word, first, ...rest] = drawSpoofName(createRandom(TEST_SEED)).split(' ');
    expect(NAME_WORDS).toContain(word);
    expect(FIRST_NAMES).toContain(first);
    expect(rest).toEqual([]);
  });

  it('comes from the random source: the same seed, the same name', () => {
    expect(drawSpoofName(createRandom(7))).toBe(drawSpoofName(createRandom(7)));
  });

  it('uses neither word of a taken name, ignoring case, so a pool of 15 never repeats one', () => {
    for (let n = 0; n < 50; n += 1) {
      const random = createRandom(TEST_SEED + n);
      const names: string[] = [];
      for (let i = 0; i < 15; i += 1) names.push(drawSpoofName(random, names));
      const words = names.flatMap((name) => name.toLowerCase().split(' '));
      expect(new Set(words).size, names.join(', ')).toBe(words.length);
    }
    const random = createRandom(TEST_SEED);
    for (let i = 0; i < 100; i += 1) {
      expect(drawSpoofName(random, ['DIZZY GUS']).toLowerCase()).not.toMatch(/dizzy|gus/);
    }
  });

  it("steers clear of a renamed spoof's words too, and copes with odd spacing", () => {
    const random = createRandom(TEST_SEED);
    for (let i = 0; i < 100; i += 1) {
      expect(drawSpoofName(random, ['  Lucky   ', 'Mabel'])).not.toMatch(/Lucky|Mabel/);
    }
  });

  it('still finds a unique name once every word is used, reusing words', () => {
    const allButOne = NAME_WORDS.flatMap((word) =>
      FIRST_NAMES.map((first) => `${word} ${first}`),
    ).slice(1);
    const [lastWord = '', lastFirst = ''] = [NAME_WORDS[0], FIRST_NAMES[0]];
    expect(drawSpoofName(createRandom(TEST_SEED), allButOne)).toBe(`${lastWord} ${lastFirst}`);
    expect(() =>
      drawSpoofName(createRandom(TEST_SEED), [...allButOne, `${lastWord} ${lastFirst}`]),
    ).toThrow(RangeError);
  });
});
