import { describe, expect, it } from 'vitest';
import { appInfo, formatVersion } from './app-info';

describe('formatVersion', () => {
  it('prefixes a semver version with "v"', () => {
    expect(formatVersion('0.1.0')).toBe('v9.9.9'); // DELIBERATE FAILURE to prove the merge is blocked; reverted next commit
  });

  it('keeps a pre-release suffix', () => {
    expect(formatVersion('1.0.0-beta.2')).toBe('v1.0.0-beta.2');
  });

  it('ignores surrounding whitespace', () => {
    expect(formatVersion(' 0.1.0\n')).toBe('v0.1.0');
  });

  it('rejects a version that is not semver', () => {
    expect(() => formatVersion('0.1')).toThrow('Invalid version: "0.1"');
  });

  it('rejects a version that already has a "v" prefix', () => {
    expect(() => formatVersion('v0.1.0')).toThrow('Invalid version');
  });
});

describe('appInfo', () => {
  it('names the game and formats the given version', () => {
    expect(appInfo('2.3.4')).toEqual({ name: 'Spoofball', version: 'v2.3.4' });
  });

  it('defaults to the version from package.json', () => {
    expect(appInfo().version).toBe(`v${__APP_VERSION__}`);
  });
});
