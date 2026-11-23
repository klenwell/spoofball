import { describe, expect, it } from 'vitest';

/**
 * Game logic never touches the browser (#70, CLAUDE.md): src/game stays pure
 * so it's fast to test in Node and a match replays from its seed. Saving
 * lives in src/storage.
 */

const gameSources = import.meta.glob<string>(['../game/**/*.ts', '!../game/**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const forbidden: [string, RegExp][] = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['the storage modules', /from ['"][./]*\/?storage\//],
  ['the window', /\bwindow\./],
  ['the document', /\bdocument\./],
];

describe('game code', () => {
  it('has source files to check', () => {
    expect(Object.keys(gameSources).length).toBeGreaterThan(10);
  });

  it.each(forbidden)('never uses %s', (_what, pattern) => {
    const offenders = Object.entries(gameSources)
      .filter(([, code]) => pattern.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
