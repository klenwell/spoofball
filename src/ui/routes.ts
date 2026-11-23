import { hashFor, tabFromHash, type TabId } from './tabs';

/**
 * Which screen a URL hash opens (#71). Besides the tabs, there's the splash
 * screen (`#/start`) and the create screen (`#/new-team`), which have no tab
 * bar. Like `tabs.ts`, this is pure, so the rules are tested without a browser.
 *
 * The rules:
 * - With no team in play, every hash opens the splash screen, except the
 *   create screen's own.
 * - With a team in play, the splash and create screens stay reachable, so you
 *   can switch teams. Opening the game (a load or reload) on the splash screen
 *   goes straight to Match instead: your saved team is ready.
 */

export type Route =
  | { readonly screen: 'tab'; readonly tab: TabId }
  | { readonly screen: 'start' }
  | { readonly screen: 'new-team' };

export const START_HASH = '#/start';
export const NEW_TEAM_HASH = '#/new-team';

export interface RouteContext {
  /** True when a team is in play: a saved one, or one picked on the splash screen. */
  readonly hasTeam: boolean;
  /** True for the route worked out when the game opens. */
  readonly opening: boolean;
}

export function routeFromHash(hash: string, { hasTeam, opening }: RouteContext): Route {
  if (hash === NEW_TEAM_HASH) return { screen: 'new-team' };
  if (!hasTeam) return { screen: 'start' };
  if (hash === START_HASH && !opening) return { screen: 'start' };
  return { screen: 'tab', tab: tabFromHash(hash) };
}

/** The hash that names a route exactly. */
export function hashForRoute(route: Route): string {
  if (route.screen === 'start') return START_HASH;
  if (route.screen === 'new-team') return NEW_TEAM_HASH;
  return hashFor(route.tab);
}
