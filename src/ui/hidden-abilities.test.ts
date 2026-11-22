import { describe, expect, it } from 'vitest';

/**
 * A guard for docs/design.md, Decision 7: no screen ever shows a spoof's
 * skills, comps (#35) or temperament (#51). The screens and canvas drawing live in src/ui, so
 * none of that code may read them. If a screen ever needs something derived
 * from skills, such as a radius, it gets it from the game model instead.
 */

const sources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const forbidden: [string, RegExp][] = [
  ['the skills module', /from ['"][./]*\/?game\/skills['"]/],
  ["a spoof's skills", /\.skills\b/],
  // Destructuring, as in `({ skills }) => skills.size` or `const { radius, skills } = spoof`.
  ['destructured skills', /[{,]\s*skills\s*[,}:=]/],
  ['comps', /\bcomps\s*\(/],
  ['type profiles', /\btypeProfiles\b/],
  // Temperament is hidden too (#51).
  ['the temperament module', /from ['"][./]*\/?game\/temperament['"]/],
  ["a spoof's temperament", /\btemperament\b/],
];

describe('UI code', () => {
  it('has source files to check', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
  });

  it.each(forbidden)('never reads %s', (_what, pattern) => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => pattern.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
