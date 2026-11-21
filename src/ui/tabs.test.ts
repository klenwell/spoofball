import { describe, expect, it } from 'vitest';
import { DEFAULT_TAB, hashFor, isCanonicalHash, tabById, tabFromHash, tabIds, tabs } from './tabs';

describe('tabs', () => {
  it('lists Match, Pharm and Stats in tab-bar order', () => {
    expect(tabs.map((t) => t.label)).toEqual(['Match', 'Pharm', 'Stats']);
  });

  it('has one entry per tab id', () => {
    expect(tabs.map((t) => t.id)).toEqual([...tabIds]);
  });

  it('says in which version each placeholder screen arrives', () => {
    for (const tab of tabs) {
      expect(tab.coming, tab.id).toMatch(/v0\.\d+\.0/);
    }
  });
});

describe('hashFor', () => {
  it('gives each tab its own hash route', () => {
    expect(tabIds.map(hashFor)).toEqual(['#/match', '#/pharm', '#/stats']);
  });
});

describe('tabFromHash', () => {
  it('selects the tab a hash names', () => {
    for (const id of tabIds) {
      expect(tabFromHash(hashFor(id))).toBe(id);
    }
  });

  describe('when the hash is empty', () => {
    it('selects the default tab', () => {
      expect(tabFromHash('')).toBe(DEFAULT_TAB);
    });
  });

  describe('when the hash names no tab', () => {
    it('selects the default tab', () => {
      for (const hash of ['#', '#/', '#/court', '#/stats/extra', '#stats', '#/Stats', '#/ stats']) {
        expect(tabFromHash(hash), hash).toBe(DEFAULT_TAB);
      }
    });
  });

  describe('when the hash names an object property rather than a tab', () => {
    it('selects the default tab', () => {
      expect(tabFromHash('#/constructor')).toBe(DEFAULT_TAB);
    });
  });
});

describe('isCanonicalHash', () => {
  it('accepts a tab hash as it is', () => {
    expect(isCanonicalHash('#/pharm')).toBe(true);
  });

  describe('when the hash would select the default tab without naming it', () => {
    it('asks for the URL to be corrected', () => {
      expect(isCanonicalHash('')).toBe(false);
      expect(isCanonicalHash('#/nope')).toBe(false);
    });
  });
});

describe('tabById', () => {
  it('finds a tab by its id', () => {
    expect(tabById('stats').label).toBe('Stats');
  });
});
