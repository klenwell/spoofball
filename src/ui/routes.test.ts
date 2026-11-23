import { describe, expect, it } from 'vitest';
import { NEW_TEAM_HASH, START_HASH, hashForRoute, routeFromHash, type Route } from './routes';

const later = { hasTeam: true, opening: false };
const opening = { hasTeam: true, opening: true };
const noTeam = { hasTeam: false, opening: false };

describe('routeFromHash', () => {
  describe('with no team in play', () => {
    it.each(['', '#/match', '#/stats', START_HASH, '#/nope'])(
      'opens the splash screen for %j',
      (hash) => {
        expect(routeFromHash(hash, noTeam)).toEqual({ screen: 'start' });
        expect(routeFromHash(hash, { hasTeam: false, opening: true })).toEqual({ screen: 'start' });
      },
    );

    it('opens the create screen for its own hash', () => {
      expect(routeFromHash(NEW_TEAM_HASH, noTeam)).toEqual({ screen: 'new-team' });
    });
  });

  describe('with a team in play', () => {
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

describe('hashForRoute', () => {
  it.each<[Route, string]>([
    [{ screen: 'start' }, '#/start'],
    [{ screen: 'new-team' }, '#/new-team'],
    [{ screen: 'tab', tab: 'pharm' }, '#/pharm'],
  ])('names %j as %s', (route, hash) => {
    expect(hashForRoute(route)).toBe(hash);
    expect(routeFromHash(hash, later)).toEqual(route);
  });
});
