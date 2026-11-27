import { describe, expect, it } from 'vitest';
import {
  COMBINE_HASH,
  NEW_TEAM_HASH,
  START_HASH,
  hashForRoute,
  routeFromHash,
  type Route,
} from './routes';

const later = { hasTeam: true, hasDraft: false, opening: false };
const opening = { hasTeam: true, hasDraft: false, opening: true };
const noTeam = { hasTeam: false, hasDraft: false, opening: false };

describe('routeFromHash', () => {
  describe('when no team is in play', () => {
    it.each(['', '#/match', '#/stats', START_HASH, '#/nope'])(
      'opens the splash screen for %j',
      (hash) => {
        expect(routeFromHash(hash, noTeam)).toEqual({ screen: 'start' });
        expect(routeFromHash(hash, { ...noTeam, opening: true })).toEqual({ screen: 'start' });
      },
    );

    it('opens the create screen for its own hash', () => {
      expect(routeFromHash(NEW_TEAM_HASH, noTeam)).toEqual({ screen: 'new-team' });
    });
  });

  describe('when a team is in play', () => {
    it('opens the tab the hash names, or Match', () => {
      expect(routeFromHash('#/stats', later)).toEqual({ screen: 'tab', tab: 'stats' });
      expect(routeFromHash('', later)).toEqual({ screen: 'tab', tab: 'match' });
    });

    it('can go back to the splash screen, and to the create screen', () => {
      expect(routeFromHash(START_HASH, later)).toEqual({ screen: 'start' });
      expect(routeFromHash(NEW_TEAM_HASH, later)).toEqual({ screen: 'new-team' });
    });

    it('opens on Match, not the splash screen, when the game is loaded there', () => {
      expect(routeFromHash(START_HASH, opening)).toEqual({ screen: 'tab', tab: 'match' });
    });
  });
});

describe('routeFromHash, for the combine (#72)', () => {
  describe('when a draft is in progress', () => {
    it('opens the combine for its own hash, with or without a team', () => {
      expect(routeFromHash(COMBINE_HASH, { ...noTeam, hasDraft: true })).toEqual({
        screen: 'combine',
      });
      expect(routeFromHash(COMBINE_HASH, { ...later, hasDraft: true })).toEqual({
        screen: 'combine',
      });
    });

    it('takes a first-time player back to the combine when the game opens, wherever the hash points', () => {
      for (const hash of ['', START_HASH, '#/match']) {
        expect(routeFromHash(hash, { ...noTeam, hasDraft: true, opening: true })).toEqual({
          screen: 'combine',
        });
      }
    });

    it('lets a first-time player leave for the splash screen once the game is open', () => {
      expect(routeFromHash(START_HASH, { ...noTeam, hasDraft: true })).toEqual({ screen: 'start' });
    });

    it('still opens on Match for a player with a team', () => {
      expect(routeFromHash('', { ...opening, hasDraft: true })).toEqual({
        screen: 'tab',
        tab: 'match',
      });
    });
  });

  it('opens the create screen for the combine hash when no draft is in progress', () => {
    expect(routeFromHash(COMBINE_HASH, noTeam)).toEqual({ screen: 'new-team' });
    expect(routeFromHash(COMBINE_HASH, later)).toEqual({ screen: 'new-team' });
  });
});

describe('hashForRoute', () => {
  it.each<[Route, string]>([
    [{ screen: 'start' }, '#/start'],
    [{ screen: 'new-team' }, '#/new-team'],
    [{ screen: 'combine' }, '#/combine'],
    [{ screen: 'tab', tab: 'pharm' }, '#/pharm'],
    [{ screen: 'tab', tab: 'pharm', spoofId: 'x12' }, '#/pharm/x12'],
  ])('names %j as %s', (route, hash) => {
    expect(hashForRoute(route)).toBe(hash);
    expect(routeFromHash(hash, { ...later, hasDraft: true })).toEqual(route);
  });
});

describe('routeFromHash, for a spoof’s card (#109)', () => {
  it('opens the card on the Pharm tab', () => {
    expect(routeFromHash('#/pharm/c3', later)).toEqual({
      screen: 'tab',
      tab: 'pharm',
      spoofId: 'c3',
    });
    expect(routeFromHash('#/pharm/c3', opening)).toEqual({
      screen: 'tab',
      tab: 'pharm',
      spoofId: 'c3',
    });
  });

  it('opens the splash screen with no team in play', () => {
    expect(routeFromHash('#/pharm/c3', noTeam)).toEqual({ screen: 'start' });
  });

  it('opens Match for a card address that names no spoof', () => {
    expect(routeFromHash('#/pharm/', later)).toEqual({ screen: 'tab', tab: 'match' });
    expect(routeFromHash('#/pharm/c3/x', later)).toEqual({ screen: 'tab', tab: 'match' });
  });
});
